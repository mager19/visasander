import { describe, expect, it } from 'vitest';
import { chapterAsText, chapterRows } from '@/lib/form/display';
import { CHAPTERS } from '@/lib/form/schema';

const passport = CHAPTERS.find((c) => c.id === 'passport')!;

describe('chapterRows', () => {
  it('marks empty required fields as missing and formats yes/no and selects', () => {
    const rows = chapterRows(passport, { pasaporte_tipo: 'ordinario', pasaporte_perdido: 'no' });
    expect(rows.find((r) => r.label === 'Tipo de pasaporte')).toMatchObject({ value: 'Ordinario', missing: false });
    expect(rows.find((r) => r.label === 'Número de pasaporte')).toMatchObject({ value: '', missing: true });
    expect(rows.find((r) => r.label.startsWith('¿Has perdido'))!.value).toBe('No');
  });
  it('omits hidden conditional fields even when stale answers exist', () => {
    const rows = chapterRows(passport, { pasaporte_perdido: 'no', pasaporte_perdido_detalle: 'stale text' });
    expect(rows.some((r) => r.value === 'stale text')).toBe(false);
  });
  it('renders repeat entries and the none flag', () => {
    const personal = CHAPTERS[0];
    expect(chapterRows(personal, { redes_sociales__none: true }).find((r) => r.label.startsWith('Redes'))!.value).toBe('Ninguno');
    const rows = chapterRows(personal, { redes_sociales: [{ plataforma: 'IG', usuario: 'ana' }] });
    expect(rows.find((r) => r.label === 'Redes sociales (últimos 5 años) #1')!.value).toContain('ana');
  });
  it('builds copyable text', () => {
    expect(chapterAsText(passport, { pasaporte_numero: 'AB123' })).toContain('Número de pasaporte: AB123');
  });
});

describe('multiselect and birth place display', () => {
  const work = CHAPTERS.find((c) => c.id === 'work')!;
  it('joins option labels and adds the other-language text', () => {
    const rows = chapterRows(work, { idiomas: 'es,en' });
    expect(rows.find((r) => r.label === 'Idiomas que hablas')!.value).toBe('Español, Inglés');
    const other = chapterRows(work, { idiomas: 'es,otro', idiomas_otro: 'Japonés' });
    expect(other.find((r) => r.label === 'Idiomas que hablas')!.value).toBe('Español, Otro (Japonés)');
    expect(other.find((r) => r.label === '¿Cuál otro idioma?')!.value).toBe('Japonés');
    expect(chapterRows(work, { idiomas: 'es' }).some((r) => r.label === '¿Cuál otro idioma?')).toBe(false);
    expect(chapterAsText(work, { idiomas: 'es,fr' })).toContain('Idiomas que hablas: Español, Francés');
  });
  it('shows the Colombia or other-country branch of the birth place', () => {
    const personal = CHAPTERS[0];
    const co = chapterRows(personal, { pais_nacimiento: 'Colombia', departamento_nacimiento: 'Antioquia', ciudad_nacimiento: 'Medellín' });
    expect(co.find((r) => r.label === 'Ciudad o municipio')!.value).toBe('Medellín');
    expect(co.find((r) => r.label === 'País de nacimiento')!.value).toBe('Colombia');
    expect(co.some((r) => r.label === 'Estado o provincia')).toBe(false);
    const other = chapterRows(personal, { pais_nacimiento: 'otro', pais_nacimiento_otro: 'Chile' });
    expect(other.find((r) => r.label === 'País de nacimiento')!.value).toBe('Otro país');
    expect(other.find((r) => r.label === 'Estado o provincia')).toMatchObject({ missing: false });
    expect(other.find((r) => r.label === 'Ciudad')).toMatchObject({ missing: true });
  });
});
