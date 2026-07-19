// Helpers puros do escopo de incidente (frente 6): rotulo humano (pra equipe) e
// hash deterministico (dedup do rascunho auto-criado por escopo). Sem `this`,
// sem I/O — funcoes puras.
import { createHash } from 'crypto';
import { SCOPE_KEYS, ScopeKey } from './isp.constants';

// Rotulos amigaveis por chave de escopo (linguagem do operador tecnico).
const SCOPE_LABELS: Record<ScopeKey, string> = {
  cidade: 'Cidade',
  bairro: 'Bairro',
  ip_concentrador: 'Concentrador',
  interface_concentrador: 'Interface',
  vlan: 'VLAN',
  id_olt: 'OLT',
  id_slot: 'Slot',
  porta_pon: 'PON',
  id_porta_pon: 'PON',
  numero_pon: 'PON nº',
  id_cto: 'CTO',
  porta_cto: 'Porta CTO',
};

/** Pares (chave, valor) do escopo, na ordem de precisao de SCOPE_KEYS, sem vazios. */
function scopeEntries(scope: unknown): Array<[ScopeKey, string]> {
  const obj = (scope ?? {}) as Record<string, unknown>;
  const entries: Array<[ScopeKey, string]> = [];
  for (const key of SCOPE_KEYS) {
    const raw = obj[key];
    if (raw === undefined || raw === null) continue;
    const val = String(raw).trim();
    if (val) entries.push([key, val]);
  }
  return entries;
}

/** Rotulo humano do escopo pro alerta interno (ex.: "CTO 42 · PON 0/1/1"). */
export function scopeLabel(scope: unknown): string {
  return scopeEntries(scope)
    .map(([k, v]) => `${SCOPE_LABELS[k]} ${v}`)
    .join(' · ');
}

/**
 * Hash deterministico do escopo normalizado — ancora de dedup ("um escopo, um
 * rascunho aberto"). So o conteudo (chave+valor na ordem canonica) importa, nao
 * a ordem de insercao no JSON. Escopo vazio → string vazia (sem hash).
 */
export function scopeHash(scope: unknown): string {
  const entries = scopeEntries(scope);
  if (entries.length === 0) return '';
  const canonical = entries.map(([k, v]) => `${k}=${v}`).join('&');
  return createHash('sha1').update(canonical).digest('hex');
}
