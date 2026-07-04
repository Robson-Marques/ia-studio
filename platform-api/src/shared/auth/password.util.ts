// Hash de senha com scrypt (mesmo padrao do Aquapark):
// salt 16 bytes + hash 64 bytes, formato "saltHex:hashHex".
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const stored64 = Buffer.from(hashHex, 'hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return stored64.length === derived.length && timingSafeEqual(stored64, derived);
}
