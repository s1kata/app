import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from './NotificationService';
import { tourvisorApi } from './TourvisorApiService';
import { TourOutput } from '../types/tourvisor';
import { logger } from '../utils/logger';

export interface TrackedTour {
  tourId: string;
  hotelName: string;
  country: string;
  region: string;
  currentPrice: number;
  currency: string;
  date: string;
  originalPrice?: number;
  trackedAt: string;
  lastCheckedAt: string;
  priceHistory: PriceHistoryItem[];
}

export interface PriceHistoryItem {
  price: number;
  date: string;
  checkedAt: string;
}

export interface PriceDropNotification {
  tourId: string;
  hotelName: string;
  country: string;
  oldPrice: number;
  newPrice: number;
  discount: number;
  discountPercent: number;
  notifiedAt: string;
}

class PriceTrackingService {
  private static instance: PriceTrackingService;
  private trackedTours: Map<string, TrackedTour> = new Map();
  private isCheckingPrices = false;
  private checkInterval: NodeJS.Timeout | null = null;

  static getInstance(): PriceTrackingService {
    if (!PriceTrackingService.instance) {
      PriceTrackingService.instance = new PriceTrackingService();
    }
    return PriceTrackingService.instance;
  }

  /**
   * Инициализация сервиса
   */
  async initialize(): Promise<void> {
    try {
      await this.loadTrackedTours();
      logger.debug('[PriceTrackingService] Initialized');
    } catch (error) {
      logger.error('[PriceTrackingService] Initialization error:', error);
    }
  }

  /**
   * Добавить тур для отслеживания цены
   */
  async trackTour(tour: TourOutput): Promise<void> {
    try {
      const trackedTour: TrackedTour = {
        tourId: tour.id.toString(),
        hotelName: tour.hotel.name,
        country: tour.hotel.country?.name || 'Неизвестно',
        region: tour.hotel.region.name,
        currentPrice: tour.price,
        currency: tour.currency,
        date: tour.date,
        originalPrice: tour.price,
        trackedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        priceHistory: [
          {
            price: tour.price,
            date: tour.date,
            checkedAt: new Date().toISOString(),
          },
        ],
      };

      this.trackedTours.set(trackedTour.tourId, trackedTour);
      await this.saveTrackedTours();
      logger.debug(`[PriceTrackingService] Tour tracked: ${trackedTour.tourId}`);
    } catch (error) {
      logger.error('[PriceTrackingService] Error tracking tour:', error);
    }
  }

  /**
   * Удалить тур из отслеживания
   */
  async untrackTour(tourId: string): Promise<void> {
    try {
      this.trackedTours.delete(tourId);
      await this.saveTrackedTours();
      logger.debug(`[PriceTrackingService] Tour untracked: ${tourId}`);
    } catch (error) {
      logger.error('[PriceTrackingService] Error untracking tour:', error);
    }
  }

  /**
   * Проверить, отслеживается ли тур
   */
  isTracked(tourId: string): boolean {
    return this.trackedTours.has(tourId);
  }

  /**
   * Получить все отслеживаемые туры
   */
  getTrackedTours(): TrackedTour[] {
    return Array.from(this.trackedTours.values());
  }

