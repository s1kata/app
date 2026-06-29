/**
 * Общий ключ кэша и фильтр туров для поиска туров.
 * Используется в useTourSearch и ApiTourHotelSearch.
 *
 * ВАЖНО: Нормализация и стабильный хэш — одинаковые параметры
 * (разный порядок полей, пробелы в строках) дают один и тот же ключ.
 */

import NetInfo from '@react-native-community/netinfo';
import { TourSearchParams, TourHotel } from '../types/tourvisor';
import { sanitizeTourMealParam } from './tourvisorMeals';

/** Показываем и ищем столько туров, сколько вернёт API (без пагинации) */
export const TOUR_SEARCH_LIMIT = 30;
const DEFAULT_LIMIT = TOUR_SEARCH_LIMIT;

/** Порядок полей для стабильной сериализации (алфавитный) */
const PARAM_KEYS = [
  'adults', 'arrivalId', 'childs', 'countryId', 'currency', 'dateFrom', 'dateTo',
  'departureId', 'hotelCategory', 'hotelRating', 'hotelIds', 'hotelServices', 'hotelTypes',
  'meal', 'nightsFrom', 'nightsTo', 'onlyCharter', 'operatorIds', 'priceFrom', 'priceTo',
  'regionIds', 'subregionIds',
] as const;

/**
 * Нормализует параметры поиска для стабильного ключа:
 * - Приведение типов (number, boolean)
 * - Trim строк (currency, dateFrom, dateTo)
 * - Сортировка массивов (childs, regionIds, etc.)
 * - Дефолты для onlyCharter, currency
 */
export function normalizeTourSearchParams(params: TourSearchParams): TourSearchParams {
  if (!params) return params;
  const p = { ...params };
  if (typeof p.currency === 'string') p.currency = (p.currency || 'RUB').trim().toUpperCase();
  if (typeof p.dateFrom === 'string') p.dateFrom = p.dateFrom.trim();
  if (typeof p.dateTo === 'string') p.dateTo = p.dateTo.trim();
  p.departureId = Number(p.departureId);
  p.countryId = Number(p.countryId);
  p.nightsFrom = Number(p.nightsFrom);
  p.nightsTo = Number(p.nightsTo);
  p.adults = Number(p.adults);
  p.onlyCharter = Boolean(p.onlyCharter);
  const meal = sanitizeTourMealParam(p.meal);
  if (meal !== undefined) {
    p.meal = meal;
  } else {
    delete p.meal;
  }
  if (p.arrivalId != null) p.arrivalId = Number(p.arrivalId);
  if (p.hotelCategory != null) p.hotelCategory = Number(p.hotelCategory);
  if (p.hotelRating != null) p.hotelRating = Number(p.hotelRating);
  if (p.priceFrom != null) p.priceFrom = Number(p.priceFrom);
  if (p.priceTo != null) p.priceTo = Number(p.priceTo);
  // Массивы — копия, сортировка
  if (Array.isArray(p.childs)) p.childs = [...p.childs].sort((a, b) => a - b);
  if (Array.isArray(p.regionIds)) p.regionIds = [...p.regionIds].sort((a, b) => a - b);
  if (Array.isArray(p.subregionIds)) p.subregionIds = [...p.subregionIds].sort((a, b) => a - b);
  if (Array.isArray(p.operatorIds)) p.operatorIds = [...p.operatorIds].sort((a, b) => a - b);
  return p;
}

/**
 * Сериализует нормализованные параметры в стабильную строку (отсортированные ключи).
 */
function paramsToCanonicalString(params: TourSearchParams, limit: number): string {
  const p = normalizeTourSearchParams(params);
  const parts: string[] = [];
  for (const k of PARAM_KEYS) {
    const v = (p as unknown as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) parts.push(`${k}=${v.join(',')}`);
    else parts.push(`${k}=${String(v)}`);
  }
  parts.push(`limit=${limit}`);
  return parts.join('|');
}

/**
 * Простой детерминированный хэш для короткого ключа (Firestore doc ID).
 * Одинаковые строки → одинаковый хэш на клиенте и Worker.
 */
export function stableHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return 's' + Math.abs(h).toString(36);
}

/**
 * Генерирует стабильный ключ кэша по параметрам поиска.
 * Используется для AsyncStorage, Firestore и Cache API.
 * Формат: search_dep{dep}_cnt{cnt}_{hash} — для prefix-фильтрации по вылету/стране.
 */
export function getTourSearchCacheKey(params: TourSearchParams, limit: number = DEFAULT_LIMIT): string {
  if (!params) return 'no_params';
  const canonical = paramsToCanonicalString(params, limit);
  const shortKey = stableHash(canonical);
  return `search_dep${params.departureId}_cnt${params.countryId}_${shortKey}`;
}

/**
 * Полный канонический ключ (для AsyncStorage, когда нужна уникальность без коллизий).
 */
export function getTourSearchCacheKeyFull(params: TourSearchParams, limit: number = DEFAULT_LIMIT): string {
  if (!params) return 'no_params';
  const canonical = paramsToCanonicalString(params, limit);
  return `search_params_${canonical.replace(/\|/g, '_').replace(/=/g, '')}`;
}

/**
 * Фильтрует туры из кэша (например ALL_TOURS) по параметрам поиска.
 */
