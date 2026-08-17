/**
 * Фильтр туроператоров по стране.
 *
 * Список операторов зависит от направления:
 *  - Турция и Египет — узкий список (charter-операторы этих направлений).
 *  - Все остальные страны — общий список.
 *
 * Названия сопоставляются с справочником операторов Tourvisor (GET /operators)
 * по полям name / russianName / fullName через нормализацию (регистр, пробелы,
 * пунктуация, ё→е игнорируются), поэтому и латиница, и кириллица матчатся.
 */

import type { Operator, Tour, TourHotel } from '../types/tourvisor';

/** Общий список операторов (все страны, кроме Турции и Египта). */
export const OPERATORS_GENERAL: string[] = [
  'Fun Sun',
  'Anex',
  'Coral',
  'Sunmar',
  'Pegas',
  'Русский экспресс',
  'Loti',
  'Библио глобус',
  'Paks',
  "Let's fly",
  'Интурист',
  'Амботис',
];

/** Список операторов для Турции и Египта. */
export const OPERATORS_TURKEY_EGYPT: string[] = [
  'Fun Sun',
  'Coral',
  'Anex',
  'Sunmar',
  'Pegas',
  'Интурист',
  'Библио глобус',
];

/** Дополнительные токены для сопоставления с названиями в Tourvisor (латиница/кириллица). */
const OPERATOR_SEARCH_TOKENS: Partial<Record<string, string[]>> = {
  'Fun Sun': ['funsun', 'funandsun'],
  Anex: ['anex', 'анекс'],
  Coral: ['coral', 'coraltravel'],
  Sunmar: ['sunmar'],
  Pegas: ['pegas', 'pegastouristik'],
  'Русский экспресс': ['русскийэкспресс', 'russianexpress'],
  Loti: ['loti'],
  'Библио глобус': ['библиоглобус', 'biblioglobus', 'biblioglobal'],
  Paks: ['paks', 'paksglobus'],
  "Let's fly": ['letsfly'],
  Интурист: ['интурист', 'intourist'],
  Амботис: ['амботис', 'ambotis'],
};

/** Нормализует название оператора для нечёткого сравнения. */
function normalizeOperatorName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]/gi, '');
}

function getSearchTokensForAllowedName(name: string): string[] {
  const normalized = normalizeOperatorName(name);
  const extra = OPERATOR_SEARCH_TOKENS[name] ?? [];
  return [normalized, ...extra];
}

function getOperatorNameCandidates(operator: Operator | null | undefined): string[] {
  if (!operator) return [];
  return [operator.name, operator.russianName, operator.fullName]
    .map(normalizeOperatorName)
    .filter(Boolean);
}

/** Турция определяется по названию страны (RU/EN). */
export function isTurkey(countryName: string | null | undefined): boolean {
  const n = normalizeOperatorName(countryName);
  return (
    n.includes('турция') ||
    n.includes('turkey') ||
    n.includes('turkiye') ||
    n.includes('türkiye') ||
    n.includes('trkiye')
  );
}

/** Турция/Египет определяются по названию страны (RU/EN). */
export function isTurkeyOrEgypt(countryName: string | null | undefined): boolean {
  const n = normalizeOperatorName(countryName);
  return isTurkey(countryName) || n.includes('египет') || n.includes('egypt');
}

/**
 * operatorIds на старте поиска Tourvisor сильно сужает выдачу и зависит от города вылета.
 * Allowlist применяется на клиенте по названию оператора (filterTourHotelsByCountryOperators).
 */
export function shouldSendOperatorIdsInSearchRequest(_countryName?: string | null): boolean {
  return false;
}

/** Возвращает список допустимых названий операторов для страны. */
export function getAllowedOperatorNames(countryName: string | null | undefined): string[] {
  return isTurkeyOrEgypt(countryName) ? OPERATORS_TURKEY_EGYPT : OPERATORS_GENERAL;
}

/** Проверяет, входит ли оператор из справочника в список допустимых названий. */
function operatorMatchesAllowed(operator: Operator, allowedNormalized: string[]): boolean {
  const candidates = getOperatorNameCandidates(operator);
  return candidates.some((cand) =>
    allowedNormalized.some((allowed) => cand.includes(allowed) || allowed.includes(cand)),
  );
}

/** Проверяет, допустим ли оператор тура для выбранной страны. */
export function isTourOperatorAllowed(
  operator: Operator | null | undefined,
  countryName: string | null | undefined,
): boolean {
  if (!operator) {
    // Без оператора не режем жёстко — иначе пустая выдача и падения на null
    return true;
  }
  const allowedNormalized = getAllowedOperatorNames(countryName).flatMap(getSearchTokensForAllowedName);
  return getOperatorNameCandidates(operator).some((cand) =>
    allowedNormalized.some((allowed) => cand.includes(allowed) || allowed.includes(cand)),
  );
}

/** Фильтрует туры в результатах поиска по allowlist операторов для страны отеля. */
export function filterTourHotelsByCountryOperators(hotels: TourHotel[]): TourHotel[] {
  if (!Array.isArray(hotels) || hotels.length === 0) return [];

  return hotels
    .map((hotel) => {
      const countryName = hotel.country?.name;
      const filteredTours = hotel.tours.filter((tour: Tour) =>
        isTourOperatorAllowed(tour.operator, countryName),
      );
      return filteredTours.length > 0 ? { ...hotel, tours: filteredTours } : null;
    })
    .filter((hotel): hotel is TourHotel => hotel !== null);
}

/**
 * Фильтрует справочник операторов до допустимых для выбранной страны.
 * Сохраняет порядок из списка-конфига (для стабильного UI).
 */
export function getAllowedOperators(
  operators: Operator[],
  countryName: string | null | undefined,
): Operator[] {
  if (!Array.isArray(operators) || operators.length === 0) return [];
  const allowedNames = getAllowedOperatorNames(countryName);
  const allowedNormalized = allowedNames.flatMap(getSearchTokensForAllowedName);

  const matched = operators.filter((op) => operatorMatchesAllowed(op, allowedNormalized));

  // Сортируем по позиции в списке-конфиге (совпадение по нормализованному имени).
  return matched.sort((a, b) => rankOperator(a, allowedNormalized) - rankOperator(b, allowedNormalized));
}

function rankOperator(operator: Operator, allowedNormalized: string[]): number {
  const candidates = [operator.name, operator.russianName, operator.fullName]
    .map(normalizeOperatorName)
    .filter(Boolean);
  for (let i = 0; i < allowedNormalized.length; i++) {
    const allowed = allowedNormalized[i];
    if (candidates.some((cand) => cand.includes(allowed) || allowed.includes(cand))) return i;
  }
  return allowedNormalized.length;
}

/** Возвращает id допустимых операторов для страны (для параметра operatorIds в запросе). */
export function getAllowedOperatorIds(
  operators: Operator[],
  countryName: string | null | undefined,
): number[] {
  return getAllowedOperators(operators, countryName).map((op) => op.id);
}
