/**
 * Сервис управления обновлениями приложения
 * Отслеживает версии, историю обновлений и возможность обновления
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logger } from '../utils/logger';

export interface AppUpdate {
  version: string;
  date: string;
  title: string;
  description: string;
  changes: string[];
  mandatory: boolean;
  downloadSize?: number;
}

export interface UpdateHistory {
  currentVersion: string;
  lastCheckDate: string;
  updateHistory: AppUpdate[];
}

const UPDATE_STORAGE_KEY = 'app_update_history';
const CURRENT_VERSION = '1.1.0';

export class UpdateService {
  private static instance: UpdateService;

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  /**
   * Получить текущую версию приложения
   */
  getCurrentVersion(): string {
    return CURRENT_VERSION;
  }

  /**
   * Получить историю обновлений
   */
  async getUpdateHistory(): Promise<UpdateHistory> {
    try {
      const stored = await AsyncStorage.getItem(UPDATE_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }

      // Создаем начальную историю
      const initialHistory: UpdateHistory = {
        currentVersion: CURRENT_VERSION,
        lastCheckDate: new Date().toISOString(),
        updateHistory: await this.getDefaultUpdateHistory(),
      };

      await this.saveUpdateHistory(initialHistory);
      return initialHistory;
    } catch (error) {
      logger.error('Ошибка загрузки истории обновлений:', error);
      return {
        currentVersion: CURRENT_VERSION,
        lastCheckDate: new Date().toISOString(),
        updateHistory: await this.getDefaultUpdateHistory(),
      };
    }
  }

  /**
   * Проверить наличие обновлений
   */
  async checkForUpdates(): Promise<{ hasUpdate: boolean; update?: AppUpdate }> {
    try {
      // В реальном приложении здесь был бы запрос к серверу
      // Для примера симулируем проверку
      const latestUpdate: AppUpdate = {
        version: '1.2.0',
        date: new Date().toISOString(),
        title: 'Новые функции и улучшения',
        description: 'Добавлены новые возможности для бронирования и улучшен интерфейс',
        changes: [
          'Автоматическое обновление данных при бронировании',
          'Улучшенная система уведомлений',
          'Новые фильтры поиска туров',
          'Исправлены ошибки с загрузкой изображений',
          'Оптимизация производительности',
        ],
        mandatory: false,
        downloadSize: 18.5,
      };

      const history = await this.getUpdateHistory();
      const hasUpdate = this.compareVersions(latestUpdate.version, history.currentVersion) > 0;

      return {
        hasUpdate,
        update: hasUpdate ? latestUpdate : undefined,
      };
    } catch (error) {
      logger.error('Ошибка проверки обновлений:', error);
      return { hasUpdate: false };
    }
  }

  /**
   * Обновить версию приложения
   */
  async updateApp(version: string): Promise<void> {
    try {
      const history = await this.getUpdateHistory();
      history.currentVersion = version;
      history.lastCheckDate = new Date().toISOString();
      await this.saveUpdateHistory(history);
    } catch (error) {
      logger.error('Ошибка обновления приложения:', error);
    }
  }

  /**
   * Добавить запись в историю обновлений
   */
  async addUpdateToHistory(update: AppUpdate): Promise<void> {
    try {
      const history = await this.getUpdateHistory();
      history.updateHistory.unshift(update);
      // Ограничиваем историю последними 20 обновлениями
      if (history.updateHistory.length > 20) {
        history.updateHistory = history.updateHistory.slice(0, 20);
      }
      await this.saveUpdateHistory(history);
    } catch (error) {
      logger.error('Ошибка добавления обновления в историю:', error);
    }
  }

  /**
   * Получить дефолтную историю обновлений
   */
  private async getDefaultUpdateHistory(): Promise<AppUpdate[]> {
    return [
      {
        version: '1.1.0',
        date: new Date('2024-11-01').toISOString(),
        title: 'Улучшения интерфейса и функциональности',
        description: 'Добавлены новые возможности для бронирования туров',
        changes: [
          'Экран бронирования туров',
          'Автоматическое обновление данных',
          'Улучшенная система поиска',
          'Исправление ошибок',
        ],
        mandatory: false,
      },
      {
        version: '1.0.0',
        date: new Date('2024-10-01').toISOString(),
        title: 'Первая версия приложения',
        description: 'Выпуск первой версии TravelHub',
        changes: [
          'Регистрация и авторизация',
          'Просмотр туров',
          'Корзина и бронирование',
          'Профиль пользователя',
        ],
        mandatory: false,
      },
    ];
  }

  /**
   * Сохранить историю обновлений
   */
  private async saveUpdateHistory(history: UpdateHistory): Promise<void> {
    try {
      await AsyncStorage.setItem(UPDATE_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      logger.error('Ошибка сохранения истории обновлений:', error);
    }
  }

  /**
   * Сравнить версии
   */
  private compareVersions(version1: string, version2: string): number {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      if (v1part > v2part) return 1;
      if (v1part < v2part) return -1;
    }
    return 0;
  }
}

