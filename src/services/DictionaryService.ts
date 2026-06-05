import {
  Country,
  Departure,
  Region,
  SubRegion,
  Arrival,
  Currency,
  CurrencyRate,
  Operator,
  Meal,
  HotelType,
  HotelGroupService
} from '../types/tourvisor';
import { tourvisorApi } from './TourvisorApiService';
import { logger } from '../utils/logger';
import { cacheService, CacheType } from './CacheService';
import {
  setCountriesToFirestore,
  getMealsFromFirestore,
  setMealsToFirestore,
} from './DictionaryFirestoreCache';

class DictionaryService {
  private memoryCache = new Map<string, any>(); // Быстрый доступ к часто используемым данным

  /** Дедуп по имени, отсев пустых и служебных подписей из справочника городов вылета. */
  private normalizeDepartures(list: Departure[]): Departure[] {
    const isJunkName = (name: string) => {
      const s = name.trim();
      if (!s) return true;
      if (s.includes('…') || s.includes('...')) return true;
      if (/куда\s*выбер/i.test(s)) return true;
      if (/^куда\s/i.test(s)) return true;
      return false;
    };
    const byName = new Map<string, Departure>();
    for (const d of list) {
      const raw = (d.name || '').trim();
      if (isJunkName(raw)) continue;
      const key = raw.toLowerCase().replace(/\s+/g, ' ');
      if (!byName.has(key)) byName.set(key, d);
    }
    return Array.from(byName.values());
  }
  private preloadPromise: Promise<void> | null = null;
  private isPreloading = false;
  private backgroundUpdatePromise: Promise<void> | null = null;

