/**
 * Проверка доступности интернета и бэкенда TravelHub (auth-mobile health → HTTP 200).
 */
import { getAuthApiUrl } from '../api/apiClient';
import { logger } from './logger';

const FETCH_TIMEOUT_MS = 8000;
const BACKEND_TIMEOUT_MS = 10000;

const GENERAL_INTERNET_URLS = [
  // 1) Проверяем свой домен в первую очередь (самый релевантный для приложения)
  getAuthApiUrl(),
  // 2) Нейтральные fallback URL (на iOS обычно резолвятся стабильнее, чем gstatic/exp.host)
  'https://www.apple.com/library/test/success.html',
  'https://www.cloudflare.com/cdn-cgi/trace',
];

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Есть ли общий доступ в интернет (не наш бэкенд). */
export async function pingGeneralInternet(): Promise<boolean> {
  for (const url of GENERAL_INTERNET_URLS) {
    try {
      const method = url === getAuthApiUrl() ? 'POST' : 'GET';
      const init: RequestInit =
        method === 'POST'
          ? {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'health' }),
            }
          : { method };
      const res = await fetchWithTimeout(url, init, FETCH_TIMEOUT_MS);
      if (res && (res.status === 204 || res.status === 200 || res.ok)) return true;
    } catch (e) {
      logger.debug('[backendHealth] general ping failed:', url, (e as Error)?.message || e);
    }
  }
  return false;
}

/** Бэкенд ответил HTTP 200 (health). */
export async function pingBackendHealth(): Promise<boolean> {
  const url = getAuthApiUrl();
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'health' }),
      },
      BACKEND_TIMEOUT_MS,
    );
    return response.ok;
  } catch (e) {
    logger.debug('[backendHealth] backend health failed:', url, (e as Error)?.message || e);
    return false;
  }
}
