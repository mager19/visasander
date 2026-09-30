import { CHAPTERS } from '@/lib/form/schema';
import type { Answers, Field } from '@/lib/form/types';

function sampleValue(f: Field): string {
  switch (f.type) {
    case 'yesno': return 'no';
    case 'select': return f.options![0].value;
    case 'date': return f.after ? '2032-01-01' : '2020-01-01';
    case 'email': return 'a@b.co';
    case 'tel': return '3001234567';
    case 'number': return '1000';
    default: return 'x';
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
