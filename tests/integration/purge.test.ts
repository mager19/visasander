import { expect, it, vi } from 'vitest';
import { purgeExpired, deleteApplicationWithFiles } from '@/lib/purge';
import { createApplication, getById } from '@/lib/repo/applications';
import { addFile } from '@/lib/repo/files';
import { describeDb, resetDb } from '../helpers/db';

describeDb('purgeExpired', () => {
  resetDb();

  it('deletes expired applications with both registered and orphaned files; keeps active ones', async () => {
    const old = await createApplication({ clientName: 'Old', retentionDays: -1 });
    const live = await createApplication({ clientName: 'Live' });
    const registeredKey = `apps/${old.application.id}/passport/a.jpg`;
    const orphanKey = `apps/${old.application.id}/photo/orphan.jpg`;
    await addFile({ applicationId: old.application.id, kind: 'passport', objectKey: registeredKey, mimeType: 'image/jpeg', sizeBytes: 5 });
    const remove = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([registeredKey, orphanKey]);
    expect(await purgeExpired(remove, list)).toEqual({ purged: 1, failed: 0 });
    expect(remove).toHaveBeenCalledWith(expect.arrayContaining([registeredKey, orphanKey]));
    expect(await getById(old.application.id)).toBeNull();
    expect(await getById(live.application.id)).not.toBeNull();
  });

  it('keeps the row when storage deletion fails, so it is retried next run', async () => {
    const old = await createApplication({ clientName: 'Old', retentionDays: -1 });
    const registeredKey = `apps/${old.application.id}/photo/a.jpg`;
    const orphanKey = `apps/${old.application.id}/photo/orphan.jpg`;
    await addFile({ applicationId: old.application.id, kind: 'photo', objectKey: registeredKey, mimeType: 'image/jpeg', sizeBytes: 5 });
    const remove = vi.fn().mockRejectedValue(new Error('r2 down'));
    const list = vi.fn().mockResolvedValue([registeredKey, orphanKey]);
    expect(await purgeExpired(remove, list)).toEqual({ purged: 0, failed: 1 });
    expect(await getById(old.application.id)).not.toBeNull();
  });

  it('deletes orphaned objects even when no file rows exist', async () => {
    const old = await createApplication({ clientName: 'Old', retentionDays: -1 });
    const orphanKey = `apps/${old.application.id}/photo/orphan.jpg`;
    const remove = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([orphanKey]);
    await deleteApplicationWithFiles(old.application.id, remove, list);
    expect(remove).toHaveBeenCalledWith([orphanKey]);
    expect(await getById(old.application.id)).toBeNull();
  });
});
