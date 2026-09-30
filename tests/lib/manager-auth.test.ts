import { describe, expect, it } from 'vitest';
import { createManagerCookieValue, verifyManagerCookieValue } from '@/lib/manager-auth';

describe('manager cookie', () => {
  it('verifies a fresh value and rejects expired, tampered, and empty values', () => {
    const now = 1_000_000;
    const v = createManagerCookieValue(now);
    expect(verifyManagerCookieValue(v, now + 1000)).toBe(true);
    expect(verifyManagerCookieValue(v, now + 13 * 3600_000)).toBe(false);
    expect(verifyManagerCookieValue(v.replace('mgr:', 'mgr:9'), now)).toBe(false);
    expect(verifyManagerCookieValue(undefined, now)).toBe(false);
    expect(verifyManagerCookieValue('mgr:99999999999999.bad', now)).toBe(false);
  });
});
