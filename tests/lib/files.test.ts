import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, buildObjectKey, ownsKey, validateUpload } from '@/lib/files';

describe('validateUpload', () => {
  it('accepts allowed type/size combinations', () => {
    expect(validateUpload('passport', 'image/jpeg', 1000)).toBeNull();
    expect(validateUpload('national_id', 'application/pdf', 1000)).toBeNull();
  });
  it('rejects PDFs for the visa photo', () => {
    expect(validateUpload('photo', 'application/pdf', 1000)).toBe('invalid_type');
  });
  it('rejects unknown kinds, types, empty and oversized files', () => {
    expect(validateUpload('selfie', 'image/png', 10)).toBe('invalid_kind');
    expect(validateUpload('passport', 'image/gif', 10)).toBe('invalid_type');
    expect(validateUpload('passport', 'image/png', 0)).toBe('empty');
    expect(validateUpload('passport', 'image/png', MAX_FILE_BYTES + 1)).toBe('too_large');
  });
});

describe('object keys', () => {
  it('builds keys scoped to the application with the right extension', () => {
    const key = buildObjectKey('app-1', 'passport', 'image/jpeg');
    expect(key).toMatch(/^apps\/app-1\/passport\/[0-9a-f-]+\.jpg$/);
  });
  it('only owns keys under its own prefix and rejects traversal', () => {
    expect(ownsKey('app-1', 'apps/app-1/passport/x.jpg')).toBe(true);
    expect(ownsKey('app-1', 'apps/app-2/passport/x.jpg')).toBe(false);
    expect(ownsKey('app-1', 'apps/app-1/../app-2/x.jpg')).toBe(false);
    expect(ownsKey('app-1', 'apps/app-10/x.jpg')).toBe(false);
  });
});
