'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mp } from '@/lib/paths';
import { CopyButton } from './CopyButton';

interface Props { id: string; locked: boolean; status: string; initialNotes: string }
type Message = { kind: 'ok' | 'error'; text: string } | null;

const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.';

export function DetailActions({ id, locked, status, initialNotes }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [newCode, setNewCode] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function act(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/manager/applications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 401) { window.location.href = mp('/login'); return; }
      if (r.status === 409) { setMessage({ kind: 'error', text: 'Solo se puede marcar como revisada una solicitud ya enviada.' }); return; }
      if (!r.ok) { setMessage({ kind: 'error', text: GENERIC_ERROR }); return; }
      const data = await r.json().catch(() => ({}));
      if (data.code) setNewCode(data.code);
      setMessage({ kind: 'ok', text: okText });
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: GENERIC_ERROR });
    } finally {
      setBusy(false);
      setConfirmRegenerate(false);
      setConfirmDelete(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/manager/applications/${id}`, { method: 'DELETE' });
      if (r.status === 401) { window.location.href = mp('/login'); return; }
      if (!r.ok) { setMessage({ kind: 'error', text: GENERIC_ERROR }); return; }
      window.location.href = mp();
    } catch {
      setMessage({ kind: 'error', text: GENERIC_ERROR });
    } finally {
      setBusy(false);
      setConfirmRegenerate(false);
      setConfirmDelete(false);
    }
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <h2>Acciones</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {locked && <button className="btn btn-ghost" disabled={busy} onClick={() => act({ action: 'unlock' }, 'Solicitud desbloqueada')}>Desbloquear</button>}
        <button className="btn btn-ghost" disabled={busy} onClick={() => { setConfirmDelete(false); setConfirmRegenerate(true); }}>Regenerar código</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => act({ action: 'extend', days: 30 }, 'Vencimiento extendido 30 días')}>Extender 30 días</button>
        {status === 'submitted' && <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={() => act({ action: 'reviewed' }, 'Marcada como revisada')}>Marcar como revisada</button>}
      </div>
      {(status === 'created' || status === 'in_progress') && <p className="muted" style={{ margin: 0 }}>Disponible cuando el cliente envíe su información.</p>}
      {confirmRegenerate && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0 }}>Esto invalida el código actual y cierra las sesiones del cliente.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} disabled={busy} onClick={() => act({ action: 'regenerate_code' }, 'Código regenerado. Los dispositivos anteriores ya no tienen acceso.')}>Confirmar: regenerar código</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmRegenerate(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {status === 'reviewed' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div><button className="btn btn-ghost" disabled={busy} onClick={() => act({ action: 'reopen' }, 'Reabierta para el cliente')}>Reabrir para el cliente</button></div>
          <p className="muted" style={{ margin: 0 }}>Permite que el cliente vuelva a editar su información.</p>
        </div>
      )}
      {newCode && <p>Nuevo código: <strong data-testid="regenerated-code" style={{ fontSize: 24, letterSpacing: 4 }}>{newCode}</strong> <CopyButton text={newCode} label="Copiar" /></p>}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="notes">Notas internas (el cliente no las ve)</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn btn-ghost" disabled={busy} onClick={() => act({ action: 'notes', notes }, 'Notas guardadas')}>Guardar notas</button>
      {confirmDelete
        ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} disabled={busy} onClick={remove}>Confirmar: borrar datos y archivos</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button>
          </div>
        )
        : <button className="btn btn-ghost" disabled={busy} onClick={() => { setConfirmRegenerate(false); setConfirmDelete(true); }}>Borrar solicitud</button>}
      {message && (message.kind === 'ok'
        ? <p role="status" style={{ margin: 0 }}>{message.text}</p>
        : <p role="alert" className="error" style={{ margin: 0, color: 'var(--danger)' }}>{message.text}</p>)}
    </section>
  );
}
