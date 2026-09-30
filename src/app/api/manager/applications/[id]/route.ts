import { json } from '@/lib/http';
import { requireManagerApi } from '@/lib/manager-auth';
import { deleteApplicationWithFiles } from '@/lib/purge';
import { extendExpiry, markReviewed, regenerateCode, reopenApplication, setNotes, unlockApplication } from '@/lib/repo/applications';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as { action?: unknown; days?: unknown; notes?: unknown } | null;
  switch (b?.action) {
    case 'regenerate_code': return json({ code: await regenerateCode(id) });
    case 'unlock': await unlockApplication(id); return json({ ok: true });
    case 'reviewed': await markReviewed(id); return json({ ok: true });
    case 'reopen': await reopenApplication(id); return json({ ok: true });
    case 'extend': {
      const days = typeof b.days === 'number' && b.days > 0 && b.days <= 365 ? Math.floor(b.days) : 30;
      await extendExpiry(id, days);
      return json({ ok: true });
    }
    case 'notes': await setNotes(id, typeof b.notes === 'string' ? b.notes : ''); return json({ ok: true });
    default: return json({ error: 'invalid_action' }, 400);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireManagerApi();
  if (denied) return denied;
  await deleteApplicationWithFiles((await params).id);
  return json({ ok: true });
}
