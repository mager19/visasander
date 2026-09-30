import { isScreenComplete } from './progress';
import { CHAPTERS } from './schema';
import type { Answers, Chapter, Screen } from './types';
import { isVisible } from './visibility';

export type Step =
  | { kind: 'chapter'; chapter: Chapter }
  | { kind: 'screen'; chapter: Chapter; screen: Screen }
  | { kind: 'files' }
  | { kind: 'review' };

export function buildSteps(answers: Answers): Step[] {
  const steps: Step[] = [];
  for (const chapter of CHAPTERS) {
    const screens = chapter.screens.filter((s) => isVisible(s.showIf, answers));
    if (screens.length === 0) continue;
    steps.push({ kind: 'chapter', chapter });
    for (const screen of screens) steps.push({ kind: 'screen', chapter, screen });
  }
  steps.push({ kind: 'files' }, { kind: 'review' });
  return steps;
}

export function firstIncompleteStep(steps: Step[], answers: Answers): number {
  const i = steps.findIndex((s) => s.kind === 'screen' && !isScreenComplete(s.screen, answers));
  if (i === -1) return steps.findIndex((s) => s.kind === 'files');
  return steps[i - 1]?.kind === 'chapter' ? i - 1 : i;
}
