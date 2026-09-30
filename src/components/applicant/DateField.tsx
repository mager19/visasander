import { useEffect, useState } from 'react';
import {
  clampParts, dayOptions, isoFromParts, monthOptions, partsFromIso, yearOptions, type Bounds, type DateParts,
} from '@/lib/form/date-parts';
import type { ControlA11y } from './FieldShell';

interface Props {
  fieldKey: string;
  value: string;
  bounds: Bounds;
  today: Date;
  onChange: (iso: string) => void;
  a11y: ControlA11y;
  disabled?: boolean;
}

type Part = keyof DateParts;

/**
 * Date as three native selects (Día / Mes / Año): phones show their native wheels and moving across
 * years is one scroll. Emits an ISO date only when all three parts are chosen, '' otherwise; the lists
 * are bounded so an out-of-range date can never be emitted.
 */
export function DateField({ fieldKey, value, bounds, today, onChange, a11y, disabled }: Props) {
  const [parts, setParts] = useState<DateParts>(() => partsFromIso(value));
  const [seen, setSeen] = useState(value);
  // An external value change (e.g. restored answers) replaces the local selection; our own emits do not.
  if (value !== seen) {
    setSeen(value);
    if (value !== isoFromParts(parts)) setParts(partsFromIso(value));
  }

  const emit = (next: DateParts) => {
    setParts(next);
    const iso = isoFromParts(next);
    setSeen(iso);
    if (iso !== value) onChange(iso);
  };

  // A stored value or a moved window (the issue date changed the expiry bounds) can leave parts
  // outside the lists: drop them so the parent never keeps an out-of-range date.
  useEffect(() => {
    const clamped = clampParts(parts, bounds, today);
    if (clamped.day !== parts.day || clamped.month !== parts.month || clamped.year !== parts.year) emit(clamped);
  }, [bounds.min, bounds.max, parts.day, parts.month, parts.year]);

  const set = (part: Part, v: string) => emit(clampParts({ ...parts, [part]: v }, bounds, today));

  const years = yearOptions(bounds, today);
  const months = monthOptions(parts.year, bounds, today);
  const days = dayOptions(parts.year, parts.month, bounds, today);
  const common = { 'aria-invalid': a11y.invalid, 'aria-describedby': a11y.describedBy, disabled };

  return (
    <div className="date-parts" role="group" aria-labelledby={a11y.labelId} data-field={fieldKey} data-type="date">
      <select id={a11y.id} className="control select" aria-label="Día" data-part="day" value={parts.day} onChange={(e) => set('day', e.target.value)} {...common}>
        <option value="">Día</option>
        {days.map((d) => <option key={d} value={d}>{Number(d)}</option>)}
      </select>
      <select className="control select" aria-label="Mes" data-part="month" value={parts.month} onChange={(e) => set('month', e.target.value)} {...common}>
        <option value="">Mes</option>
        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <select className="control select" aria-label="Año" data-part="year" value={parts.year} onChange={(e) => set('year', e.target.value)} {...common}>
        <option value="">Año</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
