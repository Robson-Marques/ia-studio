// Inbox inbound: processa o payload validado do webhook Meta de UMA conexao —
// persiste chat/mensagem (unread + last_inbound_at, base da janela de 24h),
// reabre conversa CLOSED (SYSTEM), atualiza ACKs (sent/delivered/read/failed),
// sincroniza status de template e PUBLICA o evento 'whatsapp.inbound.message'
// no Event Bus (Fase 4 — diretriz 7): persistencia + replay + broker pros
// workers, mantendo a emissao EventEmitter2 (compat) por dentro do bus.
import { Injectable, Logger } from '@nestjs/common';
import { CommMessageDirection, Connection, IntegrationDirection, IntegrationLogStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { WhatsappMediaService } from './whatsapp-media.service';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { WhatsappTemplatesRepository } from './whatsapp-templates.repository';
import { ChatAssignmentService } from '../attendance/chat-assignment.service';
import { IntegrationLogsRepository } from '../../integration/connections/integration-logs.repository';
import {
  extractInboundMedia,
  extractMessageText,
  normalizeMessageType,
  normalizePhoneFromWhatsApp,
} from './whatsapp.helpers';

export const WHATSAPP_INBOUND_EVENT = 'whatsapp.inbound.message';

interface WebhookValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<Record<string, unknown>>;
  statuses?: Array<{
    id?: string;
    status?: string;
    recipient_id?: string;
    errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
  }>;
  // message_template_status_update
  event?: string;
  message_template_id?: string | number;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
  // message_template_quality_update / template_category_update
  new_quality_score?: string;
  quality_score?: string;
  new_category?: string;
  previous_category?: string;
}

@Injectable()
export class WhatsappInboundService {
  private readonly logger = new Logger(WhatsappInboundService.name);

  constructor(
    private readonly chats: WhatsappChatsRepository,
    private readonly templates: WhatsappTemplatesRepository,
    private readonly assignment: ChatAssignmentService,
    private readonly integrationLogs: IntegrationLogsRepository,
    private readonly eventBus: EventBusService,
    private readonly mediaStorage: WhatsappMediaService,
  ) {}

  /** Processa um "change" do webhook já roteado pra conexao dona do numero. */
  async handleChange(connection: Connection, field: string, value: WebhookValue): Promise<void> {
    if (field === 'messages') {
      await this.handleMessages(connection, value);
      await this.handleStatuses(connection, value);
      return;
    }
    if (field === 'message_template_status_update') {
      await this.handleTemplateStatus(connection, value);
      return;
    }
    if (field === 'message_template_quality_update') {
      await this.handleTemplateQuality(connection, value);
      return;
    }
    if (field === 'template_category_update') {
      await this.handleTemplateCategory(connection, value);
      return;
    }
    // Demais campos (phone_number_quality_update, account_update...) são
    // absorvidos pelo sync contínuo (~10 min); registra a chegada no log.
    await this.integrationLogs.record({
      organizationId: connection.organization_id,
      connectionId: connection.id,
      direction: IntegrationDirection.INBOUND,
      operation: `webhook:${field}`,
      status: IntegrationLogStatus.SUCCESS,
      responseMeta: { field },
    });
  }

  // ─── Mensagens recebidas ────────────────────────────

  private async handleMessages(connection: Connection, value: WebhookValue): Promise<void> {
    const messages = value.messages ?? [];
    const contactName = value.contacts?.[0]?.profile?.name ?? null;

    for (const raw of messages) {
      const externalId = typeof raw['id'] === 'string' ? (raw['id'] as string) : null;
      const from = normalizePhoneFromWhatsApp(typeof raw['from'] === 'string' ? (raw['from'] as string) : '');
      if (!externalId || !from) continue;

      // Idempotencia: a Meta reentrega webhooks — mesmo wamid nao duplica.
      const existing = await this.chats.findMessageByExternalId(externalId);
      if (existing) continue;

      const content = extractMessageText(raw as never);
      const type = normalizeMessageType(typeof raw['type'] === 'string' ? (raw['type'] as string) : undefined);
      const media = extractInboundMedia(raw as never);
      const ts = typeof raw['timestamp'] === 'string' ? new Date(Number(raw['timestamp']) * 1000) : new Date();

      const chat = await this.chats.upsertChat({
        organizationId: connection.organization_id,
        workspaceId: connection.workspace_id,
        environmentId: connection.environment_id,
        connectionId: connection.id,
        phone: from,
        contactName,
        lastMessage: content || (media ? `[${type}]` : ''),
        direction: CommMessageDirection.INCOMING,
        inboundAt: ts,
      });

      const createdMessage = await this.chats.createMessage({
        organization_id: connection.organization_id,
        chat_id: chat.id,
        connection_id: connection.id,
        external_id: externalId,
        direction: CommMessageDirection.INCOMING,
        sender: 'contact',
        type,
        content,
        media: media ? { ...media } : undefined,
        status: 'received',
      });

      // Copia a mídia enquanto a URL do provedor ainda está disponível.
      // Falhas são registradas, mantendo o histórico e permitindo retry pela interface.
      if (media?.media_id) await this.mediaStorage.persistBestEffort(createdMessage);

      // Conversa encerrada + cliente voltou a falar → reabre (SYSTEM).
      await this.assignment.reopenByInbound(connection.organization_id, chat.id).catch(() => null);

      // Evento no envelope padrao (diretriz 7) via Event Bus (Fase 4):
      // persiste (dedup por wamid), emite no EventEmitter2 (compat com os
      // assinantes sincronos) e enfileira no broker pros workers.
      await this.eventBus.publish({
        event: WHATSAPP_INBOUND_EVENT,
        organization_id: connection.organization_id,
        workspace_id: connection.workspace_id,
        environment_id: connection.environment_id,
        trace_id: randomUUID(),
        source_event_id: externalId,
        occurred_at: ts.toISOString(),
        payload: {
          chat_id: chat.id,
          connection_id: connection.id,
          phone: from,
          type,
          content,
          // Id da mensagem (wamid) — o nó Assistente usa pra DEBOUNCE: só
          // responde se nenhuma mensagem mais nova chegou nesta conversa.
          external_id: externalId,
          // Nome do contato e quem atende agora (USER = humano no teclado,
          // BOT = IA, null = ninguém). O fluxo "IA responde no WhatsApp" usa
          // handler_type numa condição pra NÃO responder por cima de um humano
          // — mantém o executor genérico (o gate vira dado, não regra de domínio).
          contact_name: chat.contact_name ?? contactName ?? null,
          handler_type: chat.current_handler_type ?? null,
        },
      });
    }
  }

