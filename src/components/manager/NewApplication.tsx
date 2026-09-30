'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CopyButton } from './CopyButton';

interface Created { shortId: string; link: string; code: string }

export function NewApplication() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/manager/applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientName: name }) });
    setBusy(false);
    if (!r.ok) return setError('No se pudo crear la solicitud.');
    setCreated(await r.json());
    setName('');
    router.refresh();
  }

  const whatsapp = created ? `https://wa.me/?text=${encodeURIComponent(`Hola, este es tu enlace para completar tu información de visa: ${created.link}\nTe envío el código de acceso por separado.`)}` : '';

  return (
    <section className="card">
      <h2>Nueva solicitud</h2>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="client-name">Nombre del cliente</label>
          <input id="client-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>Crear solicitud</button>
      </form>
      {created && (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <p className="eyebrow">ID {created.shortId}</p>
          <p>Enlace: <code data-testid="new-link" style={{ wordBreak: 'break-all' }}>{created.link}</code></p>
          <p>Código de acceso: <strong data-testid="new-code" style={{ fontSize: 24, letterSpacing: 4 }}>{created.code}</strong></p>
          <p className="muted">El código se muestra una sola vez. Entrégalo por un canal distinto al del enlace.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CopyButton text={created.link} label="Copiar enlace" />
            <CopyButton text={created.code} label="Copiar código" />
            <a className="btn btn-ghost" style={{ minHeight: 40 }} href={whatsapp} target="_blank" rel="noreferrer">Compartir por WhatsApp</a>
          </div>
        </div>
      )}
    </section>
  );
}
