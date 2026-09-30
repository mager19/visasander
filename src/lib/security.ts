import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error('APP_SECRET must be set (32+ characters)');
  return s;
}

export const hmac = (value: string): string => createHmac('sha256', secret()).update(value).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const generateAccessCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const normalizeCode = (input: string): string => input.replace(/\D/g, '');
export const hashAccessCode = (applicationId: string, code: string): string => hmac(`code:${applicationId}:${code}`);
export const generateToken = (): string => randomBytes(24).toString('base64url');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const generateShortId = (): string => `VZ-${Array.from({ length: 4 }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join('')}`;

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return safeEqual(scryptSync(password, salt, 64).toString('hex'), hash);
}

export const signValue = (payload: string): string => `${payload}.${hmac(payload)}`;

export function verifySigned(signed: string): string | null {
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const payload = signed.slice(0, i);
  return safeEqual(hmac(payload), signed.slice(i + 1)) ? payload : null;
}
