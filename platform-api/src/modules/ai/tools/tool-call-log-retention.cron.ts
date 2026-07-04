// Retencao de AiToolCallLog (diretriz 55 — log tem ciclo de vida proprio).
// Roda no worker (gated por processorsEnabled); apaga logs mais antigos que
// AI_TOOL_LOG_RETENTION_DAYS (default 30). Diario.
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ToolsRepository } from './tools.repository';
import { processorsEnabled } from '../../automation/worker/processors.gate';

@Injectable()
export class ToolCallLogRetentionCron {
  private readonly logger = new Logger(ToolCallLogRetentionCron.name);
  private running = false;

  constructor(private readonly repository: ToolsRepository) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge(): Promise<void> {
    if (!processorsEnabled()) return;
    if (this.running) return;
    this.running = true;
    try {
      const days = Number(process.env['AI_TOOL_LOG_RETENTION_DAYS'] ?? 30);
      const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
      const result = await this.repository.deleteCallLogsBefore(cutoff);
      if (result.count > 0) {
        this.logger.log(`Retenção: ${result.count} logs de tool anteriores a ${cutoff.toISOString()} removidos.`);
      }
    } catch (e) {
      this.logger.warn(`Retenção de logs de tool falhou: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
