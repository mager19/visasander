import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { authenticate } from './access';
import { json } from './http';
import { getByToken, type Application } from './repo/applications';

export const cookieName = (shortId: string): string => `vs_${shortId}`;

export async function requireApplicant(token: string): Promise<{ application: Application } | { response: NextResponse }> {
  const application = await getByToken(token);
  if (!application) return { response: json({ error: 'not_found' }, 404) };
  const session = (await cookies()).get(cookieName(application.shortId))?.value;
  if (!(await authenticate(application, session))) return { response: json({ error: 'unauthorized' }, 401) };
  return { application };
}
