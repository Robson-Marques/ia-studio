// Notification Center (diretriz 22) — hub UNICO: a automacao chama so
// notify(); o hub resolve o canal (explicito > preferencia do destinatario
// [reservado pra fase futura] > fallback whatsapp → email → in-app), usa o
// Catalogo de Templates (diretriz 11) e registra tudo em
// automation_notification_log. Entrega assincrona via broker
// (QUEUES.NOTIFICATIONS) — retry/backoff de graca.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { TemplatesService } from '../templates/templates.service';
import { WhatsappOrchestratorService } from '../../comm/whatsapp/whatsapp-orchestrator.service';
import { EmailOrchestratorService } from '../../comm/email/email-orchestrator.service';
import { IMessageBroker, MESSAGE_BROKER, QUEUES } from '../../../shared/broker/message-broker.interface';

export type NotificationChannel = 'whatsapp' | 'email' | 'in_app';

export interface NotifyArgs {
  recipient: { phone?: string; email?: string; user_id?: string };
  /** Template do catalogo (diretriz 11) — renderizado com `data`. */
  templateId?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  /** Canal explicito; ausente = resolucao automatica com fallback. */
  channel?: NotificationChannel;
  traceId?: string;
  /** Simulacao (diretriz 27): nao entrega, so loga SIMULATED. */
  dryRun?: boolean;
}

export interface NotifyResult {
  channel: NotificationChannel | null;
  status: 'SENT' | 'FAILED' | 'SKIPPED' | 'SIMULATED' | 'QUEUED';
  detail?: string;
}

@Injectable()
export class NotificationCenterService {
  private readonly logger = new Logger(NotificationCenterService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly templates: TemplatesService,
    private readonly whatsapp: WhatsappOrchestratorService,
    private readonly email: EmailOrchestratorService,
    @Inject(MESSAGE_BROKER) private readonly broker: IMessageBroker,
  ) {}

  /** Porta publica: enfileira a entrega (worker processa — diretriz 33). */
  async notify(args: NotifyArgs): Promise<NotifyResult> {
    if (args.dryRun) {
      await this.log(args, this.resolveChannel(args), 'SIMULATED', 'dry-run: entrega simulada.');
      return { channel: this.resolveChannel(args), status: 'SIMULATED' };
    }
    await this.broker.enqueue(QUEUES.NOTIFICATIONS, 'deliver', args, {});
    return { channel: this.resolveChannel(args), status: 'QUEUED' };
  }

  /** Entrega efetiva — chamada pelo processor da fila. */
  async deliver(args: NotifyArgs): Promise<NotifyResult> {
    const channel = this.resolveChannel(args);
    if (!channel) {
      await this.log(args, null, 'SKIPPED', 'Nenhum destinatário utilizável (informe phone, email ou user_id).');
      return { channel: null, status: 'SKIPPED' };
    }

    const content = await this.resolveContent(args);

    // Cadeia de fallback (diretriz 22): canal preferido → proximos viaveis.
    const chain: NotificationChannel[] = [channel, ...this.fallbacksAfter(channel, args)];
    let lastDetail = '';
    for (const ch of chain) {
      const result = await this.deliverVia(ch, args, content);
      if (result.status === 'SENT') return result;
      lastDetail = result.detail ?? '';
      if (result.status === 'SKIPPED') continue;
    }
    return { channel, status: 'FAILED', detail: lastDetail || 'Todos os canais falharam.' };
  }

  // ─── Privados ───────────────────────────────────────

  private resolveChannel(args: NotifyArgs): NotificationChannel | null {
    if (args.channel) return args.channel;
    // Preferencia do destinatario: reservado (nao ha cadastro de preferencia
    // na Fase 4) — segue direto pro fallback padrao.
    if (args.recipient.phone) return 'whatsapp';
    if (args.recipient.email) return 'email';
    if (args.recipient.user_id !== undefined) return 'in_app';
    return null;
  }

  private fallbacksAfter(channel: NotificationChannel, args: NotifyArgs): NotificationChannel[] {
    const out: NotificationChannel[] = [];
    if (channel === 'whatsapp' && args.recipient.email) out.push('email');
    if (channel !== 'in_app' && args.recipient.user_id !== undefined) out.push('in_app');
    return out;
  }

  private async resolveContent(args: NotifyArgs): Promise<{ title: string; body: string }> {
    if (args.templateId) {
      try {
        const rendered = await this.templates.render(args.templateId, args.data ?? {});
        return { title: rendered.subject ?? args.title ?? 'Notificação', body: rendered.body };
      } catch (e) {
        this.logger.warn(`Template ${args.templateId} indisponível (${(e as Error).message}) — usando conteúdo direto.`);
      }
    }
    return { title: args.title ?? 'Notificação', body: args.body ?? '' };
  }

  private async deliverVia(
    channel: NotificationChannel,
    args: NotifyArgs,
    content: { title: string; body: string },
  ): Promise<NotifyResult> {
    try {
      if (channel === 'whatsapp') {
        if (!args.recipient.phone) return { channel, status: 'SKIPPED', detail: 'sem telefone' };
        await this.whatsapp.send(
          {
            phone: args.recipient.phone,
            sender: 'system',
          },
          { kind: 'text', body: content.body || content.title },
        );
        await this.log(args, channel, 'SENT');
        return { channel, status: 'SENT' };
      }

      if (channel === 'email') {
        if (!args.recipient.email) return { channel, status: 'SKIPPED', detail: 'sem e-mail' };
        // Entrega real via Email Orchestrator (Gmail/SMTP). Sem conexão de e-mail
        // ativa no escopo, o orchestrator lança e o fallback (in_app) assume.
        const hasHtml = /</.test(content.body);
        await this.email.send(
          {
            to: args.recipient.email,
            subject: content.title || 'Notificação',
            html: hasHtml ? content.body : undefined,
            text: hasHtml ? undefined : content.body || content.title,
          },
        );
        await this.log(args, channel, 'SENT');
        return { channel, status: 'SENT' };
      }

      // in_app — sino do painel (user_id null = broadcast da instância).
      await this.repository.createInApp({
        user_id: args.recipient.user_id || null,
        title: content.title,
        body: content.body,
      });
      await this.log(args, channel, 'SENT');
      return { channel, status: 'SENT' };
    } catch (e) {
      const detail = (e as Error).message;
      await this.log(args, channel, 'FAILED', detail);
      return { channel, status: 'FAILED', detail };
    }
  }

  private async log(
    args: NotifyArgs,
    channel: NotificationChannel | null,
    status: string,
    detail?: string,
  ): Promise<void> {
    await this.repository
      .createLog({
        channel: channel ?? 'none',
        recipient: args.recipient.phone ?? args.recipient.email ?? args.recipient.user_id ?? null,
        template_id: args.templateId ?? null,
        status,
        detail,
        trace_id: args.traceId ?? null,
      })
      .catch((e) => this.logger.warn(`Falha ao logar notificação: ${(e as Error).message}`));
  }
}
