import { NextResponse } from 'next/server';

export const json = (data: unknown, status = 200): NextResponse => NextResponse.json(data, { status });

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
