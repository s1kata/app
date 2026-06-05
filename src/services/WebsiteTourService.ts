/**
 * Сервис для получения туров с веб-сайта Travel Hub
 * Интеграция с API веб-сайта Travel Hub
 */

import Constants from 'expo-constants';
import * as Types from '../types/index';
import { logger } from '../utils/logger';

// Интерфейс тура с сайта (формат API)
export interface WebsiteTour {
  id: number;
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  image: string;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  destination: string;
  duration?: string;
  badge?: string;
  tagLine?: string;
  tags?: string[];
  spotlight?: {
    headline?: string;
    text?: string;
    priceLabel?: string;
    priceOld?: number;
  };
}

export interface WebsiteToursResponse {
  tours: WebsiteTour[];
  hasMore: boolean;
  total: number;
  page: number;
  context: string;
  source: string;
  error?: string;
}

// Карта направлений: slug -> русское название
const DESTINATION_MAP: Record<string, string> = {
  'turkey': 'Турция',
  'egypt': 'Египет',
  'uae': 'ОАЭ',
  'thailand': 'Таиланд',
  'maldives': 'Мальдивы',
  'seychelles': 'Сейшелы',
  'russia': 'Россия',
  'vietnam': 'Вьетнам',
  'china': 'Китай',
  'india': 'Индия',
  'indonesia': 'Индонезия',
  'sri-lanka': 'Шри-Ланка',
  'philippines': 'Филиппины',
  'mauritius': 'Маврикий',
  'tanzania': 'Танзания',
  'oman': 'Оман',
  'jordan': 'Иордания',
  'qatar': 'Катар',
  'bahrain': 'Бахрейн',
  'montenegro': 'Черногория',
  'abkhazia': 'Абхазия',
  'armenia': 'Армения',
  'cuba': 'Куба',
  'venezuela': 'Венесуэла',
  'tunisia': 'Тунис',
};

// Категории по направлениям
const DESTINATION_CATEGORY: Record<string, string> = {
  'turkey': 'Пляж',
  'egypt': 'Пляж',
  'uae': 'Экскурсии',
  'thailand': 'Пляж',
  'maldives': 'Пляж',
  'seychelles': 'Пляж',
  'russia': 'Экскурсии',
  'vietnam': 'Пляж',
  'china': 'Экскурсии',
  'india': 'Экскурсии',
  'indonesia': 'Пляж',
  'sri-lanka': 'Пляж',
  'philippines': 'Пляж',
  'mauritius': 'Пляж',
  'tanzania': 'Активный',
  'oman': 'Экскурсии',
  'jordan': 'Экскурсии',
  'qatar': 'Экскурсии',
  'bahrain': 'Экскурсии',
  'montenegro': 'Горы',
  'abkhazia': 'Горы',
  'armenia': 'Экскурсии',
  'cuba': 'Пляж',
  'venezuela': 'Активный',
  'tunisia': 'Пляж',
};

