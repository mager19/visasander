import { describe, expect, it } from 'vitest';
import { citiesOf, COLOMBIA, COLOMBIA_DEPARTMENTS, getColombia, isCityOf } from '@/lib/data/colombia';

describe('Colombia data (DIVIPOLA)', () => {
  it('has 32 departments plus Bogotá D.C.', () => {
    expect(COLOMBIA).toHaveLength(33);
    expect(COLOMBIA_DEPARTMENTS).toContain('Bogotá, D.C.');
    expect(COLOMBIA_DEPARTMENTS).toContain('San Andrés, Providencia y Santa Catalina');
  });
  it('has roughly 1,100-1,125 municipalities', () => {
    const total = COLOMBIA.reduce((n, d) => n + d.cities.length, 0);
    expect(total).toBeGreaterThanOrEqual(1100);
    expect(total).toBeLessThanOrEqual(1125);
  });
  it('has no duplicates and is sorted with Spanish collation', () => {
    const deps = COLOMBIA.map((d) => d.department);
    expect(new Set(deps).size).toBe(deps.length);
    expect(deps).toEqual([...deps].sort((a, b) => a.localeCompare(b, 'es')));
    for (const d of COLOMBIA) {
      expect(new Set(d.cities).size).toBe(d.cities.length);
      expect(d.cities).toEqual([...d.cities].sort((a, b) => a.localeCompare(b, 'es')));
    }
  });
  it('spot-checks well-known cities', () => {
    expect(citiesOf('Antioquia')).toContain('Medellín');
    expect(citiesOf('Valle del Cauca')).toContain('Cali');
    expect(citiesOf('Atlántico')).toContain('Barranquilla');
    expect(citiesOf('Bolívar')).toContain('Cartagena de Indias');
    expect(isCityOf('Antioquia', 'Cali')).toBe(false);
    expect(citiesOf('Narnia')).toEqual([]);
  });
  it('uses Title Case names without shouting', () => {
    for (const d of COLOMBIA) for (const c of d.cities) expect(c).not.toMatch(/[A-ZÁÉÍÓÚ]{3}/);
  });
  it('can be loaded asynchronously for lazy client imports', async () => {
    expect(await getColombia()).toBe(COLOMBIA);
  });
});
