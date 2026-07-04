// Workflow Engine (diretriz 49) — executor GENERICO e agnostico de dominio:
// carrega a versao imutavel, percorre o DAG (edges com condicao), interpola
// {{variaveis}}, executa cada no via NodeRegistry, grava ExecutionLog por no
// e finaliza. Modo dry_run (diretriz 27): executores side-effect logam
// "simulado" e retornam mock. DELAY longo pausa a execucao e re-agenda a
// continuacao via broker (estado viaja no job — nada em memoria, diretriz 33).
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, WorkflowExecution } from '@prisma/client';
import { ExecutionsRepository } from './executions.repository';
import { NodeRegistryService, NodeExecutionContext } from './node-registry.service';
import {
  buildVariableContext,
  evaluateEdgeCondition,
  interpolate,
  VariableContext,
} from './variable-resolver';
import { parseGraph, WorkflowEdge, WorkflowGraph, WorkflowNode } from './workflow-graph';
import { WorkflowsRepository } from '../workflows/workflows.repository';
import { IMessageBroker, MESSAGE_BROKER, QUEUES } from '../../../shared/broker/message-broker.interface';

const MAX_STEPS = 500;
/** Delay acima disso nao dorme no processo — re-agenda via broker. */
const INLINE_DELAY_MAX_MS = 30_000;

