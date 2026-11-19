// Scheduler: preview das proximas execucoes + lista de agendamentos ativos +
// CRUD de calendarios (feriados/dias uteis).
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { SchedulerService } from './scheduler.service';
import { ScheduleDef } from '../engine/workflow-graph';
import { PreviewScheduleDto, CreateCalendarDto, UpdateCalendarDto } from './dto';

@ApiTags('Automation — Scheduler')
@ApiBearerAuth()
@Controller('automation/schedule')
export class ScheduleController {
  constructor(private readonly scheduler: SchedulerService) {}

  /** Preview: POST a definicao amigavel → proximas 5 execucoes. */
  @Post('preview')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  preview(
    @Body() dto: PreviewScheduleDto,
  ) {
    return this.scheduler.preview(dto as unknown as ScheduleDef, 5);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  list() {
    return this.scheduler.listSchedules();
  }

  // ─── Calendarios ────────────────────────────────────

  @Get('calendars')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  listCalendars() {
    return this.scheduler.listCalendars();
  }

  @Post('calendars')
  @RequirePermissions(PERMISSIONS.AUTOMATION_CALENDARS_MANAGE)
  createCalendar(
    @Body() dto: CreateCalendarDto,
  ) {
    return this.scheduler.createCalendar(dto);
  }

  @Patch('calendars/:id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_CALENDARS_MANAGE)
  updateCalendar(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarDto,
  ) {
    return this.scheduler.updateCalendar(id, dto);
  }

  @Delete('calendars/:id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_CALENDARS_MANAGE)
  deleteCalendar(
    @Param('id') id: string,
  ) {
    return this.scheduler.deleteCalendar(id);
  }
}
