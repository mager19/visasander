import { describe, expect, it } from 'vitest';
import {
  generateAccessCode, generateShortId, generateToken, hashAccessCode, hashPassword,
  normalizeCode, safeEqual, signValue, verifyPassword, verifySigned,
} from '@/lib/security';

describe('access codes', () => {
  it('generates 6-digit strings, keeping leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(generateAccessCode()).toMatch(/^\d{6}$/);
  });
  it('normalizes spaces, dashes and other formatting', () => {
    expect(normalizeCode('004 217')).toBe('004217');
    expect(normalizeCode(' 004-217\n')).toBe('004217');
  });
  it('hashes per application and is deterministic', () => {
    expect(hashAccessCode('a', '123456')).toBe(hashAccessCode('a', '123456'));
    expect(hashAccessCode('a', '123456')).not.toBe(hashAccessCode('b', '123456'));
  });
});

describe('identifiers', () => {
  it('creates readable short ids and long tokens', () => {
    expect(generateShortId()).toMatch(/^VZ-[2-9A-HJKMNP-Z]{4}$/);
    expect(generateToken().length).toBeGreaterThanOrEqual(32);
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe('passwords and signed values', () => {
  it('verifies passwords', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });
  it('detects tampering of signed values', () => {
    const signed = signValue('mgr:123');
    expect(verifySigned(signed)).toBe('mgr:123');
    expect(verifySigned(signed.replace('mgr:123', 'mgr:999'))).toBeNull();
    expect(verifySigned('nodots')).toBeNull();
  });
  it('safeEqual handles different lengths', () => {
    expect(safeEqual('a', 'ab')).toBe(false);
    expect(safeEqual('ab', 'ab')).toBe(true);
  });
});
