import { z } from 'zod';
import type { Answers, Field } from './types';
import { isVisible, splitMulti } from './visibility';

/**
 * Zod schemas built from the declarative field definitions in schema.ts.
 * This is the single validation path: client screens, `validateValue`/`validateFields`
 * and the server patch check all go through `fieldSchema`.
 */

export const MAX_TEXT = 2000;
const MAX_NUMBER_DIGITS = 12;

/**
 * Membership checks for the Colombia lists. Injected by the server so this module never imports the
 * (large) dataset; without it `co_department`/`co_city` only require a non-empty value, because the
 * client UI picks from the lists.
 */
export interface ColombiaResolver {
  isDepartment(name: string): boolean;
  isCityOf(department: string, city: string): boolean;
}

export interface SchemaOptions {
  /** Optional Colombia membership resolver (server only). */
  colombia?: ColombiaResolver;
  /** Other answers, for cross-field rules (`after`, `dependsOn`). */
  context?: Answers;
  /** Injectable clock for date ranges. */
  today?: Date;
  /** Accept an empty value even for required fields (used to clear a field when saving). */
  allowEmpty?: boolean;
}

// ---------- dates ----------

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date as `YYYY-MM-DD`. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True for a real calendar date in `YYYY-MM-DD` form (2026-02-30 is not). */
export function isRealDate(v: string): boolean {
  if (!ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function shiftYears(today: Date, years: number): string {
  const y = today.getFullYear() + years;
  const m = today.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return toIsoDate(new Date(y, m, Math.min(today.getDate(), last)));
}

function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function afterMin(field: Field, context: Answers): string | null {
  const ref = field.after ? context[field.after] : undefined;
  return typeof ref === 'string' && isRealDate(ref.trim()) ? dayAfter(ref.trim()) : null;
}

function rangeBounds(field: Field, today: Date): { min: string | null; max: string | null } {
  const r = field.range;
  return {
    min: r?.yearsBack !== undefined ? shiftYears(today, -r.yearsBack) : null,
    max: r?.yearsForward !== undefined ? shiftYears(today, r.yearsForward) : null,
  };
}

/**
 * Inclusive ISO bounds for a date field, combining `range` and `after`
 * (min = the day after the referenced date). Shared by the UI pickers and validation.
 */
export function dateBounds(field: Field, context: Answers, today: Date): { min: string | null; max: string | null } {
  const range = rangeBounds(field, today);
  const after = afterMin(field, context);
  const min = range.min && after ? (range.min > after ? range.min : after) : (range.min ?? after);
  return { min, max: range.max };
}

/** Non-blocking notices for a value. Never used as validation errors. */
export function fieldWarnings(field: Field, value: unknown, _context: Answers, today: Date): string[] {
  const v = typeof value === 'string' ? value.trim() : '';
  if (field.key !== 'pasaporte_caducidad' || !isRealDate(v)) return [];
  const todayIso = toIsoDate(today);
  if (v < todayIso) return ['Tu pasaporte ya está vencido. Verifica la fecha.'];
  if (v < shiftMonths(today, 6)) return ['Tu pasaporte vence en menos de 6 meses.'];
  return [];
}

function shiftMonths(today: Date, months: number): string {
  const total = today.getMonth() + months;
  const y = today.getFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const last = new Date(y, m + 1, 0).getDate();
  return toIsoDate(new Date(y, m, Math.min(today.getDate(), last)));
}

// ---------- per-field schemas ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /^[+\d\s().-]+$/;
const NUMBER = /^\d+([.,]\d+)?$/;

function checkValue(field: Field, v: string, context: Answers, today: Date, colombia?: ColombiaResolver): string | null {
  switch (field.type) {
    case 'email':
      return EMAIL.test(v) ? null : 'Correo no válido';
    case 'tel': {
      const n = v.replace(/\D/g, '').length;
      return PHONE_CHARS.test(v) && n >= 7 && n <= 15 ? null : 'Teléfono no válido';
    }
    case 'number': {
      const n = v.replace(/\D/g, '').length;
      return NUMBER.test(v) && n <= MAX_NUMBER_DIGITS ? null : 'Número no válido';
    }
    case 'date': {
      if (!isRealDate(v)) return 'Fecha no válida';
      // Same bounds the UI pickers use; `after` is part of min (day after the referenced date).
      const { min, max } = dateBounds(field, context, today);
      if (max && v > max) return field.range?.yearsForward === 0 ? 'La fecha no puede ser futura' : 'La fecha es demasiado lejana';
      const after = afterMin(field, context);
      if (after && v < after) return field.afterMessage ?? 'Debe ser posterior a la fecha anterior';
      if (min && v < min) return 'La fecha es demasiado antigua';
      return null;
    }
    case 'select':
    case 'yesno': {
      const allowed = field.type === 'yesno' ? ['yes', 'no'] : (field.options ?? []).map((o) => o.value);
      return allowed.includes(v) ? null : 'Opción no válida';
    }
    case 'multiselect': {
      const values = splitMulti(v);
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      const ok = values.length > 0 && values.every((x) => allowed.has(x)) && new Set(values).size === values.length && values.join(',') === v.replace(/\s/g, '');
      return ok ? null : 'Opción no válida';
    }
    case 'co_department':
      return !colombia || colombia.isDepartment(v) ? null : 'Departamento no válido';
    case 'co_city': {
      const dep = field.dependsOn ? context[field.dependsOn] : undefined;
      if (typeof dep !== 'string' || !dep.trim()) return 'Selecciona primero el departamento';
      return !colombia || colombia.isCityOf(dep.trim(), v) ? null : 'Ciudad no válida para el departamento';
    }
    default:
      break;
  }
  if (field.digits) {
    const { min, max } = field.digits;
    const ok = /^[\d\s-]+$/.test(v) && v.replace(/\D/g, '').length >= min && v.replace(/\D/g, '').length <= max;
    if (!ok) return `Debe tener entre ${min} y ${max} dígitos`;
  }
  return null;
}

/** Builds the Zod schema of one field. Values are trimmed strings; messages are Spanish. */
export function fieldSchema(field: Field, opts: SchemaOptions = {}): z.ZodType<string> {
  const context = opts.context ?? {};
  const today = opts.today ?? new Date();
  const emptyOk = opts.allowEmpty === true || !field.required;
  return z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
      if (v === '') return emptyOk ? undefined : fail('Este campo es obligatorio');
      if (v.length > MAX_TEXT) return fail(`Máximo ${MAX_TEXT} caracteres`);
      const msg = checkValue(field, v, context, today, opts.colombia);
      if (msg) fail(msg);
    });
}

/** One object schema for a screen: only fields visible under `context` + their own values are included. */
export function screenSchema(fields: Field[], opts: SchemaOptions & { values?: Answers } = {}) {
  const merged = { ...(opts.context ?? {}), ...(opts.values ?? {}) };
  const shape: Record<string, z.ZodType<string>> = {};
  for (const f of fields) {
    if (isVisible(f.showIf, merged)) shape[f.key] = fieldSchema(f, { ...opts, context: merged });
  }
  return z.object(shape);
}

/** First Spanish error message of a field schema for `value`, or null when valid. */
export function firstError(field: Field, value: unknown, opts: SchemaOptions = {}): string | null {
  const r = fieldSchema(field, opts).safeParse(typeof value === 'string' ? value : '');
  return r.success ? null : (r.error.issues[0]?.message ?? 'Valor no válido');
}
