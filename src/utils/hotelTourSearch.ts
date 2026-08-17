/**
 * Поиск туров по конкретному отелю (цены есть только в /tours/search).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dictionaryService } from '../services/DictionaryService';
import type { HotelCompact, TourSearchParams } from '../types/tourvisor';
import { logger } from './logger';

const DEPARTURE_PREF_KEY = 'user_preferred_departure_id';

export async function resolvePreferredDepartureId(
  preferred?: number | null,
): Promise<number> {
  const fromCtx = Number(preferred) || 0;
  if (fromCtx > 0) return fromCtx;
  try {
    const saved = await AsyncStorage.getItem(DEPARTURE_PREF_KEY);
    if (saved && Number(saved) > 0) return Number(saved);
  } catch {
    /* ignore */
  }
  try {
    const deps = await dictionaryService.getDepartures();
    const moscow = deps.find((d) => d.id === 1 || d.name.toLowerCase().includes('москва'));
    if (moscow?.id) return moscow.id;
    if (deps[0]?.id) return deps[0].id;
  } catch (e) {
    logger.debug('[hotelTourSearch] departures:', (e as Error)?.message);
  }
  return 1;
}

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Параметры поиска туров только по отелю (без лишних фильтров категории/региона).
 * Клиентский флаг skipOperatorFilter — не уходит в Tourvisor.
 */
export async function buildTourSearchParamsForHotel(
  hotel: {
    id: number;
    country?: { id: number } | null;
    category?: number | null;
    region?: { id: number } | null;
  },
  tourContext: Partial<TourSearchParams> = {},
): Promise<TourSearchParams | null> {
  const countryId = Number(hotel.country?.id) || 0;
  const hotelId = Number(hotel.id) || 0;
  if (!hotelId || !countryId) return null;

  const departureId = await resolvePreferredDepartureId(
    tourContext.departureId ? Number(tourContext.departureId) : null,
  );

  return {
    departureId,
    countryId,
    dateFrom: tourContext.dateFrom || isoPlusDays(7),
    dateTo: tourContext.dateTo || isoPlusDays(21),
    nightsFrom: tourContext.nightsFrom || 6,
    nightsTo: tourContext.nightsTo || 14,
    adults: tourContext.adults || 2,
    childs: Array.isArray(tourContext.childs) ? tourContext.childs : [],
    hotelIds: [hotelId],
    currency: tourContext.currency || 'RUB',
    onlyCharter: false,
    skipOperatorFilter: true,
  };
}

export function hotelListPrice(hotel: {
  price?: number;
  priceFrom?: number;
}): number {
  const n = Number(hotel.price ?? hotel.priceFrom ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
