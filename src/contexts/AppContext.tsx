import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useColorScheme, PixelRatio, Dimensions, AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { i18n, Language } from '../config/i18n';
import { themeManager, ThemeMode, Theme } from '../config/theme';
import { settingsService, Currency } from '../services/SettingsService';
import { AuthService } from '../services/AuthService';
import { authSession, profileToAppUser } from '../services/AuthSession';
import { authApiClient } from '../services/AuthApiClient';
import type { AppUser } from '../types/auth';

/** Свой ключ только для гостя / явного локального fallback — не для Firebase User. */
const CURRENT_USER_STORAGE_KEY = 'currentUser';

/** Разрешённые к персисту снимки: гость или минимальный local-fallback (без токенов SDK). */
function isPersistableGuestOrLocalSnapshot(parsed: unknown): parsed is Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  const uid = typeof p.uid === 'string' ? p.uid : '';
  if (p.isAnonymous === true || uid.startsWith('guest_')) return true;
  if (p.__travelhubLocalFallback === true && uid.startsWith('local_')) return true;
  return false;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheService } from '../services/CacheService';
import { tourvisorApi } from '../services/TourvisorApiService';
import { dictionaryService } from '../services/DictionaryService';
import { priceTrackingService } from '../services/PriceTrackingService';
import { sotaCrmService } from '../services/SotaCrmService';
import { networkService, NetworkConnectionState } from '../services/NetworkService';
import { logger } from '../utils/logger';

function isTourvisorPassthroughBaseUrl(baseUrl: string): boolean {
  return /\/api\/tourvisor-mobile\b/i.test(baseUrl);
}

