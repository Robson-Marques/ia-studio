// Reply gate (portado do Aquapark): intercepta TODO envio humano de conversa.
//   - Sem handler → claim implicito (quem responde assume).
//   - Conversa minha → segue.
//   - Conversa de OUTRO humano → 409 NEEDS_TAKEOVER_CONFIRMATION; o front
//     reexibe com confirm_takeover=true ("assumir ao responder") → takeover.
//   - CLOSED → 409 (reabra primeiro).
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { CommChatStatus, WhatsappChat } from '@prisma/client';
import { AttendanceScope } from './chat-scope.resolver';
import { ChatAssignmentService } from './chat-assignment.service';

@Injectable()
export class ReplyGateService {
  constructor(private readonly assignment: ChatAssignmentService) {}

  /**
   * Garante que o ator pode responder a conversa AGORA — aplicando claim
   * implicito ou takeover confirmado quando necessario. Lanca 403/409.
   */
  async assertCanReply(
    organizationId: string,
    chat: WhatsappChat,
    scope: AttendanceScope,
    confirmTakeover = false,
  ): Promise<void> {
    if (chat.attendance_status === CommChatStatus.CLOSED) {
      throw new ConflictException('Conversa encerrada. Reabra antes de responder.');
    }

    const isMine = chat.current_handler_type === 'USER' && chat.current_handler_id === scope.userId;
    if (isMine) {
      if (!scope.reply.assigned && !scope.reply.all) {
        throw new ForbiddenException('Sem permissão para responder conversas.');
      }
      return;
    }

    const inMyTeam = !!chat.team_id && scope.myTeamIds.includes(chat.team_id);
    const hasReplyReach = scope.reply.all || (scope.reply.team && inMyTeam) || scope.reply.assigned;
    if (!hasReplyReach) {
      throw new ForbiddenException('Sem permissão para responder esta conversa.');
    }

    // Pool (sem handler humano): claim implicito — quem responde assume.
    if (!chat.current_handler_id || chat.current_handler_type !== 'USER') {
      if (!scope.can.claim && !scope.reply.all) {
        throw new ForbiddenException('Sem permissão para assumir conversas do pool.');
      }
      await this.assignment.claim(organizationId, chat.id, scope);
      return;
    }

    // Handler humano DIFERENTE: exige confirmacao de takeover.
    if (!scope.reply.all && !(scope.reply.team && inMyTeam)) {
      throw new ForbiddenException('Conversa atribuída a outro atendente.');
    }
    if (!confirmTakeover) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Conversa atribuída a outro atendente. Confirme para assumir ao responder.',
        error: 'NEEDS_TAKEOVER_CONFIRMATION',
      });
    }
    await this.assignment.takeover(organizationId, chat.id, scope);
  }
}
