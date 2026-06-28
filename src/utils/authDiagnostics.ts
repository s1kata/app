/**
 * Диагностика входа через travelhub63.ru API (auth-mobile.php).
 */
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { pingBackendHealth, pingGeneralInternet } from './backendHealth';
import { getAuthApiUrl } from '../api/apiClient';
import { authSession } from '../services/AuthSession';
import { AuthService } from '../services/AuthService';

export interface AuthDiagnosticStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AuthDiagnosticReport {
  ok: boolean;
  steps: AuthDiagnosticStep[];
}

const LOG = '[AuthDiagnostics]';

async function checkInternet(): Promise<AuthDiagnosticStep> {
  try {
    const state = await NetInfo.fetch();
    const netDetail = state.isConnected === false ? 'isConnected=false' : 'NetInfo ok';
    const ok = await pingGeneralInternet();
    return {
      name: 'Интернет',
      ok,
      detail: ok ? netDetail : `${netDetail}, fetch failed`,
    };
  } catch (error) {
    return {
      name: 'Интернет',
      ok: false,
      detail: (error as Error)?.message || 'Нет соединения',
    };
  }
}

async function checkAuthApiHealth(): Promise<AuthDiagnosticStep> {
  const url = getAuthApiUrl();
  try {
    const ok = await pingBackendHealth();
    if (ok) {
      return { name: 'Auth API + MySQL', ok: true, detail: `${url} — health OK` };
    }
    return {
      name: 'Auth API + MySQL',
      ok: false,
      detail: `${url} — health failed, проверьте auth-mobile.config.php`,
    };
  } catch (error) {
    return {
      name: 'Auth API',
      ok: false,
      detail: `${url}: ${(error as Error)?.message || 'недоступен'}`,
    };
  }
}

function checkLocalSession(): AuthDiagnosticStep {
  const baseUrl =
    Constants.expoConfig?.extra?.websiteBaseUrl ||
    Constants.expoConfig?.extra?.paymentPageUrl ||
    'https://travelhub63.ru';
  return {
    name: 'Конфиг сайта',
    ok: !!baseUrl,
    detail: `websiteBaseUrl=${baseUrl}, authApi=${getAuthApiUrl()}`,
  };
}

async function checkLoginAttempt(email?: string, password?: string): Promise<AuthDiagnosticStep | null> {
  if (!email || !password) return null;
  const result = await AuthService.login(email, password);
  return {
    name: 'AuthService.login (тест)',
    ok: result.success,
    detail: result.success
      ? `uid=${result.user?.id}`
      : result.error || 'Ошибка',
  };
}

export async function runAuthDiagnostics(
  testEmail?: string,
  testPassword?: string,
): Promise<AuthDiagnosticReport> {
  const steps: AuthDiagnosticStep[] = [];

  const internet = await checkInternet();
  steps.push(internet);
  if (__DEV__) console.log(LOG, internet.name, internet.ok ? '✓' : '✗', internet.detail);

  const config = checkLocalSession();
  steps.push(config);
  if (__DEV__) console.log(LOG, config.name, config.ok ? '✓' : '✗', config.detail);

  const api = await checkAuthApiHealth();
  steps.push(api);
  if (__DEV__) console.log(LOG, api.name, api.ok ? '✓' : '✗', api.detail);

  const token = await authSession.getAccessToken();
  steps.push({
    name: 'Локальная сессия',
    ok: !!token,
    detail: token ? 'accessToken есть' : 'не авторизован',
  });

  const loginStep = await checkLoginAttempt(testEmail, testPassword);
  if (loginStep) {
    steps.push(loginStep);
    if (__DEV__) console.log(LOG, loginStep.name, loginStep.ok ? '✓' : '✗', loginStep.detail);
  }

  const ok = steps.every((s) => s.ok);
  if (__DEV__) console.log(LOG, ok ? 'Итог: OK' : 'Итог: есть проблемы');
  return { ok, steps };
}
