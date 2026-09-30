import { computeProgress, isScreenComplete } from './progress';
import type { Step } from './steps';
import type { Answers } from './types';

export const FILES_TITLE = 'Archivos';
export const REVIEW_TITLE = 'Revisión final';

export interface Breadcrumb {
  chapterTitle: string;
  /** null on a chapter intro, the files step and the review step. */
  screenTitle: string | null;
  /** 1-based position of the screen among the VISIBLE screens of its chapter (0 on a chapter intro). */
  position: number;
  total: number;
}

export interface OutlineScreen { id: string; title: string; stepIndex: number; complete: boolean }
export type SectionStatus = 'complete' | 'incomplete';

export type OutlineEntry =
  | {
      kind: 'chapter';
      id: string;
      title: string;
      status: SectionStatus;
      missing: number;
      /** Index of the chapter intro step. */
      firstStepIndex: number;
      /** Index of the first incomplete screen, or null when every visible screen is complete. */
      firstIncompleteStepIndex: number | null;
      screens: OutlineScreen[];
    }
  | { kind: 'files'; id: 'files'; title: string; status: SectionStatus; missing: number; stepIndex: number }
  | { kind: 'review'; id: 'review'; title: string; stepIndex: number };

/** Stable identity of a step, independent of its index (indexes shift when showIf hides or reveals screens). */
export function stepKey(step: Step): string {
  switch (step.kind) {
    case 'chapter': return `chapter:${step.chapter.id}`;
    case 'screen': return `screen:${step.screen.id}`;
    default: return step.kind;
  }
}

/** Index of the step with this key, or -1. */
export function indexOfStep(steps: Step[], key: string): number {
  return steps.findIndex((s) => stepKey(s) === key);
}

/** Where the step at `index` sits: its chapter, its screen and the screen's position inside the chapter. */
export function breadcrumb(steps: Step[], index: number): Breadcrumb | null {
  const step = steps[index];
  if (!step) return null;
  if (step.kind === 'files') return { chapterTitle: FILES_TITLE, screenTitle: null, position: 1, total: 1 };
  if (step.kind === 'review') return { chapterTitle: REVIEW_TITLE, screenTitle: null, position: 1, total: 1 };
  const chapterId = step.chapter.id;
  const screens = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.kind === 'screen' && s.chapter.id === chapterId);
  const total = screens.length;
  if (step.kind === 'chapter') return { chapterTitle: step.chapter.title, screenTitle: null, position: 0, total };
  const position = screens.findIndex(({ i }) => i === index) + 1;
  return { chapterTitle: step.chapter.title, screenTitle: step.screen.title, position, total };
}

/**
 * Every visible chapter (in step order) with its completion and its visible screens, then "Archivos"
 * and "Revisión final". Hidden screens/chapters are excluded because it is derived from `steps`.
 */
export function sectionOutline(steps: Step[], answers: Answers, fileKinds: string[]): OutlineEntry[] {
  const progress = computeProgress(answers, fileKinds);
  const out: OutlineEntry[] = [];
  steps.forEach((step, i) => {
    if (step.kind === 'chapter') {
      const missing = progress.chapters.find((c) => c.id === step.chapter.id)?.missing.length ?? 0;
      out.push({
        kind: 'chapter',
        id: step.chapter.id,
        title: step.chapter.title,
        status: missing === 0 ? 'complete' : 'incomplete',
        missing,
        firstStepIndex: i,
        firstIncompleteStepIndex: null,
        screens: [],
      });
    } else if (step.kind === 'screen') {
      const entry = out.at(-1);
      if (entry?.kind !== 'chapter') return;
      const complete = isScreenComplete(step.screen, answers);
      entry.screens.push({ id: step.screen.id, title: step.screen.title, stepIndex: i, complete });
      if (!complete && entry.firstIncompleteStepIndex === null) entry.firstIncompleteStepIndex = i;
    } else if (step.kind === 'files') {
      const missing = progress.chapters.find((c) => c.id === 'files')?.missing.length ?? 0;
      out.push({ kind: 'files', id: 'files', title: FILES_TITLE, status: missing === 0 ? 'complete' : 'incomplete', missing, stepIndex: i });
    } else {
      out.push({ kind: 'review', id: 'review', title: REVIEW_TITLE, stepIndex: i });
    }
  });
  return out;
}

/** Step a section row jumps to: its first incomplete screen, or its intro/step when it is complete. */
export function entryTarget(entry: OutlineEntry): number {
  return entry.kind === 'chapter' ? (entry.firstIncompleteStepIndex ?? entry.firstStepIndex) : entry.stepIndex;
}

/** Id of the outline entry that contains the step at `index`. */
export function currentSectionId(steps: Step[], index: number): string | null {
  const step = steps[index];
  if (!step) return null;
  return step.kind === 'chapter' || step.kind === 'screen' ? step.chapter.id : step.kind;
}
