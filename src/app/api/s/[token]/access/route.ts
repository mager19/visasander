import { verifyAccess } from '@/lib/access';
import { cookieName } from '@/lib/applicant-session';
import { clientIp, json } from '@/lib/http';
import { hit } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };
const STATUS = { not_found: 404, expired: 410, locked: 423, invalid_code: 401 } as const;

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!(await hit(`access:${clientIp(req)}`, 30, 600))) return json({ reason: 'rate_limited' }, 429);
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  const result = await verifyAccess(token, code, req.headers.get('user-agent') ?? '');
  if (!result.ok) return json({ reason: result.reason, attemptsLeft: result.attemptsLeft }, STATUS[result.reason]);

  const res = json({ ok: true });
  res.cookies.set(cookieName(result.application.shortId), result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(60, Math.floor((new Date(result.application.expiresAt).getTime() - Date.now()) / 1000)),
  });
  return res;
}
