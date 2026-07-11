// No AGENT — integra a IA (Fase 5) com a Automacao (Fase 4). Registra-se no
// NodeRegistryService (exportado pelo AutomationModule) a partir do AiModule,
// que injeta o AgentRunnerService. AutomationModule NAO importa AiModule
// (evita ciclo). Em dryRun, loga e mocka.
import { Injectable, OnModuleInit } from '@nestjs/common';
import { NodeRegistryService } from '../../automation/engine/node-registry.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { AgentsService } from '../agents/agents.service';

@Injectable()
export class AgentNodes implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistryService,
    private readonly runner: AgentRunnerService,
    private readonly agents: AgentsService,
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
        try {
          const result = await this.runner.run({
            agentId,
            input,
            executionId: ctx.executionId,
            traceId: ctx.traceId,
            scopeKeys,
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
}
