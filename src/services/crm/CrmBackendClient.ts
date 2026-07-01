/**
 * Прокси CRM и создание заявки на сервере (UON_API_KEY не в клиенте).
 * Базовый URL — **корень сайта** (тот же хост, что и оплата), без суффикса `/api/crm`:
 * запросы идут на `${base}/api/crm/submit-booking` и т.д. (например `https://travelhub63.ru`).
 */
import { authApiClient, getValidAccessToken } from '../AuthApiClient';
import { navigateToLoginAfterSessionExpired } from '../../auth/authNavigation';
import { getBonusApiBaseUrl, getCrmApiBaseUrl } from '../../config/apiEndpoints';
import type { CrmBookingQueuePayload } from '../../types/crmQueue';
import { logger } from '../../utils/logger';

/** Порядок важен: сначала прямой .php (работает на travelhub63.ru), затем rewrite без .php */
const CRM_SUBMIT_PATHS = [
  '/api/crm/submit-booking.php',
  '/api/crm/submit-booking',
  '/api/crm-submit-booking.php',
] as const;

const CRM_BONUS_BALANCE_PATHS = [
  '/api/crm/bonus-balance.php',
  '/api/crm/bonus-balance',
] as const;

const CRM_BCARD_ACTIVATE_PATHS = [
  '/api/crm/bcard-activate.php',
  '/api/crm/bcard-activate',
] as const;

const CRM_BCARD_BONUS_CREATE_PATHS = [
  '/api/crm/bcard-bonus-create.php',
  '/api/crm/bcard-bonus-create',
] as const;

/** CRM: заявки, документы, история — `${CRM_API_BASE_URL}/api/crm/*` */
export function getCrmBackendBaseUrl(): string {
  return getCrmApiBaseUrl();
}

/** Бонусы: balance, bcard — `${BONUS_API_BASE_URL}/api/crm/*` */
export function getBonusBackendBaseUrl(): string {
  return getBonusApiBaseUrl();
}

async function getBearer(): Promise<string | null> {
  try {
    return await getValidAccessToken();
  } catch {
    return null;
  }
}

async function handleCrmSessionExpired(): Promise<{ success: false; error: string }> {
  await authApiClient.logout();
  navigateToLoginAfterSessionExpired();
  return { success: false, error: 'Сессия истекла. Войдите в аккаунт повторно.' };
}

async function postCrmSubmit(
  base: string,
  path: string,
  bearer: string,
  idempotencyKey: string,
  payload: CrmBookingQueuePayload,
): Promise<{
  ok: boolean;
  status: number;
  data: { success?: boolean; error?: string; data?: { id?: string; requestId?: string; bookingNumber?: string } };
}> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ idempotencyKey, payload }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
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
  let bearer = await getBearer();
  if (!bearer) {
    return { success: false, error: 'Требуется авторизация' };
  }

  try {
    let lastError = 'CRM error';

    for (const path of CRM_SUBMIT_PATHS) {
      let attempt = await postCrmSubmit(base, path, bearer, idempotencyKey, payload);

      if (attempt.status === 401) {
        const outcome = await authApiClient.refreshWithOutcome();
        if (outcome === 'ok') {
          bearer = (await getBearer()) || bearer;
          attempt = await postCrmSubmit(base, path, bearer, idempotencyKey, payload);
          if (attempt.status === 401) {
            return handleCrmSessionExpired();
          }
        } else if (outcome === 'auth_failed') {
          return handleCrmSessionExpired();
        } else {
          return { success: false, error: 'Нет сети. Повторите отправку заявки позже.' };
        }
      }

      if (attempt.status === 404 || attempt.status === 405) {
        lastError = attempt.data?.error || `HTTP ${attempt.status}`;
        continue;
      }

      if (!attempt.ok) {
        return { success: false, error: attempt.data?.error || `HTTP ${attempt.status}` };
      }
      if (!attempt.data.success) {
        return { success: false, error: attempt.data?.error || 'CRM error' };
      }
      return { success: true, data: attempt.data.data };
    }

    return { success: false, error: lastError };
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
  const base = getBonusBackendBaseUrl();
  if (!base) return { success: false, error: 'no_backend' };
  const bearer = await getBearer();
  if (!bearer) return { success: false, error: 'unauthorized' };
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (phone) params.set('phone', phone);
  const query = params.toString();
  let lastError = 'CRM error';
  try {
    for (const path of CRM_BONUS_BALANCE_PATHS) {
      const res = await fetch(`${base}${path}?${query}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 404 || res.status === 405) {
        lastError = data?.error || `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) return { success: false, error: data?.error || `HTTP ${res.status}` };
      return { success: !!data.success, data: data.data, error: data.error };
    }
    return { success: false, error: lastError };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

async function postCrmJson(
  paths: readonly string[],
  body: Record<string, unknown>,
  resolveBase: () => string = getCrmBackendBaseUrl,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const base = resolveBase();
  if (!base) return { success: false, error: 'no_backend' };
  const bearer = await getBearer();
  if (!bearer) return { success: false, error: 'unauthorized' };
  let lastError = 'CRM error';
  try {
    for (const path of paths) {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify(body),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 404 || res.status === 405) {
        lastError = data?.error || `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) return { success: false, error: data?.error || `HTTP ${res.status}` };
      return { success: !!data.success, data: data.data, error: data.error };
    }
    return { success: false, error: lastError };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function activateBonusCardViaBackend(
  bcNumber: string,
  userId?: number,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const payload: Record<string, unknown> = { bc_number: bcNumber.trim() };
  if (userId != null && userId > 0) payload.user_id = userId;
  return postCrmJson(CRM_BCARD_ACTIVATE_PATHS, payload, getBonusBackendBaseUrl);
}

export async function createBonusOperationViaBackend(params: {
  bc_id: number;
  type: 1 | 2;
  bonuses: number;
  reason?: string;
}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return postCrmJson(
    CRM_BCARD_BONUS_CREATE_PATHS,
    {
      bc_id: params.bc_id,
      type: params.type,
      bonuses: params.bonuses,
      ...(params.reason ? { reason: params.reason } : {}),
    },
    getBonusBackendBaseUrl,
  );
}
