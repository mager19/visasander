'use client';
import { useEffect, useState } from 'react';
import { fetchState, type ApplicantState } from '@/lib/client/api';
import { CodeGate } from './CodeGate';
import { Wizard } from './Wizard';

type Phase = { kind: 'loading' } | { kind: 'gate' } | { kind: 'ready'; state: ApplicantState } | { kind: 'error' };

export function ApplicantApp({ token, firstName }: { token: string; firstName: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  async function load() {
    try {
      const state = await fetchState(token);
      setPhase(state ? { kind: 'ready', state } : { kind: 'gate' });
    } catch {
      setPhase({ kind: 'error' });
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase.kind === 'loading') return <main className="shell"><p className="muted">Cargando…</p></main>;
  if (phase.kind === 'error') return <main className="shell"><div className="notice"><h1>No pudimos cargar</h1><button className="btn btn-primary" onClick={load}>Reintentar</button></div></main>;
  if (phase.kind === 'gate') return <CodeGate token={token} firstName={firstName} onSuccess={load} />;
  return <Wizard token={token} initial={phase.state} />;
}