export interface ResumeState {
  node_id: string;
  vars: Record<string, unknown>;
  steps: number;
}

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);

  constructor(
    private readonly executions: ExecutionsRepository,
    private readonly workflows: WorkflowsRepository,
    private readonly registry: NodeRegistryService,
    @Inject(MESSAGE_BROKER) private readonly broker: IMessageBroker,
  ) {}

  /** Roda (ou retoma) uma execucao ja criada — chamado pelo processor. */
  async run(executionId: string, resume?: ResumeState): Promise<void> {
    const exec = await this.executions.findById(executionId);
    if (!exec) {
      this.logger.warn(`Execução ${executionId} não encontrada — job ignorado.`);
      return;
    }
    if (exec.status === 'CANCELLED' || exec.status === 'COMPLETED' || exec.status === 'FAILED') return;

    const workflow = await this.workflows.findById(exec.workflow_id);
    const version = await this.workflows.findVersion(exec.workflow_id, exec.version);
    if (!workflow || !version) {
      await this.finish(exec, 'FAILED', undefined, 'Workflow/versão não encontrados.');
      return;
    }

    const graph = parseGraph(version.graph);
    const startedAt = exec.started_at ?? new Date();
    await this.executions.update(exec.id, { status: 'RUNNING', started_at: startedAt });

    const log = (nodeId: string | null) =>
      async (level: 'info' | 'warn' | 'error', message: string, data?: unknown, durationMs?: number) => {
        await this.executions
          .createLog({
            execution_id: exec.id,
            node_id: nodeId,
            level,
            message,
            data: data === undefined ? undefined : (data as Prisma.InputJsonValue),
            duration_ms: durationMs,
          })
          .catch(() => undefined);
      };

    const vars: Record<string, unknown> = resume?.vars ?? {};
    let steps = resume?.steps ?? 0;
    let current: WorkflowNode | undefined;

    if (resume) {
      current = graph.nodes.find((n) => n.id === resume.node_id);
      await log(null)('info', `execução retomada no nó "${resume.node_id}"`);
      if (!current) {
        await this.finish(exec, 'FAILED', undefined, `Nó de retomada "${resume.node_id}" não existe mais.`);
        return;
      }
    } else {
      await log(null)('info', `execução iniciada (trace_id=${exec.trace_id}${exec.dry_run ? ', DRY-RUN' : ''})`);
      current = this.findStartNode(graph);
      if (!current) {
        await this.finish(exec, 'FAILED', undefined, 'Fluxo sem nó inicial (adicione um gatilho).');
        return;
      }
    }

    try {
      while (current) {
        if (++steps > MAX_STEPS) throw new Error('Limite de passos excedido (possível loop no grafo).');

        // Cancelamento cooperativo entre nos.
        const fresh = await this.executions.findById(exec.id);
        if (fresh?.status === 'CANCELLED') {
          await log(null)('warn', 'execução cancelada pelo usuário.');
          return;
        }

        const nodeLog = log(current.id);
        const varCtx = buildVariableContext({
          workflowId: workflow.id,
          workflowName: workflow.name,
          version: exec.version,
          input: exec.input,
          vars,
          organizationId: exec.organization_id,
          workspaceId: exec.workspace_id,
          environmentId: exec.environment_id,
        });

        const nodeType = this.registry.get(current.type);
        let handle = 'success';
        if (!nodeType) {
          await nodeLog('warn', `tipo de nó desconhecido "${current.type}" — seguindo pela saída padrão.`);
        } else {
          const config = interpolate(current.config ?? {}, varCtx) as Record<string, unknown>;
          const ctx: NodeExecutionContext = {
            organizationId: exec.organization_id,
            workspaceId: exec.workspace_id,
            environmentId: exec.environment_id,
            config,
            input: exec.input,
            vars,
            dryRun: exec.dry_run,
            traceId: exec.trace_id,
            executionId: exec.id,
            log: (level, message, data) => nodeLog(level, message, data),
          };
          const t0 = Date.now();
          try {
            const result = await nodeType.executor(ctx);
            const duration = Date.now() - t0;
            if (result.output !== undefined) vars[current.id] = result.output;
            handle = result.handle ?? 'success';
            await nodeLog('info', `nó "${current.name || current.id}" (${current.type}) → ${handle}`, undefined, duration);

            // Pausa (DELAY longo): re-agenda a continuacao e sai sem finalizar.
            if (result.pauseMs && result.pauseMs > 0) {
              const next = this.pickNext(graph, current, handle, varCtx);
              if (!next) break; // nada depois do delay → conclui direto
              await this.executions.update(exec.id, { status: 'QUEUED' });
              await nodeLog('info', `execução pausada por ${result.pauseMs}ms — continuação agendada no nó "${next.id}".`);
              await this.broker.enqueue(
                QUEUES.EXECUTIONS,
                'resume',
                { execution_id: exec.id, resume: { node_id: next.id, vars, steps } satisfies ResumeState },
                { delay: result.pauseMs, jobId: `${exec.id}:resume:${steps}` },
              );
              return;
            }
          } catch (e) {
            const duration = Date.now() - t0;
            await nodeLog('error', `nó "${current.name || current.id}" falhou: ${(e as Error).message}`, undefined, duration);
            handle = 'error';
            vars[current.id] = { error: (e as Error).message };
            // Sem edge de erro a partir deste no → execucao FALHA.
            if (!this.pickNext(graph, current, 'error', varCtx)) throw e;
          }
        }

        const varCtxAfter = buildVariableContext({
          workflowId: workflow.id,
          workflowName: workflow.name,
          version: exec.version,
          input: exec.input,
          vars,
          organizationId: exec.organization_id,
          workspaceId: exec.workspace_id,
          environmentId: exec.environment_id,
        });
        current = this.pickNext(graph, current, handle, varCtxAfter);
      }

      await this.finish(exec, 'COMPLETED', vars, undefined, startedAt);
      await log(null)('info', 'execução concluída.');
    } catch (e) {
      const msg = (e as Error).message ?? 'erro desconhecido';
      await this.finish(exec, 'FAILED', vars, msg, startedAt);
      await log(null)('error', `execução falhou: ${msg}`);
    }
  }

  // ─── Privados ───────────────────────────────────────

  private findStartNode(graph: WorkflowGraph): WorkflowNode | undefined {
    const trigger = graph.nodes.find((n) => n.type.startsWith('TRIGGER_'));
    if (trigger) return trigger;
    return graph.nodes.find((n) => !graph.edges.some((e) => e.to === n.id));
  }

  /** Proxima aresta cuja condicao casa com o handle/expressao. */
  private pickNext(
    graph: WorkflowGraph,
    node: WorkflowNode,
    handle: string,
    ctx: VariableContext,
  ): WorkflowNode | undefined {
    const outgoing: WorkflowEdge[] = graph.edges.filter((e) => e.from === node.id);
    const edge = outgoing.find((e) => evaluateEdgeCondition(e.when, handle, ctx));
    if (!edge) return undefined;
    return graph.nodes.find((n) => n.id === edge.to);
  }

  private async finish(
    exec: WorkflowExecution,
    status: 'COMPLETED' | 'FAILED',
    output?: Record<string, unknown>,
    error?: string,
    startedAt?: Date,
  ): Promise<void> {
    const finishedAt = new Date();
    const start = startedAt ?? exec.started_at ?? exec.created_at;
    await this.executions.update(exec.id, {
      status,
      output: output === undefined ? undefined : (output as Prisma.InputJsonValue),
      error: error ?? null,
      finished_at: finishedAt,
      duration_ms: Math.max(0, finishedAt.getTime() - new Date(start).getTime()),
    });
  }
}
