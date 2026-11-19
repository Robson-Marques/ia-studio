import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { NivooChat, NivooMessage, NivooWhatsappClient } from '../../../shared/integration/nivoo-whatsapp.client';
import { processorsEnabled } from '../../automation/worker/processors.gate';
import { ChatAssignmentService } from '../attendance/chat-assignment.service';
import { WHATSAPP_INBOUND_EVENT } from './whatsapp.events';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { NivooConnectionsService } from './nivoo-connections.service';
import { WhatsappTemplatesService } from './whatsapp-templates.service';

@Injectable()
export class NivooSyncService {
  private readonly logger = new Logger(NivooSyncService.name);
  private running = false;
  private lastFullScanAt = 0;
  private lastRecentScanAt = 0;

  constructor(
    private readonly connections: NivooConnectionsService,
    private readonly chats: WhatsappChatsRepository,
    private readonly assignment: ChatAssignmentService,
    private readonly events: EventBusService,
    private readonly templates: WhatsappTemplatesService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledTemplateSync(): Promise<void> {
    if (!processorsEnabled()) return;
    try {
      if (!await this.connections.isConfigured()) return;
      const linked = await this.connections.syncConnections();
      for (const { local, remote } of linked) {
        if (remote.status !== 'ACTIVE') continue;
        await this.templates.syncConnection(local);
      }
    } catch (error) {
      this.logger.error(`Sincronização dos modelos da Central falhou: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scheduledSync(): Promise<void> {
    if (!processorsEnabled() || this.running) return;
    this.running = true;
    try {
      await this.sync();
    } catch (error) {
      this.logger.error(`Sincronização da Central WhatsApp falhou: ${(error as Error).message}`);
      await this.chats.saveCentralCheckpoint(null, (error as Error).message);
    } finally {
      this.running = false;
    }
  }

  async sync(): Promise<{ chats: number; messages: number }> {
    const startedAt = new Date();
    if (!await this.connections.isConfigured()) return { chats: 0, messages: 0 };
    const linked = await this.connections.syncConnections();
    if (!linked.length) return { chats: 0, messages: 0 };
    const client = await this.connections.client();
    await this.reconcileJobs(client);
    const checkpoint = await this.chats.getCentralCheckpoint();
    const fullScan = Date.now() - this.lastFullScanAt >= 10 * 60 * 1000;
    const recentScan = Date.now() - this.lastRecentScanAt >= 2 * 60 * 1000;
    const localByRemote = new Map(linked.map(({ local, remote }) => [remote.id, local]));
    await this.flushPendingInbound(new Set(linked.map(({ local }) => local.id)));
    let chatCount = 0;
    let messageCount = 0;
    let cursor: string | undefined;
    do {
      const page = await client.chats(cursor);
      for (const remote of page.chats) {
        const connection = localByRemote.get(remote.connection_id);
        if (!connection) continue;
        const localBefore = await this.chats.findChatByRemoteId(remote.id);
        const local = await this.chats.upsertCentralChat(connection.id, remote);
        chatCount++;
        const recent = remote.last_message_at && new Date(remote.last_message_at).getTime() > Date.now() - 48 * 60 * 60 * 1000;
        if (localBefore?.last_message_at?.toISOString() === remote.last_message_at &&
            localBefore.unread_count === remote.unread_count && !fullScan && !(recent && recentScan)) continue;
        messageCount += await this.syncMessages(client, remote, local.id, !checkpoint?.last_completed_at ? startedAt : null);
      }
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    await this.chats.saveCentralCheckpoint(startedAt, null);
    if (fullScan) this.lastFullScanAt = Date.now();
    if (recentScan) this.lastRecentScanAt = Date.now();
    return { chats: chatCount, messages: messageCount };
  }

  private async reconcileJobs(client: NivooWhatsappClient): Promise<void> {
    const jobs = await this.chats.listPendingCentralJobs();
    for (const pending of jobs) {
      try {
        const current = await client.job(pending.id);
        await this.chats.settleCentralJob(
          pending.id,
          current.job.status,
          current.result?.meta_message_id ?? null,
          current.job.status === 'FAILED' ? current.job.last_error : null,
        );
        if (current.job.status === 'FAILED') {
          this.logger.warn(`Envio WhatsApp ${pending.id} falhou: ${current.job.last_error || 'erro não informado pela Central'}`);
        }
      } catch (error) {
        this.logger.warn(`Não foi possível consultar o envio ${pending.id}: ${(error as Error).message}`);
      }
    }
  }

  private async syncMessages(
    client: NivooWhatsappClient,
    remoteChat: NivooChat,
    localChatId: string,
    initialImportStartedAt: Date | null,
  ): Promise<number> {
    let count = 0;
    let cursor: string | undefined;
    do {
      const page = await client.messages(remoteChat.id, cursor);
      for (const message of page.messages) {
        const local = await this.chats.findChatById(localChatId);
        if (!local) throw new Error('Conversa local desapareceu durante a sincronização.');
        const publishInbound = message.direction === 'INBOUND' &&
          (!initialImportStartedAt || new Date(message.occurred_at) > initialImportStartedAt);
        const inserted = await this.chats.insertCentralMessage(local, message, publishInbound);
        if (!inserted) continue;
        count++;
        if (message.direction === 'INBOUND' && message.referral && !message.referral['source_id']) {
          this.logger.warn(`missing_referral: mensagem ${message.id} da conversa ${remoteChat.id} sem source_id.`);
        }
        if (publishInbound) {
          await this.publishInbound(localChatId, local.connection_id, remoteChat.contact_phone,
            remoteChat.contact_name, message.id, message.occurred_at, message.message_type,
            message.body ?? '', message.meta_message_id);
          await this.chats.markCentralInboundEventPublished(message.id);
        }
      }
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return count;
  }

  private async flushPendingInbound(currentConnections: Set<string>): Promise<void> {
    const pending = await this.chats.listPendingCentralInboundEvents([...currentConnections]);
    for (const message of pending) {
      if (!message.remote_message_id) continue;
      await this.publishInbound(message.chat_id, message.connection_id,
        message.chat.phone, message.chat.contact_name, message.remote_message_id,
        (message.occurred_at ?? message.created_at).toISOString(), message.type,
        message.content, message.external_id);
      await this.chats.markCentralInboundEventPublished(message.remote_message_id);
    }
  }

  private async publishInbound(
    localChatId: string,
    connectionId: string,
    phone: string,
    contactName: string | null,
    messageId: string,
    occurredAt: string,
    type: string,
    content: string,
    metaMessageId: string | null,
  ): Promise<void> {
    await this.assignment.reopenByInbound(localChatId);
    const local = await this.chats.findChatById(localChatId);
    const published = await this.events.publish({
      event: WHATSAPP_INBOUND_EVENT,
      trace_id: randomUUID(),
      source_event_id: messageId,
      occurred_at: occurredAt,
      payload: {
        chat_id: localChatId,
        connection_id: connectionId,
        phone,
        type,
        content,
        external_id: metaMessageId ?? messageId,
        contact_name: contactName,
        handler_type: local?.current_handler_type ?? null,
      },
    });
    if (!published.deduped && !published.event_log_id) {
      throw new Error(`Evento da mensagem ${messageId} não foi persistido para reprocessamento.`);
    }
  }
}
