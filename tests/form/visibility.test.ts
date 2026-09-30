import { describe, expect, it } from 'vitest';
import { isVisible, splitMulti } from '@/lib/form/visibility';

describe('isVisible', () => {
  it('keeps in / notIn semantics', () => {
    expect(isVisible({ key: 'q', in: ['yes'] }, { q: 'yes' })).toBe(true);
    expect(isVisible({ key: 'q', in: ['yes'] }, { q: 'no' })).toBe(false);
    expect(isVisible({ key: 'q', notIn: ['yo'] }, { q: 'otro' })).toBe(true);
    expect(isVisible({ key: 'q', notIn: ['yo'] }, {})).toBe(false);
    expect(isVisible(undefined, {})).toBe(true);
  });
  it('supports includes on comma-separated answers', () => {
    const c = { key: 'idiomas', includes: 'otro' };
    expect(isVisible(c, { idiomas: 'es,otro' })).toBe(true);
    expect(isVisible(c, { idiomas: 'otro' })).toBe(true);
    expect(isVisible(c, { idiomas: 'es,en' })).toBe(false);
    expect(isVisible(c, { idiomas: 'otros' })).toBe(false);
    expect(isVisible(c, { idiomas: '' })).toBe(false);
    expect(isVisible(c, {})).toBe(false);
  });
  it('splits multiselect values', () => {
    expect(splitMulti('es, en,')).toEqual(['es', 'en']);
    expect(splitMulti(undefined)).toEqual([]);
  });
});
