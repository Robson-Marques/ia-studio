// Inbound YCloud (Checkpoint 2b): normaliza os eventos do webhook YCloud e
// persiste na MESMA inbox do WhatsApp (comm_whatsapp_chats/messages), publicando
// o evento de automação (WHATSAPP_INBOUND_EVENT) SOMENTE para mensagens vivas do
// cliente. Coexistência: eventos de histórico compartilhado (sync) entram na
// conversa mas NUNCA disparam IA/automação (isHistory = não publica o evento).
import { Injectable, Logger } from '@nestjs/common';
import { CommMessageDirection, Connection, IntegrationDirection, IntegrationLogStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { ChatAssignmentService } from '../attendance/chat-assignment.service';
import { IntegrationLogsRepository } from '../../integration/connections/integration-logs.repository';
import { WHATSAPP_INBOUND_EVENT } from './whatsapp-inbound.service';
import { normalizePhoneFromWhatsApp } from './whatsapp.helpers';
import { WhatsappMessageType } from '../../../shared/integration/whatsapp.types';

// Tipos de evento YCloud (doc oficial docs.ycloud.com).
const EV_INBOUND = 'whatsapp.inbound_message.received';
const EV_UPDATED = 'whatsapp.message.updated';
// Coexistência / histórico compartilhado: past + business-sent sync.
const EV_HISTORY = new Set<string>([
  'whatsapp.business_app.sync_history_message',
  'whatsapp.business_app.sent_message_sync',
]);

interface YCloudEvent {
  type?: string;
  id?: string;
  whatsappInboundMessage?: Record<string, unknown>;
  whatsappMessage?: Record<string, unknown>;
}

interface NormalizedYCloud {
  externalId: string;
  customerPhone: string;
  businessPhone: string;
  direction: CommMessageDirection;
  type: WhatsappMessageType;
  content: string;
  media?: Record<string, unknown>;
  contactName?: string | null;
  ts: Date;
}

@Injectable()
export class WhatsappYcloudInboundService {
  private readonly logger = new Logger(WhatsappYcloudInboundService.name);

  constructor(
    private readonly chats: WhatsappChatsRepository,
    private readonly assignment: ChatAssignmentService,
    private readonly integrationLogs: IntegrationLogsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async handleEvent(connection: Connection, body: unknown): Promise<void> {
    const event = (body ?? {}) as YCloudEvent;
    const type = event.type ?? '';

    if (type === EV_INBOUND && event.whatsappInboundMessage) {
      const n = this.normalize(event.whatsappInboundMessage, CommMessageDirection.INCOMING, event.id);
      if (n) await this.persist(connection, n, { history: false });
      return;
    }

    if (EV_HISTORY.has(type)) {
      // Histórico compartilhado: pode vir uma mensagem recebida antiga
      // (whatsappInboundMessage) ou uma enviada pelo dono do número
      // (whatsappMessage). Entra na conversa, mas SEM disparar automação.
      const inbound = event.whatsappInboundMessage
        ? this.normalize(event.whatsappInboundMessage, CommMessageDirection.INCOMING, event.id)
        : null;
      const sent = event.whatsappMessage
        ? this.normalize(event.whatsappMessage, CommMessageDirection.OUTGOING, event.id)
        : null;
      const n = inbound ?? sent;
      if (n) await this.persist(connection, n, { history: true });
      return;
    }

    if (type === EV_UPDATED && event.whatsappMessage) {
      await this.handleStatus(connection, event.whatsappMessage, event.id);
      return;
    }

    // Demais eventos: registra a chegada e ignora.
    await this.integrationLogs.record({
      organizationId: connection.organization_id,
      connectionId: connection.id,
      direction: IntegrationDirection.INBOUND,
      operation: `webhook:ycloud:${type || 'desconhecido'}`,
      status: IntegrationLogStatus.SUCCESS,
      responseMeta: { type },
    });
  }

  // ─── Normalização ───────────────────────────────────

  private normalize(
    item: Record<string, unknown>,
    direction: CommMessageDirection,
    eventId?: string,
  ): NormalizedYCloud | null {
    const from = normalizePhoneFromWhatsApp(String(item['from'] ?? ''));
    const to = normalizePhoneFromWhatsApp(String(item['to'] ?? ''));
    // Para INCOMING, o cliente é o `from`; para OUTGOING (enviada pelo número), é o `to`.
    const customerPhone = direction === CommMessageDirection.INCOMING ? from : to;
    const businessPhone = direction === CommMessageDirection.INCOMING ? to : from;
    if (!customerPhone) return null;

    const externalId = String(item['wamid'] ?? item['id'] ?? eventId ?? '') || `ycloud_${randomUUID()}`;
    const type = this.mapType(String(item['type'] ?? 'text'));
    const media = this.mediaOf(item, type);
    const content = this.contentOf(item, type, media);
    const profile = item['customerProfile'] as { name?: string; username?: string } | undefined;
    const rawTs = item['sendTime'];
    const ts = rawTs ? new Date(String(rawTs)) : new Date();

    return {
      externalId,
      customerPhone,
      businessPhone,
      direction,
      type,
      content,
      media,
      contactName: profile?.name ?? profile?.username ?? null,
      ts: isNaN(ts.getTime()) ? new Date() : ts,
    };
  }

  private mapType(t: string): WhatsappMessageType {
    const allowed = new Set<WhatsappMessageType>([
      'text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'interactive',
    ]);
    return allowed.has(t as WhatsappMessageType) ? (t as WhatsappMessageType) : 'text';
  }

  private mediaOf(item: Record<string, unknown>, type: WhatsappMessageType): Record<string, unknown> | undefined {
    if (!['image', 'audio', 'video', 'document', 'sticker'].includes(type)) return undefined;
    const node = item[type] as Record<string, unknown> | undefined;
    if (!node) return undefined;
    return {
      media_id: node['id'] ?? null,
      mime_type: node['mime_type'] ?? node['mimeType'] ?? 'application/octet-stream',
      filename: node['filename'] ?? undefined,
      caption: node['caption'] ?? undefined,
      // A YCloud entrega a mídia por link temporário (baixado depois com X-API-Key).
      url: node['link'] ?? undefined,
    };
  }

  private contentOf(item: Record<string, unknown>, type: WhatsappMessageType, media?: Record<string, unknown>): string {
    if (type === 'text') {
      const text = item['text'] as { body?: string } | undefined;
      return text?.body ?? '';
    }
    if (media?.caption) return String(media.caption);
    if (media?.filename) return String(media.filename);
    return `[${type}]`;
  }

  // ─── Persistência ───────────────────────────────────

  private async persist(connection: Connection, n: NormalizedYCloud, opts: { history: boolean }): Promise<void> {
    // Idempotência: o mesmo wamid nunca duplica (reentrega / histórico repetido).
    const existing = await this.chats.findMessageByExternalId(n.externalId);
    if (existing) return;

    // Para HISTÓRICO, não movemos a janela de 24h nem reordenamos conversas já
    // existentes: só criamos o chat se ele ainda não existe (para a mensagem ter
    // um chat_id). Para mensagem VIVA do cliente, o upsert atualiza resumo + janela.
    let chatId: string;
    if (opts.history) {
      const existingChat = await this.chats.findChatByConnectionPhone(connection.id, n.customerPhone);
      if (existingChat) {
        chatId = existingChat.id;
      } else {
        const created = await this.chats.upsertChat({
          organizationId: connection.organization_id,
          workspaceId: connection.workspace_id,
          environmentId: connection.environment_id,
          connectionId: connection.id,
          phone: n.customerPhone,
          contactName: n.contactName,
          lastMessage: n.content || `[${n.type}]`,
          direction: CommMessageDirection.OUTGOING, // não bumpa janela de 24h
        });
        chatId = created.id;
      }
    } else {
      const chat = await this.chats.upsertChat({
        organizationId: connection.organization_id,
        workspaceId: connection.workspace_id,
        environmentId: connection.environment_id,
        connectionId: connection.id,
        phone: n.customerPhone,
        contactName: n.contactName,
        lastMessage: n.content || `[${n.type}]`,
        direction: n.direction,
        inboundAt: n.direction === CommMessageDirection.INCOMING ? n.ts : undefined,
      });
      chatId = chat.id;
    }

    await this.chats.createMessage({
      organization_id: connection.organization_id,
      chat_id: chatId,
      connection_id: connection.id,
      external_id: n.externalId,
      direction: n.direction,
      // Enviada pelo dono do número (histórico/coexistência) = 'system'; recebida = 'contact'.
      sender: n.direction === CommMessageDirection.OUTGOING ? 'system' : 'contact',
      type: n.type,
      content: n.content,
      // media é Json do Prisma (InputJsonValue): o Record<string,unknown> não
      // casa direto — cast explícito, undefined quando não há mídia.
      media: n.media ? (n.media as Prisma.InputJsonValue) : undefined,
      status: n.direction === CommMessageDirection.INCOMING ? 'received' : 'sent',
    });

    // Histórico compartilhado NUNCA dispara automação/IA (regra de coexistência).
    if (opts.history) return;

    // Conversa encerrada + cliente voltou a falar → reabre (SYSTEM).
    if (n.direction === CommMessageDirection.INCOMING) {
      await this.assignment.reopenByInbound(connection.organization_id, chatId).catch(() => null);

      await this.eventBus.publish({
        event: WHATSAPP_INBOUND_EVENT,
        organization_id: connection.organization_id,
        workspace_id: connection.workspace_id,
        environment_id: connection.environment_id,
        trace_id: randomUUID(),
        source_event_id: n.externalId,
        occurred_at: n.ts.toISOString(),
        payload: {
          chat_id: chatId,
          connection_id: connection.id,
          phone: n.customerPhone,
          type: n.type,
          content: n.content,
          external_id: n.externalId,
          contact_name: n.contactName ?? null,
          handler_type: null,
        },
      });
    }
  }

  // ─── ACK (whatsapp.message.updated) ─────────────────

  private async handleStatus(connection: Connection, item: Record<string, unknown>, eventId?: string): Promise<void> {
    const externalId = String(item['wamid'] ?? item['id'] ?? eventId ?? '');
    const status = String(item['status'] ?? '');
    if (!externalId || !status) return;
    const allowed = new Set(['sent', 'delivered', 'read', 'failed']);
    if (!allowed.has(status)) return;
    const errorDetail = status === 'failed'
      ? String(item['errorMessage'] ?? item['errorCode'] ?? 'falha na entrega')
      : undefined;
    await this.chats.updateMessageStatusByExternalId(externalId, status, errorDetail);
    if (status === 'failed') {
      this.logger.warn(`YCloud: entrega FALHOU wamid=${externalId} detalhe=${errorDetail ?? 'desconhecido'}`);
    }
  }
}
