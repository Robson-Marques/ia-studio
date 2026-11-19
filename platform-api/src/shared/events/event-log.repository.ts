// Porta unica ao banco do Event Bus (automation_event_log).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EventLogFilters {
  event?: string;
  traceId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class EventLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AutomationEventLogUncheckedCreateInput) {
    return this.prisma.automationEventLog.create({ data });
  }

  findById(id: string) {
    return this.prisma.automationEventLog.findUnique({ where: { id } });
  }

  findBySourceEventId(sourceEventId: string) {
    return this.prisma.automationEventLog.findUnique({ where: { source_event_id: sourceEventId } });
  }

  findAll(filters: EventLogFilters = {}, take = 50, skip = 0) {
    const where: Prisma.AutomationEventLogWhereInput = {};
    if (filters.event) where.event = filters.event;
    if (filters.traceId) where.trace_id = filters.traceId;
    if (filters.from || filters.to) {
      where.created_at = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    return this.prisma.$transaction([
      this.prisma.automationEventLog.count({ where }),
      this.prisma.automationEventLog.findMany({ where, orderBy: { created_at: 'desc' }, take, skip }),
    ]);
  }

  markReplayed(id: string) {
    return this.prisma.automationEventLog.update({
      where: { id },
      data: { replayed_at: new Date(), replay_count: { increment: 1 } },
    });
  }
}
