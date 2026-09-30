import type { Answers, Field } from './types';
import { isVisible } from './visibility';
import { firstError, type ColombiaResolver } from './zod';

/** Validates one value against its field definition (Zod-backed). Returns a Spanish message or null. */
export function validateValue(field: Field, value: unknown, all: Answers, today: Date = new Date(), colombia?: ColombiaResolver): string | null {
  return firstError(field, value, { context: all, today, colombia });
}

export function validateFields(fields: Field[], values: Answers, context: Answers, today: Date = new Date(), colombia?: ColombiaResolver): Record<string, string> {
  const merged = { ...context, ...values };
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!isVisible(f.showIf, merged)) continue;
    const err = validateValue(f, values[f.key], merged, today, colombia);
    if (err) errors[f.key] = err;
  }
  return errors;
}
