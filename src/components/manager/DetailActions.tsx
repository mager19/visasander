'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mp } from '@/lib/paths';
import { CopyButton } from './CopyButton';

interface Props { id: string; locked: boolean; status: string; initialNotes: string }

export function DetailActions({ id, locked, status, initialNotes }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [newCode, setNewCode] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function act(body: Record<string, unknown>) {
    const r = await fetch(`/api/manager/applications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { const data = await r.json(); if (data.code) setNewCode(data.code); router.refresh(); }
  }
  async function remove() {
    const r = await fetch(`/api/manager/applications/${id}`, { method: 'DELETE' });
    if (r.ok) window.location.href = mp();
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <h2>Acciones</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {locked && <button className="btn btn-ghost" onClick={() => act({ action: 'unlock' })}>Desbloquear</button>}
        <button className="btn btn-ghost" onClick={() => act({ action: 'regenerate_code' })}>Regenerar código</button>
        <button className="btn btn-ghost" onClick={() => act({ action: 'extend', days: 30 })}>Extender 30 días</button>
        {status !== 'reviewed' && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => act({ action: 'reviewed' })}>Marcar como revisada</button>}
      </div>
      {status === 'reviewed' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div><button className="btn btn-ghost" onClick={() => act({ action: 'reopen' })}>Reabrir para el cliente</button></div>
          <p className="muted" style={{ margin: 0 }}>Permite que el cliente vuelva a editar su información.</p>
        </div>
      )}
      {newCode && <p>Nuevo código: <strong data-testid="regenerated-code" style={{ fontSize: 24, letterSpacing: 4 }}>{newCode}</strong> <CopyButton text={newCode} label="Copiar" /></p>}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="notes">Notas internas (el cliente no las ve)</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn btn-ghost" onClick={() => act({ action: 'notes', notes })}>Guardar notas</button>
      {confirmDelete
        ? <button className="btn btn-ghost" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={remove}>Confirmar: borrar datos y archivos</button>
        : <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Borrar solicitud</button>}
    </section>
  );
}
