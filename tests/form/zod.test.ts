import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '@/lib/form/schema';
import type { Field } from '@/lib/form/types';
import { validateFields, validateValue } from '@/lib/form/validate';
import { colombiaResolver } from '@/lib/data/colombia';
import { dateBounds, fieldSchema, fieldWarnings, isRealDate, screenSchema } from '@/lib/form/zod';

const TODAY = new Date(2026, 8, 30); // 2026-09-30, local
const allFields = CHAPTERS.flatMap((c) => c.screens.flatMap((s) => s.fields));
const byKey = (key: string): Field => allFields.find((f) => f.key === key)!;
const field = (o: Partial<Field>): Field => ({ key: 'k', label: 'K', type: 'text', required: true, ...o });
const check = (f: Field, v: string, ctx = {}) => validateValue(f, v, ctx, TODAY, colombiaResolver);

describe('real calendar dates', () => {
  it.each([
    ['2026-02-28', true], ['2024-02-29', true], ['2026-02-30', false], ['2026-13-01', false],
    ['2026-1-1', false], ['26-01-01', false], ['abcd-ef-gh', false], ['2026-04-31', false],
  ])('%s -> %s', (v, ok) => {
    expect(isRealDate(v)).toBe(ok);
    expect(check(field({ type: 'date' }), v) === null).toBe(ok);
  });
});

describe('date ranges (today = 2026-09-30)', () => {
  it.each([
    ['fecha_nacimiento', '1990-05-15', null],
    ['fecha_nacimiento', '2026-09-30', null],
    ['fecha_nacimiento', '2026-10-01', 'La fecha no puede ser futura'],
    ['fecha_nacimiento', '1906-09-30', null],
    ['fecha_nacimiento', '1906-09-29', 'La fecha es demasiado antigua'],
    ['pasaporte_expedicion', '2020-01-01', null],
    ['pasaporte_expedicion', '2027-01-01', 'La fecha no puede ser futura'],
    ['pasaporte_expedicion', '2006-09-30', null],
    ['pasaporte_expedicion', '2006-09-29', 'La fecha es demasiado antigua'],
    ['padre_nacimiento', '1960-01-01', null],
    ['padre_nacimiento', '2030-01-01', 'La fecha no puede ser futura'],
    ['padre_nacimiento', '1800-01-01', 'La fecha es demasiado antigua'],
    ['madre_nacimiento', '2030-01-01', 'La fecha no puede ser futura'],
    ['visa_previa_fecha', '2019-01-01', null],
    ['visa_previa_fecha', '2027-01-01', 'La fecha no puede ser futura'],
    ['empresa_inicio', '2018-03-01', null],
    ['empresa_inicio', '2027-03-01', 'La fecha no puede ser futura'],
    ['empresa_inicio', '1966-09-29', 'La fecha es demasiado antigua'],
    ['inicio', '2020-01-01', null],
    ['inicio', '2030-01-01', 'La fecha no puede ser futura'],
    ['inicio', '1960-01-01', 'La fecha es demasiado antigua'],
    ['desde', '2010-01-01', null],
    ['desde', '2030-01-01', 'La fecha no puede ser futura'],
    ['desde', '1960-01-01', 'La fecha es demasiado antigua'],
  ])('%s %s -> %s', (key, value, expected) => {
    expect(check(byKey(key), value)).toBe(expected);
  });
});

describe('after rules', () => {
  it('passport expiry must be strictly after issue, at most 20 years ahead, but may be in the past', () => {
    const exp = byKey('pasaporte_caducidad');
    const ctx = { pasaporte_expedicion: '2020-01-01' };
    expect(check(exp, '2020-01-01', ctx)).toBe('Debe ser posterior a la fecha de expedición');
    expect(check(exp, '2019-01-01', ctx)).toBe('Debe ser posterior a la fecha de expedición');
    expect(check(exp, '2020-01-02', ctx)).toBeNull(); // in the past: allowed, only a warning
    expect(check(exp, '2030-01-01', ctx)).toBeNull();
    expect(check(exp, '2046-09-30', ctx)).toBeNull();
    expect(check(exp, '2046-10-01', ctx)).toBe('La fecha es demasiado lejana');
  });
  it.each([['fin', 'inicio'], ['hasta', 'desde']])('%s must be strictly after %s', (end, start) => {
    const f = byKey(end);
    expect(check(f, '2020-05-01', { [start]: '2020-05-01' })).toBe('Debe ser posterior a la fecha anterior');
    expect(check(f, '2020-05-02', { [start]: '2020-05-01' })).toBeNull();
  });
});

