// Helpers puros do registro de dominios (sem `this`, sem I/O).
// Convencao: hostname sempre minusculo, sem esquema, sem porta, sem barra e sem
// ponto final. O que entra torto do usuario e normalizado aqui, uma vez so.
import { randomBytes } from 'crypto';

/** Rotulo DNS: 1..63 chars, alfanumerico + hifen (nao no inicio/fim). */
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Normaliza o host digitado: tira esquema, credenciais, porta, caminho, espacos
 * e ponto final; devolve minusculo. "HTTPS://Acme.App.BR/painel" → "acme.app.br".
 */
export function normalizeHostname(raw: string): string {
  let h = String(raw ?? '').trim().toLowerCase();
  if (!h) return '';
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // esquema
  h = h.split('@').pop() ?? h;                  // credenciais
  h = h.split('/')[0];                          // caminho
  h = h.split('?')[0].split('#')[0];
  h = h.replace(/:\d+$/, '');                   // porta
  h = h.replace(/\.+$/, '');                    // ponto final (FQDN absoluto)
  return h;
}

/** Valida um hostname completo (2+ rotulos, cada um valido, ate 253 chars). */
export function isValidHostname(host: string): boolean {
  const h = normalizeHostname(host);
  if (!h || h.length > 253) return false;
  const labels = h.split('.');
  if (labels.length < 2) return false;               // exige dominio + TLD
  if (!labels.every((l) => LABEL.test(l))) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,}$/.test(tld);                     // TLD nao pode ser numerico
}

/** true quando `host` esta sob `base` (e nao e o proprio base). */
export function isSubdomainOf(host: string, base: string): boolean {
  const h = normalizeHostname(host);
  const b = normalizeHostname(base);
  if (!h || !b || h === b) return false;
  return h.endsWith(`.${b}`);
}

/** Monta o host do cliente sob o dominio-base: (acme, app.br) → acme.app.br */
export function buildSubdomain(label: string, base: string): string {
  const l = normalizeHostname(label).split('.')[0] ?? '';
  return `${l}.${normalizeHostname(base)}`;
}

/** Rotulo isolado (o "acme" de acme.app.br) e valido? */
export function isValidLabel(label: string): boolean {
  return LABEL.test(String(label ?? '').trim().toLowerCase());
}

/** Token do registro TXT de verificacao de posse (dominio proprio). */
export function generateVerifyToken(): string {
  return `iastudio-verify=${randomBytes(16).toString('hex')}`;
}
