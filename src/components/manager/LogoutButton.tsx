'use client';
import { useState } from 'react';
import { mp } from '@/lib/paths';

export function LogoutButton() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/manager/logout', { method: 'POST' });
      if (r.ok || r.status === 401) { window.location.href = mp('/login'); return; }
      setError('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } catch {
      setError('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    }
    setBusy(false);
  }
  return (
    <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
      <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} disabled={busy} onClick={logout}>Salir</button>
      {error && <span className="error" role="alert" style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</span>}
    </div>
  );
}
