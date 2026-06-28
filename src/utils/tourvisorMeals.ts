import type { TourMealId, TourSearchParams } from '../types/tourvisor';
import { VALID_TOUR_MEAL_IDS } from '../types/tourvisor';

const VALID_SET = new Set<number>(VALID_TOUR_MEAL_IDS);

export function isValidTourMealId(id: unknown): id is TourMealId {
  return typeof id === 'number' && VALID_SET.has(id);
}

/** Для API: вернуть id или undefined (параметр не отправлять). */
export function sanitizeTourMealParam(meal: unknown): TourMealId | undefined {
  const n = Number(meal);
  return isValidTourMealId(n) ? n : undefined;
}

export function filterMealsForUi<T extends { id: number }>(meals: T[]): T[] {
  return meals.filter((m) => isValidTourMealId(m.id));
}

/** Удаляет невалидный meal из параметров поиска. */
export function applyTourMealToSearchParams(params: TourSearchParams): TourSearchParams {
  const next = { ...params };
  const meal = sanitizeTourMealParam(next.meal);
  if (meal !== undefined) {
    next.meal = meal;
  } else {
    delete next.meal;
  }
  return next;
}
