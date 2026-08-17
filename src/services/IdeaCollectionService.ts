/**
 * Подборки «Идеи для путешествий»: кэш + фоновый прогрев.
 * UI открывает ApiTourResults, не мастер поиска.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import type { TourSearchParams } from '../types/tourvisor';
import type { TravelIdea } from '../config/travelIdeas';
import { getTravelIdeas } from '../config/travelIdeas';
import { dictionaryService } from './DictionaryService';
import { searchTours, saveTourSearchToAllCaches } from '../hooks/useTourSearch';
import { TOUR_SEARCH_LIMIT } from '../utils/tourSearchCache';
import { logger } from '../utils/logger';

const DEPARTURE_PREF_KEY = 'user_preferred_departure_id';

export async function resolvePreferredDepartureId(): Promise<number> {
  try {
    const deps = await dictionaryService.getDepartures();
    if (!deps.length) return 1;
    const saved = await AsyncStorage.getItem(DEPARTURE_PREF_KEY);
    if (saved && deps.some((d) => String(d.id) === saved)) {
      return Number(saved);
    }
    const moscow = deps.find((d) => d.id === 1 || d.name.toLowerCase().includes('москва'));
    return moscow?.id ?? deps[0].id;
  } catch {
    return 1;
  }
}

export async function savePreferredDepartureId(id: number): Promise<void> {
  try {
    await AsyncStorage.setItem(DEPARTURE_PREF_KEY, String(id));
  } catch {
    /* ignore */
  }
}

/** Полные параметры поиска под идею (для Results / кэша). */
export function buildIdeaSearchParams(
  idea: TravelIdea,
  departureId: number,
  currency = 'RUB',
): TourSearchParams {
  const p = idea.searchPrefill;
  return {
    departureId,
    countryId: p.countryId,
    dateFrom: String(p.dateFrom || ''),
    dateTo: String(p.dateTo || ''),
    nightsFrom: Number(p.nightsFrom) || 7,
    nightsTo: Number(p.nightsTo) || 11,
    adults: Math.max(1, Number(p.adults) || 2),
    childs: Array.isArray(p.childs) ? p.childs : [],
    hotelCategory: p.hotelCategory,
    priceFrom: p.priceFrom,
    priceTo: p.priceTo,
    meal: p.meal,
    currency,
    onlyCharter: p.onlyCharter ?? false,
  };
}

let prefetchStarted = false;

/** Прогрев 1–2 популярных подборок после Home (не блокирует UI). */
export async function prefetchPopularIdeaCollections(currency = 'RUB'): Promise<void> {
  if (prefetchStarted) return;
  prefetchStarted = true;
  try {
    const departureId = await resolvePreferredDepartureId();
    const ideas = getTravelIdeas().slice(0, 2);
    for (const idea of ideas) {
      const params = buildIdeaSearchParams(idea, departureId, currency);
      if (!params.dateFrom || !params.dateTo) continue;
      try {
        const list = await searchTours(params, TOUR_SEARCH_LIMIT, false);
        if (list.length) {
          await saveTourSearchToAllCaches(params, list, TOUR_SEARCH_LIMIT);
          const urls = list
            .map((h) => h.picturelink)
            .filter((u): u is string => !!u)
            .slice(0, 8);
          if (urls.length) void Image.prefetch(urls);
        }
      } catch (e) {
        logger.debug('[IdeaCollection] prefetch', idea.id, (e as Error)?.message);
      }
    }
  } catch (e) {
    logger.debug('[IdeaCollection] prefetch start', (e as Error)?.message);
  }
}
