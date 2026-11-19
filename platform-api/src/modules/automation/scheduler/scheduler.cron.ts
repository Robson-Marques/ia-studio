// Cron do Scheduler (roda no WORKER — diretriz 33; inline em dev via
// WORKER_INLINE=on): a cada minuto dispara os fluxos publicados com
// next_run_at vencido e recalcula o proximo. Idempotente entre processos:
// source_event_id deterministico (workflow+minuto) — a unique de
// automation_executions barra o disparo duplicado.
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SchedulesRepository } from './schedules.repository';
import { SchedulerService } from './scheduler.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkflowsRepository } from '../workflows/workflows.repository';
import { parseTrigger } from '../engine/workflow-graph';
import { processorsEnabled } from '../worker/processors.gate';

@Injectable()
export class SchedulerCron {
  private readonly logger = new Logger(SchedulerCron.name);
  private running = false;

  constructor(
    private readonly schedules: SchedulesRepository,
    private readonly scheduler: SchedulerService,
    private readonly workflows: WorkflowsService,
    private readonly workflowsRepository: WorkflowsRepository,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!processorsEnabled()) return; // API pura (worker separado cuida)
    if (this.running) return; // sem sobreposicao no mesmo processo
    this.running = true;
    try {
      const now = new Date();
      const due = await this.schedules.findDue(now);
      for (const item of due) {
        const workflow = item.workflow;
        try {
          const version = await this.workflowsRepository.findVersion(workflow.id, workflow.current_version);
          const trigger = version ? parseTrigger(version.trigger) : null;

          if (trigger?.type === 'schedule') {
            const minute = (item.next_run_at ?? now).toISOString().slice(0, 16);
            await this.workflows.startExecution(workflow, {
              triggerType: 'SCHEDULE',
              input: { scheduled_at: (item.next_run_at ?? now).toISOString() },
              sourceEventId: `sched:${workflow.id}:${minute}`,
            });
          }
          await this.scheduler.advanceSchedule(item.id, trigger, now);
        } catch (e) {
          this.logger.warn(`Falha ao disparar agendamento do fluxo ${workflow.id}: ${(e as Error).message}`);
          // Avanca mesmo em falha pra nao re-disparar o mesmo minuto em loop.
          await this.scheduler
            .advanceSchedule(item.id, null, now)
            .catch(() => undefined);
        }
      }
    } catch (e) {
      this.logger.warn(`SchedulerCron falhou: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
