/**
 * Сервис избранного: AsyncStorage + синхронизация с Firestore (коллекция favorites).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { Tour, Hotel } from '../types';
import { TourOutput } from '../types/tourvisor';
import { AuthService } from './AuthService';
import { logger } from '../utils/logger';
import { db } from '../config/firebase';

const FAVORITES_TOURS_KEY = 'user_favorite_tours';
const FAVORITES_HOTELS_KEY = 'user_favorite_hotels';

function tourDocId(userId: string, tourId: string) {
  return `tour_${userId}_${tourId}`;
}

function hotelDocId(userId: string, hotelId: string) {
  return `hotel_${userId}_${hotelId}`;
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

  private isGuestUser(user: { id?: string; isAnonymous?: boolean } | null): boolean {
    if (!user?.id) return true;
    return user.id.startsWith('guest_') || user.isAnonymous === true;
  }

  private mergeByTourId(a: TourOutput[], b: TourOutput[]): TourOutput[] {
    const map = new Map<string, TourOutput>();
    for (const t of b) map.set(t.id, t);
    for (const t of a) if (!map.has(t.id)) map.set(t.id, t);
    return Array.from(map.values());
  }

  private mergeByHotelId(a: Hotel[], b: Hotel[]): Hotel[] {
    const map = new Map<string, Hotel>();
    for (const h of b) map.set(h.id, h);
    for (const h of a) if (!map.has(h.id)) map.set(h.id, h);
    return Array.from(map.values());
  }

  async getFavoriteTours(): Promise<TourOutput[]> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user?.id) {
        return [];
      }
      const uid = user.id;

      let local: TourOutput[] = [];
      const stored = await AsyncStorage.getItem(`${FAVORITES_TOURS_KEY}_${uid}`);
      if (stored) {
        try {
          local = JSON.parse(stored);
        } catch {
          local = [];
        }
      }

      if (!db || this.isGuestUser(user)) {
        return local;
      }

      try {
        const q = query(collection(db, 'favorites'), where('userId', '==', uid));
        const snap = await getDocs(q);
        const fromCloud: TourOutput[] = [];
        snap.forEach((d) => {
          const x = d.data() as { kind?: string; tourData?: string };
          if (x.kind === 'tour' && x.tourData) {
            try {
              fromCloud.push(JSON.parse(x.tourData) as TourOutput);
            } catch {
              /* skip */
            }
          }
        });
        const merged = this.mergeByTourId(fromCloud, local);
        await AsyncStorage.setItem(`${FAVORITES_TOURS_KEY}_${uid}`, JSON.stringify(merged));
        return merged;
      } catch (e) {
        logger.warn('[FavoritesService] Firestore sync tours:', e);
        return local;
      }
    } catch (error) {
      logger.error('Ошибка загрузки избранных туров:', error);
      return [];
    }
  }

  async getFavoriteHotels(): Promise<Hotel[]> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user?.id) {
        return [];
      }
      const uid = user.id;

      let local: Hotel[] = [];
      const stored = await AsyncStorage.getItem(`${FAVORITES_HOTELS_KEY}_${uid}`);
      if (stored) {
        try {
          local = JSON.parse(stored);
        } catch {
          local = [];
        }
      }

      if (!db || this.isGuestUser(user)) {
        return local;
      }

      try {
        const q = query(collection(db, 'favorites'), where('userId', '==', uid));
        const snap = await getDocs(q);
        const fromCloud: Hotel[] = [];
        snap.forEach((d) => {
          const x = d.data() as { kind?: string; hotelData?: string };
          if (x.kind === 'hotel' && x.hotelData) {
            try {
              fromCloud.push(JSON.parse(x.hotelData) as Hotel);
            } catch {
              /* skip */
            }
          }
        });
        const merged = this.mergeByHotelId(fromCloud, local);
        await AsyncStorage.setItem(`${FAVORITES_HOTELS_KEY}_${uid}`, JSON.stringify(merged));
        return merged;
      } catch (e) {
        logger.warn('[FavoritesService] Firestore sync hotels:', e);
        return local;
      }
    } catch (error) {
      logger.error('Ошибка загрузки избранных отелей:', error);
      return [];
    }
  }

  async isTourFavorite(tourId: string): Promise<boolean> {
    try {
      const favorites = await this.getFavoriteTours();
      return favorites.some((tour) => tour.id === tourId);
    } catch (error) {
      logger.error('Ошибка проверки избранного тура:', error);
      return false;
    }
  }

  async isHotelFavorite(hotelId: string): Promise<boolean> {
    try {
      const favorites = await this.getFavoriteHotels();
      return favorites.some((hotel) => hotel.id === hotelId);
    } catch (error) {
      logger.error('Ошибка проверки избранного отеля:', error);
      return false;
    }
  }

  async addTourToFavorites(tour: TourOutput): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user?.id) {
        return { success: false, error: 'Пользователь не авторизован' };
      }
      const uid = user.id;

      const favorites = await this.getFavoriteTours();
      if (favorites.some((f) => f.id === tour.id)) {
        return { success: false, error: 'Тур уже в избранном' };
      }

      favorites.push(tour);
      await AsyncStorage.setItem(`${FAVORITES_TOURS_KEY}_${uid}`, JSON.stringify(favorites));

      if (db && !this.isGuestUser(user)) {
        try {
          await setDoc(doc(db, 'favorites', tourDocId(uid, tour.id)), {
            userId: uid,
            kind: 'tour',
            tourId: tour.id,
            tourData: JSON.stringify(tour),
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          logger.warn('[FavoritesService] Firestore add tour:', e);
        }
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Ошибка добавления тура в избранное:', error);
      return { success: false, error: error.message || 'Не удалось добавить тур в избранное' };
    }
  }

  async addHotelToFavorites(hotel: Hotel): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user?.id) {
        return { success: false, error: 'Пользователь не авторизован' };
      }
      const uid = user.id;

      const favorites = await this.getFavoriteHotels();
      if (favorites.some((f) => f.id === hotel.id)) {
        return { success: false, error: 'Отель уже в избранном' };
      }

      favorites.push(hotel);
      await AsyncStorage.setItem(`${FAVORITES_HOTELS_KEY}_${uid}`, JSON.stringify(favorites));

      if (db && !this.isGuestUser(user)) {
        try {
          await setDoc(doc(db, 'favorites', hotelDocId(uid, hotel.id)), {
            userId: uid,
            kind: 'hotel',
            hotelId: hotel.id,
            hotelData: JSON.stringify(hotel),
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          logger.warn('[FavoritesService] Firestore add hotel:', e);
        }
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Ошибка добавления отеля в избранное:', error);
      return { success: false, error: error.message || 'Не удалось добавить отель в избранное' };
    }
  }

  async removeTourFromFavorites(tourId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user?.id) {
        return { success: false, error: 'Пользователь не авторизован' };
      }
      const uid = user.id;

      const favorites = await this.getFavoriteTours();
      const updated = favorites.filter((tour) => tour.id !== tourId);
      await AsyncStorage.setItem(`${FAVORITES_TOURS_KEY}_${uid}`, JSON.stringify(updated));

      if (db && !this.isGuestUser(user)) {
        try {
          await deleteDoc(doc(db, 'favorites', tourDocId(uid, tourId)));
        } catch (e) {
          logger.warn('[FavoritesService] Firestore remove tour:', e);
        }
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Ошибка удаления тура из избранного:', error);
      return { success: false, error: error.message || 'Не удалось удалить тур из избранного' };
    }
  }

  async removeHotelFromFavorites(hotelId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user?.id) {
        return { success: false, error: 'Пользователь не авторизован' };
      }
      const uid = user.id;

      const favorites = await this.getFavoriteHotels();
      const updated = favorites.filter((hotel) => hotel.id !== hotelId);
      await AsyncStorage.setItem(`${FAVORITES_HOTELS_KEY}_${uid}`, JSON.stringify(updated));

      if (db && !this.isGuestUser(user)) {
        try {
          await deleteDoc(doc(db, 'favorites', hotelDocId(uid, hotelId)));
        } catch (e) {
          logger.warn('[FavoritesService] Firestore remove hotel:', e);
        }
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Ошибка удаления отеля из избранного:', error);
      return { success: false, error: error.message || 'Не удалось удалить отель из избранного' };
    }
  }

  async toggleTourFavorite(tour: TourOutput): Promise<{ success: boolean; isFavorite: boolean; error?: string }> {
    const lockKey = `tour_${tour.id}`;
    if (this.toggleInFlight.has(lockKey)) {
      const isFavorite = await this.isTourFavorite(tour.id);
      return { success: true, isFavorite, error: undefined };
    }
    this.toggleInFlight.add(lockKey);
    try {
      const isFavorite = await this.isTourFavorite(tour.id);
      if (isFavorite) {
        const result = await this.removeTourFromFavorites(tour.id);
        return { ...result, isFavorite: false };
      }
      const result = await this.addTourToFavorites(tour);
      return { ...result, isFavorite: true };
    } catch (error: any) {
      logger.error('Ошибка переключения избранного тура:', error);
      return { success: false, isFavorite: false, error: error.message };
    } finally {
      this.toggleInFlight.delete(lockKey);
    }
  }

  async toggleHotelFavorite(hotel: Hotel): Promise<{ success: boolean; isFavorite: boolean; error?: string }> {
    const lockKey = `hotel_${hotel.id}`;
    if (this.toggleInFlight.has(lockKey)) {
      const isFavorite = await this.isHotelFavorite(hotel.id);
      return { success: true, isFavorite, error: undefined };
    }
    this.toggleInFlight.add(lockKey);
    try {
      const isFavorite = await this.isHotelFavorite(hotel.id);
      if (isFavorite) {
        const result = await this.removeHotelFromFavorites(hotel.id);
        return { ...result, isFavorite: false };
      }
      const result = await this.addHotelToFavorites(hotel);
      return { ...result, isFavorite: true };
    } catch (error: any) {
      logger.error('Ошибка переключения избранного отеля:', error);
      return { success: false, isFavorite: false, error: error.message };
    } finally {
      this.toggleInFlight.delete(lockKey);
    }
  }
}
