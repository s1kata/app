/** Нормализация строки для поиска стран (ru/en, регистр, ё). */
export function normalizeCountrySearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

/** Проверка: страна подходит под поисковый запрос. */
export function countryMatchesQuery(countryName: string, query: string): boolean {
  const q = normalizeCountrySearch(query);
  if (!q) return true;
  const name = normalizeCountrySearch(countryName);
  return name.includes(q);
}
