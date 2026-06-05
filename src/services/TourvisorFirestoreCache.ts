/**
 * Общий кэш результатов поиска Tourvisor в Firestore.
 * СВЕЖЕСТЬ > СКОРОСТЬ: TTL 14 дней. Устаревшие данные не отдаём.
 * Коллекция: searchCache. Структура: data, expiresAt, createdAt, lastUpdated (ISO).
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { TourHotel, TourSearchParams } from '../types/tourvisor';
import { getTourSearchCacheKey } from '../utils/tourSearchCache';
import { logger } from '../utils/logger';
import type { CacheEntry } from './FreshCacheService';

const CACHE_COLLECTION = 'searchCache';
export const SEARCH_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 дней

function isFirestoreAvailable(): boolean {
  return !!db;
}

function getExpiresAt(data: Record<string, unknown>): number {
  const raw = data?.expiresAt;
  return typeof raw === 'number' ? raw : (raw as { toMillis?: () => number })?.toMillis?.() ?? 0;
}

function parseResults(data: Record<string, unknown>): TourHotel[] | null {
  let results = data?.data ?? data?.results;
  if (typeof results === 'string') {
    try {
      results = JSON.parse(results) as TourHotel[];
    } catch {
      return null;
    }
  }
  if (!Array.isArray(results) || results.length === 0) return null;
  return results as TourHotel[];
}

/**
 * Получить результаты из общего кэша Firestore (удобная обёртка без метаданных).
 * Возвращает данные только если запись есть и не просрочена.
 */
export async function getFromSharedCache(
  params: TourSearchParams,
  limit: number = 25
): Promise<TourHotel[] | null> {
  const entry = await getFromSharedCacheWithMeta(params, limit);
  return entry?.data ?? null;
}

/**
 * Получить запись кэша с метаданными (для FreshCacheService).
 * Только полное совпадение параметров (ключ cacheKey). TTL 14 дней — устаревшие не отдаём.
 */
export async function getFromSharedCacheWithMeta(
  params: TourSearchParams,
  limit: number = 25
): Promise<CacheEntry<TourHotel[]> | null> {
  if (!isFirestoreAvailable()) return null;
  const now = Date.now();
  try {
    const cacheKey = getTourSearchCacheKey(params, limit);
    const ref = doc(db, CACHE_COLLECTION, cacheKey);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      const exp = getExpiresAt(data);
      if (exp > 0 && now <= exp) {
        const results = parseResults(data);
        if (results?.length) {
          const lastUpdated = new Date(exp - SEARCH_CACHE_TTL_MS).toISOString();
          return { data: results, metadata: { lastUpdated } };
        }
      }
    }
  } catch (e) {
    logger.warn('[TourvisorFirestoreCache] getWithMeta error:', (e as Error)?.message);
  }
  return null;
}

/**
 * Сохранить результаты в Firestore. TTL 14 дней.
 */
export async function setToSharedCache(
  params: TourSearchParams,
  results: TourHotel[],
  limit: number = 25
): Promise<void> {
  if (!isFirestoreAvailable() || !results?.length) return;
  try {
    const cacheKey = getTourSearchCacheKey(params, limit);
    const ref = doc(db, CACHE_COLLECTION, cacheKey);
    const now = Date.now();
    await setDoc(ref, {
      data: results.slice(0, 200),
      expiresAt: now + SEARCH_CACHE_TTL_MS,
      createdAt: now,
      lastUpdated: new Date(now).toISOString(),
      hits: 0,
      public: true,
      departureId: Number(params.departureId),
      countryId: Number(params.countryId),
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
    });
    logger.debug(`[TourvisorFirestoreCache] saved ${results.length} tours`);
  } catch (e) {
    logger.debug('[TourvisorFirestoreCache] set error:', (e as Error)?.message);
  }
}
