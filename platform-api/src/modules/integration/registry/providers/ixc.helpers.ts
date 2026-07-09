// Helpers puros do provider IXC Soft (Provedor). Sem estado, sem I/O.
// Contrato da API (wikiapiprovedor.ixcsoft.com.br):
//   * Base: https://<host>/webservice/v1/<tabela>
//   * Auth: Basic base64("<id>:<chave>")  — o token do IXC ja vem nesse formato
//   * Listar: header `ixcsoft: listar` (sem ele a API responde 404)
//   * Sem o header: POST insere, PUT /<id> edita, DELETE /<id> exclui

/** Envelope de listagem do IXC. */
export interface IxcListEnvelope {
  page?: string | number;
  total?: string | number;
  registros?: unknown;
  type?: string;
  message?: string;
}

/** Parametros de listagem (espelham os campos documentados da API). */
export interface IxcListParams {
  qtype?: string;
  query?: string;
  oper?: string;
  page?: string;
  rp?: string;
  sortname?: string;
  sortorder?: 'asc' | 'desc';
  grid_param?: string;
}

/** Um filtro do `grid_param` (multiplos filtros numa unica consulta). */
export interface IxcGridFilter {
  /** Campo no formato "tabela.campo". */
  TB: string;
  /** Operador: = != > < >= <= L NL IN NI BE NBE */
  OP: string;
  /** Valor. */
  P: string;
}

/**
 * Header Authorization. O token do IXC e `<id_usuario>:<chave>` — exatamente o
 * formato `user:pass` do Basic, entao basta base64 da string crua.
 */
export function basicAuthHeader(token: string): string {
  return `Basic ${Buffer.from(token, 'utf8').toString('base64')}`;
}

/** O token precisa do prefixo numerico (`7:ca9baa...`); sem ele a API da 401. */
export function isValidIxcToken(token: string): boolean {
  return /^\d+:.+$/.test(token.trim());
}

export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

/** Mascara CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). */
export function formatCpfCnpj(digits: string): string | null {
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return null;
}

/**
 * O IXC guarda cnpj_cpf COM mascara na maioria das instalacoes, mas ha bases
 * so com digitos. Devolve os candidatos a tentar em ordem (mascarado primeiro).
 */
export function cpfCnpjCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = onlyDigits(trimmed);
  const masked = formatCpfCnpj(digits);
  const out = [masked, trimmed, digits].filter((v): v is string => !!v);
  return [...new Set(out)];
}

/** `{type:'error', message:'...'}` — erro de negocio/permissao do IXC. */
export function ixcErrorMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const env = raw as IxcListEnvelope;
  if (env.type === 'error' && typeof env.message === 'string') return env.message;
  return null;
}

/** Extrai as linhas de uma listagem. `registros` vem como array ou objeto indexado. */
export function extractRegistros(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== 'object') return [];
  const registros = (raw as IxcListEnvelope).registros;
  if (Array.isArray(registros)) return registros as Record<string, unknown>[];
  if (registros && typeof registros === 'object') {
    return Object.values(registros as Record<string, unknown>) as Record<string, unknown>[];
  }
  return [];
}

/** Serializa filtros no formato que a API espera (string JSON dentro do campo). */
export function buildGridParam(filters: IxcGridFilter[]): string {
  return JSON.stringify(filters);
}

/**
 * Traducao dos filtros de escopo canonicos da solucao ISP (SCOPE_KEYS, nomeados
 * a partir do Altarede) para colunas de `radusuarios` no IXC. Nomes conferidos
 * contra a collection oficial da API (CRUD radusuarios).
 * `id_slot` fica de fora: nao ha coluna equivalente clara em `radusuarios`
 * (os candidatos — `interface_transmissao`, `ftth_porta`, `splitter` — sao
 * conceitos distintos). Chave ignorada = consulta menos especifica, nao invalida.
 */
export const SCOPE_TO_RADUSUARIOS: Record<string, string> = {
  cidade: 'radusuarios.cidade',
  bairro: 'radusuarios.bairro',
  ip_concentrador: 'radusuarios.ip_concentrador',
  interface_concentrador: 'radusuarios.interface',
  id_olt: 'radusuarios.id_transmissor',
  id_cto: 'radusuarios.id_caixa_ftth',
};

/** `YYYY-MM-DD HH:mm:ss` — formato de data/hora aceito nos inserts do IXC. */
export function ixcDateTime(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

/**
 * Flag do IXC → boolean. NAO e igualdade estrita com "S": a collection oficial
 * mostra `radusuarios.online` valendo `'SS'`, e outras colunas usam `'S'`/`'N'`.
 * Qualquer valor comecando com S conta como sim; o resto (N, vazio) e nao.
 */
export function isYes(value: unknown): boolean {
  return /^S/i.test(String(value ?? '').trim());
}
