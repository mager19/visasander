'use client';
import { useState, type FormEvent } from 'react';
import { mp } from '@/lib/paths';

export function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/manager/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (r.ok) { window.location.href = mp(); return; }
    setError(r.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'Contraseña incorrecta.');
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 420, margin: '10vh auto 0' }}>
      <h1>Panel del gestor</h1>
      <div className="field">
        <label htmlFor="pw">Contraseña</label>
        <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <span className="error" role="alert">{error}</span>}
      </div>
      <button className="btn btn-primary" disabled={busy || !password}>Entrar</button>
    </form>
  );
}
