import { describe, expect, it } from 'vitest';
import { isUuid } from '@/lib/http';

describe('isUuid', () => {
  it('accepts canonical UUIDs', () => {
    expect(isUuid('3f2b8c1e-9a4d-4e6b-8c1d-2a7f5e9b0c34')).toBe(true);
    expect(isUuid('3F2B8C1E-9A4D-4E6B-8C1D-2A7F5E9B0C34')).toBe(true);
  });
  it('rejects anything else', () => {
    for (const v of ['', 'abc', '3f2b8c1e9a4d4e6b8c1d2a7f5e9b0c34', '3f2b8c1e-9a4d-4e6b-8c1d-2a7f5e9b0c3', '3f2b8c1e-9a4d-4e6b-8c1d-2a7f5e9b0c34x', "' or 1=1 --"]) {
      expect(isUuid(v)).toBe(false);
    }
  });
});
