// Criptografia de segredos — base do Secrets Manager (Fase 2, diretriz 5).
// Portado do Aquapark (integration/shared/crypto.util.ts).
//
// Formato: "gcm:<ivHex>:<tagHex>:<dataHex>" — AES-256-GCM autenticado.
//
// Em producao, exige ENCRYPTION_KEY de pelo menos 32 caracteres. Se ausente
// ou fraca, o processo falha na primeira operacao de encrypt — para que nao
// se grave segredo em disco com chave default.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO_GCM = 'aes-256-gcm';
const PREFIX = 'gcm';

function requireStrongKey(): Buffer {
  const raw = process.env['ENCRYPTION_KEY'] ?? '';
  const isProd = (process.env['NODE_ENV'] ?? 'production') === 'production';
  if (isProd && raw.length < 32) {
    throw new Error('ENCRYPTION_KEY ausente ou fraca em producao (minimo 32 caracteres).');
  }
  // Em dev permite chave curta — mas sempre deriva 32 bytes via sha256.
  const seed = raw || 'iastudio_dev_unsafe_key';
  return createHash('sha256').update(seed).digest();
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) cachedKey = requireStrongKey();
  return cachedKey;
}

/** Encripta usando AES-256-GCM + tag de autenticacao. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12); // GCM recomenda 96 bits
  const cipher = createCipheriv(ALGO_GCM, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Decripta "gcm:iv:tag:data". Valor fora do formato retorna como esta. */
export function decrypt(value: string): string {
  if (!value || !value.includes(':')) return value;
  const parts = value.split(':');
  if (parts[0] !== PREFIX || parts.length !== 4) return value;
  const [, ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv(ALGO_GCM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Diz se o valor JA esta cifrado (evita dupla-criptografia no re-save). */
export function isEncrypted(value: string): boolean {
  if (typeof value !== 'string') return false;
  const p = value.split(':');
  return p[0] === PREFIX && p.length === 4;
}

/** Mascara segredo para exibicao: "abcd****wxyz". */
export function maskSecret(value: string): string {
  if (!value || value.length < 8) return '***';
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(3, value.length - 8))}${value.slice(-4)}`;
}
