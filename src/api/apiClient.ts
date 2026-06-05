import Constants from 'expo-constants';

/**
 * Публичный URL бэкенда (без секретов). Секреты только в process.env на сервере.
 */
/** URL PHP-эндпоинта авторизации (разместить auth-mobile.php в /api/ на сайте). */
export function getAuthApiUrl(): string {
  return `${getBackendBaseUrl()}/api/auth-mobile.php`;
}

export function getBackendBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { paymentPageUrl?: string; websiteBaseUrl?: string }
    | undefined;
  const fromExtra = extra?.paymentPageUrl as string | undefined;
  const fromWebsite = extra?.websiteBaseUrl as string | undefined;
  const raw =
    fromExtra ||
    (typeof process !== 'undefined' && (process as any).env?.EXPO_PUBLIC_API_BASE) ||
    fromWebsite ||
    'https://travelhub63.ru';
  return String(raw).replace(/\/+$/, '');
}
