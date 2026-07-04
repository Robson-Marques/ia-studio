// Tool Runtime: executa uma tool do catalogo — resolve (builtin vs
// connection_operation) → checa gate de aprovacao (ApprovalPolicyService) →
// executa → registra AiToolCallLog. Se exigir aprovacao, cria AiActionApproval
// e sinaliza pendencia (o AgentRunner pausa o run).
import { Injectable, Logger } from '@nestjs/common';
import { AiTool } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ToolsRepository } from './tools.repository';
import { ToolRegistryService, ToolExecutionContext } from './tool-registry.service';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { ApprovalPolicyService } from '../approvals/approval-policy.service';
import { ApprovalsService } from '../approvals/approvals.service';

export interface ToolExecutionResult {
  status: 'ok' | 'error' | 'awaiting_approval';
  output?: unknown;
  error?: string;
  /** Presente quando status=awaiting_approval. */
  approvalId?: string;
  durationMs: number;
}

@Injectable()
export class ToolRuntimeService {
  private readonly logger = new Logger(ToolRuntimeService.name);

  constructor(
    private readonly repository: ToolsRepository,
    private readonly registry: ToolRegistryService,
    private readonly connections: ConnectionsService,
    private readonly approvalPolicy: ApprovalPolicyService,
    private readonly approvals: ApprovalsService,
  ) {}

  /**
   * Executa uma tool pelo key. Se a tool exigir aprovacao (flag ou policy),
   * cria a solicitacao e retorna awaiting_approval SEM executar.
   */
  async executeTool(
    toolKey: string,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const started = Date.now();
    const tool = await this.repository.findByKey(ctx.organizationId, toolKey);
    if (!tool || !tool.is_active) {
      return this.fail(`Ferramenta "${toolKey}" não encontrada ou inativa.`, started, ctx, toolKey, args);
    }

    // Gate de aprovacao: flag da tool OU policy ativa que case (diretriz 31).
    const requiresByFlag = tool.requires_approval;
    const policyEval = await this.approvalPolicy.evaluate({
      organizationId: ctx.organizationId,
      targetType: this.targetTypeFor(tool),
      context: {
        tool_key: toolKey,
        recipients: typeof args['recipients'] === 'number' ? (args['recipients'] as number) : undefined,
        cost_usd: typeof args['cost_usd'] === 'number' ? (args['cost_usd'] as number) : undefined,
      },
    });

    if (!ctx.dryRun && (requiresByFlag || policyEval.required)) {
      const approval = await this.approvals.createApproval({
        organizationId: ctx.organizationId,
        policyId: policyEval.policy?.id,
        agentRunId: ctx.agentRunId,
        requestedBy: null,
        target: toolKey,
        context: { arguments: args },
        expiresAfterSeconds: policyEval.policy?.expires_after_seconds ?? undefined,
      });
      this.logger.log(`Tool "${toolKey}" aguardando aprovação (${approval.id}).`);
      return { status: 'awaiting_approval', approvalId: approval.id, durationMs: Date.now() - started };
    }

    try {
      const output = await this.runResolved(tool, args, ctx);
      await this.logCall(ctx, toolKey, args, output, null, Date.now() - started);
      return { status: 'ok', output, durationMs: Date.now() - started };
    } catch (e) {
      const message = (e as Error).message;
      await this.logCall(ctx, toolKey, args, null, message, Date.now() - started);
      return { status: 'error', error: message, durationMs: Date.now() - started };
    }
  }

  /** Executa apos aprovacao concedida (retomada pelo runner). */
  async runApproved(
    toolKey: string,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const started = Date.now();
    const tool = await this.repository.findByKey(ctx.organizationId, toolKey);
    if (!tool || !tool.is_active) {
      return this.fail(`Ferramenta "${toolKey}" não encontrada.`, started, ctx, toolKey, args);
    }
    try {
      const output = await this.runResolved(tool, args, ctx);
      await this.logCall(ctx, toolKey, args, output, null, Date.now() - started);
      return { status: 'ok', output, durationMs: Date.now() - started };
    } catch (e) {
      const message = (e as Error).message;
      await this.logCall(ctx, toolKey, args, null, message, Date.now() - started);
      return { status: 'error', error: message, durationMs: Date.now() - started };
    }
  }

  private async runResolved(
    tool: AiTool,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<unknown> {
    // 1) builtin handler
    if (tool.builtin && tool.builtin_handler && this.registry.has(tool.builtin_handler)) {
      const def = this.registry.get(tool.builtin_handler);
      return def!.handler(args, ctx);
    }
    // 2) connection_operation ({ operation, connection_id? })
    const op = (tool.connection_operation ?? null) as { operation?: string } | null;
    if (op?.operation) {
      const connectionId = typeof args['connection_id'] === 'string' ? args['connection_id'] : undefined;
      if (!connectionId) throw new Error('connection_id obrigatório para esta ferramenta.');
      if (ctx.dryRun) return { simulated: true, operation: op.operation };
      return this.connections.execute(ctx.organizationId, connectionId, op.operation, args);
    }
    throw new Error(`Ferramenta "${tool.key}" sem handler builtin nem operação de conexão.`);
  }

  private targetTypeFor(tool: AiTool): string {
    if (tool.key === 'executar_sql') return 'SQL_WRITE';
    if (tool.key === 'enviar_whatsapp') return 'MASS_SEND';
    return 'TOOL';
  }

  private async logCall(
    ctx: ToolExecutionContext,
    toolKey: string,
    args: Record<string, unknown>,
    result: unknown,
    error: string | null,
    durationMs: number,
  ): Promise<void> {
    await this.repository
      .createCallLog({
        organization_id: ctx.organizationId,
        agent_run_id: ctx.agentRunId,
        tool_key: toolKey,
        arguments: args as Prisma.InputJsonValue,
        result: result === undefined || result === null ? undefined : (result as Prisma.InputJsonValue),
        error: error ?? undefined,
        duration_ms: durationMs,
      })
      .catch((e) => this.logger.warn(`Falha ao logar chamada de tool: ${(e as Error).message}`));
  }

  private async fail(
    message: string,
    started: number,
    ctx: ToolExecutionContext,
    toolKey: string,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    await this.logCall(ctx, toolKey, args, null, message, Date.now() - started);
    return { status: 'error', error: message, durationMs: Date.now() - started };
  }
}
