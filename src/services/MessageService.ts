import { notificationService } from './NotificationService';
import { logger } from '../utils/logger';
import type { RefObject } from 'react';

export type MessageType = 
  | 'info'           // Информационные сообщения
  | 'promotion'      // Промо-акции и предложения
  | 'booking'       // Сообщения о бронированиях
  | 'support'        // Сообщения поддержки
  | 'system'         // Системные сообщения
  | 'tour_update'    // Обновления по турам
  | 'payment'        // Сообщения об оплате (через Tourvisor)
  | 'reminder';      // Напоминания

export interface MessageSettings {
  enabled: boolean;
  sound: boolean;
  vibration: boolean;
}

class MessageService {
  private static instance: MessageService;
  private isInitialized = false;
  private navigationRef: RefObject<any> | null = null;
  private readonly SETTINGS_KEY = 'message_settings';

  static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  // Установка ссылки на навигацию для deep linking
  setNavigationRef(ref: RefObject<any>) {
    this.navigationRef = ref;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('⚠️ Сервис сообщений уже инициализирован');
      return;
    }

    try {
      this.isInitialized = true;
      logger.debug('✅ Сервис сообщений инициализирован');
    } catch (error) {
      logger.error('❌ Ошибка инициализации сервиса сообщений:', error);
    }
  }

  // ========== Настройки ==========

  async getSettings(): Promise<MessageSettings> {
    try {
      // Настройки по умолчанию
      return {
        enabled: true,
        sound: true,
        vibration: true,
      };
    } catch (error) {
      logger.error('❌ Ошибка загрузки настроек сообщений:', error);
      return {
        enabled: true,
        sound: true,
        vibration: true,
      };
    }
  }

  async updateSettings(settings: Partial<MessageSettings>): Promise<void> {
    try {
      logger.debug('✅ Настройки сообщений обновлены');
    } catch (error) {
      logger.error('❌ Ошибка сохранения настроек сообщений:', error);
    }
  }

  // ========== Отправка сообщений ==========

  /**
   * Отправка информационного сообщения
   */
  async sendInfoMessage(
    title: string,
    content: string,
    options?: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      actionUrl?: string;
      actionLabel?: string;
      tourId?: string;
      bookingId?: string;
      hotelId?: string;
      imageUrl?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<string> {
    return this.sendMessage({
      type: 'info',
      title,
      content,
      priority: options?.priority || 'normal',
      actionUrl: options?.actionUrl,
      tourId: options?.tourId,
      bookingId: options?.bookingId,
      hotelId: options?.hotelId,
      imageUrl: options?.imageUrl,
      metadata: options?.metadata,
    });
  }

  /**
   * Отправка промо-сообщения
   */
  async sendPromotionMessage(
    title: string,
    content: string,
    tourId?: string,
    imageUrl?: string
  ): Promise<string> {
    return this.sendMessage({
      type: 'promotion',
      title,
      content,
      priority: 'normal',
      tourId,
      imageUrl,
      actionUrl: tourId ? `travelhub://Home/ApiTourDetails?tourId=${tourId}` : undefined,
    });
  }

  /**
   * Отправка сообщения о бронировании
   */
  async sendBookingMessage(
    title: string,
    content: string,
    bookingId: string,
    priority: 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<string> {
    return this.sendMessage({
      type: 'booking',
      title,
      content,
      priority,
      bookingId,
      actionUrl: `travelhub://Bookings`,
    });
  }

  /**
   * Отправка сообщения поддержки
   */
  async sendSupportMessage(
    title: string,
    content: string,
    priority: 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<string> {
    return this.sendMessage({
      type: 'support',
      title,
      content,
      priority,
    });
  }

  /**
   * Отправка системного сообщения
   */
  async sendSystemMessage(
    title: string,
    content: string,
    priority: 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<string> {
    return this.sendMessage({
      type: 'system',
      title,
      content,
      priority,
    });
  }

  /**
   * Отправка сообщения об обновлении тура
   */
  async sendTourUpdateMessage(
    title: string,
    content: string,
    tourId: string,
    priority: 'normal' | 'high' = 'normal'
  ): Promise<string> {
    return this.sendMessage({
      type: 'tour_update',
      title,
      content,
      priority,
      tourId,
      actionUrl: `travelhub://Home/ApiTourDetails?tourId=${tourId}`,
    });
  }

  /**
   * Отправка сообщения об оплате
   * Примечание: Оплата происходит через Tourvisor, эта информация может быть получена из API
   */
  async sendPaymentMessage(
    title: string,
    content: string,
    bookingId: string,
    priority: 'high' | 'urgent' = 'high'
  ): Promise<string> {
    return this.sendMessage({
      type: 'payment',
      title,
      content,
      priority,
      bookingId,
      actionUrl: `travelhub://Bookings`,
    });
  }

  /**
   * Отправка напоминания
   */
  async sendReminderMessage(
    title: string,
    content: string,
    options?: {
      tourId?: string;
      bookingId?: string;
      actionUrl?: string;
      actionLabel?: string;
    }
  ): Promise<string> {
    return this.sendMessage({
      type: 'reminder',
      title,
      content,
      priority: 'normal',
      tourId: options?.tourId,
      bookingId: options?.bookingId,
      actionUrl: options?.actionUrl,
    });
  }

  /**
   * Базовый метод отправки сообщения через уведомления
   */
  private async sendMessage(messageData: {
    type: MessageType;
    title: string;
    content: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    actionUrl?: string;
    tourId?: string;
    bookingId?: string;
    hotelId?: string;
    imageUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) {
        logger.debug('⏸️ Отправка сообщений отключена в настройках');
        return '';
      }

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Отправляем уведомление, если включено
      if (messageData.priority !== 'low') {
        await notificationService.sendSystemNotification(
          messageData.title,
          messageData.content,
          {
            messageId,
            type: messageData.type,
            actionUrl: messageData.actionUrl,
            tourId: messageData.tourId,
            bookingId: messageData.bookingId,
            hotelId: messageData.hotelId,
            imageUrl: messageData.imageUrl,
            ...messageData.metadata,
          }
        );
      }

      logger.debug('✅ Сообщение отправлено:', messageId);
      return messageId;
    } catch (error) {
      logger.error('❌ Ошибка отправки сообщения:', error);
      return '';
    }
  }

  // ========== Массовая отправка ==========

  /**
   * Массовая отправка сообщений
   */
  async sendBulkMessages(
    messages: Array<{
      type: MessageType;
      title: string;
      content: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      tourId?: string;
      bookingId?: string;
      imageUrl?: string;
    }>
  ): Promise<string[]> {
    const messageIds: string[] = [];

    for (const msgData of messages) {
      const id = await this.sendMessage({
        type: msgData.type,
        title: msgData.title,
        content: msgData.content,
        priority: msgData.priority || 'normal',
        tourId: msgData.tourId,
        bookingId: msgData.bookingId,
        imageUrl: msgData.imageUrl,
      });
      if (id) {
        messageIds.push(id);
      }
      // Небольшая задержка между отправками
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return messageIds;
  }
}

// Экспорт singleton
export const messageService = MessageService.getInstance();
