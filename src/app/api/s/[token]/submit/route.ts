import { requireEditableApplicant } from '@/lib/applicant-session';
import { json } from '@/lib/http';
import { submitApplication } from '@/lib/repo/applications';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const r = await requireEditableApplicant((await params).token);
  if ('response' in r) return r.response;
  await submitApplication(r.application.id);
  return json({ ok: true });
}
