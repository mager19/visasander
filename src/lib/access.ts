import { MAX_ATTEMPTS } from './constants';
import { getByToken, recordFailedAttempt, resetAttempts, setInProgress, type Application } from './repo/applications';
import { createSession, touchSession } from './repo/sessions';
import { hashAccessCode, normalizeCode, safeEqual } from './security';

export type AccessResult =
  | { ok: true; sessionToken: string; application: Application }
  | { ok: false; reason: 'not_found' | 'expired' | 'locked' | 'invalid_code'; attemptsLeft?: number };

const isExpired = (app: Application): boolean => new Date(app.expiresAt).getTime() < Date.now();

export async function verifyAccess(token: string, rawCode: string, userAgent: string): Promise<AccessResult> {
  const app = await getByToken(token);
  if (!app) return { ok: false, reason: 'not_found' };
  if (isExpired(app)) return { ok: false, reason: 'expired' };
  if (app.locked) return { ok: false, reason: 'locked' };

  const code = normalizeCode(rawCode);
  if (!safeEqual(hashAccessCode(app.id, code), app.codeHash)) {
    const r = await recordFailedAttempt(app.id);
    if (r.locked) return { ok: false, reason: 'locked' };
    return { ok: false, reason: 'invalid_code', attemptsLeft: MAX_ATTEMPTS - r.failedAttempts };
  }

  await resetAttempts(app.id);
  await setInProgress(app.id);
  const sessionToken = await createSession(app.id, userAgent.slice(0, 200));
  return { ok: true, sessionToken, application: app };
}

export async function authenticate(app: Application, sessionToken: string | undefined): Promise<boolean> {
  if (!sessionToken || app.locked || isExpired(app)) return false;
  return touchSession(app.id, sessionToken);
}