  private getCacheKey(type: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${type}${paramStr ? `_${paramStr}` : ''}`;
  }

  /**
   * Получить данные из кэша (сначала память, потом AsyncStorage)
   */
  private async get<T>(key: string): Promise<T | null> {
    // Проверяем память
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) as T;
    }

    // Проверяем AsyncStorage через CacheService
    return await cacheService.get<T>(CacheType.DICTIONARIES, key, true);
  }

  /**
   * Сохранить данные в кэш (и в память, и в AsyncStorage)
   */
  private async set<T>(key: string, data: T): Promise<void> {
    // Сохраняем в память
    this.memoryCache.set(key, data);

    // Сохраняем в AsyncStorage через CacheService (TTL 30 дней — справочники почти статичны)
    await cacheService.set(CacheType.DICTIONARIES, key, data);
  }

  // Глобальная очередь запросов для предотвращения параллельных запросов к одному endpoint
  private requestQueue: Map<string, Promise<any>> = new Map();
  private lastRequestTime: Map<string, number> = new Map();
  // Согласно документации: справочники - 120 запросов/мин (500ms между запросами)
  // Остальные методы - 300 запросов/мин (200ms между запросами)
  // Используем безопасные значения с небольшим запасом
  private readonly MIN_REQUEST_INTERVAL_DICTIONARY = 600; // 600ms для справочников (100 запросов/мин)
  private readonly MIN_REQUEST_INTERVAL_OTHER = 250; // 250ms для остальных методов (240 запросов/мин)

  private async fetchWithCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    expiry?: number,
    isDictionary: boolean = true // По умолчанию справочники
  ): Promise<T> {
    // Сначала пытаемся получить из кэша (разрешаем устаревший кэш)
    const cached = await this.get<T>(key);
    if (cached) {
      const needsUpdate = await cacheService.needsUpdate(CacheType.DICTIONARIES, key);
      if (needsUpdate) {
        this.updateInBackground(key, fetchFn, isDictionary).catch(error => {
          logger.debug(`Background update failed for ${key}:`, error?.message);
        });
      }
      return cached;
    }

    // Проверяем, есть ли уже запрос в очереди для этого ключа
    const existingRequest = this.requestQueue.get(key);
    if (existingRequest) {
      logger.debug(`Request for ${key} already in queue, waiting...`);
      return existingRequest;
    }

    // Определяем интервал в зависимости от типа запроса
    const minInterval = isDictionary 
      ? this.MIN_REQUEST_INTERVAL_DICTIONARY 
      : this.MIN_REQUEST_INTERVAL_OTHER;

    // Проверяем минимальный интервал между запросами
    const lastRequest = this.lastRequestTime.get(key);
    const now = Date.now();
    if (lastRequest && (now - lastRequest) < minInterval) {
      const waitTime = minInterval - (now - lastRequest);
      logger.debug(`Rate limiting: waiting ${waitTime}ms before request for ${key} (type: ${isDictionary ? 'dictionary' : 'other'})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Создаем промис для этого запроса
    const requestPromise = (async () => {
      try {
        this.lastRequestTime.set(key, Date.now());
        const data = await fetchFn();
        await this.set(key, data);
        this.requestQueue.delete(key);
        return data;
      } catch (error: any) {
        this.requestQueue.delete(key);
        
        // Проверяем статус ошибки (если есть) или сообщение
        const errorStatus = error?.status || (error?.message?.match(/\b(403|429|401)\b/)?.[1] ? parseInt(error.message.match(/\b(403|429|401)\b/)[1]) : null);
        const isRateLimitError = errorStatus === 429 || error?.message?.includes('429') || error?.message?.includes('Rate limit');
        const isForbiddenError = errorStatus === 403 || error?.message?.includes('403') || error?.message?.includes('forbidden') || error?.message?.includes('Access forbidden');
        const isUnauthorizedError = errorStatus === 401 || error?.message?.includes('401') || error?.message?.includes('Unauthorized');
        
        // Для ошибок API (403, 401, 429) - всегда пытаемся использовать устаревший кэш
        if (isRateLimitError || isForbiddenError || isUnauthorizedError) {
          logger.warn(`API error (${errorStatus || 'unknown'}) for ${key}, trying to use stale cache`);
          // Пробуем получить устаревший кэш (allowStale = true)
          const staleCache = await cacheService.get<T>(CacheType.DICTIONARIES, key, true);
          if (staleCache && Array.isArray(staleCache) && staleCache.length > 0) {
            const cacheAge = await cacheService.getCacheAge(CacheType.DICTIONARIES, key);
            if (cacheAge !== null) {
              logger.warn(`Returning stale cache for ${key} (age: ${Math.round(cacheAge / 1000 / 60)} minutes)`);
              // Сохраняем в память для быстрого доступа
              this.memoryCache.set(key, staleCache);
              return staleCache;
            }
          }
          // Если кэша нет, возвращаем пустой массив для словарей, чтобы не блокировать приложение
          logger.warn(`No cache available for ${key}, returning empty array. This is normal on first app launch.`);
          return [] as T;
        }

        logger.error(`Failed to load dictionary data: ${key}`, error);
        // Для любых других ошибок тоже пытаемся использовать устаревший кэш
        const staleCache = await cacheService.get<T>(CacheType.DICTIONARIES, key, true);
        if (staleCache && Array.isArray(staleCache) && staleCache.length > 0) {
          logger.warn(`Returning stale cache for ${key} due to error`);
          // Сохраняем в память для быстрого доступа
          this.memoryCache.set(key, staleCache);
          return staleCache;
        }
        // Если кэша нет, возвращаем пустой массив для словарей
        logger.warn(`No cache available for ${key}, returning empty array. This is normal on first app launch.`);
        return [] as T;
      }
    })();

    this.requestQueue.set(key, requestPromise);
    return requestPromise;
  }

