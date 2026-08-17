import type { Country } from '../types/tourvisor';

/** Не показываем в подборе направлений (главная + wizard). */
export const EXCLUDED_DESTINATION_COUNTRY_IDS = new Set<number>([
  14, // Испания
]);

/** Короткий список популярных направлений на главной. */
export const HOME_POPULAR_COUNTRY_IDS: readonly number[] = [
  4, // Турция
  1, // Египет
  9, // ОАЭ
  5, // Тунис
  2, // Таиланд
  15, // Кипр
  16, // Вьетнам
  12, // Шри-Ланка
  11, // Доминикана
  6, // Греция
  47, // Россия
  46, // Абхазия
];

export function filterExcludedDestinationCountries(countries: Country[]): Country[] {
  return countries.filter((c) => !EXCLUDED_DESTINATION_COUNTRY_IDS.has(c.id));
}

/** Главная: только популярные (без Испании и пр.), максимум 12 пунктов. */
export function pickHomeDestinationCountries(all: Country[]): Country[] {
  const allowed = filterExcludedDestinationCountries(all);
  const popular = HOME_POPULAR_COUNTRY_IDS.map((id) => allowed.find((c) => c.id === id)).filter(
    (c): c is Country => !!c,
  );
  if (popular.length >= 8) return popular.slice(0, 12);
  const popularSet = new Set(HOME_POPULAR_COUNTRY_IDS);
  const rest = allowed.filter((c) => !popularSet.has(c.id));
  return [...popular, ...rest].slice(0, 12);
}
