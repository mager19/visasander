import { describe, expect, it } from 'vitest';
import { computeProgress } from '@/lib/form/progress';
import { CHAPTERS } from '@/lib/form/schema';
import { ALL_REQUIRED_FILES, sampleAnswers } from '../helpers/sample-answers';

describe('schema', () => {
  it('has eight-chapter shape minus files and unique field keys', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['personal', 'passport', 'travel', 'history', 'us_contact', 'family', 'work']);
    const keys = CHAPTERS.flatMap((c) => c.screens.flatMap((s) => [...(s.repeat ? [s.repeat.key] : s.fields.map((f) => f.key))]));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('computeProgress', () => {
  it('is 0% for an empty application and lists missing items', () => {
    const p = computeProgress({}, []);
    expect(p.percent).toBe(0);
    expect(p.total).toBeGreaterThan(40);
    expect(p.chapters.find((c) => c.id === 'files')!.missing).toHaveLength(3);
  });

  it('is 100% when everything applicable is answered and required files exist', () => {
    const p = computeProgress(sampleAnswers(), ALL_REQUIRED_FILES);
    expect(p.percent).toBe(100);
    expect(p.chapters.every((c) => c.missing.length === 0)).toBe(true);
  });

  it('counts required files', () => {
    const p = computeProgress(sampleAnswers(), ['passport']);
    expect(p.percent).toBeLessThan(100);
    expect(p.chapters.find((c) => c.id === 'files')!.answered).toBe(1);
  });

  it('counts a conditional field only when its trigger is active', () => {
    const hidden = computeProgress(sampleAnswers({ pasaporte_perdido: 'no', pasaporte_perdido_detalle: '' }), ALL_REQUIRED_FILES);
    expect(hidden.percent).toBe(100);
    const shown = computeProgress(sampleAnswers({ pasaporte_perdido: 'yes', pasaporte_perdido_detalle: '' }), ALL_REQUIRED_FILES);
    expect(shown.percent).toBeLessThan(100);
    expect(shown.chapters.find((c) => c.id === 'passport')!.missing).toContain('Detalles de la pérdida o robo');
  });

  it('ignores stale answers of fields that became hidden (yes -> no)', () => {
    const p = computeProgress(sampleAnswers({ pasaporte_perdido: 'no', pasaporte_perdido_detalle: 'old text' }), ALL_REQUIRED_FILES);
    expect(p.total).toBe(computeProgress(sampleAnswers({ pasaporte_perdido: 'no' }), ALL_REQUIRED_FILES).total);
  });

  it('treats a repeat screen as complete with the none flag or valid entries only', () => {
    const base = { redes_sociales__none: false };
    const empty = computeProgress(sampleAnswers({ ...base, redes_sociales: [] }), ALL_REQUIRED_FILES);
    expect(empty.percent).toBeLessThan(100);
    const partial = computeProgress(sampleAnswers({ ...base, redes_sociales: [{ plataforma: 'Instagram' }] }), ALL_REQUIRED_FILES);
    expect(partial.percent).toBeLessThan(100);
    const full = computeProgress(sampleAnswers({ ...base, redes_sociales: [{ plataforma: 'Instagram', usuario: 'ana' }] }), ALL_REQUIRED_FILES);
    expect(full.percent).toBe(100);
  });

  it('hides whole screens (e.g. employer details for unemployed)', () => {
    const p = computeProgress(sampleAnswers({ ocupacion: 'desempleado' }), ALL_REQUIRED_FILES);
    expect(p.percent).toBe(100);
    expect(p.chapters.find((c) => c.id === 'work')!.missing).toEqual([]);
  });
});
