// services/AuthService.ts — авторизация через travelhub63.ru (SQL, auth-mobile.php)
import type { AuthUserProfile } from '../types/auth';
import { UserProfile } from '../types/firestore';
import { authApiClient, AuthApiError } from './AuthApiClient';
import { authSession, profileToAppUser } from './AuthSession';
import { logger } from '../utils/logger';

const LOG_PREFIX = '[AuthService]';

function logStep(method: string, message: string, data?: unknown) {
  const line = `${LOG_PREFIX}.${method} ${message}`;
  if (__DEV__) logger.debug(line, data);
  else if (data !== undefined) logger.debug(line, data);
}

function mapAuthError(error: unknown, fallback: string): string {
  if (error instanceof AuthApiError) {
    if (error.code === 'INVALID_CREDENTIALS') return 'Неверный email или пароль';
    if (error.code === 'EMAIL_EXISTS') return 'Пользователь с таким email уже существует';
    if (error.code === 'WEAK_PASSWORD') return 'Пароль слишком слабый. Минимум 6 символов.';
    if (error.code === 'INVALID_EMAIL') return 'Некорректный формат email';
    if (error.code === 'ACCOUNT_DISABLED') return 'Аккаунт деактивирован';
    if (error.code === 'INVALID_TOKEN') return 'Неверный или просроченный код';
    return error.message || fallback;
  }
  if (error instanceof Error && error.message.includes('Network')) {
    return 'Ошибка сети. Проверьте интернет и попробуйте снова.';
  }
  return (error as Error)?.message || fallback;
}

function profileToUserProfile(p: AuthUserProfile): UserProfile {
  return {
    id: p.id,
    email: p.email,
    fullName: p.fullName,
    phone: p.phone,
    passwordHash: '',
    isActive: p.isActive,
    passport: p.passport
      ? {
          series: p.passport.series,
          number: p.passport.number,
          issuedBy: p.passport.issuedBy,
          issueDate: p.passport.issueDate,
          birthDate: p.passport.birthDate,
          birthPlace: p.passport.birthPlace,
        }
      : undefined,
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
  };
}

export class AuthService {
  static async register(
    email: string,
    password: string,
    fullName: string,
    phone?: string,
  ): Promise<{ success: boolean; userId?: string; error?: string }> {
    const method = 'register';
    logStep(method, 'Старт', { email: email.trim() });
    try {
      const data = await authApiClient.register(email, password, fullName, phone);
      logStep(method, 'Успех', { uid: data.user?.id });
      return { success: true, userId: data.user?.id };
    } catch (error) {
      logStep(method, 'Ошибка', error);
      return { success: false, error: mapAuthError(error, 'Неизвестная ошибка при регистрации') };
    }
  }

  static async login(
    email: string,
    password: string,
  ): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    const method = 'login';
    logStep(method, 'Старт', { email: email.trim() });
    try {
      const data = await authApiClient.login(email, password);
      if (!data.user) {
        return { success: false, error: 'Не удалось получить профиль пользователя' };
      }
      logStep(method, 'Успех', { uid: data.user.id });
      return { success: true, user: profileToUserProfile(data.user) };
    } catch (error) {
      logStep(method, 'Ошибка', error);
      return { success: false, error: mapAuthError(error, 'Неизвестная ошибка при входе') };
    }
  }

  static async findUserByEmail(email: string): Promise<UserProfile | null> {
    const stored = await authSession.getStoredUser();
    if (stored && stored.email.toLowerCase() === email.toLowerCase().trim()) {
      return profileToUserProfile(stored);
    }
    return null;
  }

  static async findUserById(userId: string): Promise<UserProfile | null> {
    const stored = await authSession.getStoredUser();
    if (stored && stored.id === userId) {
      return profileToUserProfile(stored);
    }
    return null;
  }

  static async updateLastLogin(_userId: string): Promise<void> {
    // Сервер обновляет last_login_at при login
  }

  static async checkUserExists(email: string): Promise<boolean> {
    const user = await this.findUserByEmail(email);
    return user !== null;
  }

  static async updateProfile(
    userId: string,
    updates: Partial<UserProfile>,
  ): Promise<boolean> {
    try {
      const stored = await authSession.getStoredUser();
      if (!stored || stored.id !== userId) return false;
      await authApiClient.updateProfile({
        fullName: updates.fullName,
        phone: updates.phone,
        email: updates.email,
        passport: updates.passport as Record<string, unknown> | null | undefined,
      });
      return true;
    } catch (error) {
      logger.error('❌ Ошибка обновления профиля:', error);
      return false;
    }
  }

  static async savePassport(
    userId: string,
    passportData: UserProfile['passport'],
  ): Promise<boolean> {
    return this.updateProfile(userId, { passport: passportData });
  }

  static async getCurrentUser(refresh = false): Promise<UserProfile | null> {
    try {
      const stored = await authSession.getStoredUser();
      if (!stored) return null;
      if (refresh) {
        try {
          const fresh = await authApiClient.me();
          if (fresh) return profileToUserProfile(fresh);
        } catch {
          logStep('getCurrentUser', 'fallback на локальный профиль');
        }
      }
      return profileToUserProfile(stored);
    } catch (error) {
      logger.error('❌ Ошибка получения текущего пользователя:', error);
      return null;
    }
  }

  static async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      await authApiClient.forgotPassword(email);
      return { success: true };
    } catch (error) {
      return { success: false, error: mapAuthError(error, 'Не удалось отправить письмо') };
    }
  }

  static async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await authApiClient.resetPassword(token, newPassword);
      return { success: true };
    } catch (error) {
      return { success: false, error: mapAuthError(error, 'Не удалось сбросить пароль') };
    }
  }

  static async logout(): Promise<void> {
    await authApiClient.logout();
    logger.debug('✅ Пользователь вышел из системы');
  }

  static async isAuthenticated(): Promise<boolean> {
    const token = await authSession.getAccessToken();
    return !!token;
  }

  static async updateEmail(userId: string, newEmail: string): Promise<{ success: boolean; error?: string }> {
    try {
      await authApiClient.updateProfile({ email: newEmail });
      return { success: true };
    } catch (error) {
      return { success: false, error: mapAuthError(error, 'Не удалось обновить email') };
    }
  }

  static async changePassword(
    _userId: string,
    _currentPassword: string,
    _newPassword: string,
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'Смена пароля через приложение будет доступна в следующей версии. Используйте «Забыли пароль».',
    };
  }

  static async deleteAccount(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const stored = await authSession.getStoredUser();
      if (!stored || stored.id !== userId) {
        return { success: false, error: 'Войдите в аккаунт' };
      }
      await authApiClient.deleteAccount();
      return { success: true };
    } catch (error) {
      return { success: false, error: mapAuthError(error, 'Не удалось удалить аккаунт') };
    }
  }

  static async getUserStats(_userId: string) {
    return { totalBookings: 0, totalSpent: 0, favoriteDestinations: [] as string[] };
  }

  /** Для AppContext после login/register */
  static async getAppUserFromSession() {
    const profile = await authSession.getStoredUser();
    return profile ? profileToAppUser(profile) : null;
  }
}
