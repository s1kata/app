/**
 * Кэш с приоритетом свежести: СВЕЖЕСТЬ > СКОРОСТЬ.
 * TTL 14 дней. Если данные устарели — пользователь ждёт запрос к API и получает только свежие данные.
 * Нет фонового обновления после показа устаревшего.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ASYNC_PREFIX = 'fresh_cache_';
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 дней

export interface CacheEntry<T> {
  data: T;
  metadata: {
    lastUpdated: string; // ISO
  };
}

export interface FirestoreAdapter<T> {
  get: () => Promise<CacheEntry<T> | null>;
  set: (entry: CacheEntry<T>) => Promise<void>;
}

function isFresh(lastUpdated: string): boolean {
  const age = Date.now() - new Date(lastUpdated).getTime();
  return age < TTL_MS;
}

export class FreshCacheService {
  private readonly ttlMs: number;

  constructor(ttlDays: number = 14) {
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  }

  private async getFromAsyncStorage<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const raw = await AsyncStorage.getItem(ASYNC_PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (!entry?.metadata?.lastUpdated) return null;
      return entry;
    } catch {
      return null;
    }
  }

  private async saveToAsyncStorage<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      await AsyncStorage.setItem(ASYNC_PREFIX + key, JSON.stringify(entry));
    } catch {
      /* ignore */
    }
  }

  /**
   * Получить данные: AsyncStorage (если свежие) → API (пользователь ждёт).
   * Firestore не используется. Устаревшие данные не отдаём — только свежие из кэша или из API.
   */
  async getData<T>(
    key: string,
    apiFetcher: () => Promise<T>,
    firestoreAdapter: FirestoreAdapter<T> | null
  ): Promise<T> {
    const lastUpdated = new Date().toISOString();

    // 1. AsyncStorage (только данные, ранее полученные из API)
    const asyncEntry = await this.getFromAsyncStorage<T>(key);
    if (asyncEntry && isFresh(asyncEntry.metadata.lastUpdated)) {
      return asyncEntry.data;
    }

    // 2. Firestore не используется — только свежие данные из API или локального кэша

    // 3. API — пользователь ждёт, получает только свежее
    if (__DEV__) console.log(`[FreshCache] ${key}: запрос к API`);
    const data = await apiFetcher();
    const entry: CacheEntry<T> = {
      data,
      metadata: { lastUpdated },
    };
    await this.saveToAsyncStorage(key, entry);
    if (firestoreAdapter) {
      try {
        await firestoreAdapter.set(entry);
      } catch (e) {
        if (__DEV__) console.warn('[FreshCache] saveToFirestore error:', (e as Error)?.message);
      }
    }
    return data;
  }
}

export const FRESH_CACHE_TTL_DAYS = 14;
export const freshCacheService = new FreshCacheService(FRESH_CACHE_TTL_DAYS);
