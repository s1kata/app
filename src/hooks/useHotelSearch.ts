/**
 * Хук поиска отелей: только свежие данные — AsyncStorage (если свежие) или API. Firestore не используется.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HotelSearchParams, HotelCompact } from '../types/tourvisor';
import { getHotelSearchCacheKey, getHotelSearchCacheKeyAll } from '../utils/hotelSearchCache';
import { normalizeHotelImages } from '../utils/hotelImages';
import { tourvisorApi } from '../services/TourvisorApiService';
import { freshCacheService } from '../services/FreshCacheService';
import { cacheService, CacheType } from '../services/CacheService';

const FRESH_CACHE_ASYNC_PREFIX = 'fresh_cache_';

async function saveHotelSearchToAsyncStorage(
  cacheKey: string,
  results: HotelCompact[]
): Promise<void> {
  try {
    const entry = {
      data: results,
      metadata: { lastUpdated: new Date().toISOString() },
    };
    await AsyncStorage.setItem(FRESH_CACHE_ASYNC_PREFIX + cacheKey, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

/**
 * Сохранить результаты отелей в локальные кэши (AsyncStorage, CacheService). Без Firestore.
 */
export async function saveHotelSearchToAllCaches(
  params: HotelSearchParams,
  results: HotelCompact[]
): Promise<void> {
  if (!results?.length) return;
  const cacheKey = getHotelSearchCacheKey(params);
  try {
    await saveHotelSearchToAsyncStorage(cacheKey, results);
    await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, results);
  } catch (e) {
    if (__DEV__) console.warn('[saveHotelSearchToAllCaches]', (e as Error)?.message);
  }
}

/**
 * Сохранить только в локальные кэши (AsyncStorage, CacheService).
 */
export async function saveHotelSearchToLocalCaches(
  params: HotelSearchParams,
  results: HotelCompact[]
): Promise<void> {
  if (!results?.length) return;
  const cacheKey = getHotelSearchCacheKey(params);
  try {
    await saveHotelSearchToAsyncStorage(cacheKey, results);
    await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, results);
  } catch {
    /* ignore */
  }
}

const DEFAULT_PAGE_LIMIT = 100;

async function fetchHotelSearch(params: HotelSearchParams): Promise<HotelCompact[]> {
  const response = await tourvisorApi.getHotels(params);
  const raw = response?.data ?? [];
  return raw.map((h: any) => normalizeHotelImages({ ...h }) as HotelCompact);
}

/** Загружает все страницы отелей по параметрам и возвращает один общий массив */
async function fetchHotelSearchAll(params: HotelSearchParams): Promise<HotelCompact[]> {
  const baseParams = {
    countryId: params.countryId,
    regionId: params.regionId,
    category: params.category,
    rating: params.rating,
    types: params.types,
  };
  const all: HotelCompact[] = [];
  let page = 1;
  const limit = params.limit || DEFAULT_PAGE_LIMIT;
  const maxPages = 50; // защита от бесконечного цикла

  for (let i = 0; i < maxPages; i++) {
    const response = await tourvisorApi.getHotels({
      ...baseParams,
      page,
      limit,
    });
    const raw = response?.data ?? [];
    const chunk = raw.map((h: any) => normalizeHotelImages({ ...h }) as HotelCompact);
    all.push(...chunk);

    if (page === 1 && __DEV__ && chunk.length > 0) {
      const first = chunk[0] as any;
      const withImg = chunk.filter((h: any) => h.picturelink || (h.images?.length > 0)).length;
      const withPrice = chunk.filter((h: any) => h.price != null || h.priceFrom != null).length;
      const msg = [
        '[TravelHub HOTEL] После нормализации (первая страница)',
        `chunk=${chunk.length} withImage=${withImg} withPrice=${withPrice}`,
        `first: id=${first.id} name=${first.name} picturelink=${first.picturelink ?? '—'} imagesCount=${first.images?.length ?? 0} price=${first.price ?? '—'} priceFrom=${first.priceFrom ?? '—'} currency=${first.currency ?? '—'}`,
      ].join('\n');
      console.warn(msg);
    }

    if (chunk.length < limit) break;
    const totalPages = response?.totalPages ?? 0;
    if (totalPages > 0 && page >= totalPages) break;
    page += 1;
  }

  return all;
}

/**
 * Поиск отелей: только свежие данные — AsyncStorage (если свежие) или API. Firestore не используется.
 */
export async function searchHotels(
  params: HotelSearchParams,
  bypassCache: boolean = false
): Promise<HotelCompact[]> {
  const cacheKey = getHotelSearchCacheKey(params);

  if (bypassCache) {
    const results = await fetchHotelSearch(params);
    if (results.length > 0) await saveHotelSearchToAllCaches(params, results);
    return results;
  }

  const results = await freshCacheService.getData(
    cacheKey,
    () => fetchHotelSearch(params),
    null
  );
  if (results?.length) {
    try {
      await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, results);
    } catch {
      /* ignore */
    }
  }
  return results ?? [];
}

/**
 * Поиск отелей: загружаем все страницы и возвращаем полный список.
 * Кэш по ключу без page/limit (один список на набор фильтров).
 */
export async function searchHotelsAll(
  params: HotelSearchParams,
  bypassCache: boolean = false
): Promise<HotelCompact[]> {
  const cacheKey = getHotelSearchCacheKeyAll(params);

  if (bypassCache) {
    const results = await fetchHotelSearchAll(params);
    if (results.length > 0) {
      try {
        await saveHotelSearchToAsyncStorage(cacheKey, results);
        await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, results);
      } catch {
        /* ignore */
      }
    }
    return results;
  }

  const results = await freshCacheService.getData(
    cacheKey,
    () => fetchHotelSearchAll(params),
    null
  );
  if (results?.length) {
    try {
      await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, results);
    } catch {
      /* ignore */
    }
  }
  return results ?? [];
}

export function useHotelSearch(params: HotelSearchParams | null) {
  const queryClient = useQueryClient();
  const cacheKey = params ? getHotelSearchCacheKey(params) : null;

  const query = useQuery({
    queryKey: ['hotelSearch', cacheKey],
    queryFn: () => searchHotels(params!),
    enabled: !!params && !!cacheKey,
    staleTime: 0,
    gcTime: 14 * 24 * 60 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const invalidate = () => {
    if (cacheKey) queryClient.invalidateQueries({ queryKey: ['hotelSearch', cacheKey] });
  };

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
}
