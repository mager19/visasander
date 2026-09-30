import { isUuid, json } from '@/lib/http';
import { requireManagerApi } from '@/lib/manager-auth';
import { deleteApplicationWithFiles } from '@/lib/purge';
import { extendExpiry, getById, markReviewed, regenerateCode, reopenApplication, setNotes, unlockApplication } from '@/lib/repo/applications';

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => json({ error: 'not_found' }, 404);

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const b = (await req.json().catch(() => null)) as { action?: unknown; days?: unknown; notes?: unknown } | null;
  switch (b?.action) {
    case 'regenerate_code': {
      const code = await regenerateCode(id);
      return code === null ? notFound() : json({ code });
    }
    case 'unlock': return (await unlockApplication(id)) ? json({ ok: true }) : notFound();
    case 'reviewed': {
      if (await markReviewed(id)) return json({ ok: true });
      // No row updated: either the id does not exist or the application is not in the submitted state.
      return (await getById(id)) ? json({ error: 'not_submitted' }, 409) : notFound();
    }
    case 'reopen': return (await reopenApplication(id)) ? json({ ok: true }) : notFound();
    case 'extend': {
      const days = typeof b.days === 'number' && b.days > 0 && b.days <= 365 ? Math.floor(b.days) : 30;
      return (await extendExpiry(id, days)) ? json({ ok: true }) : notFound();
    }
    case 'notes': return (await setNotes(id, typeof b.notes === 'string' ? b.notes : '')) ? json({ ok: true }) : notFound();
    default: return json({ error: 'invalid_action' }, 400);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id) || !(await getById(id))) return notFound();
  await deleteApplicationWithFiles(id);
  return json({ ok: true });
}