export function filterToursByParamsFromCache(
  tours: TourHotel[],
  params: TourSearchParams
): TourHotel[] {
  return tours.filter(hotel => {
    if (hotel.country.id !== params.countryId) return false;
    if (params.regionIds && params.regionIds.length > 0) {
      if (!params.regionIds.includes(hotel.region.id)) return false;
    }
    if (params.subregionIds && params.subregionIds.length > 0 && hotel.subRegion) {
      if (!params.subregionIds.includes(hotel.subRegion.id)) return false;
    }
    const matchingTours = hotel.tours.filter(tour => {
      const tourDate = new Date(tour.date);
      const dateFrom = new Date(params.dateFrom);
      const dateTo = new Date(params.dateTo);
      if (tourDate < dateFrom || tourDate > dateTo) return false;
      if (tour.nights < params.nightsFrom || tour.nights > params.nightsTo) return false;
      if (tour.adults !== params.adults) return false;
      if (params.childs && params.childs.length > 0) {
        if (tour.childs !== params.childs.length) return false;
      } else if (tour.childs > 0) return false;
      if (params.meal && tour.meal.id < params.meal) return false;
      if (params.hotelCategory && hotel.category < params.hotelCategory) return false;
      if (params.hotelRating && hotel.rating < params.hotelRating) return false;
      if (params.priceFrom && tour.price < params.priceFrom) return false;
      if (params.priceTo && tour.price > params.priceTo) return false;
      if (params.operatorIds && params.operatorIds.length > 0) {
        if (!params.operatorIds.includes(tour.operator.id)) return false;
      }
      if (params.onlyCharter && !tour.isCharter) return false;
      return true;
    });
    return matchingTours.length > 0;
  }).map(hotel => {
    const filteredTours = hotel.tours.filter(tour => {
      const tourDate = new Date(tour.date);
      const dateFrom = new Date(params.dateFrom);
      const dateTo = new Date(params.dateTo);
      if (tourDate < dateFrom || tourDate > dateTo) return false;
      if (tour.nights < params.nightsFrom || tour.nights > params.nightsTo) return false;
      if (tour.adults !== params.adults) return false;
      if (params.childs && params.childs.length > 0) {
        if (tour.childs !== params.childs.length) return false;
      } else if (tour.childs > 0) return false;
      if (params.meal && tour.meal.id < params.meal) return false;
      if (params.priceFrom && tour.price < params.priceFrom) return false;
      if (params.priceTo && tour.price > params.priceTo) return false;
      if (params.operatorIds && params.operatorIds.length > 0) {
        if (!params.operatorIds.includes(tour.operator.id)) return false;
      }
      if (params.onlyCharter && !tour.isCharter) return false;
      return true;
    });
    return { ...hotel, tours: filteredTours };
  });
}

/**
 * Ослабленный фильтр для fallback при 429: страна + взрослые.
 */
export function filterToursByParamsFromCacheRelaxed(
  tours: TourHotel[],
  params: { countryId: number; adults?: number }
): TourHotel[] {
  return tours.filter(hotel => {
    if (hotel.country.id !== params.countryId) return false;
    const matchingTours = hotel.tours.filter(tour => {
      if (params.adults != null && tour.adults !== params.adults) return false;
      return true;
    });
    return matchingTours.length > 0;
  }).map(hotel => {
    const filteredTours = hotel.tours.filter(tour => {
      if (params.adults != null && tour.adults !== params.adults) return false;
      return true;
    });
    return { ...hotel, tours: filteredTours };
  });
}

/**
 * Валидация и очистка результатов из кэша (защита от битых данных и зависания FlatList).
 */
export function sanitizeTourHotelsFromCache(raw: unknown): TourHotel[] {
  if (!Array.isArray(raw)) return [];
  const result: TourHotel[] = [];
  for (const h of raw) {
    if (!h || typeof h !== 'object') continue;
    const hotel = h as TourHotel;
    if (typeof hotel.id !== 'number' || !hotel.name || !hotel.region?.name) continue;
    if (!Array.isArray(hotel.tours)) continue;
    const tours = hotel.tours.filter((t) => {
      if (!t) return false;
      const hasTourId =
        typeof t.id === 'number' ||
        (typeof t.id === 'string' && t.id.trim().length > 0);
      if (!hasTourId) return false;
      if (!t.operator?.name || !t.meal?.name) return false;
      if (typeof t.price !== 'number' || !t.date) return false;
      return true;
    });
    if (tours.length === 0) continue;
    result.push({ ...hotel, tours });
  }
  return result;
}

/** Интервал опроса статуса поиска (мс) */
export const TOUR_SEARCH_POLL_INTERVAL_MS = 3000;

/** Увеличенный интервал на мобильной сети — меньше round-trip на LTE */
export const TOUR_SEARCH_POLL_INTERVAL_CELLULAR_MS = 6000;

/** Интервал polling с учётом типа сети */
export async function getTourSearchPollIntervalMs(): Promise<number> {
  try {
    const state = await NetInfo.fetch();
    if (state.type === 'cellular') return TOUR_SEARCH_POLL_INTERVAL_CELLULAR_MS;
  } catch {
    /* ignore */
  }
  return TOUR_SEARCH_POLL_INTERVAL_MS;
}

/** Максимальное ожидание завершения поиска на Tourvisor (мс) — важно для медленного LTE */
export const TOUR_SEARCH_MAX_WAIT_MS = 120_000;

/** Tourvisor отдаёт status: "complete" или "completed" */
export function isTourSearchStatusFinished(status?: string, progress?: number): boolean {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'complete' || (progress ?? 0) >= 100;
}

export function isTourSearchStatusError(status?: string): boolean {
  return (status || '').toLowerCase() === 'error';
}

export function isTransientTourvisorError(error: unknown): boolean {
  const message = String((error as Error)?.message || '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('превысил время') ||
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('не удалось связаться') ||
    message.includes('server unavailable')
  );
}
