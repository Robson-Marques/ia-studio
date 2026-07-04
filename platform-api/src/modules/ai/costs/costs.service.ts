// Custos e orcamentos de IA (Fase 5):
//   * record() acumula consumo por run — NUNCA lanca (roda ao final do run).
//   * checkBudget/isBlocked implementam o gate de orcamento (alerta em % e
//     bloqueio duro opcional) — o runner consulta isBlocked() ANTES do LLM.
//   * summary() agrega em memoria os registros persistidos.
//   * simulate() usa o pricing dos providers para estimar custo sem gastar.
// Automatismo nasce OFF: budget nasce is_active=false (default do schema);
// bloqueio so quando o usuario ligar block_on_exceed + is_active (CLAUDE.md).
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiProviderKind } from '@prisma/client';
import { CostsRepository } from './costs.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { assertSameOrg, validateWorkspaceScope } from '../../../shared/auth/tenant.util';
import { NotificationCenterService } from '../../automation/notifications/notification-center.service';
import { computeCost, guessKindByModel, priceForModel } from '../providers/pricing';
import { CreateBudgetDto, SimulateCostDto, UpdateBudgetDto } from './dto/costs.dtos';

export interface RecordCostInput {
  organizationId: string;
  workspaceId: string;
  environmentId?: string | null;
  agentId?: string | null;
  providerKind: AiProviderKind;
  model: string;
  period?: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  traceId?: string;
}

export interface CostSummaryFilters {
  period?: string;
  workspaceId?: string;
  agentId?: string;
}

/** Mes corrente no formato "YYYY-MM" (chave de agregacao dos registros). */
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

@Injectable()
export class CostsService {
  private readonly logger = new Logger(CostsService.name);

