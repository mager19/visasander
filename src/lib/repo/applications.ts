import { randomUUID } from 'node:crypto';
import { MAX_ATTEMPTS, retentionDays as defaultRetention } from '../constants';
import type { Answers } from '../form/types';
import { sql } from '../db';
import { generateAccessCode, generateShortId, generateToken, hashAccessCode } from '../security';

export type Status = 'created' | 'in_progress' | 'submitted' | 'reviewed';

export interface Application {
  id: string; token: string; shortId: string; clientName: string; codeHash: string; status: Status;
  answers: Answers; failedAttempts: number; locked: boolean; managerNotes: string;
  createdAt: string; updatedAt: string; submittedAt: string | null; reviewedAt: string | null; expiresAt: string;
}

const iso = (v: unknown): string => new Date(v as string).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApp(r: Record<string, any>): Application {
  return {
    id: r.id, token: r.token, shortId: r.short_id, clientName: r.client_name, codeHash: r.code_hash, status: r.status,
    answers: r.answers ?? {}, failedAttempts: r.failed_attempts, locked: r.locked, managerNotes: r.manager_notes,
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    submittedAt: r.submitted_at ? iso(r.submitted_at) : null, reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
    expiresAt: iso(r.expires_at),
  };
}

export async function createApplication(input: { clientName: string; retentionDays?: number }): Promise<{ application: Application; code: string }> {
  const id = randomUUID();
  const code = generateAccessCode();
  const days = input.retentionDays ?? defaultRetention();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await sql()`
        insert into applications (id, token, short_id, client_name, code_hash, expires_at)
        values (${id}, ${generateToken()}, ${generateShortId()}, ${input.clientName}, ${hashAccessCode(id, code)}, now() + make_interval(days => ${days}::int))
        returning *`;
      return { application: toApp(rows[0]), code };
    } catch (e) {
      if ((e as { code?: string }).code !== '23505') throw e;
    }
  }
  throw new Error('Could not allocate a unique short id');
}

export async function getByToken(token: string): Promise<Application | null> {
  const rows = await sql()`select * from applications where token = ${token}`;
  return rows[0] ? toApp(rows[0]) : null;
}

export async function getById(id: string): Promise<Application | null> {
  const rows = await sql()`select * from applications where id = ${id}`;
  return rows[0] ? toApp(rows[0]) : null;
}

export async function listApplications(filter: { q: string; status: string }): Promise<Application[]> {
  const rows = await sql()`
    select * from applications
    where (${filter.q}::text = '' or client_name ilike '%' || ${filter.q}::text || '%' or short_id ilike '%' || ${filter.q}::text || '%')
      and (${filter.status}::text = '' or status = ${filter.status}::text)
    order by created_at desc`;
  return rows.map(toApp);
}

export async function saveAnswers(id: string, patch: Answers): Promise<void> {
  await sql()`update applications set answers = answers || ${JSON.stringify(patch)}::jsonb, updated_at = now() where id = ${id}`;
}

export async function setInProgress(id: string): Promise<void> {
  await sql()`update applications set status = 'in_progress', updated_at = now() where id = ${id} and status = 'created'`;
}

export async function submitApplication(id: string): Promise<void> {
  await sql()`update applications set status = 'submitted', submitted_at = now(), updated_at = now() where id = ${id}`;
}

export async function markReviewed(id: string): Promise<void> {
  await sql()`update applications set status = 'reviewed', reviewed_at = now(), updated_at = now() where id = ${id}`;
}

export async function claimAttempt(id: string): Promise<number | null> {
  const rows = await sql()`update applications set failed_attempts = failed_attempts + 1 where id = ${id} and not locked and failed_attempts < ${MAX_ATTEMPTS}::int returning failed_attempts`;
  return rows[0] ? (rows[0].failed_attempts as number) : null;
}

export async function lockApplication(id: string): Promise<void> {
  await sql()`update applications set locked = true where id = ${id}`;
}

export async function resetAttempts(id: string): Promise<boolean> {
  const rows = await sql()`update applications set failed_attempts = 0 where id = ${id} and not locked returning id`;
  return rows.length > 0;
}

export async function regenerateCode(id: string): Promise<string> {
  const code = generateAccessCode();
  await sql()`update applications set code_hash = ${hashAccessCode(id, code)}, failed_attempts = 0, locked = false where id = ${id}`;
  await sql()`delete from sessions where application_id = ${id}`;
  return code;
}

export async function unlockApplication(id: string): Promise<void> {
  await sql()`update applications set failed_attempts = 0, locked = false where id = ${id}`;
}

export async function setNotes(id: string, notes: string): Promise<void> {
  await sql()`update applications set manager_notes = ${notes.slice(0, 5000)} where id = ${id}`;
}

export async function extendExpiry(id: string, days: number): Promise<void> {
  await sql()`update applications set expires_at = greatest(expires_at, now()) + make_interval(days => ${days}::int) where id = ${id}`;
}

export async function deleteApplication(id: string): Promise<void> {
  await sql()`delete from applications where id = ${id}`;
}

export async function listExpired(): Promise<Application[]> {
  const rows = await sql()`select * from applications where expires_at < now()`;
  return rows.map(toApp);
}
