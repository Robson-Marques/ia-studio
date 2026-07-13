// Coracao da Central de Atendimento (portado do Aquapark, adaptado ao
// multi-tenant): claim / release / transfer / close / reopen / takeover.
// Regras congeladas: lock otimista (a 1a persistencia vence, a 2a recebe 409);
// owner nunca e humano; humano e sempre current_handler; transfer p/ usuario
// preserva owner/team/queue e vai a IN_PROGRESS; release preserva owner/team/
// queue; reopen sempre OPEN preservando handler; qualquer operacao em CLOSED
// (exceto reopen) → 409. Atendimento ≠ envio: aqui NAO se envia mensagem.
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommChatStatus, WhatsappChat } from '@prisma/client';
import { WhatsappChatsRepository } from '../whatsapp/whatsapp-chats.repository';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceScope } from './chat-scope.resolver';
import { ChatEventsService, snapshotChat } from './chat-events.service';
import { assertChatAttendanceTransition } from './chat-attendance-state.machine';

export type TransferTarget =
  | { type: 'user'; id: string }
  | { type: 'queue'; id: string }
  | { type: 'team'; id: string };

const RACE_MESSAGE = 'A conversa mudou de estado. Recarregue e tente de novo.';

@Injectable()
export class ChatAssignmentService {
  constructor(
    private readonly chats: WhatsappChatsRepository,
    private readonly repository: AttendanceRepository,
    private readonly events: ChatEventsService,
  ) {}

  // ─── Guards internos ────────────────────────────────

  private async loadOr404(organizationId: string, chatId: string): Promise<WhatsappChat> {
    const chat = await this.chats.findChatById(chatId);
    if (!chat || chat.organization_id !== organizationId) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    return chat;
  }

  private isHandler(chat: WhatsappChat, userId: string): boolean {
    return chat.current_handler_type === 'USER' && chat.current_handler_id === userId;
  }

  private isSupervisorOf(scope: AttendanceScope, chat: WhatsappChat): boolean {
    return !!chat.team_id && scope.supervisedTeamIds.includes(chat.team_id);
  }

  private canManage(scope: AttendanceScope, chat: WhatsappChat): boolean {
    return scope.isSuper || this.isHandler(chat, scope.userId) || this.isSupervisorOf(scope, chat);
  }

  // ─── CLAIM ──────────────────────────────────────────

  async claim(organizationId: string, chatId: string, scope: AttendanceScope): Promise<WhatsappChat> {
    const chat = await this.loadOr404(organizationId, chatId);
    if (chat.attendance_status === CommChatStatus.CLOSED) {
      throw new ConflictException('Conversa encerrada. Reabra primeiro.');
    }
    if (!scope.can.claim && !scope.reply.all) {
      throw new ForbiddenException('Sem permissão para assumir conversas.');
    }
    const now = new Date();
    const count = await this.chats.updateChatConditional(
      chatId,
      {
        // Pode assumir se ninguém humano está no comando: conversa sem atendente
        // (null) OU sendo conduzida pela IA (BOT). Assumir da IA é normal — o
        // humano toma a frente e a IA para. Só bloqueia se OUTRO humano já pegou.
        OR: [{ current_handler_type: null }, { current_handler_type: 'BOT' }],
        attendance_status: { not: CommChatStatus.CLOSED },
      },
      {
        current_handler_type: 'USER',
        current_handler_id: scope.userId,
        attendance_status: CommChatStatus.IN_PROGRESS,
        assigned_at: now,
        assigned_by_user_id: scope.userId,
        last_assignment_at: now,
      },
    );
    if (count === 0) throw new ConflictException('Conversa já foi assumida por outro atendente.');
    const after = await this.loadOr404(organizationId, chatId);
    await this.events.record({
      organizationId,
      chatId,
      eventType: 'CLAIMED',
      actorUserId: scope.userId,
      before: snapshotChat(chat),
      after: snapshotChat(after),
    });
    return after;
  }