  // Countries — источник данных: API; при ошибке — кэш/Firestore.
  async getCountries(departureId?: number, onlyCharter?: boolean): Promise<Country[]> {
    const key = this.getCacheKey('countries', { departureId, onlyCharter });
    console.error('[FORCE_LOG] Dictionary getCountries start', {
      departureId: departureId ?? null,
      onlyCharter: onlyCharter ?? false,
      hasToken: !!tourvisorApi.getJwtToken(),
    });
    try {
      const fromApi = await tourvisorApi.getCountries(departureId, onlyCharter ?? false);
      if (fromApi && fromApi.length > 0) {
        await this.set(key, fromApi);
        if (departureId != null) {
          setCountriesToFirestore(fromApi, departureId, onlyCharter ?? false).catch(() => {});
        }
        console.error('[FORCE_LOG] Dictionary getCountries success', { count: fromApi.length });
        return fromApi;
      }
      console.error('[FORCE_LOG] Dictionary getCountries empty response');
      throw new Error('Countries API returned empty list');
    } catch (e) {
      console.error('[FORCE_LOG] Dictionary getCountries failed', {
        error: (e as Error)?.message || String(e),
      });
      throw e;
    }
  }

  /** Полный список стран без фильтров (для отелей и «все страны» в турах) */
  async getCountriesAll(): Promise<Country[]> {
    return this.getCountries();
  }

  // Departures (города вылета) — источник данных: API; при ошибке — кэш/Firestore.
  async getDepartures(departureCountryId?: number): Promise<Departure[]> {
    const key = this.getCacheKey('departures', { departureCountryId });
    console.error('[FORCE_LOG] Dictionary getDepartures start', {
      departureCountryId: departureCountryId ?? null,
      hasToken: !!tourvisorApi.getJwtToken(),
    });
    try {
      const fromApi = await tourvisorApi.getDepartures(departureCountryId);
      if (fromApi && fromApi.length > 0) {
        const normalized = this.normalizeDepartures(fromApi);
        const toStore = normalized.length > 0 ? normalized : fromApi;
        await this.set(key, toStore);
        console.error('[FORCE_LOG] Dictionary getDepartures success', { count: toStore.length });
        return toStore;
      }
      console.error('[FORCE_LOG] Dictionary getDepartures empty response');
      throw new Error('Departures API returned empty list');
    } catch (e) {
      console.error('[FORCE_LOG] Dictionary getDepartures failed', {
        error: (e as Error)?.message || String(e),
      });
      throw e;
    }
  }

  // Regions (resorts)
  async getRegions(countryId?: number, arrivalId?: number): Promise<Region[]> {
    const key = this.getCacheKey('regions', { countryId, arrivalId });
    return this.fetchWithCache(key, () =>
      tourvisorApi.getRegions(countryId, arrivalId),
      undefined,
      true // Справочник
    );
  }

  // Subregions
  async getSubRegions(countryId?: number, regionId?: number): Promise<SubRegion[]> {
    const key = this.getCacheKey('subregions', { countryId, regionId });
    return this.fetchWithCache(key, () =>
      tourvisorApi.getSubRegions(countryId, regionId),
      undefined,
      true // Справочник
    );
  }

  // Arrivals (airports)
  async getArrivals(departureId: number, onlyCharter: boolean = false): Promise<Arrival[]> {
    const key = this.getCacheKey('arrivals', { departureId, onlyCharter });
    return this.fetchWithCache(key, () =>
      tourvisorApi.getArrivals(departureId, onlyCharter),
      undefined,
      true // Справочник
    );
  }

  // Currencies
  async getCurrencies(): Promise<Currency[]> {
    const key = this.getCacheKey('currencies');
    return this.fetchWithCache(key, () => tourvisorApi.getCurrencies(), undefined, true);
  }

  // Currency rates
  async getCurrencyRates(currencyId: string): Promise<CurrencyRate[]> {
    const key = this.getCacheKey('currencyRates', { currencyId });
    // Currency rates should be cached for shorter time (1 hour)
    return this.fetchWithCache(key, () =>
      tourvisorApi.getCurrencyRates(currencyId), 
      60 * 60 * 1000,
      true // Справочник
    );
  }

