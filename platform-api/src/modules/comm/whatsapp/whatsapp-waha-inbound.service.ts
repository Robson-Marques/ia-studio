import { Injectable, Logger } from '@nestjs/common';
import { CommMessageDirection, Connection, IntegrationDirection, IntegrationLogStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EventBusService } from '../../../shared/events/event-bus.service';
import {
  WahaRefs, encodeWahaMediaRef, getWahaContactName, getWahaPhoneByLid, normalizeWahaChatId, resolveWahaRuntime, restartWahaSession,
} from '../../../shared/integration/waha.client';
import { WhatsappMessageType } from '../../../shared/integration/whatsapp.types';
import { classifyWahaCause, extractWahaReason, shouldAutoRecover, wahaDownDetail } from './waha-session-diagnostics';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { IntegrationLogsRepository } from '../../integration/connections/integration-logs.repository';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { ChatAssignmentService } from '../attendance/chat-assignment.service';
import { WHATSAPP_INBOUND_EVENT } from './whatsapp.events';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { WhatsappMediaStoreService } from './whatsapp-media-store.service';
import { normalizePhoneFromWhatsApp } from './whatsapp.helpers';

interface WahaEvent {
  event?: string;
  payload?: Record<string, unknown>;
  me?: { id?: string; lid?: string; pushName?: string } | null;
}

@Injectable()
export class WhatsappWahaInboundService {
  private readonly logger = new Logger(WhatsappWahaInboundService.name);
  constructor(
    private readonly chats: WhatsappChatsRepository,
    private readonly assignment: ChatAssignmentService,
    private readonly events: EventBusService,
    private readonly connections: ConnectionsRepository,
    private readonly logs: IntegrationLogsRepository,
    private readonly secrets: SecretsService,
    private readonly mediaStore: WhatsappMediaStoreService,
  ) {}

  async handleEvent(connection: Connection, body: unknown): Promise<void> {
    const event = (body ?? {}) as WahaEvent;
    if (event.event === 'message' || event.event === 'message.any') {
      return this.message(connection, event.payload ?? {}, event.me);
    }
    if (event.event === 'message.reaction') return this.reaction(connection, event.payload ?? {});
    if (event.event === 'message.ack') return this.ack(connection, event.payload ?? {});
    if (event.event === 'session.status') return this.sessionStatus(connection, event.payload ?? {}, event.me);
    await this.logs.record({
      connectionId: connection.id, direction: IntegrationDirection.INBOUND,
      operation: `webhook:waha:${event.event ?? 'unknown'}`, status: IntegrationLogStatus.SUCCESS,
    });
  }

