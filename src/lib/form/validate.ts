import type { Answers, Field } from './types';
import { isVisible } from './visibility';

export function validateValue(field: Field, value: unknown, all: Answers): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v === '') return field.required ? 'Este campo es obligatorio' : null;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Correo no válido';
  if (field.type === 'tel' && v.replace(/\D/g, '').length < 7) return 'Teléfono no válido';
  if (field.type === 'number' && !/^\d+([.,]\d+)?$/.test(v)) return 'Número no válido';
  if (field.type === 'date') {
    const d = new Date(`${v}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return 'Fecha no válida';
    const other = field.after ? all[field.after] : undefined;
    if (typeof other === 'string' && other && v <= other) return 'Debe ser posterior a la fecha anterior';
  }
  return null;
}

export function validateFields(fields: Field[], values: Answers, context: Answers): Record<string, string> {
  const merged = { ...context, ...values };
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!isVisible(f.showIf, merged)) continue;
    const err = validateValue(f, values[f.key], merged);
    if (err) errors[f.key] = err;
  }
  return errors;
}
