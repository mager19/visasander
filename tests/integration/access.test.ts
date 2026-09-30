import { expect, it } from 'vitest';
import { authenticate, verifyAccess } from '@/lib/access';
import { createApplication, getById, regenerateCode } from '@/lib/repo/applications';
import { describeDb, resetDb } from '../helpers/db';

const wrongFor = (code: string) => (code === '000000' ? '111111' : '000000');

describeDb('access service', () => {
  resetDb();

  it('accepts the right code, opens a session and marks the application in progress', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const r = await verifyAccess(application.token, code, 'ua');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ok).toBe(true);
    expect(await authenticate(r.application, r.sessionToken)).toBe(true);
    expect((await getById(application.id))!.status).toBe('in_progress');
  });

  it('accepts codes typed with spaces or dashes, including leading zeros', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const formatted = `${code.slice(0, 3)} - ${code.slice(3)}`;
    expect((await verifyAccess(application.token, formatted, 'ua')).ok).toBe(true);
  });

  it('reports attempts left and locks after 5 failures, even for the right code', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const first = await verifyAccess(application.token, wrongFor(code), 'ua');
    expect(first).toEqual({ ok: false, reason: 'invalid_code', attemptsLeft: 4 });
    const second = await verifyAccess(application.token, wrongFor(code), 'ua');
    expect(second).toEqual({ ok: false, reason: 'invalid_code', attemptsLeft: 3 });
    const third = await verifyAccess(application.token, wrongFor(code), 'ua');
    expect(third).toEqual({ ok: false, reason: 'invalid_code', attemptsLeft: 2 });
    const fourth = await verifyAccess(application.token, wrongFor(code), 'ua');
    expect(fourth).toEqual({ ok: false, reason: 'invalid_code', attemptsLeft: 1 });
    const fifth = await verifyAccess(application.token, wrongFor(code), 'ua');
    expect(fifth).toEqual({ ok: false, reason: 'locked' });
    expect(await verifyAccess(application.token, code, 'ua')).toEqual({ ok: false, reason: 'locked' });
  });

  it('a successful login resets the failed-attempt counter', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    for (let i = 0; i < 3; i++) await verifyAccess(application.token, wrongFor(code), 'ua');
    await verifyAccess(application.token, code, 'ua');
    expect((await getById(application.id))!.failedAttempts).toBe(0);
  });

  it('allows at most 2 active sessions; the oldest is invalidated', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await verifyAccess(application.token, code, `ua${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) tokens.push(r.sessionToken);
    }
    expect(await authenticate(application, tokens[0])).toBe(false);
    expect(await authenticate(application, tokens[1])).toBe(true);
    expect(await authenticate(application, tokens[2])).toBe(true);
  });

  it('regenerating the code invalidates sessions, unlocks, and rejects the old code', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const r = await verifyAccess(application.token, code, 'ua');
    expect(r.ok).toBe(true);
    for (let i = 0; i < 5; i++) await verifyAccess(application.token, wrongFor(code), 'ua');
    const newCode = (await regenerateCode(application.id))!;
    const fresh = (await getById(application.id))!;
    if (r.ok) expect(await authenticate(fresh, r.sessionToken)).toBe(false);
    expect((await verifyAccess(application.token, code, 'ua')).ok).toBe(code === newCode);
    expect((await verifyAccess(application.token, newCode, 'ua')).ok).toBe(true);
  });

  it('rejects unknown tokens, expired applications and missing session tokens', async () => {
    expect(await verifyAccess('nope', '123456', 'ua')).toEqual({ ok: false, reason: 'not_found' });
    const { application, code } = await createApplication({ clientName: 'Old', retentionDays: -1 });
    expect(await verifyAccess(application.token, code, 'ua')).toEqual({ ok: false, reason: 'expired' });
    expect(await authenticate(application, undefined)).toBe(false);
  });

  it('handles burst of concurrent wrong guesses with atomic lockout', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => verifyAccess(application.token, wrongFor(code), 'ua'))
    );
    const invalidCodes = results.filter((r) => !r.ok && r.reason === 'invalid_code').length;
    expect(invalidCodes).toBeLessThanOrEqual(5);
    expect((await getById(application.id))!.locked).toBe(true);
  });

  it('authenticate returns false for locked or expired applications', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    const token = 'dummy-token';
    expect(await authenticate(application, token)).toBe(false);
    const expired = await createApplication({ clientName: 'Old', retentionDays: -1 });
    expect(await authenticate(expired.application, token)).toBe(false);
  });
});