  private async message(
    connection: Connection,
    payload: Record<string, unknown>,
    me?: WahaEvent['me'],
  ): Promise<void> {
    const fromMe = payload['fromMe'] === true;
    const ownIds = new Set([me?.id, me?.lid].filter((value): value is string => typeof value === 'string' && !!value));
    const candidates = [
      payload['chatId'],
      fromMe ? payload['to'] : payload['from'],
      fromMe ? payload['from'] : payload['to'],
    ];
    const candidate = candidates.find((value) => typeof value === 'string' && value && !ownIds.has(value));
    const rawChatAddress = typeof candidate === 'string' ? candidate : '';
    if (
      rawChatAddress.endsWith('@g.us') || rawChatAddress.endsWith('@newsletter') ||
      rawChatAddress.endsWith('@broadcast') || rawChatAddress === 'status@broadcast'
    ) return;
    const chatAddress = rawChatAddress ? normalizeWahaChatId(rawChatAddress) : '';
    if (!chatAddress) return;
    const provisionalPhone = normalizePhoneFromWhatsApp(chatAddress);
    const refs = await this.refs(connection);
    const resolvedPhone = chatAddress.endsWith('@lid')
      ? await getWahaPhoneByLid(refs, chatAddress).catch((error) => {
          this.logger.warn(`Não foi possível resolver o LID ${chatAddress}: ${(error as Error).message}`);
          return null;
        })
      : null;
    const phone = resolvedPhone || provisionalPhone;
    if (!phone) return;
    const idNode = payload['id'];
    const externalId = typeof idNode === 'string'
      ? idNode
      : String((idNode as Record<string, unknown> | undefined)?.['_serialized'] ?? randomUUID());

    const mediaNode = payload['media'] as Record<string, unknown> | undefined;
    const webhookMediaUrl = typeof mediaNode?.['url'] === 'string' ? mediaNode['url'] : undefined;
    const rawNode = payload['_data'] as Record<string, unknown> | undefined;
    const mime = String(mediaNode?.['mimetype'] ?? rawNode?.['mimetype'] ?? 'application/octet-stream');
    const type = this.typeOf(payload, mime);
    const hasMedia = payload['hasMedia'] === true || !!mediaNode ||
      ['image', 'audio', 'video', 'document', 'sticker'].includes(type);
    const content = String(payload['body'] ?? '');
    const preview = content || (hasMedia ? `[${type}]` : '');
    const rawTs = Number(payload['timestamp'] ?? 0);
    const timestamp = rawTs > 0
      ? new Date(rawTs < 10_000_000_000 ? rawTs * 1000 : rawTs)
      : new Date();
    const rawData = payload['_data'] && typeof payload['_data'] === 'object'
      ? payload['_data'] as Record<string, unknown>
      : {};
    const payloadName = [payload['pushName'], payload['notifyName'], rawData['notifyName'], rawData['pushName']]
      .find((value) => typeof value === 'string' && value.trim());
    const notifyName = typeof payloadName === 'string'
      ? payloadName.trim().slice(0, 255)
      : await getWahaContactName(refs, chatAddress).catch((error) => {
          this.logger.warn(`Não foi possível carregar o nome de ${chatAddress}: ${(error as Error).message}`);
          return null;
        });
    const remoteHistory = {
      waha_chat_id: chatAddress,
      ...(chatAddress.endsWith('@lid') ? { whatsapp_lid: chatAddress } : {}),
      ...(resolvedPhone ? { resolved_phone: resolvedPhone } : {}),
    } as Prisma.InputJsonValue;
    if (resolvedPhone && provisionalPhone !== resolvedPhone) {
      await this.chats.reconcileWahaChatIdentity({
        connectionId: connection.id,
        provisionalPhone,
        phone: resolvedPhone,
        contactName: notifyName,
        remoteHistory,
      });
    }
    const existing = await this.chats.findMessageByConnectionExternalId(connection.id, externalId);
    if (existing) {
      // O POST de envio grava uma bolha imediatamente, mas somente o
      // `message.any` conhece o par chatId+messageId definitivo que a WAHA
      // aceita no download. Reconciliar o eco evita manter a referência
      // provisória e vale igualmente para imagem, áudio, vídeo e documento.
      if (fromMe && hasMedia) {
        const updated = await this.chats.reconcileWahaMediaEcho(existing.id, {
          type,
          content,
          status: 'sent',
          occurredAt: timestamp,
          media: {
            media_id: encodeWahaMediaRef(chatAddress, externalId),
            ...((existing.media && typeof existing.media === 'object' && !Array.isArray(existing.media) && typeof (existing.media as Record<string, unknown>)['storage_file_id'] === 'string')
              ? { storage_file_id: (existing.media as Record<string, unknown>)['storage_file_id'] as string }
              : {}),
            mime_type: mime,
            ...((mediaNode?.['filename'] ?? rawNode?.['filename'])
              ? { filename: String(mediaNode?.['filename'] ?? rawNode?.['filename']) }
              : {}),
            ...(content ? { caption: content } : {}),
          } as Prisma.InputJsonValue,
        });
        await this.mediaStore.persistWahaBestEffort(updated, webhookMediaUrl);
      }
      if (hasMedia && !fromMe) await this.mediaStore.persistWahaBestEffort(existing, webhookMediaUrl);
      if (!fromMe && !existing.inbound_event_published) {
        await this.publishInbound(connection, existing.chat_id, phone, externalId, timestamp, type, content, notifyName);
      }
      return;
    }
    const chat = await this.chats.upsertChat({
      connectionId: connection.id, phone,
      contactName: notifyName,
      remoteHistory,
      lastMessage: preview || `[${type}]`,
      direction: fromMe ? CommMessageDirection.OUTGOING : CommMessageDirection.INCOMING,
      inboundAt: fromMe ? undefined : timestamp,
    });
    const created = await this.chats.createMessage({
      chat_id: chat.id, connection_id: connection.id, external_id: externalId,
      direction: fromMe ? CommMessageDirection.OUTGOING : CommMessageDirection.INCOMING,
      sender: fromMe ? 'system' : 'contact', type,
      content, status: fromMe ? 'sent' : 'received', inbound_event_published: fromMe,
      occurred_at: timestamp, created_at: timestamp,
      media: hasMedia ? ({
        media_id: encodeWahaMediaRef(chatAddress, externalId),
        mime_type: mime,
        ...((mediaNode?.['filename'] ?? rawNode?.['filename'])
          ? { filename: String(mediaNode?.['filename'] ?? rawNode?.['filename']) }
          : {}),
        ...(content ? { caption: content } : {}),
      } as Prisma.InputJsonValue) : undefined,
    });
    if (!fromMe) {
      await this.publishInbound(connection, chat.id, phone, externalId, timestamp, type, content, notifyName);
    }
    if (hasMedia) await this.mediaStore.persistWahaBestEffort(created, webhookMediaUrl);
  }

