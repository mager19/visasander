import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '@/lib/form/schema';
import { buildSkipPayload, clearDependents } from '@/lib/form/skip';
import { validatePatch } from '@/lib/form/patch';
import type { Field } from '@/lib/form/types';

const TODAY = new Date(2026, 8, 30);
const screen = (id: string) => CHAPTERS.flatMap((c) => c.screens).find((s) => s.id === id)!;
const dates = screen('passport_dates').fields;
const birth = screen('birth_place').fields;

describe('buildSkipPayload', () => {
  it('leaves an all-valid screen untouched', () => {
    const values = { pasaporte_expedicion: '2020-01-01', pasaporte_caducidad: '2030-01-01' };
    expect(buildSkipPayload(dates, values, {}, TODAY)).toEqual(values);
  });
  it('keeps empty values as empty and sends invalid values as empty', () => {
    expect(buildSkipPayload(dates, { pasaporte_expedicion: '', pasaporte_caducidad: '2030-02-30' }, {}, TODAY)).toEqual({ pasaporte_expedicion: '', pasaporte_caducidad: '' });
  });
  it('drops a typed invalid issue date and re-checks the expiry against what the server will see', () => {
    // Typed issue date is in the future (invalid) -> blanked; stored issue date is old (2015-01-01).
    const stored = { pasaporte_expedicion: '2015-01-01' };
    // The server context has no issue date once it is blanked ('' overrides the stored one).
    const dropped = buildSkipPayload(dates, { pasaporte_expedicion: '2027-01-01', pasaporte_caducidad: '2030-01-01' }, stored, TODAY);
    expect(dropped).toEqual({ pasaporte_expedicion: '', pasaporte_caducidad: '2030-01-01' });
    expect(validatePatch(dropped, stored, TODAY)).toEqual([]);
  });
  it('blanks an expiry that is only valid against the typed (dropped) date', () => {
    // Typed issue 2020-01-01 is valid and kept; expiry 2019-06-01 is before it -> blanked.
    const payload = buildSkipPayload(dates, { pasaporte_expedicion: '2020-01-01', pasaporte_caducidad: '2019-06-01' }, { pasaporte_expedicion: '2015-01-01' }, TODAY);
    expect(payload).toEqual({ pasaporte_expedicion: '2020-01-01', pasaporte_caducidad: '' });
  });
  it('produces patches the server accepts for mixed typed values', () => {
    const stored = { pasaporte_expedicion: '2018-01-01' };
    const typed = { pasaporte_expedicion: '2050-01-01', pasaporte_caducidad: '2019-12-31' };
    const payload = buildSkipPayload(dates, typed, stored, TODAY);
    expect(validatePatch(payload, stored, TODAY)).toEqual([]);
  });
  it('clears the city when the department is dropped (and keeps a valid pair)', () => {
    const base = { pais_nacimiento: 'Colombia' };
    expect(buildSkipPayload(birth.slice(0, 3), { ...base, departamento_nacimiento: '', ciudad_nacimiento: 'Medellín' }, {}, TODAY).ciudad_nacimiento).toBe('');
    const ok = { ...base, departamento_nacimiento: 'Antioquia', ciudad_nacimiento: 'Medellín' };
    expect(buildSkipPayload(birth.slice(0, 3), ok, {}, TODAY)).toEqual(ok);
  });
  it('chains passes until stable', () => {
    const f = (key: string, o: Partial<Field>): Field => ({ key, label: key, type: 'date', required: false, ...o });
    const fields = [f('a', { range: { yearsForward: 0 } }), f('b', { after: 'a' }), f('c', { after: 'b' })];
    expect(buildSkipPayload(fields, { a: '2030-01-01', b: '2031-01-01', c: '2032-01-01' }, {}, TODAY)).toEqual({ a: '', b: '2031-01-01', c: '2032-01-01' });
    expect(buildSkipPayload(fields, { a: '2020-01-01', b: '2019-01-01', c: '2032-01-01' }, {}, TODAY)).toEqual({ a: '2020-01-01', b: '', c: '2032-01-01' });
  });
});

describe('clearDependents', () => {
  it('clears fields that depend on the changed field only', () => {
    const v = { pais_nacimiento: 'Colombia', departamento_nacimiento: 'Antioquia', ciudad_nacimiento: 'Medellín' };
    expect(clearDependents(birth, { ...v, departamento_nacimiento: 'Atlántico' }, 'departamento_nacimiento')).toEqual({ ...v, departamento_nacimiento: 'Atlántico', ciudad_nacimiento: '' });
    expect(clearDependents(birth, v, 'pais_nacimiento')).toEqual(v);
  });
});
