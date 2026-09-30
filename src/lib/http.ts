import { NextResponse } from 'next/server';

/** Every JSON response is private and must never be cached by a browser or proxy. */
export const json = (data: unknown, status = 200): NextResponse =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canonical UUID check; use before querying a uuid column with untrusted input. */
export const isUuid = (value: string): boolean => UUID_RE.test(value);

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
