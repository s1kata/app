import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/**
 * Инициализация Sentry для production/preview билдов.
 * DSN: EXPO_PUBLIC_SENTRY_DSN → app.config.js extra.sentryDsn (EAS Secrets).
 * В __DEV__ по умолчанию выключено; для проверки: EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=1 в .env
 */
export function initSentry(): void {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const dsn = typeof extra?.sentryDsn === 'string' ? extra.sentryDsn.trim() : '';
  if (!dsn) {
    return;
  }

  const enableInDev =
    typeof extra?.sentryEnableInDev === 'string' && extra.sentryEnableInDev === '1';

  Sentry.init({
    dsn,
    enabled: !__DEV__ || enableInDev,
    debug: __DEV__ && enableInDev,
    tracesSampleRate: __DEV__ ? 0 : 0.15,
  });
}
