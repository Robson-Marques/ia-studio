// Porta unica ao banco do scheduler (automation_schedules + calendarios).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class SchedulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsert(workflowId: string, organizationId: string, nextRunAt: Date | null, enabled: boolean) {
    return this.prisma.automationSchedule.upsert({
      where: { workflow_id: workflowId },
      create: {
        workflow_id: workflowId,
        organization_id: organizationId,
        next_run_at: nextRunAt,
        enabled,
      },
      update: { next_run_at: nextRunAt, enabled },
    });
  }

  disable(workflowId: string) {
    return this.prisma.automationSchedule
      .updateMany({ where: { workflow_id: workflowId }, data: { enabled: false, next_run_at: null } })
      .then((r) => r.count);
  }

  /** Agendamentos vencidos de fluxos PUBLICADOS. */
  findDue(now: Date, take = 50) {
    return this.prisma.automationSchedule.findMany({
      where: {
        enabled: true,
        next_run_at: { lte: now },
        workflow: { status: 'PUBLISHED' },
      },
      include: { workflow: true },
      orderBy: { next_run_at: 'asc' },
      take,
    });
  }

  update(id: string, data: Prisma.AutomationScheduleUpdateInput) {
    return this.prisma.automationSchedule.update({ where: { id }, data });
  }

  listByOrg(organizationId: string) {
    return this.prisma.automationSchedule.findMany({
      where: { organization_id: organizationId },
      include: { workflow: { select: { id: true, name: true, status: true, current_version: true } } },
      orderBy: { next_run_at: 'asc' },
    });
  }

  // ─── Calendarios ────────────────────────────────────

  findCalendars(organizationId: string) {
    return this.prisma.automationCalendar.findMany({
      where: { organization_id: organizationId },
      orderBy: { name: 'asc' },
    });
  }

  findCalendarById(id: string) {
    return this.prisma.automationCalendar.findUnique({ where: { id } });
  }

  createCalendar(data: Prisma.AutomationCalendarUncheckedCreateInput) {
    return this.prisma.automationCalendar.create({ data });
  }

  updateCalendar(id: string, data: Prisma.AutomationCalendarUpdateInput) {
    return this.prisma.automationCalendar.update({ where: { id }, data });
  }

  deleteCalendar(id: string) {
    return this.prisma.automationCalendar.delete({ where: { id } });
  }
}
