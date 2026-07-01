/**
 * Хранение JWT-сессии (access + refresh) после входа через travelhub63.ru API.
 * Токены — в SecureStore (Keychain), с fallback на AsyncStorage до пересборки native.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppUser, AuthUserProfile } from '../types/auth';
import { logger } from '../utils/logger';

const KEYS = {
  accessToken: 'travelhub_access_token',
  refreshToken: 'travelhub_refresh_token',
  expiresAt: '@travelhub/token_expires_at',
  user: '@travelhub/auth_user',
  migrated: '@travelhub/secure_store_migrated',
} as const;

const LEGACY_KEYS = {
  accessToken: '@travelhub/access_token',
  refreshToken: '@travelhub/refresh_token',
} as const;

const FALLBACK_PREFIX = '@travelhub/secure_fallback/';

type SecureStoreModule = typeof import('expo-secure-store');

let secureStoreModule: SecureStoreModule | null | undefined;
let secureStoreUsable: boolean | null = null;
let migrationPromise: Promise<void> | null = null;

function getSecureStoreModule(): SecureStoreModule | null {
  if (secureStoreModule !== undefined) {
    return secureStoreModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStoreModule = require('expo-secure-store') as SecureStoreModule;
  } catch {
    secureStoreModule = null;
  }
  return secureStoreModule;
}

async function canUseSecureStore(): Promise<boolean> {
  if (secureStoreUsable !== null) {
    return secureStoreUsable;
  }
  const mod = getSecureStoreModule();
  if (!mod) {
    secureStoreUsable = false;
    if (__DEV__) {
      logger.warn('[AuthSession] SecureStore native module missing — using AsyncStorage fallback');
    }
    return false;
  }
  try {
    secureStoreUsable = await mod.isAvailableAsync();
  } catch {
    secureStoreUsable = false;
  }
  if (!secureStoreUsable && __DEV__) {
    logger.warn('[AuthSession] SecureStore unavailable — using AsyncStorage fallback');
  }
  return secureStoreUsable;
}

function fallbackKey(key: string): string {
  return `${FALLBACK_PREFIX}${key}`;
}

async function setTokenItem(key: string, value: string): Promise<void> {
  if (await canUseSecureStore()) {
    await getSecureStoreModule()!.setItemAsync(key, value);
    await AsyncStorage.removeItem(fallbackKey(key)).catch(() => {});
    return;
  }
  await AsyncStorage.setItem(fallbackKey(key), value);
}

async function getTokenItem(key: string): Promise<string | null> {
  if (await canUseSecureStore()) {
    const secure = await getSecureStoreModule()!.getItemAsync(key);
    if (secure) return secure;
  }
  return AsyncStorage.getItem(fallbackKey(key));
}

async function deleteTokenItem(key: string): Promise<void> {
  if (await canUseSecureStore()) {
    await getSecureStoreModule()!.deleteItemAsync(key).catch(() => {});
  }
  await AsyncStorage.removeItem(fallbackKey(key)).catch(() => {});
}

async function migrateLegacyTokensIfNeeded(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const migrated = await AsyncStorage.getItem(KEYS.migrated);
    if (migrated === '1') return;

    const [legacyAccess, legacyRefresh] = await AsyncStorage.multiGet([
      LEGACY_KEYS.accessToken,
      LEGACY_KEYS.refreshToken,
    ]);

    const access = legacyAccess[1];
    const refresh = legacyRefresh[1];
    if (access) {
      await setTokenItem(KEYS.accessToken, access);
    }
    if (refresh) {
      await setTokenItem(KEYS.refreshToken, refresh);
    }
    if (access || refresh) {
      await AsyncStorage.multiRemove([LEGACY_KEYS.accessToken, LEGACY_KEYS.refreshToken]);
    }
    await AsyncStorage.setItem(KEYS.migrated, '1');
  })();
  return migrationPromise;
}

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
    await migrateLegacyTokensIfNeeded();
    const expiresAt = Date.now() + data.expiresIn * 1000 - 30_000;
    await Promise.all([
      setTokenItem(KEYS.accessToken, data.accessToken),
      setTokenItem(KEYS.refreshToken, data.refreshToken),
      AsyncStorage.multiSet([
        [KEYS.expiresAt, String(expiresAt)],
        [KEYS.user, JSON.stringify(data.user)],
      ]),
    ]);
    logger.debug('[AuthSession] Сессия сохранена, uid:', data.user.id);
  },

  async clear(): Promise<void> {
    await migrateLegacyTokensIfNeeded();
    await Promise.all([
      deleteTokenItem(KEYS.accessToken),
      deleteTokenItem(KEYS.refreshToken),
      AsyncStorage.multiRemove([KEYS.expiresAt, KEYS.user, LEGACY_KEYS.accessToken, LEGACY_KEYS.refreshToken]),
    ]);
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
    await migrateLegacyTokensIfNeeded();
    return getTokenItem(KEYS.accessToken);
  },

  async getRefreshToken(): Promise<string | null> {
    await migrateLegacyTokensIfNeeded();
    return getTokenItem(KEYS.refreshToken);
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
    await Promise.all([
      setTokenItem(KEYS.accessToken, accessToken),
      AsyncStorage.setItem(KEYS.expiresAt, String(expiresAt)),
    ]);
  },
};
