// Event Bus: log persistido dos eventos publicados + replay (diretriz 7).
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { EventLogRepository } from '../../../shared/events/event-log.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';

@ApiTags('Automation — Event Bus')
@ApiBearerAuth()
@Controller('automation/events')
export class AutomationEventsController {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly repository: EventLogRepository,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_EVENTS_READ)
  async findAll(
    @Query('event') event?: string,
    @Query('trace_id') traceId?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const [total, items] = await this.repository.findAll(
      { event, traceId },
      take ? Number(take) : 50,
      skip ? Number(skip) : 0,
    );
    return { total, items };
  }

  /** Replay: re-emite + re-enfileira o envelope persistido. */
  @Post(':id/replay')
  @RequirePermissions(PERMISSIONS.AUTOMATION_EVENTS_RETRY)
  async replay(
    @Param('id') id: string,
  ) {
    const row = await this.eventBus.replay(id);
    await this.audit.record({
      action: 'automation.event.replay',
      entityType: 'AutomationEventLog',
      entityId: id,
      newValue: { event: row.event, replay_count: row.replay_count },
    });
    return row;
  }
}
