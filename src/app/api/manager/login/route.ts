import { clientIp, json } from '@/lib/http';
import { MANAGER_COOKIE, createManagerCookieValue } from '@/lib/manager-auth';
import { hit } from '@/lib/rate-limit';
import { verifyPassword } from '@/lib/security';

export async function POST(req: Request) {
  if (!(await hit(`login:${clientIp(req)}`, 5, 900))) return json({ error: 'rate_limited' }, 429);
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const stored = process.env.MANAGER_PASSWORD_HASH ?? '';
  if (typeof body?.password !== 'string' || !verifyPassword(body.password, stored)) return json({ error: 'invalid_credentials' }, 401);
  const res = json({ ok: true });
  res.cookies.set(MANAGER_COOKIE, createManagerCookieValue(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 12 * 3600,
  });
  return res;
}
