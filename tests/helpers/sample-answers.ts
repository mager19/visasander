import { CHAPTERS } from '@/lib/form/schema';
import type { Answers, Field } from '@/lib/form/types';

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Today shifted by whole years (clamped away from Feb 29) so sample dates stay inside every range. */
const years = (n: number): string => { const d = new Date(); d.setDate(Math.min(d.getDate(), 28)); d.setFullYear(d.getFullYear() + n); return iso(d); };

function sampleValue(f: Field): string {
  switch (f.type) {
    case 'yesno': return 'no';
    case 'select': return f.options![0].value;
    case 'multiselect': return f.options![0].value;
    case 'co_department': return 'Antioquia';
    case 'co_city': return 'Medellín';
    case 'date':
      if (f.key === 'fecha_nacimiento') return '1990-05-15';
      if (f.key === 'pasaporte_caducidad') return years(5);
      if (f.after) return years(-1);
      return years(f.key === 'pasaporte_expedicion' ? -3 : -4);
    case 'email': return 'a@b.co';
    case 'tel': return '3001234567';
    case 'number': return '1000';
    default: return f.key === 'cedula' ? '1234567890' : 'x';
  }
}

export function sampleAnswers(overrides: Answers = {}): Answers {
  const a: Answers = {};
  for (const ch of CHAPTERS) {
    for (const s of ch.screens) {
      if (s.repeat) { a[`${s.repeat.key}__none`] = true; continue; }
      for (const f of s.fields) a[f.key] = sampleValue(f);
    }
  }
  return { ...a, ...overrides };
}

export const ALL_REQUIRED_FILES = ['passport', 'photo', 'national_id'];
