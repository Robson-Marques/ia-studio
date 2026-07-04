// Helpers puros do dominio de licenciamento.
import { randomBytes } from 'crypto';

/** Gera chave de licenca no formato XXXX-XXXX-XXXX-XXXX (A-Z0-9, sem ambiguos). */
export function generateLicenseKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I/O/0/1
  const block = (): string => {
    const bytes = randomBytes(4);
    let out = '';
    for (let i = 0; i < 4; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  };
  return `${block()}-${block()}-${block()}-${block()}`;
}

/** Periodo mensal corrente no formato "YYYY-MM". */
export function currentPeriod(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Merge de limites: plano ← override (metrica ausente = ilimitado). */
export function mergeLimits(
  planLimits: unknown,
  override: unknown,
): Record<string, number> {
  const base = isLimitMap(planLimits) ? planLimits : {};
  const over = isLimitMap(override) ? override : {};
  return { ...base, ...over };
}

function isLimitMap(v: unknown): v is Record<string, number> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
