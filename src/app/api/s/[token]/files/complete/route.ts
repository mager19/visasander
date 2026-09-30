import { requireApplicant } from '@/lib/applicant-session';
import { MAX_FILE_BYTES, ownsKey, validateUpload } from '@/lib/files';
import { json } from '@/lib/http';
import { deleteObjects, headObject } from '@/lib/r2';
import { addFile } from '@/lib/repo/files';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const r = await requireApplicant((await params).token);
  if ('response' in r) return r.response;
  const b = (await req.json().catch(() => null)) as { kind?: unknown; objectKey?: unknown; mimeType?: unknown } | null;
  const kind = typeof b?.kind === 'string' ? b.kind : '';
  const objectKey = typeof b?.objectKey === 'string' ? b.objectKey : '';
  const mime = typeof b?.mimeType === 'string' ? b.mimeType : '';
  if (!ownsKey(r.application.id, objectKey) || !objectKey.startsWith(`apps/${r.application.id}/${kind}/`)) return json({ error: 'invalid_key' }, 400);
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

  const id = await addFile({ applicationId: r.application.id, kind, objectKey, mimeType: mime, sizeBytes: head.size });
  return json({ id });
}
