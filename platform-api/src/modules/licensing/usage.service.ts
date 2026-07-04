// Usage Metering (diretriz 40) — TODO modulo novo registra consumo aqui.
// Agregado por organization/workspace/metrica/mes (upsert atomico).
import { Injectable, Logger } from '@nestjs/common';
import { LicensingRepository } from './licensing.repository';
import { currentPeriod } from './licensing.helpers';

export interface UsageView {
  metric: string;
  period: string;
  workspace_id: string | null;
  value: number;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private readonly repository: LicensingRepository) {}

  /**
   * Incrementa o consumo de uma metrica no periodo corrente.
   * workspaceId null/undefined = consumo no nivel da organization
   * (gravado com workspace_id="" — ver comentario no schema).
   * Nunca lanca: metering nao pode derrubar o fluxo de negocio.
   */
  async increment(
    organizationId: string,
    workspaceId: string | null | undefined,
    metric: string,
    value = 1,
  ): Promise<void> {
    try {
      await this.repository.upsertUsage(
        organizationId,
        workspaceId ?? '',
        metric,
        currentPeriod(),
        BigInt(Math.max(0, Math.trunc(value))),
      );
    } catch (e) {
      this.logger.warn(`Falha ao registrar consumo ${metric}: ${(e as Error).message}`);
    }
  }

  /** Consumo total (todas as linhas org+workspaces) de uma metrica no periodo. */
  async getValue(organizationId: string, metric: string, period = currentPeriod()): Promise<number> {
    const sum = await this.repository.sumUsage(organizationId, metric, period);
    return Number(sum);
  }

  /** Consumo da organization (BigInt serializado pra number — limites reais << 2^53). */
  async getUsage(organizationId: string, period = currentPeriod()): Promise<UsageView[]> {
    const rows = await this.repository.findUsage(organizationId, period);
    return rows.map((r) => ({
      metric: r.metric,
      period: r.period,
      workspace_id: r.workspace_id === '' ? null : r.workspace_id,
      value: Number(r.value),
    }));
  }
}
