import type { Answers, Condition } from './types';

export function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** Splits a stored multiselect answer (`es,en`) into its values. */
export function splitMulti(value: unknown): string[] {
  return typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function isVisible(cond: Condition | undefined, answers: Answers): boolean {
  if (!cond) return true;
  const v = typeof answers[cond.key] === 'string' ? (answers[cond.key] as string) : '';
  if (cond.includes !== undefined) return splitMulti(v).includes(cond.includes);
  if (cond.in) return cond.in.includes(v);
  if (cond.notIn) return v !== '' && !cond.notIn.includes(v);
  return true;
}
