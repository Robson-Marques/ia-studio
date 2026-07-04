// Porta unica ao banco do modulo workspaces (+ environments).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByOrg(organizationId: string) {
    return this.prisma.workspace.findMany({
      where: { organization_id: organizationId },
      include: { environments: true, _count: { select: { members: true } } },
      orderBy: { created_at: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
      include: { environments: true },
    });
  }

  findBySlug(organizationId: string, slug: string) {
    return this.prisma.workspace.findUnique({
      where: { organization_id_slug: { organization_id: organizationId, slug } },
    });
  }

  countActive(organizationId: string) {
    return this.prisma.workspace.count({
      where: { organization_id: organizationId, is_active: true },
    });
  }

  create(data: Prisma.WorkspaceCreateInput) {
    return this.prisma.workspace.create({ data, include: { environments: true } });
  }

  update(id: string, data: Prisma.WorkspaceUpdateInput) {
    return this.prisma.workspace.update({ where: { id }, data, include: { environments: true } });
  }

  // ─── Environments ───────────────────────────────────
  findEnvironmentById(id: string) {
    return this.prisma.environment.findUnique({ where: { id } });
  }

  createEnvironment(data: Prisma.EnvironmentCreateInput) {
    return this.prisma.environment.create({ data });
  }

  updateEnvironment(id: string, data: Prisma.EnvironmentUpdateInput) {
    return this.prisma.environment.update({ where: { id }, data });
  }

  /** Garante um unico is_default por workspace. */
  clearDefaultEnvironment(workspaceId: string) {
    return this.prisma.environment.updateMany({
      where: { workspace_id: workspaceId, is_default: true },
      data: { is_default: false },
    });
  }
}
