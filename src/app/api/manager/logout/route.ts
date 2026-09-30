import { json } from '@/lib/http';
import { MANAGER_COOKIE } from '@/lib/manager-auth';

export async function POST() {
  const res = json({ ok: true });
  res.cookies.set(MANAGER_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
