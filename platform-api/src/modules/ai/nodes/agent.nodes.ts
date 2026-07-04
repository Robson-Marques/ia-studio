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
        label: 'Agente de IA',
        description: 'Executa um agente de IA (loop de raciocínio + ferramentas) com o input do fluxo.',
        category: 'IA',
        kind: 'action',
        outputs: ['success', 'error'],
        fields: [
          { key: 'agent_id', label: 'Agente', type: 'select', required: true, help: 'Agente de IA ativo desta organização.' },
          { key: 'input', label: 'Input', type: 'template', help: 'Texto/pergunta enviada ao agente (aceita {{variáveis}}).' },
        ],
      },
      executor: async (ctx) => {
        const agentId = String(ctx.config['agent_id'] ?? '').trim();
        const input = String(ctx.config['input'] ?? '').trim();
        if (!agentId) return { handle: 'error', output: { error: 'Selecione um agente.' } };

        if (ctx.dryRun) {
          await ctx.log('info', `[simulado] executaria o agente ${agentId}.`);
          return { handle: 'success', output: { simulated: true, agent_id: agentId } };
        }
        try {
          const result = await this.runner.run({
            agentId,
            input,
            executionId: ctx.executionId,
            traceId: ctx.traceId,
          });
          const handle = result.status === 'ERROR' ? 'error' : 'success';
          await ctx.log(handle === 'error' ? 'warn' : 'info', `Agente ${agentId} → ${result.status} (${result.totalTokens} tokens).`);
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