describe('dateBounds', () => {
  it('combines range and after (min = day after the referenced date)', () => {
    expect(dateBounds(byKey('fecha_nacimiento'), {}, TODAY)).toEqual({ min: '1906-09-30', max: '2026-09-30' });
    expect(dateBounds(byKey('pasaporte_expedicion'), {}, TODAY)).toEqual({ min: '2006-09-30', max: '2026-09-30' });
    expect(dateBounds(byKey('pasaporte_caducidad'), { pasaporte_expedicion: '2020-01-31' }, TODAY)).toEqual({ min: '2020-02-01', max: '2046-09-30' });
    expect(dateBounds(byKey('pasaporte_caducidad'), {}, TODAY)).toEqual({ min: null, max: '2046-09-30' });
    expect(dateBounds(byKey('fin'), { inicio: '2019-12-31' }, TODAY)).toEqual({ min: '2020-01-01', max: null });
    expect(dateBounds(field({ type: 'date' }), {}, TODAY)).toEqual({ min: null, max: null });
  });
  it('takes the stricter min when range and after both apply and ignores an invalid reference', () => {
    const f = field({ type: 'date', after: 'a', range: { yearsBack: 10 } });
    expect(dateBounds(f, { a: '2000-01-01' }, TODAY).min).toBe('2016-09-30');
    expect(dateBounds(f, { a: '2024-01-01' }, TODAY).min).toBe('2024-01-02');
    expect(dateBounds(f, { a: 'nope' }, TODAY).min).toBe('2016-09-30');
  });
  it('clamps Feb 29 when shifting years', () => {
    expect(dateBounds(field({ type: 'date', range: { yearsBack: 1 } }), {}, new Date(2028, 1, 29)).min).toBe('2027-02-28');
  });
});

describe('fieldWarnings', () => {
  const exp = byKey('pasaporte_caducidad');
  it('warns when the passport is expired or expires within 6 months', () => {
    expect(fieldWarnings(exp, '2026-01-01', {}, TODAY)).toEqual(['Tu pasaporte ya está vencido. Verifica la fecha.']);
    expect(fieldWarnings(exp, '2026-09-30', {}, TODAY)).toEqual(['Tu pasaporte vence en menos de 6 meses.']);
    expect(fieldWarnings(exp, '2027-03-29', {}, TODAY)).toEqual(['Tu pasaporte vence en menos de 6 meses.']);
  });
  it('has no warning otherwise, for other fields, or for invalid input', () => {
    expect(fieldWarnings(exp, '2027-03-30', {}, TODAY)).toEqual([]);
    expect(fieldWarnings(exp, '2035-01-01', {}, TODAY)).toEqual([]);
    expect(fieldWarnings(exp, '', {}, TODAY)).toEqual([]);
    expect(fieldWarnings(exp, '2026-02-30', {}, TODAY)).toEqual([]);
    expect(fieldWarnings(byKey('fecha_nacimiento'), '2000-01-01', {}, TODAY)).toEqual([]);
  });
});

describe('phone, cedula, number, text', () => {
  const tel = field({ type: 'tel' });
  it.each([
    ['1234567', null], ['+57 (300) 123-4567', null], ['123456789012345', null],
    ['123456', 'Teléfono no válido'], ['1234567890123456', 'Teléfono no válido'], ['abc1234567', 'Teléfono no válido'],
  ])('tel %s', (v, expected) => expect(check(tel, v)).toBe(expected));

  const cedula = byKey('cedula');
  it.each([
    ['12345', null], ['123456789012', null], ['1234', 'Debe tener entre 5 y 12 dígitos'],
    ['1234567890123', 'Debe tener entre 5 y 12 dígitos'], ['12a45', 'Debe tener entre 5 y 12 dígitos'],
  ])('cedula %s', (v, expected) => expect(check(cedula, v)).toBe(expected));

  const num = field({ type: 'number' });
  it.each([
    ['0', null], ['1500000', null], ['1500,50', null], ['123456789012', null],
    ['-5', 'Número no válido'], ['abc', 'Número no válido'], ['1234567890123', 'Número no válido'],
  ])('number %s', (v, expected) => expect(check(num, v)).toBe(expected));

  it('trims and caps text length', () => {
    expect(check(field({}), '   ')).toBe('Este campo es obligatorio');
    expect(check(field({}), 'x'.repeat(2000))).toBeNull();
    expect(check(field({}), 'x'.repeat(2001))).toBe('Máximo 2000 caracteres');
  });
});

describe('options, multiselect and Colombia lists', () => {
  const langs = byKey('idiomas');
  it('select and yesno only accept listed values', () => {
    expect(check(byKey('sexo'), 'F')).toBeNull();
    expect(check(byKey('sexo'), 'X')).toBe('Opción no válida');
    expect(check(byKey('otras_nacionalidades'), 'yes')).toBeNull();
    expect(check(byKey('otras_nacionalidades'), 'maybe')).toBe('Opción no válida');
  });
  it('multiselect requires >= 1 valid, unique option', () => {
    expect(check(langs, 'es,en')).toBeNull();
    expect(check(langs, 'es')).toBeNull();
    expect(check(langs, '')).toBe('Este campo es obligatorio');
    expect(check(langs, 'es,xx')).toBe('Opción no válida');
    expect(check(langs, 'es,es')).toBe('Opción no válida');
    expect(check(langs, 'es,,en')).toBe('Opción no válida');
  });
  it('an optional multiselect may be empty', () => {
    expect(check({ ...langs, required: false }, '')).toBeNull();
  });
  it('co_department must be a real department', () => {
    expect(check(byKey('departamento_nacimiento'), 'Antioquia')).toBeNull();
    expect(check(byKey('departamento_nacimiento'), 'Narnia')).toBe('Departamento no válido');
  });
  it('co_city must belong to the selected department', () => {
    const city = byKey('ciudad_nacimiento');
    expect(check(city, 'Medellín', { departamento_nacimiento: 'Antioquia' })).toBeNull();
    expect(check(city, 'Medellín', { departamento_nacimiento: 'Valle del Cauca' })).toBe('Ciudad no válida para el departamento');
    expect(check(city, 'Medellín', {})).toBe('Selecciona primero el departamento');
  });
});

