# Аудит: точечные правки (Android / iOS)

## Исправлено в этом проходе

| Область | Проблема | Правка |
|---------|----------|--------|
| Оплата | Закрытие браузера без проверки dismiss | `resolvePaymentAfterBrowser` + баннер «Оплата отменена» |
| Оплата | Статус `cancelled` мапился в `failed` на бэкенде | `payment-status.js` → `cancelled` |
| Оплата | Нет UI при success/pending без Alert | `PaymentStatusBanner` + `showPaymentStatusBar` |
| Deep link | Только `booking-success` | + `travelhub://payment/success\|fail` |
| AsyncStorage | `JSON.parse` без catch при login | try/catch + очистка ключа |
| Уведомления | Нет ежедневного напоминания | `scheduleDailyHotToursNotification` в 12:00 |

## Требует отдельного обсуждения / не трогали

| Область | Риск | Рекомендация |
|---------|------|--------------|
| PHP-бэкенд на travelhub63.ru | Node `server/` ≠ прод PHP | Синхронизировать `payment-status` / webhook на PHP |
| Push vs local 12:00 | Локальное ≠ серверный крон | Для маркетинга с сервера — FCM + cron на бэкенде |
| `cancelAllScheduledNotificationsAsync` | Сбросит другие локальные напоминания | Используем `identifier: daily-hot-tours-12` |
| Tourvisor 403 с телефона | IP whitelist | Прокси `tourvisor-mobile` (уже в конфиге) |
| Стили `backgroundcolor` (lowercase) | TS-ошибки, не runtime | Массовая замена на `backgroundColor` |
| Виртуализация списков | Большие списки туров | `FlatList` + `windowSize` на тяжёлых экранах |
| Expo Go Android | Push не работает | Development build (уже в логах NotificationService) |

## Чеклист ручной проверки iOS

См. `docs/IOS_TEST_CHECKLIST.md`.
