import { describe, expect, it } from 'vitest';
import { validateFields, validateValue } from '@/lib/form/validate';
import type { Field } from '@/lib/form/types';

const field = (o: Partial<Field>): Field => ({ key: 'k', label: 'K', type: 'text', required: true, ...o });

describe('validateValue', () => {
  it('requires required fields but allows empty optional ones', () => {
    expect(validateValue(field({}), '  ', {})).toBe('Este campo es obligatorio');
    expect(validateValue(field({ required: false }), '', {})).toBeNull();
  });
  it('validates email and phone formats', () => {
    expect(validateValue(field({ type: 'email' }), 'nope', {})).toBe('Correo no válido');
    expect(validateValue(field({ type: 'email' }), 'a@b.co', {})).toBeNull();
    expect(validateValue(field({ type: 'tel' }), '123', {})).toBe('Teléfono no válido');
    expect(validateValue(field({ type: 'tel' }), '+57 300 123 4567', {})).toBeNull();
  });
  it('validates dates and ordering', () => {
    expect(validateValue(field({ type: 'date' }), '2020-13-45', {})).toBe('Fecha no válida');
    const exp = field({ key: 'exp', type: 'date', after: 'iss' });
    expect(validateValue(exp, '2019-01-01', { iss: '2020-01-01' })).toBe('Debe ser posterior a la fecha anterior');
    expect(validateValue(exp, '2030-01-01', { iss: '2020-01-01' })).toBeNull();
  });
  it('validates numbers', () => {
    expect(validateValue(field({ type: 'number' }), 'abc', {})).toBe('Número no válido');
    expect(validateValue(field({ type: 'number' }), '1500000', {})).toBeNull();
  });
});

describe('validateFields', () => {
  it('skips hidden conditional fields and uses context for conditions', () => {
    const fields = [field({ key: 'a', showIf: { key: 'q', in: ['yes'] } })];
    expect(validateFields(fields, { a: '' }, { q: 'no' })).toEqual({});
    expect(validateFields(fields, { a: '' }, { q: 'yes' })).toEqual({ a: 'Este campo es obligatorio' });
  });
});
