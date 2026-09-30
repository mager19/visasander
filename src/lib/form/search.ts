/** Lowercases and strips accents so "bogota" matches "Bogotá" and "MOMPOX" matches "Mompox". */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Options whose normalized text contains the normalized query (all options for an empty query), in their original order. */
export function filterOptions(options: readonly string[], query: string): string[] {
  const q = normalizeForSearch(query);
  return q ? options.filter((o) => normalizeForSearch(o).includes(q)) : [...options];
}
