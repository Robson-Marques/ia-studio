// Porta unica ao banco de custos e orcamentos de IA (diretriz 3).
// Registro de custo e acumulativo por (org, ws, agente, provider, modelo, mes):
// o upsert INCREMENTA tokens/custo em vez de sobrescrever.
// ATENCAO: agent_id participa da unique composta e e nullable no schema; Prisma
// exige valor nao-null no where do upsert composto — usamos "" como sentinela
// (gravamos "" quando nao ha agente) e no where usamos agent_id ?? "".
import { Injectable } from '@nestjs/common';
import { AiProviderKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface UpsertCostRecordInput {
  organization_id: string;
  workspace_id: string;
  environment_id?: string | null;
  agent_id?: string | null;
  provider_kind: AiProviderKind;
  model: string;
  period: string;
  tokens_prompt: number;
  tokens_completion: number;
  cost_usd: number;
}

export interface CostRecordFilters {
  period?: string;
  workspaceId?: string;
  agentId?: string;
}

@Injectable()
export class CostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Registros de custo ─────────────────────────────

  upsertCostRecord(data: UpsertCostRecordInput) {
    const agentId = data.agent_id ?? '';
    return this.prisma.aiCostRecord.upsert({
      where: {
        organization_id_workspace_id_agent_id_provider_kind_model_period: {
          organization_id: data.organization_id,
          workspace_id: data.workspace_id,
          agent_id: agentId,
          provider_kind: data.provider_kind,
          model: data.model,
          period: data.period,
        },
      },
      create: {
        organization_id: data.organization_id,
        workspace_id: data.workspace_id,
        environment_id: data.environment_id ?? null,
        agent_id: agentId,
        provider_kind: data.provider_kind,
        model: data.model,
        period: data.period,
        tokens_prompt: data.tokens_prompt,
        tokens_completion: data.tokens_completion,
        cost_usd: data.cost_usd,
      },
      update: {
        tokens_prompt: { increment: data.tokens_prompt },
        tokens_completion: { increment: data.tokens_completion },
        cost_usd: { increment: data.cost_usd },
      },
    });
  }

  findRecords(organizationId: string, filters: CostRecordFilters = {}) {
    const where: Prisma.AiCostRecordWhereInput = { organization_id: organizationId };
    if (filters.period) where.period = filters.period;
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.agentId) where.agent_id = filters.agentId;
    return this.prisma.aiCostRecord.findMany({ where, orderBy: { updated_at: 'desc' } });
  }

  async sumCostForPeriod(organizationId: string, workspaceId: string, period: string): Promise<number> {
    const r = await this.prisma.aiCostRecord.aggregate({
      where: { organization_id: organizationId, workspace_id: workspaceId, period },
      _sum: { cost_usd: true },
    });
    return r._sum.cost_usd ?? 0;
  }

  // ─── Orcamentos ─────────────────────────────────────

  findBudgets(organizationId: string, filters: { workspaceId?: string } = {}) {
    const where: Prisma.AiBudgetWhereInput = { organization_id: organizationId };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    return this.prisma.aiBudget.findMany({ where, orderBy: { updated_at: 'desc' } });
  }

  findBudgetById(id: string) {
    return this.prisma.aiBudget.findUnique({ where: { id } });
  }

  findActiveBudget(organizationId: string, workspaceId: string) {
    return this.prisma.aiBudget.findFirst({
      where: { organization_id: organizationId, workspace_id: workspaceId, is_active: true },
    });
  }

  createBudget(data: Prisma.AiBudgetUncheckedCreateInput) {
    return this.prisma.aiBudget.create({ data });
  }

  updateBudget(id: string, data: Prisma.AiBudgetUpdateInput) {
    return this.prisma.aiBudget.update({ where: { id }, data });
  }
}
