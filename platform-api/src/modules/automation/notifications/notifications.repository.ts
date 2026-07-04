// Porta unica ao banco do Notification Center (in-app + log de entrega).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── In-app (sino) ──────────────────────────────────

  createInApp(data: Prisma.AutomationNotificationUncheckedCreateInput) {
    return this.prisma.automationNotification.create({ data });
  }

  /** Notificacoes do usuario: direcionadas a ele OU broadcast da org. */
  findInbox(organizationId: string, userId: string, onlyUnread = false, take = 20) {
    return this.prisma.automationNotification.findMany({
      where: {
        organization_id: organizationId,
        OR: [{ user_id: userId }, { user_id: null }],
        ...(onlyUnread ? { read_at: null } : {}),
      },
      orderBy: { created_at: 'desc' },
      take,
    });
  }

  countUnread(organizationId: string, userId: string) {
    return this.prisma.automationNotification.count({
      where: {
        organization_id: organizationId,
        OR: [{ user_id: userId }, { user_id: null }],
        read_at: null,
      },
    });
  }

  findInAppById(id: string) {
    return this.prisma.automationNotification.findUnique({ where: { id } });
  }

  markRead(id: string) {
    return this.prisma.automationNotification.update({ where: { id }, data: { read_at: new Date() } });
  }

  markAllRead(organizationId: string, userId: string) {
    return this.prisma.automationNotification.updateMany({
      where: {
        organization_id: organizationId,
        OR: [{ user_id: userId }, { user_id: null }],
        read_at: null,
      },
      data: { read_at: new Date() },
    });
  }

  // ─── Log de entrega ─────────────────────────────────

  createLog(data: Prisma.AutomationNotificationLogUncheckedCreateInput) {
    return this.prisma.automationNotificationLog.create({ data });
  }

  findLog(organizationId: string, take = 50, skip = 0) {
    return this.prisma.$transaction([
      this.prisma.automationNotificationLog.count({ where: { organization_id: organizationId } }),
      this.prisma.automationNotificationLog.findMany({
        where: { organization_id: organizationId },
        orderBy: { created_at: 'desc' },
        take,
        skip,
      }),
    ]);
  }
}
