/**
 * Избранное: только AsyncStorage (без Firebase Firestore).
 * Привязка к userId из JWT-сессии travelhub63.ru.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tour, Hotel } from '../types';
import { TourOutput } from '../types/tourvisor';
import { authSession } from './AuthSession';
import { logger } from '../utils/logger';

const FAVORITES_TOURS_KEY = 'user_favorite_tours';
const FAVORITES_HOTELS_KEY = 'user_favorite_hotels';

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v === undefined ? null : v));
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class FavoritesService {
  private static instance: FavoritesService;
  private readonly toggleInFlight = new Set<string>();

  static getInstance(): FavoritesService {
    if (!FavoritesService.instance) {
      FavoritesService.instance = new FavoritesService();
    }
    return FavoritesService.instance;
  }

  private async resolveUserId(): Promise<string | null> {
    const stored = await authSession.getStoredUser();
    if (!stored?.id) return null;
    if (stored.id.startsWith('guest_')) return null;
    return stored.id;
  }

  private mergeByTourId(a: TourOutput[], b: TourOutput[]): TourOutput[] {
    const map = new Map<string, TourOutput>();
    for (const t of b) map.set(String(t.id), t);
    for (const t of a) {
      const id = String(t.id);
      if (!map.has(id)) map.set(id, t);
    }
    return Array.from(map.values());
  }

  private mergeByHotelId(a: Hotel[], b: Hotel[]): Hotel[] {
    const map = new Map<string, Hotel>();
    for (const h of b) map.set(String(h.id), h);
    for (const h of a) {
      const id = String(h.id);
      if (!map.has(id)) map.set(id, h);
    }
    return Array.from(map.values());
  }

  async getFavoriteTours(): Promise<TourOutput[]> {
    try {
      const uid = await this.resolveUserId();
      if (!uid) return [];

      const stored = await AsyncStorage.getItem(`${FAVORITES_TOURS_KEY}_${uid}`);
      if (!stored) return [];
      const parsed = safeJsonParse<TourOutput[]>(stored, []);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      logger.error('Ошибка загрузки избранных туров:', error);
      return [];
    }
  }

  async getFavoriteHotels(): Promise<Hotel[]> {
    try {
      const uid = await this.resolveUserId();
      if (!uid) return [];

      const stored = await AsyncStorage.getItem(`${FAVORITES_HOTELS_KEY}_${uid}`);
      if (!stored) return [];
      const parsed = safeJsonParse<Hotel[]>(stored, []);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      logger.error('Ошибка загрузки избранных отелей:', error);
      return [];
    }
  }

  async isTourFavorite(tourId: string | number): Promise<boolean> {
    try {
      const id = String(tourId);
      const favorites = await this.getFavoriteTours();
      return favorites.some((tour) => String(tour.id) === id);
    } catch (error) {
      logger.error('Ошибка проверки избранного тура:', error);
      return false;
    }
  }

  async isHotelFavorite(hotelId: string | number): Promise<boolean> {
    try {
      const id = String(hotelId);
      const favorites = await this.getFavoriteHotels();
      return favorites.some((hotel) => String(hotel.id) === id);
    } catch (error) {
      logger.error('Ошибка проверки избранного отеля:', error);
      return false;
    }
  }

  async addTourToFavorites(tour: TourOutput): Promise<{ success: boolean; error?: string }> {
    try {
      const uid = await this.resolveUserId();
      if (!uid) {
        return { success: false, error: 'Пользователь не авторизован' };
      }

      const favorites = await this.getFavoriteTours();
      const tourId = String(tour.id);
      if (favorites.some((f) => String(f.id) === tourId)) {
        return { success: false, error: 'Тур уже в избранном' };
      }

      favorites.push(tour);
      await AsyncStorage.setItem(`${FAVORITES_TOURS_KEY}_${uid}`, safeJsonStringify(favorites));
      return { success: true };
    } catch (error: unknown) {
      logger.error('Ошибка добавления тура в избранное:', error);
      return {
        success: false,
        error: (error as Error)?.message || 'Не удалось добавить тур в избранное',
      };
    }
  }

  async addHotelToFavorites(hotel: Hotel): Promise<{ success: boolean; error?: string }> {
    try {
      const uid = await this.resolveUserId();
      if (!uid) {
        return { success: false, error: 'Пользователь не авторизован' };
      }

      const favorites = await this.getFavoriteHotels();
      const hotelId = String(hotel.id);
      if (favorites.some((f) => String(f.id) === hotelId)) {
        return { success: false, error: 'Отель уже в избранном' };
      }

      favorites.push(hotel);
      await AsyncStorage.setItem(`${FAVORITES_HOTELS_KEY}_${uid}`, safeJsonStringify(favorites));
      return { success: true };
    } catch (error: unknown) {
      logger.error('Ошибка добавления отеля в избранное:', error);
      return {
        success: false,
        error: (error as Error)?.message || 'Не удалось добавить отель в избранное',
      };
    }
  }

  async removeTourFromFavorites(tourId: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      const uid = await this.resolveUserId();
      if (!uid) {
        return { success: false, error: 'Пользователь не авторизован' };
      }

      const id = String(tourId);
      const favorites = await this.getFavoriteTours();
      const updated = favorites.filter((tour) => String(tour.id) !== id);
      await AsyncStorage.setItem(`${FAVORITES_TOURS_KEY}_${uid}`, safeJsonStringify(updated));
      return { success: true };
    } catch (error: unknown) {
      logger.error('Ошибка удаления тура из избранного:', error);
      return {
        success: false,
        error: (error as Error)?.message || 'Не удалось удалить тур из избранного',
      };
    }
  }

  async removeHotelFromFavorites(hotelId: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      const uid = await this.resolveUserId();
      if (!uid) {
        return { success: false, error: 'Пользователь не авторизован' };
      }

      const id = String(hotelId);
      const favorites = await this.getFavoriteHotels();
      const updated = favorites.filter((hotel) => String(hotel.id) !== id);
      await AsyncStorage.setItem(`${FAVORITES_HOTELS_KEY}_${uid}`, safeJsonStringify(updated));
      return { success: true };
    } catch (error: unknown) {
      logger.error('Ошибка удаления отеля из избранного:', error);
      return {
        success: false,
        error: (error as Error)?.message || 'Не удалось удалить отель из избранного',
      };
    }
  }

  async toggleTourFavorite(tour: TourOutput): Promise<{ success: boolean; isFavorite: boolean; error?: string }> {
    const lockKey = `tour_${tour.id}`;
    if (this.toggleInFlight.has(lockKey)) {
      const isFavorite = await this.isTourFavorite(tour.id);
      return { success: true, isFavorite };
    }
    this.toggleInFlight.add(lockKey);
    try {
      const isFavorite = await this.isTourFavorite(tour.id);
      if (isFavorite) {
        const result = await this.removeTourFromFavorites(tour.id);
        return { ...result, isFavorite: false };
      }
      const result = await this.addTourToFavorites(tour);
      return { ...result, isFavorite: result.success };
    } catch (error: unknown) {
      logger.error('Ошибка переключения избранного тура:', error);
      return {
        success: false,
        isFavorite: false,
        error: (error as Error)?.message || 'Не удалось обновить избранное',
      };
    } finally {
      this.toggleInFlight.delete(lockKey);
    }
  }

  async toggleHotelFavorite(hotel: Hotel): Promise<{ success: boolean; isFavorite: boolean; error?: string }> {
    const lockKey = `hotel_${hotel.id}`;
    if (this.toggleInFlight.has(lockKey)) {
      const isFavorite = await this.isHotelFavorite(hotel.id);
      return { success: true, isFavorite };
    }
    this.toggleInFlight.add(lockKey);
    try {
      const isFavorite = await this.isHotelFavorite(hotel.id);
      if (isFavorite) {
        const result = await this.removeHotelFromFavorites(hotel.id);
        return { ...result, isFavorite: false };
      }
      const result = await this.addHotelToFavorites(hotel);
      return { ...result, isFavorite: result.success };
    } catch (error: unknown) {
      logger.error('Ошибка переключения избранного отеля:', error);
      return {
        success: false,
        isFavorite: false,
        error: (error as Error)?.message || 'Не удалось обновить избранное',
      };
    } finally {
      this.toggleInFlight.delete(lockKey);
    }
  }
}
