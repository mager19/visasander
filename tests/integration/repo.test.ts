import { expect, it } from 'vitest';
import { hit } from '@/lib/rate-limit';
import { createApplication, getById, getByToken, recordFailedAttempt, saveAnswers, listApplications } from '@/lib/repo/applications';
import { addFile, allFileKinds, fileKeys } from '@/lib/repo/files';
import { createSession, sessionStats, touchSession } from '@/lib/repo/sessions';
import { describeDb, resetDb } from '../helpers/db';

describeDb('repositories', () => {
  resetDb();

  it('creates an application with hashed code, short id, token and expiry', async () => {
    const { application, code } = await createApplication({ clientName: 'Ana' });
    expect(code).toMatch(/^\d{6}$/);
    expect(application.codeHash).not.toContain(code);
    expect(application.shortId).toMatch(/^VZ-/);
    expect((await getByToken(application.token))!.id).toBe(application.id);
    expect(new Date(application.expiresAt).getTime()).toBeGreaterThan(Date.now() + 80 * 86_400_000);
  });

  it('merges answer patches without clobbering other keys, even concurrently', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    await Promise.all([
      saveAnswers(application.id, { apellidos: 'Pérez' }),
      saveAnswers(application.id, { nombres: 'Ana' }),
    ]);
    const saved = (await getById(application.id))!;
    expect(saved.answers).toMatchObject({ apellidos: 'Pérez', nombres: 'Ana' });
  });

  it('counts failed attempts and locks at the limit', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    let last = { failedAttempts: 0, locked: false };
    for (let i = 0; i < 5; i++) last = await recordFailedAttempt(application.id);
    expect(last).toEqual({ failedAttempts: 5, locked: true });
  });

  it('keeps only the 2 most recent sessions and touches by token', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    const t1 = await createSession(application.id, 'a');
    const t2 = await createSession(application.id, 'b');
    const t3 = await createSession(application.id, 'c');
    expect(await touchSession(application.id, t1)).toBe(false);
    expect(await touchSession(application.id, t2)).toBe(true);
    expect(await touchSession(application.id, t3)).toBe(true);
    expect((await sessionStats(application.id)).count).toBe(2);
  });

  it('stores files and groups kinds by application', async () => {
    const { application } = await createApplication({ clientName: 'Ana' });
    await addFile({ applicationId: application.id, kind: 'passport', objectKey: `apps/${application.id}/passport/1.jpg`, mimeType: 'image/jpeg', sizeBytes: 10 });
    expect(await fileKeys(application.id)).toHaveLength(1);
    expect((await allFileKinds())[application.id]).toEqual(['passport']);
  });

  it('filters the list by name, short id and status', async () => {
    const a = await createApplication({ clientName: 'Ana Gómez' });
    await createApplication({ clientName: 'Luis Pérez' });
    expect((await listApplications({ q: 'gómez', status: '' })).map((x) => x.id)).toEqual([a.application.id]);
    expect((await listApplications({ q: a.application.shortId.toLowerCase(), status: '' })).length).toBe(1);
    expect(await listApplications({ q: '', status: 'submitted' })).toHaveLength(0);
  });

  it('rate limits within a window', async () => {
    expect(await hit('k', 2, 60)).toBe(true);
    expect(await hit('k', 2, 60)).toBe(true);
    expect(await hit('k', 2, 60)).toBe(false);
    expect(await hit('other', 2, 60)).toBe(true);
  });
});
