import {
  Country,
  Departure,
  Region,
  SubRegion,
  Arrival,
  Currency,
  CurrencyRate,
  Operator,
  Meal,
  HotelType,
  HotelGroupService,
  Hotel,
  HotelCompact,
  TourSearchParams,
  TourSearchOutput,
  TourSearchStatus,
  TourSearchContinueOutput,
  TourHotel,
  TourOutput,
  TourFlightsOutput,
  HotToursParams,
  TourHot,
  HotelSearchParams,
  ApiResponse,
  PaginatedResponse
} from '../types/tourvisor';
import { logger } from '../utils/logger';
import { getJwtDiagnostics } from '../utils/jwtDiagnostics';
import { normalizeHotelImages } from '../utils/hotelImages';
import { rateLimiter } from './RateLimiter';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RATE_LIMIT_COOLDOWN_KEY = 'tourvisor_429_cooldown_until';
const REQUEST_TIMEOUT_MS = 30_000;

class TourvisorApiService {
  /** Пусто до AppContext.setBaseUrl — не используем прямой api.tourvisor.ru по умолчанию (токен на сервере). */
  private baseUrl: string = '';
  private jwtToken: string | null = null;
  private errorLogCache: Map<string, number> = new Map();
  private readonly ERROR_LOG_THROTTLE = 30000;
  private rateLimitCooldownUntil: number = 0;

  constructor(jwtToken?: string) {
    if (jwtToken) {
      this.setJwtToken(jwtToken);
    }
    AsyncStorage.getItem(RATE_LIMIT_COOLDOWN_KEY).then(v => {
      if (v) {
        const until = parseInt(v, 10);
        if (__DEV__ && until > Date.now()) {
          logger.debug('[Tourvisor API] clearing cooldown (dev) — доступ к API восстановлен');
          this.rateLimitCooldownUntil = 0;
          AsyncStorage.removeItem(RATE_LIMIT_COOLDOWN_KEY).catch(() => {});
        } else {
          this.rateLimitCooldownUntil = until;
        }
      }
    }).catch(() => {});
  }

  /** Отладочная информация по rate limit (для логов) */
  getRateLimitDebugInfo(): { cooldownUntil: string; minLeft: number } | null {
    if (this.rateLimitCooldownUntil <= 0) return null;
    return {
      cooldownUntil: new Date(this.rateLimitCooldownUntil).toISOString(),
      minLeft: Math.ceil((this.rateLimitCooldownUntil - Date.now()) / 60000),
    };
  }

  /** Проверка: можно ли делать запросы (не в cooldown после 429) */
  isRateLimited(): boolean {
    if (this.rateLimitCooldownUntil > 0 && Date.now() >= this.rateLimitCooldownUntil) {
      this.rateLimitCooldownUntil = 0;
      AsyncStorage.removeItem(RATE_LIMIT_COOLDOWN_KEY).catch(() => {});
      return false;
    }
    return Date.now() < this.rateLimitCooldownUntil;
  }

  /** Сбросить cooldown после 429 (для повторной попытки) */
  async clearRateLimitCooldown(): Promise<void> {
    this.rateLimitCooldownUntil = 0;
    await AsyncStorage.removeItem(RATE_LIMIT_COOLDOWN_KEY);
    logger.debug('[Tourvisor API] clearRateLimitCooldown — сброшено, можно вызывать API');
  }

  // Метод для установки базового URL (если нужно изменить)
  // Используется для переключения между тестовым и production API
  setBaseUrl(url: string) {
    this.baseUrl = url;
  }
  
  // Получить текущий базовый URL (для отладки)
  getBaseUrl(): string {
    return this.baseUrl;
  }

