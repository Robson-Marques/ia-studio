// Trilha de atendimento por conversa (comm_whatsapp_chat_events): toda
// transicao (claim/release/transfer/close/reopen/takeover) grava snapshot
// before/after. Best-effort: falha de trilha nunca quebra a operacao.
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WhatsappChat } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface ChatSnapshot {
  owner_type: string | null;
  owner_id: string | null;
  current_handler_type: string | null;
  current_handler_id: string | null;
  attendance_status: string;
  team_id: string | null;
  queue_id: string | null;
}

export interface RecordChatEventInput {
  chatId: string;
  eventType: 'CLAIMED' | 'RELEASED' | 'TRANSFERRED' | 'CLOSED' | 'REOPENED' | 'TAKEOVER';
  actor_kind?: 'USER' | 'SYSTEM' | 'BOT';
  actorUserId?: string | null;
  reason?: string | null;
  before?: ChatSnapshot;
  after?: ChatSnapshot;
  metadata?: Record<string, unknown>;
}

export function snapshotChat(chat: WhatsappChat): ChatSnapshot {
  return {
    owner_type: chat.owner_type,
    owner_id: chat.owner_id,
    current_handler_type: chat.current_handler_type,
    current_handler_id: chat.current_handler_id,
    attendance_status: chat.attendance_status,
    team_id: chat.team_id,
    queue_id: chat.queue_id,
  };
}

@Injectable()
export class ChatEventsService {
  private readonly logger = new Logger(ChatEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordChatEventInput): Promise<void> {
    try {
      await this.prisma.whatsappChatEvent.create({
        data: {
          chat_id: input.chatId,
          event_type: input.eventType,
          actor_type: input.actor_kind ?? 'USER',
          actor_user_id: input.actorUserId ?? null,
          reason: input.reason ?? null,
          before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
          after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        } as Prisma.WhatsappChatEventUncheckedCreateInput,
      });
    } catch (e) {
      this.logger.warn(`Falha ao gravar evento de atendimento: ${(e as Error).message}`);
    }
  }

  timeline(chatId: string, take = 100) {
    return this.prisma.whatsappChatEvent.findMany({
      where: { chat_id: chatId },
      orderBy: { created_at: 'desc' },
      take,
    });
  }
}
