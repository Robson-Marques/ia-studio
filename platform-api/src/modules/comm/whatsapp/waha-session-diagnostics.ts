// Diagnóstico de queda da sessão WAHA (NOWEB/Baileys) — lógica PURA e testável,
// separada do serviço de eventos (um arquivo responde UMA pergunta). Classifica
// a causa, extrai o motivo do payload e decide recuperação automática.
export interface WahaReason {
  reason: string | null;
  event: string | null;
  message: string | null;
  code: string | null;
}

export type WahaCause =
  | 'ConnectFailure' | 'StreamReplaced' | 'ClientOutdated' | 'LoggedOut' | 'TemporaryBan';

/** Extrai reason/event/mensagem/código do payload de session.status do WAHA. */
export function extractWahaReason(payload: Record<string, unknown>): WahaReason {
  const data = (payload['data'] ?? {}) as Record<string, unknown>;
  const raw = data['reason'] ?? payload['reason'] ?? null;
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const event = typeof r['event'] === 'string' ? r['event'] : null;
    const message = typeof r['message'] === 'string' ? r['message'] : null;
    const code = r['code'] != null ? String(r['code']) : null;
    return { reason: event ?? message ?? JSON.stringify(r).slice(0, 300), event, message, code };
  }
  if (typeof raw === 'string' && raw.trim()) {
    return { reason: raw.trim().slice(0, 300), event: raw.trim(), message: null, code: null };
  }
  return { reason: null, event: null, message: null, code: null };
}

/** Diferencia a causa da queda (item 7) a partir de reason/event/mensagem. */
export function classifyWahaCause(diag: Pick<WahaReason, 'reason' | 'event' | 'message'>): WahaCause | null {
  const hay = `${diag.event ?? ''} ${diag.message ?? ''} ${diag.reason ?? ''}`.toLowerCase();
  if (!hay.trim()) return null;
  if (hay.includes('streamreplaced') || hay.includes('stream replaced')) return 'StreamReplaced';
  if (hay.includes('loggedout') || hay.includes('logged out') || hay.includes('logout')) return 'LoggedOut';
  if (hay.includes('temporaryban') || hay.includes('temporary ban') || hay.includes('banned')) return 'TemporaryBan';
  if (hay.includes('clientoutdated') || hay.includes('outdated')) return 'ClientOutdated';
  if (hay.includes('connectfailure') || hay.includes('connection') || hay.includes('socket')
    || hay.includes('timeout') || hay.includes('econn')) return 'ConnectFailure';
  return null;
}

/** Texto de estado por causa — nunca o genérico "offline" (item 6). */
export function wahaDownDetail(cause: WahaCause | null, reason: string | null, value: string): string {
  switch (cause) {
    case 'LoggedOut': return 'Sessão removida do aparelho — refaça o pareamento por QR Code.';
    case 'TemporaryBan': return 'Ban temporário do WhatsApp detectado — aguardando liberação; sem novo login ou QR.';
    case 'ClientOutdated': return 'Versão do WAHA desatualizada — atualize a imagem do WAHA para reconectar.';
    case 'StreamReplaced': return 'Conexão substituída (StreamReplaced) — verifique se há outra instância usando a mesma sessão.';
    case 'ConnectFailure': return 'Falha de rede/socket com o WhatsApp — tentando reconectar automaticamente.';
    default: return `Sessão WAHA interrompida (${value})${reason ? `: ${reason}` : ''} — tentando reconectar.`;
  }
}

/** Quais causas podem ser recuperadas por restart SEM logout (item 5/7).
 *  LoggedOut exige QR, TemporaryBan não pode reconectar, ClientOutdated exige
 *  atualizar a imagem — essas não reiniciam. */
export function shouldAutoRecover(cause: WahaCause | null): boolean {
  return cause !== 'LoggedOut' && cause !== 'TemporaryBan' && cause !== 'ClientOutdated';
}
