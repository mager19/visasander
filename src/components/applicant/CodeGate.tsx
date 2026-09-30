'use client';
import { useState, type FormEvent } from 'react';

const MESSAGES: Record<string, string> = {
  invalid_code: 'Código incorrecto.',
  locked: 'Acceso bloqueado. Escríbele a tu gestor para que lo desbloquee.',
  expired: 'Este enlace venció. Pide uno nuevo a tu gestor.',
  rate_limited: 'Demasiados intentos. Espera unos minutos.',
  not_found: 'Enlace no válido.',
};

export function CodeGate({ token, firstName, onSuccess }: { token: string; firstName: string; onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/s/${token}/access`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      if (r.ok) return onSuccess();
      const body = (await r.json().catch(() => ({}))) as { reason?: string; attemptsLeft?: number };
      const base = MESSAGES[body.reason ?? ''] ?? 'No pudimos validar el código.';
      setError(body.reason === 'invalid_code' && body.attemptsLeft !== undefined ? `${base} Te quedan ${body.attemptsLeft} intentos.` : base);
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <form className="card" onSubmit={submit}>
        <p className="eyebrow">Solicitud de visa</p>
        <h1>Hola, {firstName}</h1>
        <p className="muted">Escribe el código de 6 dígitos que te entregó tu gestor.</p>
        <div className="field">
          <label htmlFor="code">Código de acceso</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={9} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!error} aria-describedby={error ? 'code-err' : undefined} />
          {error && <span id="code-err" className="error" role="alert">{error}</span>}
        </div>
        <button className="btn btn-primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>Entrar</button>
      </form>
    </main>
  );
}
