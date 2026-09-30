import { deleteObjects } from './r2';
import { deleteApplication, listExpired } from './repo/applications';
import { fileKeys } from './repo/files';

type Remove = (keys: string[]) => Promise<void>;

/** Removes storage objects first; the DB row is only deleted once storage is clean. */
export async function deleteApplicationWithFiles(id: string, remove: Remove = deleteObjects): Promise<void> {
  const keys = await fileKeys(id);
  if (keys.length > 0) await remove(keys);
  await deleteApplication(id);
}

export async function purgeExpired(remove: Remove = deleteObjects): Promise<{ purged: number; failed: number }> {
  let purged = 0;
  let failed = 0;
  for (const app of await listExpired()) {
    try {
      await deleteApplicationWithFiles(app.id, remove);
      purged++;
    } catch {
      failed++;
    }
  }
  return { purged, failed };
}