  private async refs(connection: Connection): Promise<WahaRefs> {
    const config = (connection.config ?? {}) as Record<string, unknown>;
    const legacyApiKey = connection.secret_id
      ? (await this.secrets.accessorFor(connection.secret_id).get('api_key')) ?? ''
      : '';
    const runtime = resolveWahaRuntime(config, legacyApiKey);
    if (!runtime) throw new Error('Serviço WAHA local indisponível.');
    return { apiUrl: runtime.apiUrl, apiKey: runtime.apiKey, session: `iastudio-${connection.id}` };
  }

  private async publishInbound(
    connection: Connection,
    chatId: string,
    phone: string,
    externalId: string,
    timestamp: Date,
    type: WhatsappMessageType,
    content: string,
    notifyName: unknown,
  ): Promise<void> {
    await this.assignment.reopenByInbound(chatId).catch(() => null);
    const current = await this.chats.findChatById(chatId);
    const published = await this.events.publish({
      event: WHATSAPP_INBOUND_EVENT, trace_id: randomUUID(), source_event_id: `${connection.id}:${externalId}`,
      occurred_at: timestamp.toISOString(),
      payload: { chat_id: chatId, connection_id: connection.id, phone, type, content, external_id: externalId, contact_name: notifyName ?? null, handler_type: current?.current_handler_type ?? null },
    });
    if (!published.deduped && !published.event_log_id) {
      throw new Error(`Evento da mensagem WAHA ${externalId} não foi persistido.`);
    }
    await this.chats.markInboundEventPublished(connection.id, externalId);
  }

  private async reaction(connection: Connection, payload: Record<string, unknown>): Promise<void> {
    const reaction = payload['reaction'];
    if (!reaction || typeof reaction !== 'object' || Array.isArray(reaction)) return;
    const details = reaction as Record<string, unknown>;
    const targetMessageId = String(details['messageId'] ?? '');
    if (!targetMessageId) return;
    const emoji = typeof details['text'] === 'string' ? details['text'] : '';
    const rawId = payload['id'];
    const eventId = typeof rawId === 'string'
      ? rawId
      : String((rawId as Record<string, unknown> | undefined)?.['_serialized'] ?? randomUUID());
    const rawTs = Number(payload['timestamp'] ?? 0);
    const occurredAt = rawTs > 0
      ? new Date(rawTs < 10_000_000_000 ? rawTs * 1000 : rawTs)
      : new Date();
    await this.chats.upsertWahaReaction({
      connectionId: connection.id,
      targetMessageId,
      fromMe: payload['fromMe'] === true,
      emoji,
      eventId,
      occurredAt,
    });
  }

  private async ack(connection: Connection, payload: Record<string, unknown>): Promise<void> {
    const idNode = payload['id'];
    const id = typeof idNode === 'string' ? idNode : String((idNode as Record<string, unknown> | undefined)?.['_serialized'] ?? '');
    if (!id) return;
    const ack = String(payload['ackName'] ?? payload['ack'] ?? '').toUpperCase();
    const status: Record<string, string> = { SERVER: 'sent', DEVICE: 'delivered', READ: 'read', PLAYED: 'read', ERROR: 'failed' };
    if (status[ack]) {
      await this.chats.updateMessageStatusByConnectionExternalId(
        connection.id,
        id,
        status[ack],
        ack === 'ERROR' ? 'Falha informada pela WAHA.' : undefined,
      );
    }
  }

