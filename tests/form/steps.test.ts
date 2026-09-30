import { describe, expect, it } from 'vitest';
import { buildSteps, firstIncompleteStep } from '@/lib/form/steps';
import { sampleAnswers } from '../helpers/sample-answers';

describe('buildSteps', () => {
  it('starts with a chapter intro and ends with files then review', () => {
    const steps = buildSteps({});
    expect(steps[0].kind).toBe('chapter');
    expect(steps.at(-2)!.kind).toBe('files');
    expect(steps.at(-1)!.kind).toBe('review');
  });
  it('omits hidden screens and chapters', () => {
    const ids = (a: Record<string, unknown>) => buildSteps(a).flatMap((s) => (s.kind === 'screen' ? [s.screen.id] : []));
    expect(ids({})).not.toContain('companions');
    expect(ids({ acompanantes_si: 'yes' })).toContain('companions');
    expect(ids({ ocupacion: 'desempleado' })).not.toContain('employer');
  });
});

describe('firstIncompleteStep', () => {
  it('returns 0 for a new application', () => {
    expect(firstIncompleteStep(buildSteps({}), {})).toBe(0);
  });
  it('lands on the files step when all questions are answered', () => {
    const a = sampleAnswers();
    const steps = buildSteps(a);
    expect(steps[firstIncompleteStep(steps, a)].kind).toBe('files');
  });
  it('returns the chapter intro when the first incomplete screen opens a chapter', () => {
    const a = sampleAnswers();
    delete a.pasaporte_numero;
    const steps = buildSteps(a);
    const s = steps[firstIncompleteStep(steps, a)];
    expect(s.kind).toBe('chapter');
    expect(s.kind === 'chapter' && s.chapter.id).toBe('passport');
  });
});
