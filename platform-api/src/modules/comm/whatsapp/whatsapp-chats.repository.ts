// Porta UNICA ao banco de comm_whatsapp_chats / comm_whatsapp_messages.
// Lock otimista via updateChatConditional (UPDATE condicional — o 2o
// concorrente recebe count 0 e o service devolve 409).
import { Injectable } from '@nestjs/common';
import { CommChatStatus, CommMessageDirection, Prisma, WhatsappChat, WhatsappMessage } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface ChatListFilters {
  organizationId: string;
  workspaceId?: string;
  environmentId?: string;
  status?: CommChatStatus;
  connectionId?: string;
  search?: string;
  /** WHERE extra de visibilidade (escopo do atendente). */
  visibilityWhere?: Prisma.WhatsappChatWhereInput;
  take?: number;
  skip?: number;
}

export interface UpsertChatInput {
  organizationId: string;
  workspaceId: string;
  environmentId: string;
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

  findChatByConnectionPhone(connectionId: string, phone: string): Promise<WhatsappChat | null> {
    return this.prisma.whatsappChat.findUnique({
      where: { connection_id_phone: { connection_id: connectionId, phone } },
    });
  }

  async listChats(filters: ChatListFilters): Promise<{ items: WhatsappChat[]; total: number }> {
    const where: Prisma.WhatsappChatWhereInput = { organization_id: filters.organizationId };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.environmentId) where.environment_id = filters.environmentId;
    if (filters.status) where.attendance_status = filters.status;
    if (filters.connectionId) where.connection_id = filters.connectionId;
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

  /** Upsert do chat no envio/recebimento — atualiza resumo e janela de 24h. */
  async upsertChat(input: UpsertChatInput): Promise<WhatsappChat> {
    const now = new Date();
    const isInbound = input.direction === CommMessageDirection.INCOMING;
    return this.prisma.whatsappChat.upsert({
      where: { connection_id_phone: { connection_id: input.connectionId, phone: input.phone } },
      create: {
        organization_id: input.organizationId,
        workspace_id: input.workspaceId,
        environment_id: input.environmentId,
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