  /**
   * Проверить изменения цен для всех отслеживаемых туров
   */
  async checkPriceChanges(): Promise<void> {
    if (this.isCheckingPrices) {
      logger.debug('[PriceTrackingService] Price check already in progress');
      return;
    }

    if (this.trackedTours.size === 0) {
      logger.debug('[PriceTrackingService] No tours to check');
      return;
    }

    this.isCheckingPrices = true;
    logger.debug(`[PriceTrackingService] Checking prices for ${this.trackedTours.size} tours`);

    try {
      const toursToCheck = Array.from(this.trackedTours.values());
      const priceDrops: PriceDropNotification[] = [];

      for (const trackedTour of toursToCheck) {
        try {
          // Получаем актуальную информацию о туре из API
          const currentTour = await tourvisorApi.getTourDetails(
            trackedTour.tourId,
            trackedTour.currency
          );

          if (!currentTour) {
            logger.warn(`[PriceTrackingService] Tour ${trackedTour.tourId} not found`);
            continue;
          }

          const newPrice = currentTour.price;
          const oldPrice = trackedTour.currentPrice;

          // Обновляем историю цен
          trackedTour.priceHistory.push({
            price: newPrice,
            date: currentTour.date,
            checkedAt: new Date().toISOString(),
          });

          // Ограничиваем историю последними 30 записями
          if (trackedTour.priceHistory.length > 30) {
            trackedTour.priceHistory = trackedTour.priceHistory.slice(-30);
          }

          // Проверяем снижение цены
          if (newPrice < oldPrice) {
            const discount = oldPrice - newPrice;
            const discountPercent = Math.round((discount / oldPrice) * 100);

            // Отправляем уведомление только если скидка больше 5%
            if (discountPercent >= 5) {
              priceDrops.push({
                tourId: trackedTour.tourId,
                hotelName: trackedTour.hotelName,
                country: trackedTour.country,
                oldPrice,
                newPrice,
                discount,
                discountPercent,
                notifiedAt: new Date().toISOString(),
              });

              // Отправляем уведомление
              await notificationService.sendFavoriteDiscountNotification(
                trackedTour.tourId,
                `${trackedTour.hotelName}, ${trackedTour.country}`,
                oldPrice,
                newPrice,
                discountPercent
              );
            }
          }

          // Обновляем текущую цену
          trackedTour.currentPrice = newPrice;
          trackedTour.lastCheckedAt = new Date().toISOString();
        } catch (error) {
          logger.error(
            `[PriceTrackingService] Error checking tour ${trackedTour.tourId}:`,
            error
          );
        }
      }

      // Сохраняем обновленные данные
      await this.saveTrackedTours();

      if (priceDrops.length > 0) {
        logger.info(`[PriceTrackingService] Found ${priceDrops.length} price drops`);
      }
    } catch (error) {
      logger.error('[PriceTrackingService] Error checking price changes:', error);
    } finally {
      this.isCheckingPrices = false;
    }
  }

  /**
   * Запустить автоматическую проверку цен (каждые 6 часов)
   */
  startAutoCheck(intervalHours: number = 6): void {
    if (this.checkInterval) {
      this.stopAutoCheck();
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.checkPriceChanges().catch(error => {
        logger.error('[PriceTrackingService] Auto check error:', error);
      });
    }, intervalMs);

    logger.debug(`[PriceTrackingService] Auto check started (every ${intervalHours} hours)`);
  }

  /**
   * Остановить автоматическую проверку
   */
  stopAutoCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.debug('[PriceTrackingService] Auto check stopped');
    }
  }

  /**
   * Загрузить отслеживаемые туры из хранилища
   */
  private async loadTrackedTours(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('trackedTours');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.trackedTours = new Map(parsed);
        logger.debug(`[PriceTrackingService] Loaded ${this.trackedTours.size} tracked tours`);
      }
    } catch (error) {
      logger.error('[PriceTrackingService] Error loading tracked tours:', error);
    }
  }

  /**
   * Сохранить отслеживаемые туры в хранилище
   */
  private async saveTrackedTours(): Promise<void> {
    try {
      const toursArray = Array.from(this.trackedTours.entries());
      await AsyncStorage.setItem('trackedTours', JSON.stringify(toursArray));
    } catch (error) {
      logger.error('[PriceTrackingService] Error saving tracked tours:', error);
    }
  }

  /**
   * Получить историю цен для тура
   */
  getPriceHistory(tourId: string): PriceHistoryItem[] {
    const trackedTour = this.trackedTours.get(tourId);
    return trackedTour?.priceHistory || [];
  }
}

export const priceTrackingService = PriceTrackingService.getInstance();
