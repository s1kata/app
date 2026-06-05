/**
 * Хук поиска туров с приоритетом свежести: СВЕЖЕСТЬ > СКОРОСТЬ.
 * Цепочка: AsyncStorage (<14 дней) → Firestore (<14 дней) → API (пользователь ждёт).
 * Устаревшие данные не показываем — только свежие из кэша или из API.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Alert } from 'react-native';
import { TourSearchParams, TourHotel } from '../types/tourvisor';
import { getTourSearchCacheKey, normalizeTourSearchParams, TOUR_SEARCH_LIMIT } from '../utils/tourSearchCache';
import type { CacheEntry } from '../services/FreshCacheService';
import {
  getFromSharedCacheWithMeta,
  setToSharedCache,
} from '../services/TourvisorFirestoreCache';
import { tourvisorApi } from '../services/TourvisorApiService';
import { freshCacheService } from '../services/FreshCacheService';
import { logger } from '../utils/logger';
import { cacheService, CacheType } from '../services/CacheService';

const FRESH_CACHE_ASYNC_PREFIX = 'fresh_cache_';

function isNetworkOrServerError(error: unknown): boolean {
  const message = String((error as Error)?.message || '').toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('server unavailable') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('не удалось связаться') ||
    /http 5\d\d/.test(message)
  );
}

function showToursLoadErrorAlertOnce() {
  Alert.alert('Ошибка загрузки туров', 'Проверьте интернет-соединение и попробуйте снова.');
}

async function saveTourSearchToAsyncStorage(cacheKey: string, results: TourHotel[]): Promise<void> {
  try {
    const entry = {
      data: results,
      metadata: { lastUpdated: new Date().toISOString() },
    };
    await AsyncStorage.setItem(FRESH_CACHE_ASYNC_PREFIX + cacheKey, JSON.stringify(entry));
  } catch (e) {
    logger.warn('[useTourSearch] AsyncStorage save failed:', (e as Error)?.message || e);
  }
}

/**
 * Сохранить результаты во все кэши (AsyncStorage в формате FreshCache, CacheService, Firestore).
 */
export async function saveTourSearchToAllCaches(
  params: TourSearchParams,
  results: TourHotel[],
  limit: number = TOUR_SEARCH_LIMIT
): Promise<void> {
  if (!results?.length) return;
  const cacheKey = getTourSearchCacheKey(params, limit);
  try {
    await saveTourSearchToAsyncStorage(cacheKey, results);
    await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, results);
    await setToSharedCache(params, results, limit);
  } catch (e) {
    if (__DEV__) console.warn('[saveTourSearchToAllCaches]', (e as Error)?.message);
  }
}

/**
 * Сохранить только в локальные кэши (AsyncStorage, CacheService).
 */
export async function saveTourSearchToLocalCaches(
  params: TourSearchParams,
  results: TourHotel[],
  limit: number = TOUR_SEARCH_LIMIT
): Promise<void> {
  if (!results?.length) return;
  const cacheKey = getTourSearchCacheKey(params, limit);
  try {
    await saveTourSearchToAsyncStorage(cacheKey, results);
    await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, results);
  } catch (e) {
    logger.warn('[useTourSearch] AsyncStorage save failed:', (e as Error)?.message || e);
  }
}

