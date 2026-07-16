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

import type { Operator } from '../types/tourvisor';

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

/** Нормализует название оператора для нечёткого сравнения. */
function normalizeOperatorName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]/gi, '');
}

/** Турция/Египет определяются по названию страны (RU/EN). */
export function isTurkeyOrEgypt(countryName: string | null | undefined): boolean {
  const n = normalizeOperatorName(countryName);
  return (
    n.includes('турция') ||
    n.includes('turkey') ||
    n.includes('turkiye') ||
    n.includes('türkiye') ||
    n.includes('trkiye') ||
    n.includes('египет') ||
    n.includes('egypt')
  );
}

/** Возвращает список допустимых названий операторов для страны. */
export function getAllowedOperatorNames(countryName: string | null | undefined): string[] {
  return isTurkeyOrEgypt(countryName) ? OPERATORS_TURKEY_EGYPT : OPERATORS_GENERAL;
}

/** Проверяет, входит ли оператор из справочника в список допустимых названий. */
function operatorMatchesAllowed(operator: Operator, allowedNormalized: string[]): boolean {
  const candidates = [operator.name, operator.russianName, operator.fullName]
    .map(normalizeOperatorName)
    .filter(Boolean);
  return candidates.some((cand) =>
    allowedNormalized.some((allowed) => cand.includes(allowed) || allowed.includes(cand)),
  );
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
  const allowedNormalized = allowedNames.map(normalizeOperatorName);

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
