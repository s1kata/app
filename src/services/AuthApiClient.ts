/**
 * HTTP-клиент авторизации через auth-mobile.php на сайте TravelHub.
 */
import { getAuthApiUrl } from '../api/apiClient';
import type { AuthTokenResponse, AuthUserProfile } from '../types/auth';
import { authSession } from './AuthSession';
import { logger } from '../utils/logger';

const LOG = '[AuthApiClient]';
const AUTH_API_REQUEST_TIMEOUT_MS = 15_000;

interface ApiErrorBody {
  success?: boolean;
  error?: string;
  code?: string;
}

async function postAuth<T extends ApiErrorBody>(
  action: string,
  body: Record<string, unknown>,
  bearer?: string,
): Promise<T> {
  const url = getAuthApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  if (__DEV__) logger.debug(`${LOG} ${action} → ${url}`);
  else logger.debug(`${LOG} ${action}`, { url });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_API_REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...body }),
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok || data.success === false) {
    const msg = data.error || `HTTP ${response.status}`;
    if (__DEV__) logger.debug(`${LOG} ${action} ошибка: ${msg}`);
    else logger.debug(`${LOG} ${action} error`, { msg });
    throw new AuthApiError(msg, data.code, response.status);
  }
  return data;
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export const authApiClient = {
  async login(email: string, password: string): Promise<AuthTokenResponse> {
    const data = await postAuth<AuthTokenResponse>('login', { email, password });
    if (data.accessToken && data.refreshToken && data.user && data.expiresIn) {
      await authSession.saveSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        user: data.user,
      });
    }
    return data;
  },

  async register(
    email: string,
    password: string,
    fullName: string,
    phone?: string,
  ): Promise<AuthTokenResponse> {
    const data = await postAuth<AuthTokenResponse>('register', {
      email,
      password,
      fullName,
      phone: phone || '',
    });
    if (data.accessToken && data.refreshToken && data.user && data.expiresIn) {
      await authSession.saveSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        user: data.user,
      });
    }
    return data;
  },

  async refresh(): Promise<boolean> {
    const refreshToken = await authSession.getRefreshToken();
    if (!refreshToken) return false;
    logger.debug('[AuthApiClient] refresh start');
    try {
      const data = await postAuth<AuthTokenResponse>('refresh', { refreshToken });
      if (data.accessToken && data.refreshToken && data.user && data.expiresIn) {
        await authSession.saveSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresIn: data.expiresIn,
          user: data.user,
        });
        logger.info('[AuthApiClient] refresh success');
        return true;
      }
      logger.warn('[AuthApiClient] refresh failed: invalid payload');
    } catch (e) {
      logger.warn('[AuthApiClient] refresh failed:', e);
    }
    return false;
  },

  async logout(): Promise<void> {
    const refreshToken = await authSession.getRefreshToken();
    try {
      if (refreshToken) {
        await postAuth('logout', { refreshToken });
      }
    } catch {
      /* ignore */
    }
    await authSession.clear();
  },

  async me(bearer?: string): Promise<AuthUserProfile | null> {
    const token = bearer || (await authSession.getAccessToken());
    if (!token) return null;
    const data = await postAuth<{ success: boolean; user: AuthUserProfile }>('me', {}, token);
    if (data.user) {
      await authSession.updateStoredUser(data.user);
    }
    return data.user || null;
  },

  async forgotPassword(email: string): Promise<{ success: boolean }> {
    await postAuth('forgot-password', { email });
    return { success: true };
  },

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    await postAuth('reset-password', { token, newPassword });
    return { success: true };
  },

  async updateProfile(updates: {
    fullName?: string;
    phone?: string;
    email?: string;
    passport?: Record<string, unknown> | null;
  }): Promise<AuthUserProfile> {
    const token = await getValidAccessToken();
    if (!token) throw new AuthApiError('Требуется авторизация', 'NO_TOKEN', 401);
    const data = await postAuth<{ success: boolean; user: AuthUserProfile }>(
      'update-profile',
      updates,
      token,
    );
    if (!data.user) throw new AuthApiError('Не удалось обновить профиль');
    await authSession.updateStoredUser(data.user);
    return data.user;
  },

  async deleteAccount(): Promise<{ success: boolean }> {
    const token = await getValidAccessToken();
    if (!token) throw new AuthApiError('Требуется авторизация', 'NO_TOKEN', 401);
    await postAuth('delete-account', {}, token);
    await authSession.clear();
    return { success: true };
  },
};

/** Access token с авто-refresh при истечении. */
export async function getValidAccessToken(): Promise<string | null> {
  const token = await authSession.getAccessToken();
  if (!token) return null;

  const expired = await authSession.isAccessTokenExpired();
  if (!expired) return token;

  const refreshed = await authApiClient.refresh();
  if (!refreshed) {
    await authSession.clear();
    return null;
  }
  return authSession.getAccessToken();
}
