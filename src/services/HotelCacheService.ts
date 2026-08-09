/**
 * Кэш данных об отелях для использования при недоступности API /hotels/{id} (403).
 * Сохраняет HotelCompact из результатов поиска — при 403 показываем кэшированные данные вместо ошибки.
 */

import { HotelCompact, Hotel } from '../types/tourvisor';
import { logger } from '../utils/logger';

const TTL_MS = 60 * 60 * 1000; // 1 час

interface CachedHotel {
  data: HotelCompact | Hotel;
  fetchedAt: number;
}

const cache = new Map<number, CachedHotel>();

function isExpired(entry: CachedHotel): boolean {
  return Date.now() - entry.fetchedAt > TTL_MS;
}

export const hotelCacheService = {
  set(hotelId: number, hotel: HotelCompact | Hotel): void {
    cache.set(hotelId, { data: hotel, fetchedAt: Date.now() });
    if (__DEV__) {
      logger.debug(`[HotelCache] Saved hotel ${hotelId}, total cached: ${cache.size}`);
    }
  },

  get(hotelId: number): HotelCompact | Hotel | null {
    const entry = cache.get(hotelId);
    if (!entry) return null;
    if (isExpired(entry)) {
      cache.delete(hotelId);
      return null;
    }
    return entry.data;
  },

  setMany(hotels: (HotelCompact | Hotel)[]): void {
    const now = Date.now();
    for (const h of hotels) {
      cache.set(h.id, { data: h, fetchedAt: now });
    }
    if (__DEV__ && hotels.length > 0) {
      logger.debug(`[HotelCache] Saved ${hotels.length} hotels, total cached: ${cache.size}`);
    }
  },

  clear(): void {
    cache.clear();
  },
};
