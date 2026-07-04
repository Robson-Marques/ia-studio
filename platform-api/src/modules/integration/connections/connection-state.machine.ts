// State machine da Connection (Instance) — conexao NUNCA e excluida, so
// muda de estado (diretriz 52). Transicao invalida → BadRequestException
// listando as permitidas. No-op (from === to) sempre permitido.
import { BadRequestException } from '@nestjs/common';
import { ConnectionStatus } from '@prisma/client';

export const CONNECTION_TRANSITIONS: Record<ConnectionStatus, ConnectionStatus[]> = {
  PENDING_AUTH: ['ACTIVE', 'ERROR', 'DISABLED', 'MAINTENANCE'],
  ACTIVE: ['DISABLED', 'MAINTENANCE', 'ERROR', 'TOKEN_EXPIRED', 'RECONNECTING', 'SYNCING'],
  DISABLED: ['ACTIVE', 'MAINTENANCE', 'PENDING_AUTH'],
  MAINTENANCE: ['ACTIVE', 'DISABLED', 'ERROR'],
  ERROR: ['ACTIVE', 'DISABLED', 'MAINTENANCE', 'RECONNECTING', 'PENDING_AUTH'],
  TOKEN_EXPIRED: ['ACTIVE', 'DISABLED', 'RECONNECTING', 'PENDING_AUTH'],
  RECONNECTING: ['ACTIVE', 'ERROR', 'TOKEN_EXPIRED', 'DISABLED'],
  SYNCING: ['ACTIVE', 'ERROR', 'DISABLED'],
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  PENDING_AUTH: 'Aguardando autenticação',
  ACTIVE: 'Ativa',
  DISABLED: 'Desativada',
  MAINTENANCE: 'Em manutenção',
  ERROR: 'Erro',
  TOKEN_EXPIRED: 'Token expirado',
  RECONNECTING: 'Reconectando',
  SYNCING: 'Sincronizando',
};

export function assertConnectionTransition(from: ConnectionStatus, to: ConnectionStatus): void {
  if (from === to) return; // no-op sempre permitido
  const allowed = CONNECTION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `Transição de estado inválida: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}. ` +
        `Permitidas a partir de "${STATUS_LABELS[from]}": ${allowed.map((s) => STATUS_LABELS[s]).join(', ')}.`,
    );
  }
}
