import { describe, expect, it } from 'vitest';
import { sanitizePatch, validatePatch } from '@/lib/form/patch';

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

describe('validatePatch', () => {
  const today = new Date(2026, 8, 30);
  const check = (patch: Record<string, unknown>, stored: Record<string, unknown> = {}) => validatePatch(patch, stored, today);

  it('accepts valid values and empty strings (clearing a field)', () => {
    expect(check({ correo: 'a@b.co', sexo: 'F', fecha_nacimiento: '1990-05-15', idiomas: 'es,en', cedula: '' })).toEqual([]);
    expect(check({ correo: '', fecha_nacimiento: '', sexo: '' })).toEqual([]);
  });
  it('rejects format errors and reports only keys', () => {
    expect(check({ correo: 'nope', telefono_principal: '12', fecha_nacimiento: '2026-02-30' })).toEqual(['correo', 'telefono_principal', 'fecha_nacimiento']);
  });
  it('rejects options that are not allowed', () => {
    expect(check({ sexo: 'X', otras_nacionalidades: 'maybe', idiomas: 'es,xx' })).toEqual(['sexo', 'otras_nacionalidades', 'idiomas']);
  });
  it('rejects out-of-range dates', () => {
    expect(check({ fecha_nacimiento: '2030-01-01', pasaporte_expedicion: '1990-01-01' })).toEqual(['fecha_nacimiento', 'pasaporte_expedicion']);
  });
  it('checks cross-field rules against the stored answers', () => {
    expect(check({ pasaporte_caducidad: '2020-01-01' }, { pasaporte_expedicion: '2020-01-01' })).toEqual(['pasaporte_caducidad']);
    expect(check({ pasaporte_caducidad: '2019-01-01' }, { pasaporte_expedicion: '2020-01-01' })).toEqual(['pasaporte_caducidad']);
    expect(check({ pasaporte_caducidad: '2030-01-01' }, { pasaporte_expedicion: '2020-01-01' })).toEqual([]);
    expect(check({ pasaporte_expedicion: '2020-01-01', pasaporte_caducidad: '2019-01-01' })).toEqual(['pasaporte_caducidad']);
  });
  it('rejects a city that is not in the department', () => {
    expect(check({ ciudad_nacimiento: 'Medellín' }, { departamento_nacimiento: 'Valle del Cauca' })).toEqual(['ciudad_nacimiento']);
    expect(check({ ciudad_nacimiento: 'Cali', departamento_nacimiento: 'Valle del Cauca' })).toEqual([]);
    expect(check({ departamento_nacimiento: 'Narnia' })).toEqual(['departamento_nacimiento']);
  });
  it('validates repeat entries within each entry', () => {
    const ok = [{ empresa: 'ACME', inicio: '2019-01-01', fin: '2020-01-01' }, { empresa: 'B', inicio: '', fin: '' }];
    expect(check({ empleos_previos: ok })).toEqual([]);
    expect(check({ empleos_previos: [{ empresa: 'ACME', inicio: '2020-01-01', fin: '2019-01-01' }] })).toEqual(['empleos_previos']);
    expect(check({ educacion: [{ institucion: 'U', nivel: 'nope' }] })).toEqual(['educacion']);
    expect(check({ empleos_previos__none: true })).toEqual([]);
  });
});
