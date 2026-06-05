// Структурированный логгер: уровень, время, тег, данные.
// В __DEV__ — полный вывод в консоль (Xcode / Metro).
// В production — ERROR → Sentry; опционально POST на EXPO_PUBLIC_LOG_ENDPOINT.

import Constants from 'expo-constants';
import { captureException, getClient } from '@sentry/react-native';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const isDev = __DEV__;
const LOG_ENDPOINT =
  (typeof process !== 'undefined' &&
    (process as NodeJS.Process & { env?: Record<string, string> }).env?.EXPO_PUBLIC_LOG_ENDPOINT) ||
  undefined;

const MAX_REMOTE_BODY = 4000;
const MAX_CONSOLE_BODY = 2500;

interface CrashlyticsInterface {
  recordError?: (error: Error, jsErrorName?: string) => void;
  log?: (message: string) => void;
}

let crashlytics: CrashlyticsInterface | null = null;

export const initializeCrashlytics = (crashlyticsInstance: CrashlyticsInterface) => {
  crashlytics = crashlyticsInstance;
};

function formatTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function serializeData(data: unknown): string {
  if (data === undefined) return '';
  if (typeof data === 'string') return data;
  if (data instanceof Error) {
    return `${data.name}: ${data.message}${data.stack ? `\n${data.stack}` : ''}`;
  }
  try {
    return JSON.stringify(data, null, isDev ? 2 : 0);
  } catch {
    return String(data);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
}

function argsToError(args: unknown[]): Error {
  const existing = args.find((a): a is Error => a instanceof Error);
  if (existing) return existing;
  const message = args.map((arg) => serializeData(arg)).join(' ');
  return new Error(message || 'AppError');
}

function shouldLogLevel(level: LogLevel): boolean {
  if (isDev) return true;
  return level === 'ERROR' || level === 'WARN';
}

function writeConsole(level: LogLevel, tag: string, message: string, data?: unknown) {
  const prefix = `[${level}] ${formatTime()} [${tag}] ${message}`;
  const body = data !== undefined ? truncate(serializeData(data), MAX_CONSOLE_BODY) : '';
  const line = body ? `${prefix}\n${body}` : prefix;

  switch (level) {
    case 'ERROR':
      console.error(line);
      break;
    case 'WARN':
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

function sendRemote(level: LogLevel, tag: string, message: string, data?: unknown) {
  if (!LOG_ENDPOINT) return;
  const payload = {
    level,
    tag,
    message,
    data: data !== undefined ? truncate(serializeData(data), MAX_REMOTE_BODY) : undefined,
    platform: Constants.platform?.ios ? 'ios' : Constants.platform?.android ? 'android' : 'unknown',
    appVersion: Constants.expoConfig?.version,
    timestamp: new Date().toISOString(),
  };
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function emit(level: LogLevel, tag: string, message: string, data?: unknown) {
  if (shouldLogLevel(level)) {
    writeConsole(level, tag, message, data);
  }
  if (level === 'ERROR' || level === 'WARN') {
    sendRemote(level, tag, message, data);
  }
}

function variadicEmit(level: LogLevel, tag: string, args: unknown[]) {
  if (args.length === 0) return;
  const message = String(args[0]);
  const data = args.length > 1 ? (args.length === 2 ? args[1] : args.slice(1)) : undefined;
  emit(level, tag, message, data);
  if (level === 'ERROR') {
    if (!isDev && getClient()) {
      try {
        captureException(argsToError(args), { extra: { tag, loggerArgCount: args.length } });
      } catch {
        /* ignore */
      }
    }
    if (!isDev && crashlytics?.recordError) {
      try {
        crashlytics.recordError(argsToError(args), tag);
      } catch {
        /* ignore */
      }
    }
  }
}

export const logger = {
  debug: (...args: unknown[]) => variadicEmit('DEBUG', 'App', args),
  info: (...args: unknown[]) => variadicEmit('INFO', 'App', args),
  warn: (...args: unknown[]) => variadicEmit('WARN', 'App', args),
  error: (...args: unknown[]) => variadicEmit('ERROR', 'App', args),

  /** Сетевые запросы (fetch) */
  network: (message: string, data?: unknown) => emit('INFO', 'Network', message, data),

  /** Навигация между экранами */
  navigation: (message: string, data?: unknown) => emit('INFO', 'Navigation', message, data),

  /** Жизненный цикл компонентов / хуков */
  lifecycle: (message: string, data?: unknown) => emit('DEBUG', 'Lifecycle', message, data),

  log: (...args: unknown[]) => variadicEmit('INFO', 'App', args),
};

/** Тегированный логгер для модулей */
export function createLogger(tag: string) {
  return {
    debug: (...args: unknown[]) => variadicEmit('DEBUG', tag, args),
    info: (...args: unknown[]) => variadicEmit('INFO', tag, args),
    warn: (...args: unknown[]) => variadicEmit('WARN', tag, args),
    error: (...args: unknown[]) => variadicEmit('ERROR', tag, args),
    lifecycle: (message: string, data?: unknown) => emit('DEBUG', tag, message, data),
  };
}
