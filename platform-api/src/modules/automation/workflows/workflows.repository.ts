// Porta unica ao banco de workflows + versoes imutaveis (diretriz 3).
// Versao NUNCA sofre UPDATE de graph — so marcacao de published_at.
import { Injectable } from '@nestjs/common';
import { Prisma, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface WorkflowFilters {
  workspaceId?: string;
  environmentId?: string;
  status?: WorkflowStatus;
  search?: string;
}

@Injectable()
export class WorkflowsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByOrg(organizationId: string, filters: WorkflowFilters = {}) {
    const where: Prisma.WorkflowWhereInput = { organization_id: organizationId };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.environmentId) where.environment_id = filters.environmentId;
    if (filters.status) where.status = filters.status;
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };
    return this.prisma.workflow.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      include: { schedule: { select: { next_run_at: true, enabled: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.workflow.findUnique({ where: { id } });
  }

  findByWebhookToken(token: string) {
    return this.prisma.workflow.findUnique({ where: { webhook_token: token } });
  }

  findPublishedByOrg(organizationId: string) {
    return this.prisma.workflow.findMany({
      where: { organization_id: organizationId, status: 'PUBLISHED' },
    });
  }

  countByOrg(organizationId: string) {
    return this.prisma.workflow.count({ where: { organization_id: organizationId } });
  }

  create(data: Prisma.WorkflowUncheckedCreateInput) {
    return this.prisma.workflow.create({ data });
  }

  update(id: string, data: Prisma.WorkflowUpdateInput) {
    return this.prisma.workflow.update({ where: { id }, data });
  }

  // ─── Versoes (imutaveis) ────────────────────────────

  createVersion(data: Prisma.WorkflowVersionUncheckedCreateInput) {
    return this.prisma.workflowVersion.create({ data });
  }

  findVersion(workflowId: string, version: number) {
    return this.prisma.workflowVersion.findUnique({
      where: { workflow_id_version: { workflow_id: workflowId, version } },
    });
  }

  listVersions(workflowId: string) {
    return this.prisma.workflowVersion.findMany({
      where: { workflow_id: workflowId },
      orderBy: { version: 'desc' },
    });
  }

  latestVersionNumber(workflowId: string) {
    return this.prisma.workflowVersion
      .aggregate({ where: { workflow_id: workflowId }, _max: { version: true } })
      .then((r) => r._max.version ?? 0);
  }

  markVersionPublished(workflowId: string, version: number) {
    return this.prisma.workflowVersion.update({
      where: { workflow_id_version: { workflow_id: workflowId, version } },
      data: { published_at: new Date() },
    });
  }
}
