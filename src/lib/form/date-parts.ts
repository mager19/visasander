/**
 * Pure helpers for the three-select date control (Día / Mes / Año).
 * Parts are strings: day and month zero-padded ('05'), year four digits ('1990'), '' when unset.
 */

export interface DateParts { day: string; month: string; year: string }
export interface Bounds { min: string | null; max: string | null }
export interface PartOption { value: string; label: string }

export const EMPTY_PARTS: DateParts = { day: '', month: '', year: '' };

export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Years offered when a side of the window is unbounded. */
const PAST_FALLBACK_YEARS = 120;
const FORWARD_FALLBACK_BACK_YEARS = 20;
const FUTURE_FALLBACK_YEARS = 10;

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });
const todayIso = (today: Date) => `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a month; with an unknown year February allows 29 so a birthday on the 29th stays selectable. */
export function daysInMonth(month: number, year?: number): number {
  if (month === 2) return year === undefined || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Splits `YYYY-MM-DD` into parts; anything else yields empty parts. */
export function partsFromIso(value: string): DateParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? { year: m[1], month: m[2], day: m[3] } : { ...EMPTY_PARTS };
}

/** The ISO date when all three parts are chosen and form a real date, otherwise ''. */
export function isoFromParts(p: DateParts): string {
  if (!p.day || !p.month || !p.year) return '';
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(m, y)) return '';
  return `${p.year}-${p.month}-${p.day}`;
}

/** True when the window points to the future (e.g. passport expiry): useful years come first ascending. */
export function isForward(bounds: Bounds, today: Date): boolean {
  return bounds.max !== null && bounds.max > todayIso(today);
}

/** Inclusive year window, filling unbounded sides with sensible defaults. */
export function yearWindow(bounds: Bounds, today: Date): { min: number; max: number } {
  const ty = today.getFullYear();
  const forward = isForward(bounds, today);
  const max = bounds.max ? ymd(bounds.max).y : ty + FUTURE_FALLBACK_YEARS;
  const min = bounds.min ? ymd(bounds.min).y : ty - (forward ? FORWARD_FALLBACK_BACK_YEARS : PAST_FALLBACK_YEARS);
  return { min, max: Math.max(min, max) };
}

/** Year options: descending from the max for past-looking fields, ascending from the min for forward-looking ones. */
export function yearOptions(bounds: Bounds, today: Date): string[] {
  const { min, max } = yearWindow(bounds, today);
  const years: string[] = [];
  for (let y = max; y >= min; y--) years.push(String(y));
  return isForward(bounds, today) ? years.reverse() : years;
}

/** Month options (Spanish names), trimmed at the first/last year of the window. */
export function monthOptions(year: string, bounds: Bounds, today: Date): PartOption[] {
  const y = Number(year);
  const win = yearWindow(bounds, today);
  const lo = year && bounds.min && y === win.min ? ymd(bounds.min).m : 1;
  const hi = year && bounds.max && y === win.max ? ymd(bounds.max).m : 12;
  const out: PartOption[] = [];
  for (let m = lo; m <= hi; m++) out.push({ value: pad(m), label: MONTH_NAMES[m - 1] });
  return out;
}

/** Day options for the chosen month/year, trimmed at the bound edges. */
export function dayOptions(year: string, month: string, bounds: Bounds, today: Date): string[] {
  const y = year ? Number(year) : undefined;
  const m = month ? Number(month) : 0;
  const last = m ? daysInMonth(m, y) : 31;
  let lo = 1, hi = last;
  if (y !== undefined && m) {
    const win = yearWindow(bounds, today);
    if (bounds.min && y === win.min && m === ymd(bounds.min).m) lo = ymd(bounds.min).d;
    if (bounds.max && y === win.max && m === ymd(bounds.max).m) hi = Math.min(hi, ymd(bounds.max).d);
  }
  const out: string[] = [];
  for (let d = lo; d <= hi; d++) out.push(pad(d));
  return out;
}

/**
 * Makes a selection consistent with the calendar and the bounds: a year outside the window is cleared,
 * a month outside the edge year is cleared, a day past the month's end is clamped to the last day and
 * a day outside the edge month is cleared. The result can never compose an out-of-bounds date.
 */
export function clampParts(p: DateParts, bounds: Bounds, today: Date): DateParts {
  const out = { ...p };
  if (out.year) {
    const { min, max } = yearWindow(bounds, today);
    const y = Number(out.year);
    if (y < min || y > max) out.year = '';
  }
  if (out.month && !monthOptions(out.year, bounds, today).some((o) => o.value === out.month)) out.month = '';
  if (out.day) {
    const days = dayOptions(out.year, out.month, bounds, today);
    if (!days.includes(out.day)) {
      const last = days[days.length - 1];
      // Past the end of the month (31 -> 30) clamps; below/above a bound edge clears.
      out.day = last && Number(out.day) > Number(last) && out.month && last === pad(daysInMonth(Number(out.month), out.year ? Number(out.year) : undefined)) ? last : '';
    }
  }
  return out;
}
