import { describe, expect, it } from 'vitest';
import {
  breadcrumb, currentSectionId, entryTarget, indexOfStep, sectionOutline, stepKey, type OutlineEntry,
} from '@/lib/form/navigation';
import { buildSteps } from '@/lib/form/steps';
import { ALL_REQUIRED_FILES, sampleAnswers } from '../helpers/sample-answers';

const idx = (steps: ReturnType<typeof buildSteps>, key: string) => {
  const i = indexOfStep(steps, key);
  if (i < 0) throw new Error(`missing step ${key}`);
  return i;
};
const chapter = (outline: OutlineEntry[], id: string) => {
  const e = outline.find((x) => x.id === id);
  if (e?.kind !== 'chapter') throw new Error(`missing chapter ${id}`);
  return e;
};

describe('stepKey / indexOfStep', () => {
  it('identifies steps independently of their index', () => {
    const steps = buildSteps({});
    expect(stepKey(steps[0])).toBe('chapter:personal');
    expect(stepKey(steps[1])).toBe('screen:names');
    expect(stepKey(steps.at(-2)!)).toBe('files');
    expect(stepKey(steps.at(-1)!)).toBe('review');
    expect(indexOfStep(steps, 'screen:names')).toBe(1);
    expect(indexOfStep(steps, 'screen:companions')).toBe(-1);
  });
  it('follows a screen when showIf reveals another one before it', () => {
    const before = buildSteps({});
    const after = buildSteps({ acompanantes_si: 'yes' });
    expect(idx(after, 'screen:prev_trips_q')).toBe(idx(before, 'screen:prev_trips_q') + 1);
  });
});

describe('breadcrumb', () => {
  const steps = buildSteps({});

  it('gives the chapter, screen and its position among the chapter screens', () => {
    expect(breadcrumb(steps, idx(steps, 'screen:national_id'))).toEqual({
      chapterTitle: 'Información personal', screenTitle: 'Documento de identidad', position: 6, total: 9,
    });
    expect(breadcrumb(steps, idx(steps, 'screen:names'))).toMatchObject({ position: 1, total: 9 });
  });
  it('uses the chapter title and no screen on a chapter intro', () => {
    expect(breadcrumb(steps, idx(steps, 'chapter:passport'))).toEqual({
      chapterTitle: 'Pasaporte', screenTitle: null, position: 0, total: 4,
    });
  });
  it('counts only visible screens', () => {
    const hidden = buildSteps({ ocupacion: 'desempleado' });
    const shown = buildSteps({ ocupacion: 'empleado' });
    expect(breadcrumb(hidden, idx(hidden, 'screen:education'))).toMatchObject({ position: 3, total: 6 });
    expect(breadcrumb(shown, idx(shown, 'screen:education'))).toMatchObject({ position: 5, total: 8 });
  });
  it('names the files and review steps', () => {
    expect(breadcrumb(steps, steps.length - 2)).toEqual({ chapterTitle: 'Archivos', screenTitle: null, position: 1, total: 1 });
    expect(breadcrumb(steps, steps.length - 1)).toEqual({ chapterTitle: 'Revisión final', screenTitle: null, position: 1, total: 1 });
  });
  it('returns null outside the steps', () => {
    expect(breadcrumb(steps, steps.length)).toBeNull();
    expect(breadcrumb(steps, -1)).toBeNull();
  });
});

describe('sectionOutline', () => {
  it('lists visible chapters in order, then Archivos and Revisión final', () => {
    const steps = buildSteps({});
    const outline = sectionOutline(steps, {}, []);
    expect(outline.map((e) => e.id)).toEqual(['personal', 'passport', 'travel', 'history', 'us_contact', 'family', 'work', 'files', 'review']);
    expect(outline.at(-2)).toEqual({ kind: 'files', id: 'files', title: 'Archivos', status: 'incomplete', missing: 3, stepIndex: steps.length - 2 });
    expect(outline.at(-1)).toEqual({ kind: 'review', id: 'review', title: 'Revisión final', stepIndex: steps.length - 1 });
  });

  it('marks an empty chapter incomplete and points at its first screen', () => {
    const steps = buildSteps({});
    const personal = chapter(sectionOutline(steps, {}, []), 'personal');
    expect(personal.status).toBe('incomplete');
    expect(personal.missing).toBeGreaterThan(0);
    expect(personal.firstStepIndex).toBe(0);
    expect(personal.firstIncompleteStepIndex).toBe(1);
    expect(personal.screens).toHaveLength(9);
    expect(personal.screens[5]).toEqual({ id: 'national_id', title: 'Documento de identidad', stepIndex: 6, complete: false });
    expect(entryTarget(personal)).toBe(1);
  });

  it('marks complete chapters and files, with no incomplete screen', () => {
    const a = sampleAnswers();
    const steps = buildSteps(a);
    const outline = sectionOutline(steps, a, ALL_REQUIRED_FILES);
    for (const e of outline) if (e.kind !== 'review') expect(e.status).toBe('complete');
    const passport = chapter(outline, 'passport');
    expect(passport.missing).toBe(0);
    expect(passport.firstIncompleteStepIndex).toBeNull();
    expect(passport.screens.every((s) => s.complete)).toBe(true);
    expect(entryTarget(passport)).toBe(passport.firstStepIndex);
    expect(entryTarget(outline.at(-1)!)).toBe(steps.length - 1);
  });

  it('points at the first incomplete screen of a partly answered chapter', () => {
    const a = sampleAnswers();
    delete a.pasaporte_autoridad;
    const steps = buildSteps(a);
    const passport = chapter(sectionOutline(steps, a, ALL_REQUIRED_FILES), 'passport');
    expect(passport.status).toBe('incomplete');
    expect(passport.missing).toBe(1);
    expect(passport.firstIncompleteStepIndex).toBe(idx(steps, 'screen:passport_issuer'));
    expect(passport.screens.map((s) => s.complete)).toEqual([true, false, true, true]);
  });

  it('excludes hidden screens exactly like buildSteps', () => {
    const hidden = sectionOutline(buildSteps({}), {}, []);
    const shown = sectionOutline(buildSteps({ acompanantes_si: 'yes' }), { acompanantes_si: 'yes' }, []);
    expect(chapter(hidden, 'history').screens.map((s) => s.id)).not.toContain('companions');
    expect(chapter(shown, 'history').screens.map((s) => s.id)).toContain('companions');
    const steps = buildSteps({ ocupacion: 'desempleado' });
    const work = chapter(sectionOutline(steps, { ocupacion: 'desempleado' }, []), 'work');
    expect(work.screens.map((s) => s.id)).toEqual(['occupation', 'prev_jobs', 'education', 'languages', 'visited', 'orgs']);
    for (const s of work.screens) expect(stepKey(steps[s.stepIndex])).toBe(`screen:${s.id}`);
  });
});

describe('currentSectionId', () => {
  it('maps a step to its outline entry', () => {
    const steps = buildSteps({});
    expect(currentSectionId(steps, 0)).toBe('personal');
    expect(currentSectionId(steps, idx(steps, 'screen:passport_dates'))).toBe('passport');
    expect(currentSectionId(steps, steps.length - 2)).toBe('files');
    expect(currentSectionId(steps, steps.length - 1)).toBe('review');
    expect(currentSectionId(steps, 999)).toBeNull();
  });
});