  // ─── ASSIGN BOT (a IA assume a conversa) ────────────
  // Chamado pelo fluxo quando a IA responde: a conversa passa a mostrar
  // "atendido pela IA" (current_handler_type=BOT). NÃO rouba de humano — se um
  // atendente está no comando (USER), a IA não assume. Best-effort: não lança.
  async assignBot(organizationId: string, chatId: string, botId: string): Promise<void> {
    const now = new Date();
    await this.chats
      .updateChatConditional(
        chatId,
        {
          // Assume se NINGUÉM humano está no comando: sem handler (null) OU já é
          // a própria IA (BOT). `{ not: 'USER' }` num campo anulável excluiria os
          // nulos no SQL — por isso o OR explícito.
          OR: [{ current_handler_type: null }, { current_handler_type: 'BOT' }],
          attendance_status: { not: CommChatStatus.CLOSED },
          // NÃO reassumir conversa já ENTREGUE a uma FILA (handoff): o nó do agente
          // chama assignBot ao fim do turno, e sem isto ele roubava de volta pro BOT
          // a conversa que a IA acabou de encaminhar pra fila de setor.
          NOT: { owner_type: 'QUEUE' },
        },
        {
          current_handler_type: 'BOT',
          current_handler_id: botId,
          attendance_status: CommChatStatus.IN_PROGRESS,
          last_assignment_at: now,
        },
      )
      .catch(() => 0);
  }

  // ─── HANDOFF BOT → FILA DE SETOR (frente 3) ─────────
  // A IA entrega a conversa para uma FILA de setor (Suporte/Financeiro). Ação
  // segura (devolve ao time humano) — SEM permissão de usuário, quem chama é a IA.
  // Solta o handler, põe a conversa na fila (owner=QUEUE) e volta pra OPEN pra um
  // atendente da fila assumir. A mensagem de "aguarde" a própria IA envia na
  // resposta dela (não é envio de sistema — não fura o reply gate).
  async handoffToQueue(
    organizationId: string,
    chatId: string,
    queueId: string,
    reason?: string,
  ): Promise<WhatsappChat> {
    const chat = await this.loadOr404(organizationId, chatId);
    if (chat.attendance_status === CommChatStatus.CLOSED) {
      throw new ConflictException('Conversa encerrada. Reabra primeiro.');
    }
    const queue = await this.repository.findQueueById(queueId);
    if (!queue || queue.organization_id !== organizationId || !queue.is_active) {
      throw new ConflictException('Fila inexistente ou inativa.');
    }
    assertChatAttendanceTransition(chat.attendance_status, CommChatStatus.OPEN);
    const count = await this.chats.updateChatConditional(
      chatId,
      { attendance_status: chat.attendance_status },
      {
        owner_type: 'QUEUE',
        owner_id: queue.id,
        queue_id: queue.id,
        team_id: queue.team_id ?? null,
        current_handler_type: null,
        current_handler_id: null,
        attendance_status: CommChatStatus.OPEN,
        last_assignment_at: new Date(),
      },
    );
    if (count === 0) throw new ConflictException(RACE_MESSAGE);
    const after = await this.loadOr404(organizationId, chatId);
    await this.events.record({
      organizationId,
      chatId,
      eventType: 'TRANSFERRED',
      actorType: 'BOT',
      reason: reason ?? null,
      before: snapshotChat(chat),
      after: snapshotChat(after),
      metadata: { queue_id: queue.id, via: 'bot_handoff' },
    });
    return after;
  }

  // ─── RELEASE ────────────────────────────────────────

  async release(organizationId: string, chatId: string, scope: AttendanceScope): Promise<WhatsappChat> {
    const chat = await this.loadOr404(organizationId, chatId);
    if (chat.attendance_status === CommChatStatus.CLOSED) {
      throw new ConflictException('Conversa encerrada. Reabra antes de qualquer alteração.');
    }
    if (!this.canManage(scope, chat)) {
      throw new ForbiddenException('Sem permissão para liberar esta conversa.');
    }
    assertChatAttendanceTransition(chat.attendance_status, CommChatStatus.OPEN);
    const count = await this.chats.updateChatConditional(
      chatId,
      { current_handler_id: chat.current_handler_id, attendance_status: chat.attendance_status },
      {
        current_handler_type: null,
        current_handler_id: null,
        attendance_status: CommChatStatus.OPEN,
        last_assignment_at: new Date(),
        // owner/team_id/queue_id PRESERVADOS.
      },
    );
    if (count === 0) throw new ConflictException(RACE_MESSAGE);
    const after = await this.loadOr404(organizationId, chatId);
    await this.events.record({
      organizationId,
      chatId,
      eventType: 'RELEASED',
      actorUserId: scope.userId,
      before: snapshotChat(chat),
      after: snapshotChat(after),
    });
    return after;
  }

  // ─── TRANSFER ───────────────────────────────────────

