/**
 * Платёжная система TravelHub: приложение → travelhub63.ru → Tinkoff Т-касса → банк.
 * Клиент только запрашивает ссылку на оплату и открывает её в WebView (expo-web-browser).
 * Данные карт всегда вводятся на стороне банка по HTTPS — приложение и ваш сервер
 * НЕ видят и НЕ хранят реквизиты карты.
 */

import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getValidAccessToken } from './AuthApiClient';
import { authSession } from './AuthSession';
import { getPaymentApiBaseUrl } from '../config/apiEndpoints';
import { logger } from '../utils/logger';
const STORAGE_KEY_LAST_TRANSACTION = 'payment_last_transaction_id';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

export type PaymentProvider = 'sber' | 'alpha' | 'tbank';

export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';

export interface CreatePaymentParams {
  amount: number;
  orderId: string;
  description: string;
  currency?: string;
  userId: string;
  /** Стабильный ключ для идемпотентного Init на сервере (двойной клик «Оплатить») */
  idempotencyKey?: string;
  /** URL для возврата в приложение после успешной оплаты (например travelhub://booking-success?bookingId=...) */
  returnUrl?: string;
  /** URL для возврата при ошибке/отмене оплаты (например travelhub://booking-fail?bookingId=...) */
  failReturnUrl?: string;
}

export interface CreatePaymentResult {
  success: boolean;
  paymentUrl?: string;
  transactionId?: string;
  error?: string;
}

export interface PaymentStatusResult {
  success: boolean;
  status?: 'pending' | 'success' | 'failed' | 'cancelled';
  amount?: number;
  paidAt?: string | null;
  error?: string;
  /** true если статус pending держится дольше порога (опрос с сервера) — показать «ещё обрабатывается» + повтор */
  pendingLong?: boolean;
}

/** Порог «долгого» pending (мс), между 30 и 60 с по требованию продукта */
export const PAYMENT_PENDING_LONG_MS = 45000;

function getApiBase(): string {
  return getPaymentApiBaseUrl();
}

