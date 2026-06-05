/**
 * Сервис кэширования для продакшена.
 * On-demand кэш: данные сохраняются при запросах пользователей.
 * Firestore (TourvisorFirestoreCache) — общий кэш для туров, масштабируется на 10k+ пользователей.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export interface CacheMetadata {
  timestamp: number;
  expiry: number; // TTL в миллисекундах
  version?: string; // Версия данных (для инвалидации при обновлении приложения)
  lastUpdateAttempt?: number; // Последняя попытка обновления
  updateError?: string; // Ошибка последнего обновления
}

export interface CacheEntry<T> {
  data: T;
  metadata: CacheMetadata;
}

export enum CacheType {
  DICTIONARIES = 'dictionaries', // Справочники: TTL 30 дней (почти статичны)
  HOT_TOURS = 'hot_tours', // Горящие туры: TTL 2 часа
  FEATURED_HOTELS = 'featured_hotels', // Популярные отели: TTL 2 часа
  SEARCH_RESULTS = 'search_results', // Результаты поиска туров: TTL 14 дней (как Firestore)
  ALL_TOURS = 'all_tours', // Общий кэш всех туров: TTL 2 часа
  ALL_HOTELS = 'all_hotels', // Общий кэш всех отелей: TTL 2 часа
  TOUR_DETAILS = 'tour_details', // Детали тура: TTL 1 час
  HOTEL_DETAILS = 'hotel_details', // Детали отеля: TTL 1 час
}

// TTL для разных типов кэша (в миллисекундах)
const CACHE_TTL: Record<CacheType, number> = {
  [CacheType.DICTIONARIES]: 30 * 24 * 60 * 60 * 1000, // 30 дней — справочники почти статичны
  [CacheType.HOT_TOURS]: 2 * 60 * 60 * 1000, // 2 часа
  [CacheType.FEATURED_HOTELS]: 2 * 60 * 60 * 1000, // 2 часа
  [CacheType.SEARCH_RESULTS]: 14 * 24 * 60 * 60 * 1000, // 14 дней — показываем только если не устарели
  [CacheType.ALL_TOURS]: 24 * 60 * 60 * 1000, // 24 часа - общий кэш всех туров
  [CacheType.ALL_HOTELS]: 24 * 60 * 60 * 1000, // 24 часа - общий кэш всех отелей
  [CacheType.TOUR_DETAILS]: 60 * 60 * 1000, // 1 час
  [CacheType.HOTEL_DETAILS]: 60 * 60 * 1000, // 1 час
};

// Максимальный возраст устаревшего кэша для использования при ошибках (в миллисекундах)
const MAX_STALE_AGE: Record<CacheType, number> = {
  [CacheType.DICTIONARIES]: 90 * 24 * 60 * 60 * 1000, // 90 дней
  [CacheType.HOT_TOURS]: 24 * 60 * 60 * 1000, // 24 часа
  [CacheType.FEATURED_HOTELS]: 24 * 60 * 60 * 1000, // 24 часа
  [CacheType.SEARCH_RESULTS]: 14 * 24 * 60 * 60 * 1000, // 14 дней — устаревшие не показываем даже при 429
  [CacheType.ALL_TOURS]: 24 * 60 * 60 * 1000, // 24 часа - общий кэш всех туров
  [CacheType.ALL_HOTELS]: 24 * 60 * 60 * 1000, // 24 часа - общий кэш всех отелей
  [CacheType.TOUR_DETAILS]: 6 * 60 * 60 * 1000, // 6 часов
  [CacheType.HOTEL_DETAILS]: 6 * 60 * 60 * 1000, // 6 часов
};

class CacheService {
  private static instance: CacheService;
  private memoryCache = new Map<string, CacheEntry<any>>(); // Быстрый доступ к часто используемым данным
  private readonly MEMORY_CACHE_SIZE = 50; // Максимум 50 записей в памяти

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Получить ключ для кэша
   */
  private getCacheKey(type: CacheType, key: string): string {
    return `cache_${type}_${key}`;
  }

  /**
   * Получить данные из кэша
   * @param type Тип кэша
   * @param key Ключ данных
   * @param allowStale Разрешить использование устаревшего кэша при ошибках API
   */
  async get<T>(
    type: CacheType,
    key: string,
    allowStale: boolean = false
  ): Promise<T | null> {
    const cacheKey = this.getCacheKey(type, key);

    // Сначала проверяем память
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry) {
      const age = Date.now() - memoryEntry.metadata.timestamp;
      if (age < memoryEntry.metadata.expiry) {
        return memoryEntry.data as T;
      }
      // Кэш в памяти устарел, удаляем
      this.memoryCache.delete(cacheKey);
    }

    // Проверяем AsyncStorage
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (!stored) return null;

      const entry: CacheEntry<T> = JSON.parse(stored);
      const age = Date.now() - entry.metadata.timestamp;
      const maxAge = allowStale ? MAX_STALE_AGE[type] : entry.metadata.expiry;

      if (age < maxAge) {
        // Сохраняем в память для быстрого доступа
        if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
          const firstKey = this.memoryCache.keys().next().value as string | undefined;
          if (firstKey !== undefined) {
            this.memoryCache.delete(firstKey);
          }
        }
        this.memoryCache.set(cacheKey, entry);

        return entry.data;
      } else {
        // Кэш устарел, удаляем
        await AsyncStorage.removeItem(cacheKey);
        return null;
      }
    } catch (error) {
      logger.error(`Failed to get cache for ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * Сохранить данные в кэш
   */
  async set<T>(type: CacheType, key: string, data: T, customTTL?: number): Promise<void> {
    const cacheKey = this.getCacheKey(type, key);
    const ttl = customTTL || CACHE_TTL[type];

    const entry: CacheEntry<T> = {
      data,
      metadata: {
        timestamp: Date.now(),
        expiry: ttl,
        version: '1.0', // Можно использовать версию приложения для инвалидации
      },
    };

    // Сохраняем в память
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value as string | undefined;
      if (firstKey !== undefined) {
        this.memoryCache.delete(firstKey);
      }
    }
    this.memoryCache.set(cacheKey, entry);

    // Сохраняем в AsyncStorage
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (error) {
      logger.error(`Failed to set cache for ${cacheKey}:`, error);
    }
  }

  /**
   * Проверить, нужно ли обновлять кэш
   */
  async needsUpdate(type: CacheType, key: string): Promise<boolean> {
    const entry = await this.get(type, key, true); // allowStale для проверки существования
    if (!entry) return true; // Кэша нет, нужно обновить

    const cacheKey = this.getCacheKey(type, key);
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (!stored) return true;

      const cacheEntry: CacheEntry<any> = JSON.parse(stored);
      const age = Date.now() - cacheEntry.metadata.timestamp;
      const ttl = CACHE_TTL[type];

      // Нужно обновить, если кэш старше TTL
      return age >= ttl;
    } catch (error) {
      return true; // При ошибке лучше обновить
    }
  }

  /**
   * Получить возраст кэша в миллисекундах
   */
  async getCacheAge(type: CacheType, key: string): Promise<number | null> {
    const cacheKey = this.getCacheKey(type, key);
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (!stored) return null;

      const entry: CacheEntry<any> = JSON.parse(stored);
      return Date.now() - entry.metadata.timestamp;
    } catch (error) {
      return null;
    }
  }

  /**
   * Удалить кэш
   */
  async remove(type: CacheType, key: string): Promise<void> {
    const cacheKey = this.getCacheKey(type, key);
    this.memoryCache.delete(cacheKey);
    try {
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      logger.error(`Failed to remove cache for ${cacheKey}:`, error);
    }
  }

  /**
   * Получить все ключи и данные указанного типа (для fallback при 429).
   * Возвращает массив {key, data} для ключей, содержащих подстроку в keyFilter.
   */
  async getAllByType<T>(
    type: CacheType,
    allowStale: boolean = true,
    keyFilter?: (fullKey: string, shortKey: string) => boolean
  ): Promise<Array<{ key: string; data: T }>> {
    const prefix = `cache_${type}_`;
    const keys = await AsyncStorage.getAllKeys();
    const relevantKeys = keys.filter(k => {
      if (!k.startsWith(prefix)) return false;
      const shortKey = k.slice(prefix.length);
      if (keyFilter) return keyFilter(k, shortKey);
      return true;
    });
    if (relevantKeys.length === 0) return [];
    const entries = await AsyncStorage.multiGet(relevantKeys);
    const result: Array<{ key: string; data: T }> = [];
    const maxAge = allowStale ? MAX_STALE_AGE[type] : CACHE_TTL[type];
    for (const [cacheKey, stored] of entries) {
      if (!stored) continue;
      try {
        const entry: CacheEntry<T> = JSON.parse(stored);
        const age = Date.now() - entry.metadata.timestamp;
        if (age < maxAge) {
          result.push({ key: cacheKey.replace(prefix, ''), data: entry.data });
        }
      } catch {
        // ignore parse errors
      }
    }
    return result;
  }

  /**
   * Очистить весь кэш определенного типа
   */
  async clearType(type: CacheType): Promise<void> {
    const prefix = `cache_${type}_`;
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter(key => key.startsWith(prefix));

    // Удаляем из памяти
    keysToRemove.forEach(key => this.memoryCache.delete(key));

    // Удаляем из AsyncStorage
    try {
      await AsyncStorage.multiRemove(keysToRemove);
    } catch (error) {
      logger.error(`Failed to clear cache type ${type}:`, error);
    }
  }

  /**
   * Обновить метаданные кэша (например, при ошибке обновления)
   */
  async updateMetadata(
    type: CacheType,
    key: string,
    updates: Partial<CacheMetadata>
  ): Promise<void> {
    const cacheKey = this.getCacheKey(type, key);
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (!stored) return;

      const entry: CacheEntry<any> = JSON.parse(stored);
      entry.metadata = { ...entry.metadata, ...updates };

      // Обновляем в памяти
      this.memoryCache.set(cacheKey, entry);

      // Обновляем в AsyncStorage
      await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (error) {
      logger.error(`Failed to update metadata for ${cacheKey}:`, error);
    }
  }

  /**
   * Очистить кэш и сбросить блокировку API (429 cooldown).
   * Удаляет: cache_*, tour_search_*, tourvisor_429_cooldown_until
   */
  async clearCacheAndUnblockApi(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter(
      (k) =>
        k.startsWith('cache_') ||
        k.startsWith('tour_search_') ||
        k === 'tourvisor_429_cooldown_until'
    );
    this.memoryCache.clear();
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
      logger.log(`[CacheService] Cleared ${keysToRemove.length} keys (cache + API block)`);
    }
  }

  /**
   * Получить статистику кэша
   */
  async getStats(): Promise<{
    memoryEntries: number;
    storageEntries: number;
    totalSize: number;
  }> {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith('cache_'));
    
    let totalSize = 0;
    for (const key of cacheKeys) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      } catch (error) {
        // Игнорируем ошибки
      }
    }

    return {
      memoryEntries: this.memoryCache.size,
      storageEntries: cacheKeys.length,
      totalSize,
    };
  }
}

export const cacheService = CacheService.getInstance();
export default cacheService;
