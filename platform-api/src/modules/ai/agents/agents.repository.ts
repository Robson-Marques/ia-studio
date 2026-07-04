// Porta unica ao banco de agentes (ai_agents / ai_agent_prompt_versions /
// ai_agent_runs). Versao NUNCA sofre UPDATE de snapshot — so published_at.
import { Injectable } from '@nestjs/common';
import { AiRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class AgentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Agentes ────────────────────────────────────────

  findAll(organizationId: string, filters: { workspaceId?: string; environmentId?: string } = {}) {
    const where: Prisma.AiAgentWhereInput = { organization_id: organizationId };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.environmentId) where.environment_id = filters.environmentId;
    return this.prisma.aiAgent.findMany({ where, orderBy: { updated_at: 'desc' } });
  }

  findActive(organizationId: string, filters: { workspaceId?: string; environmentId?: string } = {}) {
    const where: Prisma.AiAgentWhereInput = { organization_id: organizationId, is_active: true };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.environmentId) where.environment_id = filters.environmentId;
    return this.prisma.aiAgent.findMany({ where, orderBy: { name: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.aiAgent.findUnique({ where: { id } });
  }

  countByOrg(organizationId: string) {
    return this.prisma.aiAgent.count({ where: { organization_id: organizationId } });
  }

  create(data: Prisma.AiAgentUncheckedCreateInput) {
    return this.prisma.aiAgent.create({ data });
  }

  update(id: string, data: Prisma.AiAgentUpdateInput) {
    return this.prisma.aiAgent.update({ where: { id }, data });
  }

  // ─── Versoes (imutaveis) ────────────────────────────

  createVersion(data: Prisma.AiAgentPromptVersionUncheckedCreateInput) {
    return this.prisma.aiAgentPromptVersion.create({ data });
  }

  findVersion(agentId: string, version: number) {
    return this.prisma.aiAgentPromptVersion.findUnique({
      where: { agent_id_version: { agent_id: agentId, version } },
    });
  }

  listVersions(agentId: string) {
    return this.prisma.aiAgentPromptVersion.findMany({
      where: { agent_id: agentId },
      orderBy: { version: 'desc' },
    });
  }

  latestVersionNumber(agentId: string) {
    return this.prisma.aiAgentPromptVersion
      .aggregate({ where: { agent_id: agentId }, _max: { version: true } })
      .then((r) => r._max.version ?? 0);
  }

  markVersionPublished(agentId: string, version: number) {
    return this.prisma.aiAgentPromptVersion.update({
      where: { agent_id_version: { agent_id: agentId, version } },
      data: { published_at: new Date() },
    });
  }

  // ─── Runs ───────────────────────────────────────────

  createRun(data: Prisma.AiAgentRunUncheckedCreateInput) {
    return this.prisma.aiAgentRun.create({ data });
  }

  findRunById(id: string) {
    return this.prisma.aiAgentRun.findUnique({ where: { id } });
  }

  updateRun(id: string, data: Prisma.AiAgentRunUpdateInput) {
    return this.prisma.aiAgentRun.update({ where: { id }, data });
  }

  listRuns(agentId: string, take = 30) {
    return this.prisma.aiAgentRun.findMany({
      where: { agent_id: agentId },
      orderBy: { created_at: 'desc' },
      take,
    });
  }

  countRunsInPeriod(agentId: string, status?: AiRunStatus) {
    const where: Prisma.AiAgentRunWhereInput = { agent_id: agentId };
    if (status) where.status = status;
    return this.prisma.aiAgentRun.count({ where });
  }
}
