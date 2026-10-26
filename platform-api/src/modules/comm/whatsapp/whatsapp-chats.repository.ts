// Porta UNICA ao banco de comm_whatsapp_chats / comm_whatsapp_messages.
// Lock otimista via updateChatConditional (UPDATE condicional — o 2o
// concorrente recebe count 0 e o service devolve 409).
import { Injectable } from '@nestjs/common';
import { CommChatStatus, CommMessageDirection, Prisma, WhatsappChat, WhatsappMessage } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NivooChat, NivooMessage } from '../../../shared/integration/nivoo-whatsapp.client';

export interface ChatListFilters {
  status?: CommChatStatus;
  connectionId?: string;
  search?: string;
  /** WHERE extra de visibilidade (escopo do atendente). */
  visibilityWhere?: Prisma.WhatsappChatWhereInput;
  take?: number;
  skip?: number;
}

export interface UpsertChatInput {
  connectionId: string;
  phone: string;
  contactName?: string | null;
  lastMessage: string;
  direction: CommMessageDirection;
  /** Timestamp do inbound (base da janela de 24h). */
  inboundAt?: Date;
}

@Injectable()
export class WhatsappChatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Chats ──────────────────────────────────────────

  findChatById(id: string): Promise<WhatsappChat | null> {
    return this.prisma.whatsappChat.findUnique({ where: { id } });
  }

  findChatByRemoteId(id: string): Promise<WhatsappChat | null> {
    return this.prisma.whatsappChat.findUnique({ where: { remote_chat_id: id } });
  }

  upsertCentralChat(connectionId: string, remote: NivooChat): Promise<WhatsappChat> {
    const lastMessageAt = remote.last_message_at ? new Date(remote.last_message_at) : null;
    const lastInboundAt = remote.last_inbound_at ? new Date(remote.last_inbound_at) : null;
    const data = {
      connection_id: connectionId,
      phone: remote.contact_phone,
      contact_name: remote.contact_name,
      last_message: remote.last_message,
      last_message_at: lastMessageAt,
      last_inbound_at: lastInboundAt,
      unread_count: remote.unread_count,
      remote_history: remote.history ? remote.history as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
    };
    return this.prisma.whatsappChat.upsert({
      where: { remote_chat_id: remote.id },
      create: { remote_chat_id: remote.id, ...data },
      update: data,
    });
  }

  async insertCentralMessage(chat: WhatsappChat, remote: NivooMessage, publishInbound: boolean): Promise<boolean> {
    const existing = await this.prisma.whatsappMessage.findUnique({ where: { remote_message_id: remote.id } });
    if (existing) {
      const currentStatus = remote.status?.toLowerCase() || existing.status;
      const nextMetadata = remote.media_metadata ? remote.media_metadata as Prisma.InputJsonValue : Prisma.JsonNull;
      if (existing.status !== currentStatus || existing.media_state !== (remote.media_state ?? null) ||
          JSON.stringify(existing.media_metadata) !== JSON.stringify(remote.media_metadata ?? null)) {
        await this.prisma.whatsappMessage.update({
          where: { id: existing.id },
          data: {
            status: currentStatus,
            error_detail: remote.failure_message ?? null,
            media_state: remote.media_state ?? null,
            media_metadata: nextMetadata,
          },
        });
      }
      return false;
    }
    const occurredAt = new Date(remote.occurred_at);
    const media = remote.media_state || remote.media_url || remote.media_id ? {
      media_id: remote.id,
      mime_type: remote.media_mime ?? null,
      filename: remote.media_filename ?? null,
      remote: true,
    } : undefined;
    const details = {
      remote_message_id: remote.id,
      inbound_event_published: !publishInbound,
      occurred_at: occurredAt,
      external_id: remote.meta_message_id,
      direction: remote.direction === 'INBOUND' ? CommMessageDirection.INCOMING : CommMessageDirection.OUTGOING,
      sender: remote.direction === 'INBOUND' ? 'contact' : 'system',
      type: remote.message_type,
      content: remote.body ?? '',
      media: media ? media as Prisma.InputJsonValue : Prisma.JsonNull,
      media_state: remote.media_state ?? null,
      media_metadata: remote.media_metadata ? remote.media_metadata as Prisma.InputJsonValue : Prisma.JsonNull,
      reply_to_message_id: remote.reply_to_message_id ?? null,
      reply_to_from: remote.reply_to_from ?? null,
      reaction_emoji: remote.reaction_emoji ?? null,
      reaction_to_message_id: remote.reaction_to_message_id ?? null,
      interactive_reply: remote.interactive_reply ? remote.interactive_reply as Prisma.InputJsonValue : Prisma.JsonNull,
      template: remote.template ? remote.template as Prisma.InputJsonValue : Prisma.JsonNull,
      referral: remote.referral ? remote.referral as Prisma.InputJsonValue : Prisma.JsonNull,
      status: remote.status?.toLowerCase() || (remote.direction === 'INBOUND' ? 'received' : 'sent'),
      error_detail: remote.failure_message ?? null,
    };
    const queued = remote.meta_message_id ? await this.prisma.whatsappMessage.findFirst({
      where: { chat_id: chat.id, external_id: remote.meta_message_id, remote_message_id: null },
    }) : null;
    if (queued) {
      await this.prisma.whatsappMessage.update({ where: { id: queued.id }, data: { ...details, sender: queued.sender, created_at: occurredAt } });
      return false;
    }
    try {
      await this.prisma.whatsappMessage.create({
        data: { chat_id: chat.id, connection_id: chat.connection_id, created_at: occurredAt, ...details },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  listPendingCentralInboundEvents(connectionIds: string[]) {
    return this.prisma.whatsappMessage.findMany({
      where: { connection_id: { in: connectionIds }, inbound_event_published: false, remote_message_id: { not: null } },
      include: { chat: true },
      orderBy: { created_at: 'asc' },
      take: 100,
    });
  }

  markCentralInboundEventPublished(remoteMessageId: string) {
    return this.prisma.whatsappMessage.update({
      where: { remote_message_id: remoteMessageId }, data: { inbound_event_published: true },
    });
  }

  getCentralCheckpoint() {
    return this.prisma.nivooWhatsappSyncCheckpoint.findUnique({ where: { id: 'primary' } });
  }

  saveCentralCheckpoint(lastCompletedAt: Date | null, lastError: string | null) {
    return this.prisma.nivooWhatsappSyncCheckpoint.upsert({
      where: { id: 'primary' },
      create: { id: 'primary', last_completed_at: lastCompletedAt, last_error: lastError },
      update: { ...(lastCompletedAt ? { last_completed_at: lastCompletedAt } : {}), last_error: lastError },
    });
  }

  recordCentralJob(id: string, connectionId: string, chatId: string | null) {
    return this.prisma.nivooWhatsappOutboundJob.create({
      data: { id, connection_id: connectionId, chat_id: chatId },
    });
  }

  listPendingCentralJobs() {
    return this.prisma.nivooWhatsappOutboundJob.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      orderBy: { created_at: 'asc' },
      take: 100,
    });
  }

  async settleCentralJob(id: string, status: string, metaMessageId: string | null, error: string | null) {
    if (metaMessageId) {
      const queued = await this.prisma.whatsappMessage.findUnique({ where: { remote_job_id: id } });
      const synced = queued ? await this.prisma.whatsappMessage.findFirst({
        where: { chat_id: queued.chat_id, external_id: metaMessageId, remote_message_id: { not: null } },
      }) : null;
      if (queued && synced && queued.id !== synced.id) {
        await this.prisma.$transaction([
          this.prisma.whatsappMessage.delete({ where: { id: queued.id } }),
          this.prisma.whatsappMessage.update({
            where: { id: synced.id }, data: { remote_job_id: id, sender: queued.sender },
          }),
        ]);
      }
    }
    await this.prisma.nivooWhatsappOutboundJob.update({
      where: { id }, data: { status, meta_message_id: metaMessageId, last_error: error },
    });
    await this.prisma.whatsappMessage.updateMany({
      where: { remote_job_id: id },
      data: {
        status: status === 'DONE' ? 'sent' : status === 'FAILED' ? 'failed' : 'queued',
        ...(metaMessageId ? { external_id: metaMessageId } : {}),
        error_detail: error,
      },
    });
    if (status === 'DONE') {
      const humanMessage = await this.prisma.whatsappMessage.findFirst({
        where: { remote_job_id: id, sender: { startsWith: 'user:' } },
        select: { chat_id: true },
      });
      if (humanMessage) {
        await this.prisma.whatsappChat.updateMany({
          where: { id: humanMessage.chat_id, first_response_at: null },
          data: { first_response_at: new Date() },
        });
      }
    }
  }

  findChatByConnectionPhone(connectionId: string, phone: string): Promise<WhatsappChat | null> {
    return this.prisma.whatsappChat.findUnique({
      where: { connection_id_phone: { connection_id: connectionId, phone } },
    });
  }

  async listChats(filters: ChatListFilters): Promise<{ items: WhatsappChat[]; total: number }> {
    const owned = await this.prisma.connection.findMany({
      where: { provider_key: 'whatsapp-nivoo', config: { path: ['remote_owned'], equals: true } },
      select: { id: true },
    });
    const where: Prisma.WhatsappChatWhereInput = { connection_id: { in: owned.map((item) => item.id) }, remote_chat_id: { not: null } };
    if (filters.status) where.attendance_status = filters.status;
    if (filters.connectionId) where.connection_id = owned.some((item) => item.id === filters.connectionId)
      ? filters.connectionId : { in: [] };
    if (filters.search) {
      where.OR = [
        { phone: { contains: filters.search } },
        { contact_name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const and: Prisma.WhatsappChatWhereInput[] = [where];
    if (filters.visibilityWhere) and.push(filters.visibilityWhere);
    const finalWhere: Prisma.WhatsappChatWhereInput = and.length > 1 ? { AND: and } : where;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.whatsappChat.findMany({
        where: finalWhere,
        orderBy: [{ last_message_at: { sort: 'desc', nulls: 'last' } }],
        take: filters.take ?? 50,
        skip: filters.skip ?? 0,
      }),
      this.prisma.whatsappChat.count({ where: finalWhere }),
    ]);
    return { items, total };
  }

  /**
   * Contagem de chats sob os mesmos filtros base (org/status/search/conexao)
   * + um WHERE de visibilidade especifico (o recorte de cada aba). Usa a mesma
   * composicao de WHERE do listChats — sem inventar regra nova.
   */
  async countChats(filters: ChatListFilters): Promise<number> {
    const owned = await this.prisma.connection.findMany({
      where: { provider_key: 'whatsapp-nivoo', config: { path: ['remote_owned'], equals: true } },
      select: { id: true },
    });
    const where: Prisma.WhatsappChatWhereInput = { connection_id: { in: owned.map((item) => item.id) }, remote_chat_id: { not: null } };
    if (filters.status) where.attendance_status = filters.status;
    if (filters.connectionId) where.connection_id = owned.some((item) => item.id === filters.connectionId)
      ? filters.connectionId : { in: [] };
    if (filters.search) {
      where.OR = [
        { phone: { contains: filters.search } },
        { contact_name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const and: Prisma.WhatsappChatWhereInput[] = [where];
    if (filters.visibilityWhere) and.push(filters.visibilityWhere);
    const finalWhere: Prisma.WhatsappChatWhereInput = and.length > 1 ? { AND: and } : where;
    return this.prisma.whatsappChat.count({ where: finalWhere });
  }

  /** Upsert do chat no envio/recebimento — atualiza resumo e janela de 24h. */
  async upsertChat(input: UpsertChatInput): Promise<WhatsappChat> {
    const now = new Date();
    const isInbound = input.direction === CommMessageDirection.INCOMING;
    return this.prisma.whatsappChat.upsert({
      where: { connection_id_phone: { connection_id: input.connectionId, phone: input.phone } },
      create: {
        connection_id: input.connectionId,
        phone: input.phone,
        contact_name: input.contactName ?? null,
        last_message: input.lastMessage.slice(0, 500),
        last_message_at: now,
        last_inbound_at: isInbound ? (input.inboundAt ?? now) : null,
        unread_count: isInbound ? 1 : 0,
      },
      update: {
        ...(input.contactName ? { contact_name: input.contactName } : {}),
        last_message: input.lastMessage.slice(0, 500),
        last_message_at: now,
        ...(isInbound
          ? { last_inbound_at: input.inboundAt ?? now, unread_count: { increment: 1 } }
          : {}),
      },
    });
  }

  updateChat(id: string, data: Prisma.WhatsappChatUpdateInput): Promise<WhatsappChat> {
    return this.prisma.whatsappChat.update({ where: { id }, data });
  }

  /**
   * UPDATE condicional (lock otimista): so aplica se o estado lido continua
   * valendo. Retorna o count — 0 = corrida perdida (caller devolve 409).
   */
  async updateChatConditional(
    id: string,
    expected: Prisma.WhatsappChatWhereInput,
    data: Prisma.WhatsappChatUpdateManyMutationInput & Record<string, unknown>,
  ): Promise<number> {
    const result = await this.prisma.whatsappChat.updateMany({
      where: { id, ...expected },
      data,
    });
    return result.count;
  }

  markRead(id: string): Promise<WhatsappChat> {
    return this.prisma.whatsappChat.update({ where: { id }, data: { unread_count: 0 } });
  }

  // ─── Mensagens ──────────────────────────────────────

  createMessage(data: Prisma.WhatsappMessageUncheckedCreateInput): Promise<WhatsappMessage> {
    return this.prisma.whatsappMessage.create({ data });
  }

  /** Ultimas mensagens (desc); `before` pagina pra tras no historico. */
  listMessages(chatId: string, take = 50, before?: Date): Promise<WhatsappMessage[]> {
    return this.prisma.whatsappMessage.findMany({
      where: {
        chat_id: chatId,
        ...(before ? { created_at: { lt: before } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take,
    });
  }

  /** Dedup do webhook: a Meta pode reentregar o mesmo wamid. */
  findMessageByExternalId(externalId: string): Promise<WhatsappMessage | null> {
    return this.prisma.whatsappMessage.findFirst({ where: { external_id: externalId } });
  }

  findCentralMessageInChat(chatId: string, remoteMessageId: string): Promise<WhatsappMessage | null> {
    return this.prisma.whatsappMessage.findFirst({
      where: { chat_id: chatId, remote_message_id: remoteMessageId },
    });
  }

  // Ultima mensagem INCOMING com external_id (wamid) — ancora do markRead/typing:
  // a Meta exige um wamid de mensagem recebida pra marcar lida / mostrar "digitando".
  async findLastIncomingAnchor(chatId: string): Promise<{ external_id: string; connection_id: string } | null> {
    const msg = await this.prisma.whatsappMessage.findFirst({
      where: { chat_id: chatId, direction: CommMessageDirection.INCOMING, external_id: { not: null } },
      orderBy: { created_at: 'desc' },
      select: { external_id: true, connection_id: true },
    });
    if (!msg?.external_id) return null;
    return { external_id: msg.external_id, connection_id: msg.connection_id };
  }

  async updateMessageStatusByExternalId(
    externalId: string,
    status: string,
    errorDetail?: string | null,
  ): Promise<number> {
    const result = await this.prisma.whatsappMessage.updateMany({
      where: { external_id: externalId },
      data: { status, ...(errorDetail !== undefined ? { error_detail: errorDetail } : {}) },
    });
    return result.count;
  }
}