describe('Colombia resolver injection', () => {
  it('without a resolver only requires a non-empty value (client side)', () => {
    const dep = byKey('departamento_nacimiento');
    const city = byKey('ciudad_nacimiento');
    expect(validateValue(dep, 'Narnia', {}, TODAY)).toBeNull();
    expect(validateValue(dep, '', {}, TODAY)).toBe('Este campo es obligatorio');
    expect(validateValue(city, 'Cali', { departamento_nacimiento: 'Antioquia' }, TODAY)).toBeNull();
    expect(validateValue(city, 'Cali', {}, TODAY)).toBe('Selecciona primero el departamento');
  });
  it('with the resolver checks membership', () => {
    expect(validateValue(byKey('ciudad_nacimiento'), 'Cali', { departamento_nacimiento: 'Antioquia' }, TODAY, colombiaResolver)).toBe('Ciudad no válida para el departamento');
  });
});

describe('date validation is built on dateBounds', () => {
  const cases: [string, string, Record<string, string>][] = [
    ['fecha_nacimiento', '1906-09-29', {}], ['fecha_nacimiento', '1906-09-30', {}], ['fecha_nacimiento', '2026-09-30', {}], ['fecha_nacimiento', '2026-10-01', {}],
    ['pasaporte_expedicion', '2006-09-29', {}], ['pasaporte_expedicion', '2006-09-30', {}], ['pasaporte_expedicion', '2026-10-01', {}],
    ['pasaporte_caducidad', '2020-01-01', { pasaporte_expedicion: '2020-01-01' }], ['pasaporte_caducidad', '2020-01-02', { pasaporte_expedicion: '2020-01-01' }],
    ['pasaporte_caducidad', '2046-09-30', {}], ['pasaporte_caducidad', '2046-10-01', {}],
    ['fin', '2020-05-01', { inicio: '2020-05-01' }], ['fin', '2020-05-02', { inicio: '2020-05-01' }],
    ['inicio', '1966-09-29', {}], ['inicio', '1966-09-30', {}], ['empresa_inicio', '2026-10-01', {}], ['hasta', '2019-01-01', { desde: '2020-01-01' }],
  ];
  it.each(cases)('%s %s %j: outside bounds <=> rejected', (key, value, ctx) => {
    const f = byKey(key);
    const { min, max } = dateBounds(f, ctx, TODAY);
    const outside = (min !== null && value < min) || (max !== null && value > max);
    expect(check(f, value, ctx) !== null).toBe(outside);
  });
});

describe('screen-level', () => {
  it('validateFields skips hidden fields of the new birth-place screen', () => {
    const screen = CHAPTERS[0].screens.find((s) => s.id === 'birth_place')!;
    const colombia = { pais_nacimiento: 'Colombia', departamento_nacimiento: 'Atlántico', ciudad_nacimiento: 'Barranquilla' };
    expect(validateFields(screen.fields, colombia, {}, TODAY)).toEqual({});
    expect(validateFields(screen.fields, { pais_nacimiento: 'otro' }, {}, TODAY)).toEqual({
      pais_nacimiento_otro: 'Este campo es obligatorio', ciudad_nacimiento_otro: 'Este campo es obligatorio',
    });
  });
  it('screenSchema builds one object schema over the visible fields', () => {
    const screen = CHAPTERS[0].screens.find((s) => s.id === 'birth_place')!;
    const schema = screenSchema(screen.fields, { today: TODAY, values: { pais_nacimiento: 'Colombia' } });
    expect(Object.keys(schema.shape)).toEqual(['pais_nacimiento', 'departamento_nacimiento', 'ciudad_nacimiento']);
  });
  it('the languages "otro" text is required only when otro is selected', () => {
    const screen = CHAPTERS.flatMap((c) => c.screens).find((s) => s.id === 'languages')!;
    expect(validateFields(screen.fields, { idiomas: 'es' }, {}, TODAY)).toEqual({});
    expect(validateFields(screen.fields, { idiomas: 'es,otro', idiomas_otro: '' }, {}, TODAY)).toEqual({ idiomas_otro: 'Este campo es obligatorio' });
    expect(validateFields(screen.fields, { idiomas: 'es,otro', idiomas_otro: 'Japonés' }, {}, TODAY)).toEqual({});
  });
  it('allowEmpty accepts empty values even for required fields', () => {
    expect(fieldSchema(field({}), { allowEmpty: true }).safeParse('').success).toBe(true);
    expect(fieldSchema(field({}), {}).safeParse('').success).toBe(false);
  });
});