function generateIdempotencyKey(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** JWT access token (travelhub auth-mobile.php) для запросов к API оплаты. */
async function getAuthToken(): Promise<string | null> {
  try {
    return await getValidAccessToken();
  } catch (e) {
    logger.error('[PaymentService] getAuthToken:', e);
    return null;
  }
}

/**
 * POST https://travelhub63.ru/api/create-payment
 * Тело: amount, orderId, description, currency (RUB), userId, returnUrl?, failReturnUrl?
 * Заголовок: Authorization: Bearer <JWT access token>
 * Ответ: { paymentUrl, transactionId }
 * Бэкенд должен передать returnUrl/failReturnUrl на страницу успеха/ошибки оплаты,
 * чтобы кнопка «Вернуться в приложение» открывала travelhub://booking-success|booking-fail?bookingId=...
 */
export async function createPaymentIntent(params: CreatePaymentParams): Promise<CreatePaymentResult> {
  const base = getApiBase();
  const url = `${base}/api/create-payment`;
  const {
    amount,
    orderId,
    description,
    currency = 'RUB',
    userId,
    returnUrl,
    failReturnUrl,
    idempotencyKey = generateIdempotencyKey(),
  } = params;

  logger.log('[PaymentService] createPaymentIntent →', url);

  if (!amount || amount <= 0 || !orderId || !userId) {
    return { success: false, error: 'Не указаны amount, orderId или userId' };
  }

  const token = await getAuthToken();
  if (!token) {
    return {
      success: false,
      error:
        'Не удалось получить токен авторизации. Закройте экран, подождите пару секунд и войдите снова (или перезапустите приложение).',
    };
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  let lastError: string | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: Number(amount),
          orderId: String(orderId),
          description: (description || '').slice(0, 250),
          currency: currency || 'RUB',
          userId: String(userId),
          idempotencyKey,
          ...(returnUrl && { returnUrl: String(returnUrl) }),
          ...(failReturnUrl && { failReturnUrl: String(failReturnUrl) }),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = data?.error || data?.message || response.statusText || `HTTP ${response.status}`;
        lastError = msg;
        if (response.status === 401) {
          const detail = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : '';
          if (/Invalid or expired|verifyIdToken|Bearer token required|Unauthorized/i.test(detail)) {
            return {
              success: false,
              error:
                'Сервер не принял токен сессии. Выйдите из аккаунта и войдите снова. Если повторится — проверьте jwt_secret на сервере (auth и оплата).',
            };
          }
          return {
            success: false,
            error: detail ? `Требуется авторизация: ${detail}` : 'Требуется авторизация. Войдите в аккаунт.',
          };
        }
        if (response.status >= 400 && response.status < 500 && attempt === MAX_RETRIES - 1) {
          return { success: false, error: msg };
        }
        throw new Error(msg);
      }

      const paymentUrl = data?.paymentUrl ?? data?.payment_url;
      const transactionId = data?.transactionId ?? data?.transaction_id;

      if (!paymentUrl || !transactionId) {
        return { success: false, error: data?.error || 'Сервер не вернул ссылку на оплату' };
      }

      await AsyncStorage.setItem(STORAGE_KEY_LAST_TRANSACTION, JSON.stringify({
        transactionId,
        orderId,
        timestamp: Date.now(),
      }));

      return {
        success: true,
        paymentUrl,
        transactionId,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Ошибка сети';
      lastError = msg;
      logger.error('[PaymentService] createPaymentIntent attempt', attempt + 1, msg);
      if (attempt === MAX_RETRIES - 1) {
        return { success: false, error: msg };
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  const friendlyMessage =
    lastError && /неверный статус транзакции|duplicate|дубликат/i.test(lastError)
      ? 'Платёж по этому заказу уже создан или в обработке. Подождите минуту или попробуйте снова — будет создана новая попытка оплаты.'
      : lastError;

  return { success: false, error: friendlyMessage || 'Не удалось создать платёж' };
}

/**
 * Открывает paymentUrl в in-app браузере (expo-web-browser).
 * Возвращает результат закрытия (success / dismiss / cancel).
 */
export async function openPaymentInBrowser(paymentUrl: string): Promise<{ type: string }> {
  try {
    const result = await WebBrowser.openBrowserAsync(paymentUrl);
    return { type: result?.type ?? 'dismiss' };
  } catch (error: unknown) {
    logger.error('[PaymentService] openPaymentInBrowser:', error);
    return { type: 'cancel' };
  }
}

/**
 * GET https://travelhub63.ru/api/payment-status/:transactionId
 * Проверка статуса платежа после возврата из браузера.
 */
export async function checkPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
  const base = getApiBase();
  const url = `${base}/api/payment-status/${encodeURIComponent(transactionId)}`;

  if (!transactionId) {
    return { success: false, error: 'Нет transactionId' };
  }

  let lastError: string | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(url, { method: 'GET', headers });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 403) {
          return { success: false, error: data?.error || 'Нет доступа к этому платежу' };
        }
        if (response.status === 404) {
          return { success: true, status: 'pending' };
        }
        const errText =
          (typeof data?.error === 'string' && data.error) ||
          response.statusText ||
          `HTTP ${response.status}`;
        lastError = errText;
        throw new Error(errText);
      }

      const status = (data?.status ?? data?.Status)?.toLowerCase();
      const mapped: PaymentStatusResult['status'] =
        status === 'success' || status === 'completed'
          ? 'success'
          : status === 'cancelled'
            ? 'cancelled'
            : status === 'failed'
              ? 'failed'
              : 'pending';
      return {
        success: true,
        status: mapped,
        amount: data?.amount,
        paidAt: data?.paidAt ?? data?.paid_at ?? null,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Ошибка сети';
      lastError = msg;
      logger.error('[PaymentService] checkPaymentStatus attempt', attempt + 1, msg);
      if (attempt === MAX_RETRIES - 1) {
        return { success: false, error: msg };
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  return { success: false, error: lastError || 'Не удалось проверить статус' };
}

const POLL_DEFAULT_INTERVAL_MS = 4000;
const POLL_DEFAULT_MAX_MS = 120000;

const RECHECK_POLL_MAX_MS = 60000;

/**
 * Повторная проверка статуса после «Проверить снова» (короче полного первого опроса).
 */
export async function recheckPaymentUntilFinal(
  transactionId: string,
  options?: { intervalMs?: number; maxWaitMs?: number },
): Promise<PaymentStatusResult> {
  return pollPaymentUntilFinal(transactionId, {
    intervalMs: options?.intervalMs ?? POLL_DEFAULT_INTERVAL_MS,
    maxWaitMs: options?.maxWaitMs ?? RECHECK_POLL_MAX_MS,
  });
}

/**
 * Опрос статуса платежа до terminal state (success/failed) или таймаута.
 * Нужен при позднем webhook и при обрыве сети после оплаты.
 */
export async function pollPaymentUntilFinal(
  transactionId: string,
  options?: {
    intervalMs?: number;
    maxWaitMs?: number;
    onTick?: (r: PaymentStatusResult) => void;
  },
): Promise<PaymentStatusResult> {
  const intervalMs = options?.intervalMs ?? POLL_DEFAULT_INTERVAL_MS;
  const maxWaitMs = options?.maxWaitMs ?? POLL_DEFAULT_MAX_MS;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const r = await checkPaymentStatus(transactionId);
    options?.onTick?.(r);
    if (!r.success) {
      await new Promise((res) => setTimeout(res, intervalMs));
      continue;
    }
    if (r.status === 'success' || r.status === 'failed' || r.status === 'cancelled') {
      return r;
    }
    if (r.status === 'pending' && Date.now() - start >= PAYMENT_PENDING_LONG_MS) {
      return { success: true, status: 'pending', pendingLong: true };
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }

  const elapsed = Date.now() - start;
  return {
    success: true,
    status: 'pending',
    error: 'poll_timeout',
    pendingLong: elapsed >= PAYMENT_PENDING_LONG_MS,
  };
}

/**
 * Сохранить последний transactionId для офлайн/восстановления (уже сохраняется в createPaymentIntent).
 * Получить последний сохранённый transactionId.
 */
export async function getLastPaymentTransaction(): Promise<{ transactionId: string; orderId: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_LAST_TRANSACTION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.transactionId && parsed?.orderId) {
      return { transactionId: parsed.transactionId, orderId: parsed.orderId };
    }
    return null;
  } catch {
    return null;
  }
}

