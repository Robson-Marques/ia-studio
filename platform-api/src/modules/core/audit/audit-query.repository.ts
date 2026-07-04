// Porta unica de LEITURA da trilha de auditoria (a escrita e do AuditLogService).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface AuditFilters {
  organizationId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: AuditFilters) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.organizationId ? { organization_id: filters.organizationId } : {}),
      ...(filters.entityType ? { entity_type: filters.entityType } : {}),
      ...(filters.entityId ? { entity_id: filters.entityId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorId ? { actor_id: filters.actorId } : {}),
      ...(filters.from || filters.to
        ? {
            created_at: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, limit, offset };
  }
}