  async transfer(
    organizationId: string,
    chatId: string,
    scope: AttendanceScope,
    target: TransferTarget,
    reason?: string,
  ): Promise<WhatsappChat> {
    const chat = await this.loadOr404(organizationId, chatId);
    if (chat.attendance_status === CommChatStatus.CLOSED) {
      throw new ConflictException('Conversa encerrada. Reabra primeiro.');
    }
    if (!scope.can.transfer) throw new ForbiddenException('Sem permissão para transferir conversas.');

    let data: Record<string, unknown>;
    let noop = false;
    if (target.type === 'user') {
      const active = await this.repository.findUserActive(target.id);
      if (!active || active.organization_id !== organizationId) {
        throw new ConflictException('Usuário alvo inexistente ou inativo.');
      }
      noop = this.isHandler(chat, target.id);
      data = {
        current_handler_type: 'USER',
        current_handler_id: target.id,
        attendance_status: CommChatStatus.IN_PROGRESS,
        assigned_at: new Date(),
        assigned_by_user_id: scope.userId,
        last_assignment_at: new Date(),
      };
    } else if (target.type === 'queue') {
      const queue = await this.repository.findQueueById(target.id);
      if (!queue || queue.organization_id !== organizationId || !queue.is_active) {
        throw new ConflictException('Fila inexistente ou inativa.');
      }
      noop = chat.owner_type === 'QUEUE' && chat.owner_id === queue.id && !chat.current_handler_id;
      data = {
        owner_type: 'QUEUE',
        owner_id: queue.id,
        queue_id: queue.id,
        team_id: queue.team_id ?? null,
        current_handler_type: null,
        current_handler_id: null,
        attendance_status: CommChatStatus.OPEN,
        last_assignment_at: new Date(),
      };
    } else {
      // team → sempre pela fila padrao da equipe.
      const team = await this.repository.findTeamById(target.id);
      if (!team || team.organization_id !== organizationId || !team.is_active) {
        throw new ConflictException('Equipe inexistente ou inativa.');
      }
      if (!team.default_queue_id) {
        throw new ConflictException('Equipe sem fila padrão — defina uma fila padrão antes de transferir.');
      }
      const queue = await this.repository.findQueueById(team.default_queue_id);
      if (!queue || !queue.is_active) throw new ConflictException('Fila padrão da equipe inativa.');
      noop = chat.owner_type === 'QUEUE' && chat.owner_id === queue.id && !chat.current_handler_id;
      data = {
        owner_type: 'QUEUE',
        owner_id: queue.id,
        queue_id: queue.id,
        team_id: team.id,
        current_handler_type: null,
        current_handler_id: null,
        attendance_status: CommChatStatus.OPEN,
        last_assignment_at: new Date(),
      };
    }

    if (noop) return chat; // HTTP 200, sem efeito, sem evento.

    assertChatAttendanceTransition(chat.attendance_status, data['attendance_status'] as CommChatStatus);
    const count = await this.chats.updateChatConditional(
      chatId,
      { current_handler_id: chat.current_handler_id, attendance_status: chat.attendance_status },
      data,
    );
    if (count === 0) throw new ConflictException(RACE_MESSAGE);
    const after = await this.loadOr404(organizationId, chatId);
    await this.events.record({
      organizationId,
      chatId,
      eventType: 'TRANSFERRED',
      actorUserId: scope.userId,
      reason: reason ?? null,
      before: snapshotChat(chat),
      after: snapshotChat(after),
      metadata: { target },
    });
    return after;
  }

  // ─── CLOSE ──────────────────────────────────────────

  async close(
    organizationId: string,
    chatId: string,
    scope: AttendanceScope,
    reason?: string,
  ): Promise<WhatsappChat> {
    const chat = await this.loadOr404(organizationId, chatId);
    if (chat.attendance_status === CommChatStatus.CLOSED) return chat; // no-op idempotente
    if (!scope.can.close) throw new ForbiddenException('Sem permissão para encerrar conversas.');
    // Só barra quando um HUMANO está no comando. Encerrar uma conversa que a IA
    // atende (current_handler_type=BOT) ou que está sem handler não rouba
    // trabalho de ninguém — quem tem permissão de encerrar encerra, sem precisar
    // assumir antes. Antes o gate tratava o BOT como humano e barrava o admin.
    const humanoNoComando = chat.current_handler_type === 'USER' && chat.current_handler_id !== null;
    if (!this.canManage(scope, chat) && humanoNoComando) {
      throw new ForbiddenException('Sem permissão para encerrar esta conversa.');
    }
    assertChatAttendanceTransition(chat.attendance_status, CommChatStatus.CLOSED);
    const count = await this.chats.updateChatConditional(
      chatId,
      { attendance_status: chat.attendance_status },
      {
        attendance_status: CommChatStatus.CLOSED,
        closed_at: new Date(),
        // Ao encerrar, SOLTA o atendente: assim, quando o cliente voltar a
        // escrever, a conversa reabre SEM handler (volta pro pool) e a IA pode
        // pegá-la de novo (o gate só barra quando um humano está no comando).
        current_handler_type: null,
        current_handler_id: null,
      },
    );
    if (count === 0) throw new ConflictException(RACE_MESSAGE);
    const after = await this.loadOr404(organizationId, chatId);
    await this.events.record({
      organizationId,
      chatId,
      eventType: 'CLOSED',
      actorUserId: scope.userId,
      reason: reason ?? null,
      before: snapshotChat(chat),
      after: snapshotChat(after),
    });
    return after;
  }

