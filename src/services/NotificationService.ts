import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { platform } from '../utils/platform';
import { logger } from '../utils/logger';
import { i18n } from '../config/i18n';
import type { RefObject } from 'react';


let Location: any = null;
try {
  Location = require('expo-location');
} catch (e) {
  logger.warn('⚠️ expo-location не установлен. Геолокационные функции будут недоступны.');
}

export type NotificationType = 
  | 'hot_deals' 
  | 'booking_reminder' 
  | 'promotion' 
  | 'system'
  | 'booking_status'
  | 'favorite_discount'
  | 'personalized_offer'
  | 'payment_reminder'
  | 'review_request'
  | 'weather_alert'
  | 'flight_delay'
  | 'check_in_reminder';

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  tourId?: string;
  hotelId?: string;
  bookingId?: string;
  promotionId?: string;
  scheduledTime?: Date;
  data?: any;
  imageUrl?: string;
  deepLink?: string;
  read?: boolean;
  createdAt?: Date;
}

export interface NotificationSettings {
  enabled: boolean;
  hotDeals: boolean;
  bookingReminders: boolean;
  promotions: boolean;
  /** Ежедневное напоминание о турах в 12:00 (локальное). */
  dailyHotTours: boolean;
  sound: boolean;
  vibration: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // HH:mm format
  quietHoursEnd?: string; // HH:mm format
  maxNotificationsPerDay?: number;
  geolocationEnabled?: boolean;
}

export interface NotificationHistoryItem extends NotificationData {
  notificationId: string;
  receivedAt: Date;
  clicked: boolean;
}

export interface SmartTimingData {
  lastNotificationTime?: Date;
  notificationsToday: number;
  userActiveHours: number[]; // часы активности (0-23)
}

