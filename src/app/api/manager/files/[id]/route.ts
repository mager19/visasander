import { NextResponse } from 'next/server';
import { json } from '@/lib/http';
import { requireManagerApi } from '@/lib/manager-auth';
import { presignGet } from '@/lib/r2';
import { getFile } from '@/lib/repo/files';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const file = await getFile((await params).id);
  if (!file) return json({ error: 'not_found' }, 404);
  return NextResponse.redirect(await presignGet(file.objectKey), 302);
}