export class WebsiteTourService {
  private static instance: WebsiteTourService;
  private baseUrl: string;
  private cache: Map<string, { data: WebsiteToursResponse; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 минут

  private constructor() {
    const extra = Constants.expoConfig?.extra || {};
    this.baseUrl = extra.websiteBaseUrl || 'https://travelhub63.ru';
  }

  static getInstance(): WebsiteTourService {
    if (!WebsiteTourService.instance) {
      WebsiteTourService.instance = new WebsiteTourService();
    }
    return WebsiteTourService.instance;
  }

  /**
   * Установка базового URL для API (когда будет домен)
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
    this.cache.clear(); // Очищаем кэш при смене URL
  }

  /**
   * Получить базовый URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Получить URL для страницы поиска туров
   */
  getSearchPageUrl(): string {
    // Страница с Tourvisor виджетом
    return this.baseUrl.replace('/backend/api', '/frontend/window/tours.php');
  }

  /**
   * Получить туры с сайта
   */
  async getTours(options: {
    page?: number;
    perPage?: number;
    filter?: string;
    context?: 'list' | 'featured' | 'spotlight';
  } = {}): Promise<WebsiteToursResponse> {
    const { page = 1, perPage = 12, filter = 'all', context = 'list' } = options;
    
    const cacheKey = `tours_${page}_${perPage}_${filter}_${context}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/tours.php?page=${page}&per_page=${perPage}&filter=${filter}&context=${context}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: WebsiteToursResponse = await response.json();
      if (!data || !Array.isArray(data.tours)) {
        logger.warn('[WebsiteTourService] Unexpected tours payload, using fallback');
        return this.getFallbackTours();
      }

      // Кэшируем результат
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      logger.error('[WebsiteTourService] Error fetching tours:', error);
      return this.getFallbackTours();
    }
  }

  /**
   * Получить туры с пагинацией
   */
  async getToursPaginated(page = 1, perPage = 20): Promise<{
    tours: Types.Tour[];
    hasMore: boolean;
    total: number;
    page: number;
  }> {
    const response = await this.getTours({ page, perPage });
    return {
      tours: this.convertToAppTours(response.tours),
      hasMore: response.hasMore,
      total: response.total,
      page,
    };
  }

  /**
   * Получить все туры (первая страница, legacy)
   */
  async getAllTours(): Promise<Types.Tour[]> {
    const { tours } = await this.getToursPaginated(1, 48);
    return tours;
  }

  /**
   * Получить featured туры (главная страница)
   */
  async getFeaturedTours(): Promise<Types.Tour[]> {
    const response = await this.getTours({ context: 'featured', perPage: 8 });
    return this.convertToAppTours(response.tours);
  }

  /**
   * Получить spotlight туры (специальные предложения)
   */
  async getSpotlightTours(): Promise<Types.Tour[]> {
    const response = await this.getTours({ context: 'spotlight', perPage: 4 });
    return this.convertToAppTours(response.tours);
  }

  /**
   * Получить туры по направлению
   */
  async getToursByDestination(destination: string): Promise<Types.Tour[]> {
    const response = await this.getTours({ filter: destination, perPage: 24 });
    return this.convertToAppTours(response.tours);
  }

  /**
   * Поиск туров
   */
  async searchTours(query: string): Promise<Types.Tour[]> {
    // Сначала получаем все туры
    const response = await this.getTours({ perPage: 48 });
    
    const lowerQuery = query.toLowerCase();
    
    // Фильтруем по запросу
    const filtered = response.tours.filter(tour => 
      tour.title.toLowerCase().includes(lowerQuery) ||
      tour.subtitle?.toLowerCase().includes(lowerQuery) ||
      tour.description?.toLowerCase().includes(lowerQuery) ||
      DESTINATION_MAP[tour.destination]?.toLowerCase().includes(lowerQuery) ||
      tour.destination.toLowerCase().includes(lowerQuery) ||
      tour.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
    
    return this.convertToAppTours(filtered);
  }

  /**
   * Конвертация туров с сайта в формат приложения
   */
  private convertToAppTours(websiteTours: WebsiteTour[]): Types.Tour[] {
    return websiteTours.map((wt, index) => this.convertToAppTour(wt, index));
  }

  /**
   * Конвертация одного тура с сайта в формат приложения
   */
  private convertToAppTour(wt: WebsiteTour, index: number = 0): Types.Tour {
    const destination = DESTINATION_MAP[wt.destination] || wt.destination;
    const category = DESTINATION_CATEGORY[wt.destination] || 'Пляж';
    
    // Парсим duration (например "7-14 ночей" -> 10)
    let duration = 7;
    if (wt.duration) {
      const match = wt.duration.match(/(\d+)/);
      if (match) {
        duration = parseInt(match[1], 10);
      }
    }

    return {
      id: `website-tour-${wt.id}`,
      title: wt.title,
      description: wt.description || wt.subtitle || `Тур в ${destination}`,
      price: wt.price || 0,
      currency: 'RUB',
      duration: duration,
      location: destination,
      country: destination,
      category: category,
      rating: wt.rating || 4.5,
      reviews: wt.reviews || 0,
      image: wt.image,
      gallery: wt.image ? [wt.image] : [],
      included: [
        'Авиаперелёт',
        'Проживание',
        'Трансфер',
        'Страховка',
      ],
      itinerary: [
        { day: 1, title: 'Прибытие', description: `Прибытие в ${destination}, трансфер в отель` },
        { day: Math.ceil(duration / 2), title: 'Отдых', description: 'Отдых и экскурсии' },
        { day: duration, title: 'Вылет', description: 'Трансфер в аэропорт, вылет домой' },
      ],
      tags: wt.tags || [destination, category],
      available: true,
      maxParticipants: 20,
      currentParticipants: 0,
      // Дополнительные поля
      hotel: wt.subtitle,
      hotelStars: 5,
      mealType: 'Всё включено',
      departureCity: 'Москва',
      tourOperator: 'Travel Hub',
      transferIncluded: true,
      insuranceIncluded: true,
      pricePerPerson: true,
      originalPrice: wt.spotlight?.priceOld,
      discount: wt.spotlight?.priceOld ? Math.round((1 - (wt.price || 0) / wt.spotlight.priceOld) * 100) : undefined,
      hotDeal: wt.badge === 'Hot' || wt.badge === 'Горящий',
      lastMinute: wt.badge === 'Limited',
    };
  }

  /**
   * Получить список направлений
   */
  getDestinations(): { slug: string; name: string; category: string }[] {
    return Object.entries(DESTINATION_MAP).map(([slug, name]) => ({
      slug,
      name,
      category: DESTINATION_CATEGORY[slug] || 'Пляж',
    }));
  }

  /**
   * Fallback данные при ошибке API
   */
  private getFallbackTours(): WebsiteToursResponse {
    return {
      tours: [
        {
          id: 1,
          slug: 'turkey-antalya-5star',
          title: 'Турция. Анталья 5*',
          subtitle: 'All Inclusive в лучших отелях',
          description: 'Отдых на побережье Средиземного моря с системой всё включено',
          image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80',
          price: 89000,
          rating: 4.8,
          reviews: 256,
          destination: 'turkey',
          duration: '7-14 ночей',
          badge: 'Hot',
          tags: ['Турция', 'Пляж', 'All Inclusive'],
        },
        {
          id: 2,
          slug: 'egypt-hurghada-resort',
          title: 'Египет. Хургада',
          subtitle: 'Отели на первой линии',
          description: 'Красное море, коралловые рифы и древние пирамиды',
          image: 'https://images.unsplash.com/photo-1539768942893-daf53e448371?auto=format&fit=crop&w=1600&q=80',
          price: 75000,
          rating: 4.6,
          reviews: 189,
          destination: 'egypt',
          duration: '7-10 ночей',
          badge: 'Sale',
          tags: ['Египет', 'Пляж', 'Дайвинг'],
        },
        {
          id: 3,
          slug: 'uae-dubai-luxury',
          title: 'ОАЭ. Дубай',
          subtitle: 'Город будущего',
          description: 'Небоскребы, шоппинг и пустынные сафари',
          image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1600&q=80',
          price: 125000,
          rating: 4.9,
          reviews: 312,
          destination: 'uae',
          duration: '5-7 ночей',
          badge: 'Premium',
          tags: ['ОАЭ', 'Экскурсии', 'Шоппинг'],
        },
        {
          id: 4,
          slug: 'thailand-phuket-beach',
          title: 'Таиланд. Пхукет',
          subtitle: 'Тропический рай',
          description: 'Белоснежные пляжи и тайский массаж',
          image: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1600&q=80',
          price: 95000,
          rating: 4.7,
          reviews: 445,
          destination: 'thailand',
          duration: '10-14 ночей',
          badge: 'Popular',
          tags: ['Таиланд', 'Пляж', 'Экзотика'],
        },
      ],
      hasMore: false,
      total: 4,
      page: 1,
      context: 'list',
      source: 'fallback',
    };
  }

  /**
   * Очистить кэш
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Проверка доступности API
   */
  async checkApiAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/tours.php?per_page=1`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const websiteTourService = WebsiteTourService.getInstance();


