import { logger } from '../utils/logger';
import Constants from 'expo-constants';
import {
  getCrmBackendBaseUrl,
  fetchUserDepartureDocumentsViaBackend,
  fetchClientBookingsViaBackend,
} from './crm/CrmBackendClient';
import { 
  SotaBooking, 
  DepartureDocument, 
  SotaApiResponse,
  SotaWebHookPayload,
  FileAttachedWebHook,
  TouristNotificationWebHook,
  RequestCreatedWebHook,
  BonusTransaction
} from '../types';

/**
 * Сервис для работы с системой SOTA (U-ON.Travel).
 * Документация API: https://api.u-on.ru/doc
 * — Обращение только по HTTPS, не более 10 запросов/сек.
 * — API-ключ передаётся в пути: https://api.u-on.ru/{key}/...
 * — В настройках системы: Настройки → Интеграции → API — активировать API (GET/POST).
 */
class SotaCrmService {
  private static instance: SotaCrmService;
  /** Базовый URL официального API U-ON (ключ подставляется в путь). */
  private baseUrl: string = 'https://api.u-on.ru';
  private apiKey: string | null = null;
  private apiToken: string | null = null;
  private username: string | null = null;
  private password: string | null = null;
  private isAuthenticated: boolean = false;
  private lastRequestTime: number = 0;
  private readonly RATE_LIMIT_MS = 100;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  private constructor() {
    this.loadCredentials();
  }

  static getInstance(): SotaCrmService {
    if (!SotaCrmService.instance) {
      SotaCrmService.instance = new SotaCrmService();
    }
    return SotaCrmService.instance;
  }

  /**
   * Загружает учетные данные только из защищенной конфигурации сборки (extra / env).
   * Локальное персистентное хранение секретов на устройстве запрещено.
   */
  private static maskSecretForLog(value: string): string {
    const s = String(value || '');
    if (!s) return '(empty)';
    if (s.length <= 6) return `***len=${s.length}***`;
    return `${s.slice(0, 3)}…${s.slice(-2)} (len=${s.length})`;
  }

  private async loadCredentials(): Promise<void> {
    try {
      const extra = Constants.expoConfig?.extra || {};
      const envApiKey =
        typeof extra.uonApiKey === 'string'
          ? extra.uonApiKey.trim()
          : typeof (extra as { sotaUonApiKey?: string }).sotaUonApiKey === 'string'
            ? (extra as { sotaUonApiKey: string }).sotaUonApiKey.trim()
            : '';
      const envApiToken = extra.sotaApiToken;
      const envUsername = extra.sotaUsername;
      const envPassword = extra.sotaPassword;
      if (envApiKey) {
        this.apiKey = envApiKey;
      }
      if (envApiToken) {
        this.apiToken = envApiToken;
      }
      if (envUsername) {
        this.username = envUsername;
      }
      if (envPassword) {
        this.password = envPassword;
      }

      logger.debug(
        '[SOTA] Credentials loaded — U-ON path key:',
        this.apiKey ? SotaCrmService.maskSecretForLog(this.apiKey) : 'not set (use EXPO_PUBLIC_UON_API_KEY or CRM proxy)',
        '| token:',
        this.apiToken ? 'yes' : 'no',
        '| user/pass:',
        this.username && this.password ? 'yes' : 'no',
      );
    } catch (error) {
      logger.error('[SOTA] Error loading credentials:', error);
    }
  }

  /**
   * Установка учетных данных для API
   */
  async setCredentials(
    apiKey?: string,
    apiToken?: string,
    username?: string,
    password?: string
  ): Promise<void> {
    if (apiKey) {
      this.apiKey = apiKey;
    }
    if (apiToken) {
      this.apiToken = apiToken;
    }
    if (username) {
      this.username = username;
    }
    if (password) {
      this.password = password;
    }
    logger.debug('[SOTA] Credentials updated (memory only)');
  }

  /**
   * Установка базового URL (для тестирования или другого сервера)
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
    logger.debug(`[SOTA] Base URL set to: ${url}`);
  }

  /**
   * Проверка наличия учетных данных
   */
  hasCredentials(): boolean {
    if (getCrmBackendBaseUrl()) return true;
    return this.hasDirectUonCredentials();
  }

  /** Ключ или логин/пароль для прямых запросов к api.u-on.ru (без серверного прокси). */
  hasDirectUonCredentials(): boolean {
    return !!(this.apiKey || (this.username && this.password));
  }

  /**
   * Ограничение частоты запросов (не более 10 запросов в секунду)
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
      const waitTime = this.RATE_LIMIT_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Формирование URL для U-ON API: ключ передаётся в пути (https://api.u-on.ru/{key}/...).
   */
  private getApiUrl(endpoint: string): string {
    const key = this.apiKey || '';
    const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return `${this.baseUrl}/${key}/${path}`;
  }

  /**
   * Заголовки для запросов. По документации U-ON ключ передаётся только в URL, не в заголовках.
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }
    return headers;
  }

  /**
   * Выполнение одного запроса (без retry)
   */
  private async executeRequest<T>(
    endpoint: string,
    options: RequestInit
  ): Promise<SotaApiResponse<T>> {
    await this.rateLimit();

    if (!this.hasDirectUonCredentials()) {
      const errorMsg =
        'SOTA: нет ключа API или логина U-ON для прямого запроса. Задайте SOTA_CRM_BASE_URL на сервер с /api/crm/submit-booking или EXPO_PUBLIC_UON_API_KEY (dev).';
      logger.error('[SOTA] ❌ Отправка данных невозможна:', errorMsg);
      return { success: false, error: errorMsg };
    }

    const url = this.getApiUrl(endpoint);
    const method = options.method || 'GET';
    const config: RequestInit = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    };

