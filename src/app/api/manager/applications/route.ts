import { json } from '@/lib/http';
import { requireManagerApi } from '@/lib/manager-auth';
import { createApplication } from '@/lib/repo/applications';

export async function POST(req: Request) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { clientName?: unknown } | null;
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim().slice(0, 120) : '';
  if (!clientName) return json({ error: 'name_required' }, 400);
  const { application, code } = await createApplication({ clientName });
  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  return json({ id: application.id, shortId: application.shortId, link: `${origin}/s/${application.token}`, code });
}