  private async sessionStatus(
    connection: Connection,
    payload: Record<string, unknown>,
    me?: { id?: string; pushName?: string } | null,
  ): Promise<void> {
    const value = String(payload['status'] ?? payload['name'] ?? '');
    const working = value === 'WORKING';
    const qrPending = ['SCAN_QR_CODE', 'PASSKEY_REQUIRED', 'PASSKEY_CONFIRMATION_REQUIRED'].includes(value);
    const transient = value === 'STARTING';
    const down = value === 'FAILED' || value === 'STOPPED';

    const current = (connection.config ?? {}) as Record<string, unknown>;
    const config: Record<string, unknown> = { ...current };
    const phone = String(me?.id ?? '').replace(/\D/g, '');
    if (phone) config['phone'] = phone;
    if (me?.pushName) config['display_name'] = me.pushName;

    // Diagnóstico da queda (item 6): preserva reason/event/código e os 3 estados
    // anteriores; nunca reduz a queda a um "offline" genérico.
    const diag = extractWahaReason(payload);
    const previousStates = Array.isArray(current['recent_states'])
      ? (current['recent_states'] as unknown[]).filter((s): s is string => typeof s === 'string') : [];
    const priorThree = previousStates.slice(0, 3);
    config['recent_states'] = [value, ...previousStates].slice(0, 6);

    // Diferenciação de causa (item 7).
    const cause = classifyWahaCause(diag);
    config['last_reason'] = diag.reason ?? null;
    config['last_cause'] = cause;

    // Recuperação automática (item 5): só em FAILED/STOPPED, sem logout, no máximo
    // 1x por sessão a cada 5 min. LoggedOut exige QR, TemporaryBan não pode
    // reconectar e ClientOutdated exige atualizar a imagem — esses não reiniciam.
    const lastRestart = typeof current['last_auto_restart_at'] === 'number'
      ? (current['last_auto_restart_at'] as number) : 0;
    const canRestart = Date.now() - lastRestart > 5 * 60 * 1000;
    const willRecover = down && shouldAutoRecover(cause) && canRestart;
    if (willRecover) config['last_auto_restart_at'] = Date.now();

    const detail = down ? wahaDownDetail(cause, diag.reason, value)
      : working ? 'WhatsApp conectado por QR Code.'
      : qrPending ? 'Aguardando leitura do QR Code.'
      : transient ? 'Reconectando a sessão WhatsApp…'
      : `Sessão WAHA: ${value || 'sem estado'}.`;

    const data: Prisma.ConnectionUpdateInput = {
      last_health_at: new Date(),
      last_health_ok: working ? true : (qrPending || transient) ? null : false,
      status_detail: detail,
      config: config as Prisma.InputJsonValue,
    };
    if (!['DISABLED', 'MAINTENANCE'].includes(connection.status)) {
      data.status = working ? 'ACTIVE'
        : (qrPending || cause === 'LoggedOut') ? 'PENDING_AUTH'
        : transient ? connection.status
        : 'ERROR';
      data.is_active = working;
      if (working && !connection.connected_at) data.connected_at = new Date();
    }
    await this.connections.update(connection.id, data);
    this.logger.log(`WAHA ${connection.id}: ${value}${cause ? ` (${cause})` : ''}`);

    // Alerta operacional com o diagnóstico completo (item 6), via Event Bus
    // (desacoplado — não acopla comm ao Notification Center, evita ciclo).
    if (down || cause) {
      await this.events.publish({
        event: 'whatsapp.waha.session.alert',
        trace_id: randomUUID(),
        source_event_id: `waha-session:${connection.id}:${value}:${diag.code ?? diag.event ?? 'na'}`,
        occurred_at: new Date().toISOString(),
        payload: {
          connection_id: connection.id,
          status: value,
          cause,
          reason: diag.reason ?? null,
          reason_event: diag.event ?? null,
          reason_message: diag.message ?? null,
          reason_code: diag.code ?? null,
          previous_states: priorThree,
        },
      }).catch((e) => this.logger.warn(`Alerta WAHA não publicado: ${(e as Error).message}`));
    }

    if (willRecover) {
      try {
        await restartWahaSession(await this.refs(connection));
        this.logger.log(`WAHA ${connection.id}: restart automático solicitado (${cause ?? value}).`);
      } catch (error) {
        this.logger.warn(`WAHA ${connection.id}: restart automático falhou: ${(error as Error).message}`);
      }
    }
  }

  private typeOf(payload: Record<string, unknown>, mime: string): WhatsappMessageType {
    const raw = String(payload['type'] ?? '').toLowerCase();
    if (raw.includes('image') || mime.startsWith('image/')) return 'image';
    if (raw.includes('audio') || raw.includes('ptt') || mime.startsWith('audio/')) return 'audio';
    if (raw.includes('video') || mime.startsWith('video/')) return 'video';
    if (raw.includes('document') || raw.includes('file')) return 'document';
    if (raw.includes('sticker')) return 'sticker';
    if (raw.includes('location')) return 'location';
    return 'text';
  }
}