  // Operators
  async getOperators(departureId?: number, countryId?: number): Promise<Operator[]> {
    const key = this.getCacheKey('operators', { departureId, countryId });
    return this.fetchWithCache(key, () =>
      tourvisorApi.getOperators(departureId, countryId),
      undefined,
      true // Справочник
    );
  }

  /** Запасной список типов питания, если API и Firestore пусты */
  private static readonly MEALS_FALLBACK: Meal[] = [
    { id: 1, name: 'RO', russianName: 'Без питания', fullName: 'Room only', fullRussianName: 'Без питания' },
    { id: 2, name: 'BB', russianName: 'Завтраки', fullName: 'Bed & Breakfast', fullRussianName: 'Завтраки' },
    { id: 3, name: 'HB', russianName: 'Полупансион', fullName: 'Half Board', fullRussianName: 'Полупансион' },
    { id: 4, name: 'FB', russianName: 'Полный пансион', fullName: 'Full Board', fullRussianName: 'Полный пансион' },
    { id: 5, name: 'AI', russianName: 'Всё включено', fullName: 'All Inclusive', fullRussianName: 'Всё включено' },
    { id: 6, name: 'UAI', russianName: 'Ультра всё включено', fullName: 'Ultra All Inclusive', fullRussianName: 'Ультра всё включено' },
  ];

  // Meals — источник данных: API; при ошибке — кэш/Firestore; при пустом — запасной список
  async getMeals(): Promise<Meal[]> {
    const key = this.getCacheKey('meals');
    try {
      const fromApi = await tourvisorApi.getMeals();
      if (fromApi && fromApi.length > 0) {
        await this.set(key, fromApi);
        setMealsToFirestore(fromApi).catch(() => {});
        return fromApi;
      }
    } catch (e) {
      logger.warn('[DictionaryService] getMeals from API failed, using cache', (e as Error)?.message);
    }
    const fromFirestore = await getMealsFromFirestore();
    if (fromFirestore && fromFirestore.length > 0) {
      await this.set(key, fromFirestore);
      return fromFirestore;
    }
    const fromLocal = await this.get<Meal[]>(key);
    if (fromLocal && fromLocal.length > 0) return fromLocal;
    return DictionaryService.MEALS_FALLBACK;
  }

  // Hotel types
  async getHotelTypes(countryId: number): Promise<HotelType[]> {
    const key = this.getCacheKey('hotelTypes', { countryId });
    return this.fetchWithCache(key, () =>
      tourvisorApi.getHotelTypes(countryId),
      undefined,
      true // Справочник
    );
  }

  // Hotel services
  async getHotelGroupServices(countryId?: number, regionIds?: number[]): Promise<HotelGroupService[]> {
    const key = this.getCacheKey('hotelGroupServices', { countryId, regionIds });
    return this.fetchWithCache(key, () =>
      tourvisorApi.getHotelGroupServices(countryId, regionIds),
      undefined,
      true // Справочник
    );
  }

  // Tour dates
  async getTourDates(
    departureId: number,
    countryId: number,
    arrivalId?: number,
    onlyCharter?: boolean
  ): Promise<string[]> {
    const key = this.getCacheKey('tourDates', { departureId, countryId, arrivalId, onlyCharter });
    // Tour dates are more dynamic, cache for 1 hour
    return this.fetchWithCache(key, () =>
      tourvisorApi.getTourDates(departureId, countryId, arrivalId, onlyCharter),
      60 * 60 * 1000,
      true // Справочник
    );
  }

