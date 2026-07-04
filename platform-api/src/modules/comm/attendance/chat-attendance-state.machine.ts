// State machine do atendimento (portada do Aquapark — regras congeladas):
//   OPEN        → IN_PROGRESS (claim / transfer p/ usuario)
//   OPEN        → CLOSED      (encerrar)
//   IN_PROGRESS → OPEN        (release / transfer p/ fila)
//   IN_PROGRESS → CLOSED      (encerrar)
//   CLOSED      → OPEN        (reopen — manual ou por inbound)
// No-op (from === to) sempre permitido. NAO existe CLOSED → IN_PROGRESS.
import { BadRequestException } from '@nestjs/common';
import { CommChatStatus } from '@prisma/client';

export const CHAT_ATTENDANCE_TRANSITIONS: Record<CommChatStatus, CommChatStatus[]> = {
  [CommChatStatus.OPEN]: [CommChatStatus.IN_PROGRESS, CommChatStatus.CLOSED],
  [CommChatStatus.IN_PROGRESS]: [CommChatStatus.OPEN, CommChatStatus.CLOSED],
  [CommChatStatus.CLOSED]: [CommChatStatus.OPEN],
};

export function assertChatAttendanceTransition(from: CommChatStatus, to: CommChatStatus): void {
  if (from === to) return;
  const allowed = CHAT_ATTENDANCE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `Transição de atendimento inválida: ${from} → ${to}. Permitidas: ${allowed.join(', ') || 'nenhuma'}.`,
    );
  }
}
