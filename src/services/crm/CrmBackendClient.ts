/**
 * Прокси CRM и создание заявки на сервере (UON_API_KEY не в клиенте).
 * Базовый URL — **корень сайта** (тот же хост, что и оплата), без суффикса `/api/crm`:
 * запросы идут на `${base}/api/crm/submit-booking` и т.д. (например `https://travelhub63.ru`).
 */
import Constants from 'expo-constants';
import { getValidAccessToken } from '../AuthApiClient';
import type { CrmBookingQueuePayload } from '../../types/crmQueue';
import { logger } from '../../utils/logger';

/**
 * База для CRM-прокси: `${base}/api/crm/*` на сайте (U-ON ключ только на сервере).
 * Приоритет: `SOTA_CRM_BASE_URL` / `extra.sotaCrmBaseUrl` — корень URL (например `https://travelhub63.ru`);
 * иначе `paymentPageUrl` (в production обычно тот же `https://travelhub63.ru`).
 * В заголовках уходит JWT Bearer (auth-mobile.php), не ключ U-ON.
 */
export function getCrmBackendBaseUrl(): string {
  const crmFromEnv =
    Constants.expoConfig?.extra?.sotaCrmBaseUrl ||
    (typeof process !== 'undefined' && (process as any).env?.SOTA_CRM_BASE_URL) ||
    '';
  const crm = String(crmFromEnv || '').replace(/\/+$/, '');
  if (crm) return crm;

  const url =
    Constants.expoConfig?.extra?.paymentPageUrl ||
    (typeof process !== 'undefined' && (process as any).env?.PAYMENT_PAGE_URL) ||
    '';
  return String(url).replace(/\/+$/, '');
}

async function getBearer(): Promise<string | null> {
  try {
    return await getValidAccessToken();
  } catch {
    return null;
  }
}

export async function submitBookingToBackend(
  idempotencyKey: string,
  payload: CrmBookingQueuePayload,
): Promise<{
  success: boolean;
  data?: { id?: string; requestId?: string; bookingNumber?: string };
  error?: string;
}> {
  const base = getCrmBackendBaseUrl();
  if (!base) {
    return { success: false, error: 'Не задан URL бэкенда (paymentPageUrl)' };
  }
  const bearer = await getBearer();
  if (!bearer) {
    return { success: false, error: 'Требуется авторизация' };
  }
  try {
    const res = await fetch(`${base}/api/crm/submit-booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ idempotencyKey, payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error || `HTTP ${res.status}` };
    }
    if (!data.success) {
      return { success: false, error: data?.error || 'CRM error' };
    }
    return { success: true, data: data.data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error';
    logger.error('[CrmBackendClient] submitBookingToBackend:', msg);
    return { success: false, error: msg };
  }
}

export async function fetchUserDepartureDocumentsViaBackend(
  email?: string,
  phone?: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const base = getCrmBackendBaseUrl();
  if (!base) return { success: false, error: 'no_backend' };
  const bearer = await getBearer();
  if (!bearer) return { success: false, error: 'unauthorized' };
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (phone) params.set('phone', phone);
  try {
    const res = await fetch(`${base}/api/crm/user-departure-documents?${params.toString()}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data?.error || `HTTP ${res.status}` };
    return { success: !!data.success, data: data.data, error: data.error };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function fetchClientBookingsViaBackend(
  email?: string,
  phone?: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const base = getCrmBackendBaseUrl();
  if (!base) return { success: false, error: 'no_backend' };
  const bearer = await getBearer();
  if (!bearer) return { success: false, error: 'unauthorized' };
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (phone) params.set('phone', phone);
  try {
    const res = await fetch(`${base}/api/crm/client-bookings?${params.toString()}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data?.error || `HTTP ${res.status}` };
    return { success: !!data.success, data: data.data, error: data.error };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function fetchBonusBalanceViaBackend(
  email?: string,
  phone?: string,
): Promise<{ success: boolean; data?: { balance: number; transactions: unknown[] }; error?: string }> {
  const base = getCrmBackendBaseUrl();
  if (!base) return { success: false, error: 'no_backend' };
  const bearer = await getBearer();
  if (!bearer) return { success: false, error: 'unauthorized' };
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (phone) params.set('phone', phone);
  try {
    const res = await fetch(`${base}/api/crm/bonus-balance?${params.toString()}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data?.error || `HTTP ${res.status}` };
    return { success: !!data.success, data: data.data, error: data.error };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
