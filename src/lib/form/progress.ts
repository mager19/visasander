import { FILE_LABELS, REQUIRED_FILE_KINDS } from './file-kinds';
import { CHAPTERS } from './schema';
import type { Answers, Screen } from './types';
import { isFilled, isVisible } from './visibility';

export interface Units { total: number; answered: number; missing: string[] }
export interface ChapterProgress { id: string; title: string; total: number; answered: number; missing: string[] }
export interface Progress { percent: number; total: number; answered: number; chapters: ChapterProgress[] }

export function screenStatus(screen: Screen, answers: Answers): Units {
  if (!isVisible(screen.showIf, answers)) return { total: 0, answered: 0, missing: [] };
  if (screen.repeat) {
    const { key } = screen.repeat;
    const entries = Array.isArray(answers[key]) ? (answers[key] as Answers[]) : [];
    const none = answers[`${key}__none`] === true;
    const required = screen.fields.filter((f) => f.required);
    const valid = entries.length > 0 && entries.every((e) => required.every((f) => isFilled(e[f.key])));
    const done = none || valid;
    return { total: 1, answered: done ? 1 : 0, missing: done ? [] : [screen.title] };
  }
  const required = screen.fields.filter((f) => f.required && isVisible(f.showIf, answers));
  const missing = required.filter((f) => !isFilled(answers[f.key])).map((f) => f.label);
  return { total: required.length, answered: required.length - missing.length, missing };
}

export function isScreenComplete(screen: Screen, answers: Answers): boolean {
  const s = screenStatus(screen, answers);
  return s.total === s.answered;
}

export function computeProgress(answers: Answers, fileKinds: string[]): Progress {
  const chapters: ChapterProgress[] = CHAPTERS.map((ch) => {
    const units = ch.screens.map((s) => screenStatus(s, answers));
    return {
      id: ch.id,
      title: ch.title,
      total: units.reduce((n, u) => n + u.total, 0),
      answered: units.reduce((n, u) => n + u.answered, 0),
      missing: units.flatMap((u) => u.missing),
    };
  });
  const missingFiles = REQUIRED_FILE_KINDS.filter((k) => !fileKinds.includes(k));
  chapters.push({
    id: 'files',
    title: 'Archivos',
    total: REQUIRED_FILE_KINDS.length,
    answered: REQUIRED_FILE_KINDS.length - missingFiles.length,
    missing: missingFiles.map((k) => FILE_LABELS[k]),
  });
  const total = chapters.reduce((n, c) => n + c.total, 0);
  const answered = chapters.reduce((n, c) => n + c.answered, 0);
  return { percent: total === 0 ? 0 : Math.round((answered / total) * 100), total, answered, chapters };
}