  // ─── REOPEN ─────────────────────────────────────────

  async reopen(organizationId: string, chatId: string, scope: AttendanceScope): Promise<WhatsappChat> {
    const chat = await this.loadOr404(organizationId, chatId);
    if (chat.attendance_status !== CommChatStatus.CLOSED) return chat; // no-op
    if (!scope.isSuper && !this.isSupervisorOf(scope, chat) && !this.isHandler(chat, scope.userId) && !scope.can.close) {
      throw new ForbiddenException('Sem permissão para reabrir esta conversa.');
    }
    return this.reopenInternal(organizationId, chatId, chat, scope.userId, 'USER');
  }

  /** Reabertura automatica por inbound (SYSTEM). Preserva handler existente. */
  async reopenByInbound(organizationId: string, chatId: string): Promise<WhatsappChat | null> {
    const chat = await this.chats.findChatById(chatId);
    if (!chat || chat.organization_id !== organizationId) return null;
    if (chat.attendance_status !== CommChatStatus.CLOSED) return null;
    return this.reopenInternal(organizationId, chatId, chat, null, 'SYSTEM');
  }

  private async reopenInternal(
    organizationId: string,
    chatId: string,
    chat: WhatsappChat,
    actorUserId: string | null,
    actorType: 'USER' | 'SYSTEM',
  ): Promise<WhatsappChat> {
    assertChatAttendanceTransition(CommChatStatus.CLOSED, CommChatStatus.OPEN);
    const count = await this.chats.updateChatConditional(
      chatId,
      { attendance_status: CommChatStatus.CLOSED },
      // SEMPRE OPEN; current_handler PRESERVADO.
      { attendance_status: CommChatStatus.OPEN, closed_at: null },
    );
    if (count === 0) return this.loadOr404(organizationId, chatId); // alguem ja reabriu
    const after = await this.loadOr404(organizationId, chatId);
    await this.events.record({
      organizationId,
      chatId,
      eventType: 'REOPENED',
      actorUserId,
      actorType,
      before: snapshotChat(chat),
      after: snapshotChat(after),
    });
    return after;
  }

  // ─── TAKEOVER ───────────────────────────────────────
  // Chamado pelo reply gate quando um nao-handler (com reply.team/all) confirma
  // "assumir ao responder" numa conversa que JA tem handler humano diferente.

  async takeover(organizationId: string, chatId: string, scope: AttendanceScope): Promise<WhatsappChat> {
    const chat = await this.loadOr404(organizationId, chatId);
    if (chat.attendance_status === CommChatStatus.CLOSED) {
      throw new ConflictException('Conversa encerrada. Reabra primeiro.');
    }
    if (this.isHandler(chat, scope.userId)) return chat; // ja e minha — no-op
    if (!scope.reply.all && !(scope.reply.team && !!chat.team_id && scope.myTeamIds.includes(chat.team_id))) {
      throw new ForbiddenException('Sem permissão para assumir a conversa de outro atendente.');
    }
    const now = new Date();
    const count = await this.chats.updateChatConditional(
      chatId,
      { current_handler_id: chat.current_handler_id, attendance_status: { not: CommChatStatus.CLOSED } },
      {
        current_handler_type: 'USER',
        current_handler_id: scope.userId,
        attendance_status: CommChatStatus.IN_PROGRESS,
        assigned_at: now,
        assigned_by_user_id: scope.userId,
        last_assignment_at: now,
      },
    );
    if (count === 0) throw new ConflictException(RACE_MESSAGE);
    const after = await this.loadOr404(organizationId, chatId);
    await this.events.record({
      organizationId,
      chatId,
      eventType: 'TAKEOVER',
      actorUserId: scope.userId,
      before: snapshotChat(chat),
      after: snapshotChat(after),
      metadata: { previous_handler_id: chat.current_handler_id },
    });
    return after;
  }
}
