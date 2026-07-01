import { AuthApiError } from '../services/AuthApiClient';

export type RefreshOutcome = 'ok' | 'auth_failed' | 'network_error';

/** Сбрасывать сессию только при отклонении refresh-токена сервером, не при сети. */
export function classifyRefreshFailure(error: unknown): RefreshOutcome {
  if (error instanceof AuthApiError) {
    const code = String(error.code || '').toUpperCase();
    if (code === 'INVALID_REFRESH' || code === 'ACCOUNT_DISABLED') {
      return 'auth_failed';
    }
    if (error.status === 401 || error.status === 403) {
      return 'auth_failed';
    }
    return 'network_error';
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (error.name === 'AbortError' || msg.includes('abort')) {
      return 'network_error';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
      return 'network_error';
    }
  }
  return 'network_error';
}

export function isDefiniteAuthFailure(error: unknown): boolean {
  return classifyRefreshFailure(error) === 'auth_failed';
}
