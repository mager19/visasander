import { randomUUID } from 'node:crypto';
import { sql } from '../db';

export interface FileRow { id: string; applicationId: string; kind: string; objectKey: string; mimeType: string; sizeBytes: number; uploadedAt: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFile = (r: Record<string, any>): FileRow => ({
  id: r.id, applicationId: r.application_id, kind: r.kind, objectKey: r.object_key, mimeType: r.mime_type,
  sizeBytes: Number(r.size_bytes), uploadedAt: new Date(r.uploaded_at).toISOString(),
});

export async function addFile(input: { applicationId: string; kind: string; objectKey: string; mimeType: string; sizeBytes: number }): Promise<string> {
  const id = randomUUID();
  await sql()`insert into files (id, application_id, kind, object_key, mime_type, size_bytes) values (${id}, ${input.applicationId}, ${input.kind}, ${input.objectKey}, ${input.mimeType}, ${input.sizeBytes})`;
  return id;
}

export async function listFiles(applicationId: string): Promise<FileRow[]> {
  return (await sql()`select * from files where application_id = ${applicationId} order by uploaded_at`).map(toFile);
}

export async function getFile(id: string): Promise<FileRow | null> {
  const rows = await sql()`select * from files where id = ${id}`;
  return rows[0] ? toFile(rows[0]) : null;
}

export async function deleteFileRow(id: string): Promise<void> {
  await sql()`delete from files where id = ${id}`;
}

export async function fileKeys(applicationId: string): Promise<string[]> {
  return (await sql()`select object_key from files where application_id = ${applicationId}`).map((r) => r.object_key as string);
}

/** Small-scale helper for the manager list: all (application, kind) pairs grouped by application. */
export async function allFileKinds(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const r of await sql()`select application_id, kind from files`) (out[r.application_id as string] ??= []).push(r.kind as string);
  return out;
}
