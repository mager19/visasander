import { expect, it, vi } from 'vitest';
import { purgeExpired } from '@/lib/purge';
import { createApplication, getById } from '@/lib/repo/applications';
import { addFile } from '@/lib/repo/files';
import { describeDb, resetDb } from '../helpers/db';

describeDb('purgeExpired', () => {
  resetDb();

  it('deletes expired applications after removing their storage objects; keeps active ones', async () => {
    const old = await createApplication({ clientName: 'Old', retentionDays: -1 });
    const live = await createApplication({ clientName: 'Live' });
    await addFile({ applicationId: old.application.id, kind: 'passport', objectKey: `apps/${old.application.id}/passport/a.jpg`, mimeType: 'image/jpeg', sizeBytes: 5 });
    const remove = vi.fn().mockResolvedValue(undefined);
    expect(await purgeExpired(remove)).toEqual({ purged: 1, failed: 0 });
    expect(remove).toHaveBeenCalledWith([`apps/${old.application.id}/passport/a.jpg`]);
    expect(await getById(old.application.id)).toBeNull();
    expect(await getById(live.application.id)).not.toBeNull();
  });

  it('keeps the row when storage deletion fails, so it is retried next run', async () => {
    const old = await createApplication({ clientName: 'Old', retentionDays: -1 });
    await addFile({ applicationId: old.application.id, kind: 'photo', objectKey: `apps/${old.application.id}/photo/a.jpg`, mimeType: 'image/jpeg', sizeBytes: 5 });
    const remove = vi.fn().mockRejectedValue(new Error('r2 down'));
    expect(await purgeExpired(remove)).toEqual({ purged: 0, failed: 1 });
    expect(await getById(old.application.id)).not.toBeNull();
  });
});
