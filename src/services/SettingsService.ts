import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode } from '../config/theme';
import { Language } from '../config/i18n';
import { themeManager } from '../config/theme';
import { logger } from '../utils/logger';

export type Currency = 'RUB' | 'USD' | 'EUR';

interface AppSettings {
  theme: ThemeMode;
  language: Language;
  currency: Currency;
  notifications: {
    push: boolean;
    email: boolean;
    sms: boolean;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light', // Светлая тема по умолчанию
  language: 'ru',
  currency: 'USD', // Доллары по умолчанию
  notifications: {
    push: true,
    email: true,
    sms: false,
  },
};

class SettingsService {
  private static instance: SettingsService;
  private settings: AppSettings = DEFAULT_SETTINGS;

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      const stored = await AsyncStorage.getItem('appSettings');
      if (stored) {
        this.settings = JSON.parse(stored);
      }
      // Синхронизируем с themeManager
      await themeManager.setMode(this.settings.theme);
      return this.settings;
    } catch (error) {
      logger.error('Error loading settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(updates: Partial<AppSettings>): Promise<void> {
    try {
      this.settings = { ...this.settings, ...updates };
      await AsyncStorage.setItem('appSettings', JSON.stringify(this.settings));
      
      // Синхронизируем с themeManager если изменилась тема
      if (updates.theme) {
        await themeManager.setMode(updates.theme);
      }
    } catch (error) {
      logger.error('Error saving settings:', error);
    }
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  async setTheme(theme: ThemeMode): Promise<void> {
    await this.saveSettings({ theme });
    await themeManager.setMode(theme); // Двойная синхронизация
  }

  async setLanguage(language: Language): Promise<void> {
    await this.saveSettings({ language });
  }

  async setCurrency(currency: Currency): Promise<void> {
    await this.saveSettings({ currency });
  }

  async setNotifications(notifications: Partial<AppSettings['notifications']>): Promise<void> {
    await this.saveSettings({
      notifications: { ...this.settings.notifications, ...notifications },
    });
  }

  getCurrencySymbol(currency?: Currency): string {
    const curr = currency || this.settings.currency;
    switch (curr) {
      case 'RUB':
        return '₽';
      case 'USD':
        return '$';
      case 'EUR':
        return '€';
      default:
        return '₽';
    }
  }

  /**
   * Конвертирует цену с учетом текущей валюты пользователя
   */
  convertPriceToCurrent(price: number, fromCurrency: Currency = 'USD'): number {
    return this.convertPrice(price, fromCurrency, this.settings.currency);
  }

  /**
   * Конвертирует цену из любой валюты в целевую валюту
   */
  convertPrice(price: number, fromCurrency: Currency, toCurrency: Currency): number {
    if (fromCurrency === toCurrency) return price;

    // Актуальные курсы на 2026 год
    const ratesToUSD: Record<Currency, number> = {
      USD: 1,
      EUR: 0.85, // 1 EUR = 0.85 USD
      RUB: 0.011, // 1 RUB = 0.011 USD
    };

    // Конвертируем в USD, затем в целевую валюту
    const usdPrice = price * ratesToUSD[fromCurrency];
    const targetPrice = usdPrice / ratesToUSD[toCurrency];

    return Math.round(targetPrice);
  }

  formatPrice(price: number, currency?: Currency): string {
    const curr = currency || this.settings.currency;
    const symbol = this.getCurrencySymbol(curr);
    const converted = this.convertPrice(price, 'RUB', curr);
    return `${converted ? converted.toLocaleString() : 'По запросу'} ${symbol}`;
  }

  /** Форматирует цену тура: конвертирует из валюты тура в текущую валюту приложения */
  formatTourPrice(price: number, fromCurrency: Currency, toCurrency?: Currency): string {
    const target = toCurrency || this.settings.currency;
    const converted = this.convertPrice(price, fromCurrency, target);
    const symbol = this.getCurrencySymbol(target);
    return `${converted ? converted.toLocaleString() : '—'} ${symbol}`;
  }
}

export const settingsService = SettingsService.getInstance();