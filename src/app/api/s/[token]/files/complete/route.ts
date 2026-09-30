import { requireEditableApplicant } from '@/lib/applicant-session';
import { MAX_FILE_BYTES, ownsKey, validateUpload } from '@/lib/files';
import { json } from '@/lib/http';
import { deleteObjects, headObject } from '@/lib/r2';
import { addFile, getFileByKey } from '@/lib/repo/files';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const r = await requireEditableApplicant((await params).token);
  if ('response' in r) return r.response;
  const b = (await req.json().catch(() => null)) as { kind?: unknown; objectKey?: unknown; mimeType?: unknown } | null;
  const kind = typeof b?.kind === 'string' ? b.kind : '';
  const objectKey = typeof b?.objectKey === 'string' ? b.objectKey : '';
  const mime = typeof b?.mimeType === 'string' ? b.mimeType : '';
  if (!ownsKey(r.application.id, objectKey) || !objectKey.startsWith(`apps/${r.application.id}/${kind}/`)) return json({ error: 'invalid_key' }, 400);

  // Idempotent: a retry for an already-registered key returns the existing row and never touches R2.
  const existing = await getFileByKey(objectKey);
  if (existing) return existing.applicationId === r.application.id ? json({ id: existing.id }) : json({ error: 'invalid_key' }, 400);

  const head = await headObject(objectKey);
  if (!head) return json({ error: 'not_uploaded' }, 404);

  // The presigner does not sign Content-Type, so verify what was actually stored matches what was declared.
  const error = validateUpload(kind, mime, head.size) ?? (head.size > MAX_FILE_BYTES ? 'too_large' : head.contentType !== mime ? 'content_type_mismatch' : null);
  if (error) {
    // Do not leave rejected uploads behind; a cleanup failure must not mask the 400.
    try {
      await deleteObjects([objectKey]);
    } catch {
      /* swallowed on purpose: the purge job removes stragglers */
    }
    return json({ error }, 400);
  }

  try {
    const id = await addFile({ applicationId: r.application.id, kind, objectKey, mimeType: mime, sizeBytes: head.size });
    return json({ id });
  } catch (e) {
    if ((e as { code?: string }).code !== '23505') throw e;
    // Concurrent registration of the same key: return the winner's row if it is ours.
    const row = await getFileByKey(objectKey);
    return row && row.applicationId === r.application.id ? json({ id: row.id }) : json({ error: 'invalid_key' }, 400);
  }
}
