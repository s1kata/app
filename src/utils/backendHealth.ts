/**
 * Проверка доступности бэкенда TravelHub (auth-mobile health → HTTP 200).
 * Не используем apple.com — на части сетей он недоступен при рабочем travelhub63.ru.
 */
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { getAuthApiUrl, getSiteBaseUrl } from '../config/apiEndpoints';
import { logger } from './logger';

const FETCH_TIMEOUT_MS = 8000;
const BACKEND_TIMEOUT_MS = 12000;

function appExtra(): Record<string, unknown> {
  return (
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ||
    (Constants as { easConfig?: { extra?: Record<string, unknown> } }).easConfig?.extra ||
    {}
  );
}

export function getHealthCheckToken(): string {
  return String(appExtra().healthCheckToken || '').trim();
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

/** NetInfo: устройство считает себя без сети. */
export async function isDeviceOffline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === false;
  } catch {
    return false;
  }
}

/** Лёгкий ping своего хоста (без health-токена — может быть 403, это ок для «есть маршрут»). */
export async function pingSiteReachable(): Promise<boolean> {
  const base = getSiteBaseUrl();
  if (!base) return false;
  try {
    const res = await fetchWithTimeout(`${base}/api/health.php`, { method: 'GET' }, FETCH_TIMEOUT_MS);
    return res.ok || res.status === 403 || res.status === 401;
  } catch (e) {
    logger.debug('[backendHealth] site ping failed:', (e as Error)?.message || e);
    return false;
  }
}

/** Бэкенд auth-mobile ответил HTTP 200 на health с токеном. */
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
    if (response.ok) return true;
    logger.debug('[backendHealth] health HTTP', response.status, 'tokenConfigured', !!getHealthCheckToken());
    return false;
  } catch (e) {
    logger.debug('[backendHealth] backend health failed:', url, (e as Error)?.message || e);
    return false;
  }
}

/** @deprecated — оставлено для диагностики; не блокирует UI. */
export async function pingGeneralInternet(): Promise<boolean> {
  if (await isDeviceOffline()) return false;
  if (await pingBackendHealth()) return true;
  return pingSiteReachable();
}
