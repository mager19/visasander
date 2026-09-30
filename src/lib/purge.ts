import { deleteObjects, listObjectKeys } from './r2';
import { cleanupRateLimits } from './rate-limit';
import { deleteApplication, listExpired } from './repo/applications';
import { fileKeys } from './repo/files';

type Remove = (keys: string[]) => Promise<void>;
type List = (prefix: string) => Promise<string[]>;

/** Removes storage objects first; the DB row is only deleted once storage is clean. */
export async function deleteApplicationWithFiles(id: string, remove: Remove = deleteObjects, list: List = listObjectKeys): Promise<void> {
  const registeredKeys = await fileKeys(id);
  const orphanedKeys = await list(`apps/${id}/`);
  const keys = Array.from(new Set([...registeredKeys, ...orphanedKeys]));
  if (keys.length > 0) await remove(keys);
  await deleteApplication(id);
}

export async function purgeExpired(remove: Remove = deleteObjects, list: List = listObjectKeys): Promise<{ purged: number; failed: number }> {
  try {
    await cleanupRateLimits();
  } catch {
    /* housekeeping only: must never affect the purge result */
  }
  let purged = 0;
  let failed = 0;
  for (const app of await listExpired()) {
    try {
      await deleteApplicationWithFiles(app.id, remove, list);
      purged++;
    } catch {
      failed++;
    }
  }
  return { purged, failed };
}
