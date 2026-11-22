export type TechnicalProblemCategory =
  | 'NO_NAVIGATION'
  | 'INTERMITTENT'
  | 'SLOWNESS'
  | 'WIFI_LOCAL'
  | 'EQUIPMENT'
  | 'SIGNAL'
  | 'ADMINISTRATIVE_BLOCK'
  | 'UNKNOWN';

export interface TechnicalHistoryMatch {
  kind: 'SERVICE_ORDER' | 'SUPPORT_TICKET';
  reference: string;
  categories: TechnicalProblemCategory[];
  openedAt: string | null;
  closedAt: string | null;
  resolution: string | null;
  similarityReasons: string[];
}

export interface TechnicalHistoryAnalysis {
  currentCategories: TechnicalProblemCategory[];
  similarCases: TechnicalHistoryMatch[];
  recurrent: boolean;
  recurrentWithin48h: boolean;
  previousResolutionHints: string[];
  unavailable: boolean;
}

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'esta', 'estou', 'eu', 'internet', 'meu', 'minha', 'na', 'nas', 'no', 'nos',
  'o', 'os', 'para', 'por', 'que', 'sem', 'um', 'uma', 'wifi', 'wi-fi',
]);

const normalize = (value: string): string => value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\s+/g, ' ').trim();

function categoriesFor(text: string): TechnicalProblemCategory[] {
  const value = normalize(text);
  const categories = new Set<TechnicalProblemCategory>();
  if (/\b(sem internet|sem acesso|nao navega|nao conecta|offline|sem conexao)\b/.test(value)) {
    categories.add('NO_NAVIGATION');
  }
  if (/\b(oscila|oscilando|intermitente|cai e volta|quedas?|instavel)\b/.test(value)) {
    categories.add('INTERMITTENT');
  }
  if (/\b(lent[ao]|lentidao|baixa velocidade|velocidade baixa|travando)\b/.test(value)) {
    categories.add('SLOWNESS');
  }
  if (/\b(wifi|wi-fi|sinal do roteador|so no celular|apenas um aparelho)\b/.test(value)) {
    categories.add('WIFI_LOCAL');
  }
  if (/\b(roteador|modem|onu|equipamento|fonte|reinici|trocou o aparelho)\b/.test(value)) {
    categories.add('EQUIPMENT');
  }
  if (/\b(los|sinal|fibra rompida|potencia|optico|antena)\b/.test(value)) {
    categories.add('SIGNAL');
  }
  if (/\b(bloquead|suspens|inadimpl|financeir|liberacao de confianca)\b/.test(value)) {
    categories.add('ADMINISTRATIVE_BLOCK');
  }
  return categories.size > 0 ? [...categories] : ['UNKNOWN'];
}

function meaningfulTokens(text: string): Set<string> {
  return new Set(normalize(text).split(' ')
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)));
}

function dateValue(value: unknown): { text: string | null; time: number | null } {
  if (typeof value !== 'string' || !value.trim()) return { text: null, time: null };
  const time = Date.parse(value);
  return { text: value, time: Number.isFinite(time) ? time : null };
}

function textFrom(record: Record<string, unknown>, keys: string[]): string {
  return keys.map((key) => typeof record[key] === 'string' ? record[key] as string : '')
    .filter(Boolean).join(' ');
}

export function analyzeTechnicalHistory(
  problem: string,
  serviceOrders: Record<string, unknown>[],
  tickets: Record<string, unknown>[],
  options: { recentOsAvailable: boolean; recentTicketsAvailable: boolean; now?: Date },
): TechnicalHistoryAnalysis {
  const now = (options.now ?? new Date()).getTime();
  const currentCategories = categoriesFor(problem);
  const currentTokens = meaningfulTokens(problem);
  const records = [
    ...serviceOrders.map((record) => ({ kind: 'SERVICE_ORDER' as const, record })),
    ...tickets.map((record) => ({ kind: 'SUPPORT_TICKET' as const, record })),
  ];
  const similarCases: TechnicalHistoryMatch[] = [];

  for (const item of records) {
    const recordText = textFrom(item.record, [
      'assunto', 'titulo', 'relato', 'descricao', 'parecer', 'resolucao',
    ]);
    const recordCategories = categoriesFor(recordText);
    const categoryMatches = recordCategories.filter((category) =>
      category !== 'UNKNOWN' && currentCategories.includes(category));
    const sharedTokens = [...meaningfulTokens(recordText)].filter((token) => currentTokens.has(token));
    const similarityReasons: string[] = [];
    if (categoryMatches.length > 0) similarityReasons.push(`categoria:${categoryMatches.join(',')}`);
    if (sharedTokens.length >= 2) similarityReasons.push(`termos:${sharedTokens.slice(0, 5).join(',')}`);
    if (similarityReasons.length === 0) continue;

    const opened = dateValue(item.record[item.kind === 'SERVICE_ORDER' ? 'aberta_em' : 'aberto_em']);
    const closed = dateValue(item.record[item.kind === 'SERVICE_ORDER' ? 'concluida_em' : 'encerrado_em']);
    const resolution = textFrom(item.record, item.kind === 'SERVICE_ORDER'
      ? ['parecer'] : ['resolucao']).replace(/\s+/g, ' ').trim().slice(0, 500) || null;
    similarCases.push({
      kind: item.kind,
      reference: String(item.record['protocolo'] ?? item.record['id'] ?? 'sem-referencia'),
      categories: recordCategories,
      openedAt: opened.text,
      closedAt: closed.text,
      resolution,
      similarityReasons,
    });
  }

  const withinDays = (match: TechnicalHistoryMatch, days: number): boolean => {
    const date = Date.parse(match.closedAt ?? match.openedAt ?? '');
    return Number.isFinite(date) && date <= now && now - date <= days * 86_400_000;
  };
  const relevant = similarCases.filter((match) => withinDays(match, 90));
  return {
    currentCategories,
    similarCases: relevant.slice(0, 10),
    recurrent: relevant.length > 0,
    recurrentWithin48h: relevant.some((match) => withinDays(match, 2)),
    previousResolutionHints: [...new Set(relevant
      .map((match) => match.resolution).filter((value): value is string => !!value))].slice(0, 5),
    unavailable: !options.recentOsAvailable || !options.recentTicketsAvailable,
  };
}

