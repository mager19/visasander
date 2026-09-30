import type { Answers, Chapter, Field } from './types';
import { isFilled, isVisible, splitMulti } from './visibility';

export interface Row { label: string; value: string; missing: boolean }

function format(field: Field, raw: unknown, answers: Answers = {}): string {
  if (!isFilled(raw)) return '';
  const v = (raw as string).trim();
  if (field.type === 'yesno') return v === 'yes' ? 'Sí' : 'No';
  if (field.type === 'select') return field.options?.find((o) => o.value === v)?.label ?? v;
  if (field.type === 'multiselect') {
    const labels = splitMulti(v).map((x) => {
      const label = field.options?.find((o) => o.value === x)?.label ?? x;
      const other = answers[`${field.key}_otro`];
      return x === 'otro' && isFilled(other) ? `${label} (${(other as string).trim()})` : label;
    });
    return labels.join(', ');
  }
  return v;
}

export function chapterRows(chapter: Chapter, answers: Answers): Row[] {
  const rows: Row[] = [];
  for (const screen of chapter.screens) {
    if (!isVisible(screen.showIf, answers)) continue;
    if (screen.repeat) {
      const { key } = screen.repeat;
      const entries = Array.isArray(answers[key]) ? (answers[key] as Answers[]) : [];
      if (answers[`${key}__none`] === true) { rows.push({ label: screen.title, value: 'Ninguno', missing: false }); continue; }
      if (entries.length === 0) { rows.push({ label: screen.title, value: '', missing: true }); continue; }
      entries.forEach((entry, i) => {
        const value = screen.fields.filter((f) => isFilled(entry[f.key])).map((f) => `${f.label}: ${format(f, entry[f.key])}`).join(' · ');
        const missing = screen.fields.some((f) => f.required && !isFilled(entry[f.key]));
        rows.push({ label: `${screen.title} #${i + 1}`, value, missing });
      });
      continue;
    }
    for (const f of screen.fields) {
      if (!isVisible(f.showIf, answers)) continue;
      const value = format(f, answers[f.key], answers);
      rows.push({ label: f.label, value, missing: f.required && value === '' });
    }
  }
  return rows;
}

export function chapterAsText(chapter: Chapter, answers: Answers): string {
  return chapterRows(chapter, answers).map((r) => `${r.label}: ${r.value || '—'}`).join('\n');
}
