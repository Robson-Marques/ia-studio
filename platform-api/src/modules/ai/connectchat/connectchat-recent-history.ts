// Histórico recente REAL do cliente para o diagnóstico (ConnectChat / Newnet).
//
// Responde UMA pergunta: dadas as ordens de serviço e os chamados recentes lidos
// do IXC, qual é o histórico LITERAL e DATADO que a Nete pode citar, e qual
// registro FECHADO deve informar a conduta (e de que tipo foi a resolução).
// Só normaliza, data e marca o que veio da fonte. NÃO inventa, NÃO resume e NÃO
// decide a conduta — a decisão é da Nete, a partir destes fatos. O código informa
// ("OS de 21/11 fechada com troca de equipamento"); ela interpreta e conduz.

export type ResolutionKind = 'CAMPO' | 'FORA_DA_REDE' | 'INCONCLUSIVO';

export interface RecentHistoryEntry {
  tipo: 'OS' | 'chamado';
  /** Data mais relevante: fechamento quando existe, senão abertura. */
  data: string | null;
  titulo: string;
  /** O que foi registrado/relatado (literal da fonte). */
  relato: string | null;
  /** Resolução/parecer de fechamento (literal da fonte). */
  fechamento: string | null;
  encerrada: boolean;
  /** Registro de teste/processo interno — não conta como histórico do cliente. */
  interno: boolean;
}

export interface RecentHistory {
  /** Lista literal e datada (mais recente primeiro), para citar no atendimento. */
  entries: RecentHistoryEntry[];
  /** Registro FECHADO mais recente e relevante (não interno) cuja resolução deve
   *  informar a conduta. Null quando não há. */
  driver: RecentHistoryEntry | null;
  /** Classificação grosseira e determinística da resolução do driver. */
  driverKind: ResolutionKind | null;
}

const norm = (value: string): string => value.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

const str = (record: Record<string, unknown>, key: string): string | null =>
  typeof record[key] === 'string' && (record[key] as string).trim()
    ? (record[key] as string).trim() : null;

const firstStr = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = str(record, key);
    if (value) return value;
  }
  return null;
};

// Marcadores literais de registro interno/de teste (não é adivinhação: lê o texto).
const INTERNO = /\bteste\b|\btestes\b|opa ?suite|disparando do processo|homolog|sandbox/;
// Causa fora da nossa rede (checada primeiro por ser o sinal mais específico).
const FORA_DA_REDE = /iptv|\btv\b|televis|aplicativo|\bapp\b|streaming|smart ?tv|aparelho do cliente|equipamento do cliente|roteador propr|sem garantia/;
// Intervenção física da equipe em campo.
const CAMPO = /troca|trocad|substitu|\bonu\b|roteador|equipamento|cabo|\bdrop\b|emenda|fus(a|ao)|conector|reparo|sinal|potencia|\blos\b|\bcto\b|caixa|poste|antena|\bradio\b|reinstal|reposicion/;

const CLOSED = new Set([
  'F', 'FINALIZADO', 'FINALIZADA', 'C', 'CANCELADO', 'CANCELADA', 'ENCERRADO',
  'ENCERRADA', 'FECHADO', 'FECHADA', 'RESOLVIDO', 'CONCLUIDO', 'CONCLUIDA',
]);

function resolutionKind(text: string): ResolutionKind {
  const value = norm(text);
  if (FORA_DA_REDE.test(value)) return 'FORA_DA_REDE';
  if (CAMPO.test(value)) return 'CAMPO';
  return 'INCONCLUSIVO';
}

function timeOf(entry: RecentHistoryEntry): number {
  const time = Date.parse(entry.data ?? '');
  return Number.isFinite(time) ? time : -Infinity;
}

/** Normaliza OS (projectOrdemServico) + chamados (projectChamado) num histórico
 *  único, literal e datado, e aponta o registro fechado que informa a conduta. */
export function buildRecentHistory(
  recentOs: Record<string, unknown>[],
  recentTickets: Record<string, unknown>[],
): RecentHistory {
  const entries: RecentHistoryEntry[] = [];

  for (const record of recentOs ?? []) {
    const relato = firstStr(record, ['relato']);
    const fechamento = firstStr(record, ['parecer']);
    const dataFechamento = firstStr(record, ['concluida_em']);
    const dataAbertura = firstStr(record, ['aberta_em']);
    const status = (str(record, 'status') ?? '').toUpperCase();
    const titulo = firstStr(record, ['assunto']) ?? 'ordem de serviço';
    entries.push({
      tipo: 'OS',
      data: dataFechamento ?? dataAbertura,
      titulo,
      relato,
      fechamento,
      encerrada: !!dataFechamento || CLOSED.has(status),
      interno: INTERNO.test(norm([titulo, relato ?? '', fechamento ?? ''].join(' '))),
    });
  }

  for (const record of recentTickets ?? []) {
    const relato = firstStr(record, ['descricao']);
    const fechamento = firstStr(record, ['resolucao']);
    const dataFechamento = firstStr(record, ['encerrado_em']);
    const dataAbertura = firstStr(record, ['aberto_em']);
    const situacao = (firstStr(record, ['situacao_interna', 'status']) ?? '').toUpperCase();
    const titulo = firstStr(record, ['titulo']) ?? 'chamado';
    entries.push({
      tipo: 'chamado',
      data: dataFechamento ?? dataAbertura,
      titulo,
      relato,
      fechamento,
      encerrada: !!dataFechamento || CLOSED.has(situacao),
      interno: INTERNO.test(norm([titulo, relato ?? '', fechamento ?? ''].join(' '))),
    });
  }

  entries.sort((a, b) => timeOf(b) - timeOf(a));

  const driver = entries.find((entry) =>
    entry.encerrada && !entry.interno && (entry.fechamento || entry.relato)) ?? null;
  const driverKind = driver
    ? resolutionKind([driver.fechamento ?? '', driver.relato ?? ''].join(' '))
    : null;

  return { entries: entries.slice(0, 6), driver, driverKind };
}
