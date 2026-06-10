/**
 * Диагностика входа через travelhub63.ru API (auth-mobile.php).
 */
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
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
    if (state.isConnected === false) {
      return { name: 'Интернет (NetInfo)', ok: false, detail: 'isConnected=false' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return {
      name: 'Интернет (fetch)',
      ok: response.ok || response.status === 204,
      detail: `HTTP ${response.status}`,
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'health' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      db?: { connected?: boolean; host?: string; name?: string };
      tables?: Record<string, boolean>;
    };

    if (data.success && data.db?.connected) {
      const tables = data.tables
        ? Object.entries(data.tables)
            .map(([k, v]) => `${k}=${v ? '✓' : '✗'}`)
            .join(', ')
        : '';
      return {
        name: 'Auth API + MySQL',
        ok: true,
        detail: `БД ${data.db.name}@${data.db.host}. Таблицы: ${tables || 'ok'}`,
      };
    }

    return {
      name: 'Auth API + MySQL',
      ok: false,
      detail: data.error
        ? `HTTP ${response.status}: ${data.error}`
        : `HTTP ${response.status} — проверьте auth-mobile.config.php`,
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
  console.log(LOG, internet.name, internet.ok ? '✓' : '✗', internet.detail);

  const config = checkLocalSession();
  steps.push(config);
  console.log(LOG, config.name, config.ok ? '✓' : '✗', config.detail);

  const api = await checkAuthApiHealth();
  steps.push(api);
  console.log(LOG, api.name, api.ok ? '✓' : '✗', api.detail);

  const token = await authSession.getAccessToken();
  steps.push({
    name: 'Локальная сессия',
    ok: !!token,
    detail: token ? 'accessToken есть' : 'не авторизован',
  });

  const loginStep = await checkLoginAttempt(testEmail, testPassword);
  if (loginStep) {
    steps.push(loginStep);
    console.log(LOG, loginStep.name, loginStep.ok ? '✓' : '✗', loginStep.detail);
  }

  const ok = steps.every((s) => s.ok);
  console.log(LOG, ok ? 'Итог: OK' : 'Итог: есть проблемы');
  return { ok, steps };
}