  // ─── ACKs (sent/delivered/read/failed) ──────────────

  private async handleStatuses(connection: Connection, value: WebhookValue): Promise<void> {
    const statuses = value.statuses ?? [];
    for (const s of statuses) {
      if (!s?.id || !s?.status) continue;
      const allowed = new Set(['sent', 'delivered', 'read', 'failed']);
      if (!allowed.has(s.status)) continue;
      const firstError = Array.isArray(s.errors) ? s.errors[0] : undefined;
      const errorDetail = firstError
        ? `${firstError.code ?? ''} ${firstError.error_data?.details ?? firstError.message ?? firstError.title ?? ''}`.trim()
        : null;
      await this.chats.updateMessageStatusByExternalId(s.id, s.status, s.status === 'failed' ? errorDetail : undefined);

      if (s.status === 'failed') {
        this.logger.warn(
          `Entrega FALHOU wamid=${s.id} recipient=${s.recipient_id} detalhe=${errorDetail ?? 'desconhecido'}`,
        );
        await this.integrationLogs.record({
          organizationId: connection.organization_id,
          connectionId: connection.id,
          direction: IntegrationDirection.INBOUND,
          operation: 'webhook:message_failed',
          status: IntegrationLogStatus.FAILURE,
          error: errorDetail ?? 'falha na entrega',
          responseMeta: { wamid: s.id, recipient: s.recipient_id },
        });
      }
    }
  }

  // ─── Status de template (aprovado/rejeitado na Meta) ─

  private async handleTemplateStatus(connection: Connection, value: WebhookValue): Promise<void> {
    const name = value.message_template_name;
    const language = value.message_template_language ?? 'pt_BR';
    const event = (value.event ?? '').toUpperCase();
    if (!name || !event) return;
    const statusMap: Record<string, 'APPROVED' | 'REJECTED' | 'PENDING' | 'PAUSED' | 'DISABLED'> = {
      APPROVED: 'APPROVED',
      REJECTED: 'REJECTED',
      PENDING: 'PENDING',
      PAUSED: 'PAUSED',
      DISABLED: 'DISABLED',
    };
    const status = statusMap[event];
    if (!status) return;
    await this.templates.updateStatusByName(connection.id, name, language, status, value.reason ?? null);
    await this.integrationLogs.record({
      organizationId: connection.organization_id,
      connectionId: connection.id,
      direction: IntegrationDirection.INBOUND,
      operation: 'webhook:template_status',
      status: IntegrationLogStatus.SUCCESS,
      responseMeta: { template: name, language, status, reason: value.reason ?? null },
    });
  }

  // ─── Qualidade do template (GREEN/YELLOW/RED) ────────

  private async handleTemplateQuality(connection: Connection, value: WebhookValue): Promise<void> {
    const name = value.message_template_name;
    const language = value.message_template_language ?? 'pt_BR';
    const quality = String(value.new_quality_score ?? value.quality_score ?? '').toUpperCase();
    if (!name || !['GREEN', 'YELLOW', 'RED', 'UNKNOWN'].includes(quality)) return;
    await this.templates.updateMetaFieldsByName(connection.id, name, language, { quality });
    await this.integrationLogs.record({
      organizationId: connection.organization_id,
      connectionId: connection.id,
      direction: IntegrationDirection.INBOUND,
      operation: 'webhook:template_quality',
      status: IntegrationLogStatus.SUCCESS,
      responseMeta: { template: name, language, quality },
    });
  }

  // ─── Categoria trocada pela Meta ─────────────────────

  private async handleTemplateCategory(connection: Connection, value: WebhookValue): Promise<void> {
    const name = value.message_template_name;
    const language = value.message_template_language ?? 'pt_BR';
    const category = String(value.new_category ?? '').toUpperCase();
    if (!name || !['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) return;
    await this.templates.updateMetaFieldsByName(connection.id, name, language, { category });
    await this.integrationLogs.record({
      organizationId: connection.organization_id,
      connectionId: connection.id,
      direction: IntegrationDirection.INBOUND,
      operation: 'webhook:template_category',
      status: IntegrationLogStatus.SUCCESS,
      responseMeta: { template: name, language, category, previous: value.previous_category ?? null },
    });
  }
}
