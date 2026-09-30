import { randomUUID } from 'node:crypto';
import { FILE_KINDS, type FileKind } from './form/file-kinds';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

const IMAGES = ['image/jpeg', 'image/png'];
const ALLOWED: Record<FileKind, string[]> = {
  passport: [...IMAGES, 'application/pdf'],
  photo: IMAGES,
  national_id: [...IMAGES, 'application/pdf'],
  previous_visa: [...IMAGES, 'application/pdf'],
  employment_letter: [...IMAGES, 'application/pdf'],
};
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

export function validateUpload(kind: string, mime: string, size: number): null | 'invalid_kind' | 'invalid_type' | 'too_large' | 'empty' {
  if (!(FILE_KINDS as readonly string[]).includes(kind)) return 'invalid_kind';
  if (!ALLOWED[kind as FileKind].includes(mime)) return 'invalid_type';
  if (!Number.isFinite(size) || size <= 0) return 'empty';
  if (size > MAX_FILE_BYTES) return 'too_large';
  return null;
}

export const buildObjectKey = (applicationId: string, kind: FileKind, mime: string): string =>
  `apps/${applicationId}/${kind}/${randomUUID()}.${EXT[mime]}`;

/** Download name built from trusted values only (kind + mime), never from client input. */
export const downloadFilename = (kind: string, mime: string): string => {
  const base = kind.replace(/[^A-Za-z0-9_-]/g, '') || 'file';
  return `${base}.${EXT[mime] ?? 'bin'}`;
};

export const ownsKey = (applicationId: string, key: string): boolean =>
  key.startsWith(`apps/${applicationId}/`) && !key.includes('..');
