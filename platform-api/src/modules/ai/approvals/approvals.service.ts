// Ciclo de vida das politicas de aprovacao + das aprovacoes de acao (diretriz 31).
// Politicas: CRUD generico (nascem OFF; so o usuario ativa).
// Aprovacoes: criadas pelo ToolRuntime quando uma acao exige revisao humana e
// decididas (aprovar/rejeitar) por quem tem 'ai.approvals.decide'.
//
// IMPORTANTE: este service NAO retoma o agent run apos a decisao e NAO importa o
// AgentRunner (evita dependencia circular). Quem decide dispara, em separado, o
// runner.resume via front/worker — a decisao aqui apenas persiste o veredito.
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AiActionApproval, AiApprovalStatus, Prisma } from '@prisma/client';
import { ApprovalsRepository, ApprovalFilters } from './approvals.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { CreateApprovalPolicyDto, UpdateApprovalPolicyDto } from './dto/approvals.dtos';
import { ToolRuntimeService } from '../tools/tool-runtime.service';
import { ToolExecutionContext } from '../tools/tool-registry.service';

/** Entrada da criacao de aprovacao (usada pelo ToolRuntime, nao pelo controller). */
export interface CreateApprovalInput {
  policyId?: string | null;
  agentRunId?: string | null;
  requestedBy?: string | null;
  target: string;
  context: Record<string, unknown>;
  expiresAfterSeconds?: number | null;
}

