// No AGENT — integra a IA (Fase 5) com a Automacao (Fase 4). Registra-se no
// NodeRegistryService (exportado pelo AutomationModule) a partir do AiModule,
// que injeta o AgentRunnerService. AutomationModule NAO importa AiModule
// (evita ciclo). Em dryRun, loga e mocka.
import { Injectable, OnModuleInit } from '@nestjs/common';
import { NodeRegistryService } from '../../automation/engine/node-registry.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { AgentsService } from '../agents/agents.service';
import { WhatsappInboxService } from '../../comm/whatsapp/whatsapp-inbox.service';
import { ChatAssignmentService } from '../../comm/attendance/chat-assignment.service';

@Injectable()
export class AgentNodes implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistryService,
    private readonly runner: AgentRunnerService,
    private readonly agents: AgentsService,
    private readonly inbox: WhatsappInboxService,
    private readonly assignment: ChatAssignmentService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      definition: {
        type: 'AGENT',
        label: 'Assistente de IA',
        description: 'Usa um assistente de IA para responder ou executar uma tarefa com base nos dados do fluxo.',
        category: 'IA',
        kind: 'action',
        outputs: ['success', 'error'],
        fields: [
          { key: 'agent_id', label: 'Assistente', type: 'agent', required: true, help: 'Assistente de IA ativo desta organização.' },
          { key: 'input', label: 'Pergunta / instrução', type: 'template', help: 'Texto enviado ao assistente (aceita {{variáveis}}).' },
          {
            key: 'scope_contact',
            label: 'Identificação do contato',
            type: 'template',
            placeholder: '{{input.phone}}',
            help: 'Identifica com quem o assistente está falando (telefone, e-mail ou id). É o que permite ele lembrar desse contato.',
          },
          {
            key: 'scope_session',
            label: 'Identificação da conversa',
            type: 'template',
            placeholder: '{{input.chat_id}}',
            help: 'Identifica a conversa atual. Sem isso, o assistente esquece o que já foi dito nesta conversa.',
          },
        ],
      },
      executor: async (ctx) => {
        const agentId = String(ctx.config['agent_id'] ?? '').trim();
        const input = String(ctx.config['input'] ?? '').trim();
        if (!agentId) return { handle: 'error', output: { error: 'Selecione um agente.' } };

        // Escopos do run: sem eles o agente nao sabe COM QUEM fala nem lembra da
        // conversa. Chaves vazias sao omitidas (nao vira escopo "").
        const scopeKeys: Record<string, string> = {};
        const contact = String(ctx.config['scope_contact'] ?? '').trim();
        const session = String(ctx.config['scope_session'] ?? '').trim();
        if (contact) scopeKeys['contact'] = contact;
        if (session) scopeKeys['session'] = session;

        if (ctx.dryRun) {
          await ctx.log('info', `[simulado] executaria o agente ${agentId}.`);
          return { handle: 'success', output: { simulated: true, agent_id: agentId, scope_keys: scopeKeys } };
        }

        // Continuidade: se a sessão é uma conversa de WhatsApp (chat_id), carrega
        // os turnos anteriores e passa como histórico — senão cada mensagem vira
        // um run sem memória e o assistente "esquece" o que já foi dito.
        const history = await this.loadChatHistory(ctx.organizationId, session);

        try {
          const result = await this.runner.run({
            agentId,
            input,
            executionId: ctx.executionId,
            traceId: ctx.traceId,
            scopeKeys,
            history,
          });
          // Só é SUCESSO se concluiu COM texto. Status ERRO, AWAITING_APPROVAL
          // (pausou numa tool que exige aprovação — ninguém retoma dentro do
          // fluxo) ou saída vazia → 'error', pra NÃO mandar mensagem em branco
          // (o nó de envio seguinte usaria {{vars.assistente.output}} vazio).
          const text = typeof result.output === 'string' ? result.output.trim() : result.output;
          const ok = result.status === 'COMPLETED' && !!text;
          const handle = ok ? 'success' : 'error';
          await ctx.log(
            ok ? 'info' : 'warn',
            `Agente ${agentId} → ${result.status}${ok ? '' : ' (sem resposta utilizável)'} (${result.totalTokens} tokens).`,
          );
          // A IA "assume" a conversa (BOT) quando respondeu de verdade numa
          // conversa de WhatsApp → aparece "atendido pela IA". Não rouba de
          // humano (o assignBot checa). Best-effort.
          if (ok && session) {
            await this.assignment.assignBot(ctx.organizationId, session, agentId).catch(() => undefined);
          }
          return {
            handle,
            output: {
              run_id: result.runId,
              status: result.status,
              output: result.output,
              total_tokens: result.totalTokens,
              cost_usd: result.costUsd,
              approval_id: result.approvalId,
            },
          };
        } catch (e) {
          await ctx.log('error', `Agente ${agentId} falhou: ${(e as Error).message}`);
          return { handle: 'error', output: { error: (e as Error).message } };
        }
      },
      validator: (config) => (config['agent_id'] ? [] : ['selecione um agente.']),
    });
  }

  /** Catalogo auxiliar: agentes ativos pro select do no (usado pelo front). */
  activeAgents(organizationId: string, workspaceId?: string, environmentId?: string) {
    return this.agents.findActive(organizationId, { workspaceId, environmentId });
  }

  /** Carrega os turnos anteriores de uma conversa de WhatsApp (quando a sessão é
   *  um chat_id) pra dar continuidade ao assistente. Remove a última mensagem
   *  (a atual, que já vai no input). Best-effort: falha vira "sem histórico". */
  private async loadChatHistory(
    organizationId: string,
    session: string,
  ): Promise<{ role: 'user' | 'assistant'; content: string }[] | undefined> {
    if (!session) return undefined;
    const rows = await this.inbox.listMessages(organizationId, session, 16).catch(() => []);
    if (!rows.length) return undefined;
    // listMessages já vem em ordem cronológica (antiga→nova). Tira a última
    // (a mensagem atual, que já vai no input).
    const chrono = rows.slice(0, -1);
    const history = chrono
      .filter((m) => (m.content ?? '').trim())
      .map((m) => ({
        role: (m.direction === 'INCOMING' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content as string,
      }));
    return history.length ? history : undefined;
  }
}
