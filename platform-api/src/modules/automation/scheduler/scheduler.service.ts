// Scheduler (diretriz 12): sincroniza o agendamento persistido com o trigger
// da versao PUBLICADA + preview das proximas execucoes + calendarios
// (feriados/dias úteis) da instância.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Workflow } from '@prisma/client';
import { SchedulesRepository } from './schedules.repository';
import { CalendarDef, computeNextRuns, describeSchedule, validateScheduleDef } from './schedule.util';
import { ScheduleDef, TriggerDef } from '../engine/workflow-graph';
import { AuditLogService } from '../../../shared/audit/audit-log.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly repository: SchedulesRepository,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Sync no publish (chamado pelo WorkflowsService) ────────────────

  async syncWorkflowSchedule(workflow: Workflow, trigger: TriggerDef): Promise<void> {
    if (trigger.type !== 'schedule' || !trigger.schedule) {
      await this.repository.disable(workflow.id).catch(() => 0);
      return;
    }
    const errors = validateScheduleDef(trigger.schedule);
    if (errors.length > 0) {
      throw new BadRequestException(`Agendamento inválido: ${errors.join(' | ')}`);
    }
    const calendar = await this.loadCalendar(trigger.schedule.calendar_id);
    const [next] = computeNextRuns(trigger.schedule, calendar, 1);
    await this.repository.upsert(workflow.id, next ?? null, true);
    this.logger.log(
      `Agendamento do fluxo ${workflow.id}: ${describeSchedule(trigger.schedule)} — próximo: ${next?.toISOString() ?? 'n/d'}.`,
    );
  }

  async disableSchedule(workflowId: string): Promise<void> {
    await this.repository.disable(workflowId).catch(() => 0);
  }

  /** Recalcula o proximo disparo (usado pelo cron apos disparar). */
  async advanceSchedule(
    scheduleId: string,
    trigger: TriggerDef | null,
    firedAt: Date,
  ): Promise<void> {
    if (trigger?.type !== 'schedule' || !trigger.schedule) {
      await this.repository.update(scheduleId, { enabled: false, next_run_at: null });
      return;
    }
    const calendar = await this.loadCalendar(trigger.schedule.calendar_id);
    const [next] = computeNextRuns(trigger.schedule, calendar, 1, firedAt);
    await this.repository.update(scheduleId, { next_run_at: next ?? null, last_run_at: firedAt });
  }

  // ─── Preview / listagem ─────────────────────────────

  async preview(def: ScheduleDef, n = 5) {
    const errors = validateScheduleDef(def);
    if (errors.length > 0) throw new BadRequestException(`Agendamento inválido: ${errors.join(' | ')}`);
    const calendar = await this.loadCalendar(def.calendar_id);
    return {
      description: describeSchedule(def),
      next_runs: computeNextRuns(def, calendar, n).map((d) => d.toISOString()),
    };
  }

  listSchedules() {
    return this.repository.list();
  }

  // ─── Calendarios ────────────────────────────────────

  listCalendars() {
    return this.repository.findCalendars();
  }

  async createCalendar(
    dto: { name: string; holidays?: string[]; workdays?: number[] },
  ) {
    const calendar = await this.repository.createCalendar({
      name: dto.name,
      holidays: (dto.holidays ?? []) as Prisma.InputJsonValue,
      workdays: (dto.workdays ?? [1, 2, 3, 4, 5]) as Prisma.InputJsonValue,
    });
    await this.audit.record({
      action: 'automation.calendar.create',
      entityType: 'AutomationCalendar',
      entityId: calendar.id,
      newValue: { name: calendar.name },
    });
    return calendar;
  }

  async updateCalendar(
    id: string,
    dto: { name?: string; holidays?: string[]; workdays?: number[] },
  ) {
    const before = await this.getCalendar(id);
    const calendar = await this.repository.updateCalendar(id, {
      name: dto.name ?? undefined,
      holidays: dto.holidays === undefined ? undefined : (dto.holidays as Prisma.InputJsonValue),
      workdays: dto.workdays === undefined ? undefined : (dto.workdays as Prisma.InputJsonValue),
    });
    await this.audit.record({
      action: 'automation.calendar.update',
      entityType: 'AutomationCalendar',
      entityId: id,
      oldValue: { name: before.name },
      newValue: { name: calendar.name },
    });
    return calendar;
  }

  async deleteCalendar(id: string) {
    const before = await this.getCalendar(id);
    await this.repository.deleteCalendar(id);
    await this.audit.record({
      action: 'automation.calendar.delete',
      entityType: 'AutomationCalendar',
      entityId: id,
      oldValue: { name: before.name },
    });
    return { deleted: true };
  }

  // ─── Privados ───────────────────────────────────────

  private async getCalendar(id: string) {
    const calendar = await this.repository.findCalendarById(id);
    if (!calendar) throw new NotFoundException('Calendário não encontrado.');
    return calendar;
  }

  private async loadCalendar(calendarId?: string): Promise<CalendarDef | null> {
    if (!calendarId) return null;
    const calendar = await this.repository.findCalendarById(calendarId);
    if (!calendar) return null;
    return {
      holidays: Array.isArray(calendar.holidays) ? (calendar.holidays as string[]) : [],
      workdays: Array.isArray(calendar.workdays) ? (calendar.workdays as number[]) : [1, 2, 3, 4, 5],
    };
  }
}