async function fetchTourSearch(params: TourSearchParams, limit: number): Promise<TourHotel[]> {
  const workerUrl = (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.tourvisorWorkerUrl as string | undefined;
  const tourvisorUrl = tourvisorApi.getBaseUrl();
  const token = tourvisorApi.getJwtToken();
  const normalized = normalizeTourSearchParams(params);
  const baseIsTourvisorMobileProxy = /\/api\/tourvisor-mobile\b/i.test(tourvisorUrl);
  const isApiPassthroughWorker =
    (typeof workerUrl === 'string' && /tourvisor-mobile/i.test(workerUrl)) || baseIsTourvisorMobileProxy;

  // Принудительный лог для preview/release, чтобы видеть старт поиска в Logcat/Xcode.
  console.error('[FORCE_LOG] !!! SEARCH START:', {
    url: workerUrl || tourvisorUrl,
    token: !!token,
    hasParams: !!params,
    viaTourvisorApi: baseIsTourvisorMobileProxy || !workerUrl || isApiPassthroughWorker,
  });

  logger.debug('[useTourSearch] start fetchTourSearch', {
    workerEnabled: !!workerUrl,
    baseUrl: tourvisorApi.getBaseUrl(),
    hasToken: !!tourvisorApi.getJwtToken(),
    params: normalized,
    limit,
  });

  // Кастомный worker — только если база НЕ tourvisor-mobile (словари и поиск на одном хосте).
  if (
    workerUrl &&
    /^https?:\/\//i.test(workerUrl) &&
    !isApiPassthroughWorker &&
    !baseIsTourvisorMobileProxy
  ) {
    try {
      const entries: [string, string][] = [];
      Object.entries(normalized).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          if (Array.isArray(v)) entries.push([k, v.map(String).join(',')]);
          else entries.push([k, String(v)]);
        }
      });
      entries.push(['limit', String(limit)]);
      entries.sort(([a], [b]) => a.localeCompare(b));
      const searchParams = new URLSearchParams(entries);
      const endpoint = `${workerUrl.replace(/\/+$/, '')}/tours/search?${searchParams.toString()}`;
      logger.debug('[useTourSearch] worker request', { endpoint, params: normalized, limit });
      console.error('[FORCE_LOG] worker request dispatch', { endpoint, limit });
      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Worker ${res.status}: ${res.statusText}`);
      const json = await res.json();
      const data = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.results)
            ? json.results
            : null;
      if (!Array.isArray(data)) {
        throw new Error('Invalid worker response');
      }
      logger.debug('[useTourSearch] worker response', { count: data.length });
      console.error('[FORCE_LOG] worker response ok', { count: data.length });
      return data;
    } catch (e) {
      console.error('[FORCE_LOG] worker request failed', {
        error: (e as Error)?.message || String(e),
      });
      throw new Error(`Worker search failed: ${(e as Error)?.message || String(e)}`);
    }
  } else if (workerUrl && !isApiPassthroughWorker) {
    console.error('[FORCE_LOG] worker url invalid', { workerUrl });
    throw new Error('TOURVISOR_WORKER_URL is invalid');
  }

  if (tourvisorApi.isRateLimited()) {
    console.error('[FORCE_LOG] search blocked by rate limit cooldown');
    throw new Error('Rate limit. Попробуйте позже.');
  }
  const passthroughSearch = /\/api\/tourvisor-mobile\b/i.test(tourvisorUrl);
  if (!passthroughSearch && !tourvisorApi.getJwtToken()) {
    console.error('[FORCE_LOG] direct Tourvisor request without token');
    logger.warn('[useTourSearch] JWT token missing before direct Tourvisor request');
  }

  logger.debug('[useTourSearch] direct Tourvisor startTourSearch request', { params: normalized, limit });
  console.error('[FORCE_LOG] direct Tourvisor startTourSearch dispatch', { tourvisorUrl, limit });
  const { searchId } = await tourvisorApi.startTourSearch(params);
  logger.debug('[useTourSearch] direct Tourvisor searchId received', { searchId });
  console.error('[FORCE_LOG] direct Tourvisor searchId', { searchId });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await tourvisorApi.getTourSearchStatus(searchId, true);
    const statusLower = (st.status || '').toLowerCase();
    if (statusLower === 'completed' || (st.progress ?? 0) >= 100) break;
    if (statusLower === 'error') throw new Error('Search error');
  }
  const results = await tourvisorApi.getTourSearchResults(searchId, limit);
  logger.debug('[useTourSearch] direct Tourvisor results received', { searchId, count: results.length });
  console.error('[FORCE_LOG] direct Tourvisor results received', { searchId, count: results.length });
  return results;
}

/**
 * Поиск с кэшем по свежести: AsyncStorage → Firestore → API. TTL 14 дней.
 */
export async function searchTours(
  params: TourSearchParams,
  limit: number = TOUR_SEARCH_LIMIT,
  bypassCache: boolean = false
): Promise<TourHotel[]> {
  const cacheKey = getTourSearchCacheKey(params, limit);

  if (bypassCache) {
    try {
      const results = await fetchTourSearch(params, limit);
      if (results.length > 0) await saveTourSearchToAllCaches(params, results, limit);
      return results;
    } catch (error) {
      if (isNetworkOrServerError(error)) {
        showToursLoadErrorAlertOnce();
      }
      throw error;
    }
  }

  const firestoreAdapter: {
    get: () => Promise<CacheEntry<TourHotel[]> | null>;
    set: (entry: CacheEntry<TourHotel[]>) => Promise<void>;
  } = {
    get: () => getFromSharedCacheWithMeta(params, limit),
    set: (entry) => setToSharedCache(params, entry.data, limit),
  };
  try {
    const results = await freshCacheService.getData(
      cacheKey,
      () => fetchTourSearch(params, limit),
      firestoreAdapter
    );
    if (results?.length) {
      try {
        await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, results);
      } catch (e) {
        logger.warn('[useTourSearch] cacheService.set failed:', (e as Error)?.message || e);
      }
    }
    return results ?? [];
  } catch (error) {
    if (isNetworkOrServerError(error)) {
      showToursLoadErrorAlertOnce();
    }
    throw error;
  }
}

export function useTourSearch(params: TourSearchParams | null, limit: number = 25) {
  const queryClient = useQueryClient();
  const cacheKey = params ? getTourSearchCacheKey(params, limit) : null;

  const query = useQuery({
    queryKey: ['tourSearch', cacheKey],
    queryFn: () => searchTours(params!, limit),
    enabled: !!params && !!cacheKey,
    staleTime: 0,
    gcTime: 14 * 24 * 60 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const invalidate = () => {
    if (cacheKey) queryClient.invalidateQueries({ queryKey: ['tourSearch', cacheKey] });
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
