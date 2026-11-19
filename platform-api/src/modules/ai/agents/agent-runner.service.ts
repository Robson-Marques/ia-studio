// AgentRunnerService — LOOP de tool-calling (porta do Aquapark, adaptado ao
// instalação dedicada e as Connections AI). Fluxo:
//   1) carrega agente (versao publicada) + resolve provider (connection fixa OU
//      orchestrator);
//   2) compila system prompt (base + persona + RAG + memoria);
//   3) resolve tools (allowed_tools do catalogo → LlmTool);
//   4) cria AiAgentRun (RUNNING) e itera ate max_steps:
//        chat → acumula tokens/custo → se toolCalls: executa via ToolRuntime
//        (gate de aprovacao pode pausar o run) → anexa resultado → continua;
//        senao resposta final → fim;
//   5) persiste transcript e logs locais de execução
//      ai_tokens; emite evento ai.agent.run.completed.
//   6) resume(runId): retoma o loop apos aprovacao.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiAgent, AiProviderKind, AiRunStatus, Prisma } from '@prisma/client';
import { AgentsRepository } from './agents.repository';
import { compilePersona } from './agent-persona';
import { compileRoteiro, hasRoteiro } from './agent-roteiro';
import { PromptSecurityService } from './prompt-security.service';
import { LlmProviderService, ResolvedLlmConnection } from '../providers/llm-provider.service';
import { AiOrchestratorService } from '../orchestrator/ai-orchestrator.service';
import { ToolsService } from '../tools/tools.service';
import { ToolRuntimeService } from '../tools/tool-runtime.service';
import { ToolExecutionContext } from '../tools/tool-registry.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { CollaborationService } from '../collaboration/collaboration.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { LlmMessage, LlmTool } from '../providers/llm.interface';

export interface RunAgentParams {
  agentId: string;
  input: string;
  executionId?: string | null;
  traceId?: string;
  scopeKeys?: Record<string, string>;
  dryRun?: boolean;
  createdBy?: string | null;
  /** Histórico da conversa (turnos anteriores) — dá CONTINUIDADE ao assistente:
   *  sem isto cada mensagem recebida vira um run stateless e ele "esquece" o
   *  que já foi dito. O nó AGENT carrega do chat quando há sessão. */
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** Ambiente ConnectChat: restringe ferramentas sem depender do prompt. */
  previewAllowedTools?: string[];
  /** Regras de testes adicionadas pelo servidor, nunca pelo cliente. */
  previewInstructions?: string;
  /** Somente em memória: CPF/CNPJ obtido de vínculo IXC validado pelo servidor. */
  previewCustomerDocument?: string;
}

export interface RunAgentOutput {
  runId: string;
  status: AiRunStatus;
  output: string;
  totalTokens: number;
  costUsd: number;
  approvalId?: string;
}

