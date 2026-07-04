// Scheduler: preview das proximas execucoes + lista de agendamentos ativos +
// CRUD de calendarios (feriados/dias uteis).
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
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
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewScheduleDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.scheduler.preview(resolveOrganizationId(user, orgQuery), dto as unknown as ScheduleDef, 5);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query('organization_id') orgQuery?: string) {
    return this.scheduler.listSchedules(resolveOrganizationId(user, orgQuery));
  }

  // ─── Calendarios ────────────────────────────────────

  @Get('calendars')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  listCalendars(@CurrentUser() user: AuthenticatedUser, @Query('organization_id') orgQuery?: string) {
    return this.scheduler.listCalendars(resolveOrganizationId(user, orgQuery));
  }

  @Post('calendars')
  @RequirePermissions(PERMISSIONS.AUTOMATION_CALENDARS_MANAGE)
  createCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCalendarDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.scheduler.createCalendar(resolveOrganizationId(user, orgQuery), dto);
  }

  @Patch('calendars/:id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_CALENDARS_MANAGE)
  updateCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.scheduler.updateCalendar(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Delete('calendars/:id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_CALENDARS_MANAGE)
  deleteCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.scheduler.deleteCalendar(resolveOrganizationId(user, orgQuery), id);
  }
}