export interface ApprovalDecision {
  approve: boolean;
  decidedBy: string | null;
  rejectReason?: string;
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly repository: ApprovalsRepository,
    private readonly audit: AuditLogService,
    // ModuleRef pra resolver o ToolRuntime SEM ciclo (ToolRuntime injeta este
    // service pra criar a aprovação; resolvê-lo lazy aqui evita a dependência
    // circular no construtor).
    private readonly moduleRef: ModuleRef,
  ) {}

  // ─── Politicas (CRUD generico) ──────────────────────

  listPolicies() {
    return this.repository.findPolicies();
  }

  async getPolicy(id: string) {
    const policy = await this.repository.findPolicyById(id);
    if (!policy) throw new NotFoundException('Política de aprovação não encontrada.');
    return policy;
  }

  async createPolicy(dto: CreateApprovalPolicyDto, createdBy: string | null) {
    // is_active NAO e forcado: nasce OFF por default do schema (diretriz 31).
    const policy = await this.repository.createPolicy({
      name: dto.name,
      description: dto.description,
      target_type: dto.target_type,
      condition: (dto.condition ?? {}) as Prisma.InputJsonValue,
      approver_profile_ids: dto.approver_profile_ids ?? [],
      approver_user_ids: dto.approver_user_ids ?? [],
      expires_after_seconds: dto.expires_after_seconds,
      created_by: createdBy,
    } as Prisma.AiApprovalPolicyUncheckedCreateInput);
    await this.audit.record({
      action: 'ai.approval_policy.create',
      entityType: 'AiApprovalPolicy',
      entityId: policy.id,
      newValue: { name: policy.name, target_type: policy.target_type, is_active: policy.is_active },
    });
    return policy;
  }

  async updatePolicy(id: string, dto: UpdateApprovalPolicyDto) {
    const before = await this.getPolicy(id);
    const policy = await this.repository.updatePolicy(id, {
      name: dto.name ?? undefined,
      description: dto.description ?? undefined,
      condition:
        dto.condition === undefined ? undefined : (dto.condition as Prisma.InputJsonValue),
      approver_profile_ids: dto.approver_profile_ids ?? undefined,
      approver_user_ids: dto.approver_user_ids ?? undefined,
      expires_after_seconds: dto.expires_after_seconds ?? undefined,
      is_active: dto.is_active ?? undefined,
    });
    await this.audit.record({
      action: 'ai.approval_policy.update',
      entityType: 'AiApprovalPolicy',
      entityId: id,
      oldValue: { is_active: before.is_active, condition: before.condition },
      newValue: { is_active: policy.is_active, condition: policy.condition },
    });
    return policy;
  }

  // ─── Aprovacoes de acao ─────────────────────────────

  listApprovals(filters: ApprovalFilters) {
    return this.repository.findApprovals(filters);
  }

  async getApproval(id: string) {
    const approval = await this.repository.findApprovalById(id);
    if (!approval) throw new NotFoundException('Aprovação não encontrada.');
    return approval;
  }

  /**
   * Executa de fato a ação aprovada, reconstruindo o contexto local do run
   * guardado em `scopeKeys` e com bypass do gate (runApproved).
   */
  private async executeApproved(approval: AiActionApproval): Promise<void> {
    const ctxJson = (approval.context ?? {}) as unknown as {
      arguments?: Record<string, unknown>;
      scope?: {
        scopeKeys?: Record<string, string>;
        memoryProfileIds?: string[];
        agentId?: string;
        agentRunId?: string;
        traceId?: string;
        executionId?: string | null;
      };
    };
    const args = (ctxJson.arguments ?? {}) as Record<string, unknown>;
    const scope = ctxJson.scope ?? {};
    const runtime = this.moduleRef.get(ToolRuntimeService, { strict: false });
    const execCtx: ToolExecutionContext = {
      agentId: scope.agentId ?? '',
      agentRunId: approval.agent_run_id ?? scope.agentRunId ?? '',
      traceId: scope.traceId ?? '',
      executionId: scope.executionId ?? null,
      scopeKeys: scope.scopeKeys ?? {},
      memoryProfileIds: scope.memoryProfileIds ?? [],
      dryRun: false,
    };
    const result = await runtime.runApproved(approval.target, args, execCtx);
    if (result.status === 'error') {
      throw new Error(result.error ?? 'Erro desconhecido ao executar a ação.');
    }
    this.logger.log(`Ação aprovada ${approval.id} (${approval.target}) executada com sucesso.`);
  }

  /**
   * Cria uma aprovacao PENDING. Chamado pelo ToolRuntime quando uma acao exige
   * revisao humana; nao passa pelo controller (sem endpoint de create direto).
   */
  createApproval(input: CreateApprovalInput): Promise<AiActionApproval> {
    const expiresAt =
      input.expiresAfterSeconds && input.expiresAfterSeconds > 0
        ? new Date(Date.now() + input.expiresAfterSeconds * 1000)
        : null;
    return this.repository.createApproval({
      policy_id: input.policyId ?? null,
      agent_run_id: input.agentRunId ?? null,
      requested_by: input.requestedBy ?? null,
      target: input.target,
      context: (input.context ?? {}) as Prisma.InputJsonValue,
      status: AiApprovalStatus.PENDING,
      expires_at: expiresAt,
    } as Prisma.AiActionApprovalUncheckedCreateInput);
  }

  /**
   * Decide (aprovar/rejeitar) uma aprovacao PENDING.
   * NAO retoma o agent run — o front/worker chama runner.resume separadamente
   * (evita dependencia circular com o AgentRunner).
   */
  async decide(
    id: string,
    decision: ApprovalDecision,
  ): Promise<AiActionApproval> {
    const approval = await this.getApproval(id);
    if (approval.status !== AiApprovalStatus.PENDING) {
      throw new ConflictException('Aprovação já decidida.');
    }

    const status = decision.approve ? AiApprovalStatus.APPROVED : AiApprovalStatus.REJECTED;
    const updated = await this.repository.updateApproval(id, {
      status,
      decided_by: decision.decidedBy,
      decided_at: new Date(),
      reject_reason: decision.approve ? null : (decision.rejectReason ?? null),
    });

    // APROVAR EXECUTA DE VERDADE. Antes o decide só mudava o status e nada
    // rodava (a ação — ex.: abrir OS no IXC — nunca acontecia). Agora executamos
    // a tool aprovada sob o MESMO escopo que gerou a solicitação, com bypass do
    // gate (já foi aprovada). Falha na execução NÃO reverte a decisão: registra
    // o erro na própria aprovação pra ficar visível.
    if (decision.approve) {
      try {
        await this.executeApproved(updated);
      } catch (e) {
        this.logger.error(`Falha ao executar ação aprovada ${id}: ${(e as Error).message}`);
        await this.repository
          .updateApproval(id, { reject_reason: `Falha na execução: ${(e as Error).message}` })
          .catch(() => undefined);
      }
    }

    await this.audit.record({
      action: 'ai.approval.decide',
      entityType: 'AiActionApproval',
      entityId: id,
      oldValue: { status: approval.status },
      newValue: { status: updated.status, id: updated.id },
    });
    this.logger.log(
      `Aprovação ${id} ${decision.approve ? 'aprovada' : 'rejeitada'} por ${decision.decidedBy ?? 'sistema'}.`,
    );
    return updated;
  }
}
