import { logger } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Rate Limiter для Tourvisor API
 * Согласно документации: https://api.tourvisor.ru/search/docs
 * 
 * Ограничения:
 * - Справочники: 120 запросов/минуту
 * - Поиск и другие методы: 300 запросов/минуту
 * - 3000 поисковых запросов в сутки
 */
class RateLimiter {
  private static instance: RateLimiter;
  
  // Лимиты согласно документации
  private readonly DICTIONARY_LIMIT = 120; // запросов в минуту
  private readonly SEARCH_LIMIT = 300; // запросов в минуту
  private readonly DAILY_SEARCH_LIMIT = 3000; // поисковых запросов в сутки
  
  // Временные окна
  private readonly WINDOW_MS = 60 * 1000; // 1 минута
  private readonly DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 часа
  
  // История запросов
  private dictionaryRequests: number[] = [];
  private searchRequests: number[] = [];
  private dailySearchCount: number = 0;
  private dailySearchResetTime: number = 0;
  
  // Очередь запросов
  private requestQueue: Array<{
    resolve: () => void;
    timestamp: number;
    type: 'dictionary' | 'search';
  }> = [];
  private processingQueue: boolean = false;
  
  private constructor() {
    this.loadDailyCount();
  }
  
  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }
  
  /**
   * Загрузка дневного счетчика из AsyncStorage
   */
  private async loadDailyCount(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('tourvisor_daily_search_count');
      const resetTime = await AsyncStorage.getItem('tourvisor_daily_reset_time');
      
      if (stored) {
        this.dailySearchCount = parseInt(stored, 10);
      }
      
      if (resetTime) {
        this.dailySearchResetTime = parseInt(resetTime, 10);
        
        // Если прошло больше 24 часов, сбрасываем счетчик
        if (Date.now() - this.dailySearchResetTime > this.DAILY_WINDOW_MS) {
          this.dailySearchCount = 0;
          this.dailySearchResetTime = Date.now();
          await this.saveDailyCount();
        }
      } else {
        this.dailySearchResetTime = Date.now();
        await this.saveDailyCount();
      }
    } catch (error) {
      logger.error('[RateLimiter] Error loading daily count:', error);
    }
  }
  
  /**
   * Сохранение дневного счетчика в AsyncStorage
   */
  private async saveDailyCount(): Promise<void> {
    try {
      await AsyncStorage.setItem('tourvisor_daily_search_count', this.dailySearchCount.toString());
      await AsyncStorage.setItem('tourvisor_daily_reset_time', this.dailySearchResetTime.toString());
    } catch (error) {
      logger.error('[RateLimiter] Error saving daily count:', error);
    }
  }
  
  /**
   * Очистка старых запросов из истории
   */
  private cleanOldRequests(requests: number[], windowMs: number): number[] {
    const now = Date.now();
    return requests.filter(timestamp => now - timestamp < windowMs);
  }
  
  /**
   * Проверка возможности выполнения запроса
   */
  private canMakeRequest(type: 'dictionary' | 'search'): { allowed: boolean; waitMs?: number } {
    const now = Date.now();
    
    if (type === 'dictionary') {
      // Очищаем старые запросы
      this.dictionaryRequests = this.cleanOldRequests(this.dictionaryRequests, this.WINDOW_MS);
      
      // Проверяем лимит
      if (this.dictionaryRequests.length >= this.DICTIONARY_LIMIT) {
        const oldestRequest = Math.min(...this.dictionaryRequests);
        const waitMs = this.WINDOW_MS - (now - oldestRequest);
        return { allowed: false, waitMs: Math.max(0, waitMs) };
      }
      
      return { allowed: true };
    } else {
      // Очищаем старые запросы
      this.searchRequests = this.cleanOldRequests(this.searchRequests, this.WINDOW_MS);
      
      // Проверяем дневной лимит
      if (Date.now() - this.dailySearchResetTime > this.DAILY_WINDOW_MS) {
        this.dailySearchCount = 0;
        this.dailySearchResetTime = Date.now();
        this.saveDailyCount();
      }
      
      if (this.dailySearchCount >= this.DAILY_SEARCH_LIMIT) {
        const waitMs = this.DAILY_WINDOW_MS - (now - this.dailySearchResetTime);
        logger.warn(`[RateLimiter] Daily search limit reached (${this.dailySearchCount}/${this.DAILY_SEARCH_LIMIT}). Wait ${Math.round(waitMs / 1000 / 60)} minutes.`);
        return { allowed: false, waitMs: Math.max(0, waitMs) };
      }
      
      // Проверяем минутный лимит
      if (this.searchRequests.length >= this.SEARCH_LIMIT) {
        const oldestRequest = Math.min(...this.searchRequests);
        const waitMs = this.WINDOW_MS - (now - oldestRequest);
        return { allowed: false, waitMs: Math.max(0, waitMs) };
      }
      
      return { allowed: true };
    }
  }
  
  /**
   * Регистрация выполненного запроса
   */
  private recordRequest(type: 'dictionary' | 'search'): void {
    const now = Date.now();
    
    if (type === 'dictionary') {
      this.dictionaryRequests.push(now);
    } else {
      this.searchRequests.push(now);
      
      // Увеличиваем дневной счетчик для поисковых запросов
      if (Date.now() - this.dailySearchResetTime > this.DAILY_WINDOW_MS) {
        this.dailySearchCount = 0;
        this.dailySearchResetTime = Date.now();
      }
      
      this.dailySearchCount++;
      this.saveDailyCount();
      
      logger.debug(`[RateLimiter] Daily search count: ${this.dailySearchCount}/${this.DAILY_SEARCH_LIMIT}`);
    }
  }
  
  /**
   * Обработка очереди запросов
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.processingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];
      const check = this.canMakeRequest(request.type);
      
      if (check.allowed) {
        // Удаляем из очереди и разрешаем выполнение
        this.requestQueue.shift();
        this.recordRequest(request.type);
        request.resolve();
      } else {
        // Ждем необходимое время
        if (check.waitMs && check.waitMs > 0) {
          await new Promise(resolve => setTimeout(resolve, check.waitMs));
        } else {
          // Если waitMs не указан, ждем небольшую задержку
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    this.processingQueue = false;
  }
  
  /**
   * Ожидание возможности выполнения запроса
   */
  async waitForAvailability(type: 'dictionary' | 'search'): Promise<void> {
    return new Promise((resolve) => {
      const check = this.canMakeRequest(type);
      
      if (check.allowed) {
        this.recordRequest(type);
        resolve();
      } else {
        // Добавляем в очередь
        this.requestQueue.push({
          resolve: () => {
            this.recordRequest(type);
            resolve();
          },
          timestamp: Date.now(),
          type,
        });
        
        // Запускаем обработку очереди
        this.processQueue();
      }
    });
  }
  
  /**
   * Получение статистики
   */
  getStats(): {
    dictionaryRequests: number;
    dictionaryLimit: number;
    searchRequests: number;
    searchLimit: number;
    dailySearchCount: number;
    dailySearchLimit: number;
    queueLength: number;
  } {
    const now = Date.now();
    
    return {
      dictionaryRequests: this.cleanOldRequests(this.dictionaryRequests, this.WINDOW_MS).length,
      dictionaryLimit: this.DICTIONARY_LIMIT,
      searchRequests: this.cleanOldRequests(this.searchRequests, this.WINDOW_MS).length,
      searchLimit: this.SEARCH_LIMIT,
      dailySearchCount: this.dailySearchCount,
      dailySearchLimit: this.DAILY_SEARCH_LIMIT,
      queueLength: this.requestQueue.length,
    };
  }
  
  /**
   * Сброс счетчиков (для тестирования)
   */
  reset(): void {
    this.dictionaryRequests = [];
    this.searchRequests = [];
    this.dailySearchCount = 0;
    this.dailySearchResetTime = Date.now();
    this.requestQueue = [];
    this.saveDailyCount();
  }
}

export const rateLimiter = RateLimiter.getInstance();
