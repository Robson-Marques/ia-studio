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
 * O `cnpj_cpf` pode estar gravado so com digitos ou com mascara, dependendo da
 * instalacao. Candidatos em ordem de tentativa: o valor como veio (acerta quando
 * o chamador ja usa o formato da base), depois so-digitos, depois mascarado.
 * (Bases so-digitos sao o caso comum — mascara primeiro gastava uma request.)
 */
export function cpfCnpjCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = onlyDigits(trimmed);
  const masked = formatCpfCnpj(digits);
  const out = [trimmed, digits, masked].filter((v): v is string => !!v);
  return [...new Set(out)];
}

/**
 * Campos que NUNCA saem do provider. O `cliente` do IXC devolve `senha` (a senha
 * da central do assinante) em texto claro, e `radusuarios` devolve a senha PPPoE
 * e as do roteador/wi-fi. Essas linhas alimentam as tools do agente — sem isso a
 * senha do cliente entraria no contexto do LLM e poderia ser repetida a ele.
 */
const SENSITIVE_KEY_RE = /(senha|password|secret|token|api_key)/i;

/** Remove os campos sensiveis de uma linha do IXC (nao muta a original). */
export function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!SENSITIVE_KEY_RE.test(key)) out[key] = value;
  }
  return out;
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
 *
 * Precisao decrescente pra delimitar um incidente: `porta_pon` (todos os
 * clientes da mesma PON caem juntos) → `id_cto` → `id_olt` → `vlan`/interface do
 * concentrador → bairro/cidade (geografia; proxy ruim de topologia).
 *
 * `interface_concentrador` so isola um grupo quando ha uma interface por VLAN;
 * com VLANs empilhadas numa interface unica ela cobre a base toda — use `vlan`.
 *
 * Conferido contra uma base real (2026-07-09): `id_porta_transmissor` vem `"0"`
 * na base inteira e a coluna `interface_transmissao_fibra` da collection nem
 * existe na resposta de leitura. A topologia PON mora em
 * `radpop_radio_cliente_fibra` (ver SCOPE_TO_FIBRA).
 *
 * `id_porta_pon` e o atalho de UMA requisicao: `radusuarios.interface_transmissao`
 * guarda o mesmo valor que `radpop_radio_cliente_fibra.id_radpop_radio_porta`
 * (conferido: ambos `42` para o login 6171). Quando o operador tem esse id,
 * filtra direto no login; com `ponid`/`slotno`/`ponno` a consulta e em 2 estagios.
 */
export const SCOPE_TO_RADUSUARIOS: Record<string, string> = {
  ip_concentrador: 'radusuarios.ip_concentrador',
  interface_concentrador: 'radusuarios.interface',
  vlan: 'radusuarios.vlan',
  id_olt: 'radusuarios.id_transmissor',
  id_cto: 'radusuarios.id_caixa_ftth',
  id_porta_pon: 'radusuarios.interface_transmissao',
};

/**
 * Escopo GEOGRAFICO — o unico que precisa de duas fontes.
 *
 * `radusuarios.bairro`/`cidade` so vem preenchido quando o login tem endereco
 * PROPRIO (`endereco_padrao_cliente = 'N'`). Quem usa o endereco do cliente
 * (a maioria) deixa esses campos vazios e `cidade = "0"`. Filtrar so por
 * `radusuarios` devolve um subconjunto e cala sobre o resto — num incidente de
 * bairro, notificaria uma fracao dos afetados sem sinal de erro.
 *
 * Entao: filtra `radusuarios` (enderecos proprios) UNIAO `cliente` (endereco de
 * cadastro, para os logins que o herdam). O IXC nao tem operador OR — a uniao e
 * feita aqui, em duas consultas.
 */
export const SCOPE_GEO_RADUSUARIOS: Record<string, string> = {
  cidade: 'radusuarios.cidade',
  bairro: 'radusuarios.bairro',
};

export const SCOPE_GEO_CLIENTE: Record<string, string> = {
  cidade: 'cliente.cidade',
  bairro: 'cliente.bairro',
};

/** Tabela da ONU/fibra — ligada a `radusuarios` por `id_login`. */
export const FIBRA_TABLE = 'radpop_radio_cliente_fibra';

/**
 * Escopo de topologia PON. Vive noutra tabela, entao a consulta e em dois
 * estagios: filtra a fibra → colhe `id_login` → busca esses logins.
 * `porta_pon` casa com `ponid`, que e uma STRING no formato frame/slot/pon
 * (ex.: `"0/1/1"`), nao um id numerico. `slotno`/`ponno` sao os numeros soltos.
 */
export const SCOPE_TO_FIBRA: Record<string, string> = {
  porta_pon: `${FIBRA_TABLE}.ponid`,
  id_slot: `${FIBRA_TABLE}.slotno`,
  numero_pon: `${FIBRA_TABLE}.ponno`,
  porta_cto: `${FIBRA_TABLE}.porta_ftth`,
};

/**
 * Chaves em que `"0"` significa "nao configurado" no IXC — como filtro casariam
 * com a base toda e o escopo do incidente vira lista de disparo em massa.
 * Ficam de fora, deliberadamente:
 *  - `id_slot`/`numero_pon`: slot 0 e PON 0 existem;
 *  - `porta_cto`: porta 0 do splitter e valida;
 *  - `porta_pon`: e string ("0/1/1"), nunca o literal "0".
 */
export const ZERO_MEANS_UNSET = new Set([
  'vlan',
  'interface_concentrador',
  'id_olt',
  'id_cto',
  'id_porta_pon',
  'cidade',
]);

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
