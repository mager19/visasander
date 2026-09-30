import { CHAPTERS } from './schema';
import type { Answers } from './types';

const MAX_PATCH_BYTES = 50_000;
const MAX_STRING = 2000;
const MAX_ENTRIES = 20;

type Spec = { kind: 'text' } | { kind: 'none' } | { kind: 'repeat'; fields: Set<string> };
const SPECS = new Map<string, Spec>();
for (const ch of CHAPTERS) {
  for (const s of ch.screens) {
    if (s.repeat) {
      SPECS.set(s.repeat.key, { kind: 'repeat', fields: new Set(s.fields.map((f) => f.key)) });
      SPECS.set(`${s.repeat.key}__none`, { kind: 'none' });
    } else {
      for (const f of s.fields) SPECS.set(f.key, { kind: 'text' });
    }
  }
}

const hasNul = (s: string): boolean => s.includes('\u0000');
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Returns a cleaned patch, or null if anything is unknown, mistyped, or oversized. */
export function sanitizePatch(input: unknown): Answers | null {
  if (!isPlainObject(input)) return null;
  if (JSON.stringify(input).length > MAX_PATCH_BYTES) return null;
  const out: Answers = {};
  for (const [key, value] of Object.entries(input)) {
    const spec = SPECS.get(key);
    if (!spec) return null;
    if (spec.kind === 'text') {
      if (typeof value !== 'string' || value.length > MAX_STRING || hasNul(value)) return null;
      out[key] = value.trim();
    } else if (spec.kind === 'none') {
      if (typeof value !== 'boolean') return null;
      out[key] = value;
    } else {
      if (!Array.isArray(value) || value.length > MAX_ENTRIES) return null;
      const entries: Record<string, string>[] = [];
      for (const entry of value) {
        if (!isPlainObject(entry)) return null;
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(entry)) {
          if (!spec.fields.has(k) || typeof v !== 'string' || v.length > MAX_STRING || hasNul(v)) return null;
          clean[k] = v.trim();
        }
        entries.push(clean);
      }
      out[key] = entries;
    }
  }
  return out;
}
