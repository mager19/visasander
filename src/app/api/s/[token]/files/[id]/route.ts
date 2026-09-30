import { requireEditableApplicant } from '@/lib/applicant-session';
import { json } from '@/lib/http';
import { deleteObjects } from '@/lib/r2';
import { deleteFileRow, getFile } from '@/lib/repo/files';

type Ctx = { params: Promise<{ token: string; id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { token, id } = await params;
  const r = await requireEditableApplicant(token);
  if ('response' in r) return r.response;
  const file = await getFile(id);
  if (!file || file.applicationId !== r.application.id) return json({ error: 'not_found' }, 404);
  await deleteObjects([file.objectKey]);
  await deleteFileRow(file.id);
  return json({ ok: true });
}
