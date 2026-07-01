/**
 * Проверка доступности интернета и бэкенда TravelHub (auth-mobile health → HTTP 200).
 */
import Constants from 'expo-constants';
import { getAuthApiUrl } from '../api/apiClient';
import { logger } from './logger';

const FETCH_TIMEOUT_MS = 8000;
const BACKEND_TIMEOUT_MS = 10000;

const GENERAL_INTERNET_URLS = [
  'https://www.apple.com/library/test/success.html',
  'https://www.cloudflare.com/cdn-cgi/trace',
];

function getHealthCheckToken(): string {
  const extra = Constants.expoConfig?.extra as { healthCheckToken?: string } | undefined;
  return String(extra?.healthCheckToken || '').trim();
}

function healthRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getHealthCheckToken();
  if (token) {
    headers['X-Health-Token'] = token;
  }
  return headers;
}

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
      const res = await fetchWithTimeout(url, { method: 'GET' }, FETCH_TIMEOUT_MS);
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
        headers: healthRequestHeaders(),
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
