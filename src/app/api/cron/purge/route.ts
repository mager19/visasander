import { json } from '@/lib/http';
import { purgeExpired } from '@/lib/purge';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  return json(await purgeExpired());
}
