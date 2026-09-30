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
