import { requireApplicant } from '@/lib/applicant-session';
import { json } from '@/lib/http';
import { getById } from '@/lib/repo/applications';
import { listFiles } from '@/lib/repo/files';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const r = await requireApplicant((await params).token);
  if ('response' in r) return r.response;
  const app = await getById(r.application.id);
  if (!app) return json({ error: 'not_found' }, 404);
  const files = await listFiles(app.id);
  // Built field by field on purpose: never serialize the Application (it contains codeHash).
  return json({
    clientName: app.clientName,
    shortId: app.shortId,
    status: app.status,
    answers: app.answers,
    files: files.map((f) => ({ id: f.id, kind: f.kind })),
  });
}
