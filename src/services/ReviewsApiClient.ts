/**
 * Отзывы через CRM API на travelhub63.ru (JWT Bearer).
 */
import { getValidAccessToken } from './AuthApiClient';
import { getCrmApiBaseUrl } from '../config/apiEndpoints';
import { logger } from '../utils/logger';

const REVIEWS_PATHS = ['/api/crm/reviews.php', '/api/crm/reviews'] as const;
const HELPFUL_PATHS = ['/api/crm/review-helpful.php', '/api/crm/review-helpful'] as const;

export type ReviewDto = {
  id: string;
  userId: string;
  userName: string;
  tourId?: string | null;
  hotelId?: string | null;
  rating: number;
  text: string;
  helpful: number;
  verified: boolean;
  date: string;
  isOwn?: boolean;
  userMarkedHelpful?: boolean;
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error('unauthorized');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function fetchJson<T>(
  paths: readonly string[],
  init: RequestInit,
): Promise<{ success: boolean; data?: T; error?: string }> {
  const base = getCrmApiBaseUrl();
  if (!base) {
    return { success: false, error: 'CRM base URL not configured' };
  }
  let lastError = 'Request failed';
  for (const path of paths) {
    try {
      const res = await fetch(`${base}${path}`, init);
      const data = await res.json().catch(() => ({}));
      if (res.status === 404 || res.status === 405) {
        lastError = data?.error || `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) {
        return { success: false, error: data?.error || `HTTP ${res.status}` };
      }
      return data as { success: boolean; data?: T; error?: string };
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Network error';
      logger.debug('[ReviewsApiClient]', path, lastError);
    }
  }
  return { success: false, error: lastError };
}

export async function listReviews(params: {
  tourId?: string;
  hotelId?: string;
  withAuth?: boolean;
}): Promise<ReviewDto[]> {
  const base = getCrmApiBaseUrl();
  if (!base) return [];

  const qs = new URLSearchParams();
  if (params.tourId) qs.set('tourId', params.tourId);
  if (params.hotelId) qs.set('hotelId', params.hotelId);
  const query = qs.toString();

  let headers: Record<string, string> = { Accept: 'application/json' };
  if (params.withAuth) {
    try {
      headers = { ...headers, ...(await authHeaders()) };
    } catch {
      /* list without auth */
    }
  }

  let lastError = 'Request failed';
  for (const path of REVIEWS_PATHS) {
    try {
      const url = `${base}${path}${query ? `?${query}` : ''}`;
      const res = await fetch(url, { method: 'GET', headers });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404 || res.status === 405) {
        lastError = json?.error || `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok || !json.success) {
        logger.debug('[ReviewsApiClient] list failed:', json?.error || res.status);
        return [];
      }
      return Array.isArray(json.data) ? (json.data as ReviewDto[]) : [];
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Network error';
    }
  }
  logger.debug('[ReviewsApiClient] list:', lastError);
  return [];
}

export async function createReview(payload: {
  tourId?: string;
  hotelId?: string;
  rating: number;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const headers = await authHeaders();
  const res = await fetchJson<{ id: string }>(REVIEWS_PATHS, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return { success: !!res.success, error: res.error };
}

export async function updateReview(
  id: string,
  payload: { rating: number; text: string },
): Promise<{ success: boolean; error?: string }> {
  const headers = await authHeaders();
  const res = await fetchJson<{ id: string }>(REVIEWS_PATHS, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ id, ...payload }),
  });
  return { success: !!res.success, error: res.error };
}

export async function deleteReview(id: string): Promise<{ success: boolean; error?: string }> {
  const headers = await authHeaders();
  const base = getCrmApiBaseUrl();
  if (!base) return { success: false, error: 'no backend' };
  for (const path of REVIEWS_PATHS) {
    try {
      const res = await fetch(`${base}${path}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404 || res.status === 405) continue;
      if (!res.ok) return { success: false, error: json?.error || `HTTP ${res.status}` };
      return { success: !!json.success };
    } catch {
      /* try next path */
    }
  }
  return { success: false, error: 'Request failed' };
}

export async function toggleReviewHelpful(
  reviewId: string,
  helpful: boolean,
): Promise<{ success: boolean; helpful?: number; error?: string }> {
  const headers = await authHeaders();
  const res = await fetchJson<{ helpful: number; userMarkedHelpful: boolean }>(HELPFUL_PATHS, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reviewId, helpful }),
  });
  return {
    success: !!res.success,
    helpful: res.data?.helpful,
    error: res.error,
  };
}
