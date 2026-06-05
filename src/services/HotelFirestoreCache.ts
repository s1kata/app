/**
 * Общий кэш результатов поиска отелей в Firestore.
 * СВЕЖЕСТЬ > СКОРОСТЬ: TTL 14 дней (как у туров). Коллекция: hotelSearchCache.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { HotelCompact, HotelSearchParams } from '../types/tourvisor';
import { getHotelSearchCacheKey } from '../utils/hotelSearchCache';
import { logger } from '../utils/logger';
import type { CacheEntry } from './FreshCacheService';

const CACHE_COLLECTION = 'hotelSearchCache';
export const HOTEL_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 дней

function isFirestoreAvailable(): boolean {
  return !!db;
}

function getExpiresAt(data: Record<string, unknown>): number {
  const raw = data?.expiresAt;
  return typeof raw === 'number' ? raw : (raw as { toMillis?: () => number })?.toMillis?.() ?? 0;
}

function parseResults(data: Record<string, unknown>): HotelCompact[] | null {
  let results = data?.data ?? data?.results;
  if (typeof results === 'string') {
    try {
      results = JSON.parse(results) as HotelCompact[];
    } catch {
      return null;
    }
  }
  if (!Array.isArray(results) || results.length === 0) return null;
  return results as HotelCompact[];
}

/**
 * Получить результаты из кэша (обёртка без метаданных).
 */
export async function getHotelSearchFromFirestore(
  params: HotelSearchParams
): Promise<HotelCompact[] | null> {
  const entry = await getHotelSearchFromFirestoreWithMeta(params);
  return entry?.data ?? null;
}

/**
 * Получить запись с метаданными для FreshCacheService.
 */
export async function getHotelSearchFromFirestoreWithMeta(
  params: HotelSearchParams
): Promise<CacheEntry<HotelCompact[]> | null> {
  if (!isFirestoreAvailable()) return null;
  const now = Date.now();
  try {
    const cacheKey = getHotelSearchCacheKey(params);
    const ref = doc(db, CACHE_COLLECTION, cacheKey);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const exp = getExpiresAt(data);
    if (exp <= 0 || now > exp) return null;
    const results = parseResults(data);
    if (!results?.length) return null;
    const lastUpdated = new Date(exp - HOTEL_CACHE_TTL_MS).toISOString();
    return { data: results, metadata: { lastUpdated } };
  } catch (e) {
    logger.debug('[HotelFirestoreCache] getWithMeta error:', (e as Error)?.message);
    return null;
  }
}

/**
 * Сохранить результаты в Firestore. TTL 14 дней.
 */
export async function setHotelSearchToFirestore(
  params: HotelSearchParams,
  results: HotelCompact[]
): Promise<void> {
  if (!isFirestoreAvailable() || !results?.length) return;
  try {
    const cacheKey = getHotelSearchCacheKey(params);
    const ref = doc(db, CACHE_COLLECTION, cacheKey);
    const now = Date.now();
    await setDoc(ref, {
      data: results.slice(0, 500),
      expiresAt: now + HOTEL_CACHE_TTL_MS,
      createdAt: now,
      lastUpdated: new Date(now).toISOString(),
      hits: 0,
      public: true,
    });
    logger.debug(`[HotelFirestoreCache] saved ${results.length} hotels`);
  } catch (e) {
    logger.debug('[HotelFirestoreCache] set error:', (e as Error)?.message);
  }
}
