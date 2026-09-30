import { NextResponse } from 'next/server';
import { downloadFilename } from '@/lib/files';
import { isUuid, json } from '@/lib/http';
import { requireManagerApi } from '@/lib/manager-auth';
import { presignGet } from '@/lib/r2';
import { getFile } from '@/lib/repo/files';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'not_found' }, 404);
  try {
    const file = await getFile(id);
    if (!file) return json({ error: 'not_found' }, 404);
    const download = new URL(req.url).searchParams.get('download') === '1';
    // The download name is built server-side from trusted values (kind + mime), never from client input.
    const url = await presignGet(file.objectKey, download ? downloadFilename(file.kind, file.mimeType) : undefined);
    const res = NextResponse.redirect(url, 302);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch {
    return json({ error: 'unavailable' }, 502);
  }
}