  constructor(
    private readonly repository: CostsRepository,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationCenterService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Registro de consumo (chamado ao final de um run) ───────────────

  /**
   * Acumula o consumo do run e verifica o orcamento. NUNCA lanca: uma falha
   * de metering nao pode derrubar a resposta ja produzida pelo LLM.
   */
  async record(input: RecordCostInput): Promise<{ blocked: boolean }> {
    const period = input.period ?? currentPeriod();
    try {
      await this.repository.upsertCostRecord({
        organization_id: input.organizationId,
        workspace_id: input.workspaceId,
        environment_id: input.environmentId ?? null,
        agent_id: input.agentId ?? null,
        provider_kind: input.providerKind,
        model: input.model,
        period,
        tokens_prompt: input.promptTokens,
        tokens_completion: input.completionTokens,
        cost_usd: input.costUsd,
      });
      return await this.checkBudget(
        input.organizationId,
        input.workspaceId,
        input.environmentId ?? undefined,
        input.traceId,
      );
    } catch (e) {
      this.logger.warn(`Falha ao registrar custo de IA: ${(e as Error).message}`);
      return { blocked: false };
    }
  }

  /**
   * Alerta (% do limite) + sinal de bloqueio. Nao persiste estado — apenas
   * dispara notificacao in-app (broadcast) e retorna se deve bloquear.
   */
  private async checkBudget(
    organizationId: string,
    workspaceId: string,
    environmentId?: string,
    traceId?: string,
  ): Promise<{ blocked: boolean }> {
    const budget = await this.repository.findActiveBudget(organizationId, workspaceId);
    if (!budget || !budget.is_active) return { blocked: false };

    const total = await this.repository.sumCostForPeriod(organizationId, workspaceId, currentPeriod());
    const alertAt = (budget.limit_usd * budget.alert_threshold_pct) / 100;

    if (total >= alertAt) {
      // notify() e async e nunca lanca; user_id undefined = broadcast da org.
      await this.notifications.notify({
        organizationId,
        workspaceId,
        environmentId: environmentId ?? null,
        recipient: { user_id: undefined },
        title: 'Orçamento de IA',
        body: `Consumo de IA em US$ ${total.toFixed(2)} de US$ ${budget.limit_usd.toFixed(2)} no período.`,
        channel: 'in_app',
        traceId,
      });
    }

    return { blocked: budget.block_on_exceed && total >= budget.limit_usd };
  }

  /**
   * Gate consultado pelo runner ANTES de chamar o LLM: true se ha orcamento
   * ativo com bloqueio duro e o consumo do periodo ja atingiu o limite.
   */
  async isBlocked(organizationId: string, workspaceId: string): Promise<boolean> {
    const budget = await this.repository.findActiveBudget(organizationId, workspaceId);
    if (!budget || !budget.is_active || !budget.block_on_exceed) return false;
    const total = await this.repository.sumCostForPeriod(organizationId, workspaceId, currentPeriod());
    return total >= budget.limit_usd;
  }

  // ─── Leitura / agregacao ────────────────────────────

  async summary(organizationId: string, filters: CostSummaryFilters) {
    const records = await this.repository.findRecords(organizationId, filters);

    const totals = { cost_usd: 0, tokens_prompt: 0, tokens_completion: 0 };
    const byProvider = new Map<string, number>();
    const byAgent = new Map<string, number>();

    for (const r of records) {
      totals.cost_usd += r.cost_usd;
      totals.tokens_prompt += r.tokens_prompt;
      totals.tokens_completion += r.tokens_completion;
      byProvider.set(r.provider_kind, (byProvider.get(r.provider_kind) ?? 0) + r.cost_usd);
      // "" (sentinela de sem-agente) vira null na saida.
      const agentKey = r.agent_id && r.agent_id !== '' ? r.agent_id : 'none';
      byAgent.set(agentKey, (byAgent.get(agentKey) ?? 0) + r.cost_usd);
    }

    return {
      records,
      totals,
      by_provider: [...byProvider.entries()].map(([provider_kind, cost_usd]) => ({ provider_kind, cost_usd })),
      by_agent: [...byAgent.entries()].map(([agent_id, cost_usd]) => ({
        agent_id: agent_id === 'none' ? null : agent_id,
        cost_usd,
      })),
    };
  }

  // ─── Orcamentos (CRUD) ──────────────────────────────

  listBudgets(organizationId: string, filters: { workspaceId?: string }) {
    return this.repository.findBudgets(organizationId, filters);
  }

  async getBudget(organizationId: string, id: string) {
    const budget = await this.repository.findBudgetById(id);
    if (!budget) throw new NotFoundException('Orçamento não encontrado.');
    assertSameOrg(budget.organization_id, organizationId);
    return budget;
  }

  async createBudget(organizationId: string, dto: CreateBudgetDto, createdBy: string | null) {
    await validateWorkspaceScope(this.prisma, organizationId, dto.workspace_id, dto.environment_id);

    // is_active NAO e forcado: automatismo nasce OFF (default do schema).
    const budget = await this.repository.createBudget({
      organization_id: organizationId,
      workspace_id: dto.workspace_id,
      environment_id: dto.environment_id ?? null,
      period_kind: dto.period_kind ?? 'MONTHLY',
      limit_usd: dto.limit_usd,
      alert_threshold_pct: dto.alert_threshold_pct ?? 80,
      block_on_exceed: dto.block_on_exceed ?? false,
      created_by: createdBy,
    });

    await this.audit.record({
      action: 'ai.budget.create',
      entityType: 'AiBudget',
      entityId: budget.id,
      organizationId,
      workspaceId: dto.workspace_id,
      newValue: {
        limit_usd: budget.limit_usd,
        alert_threshold_pct: budget.alert_threshold_pct,
        block_on_exceed: budget.block_on_exceed,
      },
    });
    return budget;
  }

  async updateBudget(organizationId: string, id: string, dto: UpdateBudgetDto) {
    const before = await this.getBudget(organizationId, id);
    const budget = await this.repository.updateBudget(id, {
      limit_usd: dto.limit_usd ?? undefined,
      alert_threshold_pct: dto.alert_threshold_pct ?? undefined,
      block_on_exceed: dto.block_on_exceed ?? undefined,
      is_active: dto.is_active ?? undefined,
    });

    await this.audit.record({
      action: 'ai.budget.update',
      entityType: 'AiBudget',
      entityId: id,
      organizationId,
      workspaceId: before.workspace_id,
      oldValue: {
        limit_usd: before.limit_usd,
        alert_threshold_pct: before.alert_threshold_pct,
        block_on_exceed: before.block_on_exceed,
        is_active: before.is_active,
      },
      newValue: {
        limit_usd: budget.limit_usd,
        alert_threshold_pct: budget.alert_threshold_pct,
        block_on_exceed: budget.block_on_exceed,
        is_active: budget.is_active,
      },
    });
    return budget;
  }

  // ─── Simulador de custo (diretriz 27 — nao gasta) ───

  simulate(dto: SimulateCostDto) {
    const runs = dto.runs_per_month ?? 1;
    const costPerRun = computeCost(dto.model, dto.prompt_tokens, dto.completion_tokens);
    return {
      model: dto.model,
      provider_kind: guessKindByModel(dto.model),
      cost_per_run_usd: costPerRun,
      monthly_estimate_usd: costPerRun * runs,
      price_known: priceForModel(dto.model) !== null,
    };
  }
}
