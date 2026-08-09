/**
 * Архитектурные флаги: server-first для стора.
 * Ключи и бизнес-логика — на travelhub63.ru; клиент = UI + кэш + permissions.
 */
export const SERVER_FIRST_TOURS = true;

/**
 * Ежедневный digest горящих — серверный cron (Expo Push).
 * Локальный scheduleNotificationAsync на 12:00 отключается.
 */
export const SERVER_OWNED_PUSH_DIGEST = true;

/**
 * После деплоя /api/tours/* можно оставить false только для отладки proxy.
 * true = tour methods сначала бьют доменные endpoint’ы, proxy — fallback.
 */
export const PREFER_DOMAIN_TOUR_API = true;
