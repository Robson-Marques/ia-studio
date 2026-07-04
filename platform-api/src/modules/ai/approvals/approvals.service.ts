// Ciclo de vida das politicas de aprovacao + das aprovacoes de acao (diretriz 31).
// Politicas: CRUD generico (nascem OFF; so o usuario ativa).
// Aprovacoes: criadas pelo ToolRuntime quando uma acao exige revisao humana e
// decididas (aprovar/rejeitar) por quem tem 'ai.approvals.decide'.
//
// IMPORTANTE: este service NAO retoma o agent run apos a decisao e NAO importa o
// AgentRunner (evita dependencia circular). Quem decide dispara, em separado, o
// runner.resume via front/worker — a decisao aqui apenas persiste o veredito.
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiActionApproval, AiApprovalStatus, Prisma } from '@prisma/client';
import { ApprovalsRepository, ApprovalFilters } from './approvals.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { assertSameOrg, validateWorkspaceScope } from '../../../shared/auth/tenant.util';
import { CreateApprovalPolicyDto, UpdateApprovalPolicyDto } from './dto/approvals.dtos';

/** Entrada da criacao de aprovacao (usada pelo ToolRuntime, nao pelo controller). */
export interface CreateApprovalInput {
  organizationId: string;
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
    private readonly prisma: PrismaService,
  ) {}

  // ─── Politicas (CRUD generico) ──────────────────────

  listPolicies(organizationId: string, filters: { workspaceId?: string }) {
    return this.repository.findPolicies(organizationId, filters);
  }

  async getPolicy(organizationId: string, id: string) {
    const policy = await this.repository.findPolicyById(id);
    if (!policy) throw new NotFoundException('Política de aprovação não encontrada.');
    assertSameOrg(policy.organization_id, organizationId);
    return policy;
  }

  async createPolicy(organizationId: string, dto: CreateApprovalPolicyDto, createdBy: string | null) {
    if (dto.workspace_id) {
      await validateWorkspaceScope(this.prisma, organizationId, dto.workspace_id, dto.environment_id);
    }
    // is_active NAO e forcado: nasce OFF por default do schema (diretriz 31).
    const policy = await this.repository.createPolicy({
      organization_id: organizationId,
      workspace_id: dto.workspace_id,
      environment_id: dto.environment_id,
      name: dto.name,
      description: dto.description,
      target_type: dto.target_type,
      condition: (dto.condition ?? {}) as Prisma.InputJsonValue,
      approver_profile_ids: dto.approver_profile_ids ?? [],
      approver_user_ids: dto.approver_user_ids ?? [],
      expires_after_seconds: dto.expires_after_seconds,
      created_by: createdBy,
    });
    await this.audit.record({
      action: 'ai.approval_policy.create',
      entityType: 'AiApprovalPolicy',
      entityId: policy.id,
      organizationId,
      workspaceId: policy.workspace_id,
      newValue: { name: policy.name, target_type: policy.target_type, is_active: policy.is_active },
    });
    return policy;
  }

  async updatePolicy(organizationId: string, id: string, dto: UpdateApprovalPolicyDto) {
    const before = await this.getPolicy(organizationId, id);
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
      organizationId,
      oldValue: { is_active: before.is_active, condition: before.condition },
      newValue: { is_active: policy.is_active, condition: policy.condition },
    });
    return policy;
  }

  // ─── Aprovacoes de acao ─────────────────────────────

  listApprovals(organizationId: string, filters: ApprovalFilters) {
    return this.repository.findApprovals(organizationId, filters);
  }

  async getApproval(organizationId: string, id: string) {
    const approval = await this.repository.findApprovalById(id);
    if (!approval) throw new NotFoundException('Aprovação não encontrada.');
    assertSameOrg(approval.organization_id, organizationId);
    return approval;
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
      organization_id: input.organizationId,
      policy_id: input.policyId ?? null,
      agent_run_id: input.agentRunId ?? null,
      requested_by: input.requestedBy ?? null,
      target: input.target,
      context: (input.context ?? {}) as Prisma.InputJsonValue,
      status: AiApprovalStatus.PENDING,
      expires_at: expiresAt,
    });
  }

  /**
   * Decide (aprovar/rejeitar) uma aprovacao PENDING.
   * NAO retoma o agent run — o front/worker chama runner.resume separadamente
   * (evita dependencia circular com o AgentRunner).
   */
  async decide(
    organizationId: string,
    id: string,
    decision: ApprovalDecision,
  ): Promise<AiActionApproval> {
    const approval = await this.getApproval(organizationId, id);
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

    await this.audit.record({
      action: 'ai.approval.decide',
      entityType: 'AiActionApproval',
      entityId: id,
      organizationId,
      oldValue: { status: approval.status },
      newValue: { status: updated.status, id: updated.id },
    });
    this.logger.log(
      `Aprovação ${id} ${decision.approve ? 'aprovada' : 'rejeitada'} por ${decision.decidedBy ?? 'sistema'}.`,
    );
    return updated;
  }
}
