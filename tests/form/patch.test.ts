import { describe, expect, it } from 'vitest';
import { sanitizePatch } from '@/lib/form/patch';

describe('sanitizePatch', () => {
  it('accepts known keys, trims strings, and accepts repeat arrays and none flags', () => {
    expect(sanitizePatch({ apellidos: '  Pérez ', redes_sociales: [{ plataforma: 'IG', usuario: 'ana' }], redes_sociales__none: false })).toEqual({
      apellidos: 'Pérez',
      redes_sociales: [{ plataforma: 'IG', usuario: 'ana' }],
      redes_sociales__none: false,
    });
  });
  it('rejects unknown keys', () => {
    expect(sanitizePatch({ hacked: 'x' })).toBeNull();
    expect(sanitizePatch({ __proto__x: 'x' })).toBeNull();
  });
  it('rejects prototype-style keys even when they are real own keys', () => {
    expect(sanitizePatch(JSON.parse('{"__proto__":"x"}'))).toBeNull();
    expect(sanitizePatch(JSON.parse('{"constructor":"x"}'))).toBeNull();
  });
  it('rejects NUL characters in strings and repeat sub-values', () => {
    expect(sanitizePatch({ apellidos: 'Pe\u0000rez' })).toBeNull();
    expect(sanitizePatch({ redes_sociales: [{ plataforma: 'IG', usuario: 'a\u0000na' }] })).toBeNull();
  });
  it('rejects wrong types', () => {
    expect(sanitizePatch({ apellidos: 5 })).toBeNull();
    expect(sanitizePatch({ redes_sociales__none: 'yes' })).toBeNull();
    expect(sanitizePatch({ redes_sociales: 'x' })).toBeNull();
    expect(sanitizePatch(null)).toBeNull();
    expect(sanitizePatch([])).toBeNull();
  });
  it('rejects unknown repeat sub-keys and oversized input', () => {
    expect(sanitizePatch({ redes_sociales: [{ plataforma: 'IG', evil: 'x' }] })).toBeNull();
    expect(sanitizePatch({ apellidos: 'x'.repeat(2001) })).toBeNull();
    expect(sanitizePatch({ redes_sociales: Array.from({ length: 21 }, () => ({ plataforma: 'a' })) })).toBeNull();
  });
});
