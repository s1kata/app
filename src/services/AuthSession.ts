/**
 * Хранение JWT-сессии (access + refresh) после входа через travelhub63.ru API.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppUser, AuthUserProfile } from '../types/auth';
import { logger } from '../utils/logger';

const KEYS = {
  accessToken: '@travelhub/access_token',
  refreshToken: '@travelhub/refresh_token',
  expiresAt: '@travelhub/token_expires_at',
  user: '@travelhub/auth_user',
} as const;

export function profileToAppUser(profile: AuthUserProfile): AppUser {
  return {
    uid: profile.id,
    email: profile.email || null,
    displayName: profile.fullName || null,
    phoneNumber: profile.phone || null,
    isAnonymous: false,
  };
}

export const authSession = {
  async saveSession(data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: AuthUserProfile;
  }): Promise<void> {
    const expiresAt = Date.now() + data.expiresIn * 1000 - 30_000;
    await AsyncStorage.multiSet([
      [KEYS.accessToken, data.accessToken],
      [KEYS.refreshToken, data.refreshToken],
      [KEYS.expiresAt, String(expiresAt)],
      [KEYS.user, JSON.stringify(data.user)],
    ]);
    logger.debug('[AuthSession] Сессия сохранена, uid:', data.user.id);
  },

  async clear(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
    logger.debug('[AuthSession] Сессия очищена');
  },

  async getStoredUser(): Promise<AuthUserProfile | null> {
    const raw = await AsyncStorage.getItem(KEYS.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUserProfile;
    } catch {
      return null;
    }
  },

  async getAppUser(): Promise<AppUser | null> {
    const profile = await this.getStoredUser();
    return profile ? profileToAppUser(profile) : null;
  },

  async getAccessToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.accessToken);
  },

  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.refreshToken);
  },

  async isAccessTokenExpired(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(KEYS.expiresAt);
    if (!raw) return true;
    const expiresAt = Number(raw);
    return !Number.isFinite(expiresAt) || Date.now() >= expiresAt;
  },

  async updateStoredUser(user: AuthUserProfile): Promise<void> {
    await AsyncStorage.setItem(KEYS.user, JSON.stringify(user));
  },

  async updateAccessToken(accessToken: string, expiresIn: number): Promise<void> {
    const expiresAt = Date.now() + expiresIn * 1000 - 30_000;
    await AsyncStorage.multiSet([
      [KEYS.accessToken, accessToken],
      [KEYS.expiresAt, String(expiresAt)],
    ]);
  },
};