interface AppContextType {
  theme: Theme;
  themeMode: ThemeMode;
  /** Фактическая тёмная тема (учитывает auto → системная схема). Для StatusBar, градиентов и т.п. */
  isDark: boolean;
  language: Language;
  currency: Currency;
  user: AppUser | null;
  fontScale: number; // Масштаб шрифта из системных настроек
  isAuthenticated: boolean;
  /** true после восстановления сессии (JWT / гость) */
  authReady: boolean;
  updateCounter: number; // Для принудительного обновления компонентов
  // Tourvisor API
  tourvisorToken: string | null;
  apiReady: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
  setCurrency: (curr: Currency) => Promise<void>;
  refreshTheme: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  loginAsGuest: () => Promise<void>;
  sendPhoneVerification: (phoneNumber: string) => Promise<string>;
  verifyPhoneCode: (verificationId: string, code: string) => Promise<void>;
  // Tourvisor API methods
  setTourvisorToken: (token: string) => Promise<void>;
  initializeApi: () => Promise<void>;
  clearRateLimitCooldown: () => Promise<void>;
  networkConnection: NetworkConnectionState;
  /** Кратковременный flash «соединение восстановлено» */
  networkRecoveredFlash: boolean;
  /** Инкремент при восстановлении бэкенда — перезагрузка экранов */
  backendRefreshCounter: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Default theme (дизайн-система: глубокий синий + акцент оранжевый)
const defaultTheme: Theme = {
  primary: '#0066CC',
  secondary: '#3399FF',
  deep: '#004999',
  accent: '#FF6B00',
  background: '#F5F7FA',
  secondaryBackground: '#F0F7FF',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  secondaryText: '#666666',
  tertiaryText: '#999999',
  success: '#27AE60',
  error: '#E74C3C',
  warning: '#F39C12',
  border: 'rgba(0, 102, 204, 0.12)',
  lightGray: '#EEF2F7',
  shadow: '#000000',
  inactive: '#BBBBBB',
  disabled: 'rgba(187, 187, 187, 0.5)',
  card: '#FFFFFF',
  notification: '#E74C3C',
  gradient: {
    primary: ['#0066CC', '#3399FF'],
    secondary: ['#3399FF', '#0066CC'],
    accent: ['#FF6B00', '#FF8C33'],
  },
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [isDark, setIsDark] = useState(false);
  const [language, setLanguageState] = useState<Language>('ru');
  const [currency, setCurrencyState] = useState<Currency>('RUB');
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [updateCounter, setUpdateCounter] = useState(0);
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // Получаем масштаб шрифта из системных настроек
  const [fontScale, setFontScale] = useState(() => PixelRatio.getFontScale());

  // Tourvisor API state
  const [tourvisorToken, setTourvisorTokenState] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean>(false);
  const [networkConnection, setNetworkConnection] = useState<NetworkConnectionState>(() =>
    networkService.connection,
  );
  const [networkRecoveredFlash, setNetworkRecoveredFlash] = useState(false);
  const [backendRefreshCounter, setBackendRefreshCounter] = useState(0);

  // Отслеживаем изменения размера шрифта системы
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      const newFontScale = PixelRatio.getFontScale();
      setFontScale(newFontScale);
    });
    
    // Обновляем при монтировании
    setFontScale(PixelRatio.getFontScale());
    
    return () => {
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void loadSettings(isCancelled);

    // Сначала базовый URL (синхронно), затем токен — чтобы passthrough определялся до первого fetch.
    const apiBaseUrl = Constants.expoConfig?.extra?.tourvisorApiUrl;
    const workerApiUrl = Constants.expoConfig?.extra?.tourvisorWorkerUrl;
    if (typeof workerApiUrl === 'string' && /^https?:\/\//i.test(workerApiUrl.trim())) {
      const normalizedWorkerUrl = workerApiUrl.trim().replace(/\/+$/, '');
      tourvisorApi.setBaseUrl(normalizedWorkerUrl);
      logger.debug('Tourvisor API base URL set from worker URL:', normalizedWorkerUrl);
    } else if (apiBaseUrl && typeof apiBaseUrl === 'string' && /^https?:\/\//i.test(apiBaseUrl.trim())) {
      tourvisorApi.setBaseUrl(apiBaseUrl.trim().replace(/\/+$/, ''));
      logger.debug('Tourvisor API base URL set from environment:', apiBaseUrl);
    }

    // Загрузка JWT только для dev/прямого API. В preview/production токен на сервере (tourvisor-mobile).
    const loadToken = async () => {
      const extra = Constants.expoConfig?.extra ?? {};
      const envToken = extra.tourvisorToken;
      const rawEnv = typeof envToken === 'string' ? envToken : '';
      const workerUrl = typeof extra.tourvisorWorkerUrl === 'string' ? extra.tourvisorWorkerUrl : '';
      const buildProfile = typeof extra?.eas?.buildProfile === 'string' ? extra.eas.buildProfile : undefined;
      const base = tourvisorApi.getBaseUrl();

      if (__DEV__) {
        console.error('[FORCE_LOG] AppContext token bootstrap', {
          buildProfile: buildProfile || 'unknown',
          tourvisorBase: base,
          passthrough: isTourvisorPassthroughBaseUrl(base),
          hasToken: !!rawEnv,
          tokenLength: rawEnv?.length || 0,
          hasWorkerUrl: !!workerUrl,
          workerUrl: workerUrl || null,
        });
      } else {
        logger.debug('[AppContext] token bootstrap', {
          buildProfile: buildProfile || 'unknown',
          passthrough: isTourvisorPassthroughBaseUrl(base),
        });
      }

      const isValidToken = (token: string | null | undefined): boolean => {
        if (!token || token.trim() === '') return false;
        if (token.includes('${') || token.includes('your_') || token.includes('TOURVISOR_TOKEN')) return false;
        return token.length > 20 && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/.test(token);
      };

      if (isTourvisorPassthroughBaseUrl(base)) {
        if (isCancelled()) return;
        setTourvisorTokenState(null);
        tourvisorApi.setJwtToken('');
        logger.debug('[Token Load] Режим прокси tourvisor-mobile — клиентский JWT не используется');
        void initializeApi();
        return;
      }

      if (rawEnv && isValidToken(rawEnv)) {
        if (isCancelled()) return;
        setTourvisorTokenState(rawEnv);
        tourvisorApi.setJwtToken(rawEnv);
        if (__DEV__) {
          console.error('[FORCE_LOG] Tourvisor token accepted', {
            tokenLength: rawEnv.length,
            workerUrl: workerUrl || null,
          });
        }
        logger.debug('[Token Load] Токен из .env / extra (длина:', rawEnv.length, ')');
        void initializeApi();
        return;
      }

      if (rawEnv && !isValidToken(rawEnv)) {
        logger.warn('⚠️ TOURVISOR_TOKEN в .env невалидный или плейсхолдер. Ожидается JWT.');
      } else {
        logger.warn('⚠️ TOURVISOR_TOKEN не попал в приложение. Проверьте .env и перезапустите "expo start" (лучше с --clear).');
      }

      logger.warn('⚠️ Tourvisor JWT token must be provided via secure env configuration.');
      if (__DEV__) console.error('[FORCE_LOG] Tourvisor token missing or invalid');
      setApiReady(false);
    };
    void loadToken();

    // Восстановление сессии выполняем асинхронно и не блокируем старт UI.
    void restoreAuthSession()
      .then(() => logger.debug('[AppContext] restoreAuthSession finished'))
      .catch((e) => logger.error('[AppContext] restoreAuthSession failed:', e));

    // Опционально: локальный URL для SOTA (тест без реального U-ON)
    const crmBaseUrl = Constants.expoConfig?.extra?.sotaCrmBaseUrl;
    if (crmBaseUrl && typeof crmBaseUrl === 'string' && crmBaseUrl.trim() !== '') {
      sotaCrmService.setBaseUrl(crmBaseUrl.trim().replace(/\/+$/, ''));
      logger.debug('SOTA base URL set for testing:', crmBaseUrl);
    }

    // Инициализируем сервис отслеживания цен
    priceTrackingService.initialize().then(() => {
      if (isCancelled()) return;
      // Запускаем автоматическую проверку цен каждые 6 часов
      priceTrackingService.startAutoCheck(6);
      logger.debug('PriceTrackingService initialized and auto-check started');
    }).catch(error => {
      logger.error('Failed to initialize PriceTrackingService:', error);
    });

    // Предзагрузка справочников при старте приложения (для создания начального кэша)
    // Запускаем с небольшой задержкой, чтобы не блокировать инициализацию
    let innerDictionaryTimeout: ReturnType<typeof setTimeout> | undefined;
    const outerDictionaryTimeout = setTimeout(() => {
      if (isCancelled()) return;
      dictionaryService.preloadCommonData().catch(error => {
        logger.debug('Preload dictionary data failed:', error?.message);
      });
      
      // Также запускаем фоновое обновление устаревших справочников
      innerDictionaryTimeout = setTimeout(() => {
        if (isCancelled()) return;
        dictionaryService.updateStaleDictionaries().catch(error => {
          logger.debug('Background dictionary update failed:', error?.message);
        });
      }, 5000); // Еще через 5 секунд для обновления устаревших данных
    }, 2000); // 2 секунды после старта

    return () => {
      cancelled = true;
      clearTimeout(outerDictionaryTimeout);
      if (innerDictionaryTimeout) clearTimeout(innerDictionaryTimeout);
      priceTrackingService.stopAutoCheck();
    };
  }, []);

  // Обновляем тему при изменении системной темы или режима темы
  useEffect(() => {
    themeManager.setSystemColorScheme(systemColorScheme || 'light');
    const newTheme = themeManager.getTheme();
    setTheme(newTheme);
    setIsDark(themeManager.isDark());
    logger.debug('Theme updated:', themeMode, 'isDark:', themeManager.isDark(), 'systemScheme:', systemColorScheme);
  }, [systemColorScheme, themeMode]);

  const loadSettings = async (isCancelled?: () => boolean) => {
    const dead = () => isCancelled?.() === true;
    try {
      const settings = await settingsService.loadSettings();
      if (dead()) return;
      logger.debug('Loaded settings:', settings);

      setThemeModeState(settings.theme);
      setLanguageState(settings.language);
      setCurrencyState(settings.currency);

      // Обновляем ThemeManager с загруженными настройками
      await themeManager.setMode(settings.theme);
      if (dead()) return;
      themeManager.setSystemColorScheme(systemColorScheme || 'light');
      
      // Если тема установлена в 'auto', используем системную тему
      if (settings.theme === 'auto') {
        const effectiveTheme = themeManager.getTheme();
        if (dead()) return;
        setTheme(effectiveTheme);
        setIsDark(themeManager.isDark());
      }
      if (dead()) return;
      i18n.setLanguage(settings.language);

      // Update theme after settings are loaded
      const currentTheme = themeManager.getTheme();
      if (dead()) return;
      if (currentTheme) {
        setTheme(currentTheme);
        setIsDark(themeManager.isDark());
      } else {
        setTheme(defaultTheme);
        setIsDark(false);
      }
    } catch (error) {
      logger.error('Failed to load settings:', error);
      if (dead()) return;
      // Ensure we have a theme even if settings fail
      setTheme(defaultTheme);
      setIsDark(false);
    }

    if (dead()) return;

    // Load Tourvisor JWT token only from env configuration.
    // Проверяем, что токен не является плейсхолдером
    const isValidToken = (token: string | null | undefined): boolean => {
      if (!token || token.trim() === '') return false;
      // Проверяем, что это не плейсхолдер
      if (token.includes('${') || token.includes('your_') || token.includes('TOURVISOR_TOKEN')) {
        return false;
      }
      // JWT токен обычно начинается с букв и содержит точки
      return token.length > 20 && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/.test(token);
    };
    
    const tvUrl = String(Constants.expoConfig?.extra?.tourvisorApiUrl || '');
    const tvWorker = String(Constants.expoConfig?.extra?.tourvisorWorkerUrl || '');
    const looksPassthrough =
      isTourvisorPassthroughBaseUrl(tourvisorApi.getBaseUrl()) ||
      isTourvisorPassthroughBaseUrl(tvUrl) ||
      isTourvisorPassthroughBaseUrl(tvWorker);
    if (!looksPassthrough && !tourvisorToken) {
      logger.warn('⚠️ Tourvisor JWT token not found. Задайте TOURVISOR_TOKEN в EAS Secrets или .env');
    } else if (!looksPassthrough && tourvisorToken) {
      logger.debug('Tourvisor JWT token already set from environment');
    }

    if (!dead()) {
      setUpdateCounter(prev => prev + 1);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    logger.debug('Setting theme mode to:', mode);
    setThemeModeState(mode);
    
    // Обновляем ThemeManager
    await themeManager.setMode(mode);
    themeManager.setSystemColorScheme(systemColorScheme || 'light');
    
    // Сохраняем в настройки
    await settingsService.setTheme(mode);
    
    // Получаем и применяем новую тему
    const newTheme = themeManager.getTheme();
    const dark = themeManager.isDark();
    logger.debug('Theme updated:', newTheme.background, 'isDark:', dark);
    setTheme(newTheme);
    setIsDark(dark);
    
    // Принудительно обновляем все компоненты
    setUpdateCounter(prev => prev + 1);
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    i18n.setLanguage(lang);
    await settingsService.setLanguage(lang);
    setUpdateCounter(prev => prev + 1);
  };

  const setCurrency = async (curr: Currency) => {
    setCurrencyState(curr);
    await settingsService.setCurrency(curr);
    setUpdateCounter(prev => prev + 1);
  };

  const refreshTheme = () => {
    const newTheme = themeManager.getTheme();
    setTheme(newTheme);
    setIsDark(themeManager.isDark());
    setUpdateCounter(prev => prev + 1);
  };

  const restoreAuthSession = async () => {
    try {
      const refreshToken = await authSession.getRefreshToken();
      const accessToken = await authSession.getAccessToken();

      if (refreshToken || accessToken) {
        const expired = await authSession.isAccessTokenExpired();
        if (expired && refreshToken) {
          const outcome = await authApiClient.refreshWithOutcome();
          if (outcome === 'auth_failed') {
            await authSession.clear();
          }
        }
        const appUser = await AuthService.getAppUserFromSession();
        const stillHasSession =
          appUser && ((await authSession.getRefreshToken()) || (await authSession.getAccessToken()));
        if (stillHasSession && appUser) {
          logger.debug('Auth session restored, uid:', appUser.uid);
          setUser(appUser);
          await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
          setAuthReady(true);
          return;
        }
      }

      const savedUser = await AsyncStorage.getItem(CURRENT_USER_STORAGE_KEY);
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        if (isPersistableGuestOrLocalSnapshot(parsedUser)) {
          logger.debug('Loading guest user from storage');
          setUser(parsedUser as unknown as AppUser);
          setAuthReady(true);
          return;
        }
        await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      }

      logger.debug('No persisted user, showing login');
      setUser(null);
      setAuthReady(true);
    } catch (error) {
      logger.error('Error restoring auth session:', error);
      setUser(null);
      setAuthReady(true);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      logger.debug('Attempting login via AuthService (travelhub API)...');
      const savedUser = await AsyncStorage.getItem(CURRENT_USER_STORAGE_KEY);
      if (savedUser) {
        let parsedUser: { uid?: string; isAnonymous?: boolean };
        try {
          parsedUser = JSON.parse(savedUser);
        } catch {
          await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
          parsedUser = {};
        }
        if (parsedUser.uid?.startsWith('guest_') || parsedUser.isAnonymous === true) {
          logger.debug('Removing guest user before login');
          await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
          setUser(null);
        }
      }

      const result = await AuthService.login(email, password);
      if (!result.success) {
        const msg = result.error || i18n.t('auth.connectionError');
        if (
          msg.includes('базе данных') ||
          msg.includes('DB_CONNECT') ||
          msg.includes('auth-mobile.config')
        ) {
          throw new Error(msg);
        }
        if (msg.includes('сети') || (msg.includes('сервер') && !msg.includes('базе'))) {
          throw new Error(i18n.t('auth.connectionError'));
        }
        if (msg.includes('Неверный email') || msg.includes('пароль')) {
          throw new Error(i18n.t('auth.wrongCredentials'));
        }
        throw new Error(msg);
      }

      const appUser = await AuthService.getAppUserFromSession();
      if (appUser) {
        logger.debug('Login successful, user:', appUser.uid);
        setUser(appUser);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message) {
        throw error;
      }
      logger.error('Login error:', error);
      throw new Error(i18n.t('auth.connectionError'));
    }
  };

  const register = async (email: string, password: string, fullName: string, phone?: string) => {
    try {
      const savedUser = await AsyncStorage.getItem(CURRENT_USER_STORAGE_KEY);
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        if (parsedUser.uid?.startsWith('guest_') || parsedUser.isAnonymous === true) {
          logger.debug('Removing guest user before registration');
          await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
          setUser(null);
        }
      }

      const result = await AuthService.register(email, password, fullName, phone);
      if (!result.success) {
        const msg = result.error || i18n.t('auth.registrationFailed');
        if (msg.includes('уже существует')) {
          throw new Error(i18n.t('auth.emailExists'));
        }
        if (msg.includes('слабый')) {
          throw new Error(i18n.t('auth.weakPassword'));
        }
        if (msg.includes('email')) {
          throw new Error(i18n.t('auth.invalidEmailFormat'));
        }
        throw new Error(msg);
      }

      const appUser = await AuthService.getAppUserFromSession();
      if (appUser) {
        logger.debug('Registration successful, user:', appUser.uid);
        setUser(appUser);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message) {
        throw error;
      }
      logger.error('Register error:', error);
      throw new Error(i18n.t('auth.registrationFailed'));
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
    } catch (error) {
      logger.error('Logout error:', error);
    }
    try {
      await cacheService.clearCacheAndUnblockApi();
    } catch (e) {
      logger.warn('clearCacheAndUnblockApi on logout:', e);
    }
    try {
      await dictionaryService.clearCache();
    } catch (e) {
      logger.warn('dictionaryService.clearCache on logout:', e);
    }
    setUser(null);
    await AsyncStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  };

  const loginAsGuest = async () => {
    const guestUser = {
      uid: 'guest_' + Date.now(),
      email: null,
      displayName: i18n.t('profile.guest'),
      isAnonymous: true
    } as AppUser;
    setUser(guestUser);
    await AsyncStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(guestUser));
    logger.debug('Logging in as guest');

    try {
      await AuthService.logout();
    } catch (e) {
      logger.debug('Clear session for guest mode:', e);
    }
  };

  const sendPhoneVerification = async (_phoneNumber: string): Promise<string> => {
    logger.warn('Phone verification is not configured.');
    throw new Error(i18n.t('auth.phoneAuthUnavailable'));
  };

  const verifyPhoneCode = async (_verificationId: string, _code: string) => {
    logger.warn('Phone verification is not configured (Firebase Phone Auth).');
    throw new Error(i18n.t('auth.phoneAuthUnavailable'));
  };

  // Tourvisor API methods
  const setTourvisorToken = async (token: string) => {
    try {
      setTourvisorTokenState(token);
      tourvisorApi.setJwtToken(token);
      logger.debug('Tourvisor JWT token set (memory only)');
    } catch (error) {
      logger.error('Error setting Tourvisor token:', error);
    }
  };

  const initializeApi = async () => {
    try {
      const passthrough = isTourvisorPassthroughBaseUrl(tourvisorApi.getBaseUrl());
      if (!passthrough && !tourvisorApi.getJwtToken()) {
        logger.warn('No Tourvisor JWT token available (direct API mode)');
        setApiReady(false);
        return;
      }

      logger.debug('Initializing Tourvisor API...', { passthrough });
      // Предзагрузка словарей - не блокируем инициализацию при ошибках
      // Ошибки 429 обрабатываются внутри preloadCommonData
      dictionaryService.preloadCommonData().catch(error => {
        logger.warn('Dictionary preload had errors (may be rate limited), but API is still ready:', error);
      });
      
      // Устанавливаем API как готовый даже если предзагрузка не завершилась
      // Словари будут загружены по требованию с использованием кэша
      setApiReady(true);
      logger.debug('Tourvisor API initialized successfully');
    } catch (error) {
      logger.error('Error initializing Tourvisor API:', error);
      // Не устанавливаем apiReady в false при ошибках - API может работать частично
      logger.warn('API initialization had errors, but continuing...');
    }
  };

  // Повторная инициализация, если в dev задали JWT после старта (прямой API, не passthrough).
  useEffect(() => {
    if (!tourvisorToken || apiReady) return;
    if (isTourvisorPassthroughBaseUrl(tourvisorApi.getBaseUrl())) return;
    let isMounted = true;
    initializeApi().catch(error => {
      if (isMounted) {
        logger.error('API initialization failed:', error);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [tourvisorToken, apiReady]);

  const refreshBackendData = React.useCallback(async () => {
    logger.debug('[AppContext] Backend OK — refreshing dictionaries and API');
    setBackendRefreshCounter((c) => c + 1);
    try {
      await initializeApi();
      await dictionaryService.updateStaleDictionaries();
    } catch (e) {
      logger.warn('[AppContext] refreshBackendData:', e);
    }
  }, [tourvisorToken]);

  useEffect(() => {
    const unsubConnection = networkService.subscribeConnection((state, prev) => {
      setNetworkConnection(state);
      if (prev.status !== 'ok' && state.status === 'ok') {
        setNetworkRecoveredFlash(true);
        void refreshBackendData();
      }
    });
    return () => unsubConnection();
  }, [refreshBackendData]);

  useEffect(() => {
    if (!networkRecoveredFlash) return;
    const t = setTimeout(() => setNetworkRecoveredFlash(false), 3500);
    return () => clearTimeout(t);
  }, [networkRecoveredFlash]);

  /** Продление сессии при возврате в приложение (без выхода из профиля). */
  const sessionRefreshInFlight = useRef(false);
  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active' || sessionRefreshInFlight.current) return;
      void (async () => {
        const refreshToken = await authSession.getRefreshToken();
        if (!refreshToken) return;
        const expired = await authSession.isAccessTokenExpired();
        if (!expired) return;
        sessionRefreshInFlight.current = true;
        try {
          const outcome = await authApiClient.refreshWithOutcome();
          if (outcome === 'auth_failed') {
            await authSession.clear();
            setUser(null);
            return;
          }
          if (outcome === 'ok') {
            const appUser = await AuthService.getAppUserFromSession();
            if (appUser) setUser(appUser);
          }
        } finally {
          sessionRefreshInFlight.current = false;
        }
      })();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, []);

  const contextValue: AppContextType = {
    theme: theme || defaultTheme,
    themeMode,
    isDark,
    fontScale,
    language,
    currency,
    user,
    isAuthenticated: !!user,
    authReady,
    // Tourvisor API
    tourvisorToken,
    apiReady,
    setThemeMode,
    setLanguage,
    setCurrency,
    refreshTheme,
    login,
    register,
    logout,
    loginAsGuest,
    sendPhoneVerification,
    verifyPhoneCode,
    // Tourvisor API methods
    setTourvisorToken,
    initializeApi,
    clearRateLimitCooldown: () => tourvisorApi.clearRateLimitCooldown(),
    networkConnection,
    networkRecoveredFlash,
    backendRefreshCounter,
    updateCounter, // Добавляем для принудительного обновления
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

  // Экспорт хука useAppContext
export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    // Return safe defaults if context is not available
    return {
      theme: defaultTheme,
      themeMode: 'light' as ThemeMode,
      isDark: false,
      fontScale: 1,
      language: 'ru' as Language,
      currency: 'RUB' as Currency,
      user: null,
      isAuthenticated: false,
      authReady: false,
      updateCounter: 0,
      tourvisorToken: null,
      apiReady: false,
      setThemeMode: async () => {},
      setLanguage: async () => {},
      setCurrency: async () => {},
      refreshTheme: () => {},
      login: async () => {},
      register: async () => {},
      logout: async () => {},
      loginAsGuest: async () => {},
      sendPhoneVerification: async () => '',
      verifyPhoneCode: async () => {},
      setTourvisorToken: async () => {},
      initializeApi: async () => {},
      clearRateLimitCooldown: async () => {},
      networkConnection: { status: 'ok', issue: null },
      networkRecoveredFlash: false,
      backendRefreshCounter: 0,
    };
  }
  return {
    ...context,
    theme: context.theme || defaultTheme,
  };
};
