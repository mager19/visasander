'use client';
import { useState } from 'react';
import { submit } from '@/lib/client/api';
import { computeProgress } from '@/lib/form/progress';
import type { Answers } from '@/lib/form/types';

interface Props {
  token: string;
  shortId: string;
  answers: Answers;
  files: { kind: string }[];
  goToChapter: (chapterId: string) => void;
  back: () => void;
  /** True once the manager reviewed the application: summary only, no submit. */
  readOnly?: boolean;
}

type State = 'idle' | 'sending' | 'done' | 'reviewed' | 'unauthorized' | 'error';

export function Review({ token, shortId, answers, files, goToChapter, back, readOnly = false }: Props) {
  const [state, setState] = useState<State>('idle');
  const progress = computeProgress(answers, files.map((f) => f.kind));
  const locked = readOnly || state === 'reviewed';

  async function send() {
    setState('sending');
    const result = await submit(token);
    setState(result === 'ok' ? 'done' : result);
  }

  if (state === 'done') {
    return (
      <div className="notice" data-testid="submitted">
        <h1>¡Listo! Recibimos tu información</h1>
        <p className="muted">Tu gestor la revisará. Si falta algo, te lo hará saber. Tu ID es <strong>{shortId}</strong>.</p>
      </div>
    );
  }

  return (
    <div className="step">
      <h1>Revisión final</h1>
      <p className="muted">
        Avance total: {progress.percent}%.{' '}
        {locked ? 'Este es el resumen de tu información.' : 'Puedes enviar aunque falten datos; tu gestor te los pedirá.'}
      </p>
      {progress.chapters.map((c) => (
        <div className="card" key={c.id} style={{ marginBottom: 12 }}>
          <h2>{c.title}</h2>
          <p className="eyebrow">{c.missing.length === 0 ? '✓ Completa' : `⚠ Faltan ${c.missing.length}`}</p>
          {c.missing.length > 0 && <ul className="muted">{c.missing.slice(0, 6).map((m) => <li key={m}>{m}</li>)}{c.missing.length > 6 && <li>…y {c.missing.length - 6} más</li>}</ul>}
          {c.id !== 'files' && <button className="btn btn-ghost" onClick={() => goToChapter(c.id)}>{locked ? 'Ver' : 'Editar'}</button>}
        </div>
      ))}
      {locked && <p className="notice" role="alert">Tu gestor ya revisó tu información. Escríbele si necesitas hacer cambios.</p>}
      {state === 'unauthorized' && (
        <div className="notice" role="alert">
          <p>Tu sesión terminó. Vuelve a ingresar con tu código.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Ingresar de nuevo</button>
        </div>
      )}
      {state === 'error' && <p role="alert" style={{ color: 'var(--danger)' }}>No pudimos enviar. Inténtalo de nuevo.</p>}
      <div className="actions">
        {!locked && state !== 'unauthorized' && <button className="btn btn-primary" onClick={send} disabled={state === 'sending'}>Enviar solicitud</button>}
        <button className="btn btn-ghost" onClick={back}>Atrás</button>
      </div>
    </div>
  );
}
