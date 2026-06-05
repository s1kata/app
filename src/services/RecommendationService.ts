import AsyncStorage from '@react-native-async-storage/async-storage';
/**
 * Персональные рекомендации: UI удалён из релиза; сервис сохранён для следующих релизов.
 */
import { AuthService } from './AuthService';
import { FavoritesService } from './FavoritesService';
import { logger } from '../utils/logger';

export interface TourView {
  id: string;
  title: string;
  country: string;
  city: string;
  price: number;
  viewedAt: Date;
  duration?: number;
  hotelStars?: number;
}

export interface Recommendation {
  type: 'based_on_views' | 'similar_to_favorites' | 'popular_in_region' | 'seasonal_offer';
  title: string;
  description: string;
  tours: Array<{
    id: string;
    title: string;
    reason: string;
    score: number;
  }>;
}

class RecommendationService {
  private static instance: RecommendationService;
  private readonly VIEWS_STORAGE_KEY = 'tour_views_history';
  private readonly MAX_VIEWS_HISTORY = 50;

  static getInstance(): RecommendationService {
    if (!RecommendationService.instance) {
      RecommendationService.instance = new RecommendationService();
    }
    return RecommendationService.instance;
  }

  /**
   * Записывает просмотр тура в историю
   */
  async recordTourView(tour: {
    id: string;
    title: string;
    country: string;
    city: string;
    price: number;
    duration?: number;
    hotelStars?: number;
  }): Promise<void> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) return;

      const storageKey = `${this.VIEWS_STORAGE_KEY}_${user.id}`;
      const stored = await AsyncStorage.getItem(storageKey);
      let views: TourView[] = stored ? JSON.parse(stored) : [];

      // Удаляем предыдущий просмотр этого тура, если он был
      views = views.filter(view => view.id !== tour.id);

      // Добавляем новый просмотр
      const newView: TourView = {
        ...tour,
        viewedAt: new Date(),
      };

      views.unshift(newView); // Добавляем в начало

      // Ограничиваем количество записей
      if (views.length > this.MAX_VIEWS_HISTORY) {
        views = views.slice(0, this.MAX_VIEWS_HISTORY);
      }

      await AsyncStorage.setItem(storageKey, JSON.stringify(views));
      logger.debug('✅ Просмотр тура записан:', tour.title);

    } catch (error) {
      logger.error('❌ Ошибка записи просмотра тура:', error);
    }
  }

  /**
   * Получает историю просмотров пользователя
   */
  async getViewHistory(): Promise<TourView[]> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) return [];

      const storageKey = `${this.VIEWS_STORAGE_KEY}_${user.id}`;
      const stored = await AsyncStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];

    } catch (error) {
      logger.error('❌ Ошибка получения истории просмотров:', error);
      return [];
    }
  }

  /**
   * Генерирует персональные рекомендации
   */
  async getRecommendations(): Promise<Recommendation[]> {
    try {
      const user = await AuthService.getCurrentUser();
      const recommendations: Recommendation[] = [];

      const viewHistory = user ? await this.getViewHistory() : [];
      const favoriteTours = user ? await FavoritesService.getInstance().getFavoriteTours() : [];
      const favorites = favoriteTours.map(fav => ({
        country: fav.hotel?.country?.name ?? '',
        city: fav.hotel?.region?.name ?? '',
      })).filter(f => f.country);

      // 1. Рекомендации на основе просмотренных туров
      if (viewHistory.length > 0) {
        const recentViews = viewHistory.slice(0, 5);
        const countries = [...new Set(recentViews.map(view => view.country))];
        const cities = [...new Set(recentViews.map(view => view.city))];

        recommendations.push({
          type: 'based_on_views',
          title: 'Продолжить изучение',
          description: `На основе ваших недавних просмотров: ${countries.slice(0, 2).join(', ')}`,
          tours: this.generateMockRecommendations(5, countries[0], cities[0])
        });
      }

      // 2. Рекомендации похожие на избранное
      if (favorites.length > 0) {
        const favoriteCountries = [...new Set(favorites.map(fav => fav.country))];
        const favoriteCities = [...new Set(favorites.map(fav => fav.city))];

        recommendations.push({
          type: 'similar_to_favorites',
          title: 'Похоже на ваши предпочтения',
          description: `Туры в ${favoriteCountries[0]}, похожие на ваши избранные`,
          tours: this.generateMockRecommendations(4, favoriteCountries[0], favoriteCities[0])
        });
      }

      // 3. Популярные направления в регионе
      const userRegion = this.detectUserRegion(viewHistory, favorites);
      if (userRegion) {
        recommendations.push({
          type: 'popular_in_region',
          title: 'Популярно в вашем регионе',
          description: `Трендовые направления в ${userRegion}`,
          tours: this.generateMockRecommendations(3, userRegion)
        });
      }

      // 4. Сезонные предложения (показываем и гостям, и пользователям)
      const seasonalOffers = this.getSeasonalOffers();
      if (seasonalOffers.length > 0) {
        recommendations.push({
          type: 'seasonal_offer',
          title: 'Сезонные предложения',
          description: 'Лучшие предложения этого сезона',
          tours: seasonalOffers
        });
      }

      return recommendations.filter((r) => r.tours.length > 0);

    } catch (error) {
      logger.error('❌ Ошибка генерации рекомендаций:', error);
      return [];
    }
  }

  /**
   * Определяет регион пользователя на основе истории
   */
  private detectUserRegion(viewHistory: TourView[], favorites: any[]): string | null {
    const allLocations = [...viewHistory, ...favorites];
    const countries = allLocations.map(item => item.country);

    // Определяем наиболее частый регион
    const regionCounts: Record<string, number> = {};
    countries.forEach(country => {
      if (country.includes('Турция') || country.includes('Египет') || country.includes('Таиланд')) {
        regionCounts['Азия'] = (regionCounts['Азия'] || 0) + 1;
      } else if (country.includes('Испания') || country.includes('Италия') || country.includes('Греция')) {
        regionCounts['Европа'] = (regionCounts['Европа'] || 0) + 1;
      }
    });

    const maxRegion = Object.entries(regionCounts).reduce((a, b) =>
      regionCounts[a[0]] > regionCounts[b[0]] ? a : b, ['', 0]
    );

    return maxRegion[1] > 0 ? maxRegion[0] : null;
  }

  /**
   * Генерирует моковые рекомендации для демонстрации
   */
  private generateMockRecommendations(_count: number, _country?: string, _city?: string): Array<{
    id: string;
    title: string;
    reason: string;
    score: number;
  }> {
    return [];
  }

  /**
   * Получает сезонные предложения
   */
  private getSeasonalOffers(): Array<{
    id: string;
    title: string;
    reason: string;
    score: number;
  }> {
    return [];
  }

  /**
   * Очищает историю просмотров
   */
  async clearViewHistory(): Promise<void> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) return;

      const storageKey = `${this.VIEWS_STORAGE_KEY}_${user.id}`;
      await AsyncStorage.removeItem(storageKey);
      logger.debug('✅ История просмотров очищена');

    } catch (error) {
      logger.error('❌ Ошибка очистки истории просмотров:', error);
    }
  }

  /**
   * Получает статистику просмотров
   */
  async getViewStats(): Promise<{
    totalViews: number;
    uniqueTours: number;
    favoriteCountries: string[];
    averagePrice: number;
  }> {
    try {
      const viewHistory = await this.getViewHistory();

      if (viewHistory.length === 0) {
        return {
          totalViews: 0,
          uniqueTours: 0,
          favoriteCountries: [],
          averagePrice: 0
        };
      }

      const uniqueTours = new Set(viewHistory.map(view => view.id)).size;
      const countryCounts: Record<string, number> = {};

      viewHistory.forEach(view => {
        countryCounts[view.country] = (countryCounts[view.country] || 0) + 1;
      });

      const favoriteCountries = Object.entries(countryCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([country]) => country);

      const averagePrice = viewHistory.reduce((sum, view) => sum + view.price, 0) / viewHistory.length;

      return {
        totalViews: viewHistory.length,
        uniqueTours,
        favoriteCountries,
        averagePrice: Math.round(averagePrice)
      };

    } catch (error) {
      logger.error('❌ Ошибка получения статистики просмотров:', error);
      return {
        totalViews: 0,
        uniqueTours: 0,
        favoriteCountries: [],
        averagePrice: 0
      };
    }
  }
}

export const recommendationService = RecommendationService.getInstance();