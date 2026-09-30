import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { json } from './http';
import { signValue, verifySigned } from './security';

export const MANAGER_COOKIE = 'mgr_session';
const TTL_MS = 12 * 3600_000;

export const createManagerCookieValue = (now = Date.now()): string => signValue(`mgr:${now + TTL_MS}`);

export function verifyManagerCookieValue(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const payload = verifySigned(value);
  if (!payload?.startsWith('mgr:')) return false;
  return Number(payload.slice(4)) > now;
}

export async function isManager(): Promise<boolean> {
  return verifyManagerCookieValue((await cookies()).get(MANAGER_COOKIE)?.value);
}

export async function requireManagerApi(): Promise<NextResponse | null> {
  return (await isManager()) ? null : json({ error: 'unauthorized' }, 401);
}