  /**
   * Фоновое обновление данных (не блокирует основной поток)
   */
  private async updateInBackground<T>(
    key: string,
    fetchFn: () => Promise<T>,
    isDictionary: boolean
  ): Promise<void> {
    // Проверяем минимальный интервал между запросами
    const minInterval = isDictionary 
      ? this.MIN_REQUEST_INTERVAL_DICTIONARY 
      : this.MIN_REQUEST_INTERVAL_OTHER;

    const lastRequest = this.lastRequestTime.get(key);
    const now = Date.now();
    if (lastRequest && (now - lastRequest) < minInterval) {
      const waitTime = minInterval - (now - lastRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    try {
      this.lastRequestTime.set(key, Date.now());
      const data = await fetchFn();
      await this.set(key, data);
      logger.debug(`Background update successful for ${key}`);
    } catch (error: any) {
      logger.debug(`Background update failed for ${key}:`, error?.message);
      // Обновляем метаданные кэша с информацией об ошибке
      await cacheService.updateMetadata(CacheType.DICTIONARIES, key, {
        lastUpdateAttempt: Date.now(),
        updateError: error?.message || 'Unknown error',
      });
    }
  }

  /**
   * Фоновое обновление всех справочников (если они устарели)
   */
  async updateStaleDictionaries(): Promise<void> {
    if (this.backgroundUpdatePromise) return this.backgroundUpdatePromise;
    this.backgroundUpdatePromise = (async () => {
      try {
        const dictionaries = [
          { key: this.getCacheKey('countries'), fetchFn: () => this.getCountries() },
          { key: this.getCacheKey('departures'), fetchFn: () => this.getDepartures() },
        ];
        for (const dict of dictionaries) {
          const needsUpdate = await cacheService.needsUpdate(CacheType.DICTIONARIES, dict.key);
          if (needsUpdate) await this.updateInBackground(dict.key, dict.fetchFn, true);
        }
      } catch (error) {
        logger.error('Error updating stale dictionaries:', error);
      } finally {
        // Очищаем промис через минуту, чтобы можно было повторить
        setTimeout(() => {
          this.backgroundUpdatePromise = null;
        }, 60000);
      }
    })();

    return this.backgroundUpdatePromise;
  }

  // Utility methods
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    await cacheService.clearType(CacheType.DICTIONARIES);
  }

  async clearCacheByType(type: string): Promise<void> {
    const keys = Array.from(this.memoryCache.keys()).filter(key => key.startsWith(type));
    keys.forEach(key => this.memoryCache.delete(key));
    
    // Также очищаем из AsyncStorage
    const allKeys = await cacheService.getStats();
    // Здесь можно добавить более точную очистку по типу, если нужно
  }

  getCacheSize(): number {
    return this.memoryCache.size;
  }

  async getCacheStats(): Promise<{ [key: string]: number }> {
    const stats: { [key: string]: number } = {};
    for (const [key] of this.memoryCache) {
      const type = key.split('_')[0];
      stats[type] = (stats[type] || 0) + 1;
    }
    return stats;
  }

  // Preload commonly used dictionaries
  async preloadCommonData(): Promise<void> {
    if (this.preloadPromise) return this.preloadPromise;

    if (this.isPreloading) return this.preloadPromise || Promise.resolve();
    this.isPreloading = true;
    logger.debug('Preloading departures and countries (cache or API)...');
    console.error('[FORCE_LOG] Dictionary preload start');

    this.preloadPromise = (async () => {
      try {
        const countries = await this.getCountries();
        const departures = await this.getDepartures();
        console.error('[FORCE_LOG] Dictionary preload success', {
          countriesCount: countries.length,
          departuresCount: departures.length,
        });
        logger.debug('Departures and countries preloaded');
      } catch (error) {
        console.error('[FORCE_LOG] Dictionary preload failed', {
          error: (error as Error)?.message || String(error),
        });
        logger.error('Unexpected error during preload:', error);
        throw error;
      } finally {
        this.isPreloading = false;
        // Очищаем промис через некоторое время, чтобы можно было повторить при необходимости
        setTimeout(() => {
          this.preloadPromise = null;
        }, 60000); // Через минуту можно повторить
      }
    })();

    return this.preloadPromise;
  }
}

// Create and export singleton instance
export const dictionaryService = new DictionaryService();

// Export the class for testing
export default DictionaryService;