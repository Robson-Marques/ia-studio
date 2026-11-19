// Notificacoes: sino do painel (inbox do PROPRIO usuario — escopo por
// user_id do JWT, sem perm extra) + log de entrega (perm
// automation.notifications.read).
import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { NotificationsRepository } from './notifications.repository';
import { NotificationCenterService } from './notification-center.service';

@ApiTags('Automation — Notifications')
@ApiBearerAuth()
@Controller('automation/notifications')
export class NotificationsController {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly center: NotificationCenterService,
  ) {}

  /** Sino: notificacoes do usuario logado (+ contagem de nao lidas). */
  @Get('inbox')
  async inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query('take') take?: string,
  ) {
    const [items, unread] = await Promise.all([
      this.repository.findInbox(user.sub, false, take ? Number(take) : 20),
      this.repository.countUnread(user.sub),
    ]);
    return { items, unread };
  }

  @Post('inbox/:id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const notif = await this.repository.findInAppById(id);
    if (!notif || (notif.user_id && notif.user_id !== user.sub)) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    return this.repository.markRead(id);
  }

  @Post('inbox/read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.repository.markAllRead(user.sub);
  }

  /** Log de entrega do Notification Center. */
  @Get('log')
  @RequirePermissions(PERMISSIONS.AUTOMATION_NOTIFICATIONS_READ)
  async log(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const [total, items] = await this.repository.findLog(
      take ? Number(take) : 50,
      skip ? Number(skip) : 0,
    );
    return { total, items };
  }

  /** Envio manual (teste do hub) — perm de leitura de notificacoes + write de templates nao exigida; util em suporte. */
  @Post('send')
  @RequirePermissions(PERMISSIONS.AUTOMATION_NOTIFICATIONS_READ)
  send(
    @Body() body: {
      recipient: { phone?: string; email?: string; user_id?: string };
      template_id?: string;
      title?: string;
      content?: string;
      channel?: 'whatsapp' | 'email' | 'in_app';
    },
  ) {
    return this.center.notify({
      recipient: body.recipient ?? {},
      templateId: body.template_id,
      title: body.title,
      body: body.content,
      channel: body.channel,
    });
  }
}
