import type { Answers, Field } from './types';
import { validateValue } from './validate';

const MAX_PASSES = 4;

/**
 * Payload for "Saltar por ahora": every visible field is sent, but a value that fails validation is
 * sent as '' so the server never keeps an invalid or stale value from an earlier save.
 * Cross-field rules are checked over what the SERVER will see (stored answers merged with the kept
 * values), repeating until stable so dropping one value also blanks fields that depended on it.
 */
export function buildSkipPayload(fields: Field[], values: Record<string, string>, stored: Answers, today: Date = new Date()): Record<string, string> {
  const kept: Record<string, string> = Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? '').trim()]));
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const context = { ...stored, ...kept };
    let changed = false;
    for (const f of fields) {
      if (kept[f.key] !== '' && validateValue(f, kept[f.key], context, today) !== null) {
        kept[f.key] = '';
        changed = true;
      }
    }
    if (!changed) break;
  }
  return kept;
}

/** Values after `changedKey` changed: every field that depends on it (`dependsOn`) is cleared. */
export function clearDependents(fields: Field[], values: Record<string, string>, changedKey: string): Record<string, string> {
  const out = { ...values };
  for (const f of fields) if (f.dependsOn === changedKey) out[f.key] = '';
  return out;
}