    // Логируем отправку данных
    const isDataSending = ['POST', 'PUT', 'PATCH'].includes(method);
    if (isDataSending) {
      logger.log(`[SOTA] 📤 Отправка данных в SOTA: ${method} ${url}`);
      if (options.body) {
        try {
          const bodyData = typeof options.body === 'string' 
            ? JSON.parse(options.body) 
            : options.body;
          // Логируем данные без чувствительной информации
          const sanitizedBody = this.sanitizeLogData(bodyData);
          logger.log(`[SOTA] 📤 Данные для отправки:`, JSON.stringify(sanitizedBody, null, 2));
        } catch (e) {
          logger.log(`[SOTA] 📤 Данные для отправки (не JSON):`, options.body);
        }
      }
    } else {
      logger.debug(`[SOTA] Запрос: ${method} ${url}`);
    }

    try {
      const response = await fetch(url, config);
      
      if (isDataSending) {
        logger.log(`[SOTA] 📥 Ответ от SOTA: ${response.status} ${response.statusText}`);
      } else {
        logger.debug(`[SOTA] Response status: ${response.status} ${response.statusText}`);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const isHtml = typeof errorText === 'string' && (errorText.trimStart().startsWith('<!') || errorText.includes('</html>'));
        if (isHtml) {
          logger.warn(`[SOTA] ❌ Сервис вернул ${response.status} (страница не найдена). Endpoint: ${method} ${endpoint}. Укажите правильный baseUrl или путь API в настройках.`);
        } else {
          logger.error(`[SOTA] ❌ Ошибка ответа от сервиса (${response.status}):`, errorText.length > 200 ? errorText.slice(0, 200) + '…' : errorText);
        }

        let errorMessage = `Сервис: ${response.status} ${response.statusText}`;
        if (response.status === 404) {
          errorMessage = 'Служба недоступна (404). Проверьте baseUrl и путь API.';
        } else if (!isHtml) {
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
          } catch {
            if (errorText && errorText.length <= 200) errorMessage = errorText;
          }
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      const contentType = response.headers.get('content-type');
      let data: T;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Если ответ не JSON, пытаемся распарсить как текст
        const text = await response.text();
        try {
          data = JSON.parse(text) as T;
        } catch {
          // Если не удалось распарсить, возвращаем текст как есть
          data = text as unknown as T;
        }
      }

      if (isDataSending) {
        logger.log(`[SOTA] ✅ Запрос выполнен, ответ получен`);
        if (data && typeof data === 'object') {
          const sanitizedResponse = this.sanitizeLogData(data);
          logger.log(`[SOTA] 📥 Тело ответа (данные обратно):`, JSON.stringify(sanitizedResponse, null, 2));
        }
      }

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      if (isDataSending) {
        logger.error('[SOTA] ❌ Ошибка отправки данных:', error);
      } else {
        logger.error('[SOTA] Request failed:', error);
      }
      return {
        success: false,
        error: error.message || 'Network error',
      };
    }
  }

  /**
   * Базовый метод с retry при 5xx и сетевых ошибках
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<SotaApiResponse<T>> {
    let lastError: string | null = null;
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      const result = await this.executeRequest<T>(endpoint, options);
      if (result.success) return result;
      lastError = result.error || null;
      const isRetryable =
        lastError?.includes('Network error') ||
        lastError?.includes('500') ||
        lastError?.includes('502') ||
        lastError?.includes('503') ||
        lastError?.includes('timeout');
      if (!isRetryable || attempt === this.MAX_RETRIES - 1) {
        return result;
      }
      const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt);
      logger.debug(`[SOTA] Retry ${attempt + 1}/${this.MAX_RETRIES} in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
    return { success: false, error: lastError || 'Request failed after retries' };
  }

  /**
   * Очистка чувствительных данных из логов
   */
  private sanitizeLogData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = ['password', 'token', 'apiKey', 'apiToken', 'secret', 'authorization'];
    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const key in sanitized) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        sanitized[key] = '***HIDDEN***';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeLogData(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * В U-ON.Travel аутентификация — по API-ключу в URL. Логин/пароль в API не описаны.
   * Метод оставлен для совместимости; при использовании только API-ключа проверка не требуется.
   */
  async authenticate(): Promise<boolean> {
    if (this.apiKey) {
      this.isAuthenticated = true;
      return true;
    }
    if (!this.username || !this.password) {
      logger.warn('[SOTA] ⚠️ Для U-ON API нужен API-ключ (в настройках системы: Интеграции → API)');
      return false;
    }
    logger.warn('[SOTA] ⚠️ U-ON API использует ключ в URL; логин/пароль могут не поддерживаться');
    this.isAuthenticated = false;
    return false;
  }

  /**
   * Отправка данных бронирования в SOTA (U-ON: создание заявки request/create).
   * Вызывается после сохранения в Firestore. Документация: https://api.u-on.ru/doc
   */
  /** Нормализация телефона для API: только цифры и + */
  private normalizePhone(phone: string): string {
    const s = (phone || '').trim().replace(/\s/g, '');
    if (!s) return '';
    if (/^\+?[1-9]\d{1,14}$/.test(s)) return s.startsWith('+') ? s : `+${s}`;
    if (/^8\d{10}$/.test(s)) return '+7' + s.slice(1);
    return s;
  }

  async sendBookingToCrm(payload: {
    /**
     * Стабильный внутренний ID заявки (U-ON: r_id_internal).
     * Должен совпадать при повторных попытках — защита от дублей в CRM.
     */
    idempotencyKey: string;
    /** Устаревшее имя для логов; если не задано — в лог идёт idempotencyKey */
    firestoreBookingId?: string;
    userId: string;
    tourId?: string;
    hotelId?: string;
    type: 'tour' | 'hotel';
    /** Город вылета (вводится пользователем) */
    departureCity: string;
    startDate: string;
    endDate: string;
    nights: number;
    totalPrice: number;
    currency: string;
    participants: number;
    party: { adults: number; childrenAges: number[] };
    /** Туроператор (вводится пользователем; для тура обязателен) */
    tourOperator?: string;
    contactInfo: { name: string; phone: string; email: string };
    specialRequests?: string;
    tourSnapshot?: {
      hotelName: string;
      countryName?: string;
      hotelImage?: string;
      regionName?: string;
      subRegionName?: string;
      nights: number;
      currency: string;
      operatorName?: string;
      tourPackageUrl?: string;
    };
    paymentStatus?: 'pending' | 'paid';
  }): Promise<SotaApiResponse<{ id?: string; requestId?: string; bookingNumber?: string }>> {
    await this.loadCredentials();
    if (!this.hasDirectUonCredentials()) {
      logger.warn('[SOTA] ⚠️ Отправка в систему пропущена: нет ключа U-ON в приложении (нужен прокси или ключ)');
      return { success: false, error: 'Учётные данные не настроены' };
    }

    const phone = this.normalizePhone(payload.contactInfo.phone || '');
    const email = (payload.contactInfo.email || '').trim();
    if (!phone && !email) {
      logger.warn('[SOTA] ⚠️ Для создания заявки нужен телефон или email клиента');
      return { success: false, error: 'Для создания заявки нужен телефон или email клиента' };
    }

    logger.log('[SOTA] 📤 Данные поступают в SOTA (U-ON request/create):', {
      idempotencyKey: payload.idempotencyKey,
      firestoreBookingId: payload.firestoreBookingId ?? payload.idempotencyKey,
      contact: `${payload.contactInfo.name}, ${payload.contactInfo.email}, ${payload.contactInfo.phone}`,
      hotel: payload.tourSnapshot?.hotelName || payload.hotelId || '—',
      totalPrice: `${payload.totalPrice} ${payload.currency}`,
      type: payload.type,
    });

    const nameParts = (payload.contactInfo.name || '').trim().split(/\s+/);
    const uName = nameParts[0] || '';
    const uSurname = nameParts.slice(1).join(' ') || '';

    const isHotel = payload.type === 'hotel';
    const nights = Number(payload.nights) || payload.tourSnapshot?.nights || 0;
    const adults = Math.max(0, Number(payload.party?.adults || 0));
    const childrenAges = Array.isArray(payload.party?.childrenAges) ? payload.party.childrenAges : [];
    const childrenCount = childrenAges.length;
    const partyText =
      childrenCount > 0
        ? `${adults} взр., ${childrenCount} дет. (${childrenAges.join(', ')})`
        : `${adults} взр., 0 дет.`;

    const tourOperator = (payload.tourOperator || payload.tourSnapshot?.operatorName || '').trim();

    const serviceDescription = isHotel
      ? [
          'Отель:',
          payload.tourSnapshot?.hotelName,
          payload.tourSnapshot?.regionName,
          nights ? `${nights} н.` : undefined,
        ].filter(Boolean).join(' ')
      : [
          payload.tourSnapshot?.hotelName,
          payload.tourSnapshot?.regionName,
          nights ? `${nights} н.` : undefined,
        ].filter(Boolean).join(', ') || 'Тур';

    const noteLines: string[] = [];
    if (payload.departureCity?.trim()) noteLines.push(`Город вылета: ${payload.departureCity.trim()}`);
    if (nights) noteLines.push(`Ночей: ${nights}`);
    noteLines.push(`Состав: ${partyText}`);
    if (tourOperator) noteLines.push(`Туроператор: ${tourOperator}`);
    if (payload.tourSnapshot?.hotelName) noteLines.push(`Отель: ${payload.tourSnapshot.hotelName}`);
    if (payload.tourSnapshot?.countryName) noteLines.push(`Страна: ${payload.tourSnapshot.countryName}`);
    if (payload.tourSnapshot?.regionName) noteLines.push(`Регион: ${payload.tourSnapshot.regionName}`);
    if (payload.specialRequests?.trim()) noteLines.push(`Комментарий: ${payload.specialRequests.trim()}`);
    if (payload.tourSnapshot?.tourPackageUrl) {
      noteLines.push(`Ссылка на тур (Tourvisor): ${payload.tourSnapshot.tourPackageUrl}`);
    }
    const note = noteLines.filter(Boolean).join('\n');

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const toDatetime = (s: string | undefined): string => {
      if (!s || typeof s !== 'string') return now;
      const trimmed = s.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed} 00:00:00`;
      const ddmmyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (ddmmyy) {
        const [, d, m, y] = ddmmyy;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} 00:00:00`;
      }
      return now;
    };
    const rDatBegin = toDatetime(payload.startDate);
    const rDatEnd = toDatetime(payload.endDate);

    const body: Record<string, unknown> = {
      r_id_internal: payload.idempotencyKey,
      r_dat: now,
      r_dat_lead: now,
      r_dat_begin: rDatBegin,
      r_dat_end: rDatEnd,
      source: isHotel ? 'TravelHub App (Отель)' : 'TravelHub App',
      ...(tourOperator && { r_tour_operator: tourOperator }),
      ...(payload.tourSnapshot?.tourPackageUrl && { r_tour_operator_link: payload.tourSnapshot.tourPackageUrl }),
      u_name: uName,
      u_surname: uSurname,
      u_phone: phone || undefined,
      u_phone_mobile: phone || undefined,
      u_email: email || undefined,
      note,
      price: String(payload.totalPrice),
      services: [
        {
          type_id: 1,
          description: [
            serviceDescription,
            payload.departureCity?.trim() ? `Вылет: ${payload.departureCity.trim()}` : undefined,
            nights ? `Ночей: ${nights}` : undefined,
            `Состав: ${partyText}`,
            tourOperator ? `Туроператор: ${tourOperator}` : undefined,
          ].filter(Boolean).join(' | '),
          date_begin: rDatBegin,
          date_end: rDatEnd,
          price: payload.totalPrice,
          ...(payload.tourSnapshot?.countryName && { country: payload.tourSnapshot.countryName }),
          ...(payload.tourSnapshot?.hotelName && { hotel: payload.tourSnapshot.hotelName }),
        },
      ],
    };

    const response = await this.request<{ id?: string; id_system?: string; id_internal?: string }>(
      'request/create.json',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    if (response.success && response.data) {
      const id = response.data.id ?? response.data.id_system;
      logger.log('[SOTA] 📥 Ответ получен (данные отправлены обратно):', {
        success: true,
        requestId: id ?? '—',
        id_internal: response.data.id_internal ?? '—',
        rawResponse: this.sanitizeLogData(response.data),
      });
      return {
        success: true,
        data: {
          id,
          requestId: id,
          bookingNumber: response.data.id_internal ?? id,
        },
      };
    }

    logger.warn('[SOTA] 📥 Ответ от SOTA: данные не приняты или ошибка:', {
      success: false,
      error: response.error,
    });
    return response as SotaApiResponse<{ id?: string; requestId?: string; bookingNumber?: string }>;
  }

  /**
   * Получение списка бронирований из SOTA (U-ON: поиск клиента по email/телефону, затем request-by-client).
   */
  async getBookings(params?: {
    clientEmail?: string;
    clientPhone?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<SotaApiResponse<SotaBooking[]>> {
    if (getCrmBackendBaseUrl()) {
      const r = await fetchClientBookingsViaBackend(params?.clientEmail, params?.clientPhone);
      if (r.success && Array.isArray(r.data)) {
        return { success: true, data: r.data as SotaBooking[] };
      }
      if (r.error && r.error !== 'no_backend') {
        return { success: false, error: r.error, data: [] };
      }
    }

    logger.log('[SOTA] 📥 Запрос списка бронирований (U-ON)');
    if (params) {
      logger.debug('[SOTA] Параметры запроса:', {
        hasEmail: !!params.clientEmail,
        hasPhone: !!params.clientPhone,
        startDate: params.startDate,
        endDate: params.endDate,
        status: params.status,
      });
    }

    if (!params?.clientEmail && !params?.clientPhone) {
      logger.warn('[SOTA] Для getBookings нужен clientEmail или clientPhone');
      return { success: false, error: 'Укажите email или телефон клиента' };
    }

    let clientId: string | number | null = null;

    if (params.clientEmail) {
      const emailRes = await this.request<{ id?: number }>('user/email.json', {
        method: 'POST',
        body: JSON.stringify({ email: params.clientEmail }),
      });
      if (emailRes.success && emailRes.data?.id) {
        clientId = emailRes.data.id;
      }
    }
    if (clientId == null && params.clientPhone) {
      const phone = String(params.clientPhone).replace(/\D/g, '');
      const phoneRes = await this.request<{ id?: number }>(`user/phone/${encodeURIComponent(phone)}.json`, {
        method: 'GET',
      });
      if (phoneRes.success && phoneRes.data?.id) {
        clientId = phoneRes.data.id;
      }
    }

    if (clientId == null) {
      logger.warn('[SOTA] Клиент не найден по email/телефону');
      return { success: true, data: [] };
    }

    const response = await this.request<unknown[]>(`request-by-client/${clientId}/1.json`, { method: 'GET' });
    if (!response.success) {
      logger.error('[SOTA] ❌ Не удалось получить бронирования для пользователя:', response.error);
      return { success: false, error: response.error, data: [] };
    }

    const list = Array.isArray(response.data) ? response.data : [];
    const bookings: SotaBooking[] = list.map((item: any) => this.mapUonRequestToBooking(item));
    logger.log(`[SOTA] ✅ Получено бронирований: ${bookings.length}`);
    return { success: true, data: bookings };
  }

  private mapUonRequestToBooking(r: any): SotaBooking {
    return {
      id: String(r.id ?? r.id_system ?? ''),
      bookingNumber: r.id_internal ?? r.id_system ?? String(r.id ?? ''),
      clientName: [r.client_surname, r.client_name, r.client_sname].filter(Boolean).join(' ') || '—',
      clientPhone: r.client_phone ?? r.client_phone_mobile ?? '',
      clientEmail: r.client_email ?? '',
      tourName: r.services?.[0]?.hotel ?? r.services?.[0]?.description ?? '—',
      departureDate: r.date_begin ?? '',
      returnDate: r.date_end ?? '',
      participants: 0,
      status: r.status ?? '—',
      totalPrice: r.calc_price ?? 0,
      currency: r.services?.[0]?.currency ?? 'RUB',
      documents: [],
      createdAt: r.dat ?? r.created_at ?? '',
      updatedAt: r.dat_updated ?? '',
    };
  }

  /**
   * Получение заявки по ID (U-ON: GET request/{id}.json).
   */
  async getBookingById(bookingId: string): Promise<SotaApiResponse<SotaBooking>> {
    logger.log(`[SOTA] 📥 Запрос бронирования по ID: ${bookingId}`);
    const response = await this.request<any>(`request/${bookingId}.json`, { method: 'GET' });

    if (response.success && response.data) {
      logger.log(`[SOTA] ✅ Бронирование получено: ${bookingId}`);
      return {
        success: true,
        data: this.mapUonRequestToBooking(response.data),
      };
    }
    logger.error(`[SOTA] ❌ Не удалось получить бронирование (ID: ${bookingId}):`, response.error);
    return { success: false, error: response.error };
  }

  /**
   * Получение документов на вылет для бронирования (U-ON: файлы из GET request/{id}.json).
   */
  async getDepartureDocuments(bookingId: string): Promise<SotaApiResponse<DepartureDocument[]>> {
    logger.log(`[SOTA] 📥 Запрос документов на вылет для бронирования: ${bookingId}`);
    const requestResponse = await this.request<any>(`request/${bookingId}.json`, { method: 'GET' });

    if (!requestResponse.success || !requestResponse.data) {
      logger.error(`[SOTA] ❌ Не удалось получить данные заявки (ID: ${bookingId}):`, requestResponse.error);
      return {
        success: false,
        error: requestResponse.error || 'Failed to fetch request data',
      };
    }

    const files = requestResponse.data.files || [];
    logger.log(`[SOTA] 📄 Найдено файлов в заявке: ${files.length}`);
    const documents: DepartureDocument[] = files.map((file: any, index: number) => {
      const fileUrl = this.extractFileUrl(file);
      return {
        id: String(file.id ?? file.file_id ?? `file_${index}`),
        bookingId,
        documentType: this.detectDocumentType(file.name || file.file_name || file.filename || ''),
        fileName: file.name || file.file_name || file.filename || `document_${index}`,
        fileUrl,
        mimeType: file.mime_type || file.type || file.mime || 'application/pdf',
        fileSize: file.size || file.file_size || 0,
        uploadedAt: file.date || file.created_at || file.uploaded_at || new Date().toISOString(),
        description: file.description || file.file_note || file.note || '',
      };
    });

    logger.log(`[SOTA] ✅ Получено документов на вылет: ${documents.length}`);
    return { success: true, data: documents };
  }

  /**
   * Извлечение URL файла из ответа U-ON (поддержка разных имён полей).
   */
  private extractFileUrl(file: any): string {
    return file.url || file.link || file.file_url || file.file_link || file.src || file.path || '';
  }

  /**
   * Определение типа документа по имени файла
   */
  private detectDocumentType(fileName: string): 'voucher' | 'ticket' | 'insurance' | 'visa' | 'other' {
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('ваучер') || lowerName.includes('voucher')) return 'voucher';
    if (lowerName.includes('билет') || lowerName.includes('ticket') || lowerName.includes('авиа') || lowerName.includes('avia')) return 'ticket';
    if (lowerName.includes('страхов') || lowerName.includes('insurance')) return 'insurance';
    if (lowerName.includes('виза') || lowerName.includes('visa')) return 'visa';
    if (lowerName.includes('паспорт') || lowerName.includes('passport')) return 'other';
    return 'other';
  }

  /**
   * Получение файла по ID (U-ON: заявка request/{id}.json, файл ищется в массиве files).
   */
  async getFileById(fileId: string, requestId: string): Promise<SotaApiResponse<DepartureDocument>> {
    const reqResponse = await this.request<any>(`request/${requestId}.json`, { method: 'GET' });
    if (!reqResponse.success || !reqResponse.data) {
      return { success: false, error: reqResponse.error || 'Failed to fetch request' };
    }
    const files = reqResponse.data.files || [];
    const file = files.find((f: any) => String(f.id ?? f.file_id) === String(fileId));
    if (!file) {
      return { success: false, error: 'File not found in request' };
    }
    const document: DepartureDocument = {
      id: String(file.id ?? file.file_id ?? fileId),
      bookingId: requestId,
      documentType: this.detectDocumentType(file.name || file.file_name || file.filename || ''),
      fileName: file.name || file.file_name || file.filename || 'document',
      fileUrl: this.extractFileUrl(file),
      mimeType: file.mime_type || file.type || 'application/pdf',
      fileSize: file.size || 0,
      uploadedAt: file.date || file.created_at || new Date().toISOString(),
      description: file.description || file.file_note || '',
    };
    return { success: true, data: document };
  }

  /**
   * Добавление документа (файла) в заявку (U-ON: request-file/create).
   * Документ должен быть размещён по публичному URL. Менеджер или турист увидит его в системе.
   * @param requestId ID заявки (r_id)
   * @param fileName Название файла
   * @param fileUrl Публичная ссылка на файл (https://...)
   * @param fileNote Примечание к файлу (опционально)
   * @param isPrivate =1 если файл приватный (недоступен туристу в ЛК)
   */
  async attachFileToRequest(
    requestId: string,
    fileName: string,
    fileUrl: string,
    fileNote?: string,
    isPrivate?: boolean
  ): Promise<SotaApiResponse<{ id?: number }>> {
    if (!this.hasCredentials()) {
      return { success: false, error: 'Учётные данные не настроены' };
    }
    const body: Record<string, unknown> = {
      r_id: Number(requestId) || requestId,
      file_name: fileName,
      file_url: fileUrl,
    };
    if (fileNote) body.file_note = fileNote;
    if (isPrivate) body.file_is_private = 1;

    const response = await this.request<{ id?: number }>('request-file/create.json', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (response.success) {
      logger.log(`[SOTA] ✅ Документ добавлен в заявку ${requestId}:`, fileName);
    }
    return response;
  }

  /**
   * Получение списка статусов оплаты (U-ON: GET status_pay).
   * Нужно для установки статуса «Оплачен» в заявке.
   */
  async getStatusPayList(): Promise<SotaApiResponse<Array<{ id: number; name: string }>>> {
    await this.loadCredentials();
    if (!this.hasCredentials()) {
      return { success: false, error: 'Учётные данные не настроены' };
    }
    const response = await this.request<Array<{ id: number; name: string }> | { row?: Array<{ id: number; name: string }>; rows?: Array<{ id: number; name: string }> }>(
      'status_pay.json',
      { method: 'GET' }
    );
    if (!response.success) {
      return { success: false, error: response.error };
    }
    const raw = response.data;
    let list: Array<{ id: number; name: string }> = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (Array.isArray(r.rows)) list = r.rows;
      else if (Array.isArray(r.row)) list = r.row;
    }
    return { success: true, data: list };
  }

  /**
   * Обновление статуса оплаты заявки в SOTA (U-ON: request/update с status_pay_id).
   * После успешной оплаты вызывать с id статуса «Оплачен», чтобы заявка отображалась как оплаченная.
   */
  async updateRequestPaymentStatus(
    requestId: string | number,
    statusPayId: number
  ): Promise<SotaApiResponse<unknown>> {
    await this.loadCredentials();
    if (!this.hasCredentials()) {
      return { success: false, error: 'Учётные данные не настроены' };
    }
    const id = typeof requestId === 'string' ? requestId.replace(/\D/g, '') || requestId : String(requestId);
    if (!id) {
      return { success: false, error: 'Некорректный ID заявки' };
    }
    const body = { status_pay_id: statusPayId };
    logger.log('[SOTA] 📤 Обновление статуса оплаты заявки:', id, 'status_pay_id:', statusPayId);
    const response = await this.request<unknown>(`request/update/${id}.json`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (response.success) {
      logger.log('[SOTA] ✅ Статус оплаты заявки обновлён:', id);
    } else {
      logger.warn('[SOTA] ⚠️ Не удалось обновить статус оплаты:', response.error);
    }
    return response;
  }

  /**
   * Создание платежа «приход от клиента» по заявке (U-ON: payment/create).
   * Фиксирует оплату в SOTA и обычно приводит к смене статуса оплаты заявки на «Оплачен».
   */
  async createClientPayment(params: {
    requestId: string | number;
    clientId: number;
    amount: number;
    currency?: string;
    reason?: string;
  }): Promise<SotaApiResponse<{ id?: number }>> {
    await this.loadCredentials();
    if (!this.hasCredentials()) {
      return { success: false, error: 'Учётные данные не настроены' };
    }
    const id = typeof params.requestId === 'string' ? params.requestId.replace(/\D/g, '') || params.requestId : String(params.requestId);
    if (!id) {
      return { success: false, error: 'Некорректный ID заявки' };
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const body: Record<string, unknown> = {
      r_id: Number(id) || id,
      type_id: 1,
      cio_id: 1,
      client_id: params.clientId,
      price: params.amount,
      date: now,
      reason: params.reason || 'Оплата через приложение TravelHub',
      note: `Оплата через приложение TravelHub. ${now}`,
    };
    logger.log('[SOTA] 📤 Создание платежа по заявке:', id, 'client_id:', params.clientId, 'amount:', params.amount);
    const response = await this.request<{ id?: number }>('payment/create.json', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (response.success) {
      logger.log('[SOTA] ✅ Платёж по заявке создан:', id);
    } else {
      logger.warn('[SOTA] ⚠️ Не удалось создать платёж:', response.error);
    }
    return response;
  }

  /**
   * Уведомление об оплате бронирования (U-ON: request-action/create).
   * Добавляет касание в заявку с текстом «Оплачено» — менеджеры видят в истории.
   */
  async notifyBookingPaid(
    sotaBookingId: string,
    amount: number,
    currency: string
  ): Promise<SotaApiResponse<{ id?: number }>> {
    await this.loadCredentials();
    if (!this.hasCredentials()) {
      logger.warn('[SOTA] ⚠️ Учётные данные не настроены, уведомление об оплате пропущено');
      return { success: false, error: 'Учётные данные не настроены' };
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const amountStr = `${amount.toLocaleString('ru-RU')} ${currency}`;
    const text = `✓ ОПЛАЧЕНО через приложение TravelHub. Сумма: ${amountStr}. Дата: ${now}`;
    const body = {
      r_id: Number(sotaBookingId) || sotaBookingId,
      type_id: 0,
      datetime: now,
      text,
    };
    logger.log('[SOTA] 📤 Отправка уведомления об оплате в заявку:', sotaBookingId);
    const response = await this.request<{ id?: number }>('request-action/create.json', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (response.success) {
      logger.log('[SOTA] ✅ Уведомление об оплате отправлено:', sotaBookingId);
    } else {
      logger.warn('[SOTA] ⚠️ Не удалось отправить уведомление об оплате:', response.error);
    }
    return response;
  }

  /**
   * Обработка WebHook события "Прикрепление файла в заявке" (type_id = 20)
   */
  async handleFileAttachedWebHook(webhook: FileAttachedWebHook): Promise<SotaApiResponse<DepartureDocument>> {
    logger.debug('[SOTA] Processing file attached webhook:', webhook);
    return this.getFileById(webhook.file_id, webhook.r_id);
  }

  /**
   * Обработка WebHook события "Уведомление туриста" (type_id = 32)
   * notification_id = 44 означает "Перед вылетом"
   */
  async handleTouristNotificationWebHook(webhook: TouristNotificationWebHook): Promise<void> {
    logger.debug('[SOTA] Processing tourist notification webhook:', webhook);
    
    // Если это уведомление перед вылетом (notification_id = 44)
    if (webhook.notification_id === 44) {
      logger.info('[SOTA] Departure notification received for request:', webhook.request_id);
      // Здесь можно добавить логику для автоматической загрузки документов
      // или отправки push-уведомления пользователю
    }
  }

  /**
   * Обработка WebHook события "Создание заявки" (type_id = 2)
   */
  async handleRequestCreatedWebHook(webhook: RequestCreatedWebHook): Promise<void> {
    logger.debug('[SOTA] Processing request created webhook:', webhook);
    // Можно добавить логику для отслеживания новых заявок
  }

  /**
   * Универсальный обработчик WebHook событий
   */
  async handleWebHook(webhook: SotaWebHookPayload): Promise<SotaApiResponse<any>> {
    logger.debug(`[SOTA] Processing webhook type_id=${webhook.type_id}`);

    switch (webhook.type_id) {
      case 2:
        await this.handleRequestCreatedWebHook(webhook as RequestCreatedWebHook);
        return { success: true };
      
      case 20:
        return await this.handleFileAttachedWebHook(webhook as FileAttachedWebHook);
      
      case 32:
        await this.handleTouristNotificationWebHook(webhook as TouristNotificationWebHook);
        return { success: true };
      
      default:
        logger.debug(`[SOTA] Webhook type_id=${webhook.type_id} not handled`);
        return { success: true };
    }
  }

  /**
   * Получение URL документа для открытия в браузере/приложении (U-ON: файл из request/{id}).
   * Используется в мобильном приложении с Linking.openURL().
   */
  async getDocumentUrl(documentId: string, bookingId: string): Promise<string | null> {
    const docResponse = await this.getFileById(documentId, bookingId);
    if (!docResponse.success || !docResponse.data?.fileUrl) {
      return null;
    }
    return docResponse.data.fileUrl;
  }

  /**
   * Алиас для getDocumentUrl — возвращает URL документа для открытия.
   * @deprecated Используйте getDocumentUrl. Оставлено для совместимости с DepartureDocumentsScreen.
   */
  async downloadDepartureDocument(documentId: string, bookingId: string): Promise<string | null> {
    return this.getDocumentUrl(documentId, bookingId);
  }

  /**
   * Скачивание документа на вылет (U-ON: по URL файла из заявки).
   * Возвращает Blob — для сохранения в файловую систему.
   */
  async downloadDocument(documentId: string, bookingId: string): Promise<SotaApiResponse<Blob>> {
    logger.log(`[SOTA] 📥 Запрос скачивания документа (ID: ${documentId}, бронирование: ${bookingId})`);
    const docResponse = await this.getFileById(documentId, bookingId);
    if (!docResponse.success || !docResponse.data?.fileUrl) {
      return { success: false, error: docResponse.error || 'Document or URL not found' };
    }
    try {
      const res = await fetch(docResponse.data.fileUrl);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const blob = await res.blob();
      logger.log(`[SOTA] ✅ Документ успешно получен (ID: ${documentId})`);
      return { success: true, data: blob };
    } catch (e: any) {
      logger.error(`[SOTA] ❌ Не удалось скачать документ (ID: ${documentId}):`, e);
      return { success: false, error: e?.message || 'Download failed' };
    }
  }

    /**
   * Получение ID клиента в SOTA по email или телефону (для бонусов и заявок).
   */
  async getClientId(params: { email?: string; phone?: string }): Promise<number | null> {
    if (!params?.email && !params?.phone) return null;
    if (params.email) {
      const res = await this.request<{ id?: number }>('user/email.json', {
        method: 'POST',
        body: JSON.stringify({ email: params.email.trim() }),
      });
      if (res.success && res.data?.id) return res.data.id;
    }
    if (params.phone) {
      const phone = String(params.phone).replace(/\D/g, '');
      if (!phone) return null;
      const res = await this.request<{ id?: number }>(`user/phone/${encodeURIComponent(phone)}.json`, { method: 'GET' });
      if (res.success && res.data?.id) return res.data.id;
    }
    return null;
  }

  /**
   * Получение транзакций бонусов по ID клиента (U-ON: bcard-bonus-by-user/{id}.json).
   * Бонусы начисляются и списываются в SOTA; старые бонусы обнуляются в системе.
   */
  async getBonusTransactionsByUser(clientId: number): Promise<SotaApiResponse<BonusTransaction[]>> {
    logger.log(`[SOTA] 📥 Запрос транзакций бонусов по клиенту: ${clientId}`);
    const response = await this.request<BonusTransaction[] | { [key: string]: unknown }>(
      `bcard-bonus-by-user/${clientId}.json`,
      { method: 'GET' }
    );
    if (!response.success) {
      logger.warn('[SOTA] Не удалось получить транзакции бонусов:', response.error);
      return { success: false, error: response.error };
    }
    const raw = response.data;
    let list: any[] = [];
    if (Array.isArray(raw)) list = raw;
    else if (raw && typeof raw === 'object') {
      const anyRaw = raw as Record<string, unknown>;
      if (Array.isArray(anyRaw.rows)) list = anyRaw.rows;
      else if (Array.isArray(anyRaw.row)) list = anyRaw.row;
      else if (Array.isArray(anyRaw.data)) list = anyRaw.data;
      else if (Array.isArray(anyRaw.items)) list = anyRaw.items;
    }
    const transactions: BonusTransaction[] = (list || []).map((t: any) => ({
      id: t.id,
      bcard_id: t.bcard_id,
      datetime: t.datetime || '',
      increase: t.increase ?? 0,
      decrease: t.decrease ?? 0,
      amount: t.amount ?? 0,
      amount_till_date: t.amount_till_date,
      reason: t.reason,
      manager_id: t.manager_id,
      request_id: t.request_id,
    }));
    logger.log(`[SOTA] ✅ Получено транзакций бонусов: ${transactions.length}`);
    return { success: true, data: transactions };
  }

  /**
   * Активация бонусной карты (U-ON: bcard-activate/create.json).
   */
  async activateBonusCard(clientId: number, bcNumber: string): Promise<SotaApiResponse<unknown>> {
    logger.log(`[SOTA] Активация бонусной карты для клиента ${clientId}`);
    return this.request<unknown>('bcard-activate/create.json', {
      method: 'POST',
      body: JSON.stringify({ bc_number: bcNumber.trim(), user_id: clientId }),
    });
  }

  /**
   * Начисление (type=1) или списание (type=2) бонусов (U-ON: bcard-bonus/create.json).
   */
  async createBonusOperation(params: {
    bc_id: number;
    type: 1 | 2;
    bonuses: number;
    reason?: string;
    datetime?: string;
  }): Promise<SotaApiResponse<unknown>> {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datetime =
      params.datetime ||
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const body: Record<string, unknown> = {
      bc_id: params.bc_id,
      datetime,
      type: params.type,
      bonuses: params.bonuses,
    };
    if (params.reason) body.reason = params.reason;

    logger.log(`[SOTA] Операция с бонусами: type=${params.type}, amount=${params.bonuses}`);
    return this.request<unknown>('bcard-bonus/create.json', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Получение всех документов на вылет для пользователя по email или телефону
   */
  async getUserDepartureDocuments(
    email?: string,
    phone?: string
  ): Promise<SotaApiResponse<{ booking: SotaBooking; documents: DepartureDocument[] }[]>> {
    if (getCrmBackendBaseUrl()) {
      const r = await fetchUserDepartureDocumentsViaBackend(email, phone);
      if (r.success && r.data !== undefined) {
        return { success: true, data: r.data as { booking: SotaBooking; documents: DepartureDocument[] }[] };
      }
      if (r.error && r.error !== 'no_backend') {
        return { success: false, error: r.error };
      }
    }

    logger.log(`[SOTA] 📥 Запрос документов на вылет для пользователя (email: ${email ? 'указан' : 'не указан'}, phone: ${phone ? 'указан' : 'не указан'})`);
    
    if (!email && !phone) {
      logger.error('[SOTA] ❌ Email или телефон обязательны для получения документов');
      return {
        success: false,
        error: 'Email или телефон обязательны для получения документов',
      };
    }

    const bookingsResponse = await this.getBookings({
      clientEmail: email,
      clientPhone: phone,
    });

    if (!bookingsResponse.success || !bookingsResponse.data) {
      logger.error('[SOTA] ❌ Не удалось получить бронирования для пользователя');
      return bookingsResponse as any;
    }

    logger.log(`[SOTA] 📋 Найдено бронирований для пользователя: ${bookingsResponse.data.length}`);
    const result: { booking: SotaBooking; documents: DepartureDocument[] }[] = [];

    for (const booking of bookingsResponse.data) {
      const documentsResponse = await this.getDepartureDocuments(booking.id);
      if (documentsResponse.success && documentsResponse.data) {
        result.push({
          booking,
          documents: documentsResponse.data,
        });
        logger.debug(`[SOTA] Добавлено документов для бронирования ${booking.id}: ${documentsResponse.data.length}`);
      }
    }

    logger.log(`[SOTA] ✅ Получено документов на вылет для пользователя: ${result.length} бронирований с документами`);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Проверка подключения к API (U-ON: GET countries.json).
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.request<unknown[]>('countries.json', { method: 'GET' });
      return response.success;
    } catch (error) {
      logger.error('[SOTA] Connection test failed:', error);
      return false;
    }
  }
}

// Экспорт singleton экземпляра
export const sotaCrmService = SotaCrmService.getInstance();
