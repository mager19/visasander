import { requireEditableApplicant } from '@/lib/applicant-session';
import type { FileKind } from '@/lib/form/file-kinds';
import { buildObjectKey, validateUpload } from '@/lib/files';
import { json } from '@/lib/http';
import { presignPut } from '@/lib/r2';
import { countFiles, countFilesByKind } from '@/lib/repo/files';

const MAX_FILES_PER_KIND = 3;
const MAX_FILES_TOTAL = 15;

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const r = await requireEditableApplicant((await params).token);
  if ('response' in r) return r.response;
  const b = (await req.json().catch(() => null)) as { kind?: unknown; mimeType?: unknown; size?: unknown } | null;
  const kind = typeof b?.kind === 'string' ? b.kind : '';
  const mime = typeof b?.mimeType === 'string' ? b.mimeType : '';
  const size = typeof b?.size === 'number' ? b.size : 0;
  const error = validateUpload(kind, mime, size);
  if (error) return json({ error }, 400);
  const [ofKind, total] = await Promise.all([countFilesByKind(r.application.id, kind), countFiles(r.application.id)]);
  if (ofKind >= MAX_FILES_PER_KIND || total >= MAX_FILES_TOTAL) return json({ error: 'too_many_files' }, 400);
  const objectKey = buildObjectKey(r.application.id, kind as FileKind, mime);
  // The signed URL is bound to the declared size (ContentLength).
  return json({ uploadUrl: await presignPut(objectKey, mime, size), objectKey });
}