  setJwtToken(token: string) {
    // Проверяем, что токен не является плейсхолдером
    if (token && (token.includes('${') || token.includes('your_') || token.includes('TOURVISOR_TOKEN'))) {
      logger.warn('⚠️ Tourvisor API: Invalid token detected (placeholder). Token will not be set.');
      logger.warn('⚠️ Please provide a real JWT token from Tourvisor personal cabinet.');
      this.jwtToken = null;
      return;
    }
    
    // Проверяем базовый формат JWT токена
    if (token && token.length > 20 && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/.test(token)) {
      this.jwtToken = token;
      logger.debug(`[Tourvisor API] Token set successfully (length: ${token.length}, first 20 chars: ${token.substring(0, 20)}...)`);
      logger.debug(`[Tourvisor API] ${getJwtDiagnostics(token).summary}`);
    } else if (token) {
      logger.warn('⚠️ Tourvisor API: Token format seems invalid. Expected JWT format.');
      logger.warn(`⚠️ Token length: ${token.length}, first 30 chars: ${token.substring(0, 30)}...`);
      this.jwtToken = token; // Все равно устанавливаем, может быть нестандартный формат
      logger.debug(`[Tourvisor API] Token set anyway (length: ${token.length})`);
    } else {
      this.jwtToken = null;
      logger.warn('⚠️ Tourvisor API: Token is null or empty');
    }
  }
  
  getJwtToken(): string | null {
    return this.jwtToken;
  }

