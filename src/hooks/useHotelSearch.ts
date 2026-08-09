/**
 * Поиск отелей: server-first через /api/hotels/search, локальный кэш как fallback.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HotelSearchParams, HotelCompact, PaginatedResponse } from '../types/tourvisor';
import { getHotelSearchCacheKey, getHotelSearchCacheKeyAll } from '../utils/hotelSearchCache';
import { normalizeHotelImages } from '../utils/hotelImages';
import { tourvisorApi } from '../services/TourvisorApiService';
import { freshCacheService } from '../services/FreshCacheService';
import { cacheService, CacheType } from '../services/CacheService';
import { networkService } from '../services/NetworkService';
import { searchHotelsViaBackend } from '../services/sync/NextPatchBackendClient';
import { logger } from '../utils/logger';

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

function normalizeList(raw: HotelCompact[]): HotelCompact[] {
  return raw.map((h) => normalizeHotelImages({ ...h }) as HotelCompact);
}

/** Server-first page: PaginatedResponse (для экранов с пагинацией). */
export async function getHotelsPage(
  params: HotelSearchParams,
): Promise<PaginatedResponse<HotelCompact>> {
  if (networkService.getPolicyState().isBlocked) {
    throw new Error('Отключите VPN/блокировщик и повторите поиск отелей.');
  }

  const limit = params.limit || DEFAULT_PAGE_LIMIT;
  const page = params.page || 1;

  try {
    const remote = await searchHotelsViaBackend({
      ...params,
      allPages: false,
      enrich: true,
      limit,
      page,
    });
    if (remote.success && remote.data?.hotels) {
      const hotels = normalizeList(remote.data.hotels);
      return {
        data: hotels,
        total: remote.data.total ?? hotels.length,
        page: remote.data.page ?? page,
        limit: remote.data.limit ?? limit,
        totalPages: remote.data.totalPages ?? 1,
      };
    }
    logger.debug('[useHotelSearch] backend page miss:', remote.error);
  } catch (e) {
    logger.debug('[useHotelSearch] backend page error:', (e as Error)?.message);
  }

  // Legacy fallback через tourvisor-mobile proxy (пока сервер не задеплоен)
  const response = await tourvisorApi.getHotels(params);
  return {
    ...response,
    data: normalizeList(response?.data ?? []),
  };
}

/** Server-first hotel page fetch. */
async function fetchHotelSearch(params: HotelSearchParams): Promise<HotelCompact[]> {
  const response = await getHotelsPage(params);
  return response.data ?? [];
}

/** Server-first: все страницы одним запросом на бэкенде. */
async function fetchHotelSearchAll(params: HotelSearchParams): Promise<HotelCompact[]> {
  if (networkService.getPolicyState().isBlocked) {
    throw new Error('Отключите VPN/блокировщик и повторите поиск отелей.');
  }

  try {
    const remote = await searchHotelsViaBackend({
      ...params,
      allPages: true,
      enrich: true,
      limit: params.limit || DEFAULT_PAGE_LIMIT,
      page: 1,
    });
    if (remote.success && remote.data?.hotels) {
      if (__DEV__) {
        const chunk = remote.data.hotels;
        const withImg = chunk.filter((h: any) => h.picturelink || (h.images?.length > 0)).length;
        logger.debug(
          `[useHotelSearch] backend allPages=${chunk.length} withImage=${withImg} total=${remote.data.total}`,
        );
      }
      return normalizeList(remote.data.hotels);
    }
    logger.debug('[useHotelSearch] backend allPages miss:', remote.error);
  } catch (e) {
    logger.debug('[useHotelSearch] backend allPages error:', (e as Error)?.message);
  }

  // Fallback: клиентская пагинация через proxy (если сервер ещё не задеплоен)
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
  const maxPages = 50;

  for (let i = 0; i < maxPages; i++) {
    const response = await tourvisorApi.getHotels({
      ...baseParams,
      page,
      limit,
    });
    const raw = response?.data ?? [];
    const chunk = normalizeList(raw);
    all.push(...chunk);
    if (chunk.length < limit) break;
    const totalPages = response?.totalPages ?? 0;
    if (totalPages > 0 && page >= totalPages) break;
    page += 1;
  }

  return all;
}

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
