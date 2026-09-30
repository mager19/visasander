import type { Answers } from '../form/types';

export interface ApplicantState {
  clientName: string;
  shortId: string;
  status: 'created' | 'in_progress' | 'submitted' | 'reviewed';
  answers: Answers;
  files: { id: string; kind: string }[];
}

/** 'reviewed' = the manager already reviewed the application (HTTP 409); edits are locked. 'unauthorized' = session ended (HTTP 401). */
export type MutationResult = 'ok' | 'reviewed' | 'unauthorized' | 'error';

const base = (token: string) => `/api/s/${token}`;
const headers = { 'content-type': 'application/json' };

function toResult(r: Response): MutationResult {
  if (r.ok) return 'ok';
  if (r.status === 409) return 'reviewed';
  return r.status === 401 ? 'unauthorized' : 'error';
}

export async function fetchState(token: string): Promise<ApplicantState | null> {
  const r = await fetch(`${base(token)}/state`, { cache: 'no-store' });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error('state');
  return r.json();
}

export async function saveAnswers(token: string, patch: Answers): Promise<MutationResult> {
  try {
    return toResult(await fetch(`${base(token)}/answers`, { method: 'PATCH', headers, body: JSON.stringify({ patch }) }));
  } catch {
    return 'error';
  }
}

export async function submit(token: string): Promise<MutationResult> {
  try {
    return toResult(await fetch(`${base(token)}/submit`, { method: 'POST' }));
  } catch {
    return 'error';
  }
}
