// Porta unica ao banco de politicas de aprovacao + aprovacoes de acao (diretriz 31).
// Politicas nascem OFF (is_active=false); default da plataforma e NUNCA exigir aprovacao.
import { Injectable } from '@nestjs/common';
import { AiApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface ApprovalFilters {
  status?: AiApprovalStatus;
}

@Injectable()
export class ApprovalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Politicas ──────────────────────────────────────

  findPolicies() {
    return this.prisma.aiApprovalPolicy.findMany({
      where: {},
      orderBy: { created_at: 'desc' },
    });
  }

  findPolicyById(id: string) {
    return this.prisma.aiApprovalPolicy.findUnique({ where: { id } });
  }

  /** So politicas ativas — base da avaliacao do ApprovalPolicyService. */
  findActivePolicies() {
    return this.prisma.aiApprovalPolicy.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }

  createPolicy(data: Prisma.AiApprovalPolicyUncheckedCreateInput) {
    return this.prisma.aiApprovalPolicy.create({ data });
  }

  updatePolicy(id: string, data: Prisma.AiApprovalPolicyUpdateInput) {
    return this.prisma.aiApprovalPolicy.update({ where: { id }, data });
  }

  // ─── Aprovacoes de acao ─────────────────────────────

  findApprovals(filters: ApprovalFilters = {}) {
    const where: Prisma.AiActionApprovalWhereInput = {};
    if (filters.status) where.status = filters.status;
    return this.prisma.aiActionApproval.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  findApprovalById(id: string) {
    return this.prisma.aiActionApproval.findUnique({ where: { id } });
  }

  createApproval(data: Prisma.AiActionApprovalUncheckedCreateInput) {
    return this.prisma.aiActionApproval.create({ data });
  }

  updateApproval(id: string, data: Prisma.AiActionApprovalUpdateInput) {
    return this.prisma.aiActionApproval.update({ where: { id }, data });
  }

  /** Aprovacoes pendentes de um run — usado pelo runner para bloquear/retomar. */
  findPendingByRun(agentRunId: string) {
    return this.prisma.aiActionApproval.findMany({
      where: { agent_run_id: agentRunId, status: AiApprovalStatus.PENDING },
      orderBy: { created_at: 'asc' },
    });
  }
}