// --- Совместимость с TourBookingScreen ---

export interface PaymentData {
  bookingId: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl?: string;
  metadata?: Record<string, string | number>;
  isDigitalProduct?: boolean;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  paymentUrl?: string;
  transactionId?: string;
  error?: string;
  useIap?: boolean;
}

class PaymentService {
  private static instance: PaymentService;
  private readonly BASE_URL: string;

  private constructor() {
    this.BASE_URL = getApiBase();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Создать платёж через бэкенд (Т-Касса/ЮKassa), открыть в браузере, по возврату проверить статус.
   * Возвращает результат создания; открытие браузера и проверку статуса делает вызывающий код.
   */
  async createPayment(_provider: PaymentProvider, paymentData: PaymentData): Promise<PaymentResult> {
    if (paymentData.isDigitalProduct) {
      return {
        success: false,
        error: 'Для цифровых товаров используйте встроенные покупки (IAP / Google Pay).',
        useIap: true,
      };
    }

    const userId = (await authSession.getStoredUser())?.id;
    if (!userId) {
      return { success: false, error: 'Войдите в аккаунт для оплаты' };
    }

    const result = await createPaymentIntent({
      amount: paymentData.amount,
      orderId: paymentData.bookingId,
      description: paymentData.description,
      currency: paymentData.currency || 'RUB',
      userId,
      idempotencyKey: `init_${paymentData.bookingId}_${userId}`.slice(0, 128),
      returnUrl: paymentData.returnUrl,
      failReturnUrl: paymentData.returnUrl
        ? paymentData.returnUrl
            .replace('booking-success', 'booking-fail')
            .replace('payment/success', 'payment/fail')
        : undefined,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      paymentUrl: result.paymentUrl,
      transactionId: result.transactionId,
      paymentId: result.transactionId,
    };
  }

  /**
   * Открыть страницу оплаты в браузере (expo-web-browser).
   */
  async openPaymentForm(paymentUrl: string): Promise<boolean> {
    try {
      await openPaymentInBrowser(paymentUrl);
      return true;
    } catch (error: unknown) {
      logger.error('[PaymentService] openPaymentForm:', error);
      return false;
    }
  }

  /**
   * Открыть оплату в браузере и по закрытию вернуть результат (для экранов).
   */
  async openPaymentAndWaitForResult(paymentUrl: string, transactionId: string): Promise<PaymentStatusResult> {
    await openPaymentInBrowser(paymentUrl);
    return checkPaymentStatus(transactionId);
  }

  formatAmount(amount: number, currency: string): string {
    const formatter = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency === 'RUB' ? 'RUB' : currency === 'USD' ? 'USD' : 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return formatter.format(amount);
  }

  getProviderName(provider: PaymentProvider): string {
    const names: Record<PaymentProvider, string> = {
      sber: 'Банковская карта',
      alpha: 'Банковская карта',
      tbank: 'Тинькофф',
    };
    return names[provider] || provider;
  }

  getProviderIcon(provider: PaymentProvider): string {
    return 'card';
  }
}

export const paymentService = PaymentService.getInstance();