class NotificationService {
  private static instance: NotificationService;
  private isInitialized = false;
  private handlersSetup = false;
  private handlerSet = false; // Флаг для setNotificationHandler
  private notificationHistory: NotificationHistoryItem[] = [];
  private navigationRef: RefObject<any> | null = null;
  private smartTimingData: SmartTimingData = {
    notificationsToday: 0,
    userActiveHours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], // По умолчанию активные часы
  };
  private notificationListeners: any[] = [];

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Установка ссылки на навигацию для deep linking
  setNavigationRef(ref: RefObject<any>) {
    this.navigationRef = ref;
  }

  private defaultSettings(): NotificationSettings {
    return {
      enabled: true,
      hotDeals: true,
      bookingReminders: true,
      promotions: true,
      dailyHotTours: true,
      sound: true,
      vibration: true,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      maxNotificationsPerDay: 5,
      geolocationEnabled: false,
    };
  }

  /**
   * После age-gate и consent: инициализация, обработчики кликов, планирование 12:00.
   */
  async bootstrapAfterConsent(): Promise<void> {
    await this.initialize();
    this.setupNotificationHandlers();
    await this.scheduleDailyHotToursNotification();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('⚠️ Сервис уведомлений уже инициализирован');
      return;
    }

    try {
      // SDK 53+: Android push не поддерживается в Expo Go — только в development build
      const isExpoGo = Constants.appOwnership === 'expo';
      if (platform.isAndroid && isExpoGo) {
        logger.warn(
          '⚠️ Push-уведомления на Android недоступны в Expo Go (с SDK 53). Используйте development build: npm run build:android:dev'
        );
        this.isInitialized = true;
        return;
      }

      // Проверяем, что expo-notifications доступен
      if (!Notifications || typeof Notifications.requestPermissionsAsync !== 'function') {
        logger.warn('⚠️ expo-notifications не доступен');
        return;
      }

      // Запрашиваем разрешения на уведомления
      const { status } = await Notifications.requestPermissionsAsync();

      if (status !== 'granted') {
        logger.warn('⚠️ Разрешения на уведомления не получены');
        // Продолжаем инициализацию даже без разрешений
      }

      // Настраиваем обработчик уведомлений (только один раз)
      // ВАЖНО: setNotificationHandler должен быть вызван ДО других операций
      if (!this.handlerSet && typeof Notifications.setNotificationHandler === 'function') {
        try {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldPlaySound: true,
              shouldSetBadge: false,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });
          this.handlerSet = true;
          logger.debug('✅ Обработчик уведомлений установлен');
        } catch (error: any) {
          logger.warn('⚠️ Ошибка установки обработчика уведомлений:', error?.message || error);
          // Продолжаем инициализацию даже если обработчик не установлен
        }
      }

      // Небольшая задержка перед настройкой каналов
      await new Promise(resolve => setTimeout(resolve, 100));

      // Настраиваем каналы для Android
      if (platform.isAndroid && typeof Notifications.setNotificationChannelAsync === 'function') {
        await Notifications.setNotificationChannelAsync('hot-deals', {
          name: 'Горячие предложения',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF6B6B',
        });

        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'Напоминания',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#007AFF',
        });

        await Notifications.setNotificationChannelAsync('promotions', {
          name: 'Акции и скидки',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#32D74B',
        });

        await Notifications.setNotificationChannelAsync('booking-status', {
          name: 'Статус бронирования',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#10B981',
        });

        await Notifications.setNotificationChannelAsync('favorites', {
          name: 'Избранное',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#9B59B6',
        });
      }

      // Загружаем историю уведомлений
      try {
        await this.loadNotificationHistory();
        await this.loadSmartTimingData();
      } catch (error) {
        logger.warn('⚠️ Ошибка загрузки данных уведомлений:', error);
      }

      // НЕ настраиваем обработчики кликов сразу - это может вызывать ошибку
      // Они будут настроены позже, когда приложение полностью загрузится
      // Обработчики кликов можно включить вручную через метод setupNotificationHandlers()

      this.isInitialized = true;
      logger.debug('✅ Сервис уведомлений инициализирован (без обработчиков кликов)');

    } catch (error) {
      logger.error('❌ Ошибка инициализации уведомлений:', error);
    }
  }

  async getSettings(): Promise<NotificationSettings> {
    try {
      const stored = await AsyncStorage.getItem('notificationSettings');
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<NotificationSettings>;
        return {
          ...this.defaultSettings(),
          ...parsed,
          dailyHotTours: parsed.dailyHotTours ?? true,
        };
      }

      return this.defaultSettings();
    } catch (error) {
      logger.error('❌ Ошибка загрузки настроек уведомлений:', error);
      return this.defaultSettings();
    }
  }

  async updateSettings(settings: Partial<NotificationSettings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings = { ...currentSettings, ...settings };
      await AsyncStorage.setItem('notificationSettings', JSON.stringify(updatedSettings));
      logger.debug('✅ Настройки уведомлений обновлены');

      if (
        settings.dailyHotTours !== undefined ||
        settings.enabled !== undefined ||
        settings.promotions !== undefined
      ) {
        await this.scheduleDailyHotToursNotification();
      }
    } catch (error) {
      logger.error('❌ Ошибка сохранения настроек уведомлений:', error);
    }
  }

  async sendHotDealNotification(tourTitle: string, discount: number, tourId: string): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || !settings.hotDeals) return;

      // Проверка умного времени (если включено)
      const canSend = await this.canSendNotificationNow();
      if (!canSend) {
        logger.debug('⏸️ Уведомление отложено (умное время)');
        return;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔥 Горящее предложение!',
          body: `${tourTitle} - скидка ${discount}%! Не упустите шанс!`,
          data: { 
            tourId, 
            type: 'hot_deals',
            deepLink: `travelhub://Home/ApiTourDetails?tourId=${tourId}`,
          },
          sound: settings.sound ? 'default' : undefined,
        },
        trigger: null, // Отправить немедленно
      });

      await this.incrementNotificationCounter();
      logger.debug('✅ Уведомление о горящем предложении отправлено:', notificationId);

    } catch (error) {
      logger.error('❌ Ошибка отправки уведомления о горящем предложении:', error);
    }
  }

  async scheduleBookingReminder(bookingId: string, tourTitle: string, departureDate: Date): Promise<void> {
    // Используем новый метод с множественными напоминаниями
    await this.scheduleAllBookingReminders(bookingId, tourTitle, departureDate);
  }

  /** Уведомление об акционном туре: "Скидка на тур {название}" */
  async sendPromoTourNotification(tourName: string, tourId?: string): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || !settings.promotions) return;

      const canSend = await this.canSendNotificationNow();
      if (!canSend) return;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Скидка на тур',
          body: tourName,
          data: {
            tourId: tourId || '',
            type: 'promotion',
            deepLink: tourId ? `travelhub://Home/ApiTourDetails?tourId=${tourId}` : 'travelhub://Home/ApiHotTours',
          },
          sound: settings.sound ? 'default' : undefined,
        },
        trigger: null,
      });

      await this.incrementNotificationCounter();
    } catch (error) {
      logger.error('❌ Ошибка отправки уведомления об акционном туре:', error);
    }
  }

  async sendPromotionNotification(title: string, message: string, promotionId: string): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || !settings.promotions) return;

      // Проверка умного времени
      const canSend = await this.canSendNotificationNow();
      if (!canSend) {
        logger.debug('⏸️ Уведомление отложено (умное время)');
        return;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `🎉 ${title}`,
          body: message,
          data: { 
            promotionId, 
            type: 'promotion',
            deepLink: 'travelhub://Home/ApiHotTours',
          },
          sound: settings.sound ? 'default' : undefined,
        },
        trigger: null, // Отправить немедленно
      });

      await this.incrementNotificationCounter();
      logger.debug('✅ Промо-уведомление отправлено:', notificationId);

    } catch (error) {
      logger.error('❌ Ошибка отправки промо-уведомления:', error);
    }
  }

  async sendSystemNotification(title: string, message: string, data?: any): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) return;

      // Системные уведомления всегда отправляются (критичные)
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: message,
          data: { ...data, type: 'system' },
          sound: settings.sound ? 'default' : undefined,
        },
        trigger: null, // Отправить немедленно
      });

      await this.incrementNotificationCounter();
      logger.debug('✅ Системное уведомление отправлено:', notificationId);

    } catch (error) {
      logger.error('❌ Ошибка отправки системного уведомления:', error);
    }
  }

  async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      logger.debug('✅ Уведомление отменено:', notificationId);
    } catch (error) {
      logger.error('❌ Ошибка отмены уведомления:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      logger.debug('✅ Все запланированные уведомления отменены');
    } catch (error) {
      logger.error('❌ Ошибка отмены всех уведомлений:', error);
    }
  }

  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      logger.error('❌ Ошибка получения запланированных уведомлений:', error);
      return [];
    }
  }

  // Метод для тестирования уведомлений
  async sendTestNotification(): Promise<void> {
    await this.sendSystemNotification(
      '🧪 Тестовое уведомление',
      'Это тестовое уведомление для проверки работы сервиса уведомлений.',
      { test: true }
    );
  }

  // Метод для массовой рассылки горячих предложений
  async sendBulkHotDeals(deals: Array<{ tourTitle: string; discount: number; tourId: string }>): Promise<void> {
    try {
      logger.debug(`📤 Отправка ${deals.length} горячих предложений...`);

      for (const deal of deals) {
        await this.sendHotDealNotification(deal.tourTitle, deal.discount, deal.tourId);
        // Небольшая задержка между отправками
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.debug('✅ Все горячие предложения отправлены');

    } catch (error) {
      logger.error('❌ Ошибка массовой отправки горячих предложений:', error);
    }
  }

  // ========== ФАЗА 1: Обработка кликов и Deep Linking ==========

  /**
   * Настройка обработчиков уведомлений для deep linking
   */
  private setupNotificationHandlers(): void {
    if (this.handlersSetup) {
      logger.warn('⚠️ Обработчики уведомлений уже настроены');
      return;
    }

    try {
      // Обработчик получения уведомления (когда приложение открыто)
      // Используем проверку на существование метода
      if (typeof Notifications.addNotificationReceivedListener === 'function') {
        const receivedListener = Notifications.addNotificationReceivedListener(notification => {
          logger.debug('📬 Уведомление получено:', notification);
          this.addToHistory(notification).catch(err => {
            logger.error('Ошибка добавления в историю:', err);
          });
        });
        this.notificationListeners.push(receivedListener);
      }

      // Обработчик клика по уведомлению
      // Используем проверку на существование метода
      if (typeof Notifications.addNotificationResponseReceivedListener === 'function') {
        const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
          logger.debug('👆 Клик по уведомлению:', response);
          try {
            this.handleNotificationTap(response);
          } catch (error) {
            logger.error('Ошибка обработки клика по уведомлению:', error);
          }
        });
        this.notificationListeners.push(responseListener);
      }

      this.handlersSetup = true;
      logger.debug('✅ Обработчики уведомлений настроены');
    } catch (error) {
      logger.error('❌ Ошибка настройки обработчиков уведомлений:', error);
      // Не устанавливаем флаг, чтобы можно было попробовать снова
    }
  }

  /**
   * Обработка клика по уведомлению с навигацией
   */
  private handleNotificationTap(response: Notifications.NotificationResponse): void {
    const { notification } = response;
    const data = notification.request.content.data as Record<string, unknown>;

    // Добавляем в историю как прочитанное
    this.markAsClicked(notification.request.identifier);

    // Навигация на основе типа уведомления
    if (!this.navigationRef) {
      logger.warn('⚠️ Navigation ref не установлен');
      return;
    }

    // Проверяем, что это ref объект или сам navigation объект
    const navigation = this.navigationRef.current || this.navigationRef;
    
    if (!navigation || typeof navigation.navigate !== 'function') {
      logger.warn('⚠️ Navigation не готов');
      return;
    }

    try {
      switch (data.type) {
        case 'hot_deals':
        case 'favorite_discount':
        case 'personalized_offer':
          if (data.tourId) {
            // Навигация к деталям тура
            navigation.navigate('MainTabs', {
              screen: 'Home',
              params: {
                screen: 'ApiTourDetails',
                params: { tourId: data.tourId },
              },
            });
          }
          break;

        case 'booking_reminder':
        case 'booking_status':
        case 'payment_reminder':
          navigation.navigate('MainTabs', {
            screen: 'Bookings',
            params: { screen: 'BookingsMain' },
          });
          break;

        case 'promotion':
        case 'daily_hot_tours':
          // Навигация к главной или горящим турам
          navigation.navigate('MainTabs', {
            screen: 'Home',
            params: {
              screen: 'ApiHotTours',
            },
          });
          break;

        default:
          // Используем deepLink если он есть
          if (data.deepLink && typeof data.deepLink === 'string') {
            this.handleDeepLink(data.deepLink, navigation);
          }
      }
    } catch (error) {
      logger.error('❌ Ошибка навигации по уведомлению:', error);
    }
  }

  /**
   * Обработка deep link
   */
  private handleDeepLink(deepLink: string, navigation: any): void {
    // Формат: travelhub://screen/params
    const match = deepLink.match(/travelhub:\/\/([^/]+)(?:\/(.+))?/);
    if (!match) return;

    const [, screen, paramsStr] = match;
    let params = {};

    if (paramsStr) {
      try {
        params = JSON.parse(decodeURIComponent(paramsStr));
      } catch (e) {
        logger.warn('Не удалось распарсить параметры deep link');
      }
    }

    try {
      navigation.navigate('MainTabs', {
        screen: screen,
        params,
      });
    } catch (error) {
      logger.error('❌ Ошибка обработки deep link:', error);
    }
  }

  // ========== ФАЗА 1: Расширенные напоминания о поездках ==========

  /**
   * Создание всех напоминаний о поездке
   */
  async scheduleAllBookingReminders(
    bookingId: string,
    tourTitle: string,
    departureDate: Date
  ): Promise<string[]> {
    const notificationIds: string[] = [];
    const settings = await this.getSettings();
    if (!settings.enabled || !settings.bookingReminders) return notificationIds;

    const now = new Date();
    const reminders = [
      {
        days: 7,
        title: '📋 Подготовка к поездке',
        body: `Через неделю вылет в ${tourTitle}. Начните подготовку документов!`,
        type: 'booking_reminder' as NotificationType,
      },
      {
        days: 3,
        title: '✅ Чек-лист перед поездкой',
        body: `Через 3 дня вылет в ${tourTitle}. Проверьте документы и багаж!`,
        type: 'booking_reminder' as NotificationType,
      },
      {
        days: 1,
        title: '🛫 Завтра вылет!',
        body: `Завтра вылет в ${tourTitle}. Проверьте документы и готовьтесь к путешествию!`,
        type: 'booking_reminder' as NotificationType,
      },
      {
        days: 0,
        hours: -2, // За 2 часа до вылета (если известен час)
        title: '✈️ Сегодня вылет!',
        body: `Сегодня вылет в ${tourTitle}. Удачного путешествия!`,
        type: 'booking_reminder' as NotificationType,
      },
    ];

    for (const reminder of reminders) {
      let reminderTime: Date;
      
      if (reminder.days !== undefined) {
        reminderTime = new Date(departureDate.getTime() - reminder.days * 24 * 60 * 60 * 1000);
      } else if (reminder.hours !== undefined) {
        reminderTime = new Date(departureDate.getTime() + reminder.hours * 60 * 60 * 1000);
      } else {
        continue;
      }

      if (reminderTime <= now) continue; // Пропускаем прошедшие даты

      try {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: reminder.title,
            body: reminder.body,
            data: {
              bookingId,
              tourTitle,
              type: reminder.type,
              deepLink: `travelhub://Bookings`,
            },
            sound: settings.sound ? 'default' : undefined,
          },
          trigger: { date: reminderTime } as Notifications.NotificationTriggerInput,
        });

        notificationIds.push(notificationId);
        logger.debug(`✅ Напоминание запланировано: ${reminder.title} на ${reminderTime.toLocaleString()}`);
      } catch (error) {
        logger.error(`❌ Ошибка планирования напоминания "${reminder.title}":`, error);
      }
    }

    return notificationIds;
  }

  // ========== ФАЗА 1: Уведомления о статусе бронирования ==========

  /**
   * Отправка уведомления о статусе бронирования
   */
  async sendBookingStatusNotification(
    bookingId: string,
    status: 'confirmed' | 'pending' | 'cancelled' | 'payment_required',
    tourTitle: string,
    additionalInfo?: string
  ): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) return;

      const statusMessages = {
        confirmed: {
          title: '✅ Бронирование подтверждено!',
          body: `Ваше бронирование "${tourTitle}" подтверждено. Приятного путешествия!`,
        },
        pending: {
          title: '⏳ Бронирование обрабатывается',
          body: `Ваше бронирование "${tourTitle}" находится на рассмотрении. Мы свяжемся с вами в ближайшее время.`,
        },
        cancelled: {
          title: '❌ Бронирование отменено',
          body: `Ваше бронирование "${tourTitle}" было отменено. ${additionalInfo || ''}`,
        },
        payment_required: {
          title: '💳 Требуется оплата',
          body: `Для подтверждения бронирования "${tourTitle}" требуется оплата. ${additionalInfo || ''}`,
        },
      };

      const message = statusMessages[status];
      if (!message) return;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: message.title,
          body: message.body,
          data: {
            bookingId,
            status,
            type: 'booking_status',
            deepLink: `travelhub://Bookings`,
          },
          sound: settings.sound ? 'default' : undefined,
        },
        trigger: null, // Немедленно
      });

      logger.debug('✅ Уведомление о статусе бронирования отправлено:', notificationId);
    } catch (error) {
      logger.error('❌ Ошибка отправки уведомления о статусе бронирования:', error);
    }
  }

  // ========== ФАЗА 2: Уведомления о скидках на избранное ==========

  /**
   * Отправка уведомления о скидке на избранный тур
   */
  async sendFavoriteDiscountNotification(
    tourId: string,
    tourTitle: string,
    oldPrice: number,
    newPrice: number,
    discount: number
  ): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) return;

      const savings = oldPrice - newPrice;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '💰 Скидка на избранный тур!',
          body: `${tourTitle} - скидка ${discount}%! Экономия ${savings.toLocaleString('ru-RU')} ₽`,
          data: {
            tourId,
            type: 'favorite_discount',
            oldPrice,
            newPrice,
            discount,
            deepLink: `travelhub://Home/ApiTourDetails?tourId=${tourId}`,
          },
          sound: settings.sound ? 'default' : undefined,
        },
        trigger: null,
      });

      logger.debug('✅ Уведомление о скидке на избранное отправлено:', notificationId);
    } catch (error) {
      logger.error('❌ Ошибка отправки уведомления о скидке на избранное:', error);
    }
  }

  // ========== ФАЗА 2: История уведомлений ==========

  /**
   * Добавление уведомления в историю
   */
  private async addToHistory(notification: Notifications.Notification): Promise<void> {
    try {
      const historyItem: NotificationHistoryItem = {
        id: notification.request.identifier,
        notificationId: notification.request.identifier,
        title: notification.request.content.title || '',
        body: notification.request.content.body || '',
        type: (notification.request.content.data?.type as NotificationType) || 'system',
        tourId: notification.request.content.data?.tourId as string | undefined,
        hotelId: notification.request.content.data?.hotelId as string | undefined,
        bookingId: notification.request.content.data?.bookingId as string | undefined,
        promotionId: notification.request.content.data?.promotionId as string | undefined,
        data: notification.request.content.data,
        imageUrl: notification.request.content.data?.imageUrl as string | undefined,
        deepLink: notification.request.content.data?.deepLink as string | undefined,
        read: false,
        clicked: false,
        receivedAt: new Date(),
        createdAt: new Date(),
      };

      this.notificationHistory.unshift(historyItem);

      // Ограничиваем историю 100 записями
      if (this.notificationHistory.length > 100) {
        this.notificationHistory = this.notificationHistory.slice(0, 100);
      }

      await this.saveNotificationHistory();
    } catch (error) {
      logger.error('❌ Ошибка добавления в историю:', error);
    }
  }

  /**
   * Загрузка истории уведомлений
   */
  private async loadNotificationHistory(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('notificationHistory');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.notificationHistory = parsed.map((item: any) => ({
          ...item,
          receivedAt: new Date(item.receivedAt),
          createdAt: new Date(item.createdAt),
        }));
      }
    } catch (error) {
      logger.error('❌ Ошибка загрузки истории уведомлений:', error);
    }
  }

  /**
   * Сохранение истории уведомлений
   */
  private async saveNotificationHistory(): Promise<void> {
    try {
      await AsyncStorage.setItem('notificationHistory', JSON.stringify(this.notificationHistory));
    } catch (error) {
      logger.error('❌ Ошибка сохранения истории уведомлений:', error);
    }
  }

  /**
   * Получение истории уведомлений
   */
  async getNotificationHistory(filter?: {
    type?: NotificationType;
    read?: boolean;
    search?: string;
  }): Promise<NotificationHistoryItem[]> {
    let filtered = [...this.notificationHistory];

    if (filter?.type) {
      filtered = filtered.filter(item => item.type === filter.type);
    }

    if (filter?.read !== undefined) {
      filtered = filtered.filter(item => item.read === filter.read);
    }

    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        item =>
          item.title.toLowerCase().includes(searchLower) ||
          item.body.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }

  /**
   * Отметка уведомления как прочитанного
   */
  async markAsRead(notificationId: string): Promise<void> {
    const item = this.notificationHistory.find(n => n.notificationId === notificationId);
    if (item) {
      item.read = true;
      await this.saveNotificationHistory();
    }
  }

  /**
   * Отметка уведомления как кликнутого
   */
  private async markAsClicked(notificationId: string): Promise<void> {
    const item = this.notificationHistory.find(n => n.notificationId === notificationId);
    if (item) {
      item.clicked = true;
      item.read = true;
      await this.saveNotificationHistory();
    }
  }

  /**
   * Очистка истории уведомлений
   */
  async clearNotificationHistory(): Promise<void> {
    this.notificationHistory = [];
    await AsyncStorage.removeItem('notificationHistory');
  }

  // ========== ФАЗА 2: Rich Notifications ==========

  /**
   * Отправка Rich Notification с изображением
   */
  async sendRichNotification(
    title: string,
    body: string,
    imageUrl: string,
    type: NotificationType,
    data?: any
  ): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) return;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            ...data,
            type,
            imageUrl,
          },
          sound: settings.sound ? 'default' : undefined,
          // Для iOS можно добавить attachments
        },
        trigger: null,
      });

      logger.debug('✅ Rich уведомление отправлено:', notificationId);
    } catch (error) {
      logger.error('❌ Ошибка отправки Rich уведомления:', error);
    }
  }

  // ========== ФАЗА 3: Персонализированные предложения ==========

  /**
   * Отправка персонализированного предложения
   */
  async sendPersonalizedOffer(
    tourId: string,
    tourTitle: string,
    country: string,
    reason: string // Почему это предложение релевантно
  ): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) return;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎯 Специально для вас!',
          body: `${tourTitle} в ${country}. ${reason}`,
          data: {
            tourId,
            type: 'personalized_offer',
            country,
            deepLink: `travelhub://Home/ApiTourDetails?tourId=${tourId}`,
          },
          sound: settings.sound ? 'default' : undefined,
        },
        trigger: null,
      });

      logger.debug('✅ Персонализированное предложение отправлено:', notificationId);
    } catch (error) {
      logger.error('❌ Ошибка отправки персонализированного предложения:', error);
    }
  }

  // ========== ФАЗА 3: Умное время отправки ==========

  /**
   * Проверка, можно ли отправить уведомление сейчас
   */
  private async canSendNotificationNow(): Promise<boolean> {
    const settings = await this.getSettings();
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    // Проверка тихих часов
    if (settings.quietHoursEnabled && settings.quietHoursStart && settings.quietHoursEnd) {
      const [startHour, startMin] = settings.quietHoursStart.split(':').map(Number);
      const [endHour, endMin] = settings.quietHoursEnd.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;
      const currentTimeMinutes = currentHour * 60 + currentMinute;

      if (startTime > endTime) {
        // Тихие часы переходят через полночь
        if (currentTimeMinutes >= startTime || currentTimeMinutes < endTime) {
          return false;
        }
      } else {
        if (currentTimeMinutes >= startTime && currentTimeMinutes < endTime) {
          return false;
        }
      }
    }

    // Проверка лимита уведомлений в день
    if (settings.maxNotificationsPerDay) {
      await this.updateDailyCounter();
      if (this.smartTimingData.notificationsToday >= settings.maxNotificationsPerDay) {
        return false;
      }
    }

    // Проверка активных часов пользователя
    if (this.smartTimingData.userActiveHours.length > 0) {
      if (!this.smartTimingData.userActiveHours.includes(currentHour)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Обновление счетчика уведомлений за день
   */
  private async updateDailyCounter(): Promise<void> {
    const today = new Date().toDateString();
    const lastNotificationDate = this.smartTimingData.lastNotificationTime?.toDateString();

    if (lastNotificationDate !== today) {
      this.smartTimingData.notificationsToday = 0;
      await this.saveSmartTimingData();
    }
  }

  /**
   * Увеличение счетчика уведомлений
   */
  private async incrementNotificationCounter(): Promise<void> {
    await this.updateDailyCounter();
    this.smartTimingData.notificationsToday++;
    this.smartTimingData.lastNotificationTime = new Date();
    await this.saveSmartTimingData();
  }

  /**
   * Загрузка данных умного времени
   */
  private async loadSmartTimingData(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('smartTimingData');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.smartTimingData = {
          ...parsed,
          lastNotificationTime: parsed.lastNotificationTime
            ? new Date(parsed.lastNotificationTime)
            : undefined,
        };
      }
    } catch (error) {
      logger.error('❌ Ошибка загрузки данных умного времени:', error);
    }
  }

  /**
   * Сохранение данных умного времени
   */
  private async saveSmartTimingData(): Promise<void> {
    try {
      await AsyncStorage.setItem('smartTimingData', JSON.stringify(this.smartTimingData));
    } catch (error) {
      logger.error('❌ Ошибка сохранения данных умного времени:', error);
    }
  }

  /**
   * Обновление активных часов пользователя на основе его активности
   */
  async updateUserActiveHours(hour: number): Promise<void> {
    if (!this.smartTimingData.userActiveHours.includes(hour)) {
      this.smartTimingData.userActiveHours.push(hour);
      this.smartTimingData.userActiveHours.sort((a, b) => a - b);
      await this.saveSmartTimingData();
    }
  }

  // ========== ФАЗА 3: Геолокационные уведомления ==========

  /**
   * Проверка геолокации и отправка уведомлений о турах в регионе
   */
  async checkGeolocationAndNotify(): Promise<void> {
    try {
      if (!__DEV__) {
        return;
      }
      if (!Location) {
        logger.warn('⚠️ expo-location не установлен. Установите: npm install expo-location');
        return;
      }

      const settings = await this.getSettings();
      if (!settings.enabled || !settings.geolocationEnabled) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        logger.warn('⚠️ Разрешение на геолокацию не получено');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      // Здесь можно интегрировать с API для получения туров в регионе
      // Пока заглушка
      logger.debug('📍 Геолокация получена:', latitude, longitude);
      
      // Пример: отправка уведомления о турах в регионе
      // await this.sendGeolocationNotification(latitude, longitude);

    } catch (error) {
      logger.error('❌ Ошибка проверки геолокации:', error);
    }
  }

  /**
   * Отправка геолокационного уведомления
   */
  async sendGeolocationNotification(
    tourTitle: string,
    tourId: string,
    distance: number
  ): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || !settings.geolocationEnabled) return;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📍 Рядом с вами!',
          body: `${tourTitle} находится всего в ${distance} км от вас. Посмотрите детали!`,
          data: {
            tourId,
            type: 'personalized_offer',
            geolocation: true,
            deepLink: `travelhub://Home/ApiTourDetails?tourId=${tourId}`,
          },
          sound: settings.sound ? 'default' : undefined,
        },
        trigger: null,
      });

      logger.debug('✅ Геолокационное уведомление отправлено:', notificationId);
    } catch (error) {
      logger.error('❌ Ошибка отправки геолокационного уведомления:', error);
    }
  }

  /**
   * Обновленные методы отправки с проверкой умного времени
   */
  async sendHotDealNotificationSmart(
    tourTitle: string,
    discount: number,
    tourId: string
  ): Promise<void> {
    const canSend = await this.canSendNotificationNow();
    if (!canSend) {
      logger.debug('⏸️ Уведомление отложено (умное время)');
      return;
    }

    await this.sendHotDealNotification(tourTitle, discount, tourId);
    await this.incrementNotificationCounter();
  }

  private static readonly DAILY_HOT_TOURS_ID = 'daily-hot-tours-12';

  async cancelDailyHotToursNotification(): Promise<void> {
    try {
      if (!Notifications || typeof Notifications.cancelScheduledNotificationAsync !== 'function') {
        return;
      }
      await Notifications.cancelScheduledNotificationAsync(NotificationService.DAILY_HOT_TOURS_ID);
      logger.info('[Notifications] Daily 12:00 cancelled');
    } catch (e) {
      logger.warn('cancelDailyHotToursNotification:', (e as Error)?.message);
    }
  }

  /**
   * Ежедневное локальное уведомление в 12:00 (не дублируется при перезапуске).
   */
  async scheduleDailyHotToursNotification(): Promise<void> {
    try {
      if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
        return;
      }

      const settings = await this.getSettings();
      if (!settings.enabled || !settings.dailyHotTours) {
        await this.cancelDailyHotToursNotification();
        return;
      }

      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const r = await Notifications.requestPermissionsAsync();
        status = r.status;
      }
      if (status !== 'granted') {
        logger.warn('[Notifications] Daily 12:00 — permission not granted');
        return;
      }

      try {
        await Notifications.cancelScheduledNotificationAsync(
          NotificationService.DAILY_HOT_TOURS_ID,
        );
      } catch {
        /* первый запуск */
      }

      await Notifications.scheduleNotificationAsync({
        identifier: NotificationService.DAILY_HOT_TOURS_ID,
        content: {
          title: i18n.t('notification.dailyHotToursTitle'),
          body: i18n.t('notification.dailyHotToursBody'),
          sound: true,
          data: { type: 'daily_hot_tours' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 12,
          minute: 0,
        },
      });
      logger.info('[Notifications] Daily hot tours scheduled at 12:00');
    } catch (e) {
      logger.warn('scheduleDailyHotToursNotification:', (e as Error)?.message);
    }
  }

  /**
   * Локальное уведомление после успешного создания бронирования.
   */
  async notifyBookingThankYou(): Promise<void> {
    try {
      if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
        return;
      }
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('notification.bookingThankTitle'),
          body: i18n.t('notification.bookingThankBody'),
        },
        trigger: null,
      });
    } catch (e) {
      logger.warn('notifyBookingThankYou:', (e as Error)?.message);
    }
  }

  /**
   * Очистка слушателей при уничтожении сервиса
   */
  cleanup(): void {
    try {
      this.notificationListeners.forEach(listener => {
        try {
          if (listener && typeof listener.remove === 'function') {
            listener.remove();
          }
        } catch (error) {
          logger.warn('Ошибка удаления слушателя:', error);
        }
      });
      this.notificationListeners = [];
      this.handlersSetup = false;
    } catch (error) {
      logger.error('Ошибка очистки слушателей:', error);
    }
  }
}

// Простой singleton экспорт (без Proxy для избежания проблем)
export const notificationService = NotificationService.getInstance();