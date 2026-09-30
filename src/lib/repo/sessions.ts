import { randomUUID } from 'node:crypto';
import { MAX_SESSIONS } from '../constants';
import { sql } from '../db';
import { generateToken, hmac } from '../security';

export async function createSession(applicationId: string, userAgent: string): Promise<string> {
  const token = generateToken();
  await sql()`insert into sessions (id, application_id, token_hash, user_agent) values (${randomUUID()}, ${applicationId}, ${hmac(token)}, ${userAgent})`;
  await sql()`
    delete from sessions where application_id = ${applicationId} and id not in (
      select id from sessions where application_id = ${applicationId} order by last_seen_at desc, created_at desc limit ${MAX_SESSIONS}::int
    )`;
  return token;
}

export async function touchSession(applicationId: string, token: string): Promise<boolean> {
  const rows = await sql()`update sessions set last_seen_at = now() where application_id = ${applicationId} and token_hash = ${hmac(token)} returning id`;
  return rows.length > 0;
}

export async function deleteSessions(applicationId: string): Promise<void> {
  await sql()`delete from sessions where application_id = ${applicationId}`;
}

export async function sessionStats(applicationId: string): Promise<{ count: number; lastSeenAt: string | null }> {
  const rows = await sql()`select count(*)::int as n, max(last_seen_at) as last from sessions where application_id = ${applicationId}`;
  return { count: rows[0].n as number, lastSeenAt: rows[0].last ? new Date(rows[0].last as string).toISOString() : null };
}
