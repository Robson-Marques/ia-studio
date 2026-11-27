// Análise pura do histórico RADIUS entregue pelo IXC.
//
// O IXC costuma devolver datas sem fuso e pode alternar entre ISO e
// DD/MM/AAAA. A análise não pode depender do fuso do processo nem de
// Date.parse entender uma representação específica da instalação.

const HOUR_MS = 60 * 60 * 1000;

export interface LinkHistoryAnalysis {
  available: boolean;
  anomalia: boolean;
  quedas24h: number;
  quedas48h: number;
  quedas7d: number;
  sessoesCurtas24h: number;
  ultimoMotivo: string | null;
}

/** Converte datas do IXC para epoch, assumindo America/Sao_Paulo quando não há fuso. */
export function parseIxcDate(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  const text = value.trim();
  if (!text || /^0000[-/]00[-/]00/.test(text)) return null;

  // Datas ISO que já carregam offset podem ser delegadas ao parser nativo.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = Date.parse(text.replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const local = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/.exec(text);
  if (local) {
    const fraction = (local[7] ?? '').slice(0, 3).padEnd(3, '0');
    const iso = `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}:${local[6] ?? '00'}.${fraction}-03:00`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (brazilian) {
    const iso = `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}T${brazilian[4]}:${brazilian[5]}:${brazilian[6] ?? '00'}-03:00`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Conta apenas sessões encerradas dentro das janelas recentes. Sessão muito
 * curta é um sinal adicional de flapping: três ou mais sessões de até 10 min
 * em 24h já tornam o caso anômalo mesmo que o IXC não tenha preenchido todos
 * os motivos de término.
 */
export function analyzeLinkHistory(
  sessions: Record<string, unknown>[],
  now: Date = new Date(),
): LinkHistoryAnalysis {
  const nowMs = now.getTime();
  const ended = (sessions ?? []).map((session) => {
    const fim = parseIxcDate(session['fim']);
    const inicio = parseIxcDate(session['inicio']);
    const explicitDuration = numberValue(session['duracao_seg']);
    const duration = explicitDuration ?? (fim !== null && inicio !== null ? Math.max(0, (fim - inicio) / 1000) : null);
    return {
      fim,
      duration,
      motivo: typeof session['motivo'] === 'string' && session['motivo'].trim()
        ? session['motivo'].trim().slice(0, 80) : null,
    };
  }).filter((session) => session.fim !== null && session.fim <= nowMs)
    // A resposta do ERP pode chegar fora de ordem; nunca confie na ordem da
    // API para escolher a última desconexão.
    .sort((a, b) => (b.fim ?? 0) - (a.fim ?? 0));

  const within = (session: { fim: number | null }, hours: number): boolean =>
    session.fim !== null && session.fim <= nowMs && nowMs - session.fim <= hours * HOUR_MS;
  const quedas24h = ended.filter((session) => within(session, 24)).length;
  const quedas48h = ended.filter((session) => within(session, 48)).length;
  const quedas7d = ended.filter((session) => within(session, 24 * 7)).length;
  const sessoesCurtas24h = ended.filter((session) =>
    within(session, 24) && session.duration !== null && session.duration <= 10 * 60,
  ).length;
  const latest = ended.find((session) => session.motivo);

  return {
    available: true,
    // Mantém a sensibilidade já usada pelo atendimento e acrescenta a janela
    // de 48h e o padrão de sessões curtas pedido para detectar flapping.
    anomalia: quedas24h >= 3 || quedas48h >= 5 || quedas7d >= 8 || sessoesCurtas24h >= 3,
    quedas24h,
    quedas48h,
    quedas7d,
    sessoesCurtas24h,
    ultimoMotivo: latest?.motivo ?? null,
  };
}