  /** Прокси travelhub добавляет Bearer на сервере — клиентский Authorization ломает запрос (двойной токен → 403). */
  private usesTourvisorMobileProxy(): boolean {
    return this.baseUrl.includes('/api/tourvisor-mobile');
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.jwtToken && !this.usesTourvisorMobileProxy()) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    }

    return headers;
  }

  /**
   * Определение типа запроса для rate limiting
   */
  private getRequestType(endpoint: string): 'dictionary' | 'search' {
    // Справочники
    const dictionaryEndpoints = [
      '/departures',
      '/countries',
      '/arrivals',
      '/currencies',
      '/meals',
      '/operators',
      '/regions',
      '/subregions',
      '/hotel-types',
      '/hotel-group-services',
      '/hotels',
      '/tours/dates',
    ];
    
    // Проверяем, является ли это справочником
    const isDictionary = dictionaryEndpoints.some(ep => endpoint.includes(ep));
    
    return isDictionary ? 'dictionary' : 'search';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount: number = 0,
    maxRetries: number = 3
  ): Promise<ApiResponse<T>> {
    // Быстрый выход: сервер ранее вернул 429 с Retry-After
    if (Date.now() < this.rateLimitCooldownUntil) {
      const secLeft = Math.ceil((this.rateLimitCooldownUntil - Date.now()) / 1000);
      logger.warn('[Tourvisor API] request BLOCKED by cooldown', {
        endpoint,
        secLeft,
        cooldownUntil: new Date(this.rateLimitCooldownUntil).toISOString(),
      });
      throw new Error(`HTTP 429: Rate limit exceeded. Try again in ${Math.round(secLeft / 60)} min.`);
    }

    if (!this.baseUrl.trim() || !/^https?:\/\//i.test(this.baseUrl)) {
      throw new Error(
        'Tourvisor API: не задан базовый URL (WEBSITE_BASE_URL / tourvisorApiUrl в конфиге). Ожидается https://…/api/tourvisor-mobile'
      );
    }

    const requestType = this.getRequestType(endpoint);
    
    // Ожидаем доступности согласно rate limiting
    try {
      await rateLimiter.waitForAvailability(requestType);
    } catch (error) {
      logger.warn(`[Tourvisor API] Rate limiter error:`, error);
      // Продолжаем выполнение даже при ошибке rate limiter
    }
    
    const url = `${this.baseUrl}${endpoint}`;
    logger.debug('[Tourvisor API] request START', { endpoint, url: url.substring(0, 80) + '...' });

    // Проверяем наличие токена перед запросом (до таймера, чтобы не оставлять висящий timeout).
    // На tourvisor-mobile токен подставляет прокси — клиентский JWT не обязателен и в заголовок не передаём.
    if (!this.jwtToken && !this.usesTourvisorMobileProxy()) {
      const errorMsg = `Tourvisor API: JWT token is required for endpoint ${endpoint}.\n` +
        `To get a token:\n` +
        `1. Log in to your Tourvisor agent account\n` +
        `2. Get JWT token from your personal cabinet\n` +
        `3. Set it using AppContext.setTourvisorToken() method\n` +
        `See documentation: https://api.tourvisor.ru/search/docs`;
      logger.error(`[Tourvisor API] Token check failed for ${endpoint}: token is ${this.jwtToken === null ? 'null' : 'undefined'}`);
      logger.warn(errorMsg);
      throw new Error('Tourvisor API: JWT token is missing. Please configure API token.');
    }

    if (this.jwtToken) {
      logger.debug(`[Tourvisor API] Token check passed for ${endpoint}: token length ${this.jwtToken.length}`);
    } else {
      logger.debug(`[Tourvisor API] Proxy mode (${this.baseUrl}): no client JWT; Authorization omitted`);
    }

    const { signal: incomingSignal, ...restOptions } = options;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const onIncomingAbort = () => {
      clearTimeout(timeoutId);
      timeoutController.abort();
    };
    if (incomingSignal) {
      if (incomingSignal.aborted) {
        clearTimeout(timeoutId);
        timeoutController.abort();
      } else {
        incomingSignal.addEventListener('abort', onIncomingAbort);
      }
    }

    const config: RequestInit = {
      ...restOptions,
      headers: {
        ...this.getHeaders(),
        ...restOptions.headers,
      },
      signal: timeoutController.signal,
    };

    logger.debug(`[Tourvisor API] Request: ${url}`);
    // Не показываем полный токен в логах (безопасность)
    const safeHeaders: Record<string, string> = {
      ...(config.headers as Record<string, string>),
    };
    if (safeHeaders.Authorization) {
      const authHeader = safeHeaders.Authorization;
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        safeHeaders.Authorization = `Bearer ${token.substring(0, 10)}...${token.substring(token.length - 5)} (${token.length} chars)`;
      }
    }
    logger.debug(`[Tourvisor API] Headers:`, safeHeaders);

    try {
      const response = await fetch(url, config);
      logger.debug('[Tourvisor API] response', {
        endpoint,
        status: response.status,
        statusText: response.statusText,
      });
      
      // Проверяем статус ответа
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        
        // Специальная обработка для 403 (Forbidden)
        if (response.status === 403) {
          const isHotelDetails = /^\/hotels\/\d+/.test(endpoint) || endpoint.includes('/hotels/');
          const errorKey = `403_${endpoint}`;
          const lastLogTime = this.errorLogCache.get(errorKey) || 0;
          const now = Date.now();

          if (now - lastLogTime > this.ERROR_LOG_THROTTLE) {
            if (isHotelDetails) {
              // GET /hotels/{id} — отдельный платный модуль «Описания отелей» (см. https://api.tourvisor.ru/search/docs)
              logger.warn(
                `[Tourvisor API] 403 на ${endpoint}: модуль «Описания отелей» не подключён. Список отелей работает, детали и фото — по подписке.`
              );
            } else if (this.usesTourvisorMobileProxy()) {
              logger.error(
                `Tourvisor API: 403 через прокси ${endpoint}\n` +
                  `Ответ (фрагмент): ${errorText.replace(/\s+/g, ' ').slice(0, 400)}\n` +
                  `Проверьте на сервере TOURVISOR_TOKEN / TOURVISOR_JWT_TOKEN, whitelist IP в кабинете Tourvisor и маршрут /api/tourvisor-mobile.`
              );
            } else {
              const diag = getJwtDiagnostics(this.jwtToken);
              logger.error(
                `Tourvisor API: 403 Forbidden — ${endpoint}\n` +
                  `Ответ сервера (фрагмент): ${errorText.replace(/\s+/g, ' ').slice(0, 400)}\n` +
                  `JWT: ${diag.summary}\n` +
                  `Если токен свежий: у B2B API Tourvisor часто включён whitelist IP — запросы с телефона блокируются. ` +
                  `Варианты: добавить IP вашего бэкенда в кабинете или задать TOURVISOR_WORKER_URL (прокси с белым IP).`
              );
            }
            this.errorLogCache.set(errorKey, now);
          }

          const userHint = this.usesTourvisorMobileProxy()
            ? ' Проверьте токен Tourvisor на сервере (сайт) и настройки API в кабинете.'
            : getJwtDiagnostics(this.jwtToken).isExpired
              ? ' JWT истёк — выпустите новый в личном кабинете Tourvisor и обновите TOURVISOR_TOKEN.'
              : ' Если токен действителен: проверьте whitelist IP в кабинете Tourvisor или используйте прокси (TOURVISOR_WORKER_URL в .env).';

          const error = new Error(
            isHotelDetails
              ? 'Tourvisor API: Модуль «Описания отелей» не подключён (403).'
              : `Tourvisor API: доступ запрещён (403).${userHint}`
          ) as any;
          error.status = 403;
          error.endpoint = endpoint;
          error.isHotelDetailsModule = isHotelDetails;
          throw error;
        }
        
        // Специальная обработка для 401 (Unauthorized)
        if (response.status === 401) {
          const errorMsg = `Tourvisor API: Unauthorized (401). JWT token is invalid or expired. Endpoint: ${endpoint}`;
          logger.error(errorMsg);
          throw new Error('Tourvisor API: Unauthorized. Please update your JWT token.');
        }
        
        // Специальная обработка для 429 (Too Many Requests)
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;
          const serverCooldownMs = Math.min(retrySeconds * 1000, 24 * 60 * 60 * 1000);
          // В dev: макс 5 минут, чтобы можно было перезапустить и проверить API
          const cooldownMs = __DEV__ ? Math.min(serverCooldownMs, 5 * 60 * 1000) : serverCooldownMs;
          this.rateLimitCooldownUntil = Date.now() + cooldownMs;
          AsyncStorage.setItem(RATE_LIMIT_COOLDOWN_KEY, String(this.rateLimitCooldownUntil)).catch(() => {});
          logger.warn(
            '[Tourvisor API] 429 — cooldown установлен до',
            new Date(this.rateLimitCooldownUntil).toISOString(),
            'min=',
            Math.ceil(cooldownMs / 60000)
          );

          // Retry-After > 1 часа — не ретраим, сразу выходим
          const shouldRetry = retryCount < maxRetries && retrySeconds <= 3600;
          const exponentialDelay = Math.min(Math.pow(2, retryCount) * 1000, 60000);
          const delay = Math.min(retrySeconds * 1000, 60000);

          if (shouldRetry && delay <= 60000) {
            const errorKey = `429_${endpoint}`;
            const lastLogTime = this.errorLogCache.get(errorKey) || 0;
            const now = Date.now();
            if (now - lastLogTime > this.ERROR_LOG_THROTTLE) {
              logger.warn(
                `[Tourvisor API] Rate limit (429) for ${endpoint}, retry in ${Math.round(delay / 1000)}s (Retry-After: ${retrySeconds}s)`
              );
              this.errorLogCache.set(errorKey, now);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.request<T>(endpoint, options, retryCount + 1, maxRetries);
          }
          
          // Cooldown установлен — последующие запросы будут отклоняться до его истечения
          const stats = rateLimiter.getStats();
          const errorKey = `429_final_${endpoint}`;
          const lastLogTime = this.errorLogCache.get(errorKey) || 0;
          const now = Date.now();
          
          if (now - lastLogTime > this.ERROR_LOG_THROTTLE) {
            const mins = Math.ceil(cooldownMs / 60000);
            logger.warn(
              `[Tourvisor API] Rate limit (429). Cooldown ${mins} min. ` +
              `Daily: ${stats.dailySearchCount}/${stats.dailySearchLimit}. Endpoint: ${endpoint}`
            );
            this.errorLogCache.set(errorKey, now);
          }
          throw new Error(`HTTP 429: Rate limit exceeded. Please try again later.`);
        }
        
        logger.error(`[Tourvisor API] Error response:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Проверяем Content-Type перед парсингом JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        logger.warn(`[Tourvisor API] Unexpected content type: ${contentType}, response:`, text.substring(0, 200));
        // Попытаемся распарсить как JSON, даже если Content-Type не указан
        try {
          const data = JSON.parse(text);
          return {
            data,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          };
        } catch (parseError) {
          throw new Error(`Tourvisor API: Invalid response format. Expected JSON, got ${contentType}`);
        }
      }

      const data = await response.json();

      if (response.ok && this.rateLimitCooldownUntil > 0) {
        this.rateLimitCooldownUntil = 0;
        AsyncStorage.removeItem(RATE_LIMIT_COOLDOWN_KEY).catch(() => {});
      }
      logger.debug(`[Tourvisor API] Response data type:`, Array.isArray(data) ? 'array' : typeof data);
      if (Array.isArray(data)) {
        logger.debug(`[Tourvisor API] Response array length:`, data.length);
      }
      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        logger.warn(`[Tourvisor API] Timeout или отмена: ${endpoint}`);
        throw new Error(
          'Tourvisor API: запрос превысил время ожидания (30 с). Проверьте сеть и повторите.'
        );
      }
      // Более детальная обработка ошибок
      if (error.message?.includes('Network request failed')) {
        logger.error(`Tourvisor API network error: ${endpoint} - сервер недоступен`);
        throw new Error(`Не удалось связаться с сервером. Проверьте интернет или попробуйте позже.`);
      } else if (error.message?.includes('Failed to fetch')) {
        logger.error(`Tourvisor API fetch failed: ${endpoint} - Возможно, сервер недоступен`);
        throw new Error(`Server unavailable: ${this.baseUrl} is not reachable.`);
      } else {
        if (!error.message?.includes('Tourvisor API:')) {
          const is429 = error?.message?.includes('429') || error?.message?.includes('Rate limit');
          if (is429) {
            logger.warn(`[Tourvisor API] 429 для ${endpoint} — подождите 5 мин`);
          } else {
            logger.error(`Tourvisor API request failed: ${endpoint}`, error);
          }
        }
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
      if (incomingSignal) {
        incomingSignal.removeEventListener('abort', onIncomingAbort);
      }
    }
  }

  private buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(item => searchParams.append(key, item.toString()));
        } else {
          searchParams.append(key, value.toString());
        }
      }
    });

    return searchParams.toString();
  }

  // Dictionary endpoints
  // При departureId === undefined не передаём фильтры — получаем полный список стран.
  // departureId + onlyCharter фильтруют по странам с турами из этого города вылета.
  async getCountries(departureId?: number, onlyCharter?: boolean): Promise<Country[]> {
    const params: Record<string, unknown> = {};
    if (departureId != null) {
      params.departureId = departureId;
      params.onlyCharter = onlyCharter ?? false;
    }

    const query = this.buildQueryString(params);
    const response = await this.request<Country[]>(`/countries${query ? '?' + query : ''}`);
    return response.data;
  }

  async getDepartures(departureCountryId?: number): Promise<Departure[]> {
    const params: any = {};
    if (departureCountryId) params.departureCountryId = departureCountryId;

    const query = this.buildQueryString(params);
    const response = await this.request<Departure[]>(`/departures${query ? '?' + query : ''}`);
    return response.data;
  }

  async getRegions(countryId?: number, arrivalId?: number): Promise<Region[]> {
    const params: any = {};
    if (countryId) params.countryId = countryId;
    if (arrivalId) params.arrivalId = arrivalId;

    const query = this.buildQueryString(params);
    const response = await this.request<Region[] | { data?: Region[] }>(`/regions${query ? '?' + query : ''}`);
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && Array.isArray((data as { data?: Region[] }).data)) return (data as { data: Region[] }).data;
    return [];
  }

  async getSubRegions(countryId?: number, regionId?: number): Promise<SubRegion[]> {
    const params: any = {};
    if (countryId) params.countryId = countryId;
    if (regionId) params.regionId = regionId;

    const query = this.buildQueryString(params);
    const response = await this.request<SubRegion[]>(`/subregions${query ? '?' + query : ''}`);
    return response.data;
  }

  async getArrivals(departureId: number, onlyCharter: boolean = false): Promise<Arrival[]> {
    const query = this.buildQueryString({ departureId, onlyCharter });
    const response = await this.request<Arrival[]>(`/arrivals?${query}`);
    return response.data;
  }

  async getCurrencies(): Promise<Currency[]> {
    const response = await this.request<Currency[]>('/currencies');
    return response.data;
  }

  async getCurrencyRates(currencyId: string): Promise<CurrencyRate[]> {
    const response = await this.request<CurrencyRate[]>(`/currencies/${currencyId}/rates`);
    return response.data;
  }

  async getOperators(departureId?: number, countryId?: number): Promise<Operator[]> {
    const params: any = {};
    if (departureId) params.departureId = departureId;
    if (countryId) params.countryId = countryId;

    const query = this.buildQueryString(params);
    const response = await this.request<Operator[]>(`/operators${query ? '?' + query : ''}`);
    return response.data;
  }

  async getMeals(): Promise<Meal[]> {
    const response = await this.request<Meal[] | { data?: Meal[] }>('/meals');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && Array.isArray((data as { data?: Meal[] }).data)) return (data as { data: Meal[] }).data;
    return [];
  }

  async getHotelTypes(countryId: number): Promise<HotelType[]> {
    const query = this.buildQueryString({ countryId });
    const response = await this.request<HotelType[]>(`/hotel-types?${query}`);
    return response.data;
  }

  async getHotelGroupServices(countryId?: number, regionIds?: number[]): Promise<HotelGroupService[]> {
    const params: any = {};
    if (countryId) params.countryId = countryId;
    if (regionIds) params.regionIds = regionIds;

    const query = this.buildQueryString(params);
    const response = await this.request<HotelGroupService[]>(`/hotel-group-services${query ? '?' + query : ''}`);
    return response.data;
  }

  async getTourDates(
    departureId: number,
    countryId: number,
    arrivalId?: number,
    onlyCharter?: boolean
  ): Promise<string[]> {
    // Валидация обязательных параметров согласно документации
    if (!departureId) {
      throw new Error('Tourvisor API: departureId is required for tour dates');
    }
    if (!countryId) {
      throw new Error('Tourvisor API: countryId is required for tour dates');
    }
    
    const params: any = { departureId, countryId };
    if (arrivalId) params.arrivalId = arrivalId;
    if (onlyCharter !== undefined) params.onlyCharter = onlyCharter;

    const query = this.buildQueryString(params);
    const response = await this.request<string[]>(
      `/tours/dates?${query}`,
      {},
      0,
      2 // Retry для методов поиска (300 запросов/мин)
    );
    return response.data;
  }

  // Hotel endpoints
  // Согласно документации Tourvisor API: GET /hotels
  // Документация: https://api.tourvisor.ru/search/docs
  // 
  // Параметры запроса согласно документации:
  // - countryId (required, integer) - Идентификатор страны
  // - regionId (optional, integer) - Идентификатор курорта
  // - category (optional, integer) - Категория (от и выше)
  // - types (optional, Array of integers) - Тип отеля
  // - rating (optional, number) - Рейтинг (от и выше)
  // - page (optional, integer, default: 1) - Страница
  // - limit (optional, integer, default: 20) - Количество элементов на странице
  //
  // Примечание: hotelServices из HotelSearchParams в query /hotels не передаётся (только серверные поля docs).
  async getHotels(params: HotelSearchParams): Promise<PaginatedResponse<HotelCompact>> {
    if (params.countryId === undefined || params.countryId === null) {
      throw new Error('Tourvisor API: countryId is required for hotels (see documentation: /hotels)');
    }
    
    // Формируем параметры запроса строго согласно документации
    // Используем только те параметры, которые поддерживаются API
    const apiParams: any = {
      countryId: params.countryId, // Обязательный параметр
    };
    
    // Опциональные параметры согласно документации
    if (params.regionId) apiParams.regionId = params.regionId;
    if (params.category) apiParams.category = params.category;
    if (params.types && params.types.length > 0) apiParams.types = params.types;
    if (params.rating) apiParams.rating = params.rating;
    if (params.page) apiParams.page = params.page;
    if (params.limit) apiParams.limit = params.limit;
    
    const query = this.buildQueryString(apiParams);
    const response = await this.request<HotelCompact[]>(
      `/hotels?${query}`,
      {},
      0,
      2 // Retry для методов поиска (300 запросов/мин согласно документации)
    );

    // Parse pagination headers if available
    let total = response.data.length;
    let totalPages = 1;

    if (response.headers) {
      const totalCountHeader = response.headers.get('X-Total-Count') || response.headers.get('x-total-count');
      const totalPagesHeader = response.headers.get('X-Total-Pages') || response.headers.get('x-total-pages');

      if (totalCountHeader) {
        total = parseInt(totalCountHeader, 10) || response.data.length;
      }
      if (totalPagesHeader) {
        totalPages = parseInt(totalPagesHeader, 10) || 1;
      }
    }

    // Логирование в терминал Metro (Expo на Windows): ответ API по отелям.
    // Согласно официальной документации Tourvisor (`/search/api/v1/hotels`) этот метод
    // возвращает ТОЛЬКО справочник: id, name, category, rating, country, region, subRegion, type, common.latitude/longitude.
    // Фото (`picturelink`, `images`, `image` и т.п.) и цены (`price`, `priceFrom`) здесь НЕ приходят.
    // Фото берём из:
    //   - результатов поиска туров: GET /tours/search/{searchId} → поле picturelink + price
    //   - описания отеля:          GET /hotels/{hotelId}        → поле images[] (отдельный платный модуль)
    if (__DEV__ && response.data?.length > 0) {
      const sample = response.data[0] as unknown as Record<string, unknown>;
      const keys = Object.keys(sample).sort();
      const common = sample.common as Record<string, unknown> | undefined;
      const commonKeys =
        common && typeof common === 'object'
          ? Object.keys(common).sort().join(', ')
          : '—';
      const msg = [
        '[TravelHub HOTEL] Tourvisor API /hotels (dictionary only)',
        `count=${response.data.length} total=${total} page=${params.page} totalPages=${totalPages}`,
        `keys (HotelCompact): ${keys.join(', ')}`,
        `common keys: ${commonKeys}`,
        'NOTE: /hotels DOES NOT return photos or prices. Use /tours/search or /hotels/{id} for that (see Tourvisor docs).',
      ].join('\n');
      logger.debug(msg);
    }

    return {
      data: response.data,
      total,
      page: params.page || 1,
      limit: params.limit || 20,
      totalPages,
    };
  }

  /**
   * GET /hotels/{hotelId} — описание отеля (фотографии, описание, координаты).
   * Документация: https://api.tourvisor.ru/search/docs (hotel → getОписание отеля).
   * Доступен только при подключении API «Описания отелей» (оплачивается отдельно); иначе 403.
   */
  async getHotelDetails(hotelId: number): Promise<Hotel> {
    const response = await this.request<Hotel | Hotel[]>(`/hotels/${hotelId}`);

    if (!response.data) {
      throw new Error(`Hotel with id ${hotelId} not found`);
    }

    // Tourvisor по документации возвращает массив, но фактически может вернуть и объект.
    const raw = (Array.isArray(response.data) ? response.data[0] : response.data) as unknown as Record<
      string,
      unknown
    >;

    if (!raw) {
      throw new Error(`Hotel with id ${hotelId} not found`);
    }

    // В документации поле может быть указано как "сommon" (кириллическая "с")
    if (raw && raw.common == null && (raw as any).сommon != null) {
      raw.common = (raw as any).сommon;
    }

    // Нормализуем фото из любых полей ответа (images как строки/объекты, common.images и т.д.)
    const normalized = normalizeHotelImages(raw) as { picturelink?: string; images?: string[] };
    const imageUrls = normalized.images ?? [];
    const out = {
      ...raw,
      picturelink: normalized.picturelink ?? imageUrls[0],
      images: imageUrls,
    } as unknown as Hotel;

    if (__DEV__) {
      const imgCount = Array.isArray(out.images) ? out.images.length : 0;
      const imgSample = (out as any).picturelink ?? (Array.isArray(out.images) ? out.images[0] : undefined);
      logger.debug(
        `[Tourvisor API] Hotel details loaded for id=${hotelId}, imagesCount=${imgCount}, firstImageSample=${
          typeof imgSample === 'string' ? imgSample.substring(0, 80) : '—'
        }`
      );
    }

    return out as Hotel;
  }

  // Tour search endpoints
  async startTourSearch(params: TourSearchParams): Promise<TourSearchOutput> {
    // Валидация обязательных параметров согласно документации
    if (!params.departureId) {
      throw new Error('Tourvisor API: departureId is required for tour search');
    }
    if (!params.countryId) {
      throw new Error('Tourvisor API: countryId is required for tour search');
    }
    if (!params.dateFrom) {
      throw new Error('Tourvisor API: dateFrom is required for tour search');
    }
    if (!params.dateTo) {
      throw new Error('Tourvisor API: dateTo is required for tour search');
    }
    if (!params.nightsFrom) {
      throw new Error('Tourvisor API: nightsFrom is required for tour search');
    }
    if (!params.nightsTo) {
      throw new Error('Tourvisor API: nightsTo is required for tour search');
    }
    if (!params.adults) {
      throw new Error('Tourvisor API: adults is required for tour search');
    }
    if (!params.currency) {
      throw new Error('Tourvisor API: currency is required for tour search');
    }
    if (params.onlyCharter === undefined) {
      // onlyCharter обязателен, но имеет default: false в документации
      params.onlyCharter = false;
    }
    
    const query = this.buildQueryString(params);
    // Для startTourSearch не делаем retry при 429 - сразу возвращаем ошибку для использования кэша
    const response = await this.request<TourSearchOutput>(
      `/tours/search?${query}`,
      {},
      0,
      0 // Без retry - при 429 сразу используем кэш
    );
    return response.data;
  }

  async getTourSearchStatus(searchId: number, operatorStatus: boolean = false): Promise<TourSearchStatus> {
    // Согласно документации: operatorStatus является required параметром в query string
    const query = this.buildQueryString({ operatorStatus });
    const response = await this.request<TourSearchStatus>(
      `/tours/search/${searchId}/status?${query}`,
      {},
      0,
      2 // Retry для методов поиска (300 запросов/мин)
    );
    return response.data;
  }

  async getTourSearchResults(searchId: number, limit: number = 25): Promise<TourHotel[]> {
    // Согласно документации: limit является required параметром (default: 25)
    if (!limit || limit < 1) {
      limit = 25; // Используем default значение
    }
    const query = this.buildQueryString({ limit });
    const response = await this.request<TourHotel[]>(
      `/tours/search/${searchId}?${query}`,
      {},
      0,
      2 // Retry для методов поиска (300 запросов/мин)
    );
    return response.data;
  }

  async continueTourSearch(searchId: number): Promise<TourSearchContinueOutput> {
    const response = await this.request<TourSearchContinueOutput>(`/tours/search/${searchId}/continue`);
    return response.data;
  }

  async getTourDetails(tourId: string, currency: string): Promise<TourOutput> {
    const query = this.buildQueryString({ currency });
    const response = await this.request<TourOutput>(`/tours/${tourId}?${query}`);
    return response.data;
  }

  async getTourFlights(tourId: string, currency: string): Promise<TourFlightsOutput> {
    const query = this.buildQueryString({ currency });
    const response = await this.request<TourFlightsOutput>(`/tours/${tourId}/flights?${query}`);
    return response.data;
  }

  // Hot tours endpoint
  async getHotTours(params: HotToursParams): Promise<TourHot[]> {
    // Проверяем обязательные параметры согласно документации
    if (!params.departureId) {
      throw new Error('Tourvisor API: departureId is required for hot tours');
    }
    if (!params.currency) {
      throw new Error('Tourvisor API: currency is required for hot tours');
    }
    if (params.onlyCharter === undefined) {
      // onlyCharter обязателен, но имеет default: false в документации
      params.onlyCharter = false;
    }
    if (!params.limit || params.limit < 1 || params.limit > 200) {
      throw new Error('Tourvisor API: limit must be between 1 and 200 for hot tours');
    }
    
    // Логируем параметры перед запросом
    logger.debug('[Tourvisor API] getHotTours params:', params);
    
    const query = this.buildQueryString(params);
    const fullUrl = `/tours/hots?${query}`;
    
    logger.debug('[Tourvisor API] getHotTours full URL:', fullUrl);
    
    const response = await this.request<TourHot[]>(fullUrl);
    return response.data;
  }

  // Utility methods
  async waitForSearchCompletion(
    searchId: number,
    onProgress?: (status: TourSearchStatus) => void,
    maxWaitTime: number = 120000, // 2 minutes
    checkInterval: number = 2000 // 2 seconds
  ): Promise<TourSearchStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getTourSearchStatus(searchId);

      if (onProgress) {
        onProgress(status);
      }

      if (status.status === 'completed' || status.status === 'error') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error('Search timeout exceeded');
  }
}

// Create and export singleton instance
export const tourvisorApi = new TourvisorApiService();

// Export the class for testing or multiple instances
export default TourvisorApiService;





