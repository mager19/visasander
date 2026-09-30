import { requireEditableApplicant } from '@/lib/applicant-session';
import { sanitizePatch } from '@/lib/form/patch';
import { json } from '@/lib/http';
import { saveAnswers } from '@/lib/repo/applications';

type Ctx = { params: Promise<{ token: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const r = await requireEditableApplicant((await params).token);
  if ('response' in r) return r.response;
  const body = (await req.json().catch(() => null)) as { patch?: unknown } | null;
  const patch = sanitizePatch(body?.patch);
  if (!patch) return json({ error: 'invalid_patch' }, 400);
  await saveAnswers(r.application.id, patch);
  return json({ ok: true });
}
