import { describe, expect, it } from 'vitest';
import { selectVariant } from '@/lib/form/controls';
import { filterOptions, normalizeForSearch } from '@/lib/form/search';
import type { Field } from '@/lib/form/types';

describe('normalizeForSearch', () => {
  it('ignores accents, case and extra spaces', () => {
    expect(normalizeForSearch('Bogotá')).toBe('bogota');
    expect(normalizeForSearch('  SANTA  Cruz de Mompóx ')).toBe('santa cruz de mompox');
    expect(normalizeForSearch('Cúcuta')).toBe('cucuta');
    expect(normalizeForSearch('Ñ')).toBe('n');
  });
});

describe('filterOptions', () => {
  const cities = ['Bogotá', 'Medellín', 'Envigado', 'Itagüí', 'Cúcuta'];
  it('matches substrings without accents or case', () => {
    expect(filterOptions(cities, 'medel')).toEqual(['Medellín']);
    expect(filterOptions(cities, 'CUC')).toEqual(['Cúcuta']);
    expect(filterOptions(cities, 'itagui')).toEqual(['Itagüí']);
    expect(filterOptions(cities, 'D')).toEqual(['Medellín', 'Envigado']);
  });
  it('returns every option for an empty query and none when nothing matches', () => {
    expect(filterOptions(cities, '  ')).toEqual(cities);
    expect(filterOptions(cities, 'zzz')).toEqual([]);
  });
});

describe('selectVariant', () => {
  const field = (n: number): Field => ({ key: 'k', label: 'K', type: 'select', required: true, options: Array.from({ length: n }, (_, i) => ({ value: String(i), label: String(i) })) });
  it('renders up to 3 options as segmented buttons and longer lists as a native select', () => {
    expect(selectVariant(field(2))).toBe('segmented');
    expect(selectVariant(field(3))).toBe('segmented');
    expect(selectVariant(field(4))).toBe('native');
  });
});
