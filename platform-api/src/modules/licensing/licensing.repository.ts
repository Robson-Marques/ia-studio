// Porta unica ao banco do modulo licensing (plans + licenses + usage).
import { Injectable } from '@nestjs/common';
import { LicenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class LicensingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Plans ──────────────────────────────────────────
  findPlans(includeInactive = true) {
    return this.prisma.plan.findMany({
      where: includeInactive ? undefined : { is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }

  findPlanById(id: string) {
    return this.prisma.plan.findUnique({ where: { id } });
  }

  findPlanByName(name: string) {
    return this.prisma.plan.findUnique({ where: { name } });
  }

  createPlan(data: Prisma.PlanCreateInput) {
    return this.prisma.plan.create({ data });
  }

  updatePlan(id: string, data: Prisma.PlanUpdateInput) {
    return this.prisma.plan.update({ where: { id }, data });
  }

  // ─── Licenses ───────────────────────────────────────
  findLicenses() {
    return this.prisma.license.findMany({
      include: {
        plan: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  findLicenseById(id: string) {
    return this.prisma.license.findUnique({
      include: { plan: true, organization: { select: { id: true, name: true, slug: true } } },
      where: { id },
    });
  }

  findLicenseByOrg(organizationId: string) {
    return this.prisma.license.findUnique({
      where: { organization_id: organizationId },
      include: { plan: true },
    });
  }

  updateLicense(id: string, data: Prisma.LicenseUpdateInput) {
    return this.prisma.license.update({ where: { id }, data, include: { plan: true } });
  }

  // ─── Usage ──────────────────────────────────────────
  upsertUsage(organizationId: string, workspaceId: string, metric: string, period: string, increment: bigint) {
    return this.prisma.usageRecord.upsert({
      where: {
        organization_id_workspace_id_metric_period: {
          organization_id: organizationId,
          workspace_id: workspaceId,
          metric,
          period,
        },
      },
      create: {
        organization_id: organizationId,
        workspace_id: workspaceId,
        metric,
        period,
        value: increment,
      },
      update: { value: { increment } },
    });
  }

  findUsage(organizationId: string, period?: string) {
    return this.prisma.usageRecord.findMany({
      where: { organization_id: organizationId, ...(period ? { period } : {}) },
      orderBy: [{ period: 'desc' }, { metric: 'asc' }],
    });
  }

  async sumUsage(organizationId: string, metric: string, period: string): Promise<bigint> {
    const agg = await this.prisma.usageRecord.aggregate({
      where: { organization_id: organizationId, metric, period },
      _sum: { value: true },
    });
    return agg._sum.value ?? BigInt(0);
  }

  // ─── Contagens pra limites estruturais (users, workspaces...) ───
  countActiveUsers(organizationId: string): Promise<number> {
    return this.prisma.user.count({
      where: { organization_id: organizationId, deleted_at: null, is_active: true },
    });
  }

  countActiveWorkspaces(organizationId: string): Promise<number> {
    return this.prisma.workspace.count({
      where: { organization_id: organizationId, is_active: true },
    });
  }

  isLicenseBlocked(status: LicenseStatus): boolean {
    return (
      status === LicenseStatus.SUSPENDED ||
      status === LicenseStatus.RESTRICTED ||
      status === LicenseStatus.EXPIRED
    );
  }
}
