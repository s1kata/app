/**
 * Популярные запросы для фоновой синхронизации Firestore → локальный кэш.
 * Совпадает с seedPopularSearches и popularSearches в Firestore.
 */

import { TourSearchParams } from '../types/tourvisor';

function getNextWeeks(weeksFromNow: number): { dateFrom: string; dateTo: string; nightsFrom: number; nightsTo: number } {
  const from = new Date();
  from.setDate(from.getDate() + weeksFromNow * 7);
  const to = new Date(from);
  to.setDate(to.getDate() + 14);
  return {
    dateFrom: from.toISOString().split('T')[0],
    dateTo: to.toISOString().split('T')[0],
    nightsFrom: 7,
    nightsTo: 14,
  };
}

// Совпадает с seedPopularSearches (functions). Расширенный список популярных направлений.
const POPULAR_COMBOS = [
  { departureId: 1, countryId: 1 },
  { departureId: 1, countryId: 2 },
  { departureId: 1, countryId: 4 },
  { departureId: 1, countryId: 3 },
  { departureId: 1, countryId: 5 },
  { departureId: 1, countryId: 6 },
  { departureId: 1, countryId: 7 },
  { departureId: 1, countryId: 8 },
  { departureId: 1, countryId: 9 },
  { departureId: 1, countryId: 10 },
  { departureId: 1, countryId: 11 },
  { departureId: 1, countryId: 12 },
  { departureId: 1, countryId: 13 },
  { departureId: 1, countryId: 14 },
  { departureId: 1, countryId: 15 },
  { departureId: 1, countryId: 16 },
  { departureId: 1, countryId: 17 },
  { departureId: 1, countryId: 18 },
  { departureId: 7, countryId: 1 },
  { departureId: 7, countryId: 2 },
  { departureId: 7, countryId: 4 },
  { departureId: 7, countryId: 3 },
  { departureId: 7, countryId: 5 },
  { departureId: 7, countryId: 6 },
  { departureId: 7, countryId: 7 },
  { departureId: 7, countryId: 8 },
  { departureId: 7, countryId: 10 },
  { departureId: 7, countryId: 11 },
  { departureId: 7, countryId: 12 },
  { departureId: 7, countryId: 15 },
  { departureId: 7, countryId: 17 },
  { departureId: 2, countryId: 1 },
  { departureId: 2, countryId: 2 },
  { departureId: 2, countryId: 3 },
  { departureId: 2, countryId: 4 },
  { departureId: 2, countryId: 5 },
  { departureId: 2, countryId: 10 },
  { departureId: 3, countryId: 1 },
  { departureId: 3, countryId: 2 },
  { departureId: 3, countryId: 3 },
  { departureId: 3, countryId: 4 },
  { departureId: 3, countryId: 5 },
];

/**
 * Список TourSearchParams для синхронизации (первые 2 недели × топ комбинаций).
 */
export function getPopularTourSearchParams(): TourSearchParams[] {
  const params: TourSearchParams[] = [];
  for (const combo of POPULAR_COMBOS) {
    for (let week = 0; week <= 1; week++) {
      const { dateFrom, dateTo, nightsFrom, nightsTo } = getNextWeeks(week);
      params.push({
        departureId: combo.departureId,
        countryId: combo.countryId,
        dateFrom,
        dateTo,
        nightsFrom,
        nightsTo,
        adults: 2,
        currency: 'RUB',
        onlyCharter: false,
      });
    }
  }
  return params;
}
