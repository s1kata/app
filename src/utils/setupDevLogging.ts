/**
 * Глобальная настройка логирования и перехвата ошибок для iOS/Android отладки.
 * Вызывается один раз из index.ts до монтирования App.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { logger } from './logger';

const SENSITIVE_HEADER_KEYS = ['authorization', 'x-api-key', 'cookie', 'set-cookie'];
const MAX_BODY_LOG = 2000;

let fetchPatched = false;
let handlersInstalled = false;

function redactHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      const k = key.toLowerCase();
      out[key] = SENSITIVE_HEADER_KEYS.includes(k) ? '[redacted]' : value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      const k = key.toLowerCase();
      out[key] = SENSITIVE_HEADER_KEYS.includes(k) ? '[redacted]' : value;
    });
    return out;
  }
  Object.entries(headers).forEach(([key, value]) => {
    const k = key.toLowerCase();
    out[key] = SENSITIVE_HEADER_KEYS.includes(k) ? '[redacted]' : String(value);
  });
  return out;
}

async function readResponseBodyPreview(response: Response): Promise<string> {
  try {
    const clone = response.clone();
    const text = await clone.text();
    if (!text) return '(empty)';
    if (text.length > MAX_BODY_LOG) {
      return `${text.slice(0, MAX_BODY_LOG)}… [${text.length} chars total]`;
    }
    return text;
  } catch (e) {
    return `(body unreadable: ${(e as Error)?.message || e})`;
  }
}

function patchGlobalFetch(): void {
  if (fetchPatched || typeof global.fetch !== 'function') return;
  fetchPatched = true;

  const originalFetch = global.fetch.bind(global);

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : String(input);
    const method =
      init?.method ??
      (input instanceof Request ? input.method : undefined) ??
      'GET';
    const started = Date.now();

    logger.network('→ request', {
      url,
      method: method.toUpperCase(),
      headers: redactHeaders(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
    });

    try {
      const response = await originalFetch(input, init);
      const durationMs = Date.now() - started;
      const bodyPreview = __DEV__ ? await readResponseBodyPreview(response) : `(status ${response.status})`;

      logger.network('← response', {
        url,
        method: method.toUpperCase(),
        status: response.status,
        statusText: response.statusText,
        durationMs,
        body: bodyPreview,
      });

      return response;
    } catch (error) {
      const durationMs = Date.now() - started;
      logger.error('[Network] fetch failed', {
        url,
        method: method.toUpperCase(),
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

function installGlobalErrorHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  const errorUtils = (global as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  }).ErrorUtils;

  if (errorUtils?.getGlobalHandler && errorUtils?.setGlobalHandler) {
    const prev = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      logger.error('[GlobalError] Uncaught JS error', {
        isFatal: !!isFatal,
        message: error?.message,
        stack: error?.stack,
      });
      prev(error, isFatal);
    });
  }

  try {
    const rejectionTracking = require('promise/setimmediate/rejection-tracking') as {
      enable: (opts: {
        allRejections: boolean;
        onUnhandled: (id: number, error: unknown) => void;
        onHandled: () => void;
      }) => void;
    };
    rejectionTracking.enable({
      allRejections: true,
      onUnhandled: (_id, error) => {
        logger.error('[UnhandledPromiseRejection]', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      },
      onHandled: () => {},
    });
  } catch {
    // promise rejection tracking недоступен
  }
}

function logStartupBanner(): void {
  if (__DEV__) {
    console.log('=== DEV MODE ===');
    console.log('Platform:', Platform.OS, Platform.Version);
  }
  logger.info('App startup', {
    dev: __DEV__,
    platform: Platform.OS,
    platformVersion: Platform.Version,
    appVersion: Constants.expoConfig?.version,
    sdkVersion: Constants.expoConfig?.sdkVersion,
  });
}

/**
 * Устанавливает глобальные перехватчики и логирование fetch.
 * Безопасно вызывать повторно — сработает только один раз.
 */
export function setupDevLogging(): void {
  logStartupBanner();
  installGlobalErrorHandlers();
  if (__DEV__) {
    patchGlobalFetch();
  }
}
