import { describe, expect, it } from 'vitest';
import {
  clampParts, dayOptions, daysInMonth, isForward, isoFromParts, monthOptions, partsFromIso, yearOptions, yearWindow,
} from '@/lib/form/date-parts';
import { CHAPTERS } from '@/lib/form/schema';
import { dateBounds } from '@/lib/form/zod';

const TODAY = new Date(2026, 8, 30); // 2026-09-30, local time
const byKey = (k: string) => CHAPTERS.flatMap((c) => c.screens).flatMap((s) => s.fields).find((f) => f.key === k)!;
const parts = (year: string, month: string, day: string) => ({ year, month, day });

describe('daysInMonth', () => {
  it('handles leap years and unknown years', () => {
    expect(daysInMonth(2, 2024)).toBe(29);
    expect(daysInMonth(2, 2023)).toBe(28);
    expect(daysInMonth(2, 1900)).toBe(28);
    expect(daysInMonth(2, 2000)).toBe(29);
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4, 2023)).toBe(30);
    expect(daysInMonth(12, 2023)).toBe(31);
  });
});

describe('iso <-> parts', () => {
  it('round-trips a full date and rejects partial or impossible ones', () => {
    expect(partsFromIso('1990-05-15')).toEqual(parts('1990', '05', '15'));
    expect(partsFromIso('')).toEqual(parts('', '', ''));
    expect(partsFromIso('15/05/1990')).toEqual(parts('', '', ''));
    expect(isoFromParts(parts('1990', '05', '15'))).toBe('1990-05-15');
    expect(isoFromParts(parts('1990', '05', ''))).toBe('');
    expect(isoFromParts(parts('2023', '02', '29'))).toBe('');
  });
});

describe('year list order', () => {
  it('goes descending from the max year for past fields (birth date)', () => {
    const b = dateBounds(byKey('fecha_nacimiento'), {}, TODAY);
    const years = yearOptions(b, TODAY);
    expect(isForward(b, TODAY)).toBe(false);
    expect(years[0]).toBe('2026');
    expect(years[years.length - 1]).toBe('1906');
    expect(years).toHaveLength(121);
  });
  it('goes ascending from the min year for forward fields (passport expiry after the issue date)', () => {
    const b = dateBounds(byKey('pasaporte_caducidad'), { pasaporte_expedicion: '2022-01-10' }, TODAY);
    const years = yearOptions(b, TODAY);
    expect(isForward(b, TODAY)).toBe(true);
    expect(years[0]).toBe('2022');
    expect(years[years.length - 1]).toBe('2046');
  });
  it('fills unbounded sides with defaults', () => {
    expect(yearWindow({ min: null, max: null }, TODAY)).toEqual({ min: 1906, max: 2036 });
    expect(yearWindow({ min: null, max: '2046-09-30' }, TODAY)).toEqual({ min: 2006, max: 2046 });
  });
});

describe('month and day options at the bound edges', () => {
  const birth = { min: '1906-09-30', max: '2026-09-30' };
  it('trims months in the first and last year only', () => {
    expect(monthOptions('2026', birth, TODAY).map((o) => o.value)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09']);
    expect(monthOptions('1906', birth, TODAY)[0]).toEqual({ value: '09', label: 'Septiembre' });
    expect(monthOptions('1990', birth, TODAY)).toHaveLength(12);
    expect(monthOptions('', birth, TODAY)).toHaveLength(12);
  });
  it('trims days in the edge month and follows month length', () => {
    expect(dayOptions('1906', '09', birth, TODAY)).toEqual(['30']);
    expect(dayOptions('2026', '09', birth, TODAY)).toHaveLength(30);
    expect(dayOptions('2024', '02', birth, TODAY)).toHaveLength(29);
    expect(dayOptions('2023', '02', birth, TODAY)).toHaveLength(28);
    expect(dayOptions('', '', birth, TODAY)).toHaveLength(31);
    const expiry = { min: '2022-01-11', max: '2046-09-30' };
    expect(dayOptions('2022', '01', expiry, TODAY)[0]).toBe('11');
  });
});

describe('clampParts', () => {
  const birth = { min: '1906-09-30', max: '2026-09-30' };
  it('clamps day 31 to the end of a 30-day month and Feb 29 in a non-leap year', () => {
    expect(clampParts(parts('1990', '04', '31'), birth, TODAY)).toEqual(parts('1990', '04', '30'));
    expect(clampParts(parts('2023', '02', '29'), birth, TODAY)).toEqual(parts('2023', '02', '28'));
    expect(clampParts(parts('', '02', '31'), birth, TODAY)).toEqual(parts('', '02', '29'));
  });
  it('clears parts that fall outside the bounds', () => {
    expect(clampParts(parts('2026', '12', '01'), birth, TODAY)).toEqual(parts('2026', '', '01'));
    expect(clampParts(parts('1800', '01', '01'), birth, TODAY)).toEqual(parts('', '01', '01'));
    const expiry = { min: '2022-01-11', max: '2046-09-30' };
    expect(clampParts(parts('2022', '01', '05'), expiry, TODAY)).toEqual(parts('2022', '01', ''));
    expect(clampParts(parts('2021', '06', '05'), expiry, TODAY)).toEqual(parts('', '06', '05'));
  });
  it('keeps a valid selection untouched', () => {
    expect(clampParts(parts('1990', '05', '15'), birth, TODAY)).toEqual(parts('1990', '05', '15'));
  });
  it('never composes an out-of-bounds date', () => {
    const expiry = { min: '2022-01-11', max: '2046-09-30' };
    for (const p of [parts('2022', '01', '01'), parts('2046', '10', '01'), parts('2046', '09', '31'), parts('2010', '05', '05')]) {
      const iso = isoFromParts(clampParts(p, expiry, TODAY));
      if (iso) {
        expect(iso >= expiry.min).toBe(true);
        expect(iso <= expiry.max).toBe(true);
      }
    }
  });
});