interface Guardrails {
  max_cost_usd_per_run?: number;
  blocked_words?: string[];
  pii_redact?: boolean;
}

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly repository: AgentsRepository,
    private readonly llm: LlmProviderService,
    private readonly orchestrator: AiOrchestratorService,
    private readonly tools: ToolsService,
    private readonly toolRuntime: ToolRuntimeService,
    private readonly knowledge: KnowledgeService,
    private readonly collaboration: CollaborationService,
    private readonly eventBus: EventBusService,
    private readonly promptSecurity: PromptSecurityService,
  ) {}

  async run(params: RunAgentParams): Promise<RunAgentOutput> {
    const agent = await this.repository.findById(params.agentId);
    if (!agent) throw new NotFoundException('Agente não encontrado.');
    if (!agent.is_active) throw new BadRequestException('Agente inativo.');

    const traceId = params.traceId ?? randomUUID();
    const dryRun = params.dryRun ?? false;

    const resolved = await this.resolveProvider(agent);
    const guardrails = this.parseGuardrails(agent.guardrails);

    // Seguranca: inspeciona o input do usuario (loga alerta; nao bloqueia).
    this.promptSecurity.inspect(params.input);

    const systemPrompt = (await this.buildSystemPrompt(agent, params.input, traceId))
      + (params.previewInstructions ? '\n\n' + params.previewInstructions : '');
    const llmTools = await this.buildTools(agent, params.previewAllowedTools);

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(params.history ?? []).map((m) => ({ role: m.role, content: m.content } as LlmMessage)),
      { role: 'user', content: params.input },
    ];

    const run = await this.repository.createRun({
      agent_id: agent.id,
      execution_id: params.executionId ?? null,
      trace_id: traceId,
      status: AiRunStatus.RUNNING,
      input: { text: params.input } as Prisma.InputJsonValue,
      scope_keys: (params.scopeKeys ?? {}) as Prisma.InputJsonValue,
      model: agent.model,
      provider_kind: resolved.kind,
      created_by: params.createdBy ?? null,
      started_at: new Date(),
    } as Prisma.AiAgentRunUncheckedCreateInput);

    return this.loop(agent, run.id, resolved, messages, llmTools, guardrails, {
      traceId,
      dryRun,
      scopeKeys: params.scopeKeys,
      executionId: params.executionId ?? null,
      previewMode: !!params.previewAllowedTools,
      previewCustomerDocument: params.previewCustomerDocument,
    });
  }

  /** Retoma um run pausado por aprovacao (apos decisao concedida). */
  async resume(runId: string): Promise<RunAgentOutput> {
    const run = await this.repository.findRunById(runId);
    if (!run) throw new NotFoundException('Execução não encontrada.');
    if (run.status !== AiRunStatus.AWAITING_APPROVAL) {
      throw new BadRequestException('Execução não está aguardando aprovação.');
    }
    const agent = await this.repository.findById(run.agent_id);
    if (!agent) throw new NotFoundException('Agente não encontrado.');

    const resolved = await this.resolveProvider(agent);
    const guardrails = this.parseGuardrails(agent.guardrails);
    const messages = this.parseMessages(run.messages);
    const llmTools = await this.buildTools(agent);

    await this.repository.updateRun(runId, { status: AiRunStatus.RUNNING });
    return this.loop(agent, runId, resolved, messages, llmTools, guardrails, {
      traceId: run.trace_id,
      dryRun: false,
      // Recupera os escopos do run: a retomada e o caminho das acoes aprovadas
      // (as destrutivas). Rodar sem contato/sessao aqui seria o pior lugar.
      scopeKeys: this.parseScopeKeys(run.scope_keys),
      executionId: run.execution_id,
    });
  }

  /** Le `AiAgentRun.scope_keys` (Json) como Record<string,string>, sem `any`. */
  private parseScopeKeys(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) out[key] = value;
    }
    return out;
  }

  // ─── Loop principal ─────────────────────────────────

  private async loop(
    agent: AiAgent,
    runId: string,
    resolved: ResolvedLlmConnection,
    messages: LlmMessage[],
    llmTools: LlmTool[],
    guardrails: Guardrails,
    ctx: { traceId: string; dryRun: boolean; scopeKeys?: Record<string, string>; executionId: string | null; previewMode?: boolean; previewCustomerDocument?: string },
  ): Promise<RunAgentOutput> {
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    let finalOutput = '';
    let providerKind: AiProviderKind = resolved.kind;

    try {
      for (let step = 0; step < agent.max_steps; step += 1) {
        const result = await this.llm.chat(resolved, {
          model: agent.model,
          messages,
          tools: llmTools.length > 0 ? llmTools : undefined,
          temperature: agent.temperature,
          maxTokens: agent.max_tokens ?? undefined,
        });
        promptTokens += result.usage.promptTokens;
        completionTokens += result.usage.completionTokens;
        costUsd += result.costUsd;
        providerKind = result.providerKind;

        // Guardrail de custo por run.
        if (guardrails.max_cost_usd_per_run && costUsd > guardrails.max_cost_usd_per_run) {
          return this.finishRun(agent, runId, {
            status: AiRunStatus.ERROR,
            output: '',
            error: `Custo por execução excedeu o limite (${guardrails.max_cost_usd_per_run} USD).`,
            messages,
            promptTokens,
            completionTokens,
            costUsd,
            providerKind,
            traceId: ctx.traceId,
          });
        }

        if (result.toolCalls.length === 0) {
          finalOutput = this.applyOutputGuardrails(result.content, guardrails);
          messages.push({ role: 'assistant', content: finalOutput });
          return this.finishRun(agent, runId, {
            status: AiRunStatus.COMPLETED,
            output: finalOutput,
            messages,
            promptTokens,
            completionTokens,
            costUsd,
            providerKind,
            traceId: ctx.traceId,
          });
        }

        // Registra o passo do assistente com as tool_calls.
        messages.push({ role: 'assistant', content: result.content, tool_calls: result.toolCalls });

        // Executa cada tool call.
        for (const call of result.toolCalls) {
          const toolCtx = this.buildToolContext(agent, runId, ctx, llmTools.map((tool) => tool.name));
          const exec = await this.toolRuntime.executeTool(call.name, call.arguments, toolCtx);

          if (exec.status === 'awaiting_approval') {
            // Pausa: persiste estado e sinaliza aprovacao pendente.
            await this.repository.updateRun(runId, {
              status: AiRunStatus.AWAITING_APPROVAL,
              messages: messages as unknown as Prisma.InputJsonValue,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
              cost_usd: costUsd,
            });
            return {
              runId,
              status: AiRunStatus.AWAITING_APPROVAL,
              output: '',
              totalTokens: promptTokens + completionTokens,
              costUsd,
              approvalId: exec.approvalId,
            };
          }

          const payload = exec.status === 'ok' ? exec.output : { error: exec.error };
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify(payload ?? null),
          });
        }
      }

      // Estourou max_steps sem resposta final → ERRO (não COMPLETED). Antes
      // devolvia esse texto-placebo como se fosse a resposta, e um fluxo o
      // enviava ao cliente. Como ERRO, o nó Assistente segue pela saída de erro.
      finalOutput = 'Limite de passos atingido sem conclusão.';
      return this.finishRun(agent, runId, {
        status: AiRunStatus.ERROR,
        output: finalOutput,
        messages,
        promptTokens,
        completionTokens,
        costUsd,
        providerKind,
        traceId: ctx.traceId,
      });
    } catch (e) {
      return this.finishRun(agent, runId, {
        status: AiRunStatus.ERROR,
        output: '',
        error: (e as Error).message,
        messages,
        promptTokens,
        completionTokens,
        costUsd,
        providerKind,
        traceId: ctx.traceId,
      });
    }
  }

  private async finishRun(
    agent: AiAgent,
    runId: string,
    data: {
      status: AiRunStatus;
      output: string;
      error?: string;
      messages: LlmMessage[];
      promptTokens: number;
      completionTokens: number;
      costUsd: number;
      providerKind: AiProviderKind;
      traceId: string;
    },
  ): Promise<RunAgentOutput> {
    const totalTokens = data.promptTokens + data.completionTokens;
    await this.repository.updateRun(runId, {
      status: data.status,
      output: data.output || null,
      error: data.error ?? null,
      messages: data.messages as unknown as Prisma.InputJsonValue,
      prompt_tokens: data.promptTokens,
      completion_tokens: data.completionTokens,
      total_tokens: totalTokens,
      cost_usd: data.costUsd,
      provider_kind: data.providerKind,
      finished_at: new Date(),
    });

    // Evento no Event Bus (diretriz 7).
    await this.eventBus
      .publish({
        event: 'ai.agent.run.completed',
        trace_id: data.traceId,
        source_event_id: `ai-run:${runId}`,
        occurred_at: new Date().toISOString(),
        payload: { run_id: runId, agent_id: agent.id, status: data.status, total_tokens: totalTokens },
      })
      .catch((e) => this.logger.warn(`Falha ao publicar evento do run ${runId}: ${(e as Error).message}`));

    return { runId, status: data.status, output: data.output, totalTokens, costUsd: data.costUsd };
  }

  // ─── Montagem de prompt/tools/provider ──────────────

  private async resolveProvider(agent: AiAgent): Promise<ResolvedLlmConnection> {
    if (agent.connection_id) {
      return this.llm.resolveConnection(agent.connection_id);
    }
    return this.orchestrator.resolve(agent.model);
  }

  private async buildSystemPrompt(agent: AiAgent, userInput: string, traceId: string): Promise<string> {
    const parts: string[] = [];
    // Instrucoes adicionais (avancado) primeiro, depois o roteiro estruturado.
    if (agent.system_prompt) parts.push(agent.system_prompt);
    const agentAny = agent as AiAgent & { roteiro?: unknown };
    if (hasRoteiro(agentAny.roteiro)) {
      // Roteiro estruturado ja traz o Objetivo — nao duplica com agent.goal.
      parts.push(compileRoteiro(agentAny.roteiro));
    } else if (agent.goal) {
      parts.push(`\n\n## Objetivo\n${agent.goal}`);
    }
    parts.push(compilePersona(agent.persona));

    // Contexto RAG: consulta as bases habilitadas com o input do usuario.
    if (agent.knowledge_base_ids.length > 0) {
      try {
        const rag = await this.knowledge.queryMulti(
          agent.knowledge_base_ids,
          userInput,
          5,
          { traceId, agentId: agent.id },
        );
        if (rag.chunks.length > 0) {
          const context = rag.chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
          parts.push(`\n\n## Base de conhecimento (use quando relevante)\n${context}`);
        }
      } catch (e) {
        this.logger.warn(`RAG no prompt falhou: ${(e as Error).message}`);
      }
    }
    return parts.filter(Boolean).join('');
  }

  private async buildTools(agent: AiAgent, previewAllowed?: string[]): Promise<LlmTool[]> {
    // A lista de teste vem EXCLUSIVAMENTE do servidor, nunca do request.
    // Ela permite experimentar agentes antigos sem obrigar a regravar sua
    // configuração. O runtime também valida cada chamada individualmente.
    const allowed = previewAllowed
      ? [...new Set(previewAllowed)]
      : agent.allowed_tools;
    if (allowed.length === 0) return [];
    const catalog = await this.tools.resolveForAgent(allowed);
    return catalog.map((t) => ({
      name: t.key,
      description: t.description,
      parameters: (t.input_schema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    }));
  }

  private buildToolContext(
    agent: AiAgent,
    runId: string,
    ctx: { traceId: string; dryRun: boolean; scopeKeys?: Record<string, string>; executionId: string | null; previewMode?: boolean; previewCustomerDocument?: string },
    allowedToolKeys: string[],
  ): ToolExecutionContext {
    return {
      agentId: agent.id,
      agentRunId: runId,
      allowedToolKeys,
      previewMode: ctx.previewMode,
      previewCustomerDocument: ctx.previewCustomerDocument,
      traceId: ctx.traceId,
      executionId: ctx.executionId,
      scopeKeys: ctx.scopeKeys,
      knowledgeBaseIds: agent.knowledge_base_ids,
      memoryProfileIds: agent.memory_profile_ids,
      dryRun: ctx.dryRun,
      runAgent: async (a) => {
        const res = await this.collaboration.consult({
          principalAgentId: agent.id,
          query: a.input,
          traceId: a.traceId,
          executionId: a.executionId,
          runAgent: async (inner) => {
            const out = await this.run({
              agentId: inner.agentId,
              input: inner.input,
              traceId: inner.traceId,
              executionId: inner.executionId,
            });
            return { output: out.output };
          },
        });
        const combined = res.consulted.map((c) => `${c.label ?? c.agent_id}: ${c.answer}`).join('\n');
        return { output: combined || 'Nenhum especialista respondeu.' };
      },
    };
  }

  private applyOutputGuardrails(text: string, guardrails: Guardrails): string {
    if (guardrails.blocked_words && guardrails.blocked_words.length > 0) {
      return this.promptSecurity.redactBlockedWords(text, guardrails.blocked_words);
    }
    return text;
  }

  private parseGuardrails(raw: unknown): Guardrails {
    if (!raw || typeof raw !== 'object') return {};
    const g = raw as Record<string, unknown>;
    return {
      max_cost_usd_per_run: typeof g['max_cost_usd_per_run'] === 'number' ? (g['max_cost_usd_per_run'] as number) : undefined,
      blocked_words: Array.isArray(g['blocked_words'])
        ? (g['blocked_words'] as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      pii_redact: typeof g['pii_redact'] === 'boolean' ? (g['pii_redact'] as boolean) : undefined,
    };
  }

  private parseMessages(raw: unknown): LlmMessage[] {
    if (!Array.isArray(raw)) return [];
    return raw as unknown as LlmMessage[];
  }
}
