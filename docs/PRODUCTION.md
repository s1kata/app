# TravelHub — продакшен

Документ описывает развёртывание, конфигурацию и проверки мобильного приложения (Expo / EAS), бэкенда оплаты и интеграций для **production**.

## Архитектура

| Компонент | Назначение |
|-----------|------------|
| **Приложение** (React Native / Expo) | Поиск туров (Tourvisor через прокси), бронирования, оплата через внешний сайт, CRM SOTA (U-ON) |
| **Сайт** (`travelhub63.ru`) | JWT auth (`auth-mobile.php`), Tourvisor proxy, CRM, оплата (Тинькофф) |
| **EAS Build / Submit** | Сборка AAB/APK/IPA и отправка в Google Play / App Store |
| **EAS Update** | OTA-обновления JS/ассетов (`expo-updates`, канал `production` в `eas.json`) |

Кэш поиска туров: **AsyncStorage** и **Firestore** (`searchCache`), TTL **14 дней**; устаревшие данные не показываются. Заполняется клиентом при запросах к Tourvisor API.

---

## Переменные окружения

Скопируйте [`.env.example`](../.env.example) → `.env`. **Не коммитьте `.env`.**

### Обязательные для рабочего приложения

| Переменная | Назначение |
|------------|------------|
| `FIREBASE_*` | **Не нужен** — вход через `auth-mobile.php`, брони в AsyncStorage. См. [ENV_MAP.md](./ENV_MAP.md) |
| `TOURVISOR_TOKEN` | JWT Tourvisor — **только dev**. В production/preview — прокси `${WEBSITE_BASE_URL}/api/tourvisor-mobile` |
| `EAS_PROJECT_ID` | UUID проекта в **текущем** аккаунте expo.dev (`eas project:info` или настройки проекта). Без него в конфиг не подставляются OTA `updates.url` и `extra.eas.projectId` |
| `IOS_BUNDLE_ID` | iOS bundle ID (по умолчанию `com.iliastravelhub.app`). Должен совпадать с App ID в Apple Developer и EAS credentials |
| `ANDROID_PACKAGE` | Android applicationId (по умолчанию = `IOS_BUNDLE_ID`) |

### Продакшен-сервисы

| Переменная | Назначение |
|------------|------------|
| `PAYMENT_PAGE_URL` | Базовый URL сайта с API оплаты, **без** завершающего `/` (по умолчанию в коде: `https://travelhub63.ru`) |
| `WEBSITE_BASE_URL` | Базовый URL сайта для туров/контента (при необходимости отдельно от оплаты) |
| `UON_API_KEY` | U-ON API на **сервере** (Node `server/` или PHP на сайте). Устаревшее имя `SOTA_API_KEY` в коде читается как fallback |
| `SOTA_CRM_BASE_URL` | Только для тестов (mock); в production **не задавайте** — используется `https://api.u-on.ru` |

### Опционально

| Переменная | Назначение |
|------------|------------|
| `TOURVISOR_API_URL` | По умолчанию `https://api.tourvisor.ru/search/api/v1` |
| `TOURVISOR_WORKER_URL` | Опциональный прокси для Tourvisor (полезно при ограничениях whitelist IP). Для production/preview обычно не используется, если работает серверный passthrough `${WEBSITE_BASE_URL}/api/tourvisor-mobile` |
| `EXPO_PUBLIC_*` | Облако для изображений (ImgBB, Cloudinary) — см. `.env.example` |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry: сбор JS-ошибок в production (`logger.error` → Sentry). Без DSN мониторинг отключён |
| `EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV` | `1` — слать события в Sentry из dev-сборки (проверка интеграции) |

### Sentry и source maps

Инициализация в `src/monitoring/sentry.ts`, ранний вход — `src/monitoring/sentryInit.ts` (подключается первым в `index.ts`). Для **загрузки source maps** при EAS Build задайте в секретах проекта: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (и при необходимости `SENTRY_URL`). Плагин `@sentry/react-native/expo` указан в `app.config.js`.

**Metro:** в `metro.config.js` не используется `@sentry/react-native/metro` (из‑за ошибки «Debug ID was not found in the bundle» на связке Expo 54 / RN 0.81 / Sentry 7.2). События в Sentry по-прежнему уходят из приложения; при необходимости позже можно поднять версию `@sentry/react-native` и снова включить интеграцию Metro по документации Sentry.

Секреты Т-Кассы / банка хранятся **только на сервере сайта**, не в приложении.

Попадание значений в билд: `app.config.js` → `expo.extra` → чтение через `expo-constants`. После изменения `.env` перезапустите Metro: `npx expo start --clear`.

---

## EAS: секреты и сборки

### Загрузка переменных в облако EAS

Используйте **отдельный файл** только для мобильного приложения (без `JWT_SECRET`, `TINKOFF_*`, `UON_API_KEY`):

```bash
# 1) Заполните eas-secrets.production.env (шаблон: eas-secrets.template.env)
# 2) Залейте в EAS:
npm run eas:env-push:production

# Preview (внутреннее тестирование)
npm run eas:env-push:preview
```

Обязательно для iOS-сборки: `IOS_BUNDLE_ID=com.iliastravelhub.app` и `ANDROID_PACKAGE=com.iliastravelhub.app` (должны совпадать с EAS credentials).

Локальная разработка: `.env` (см. `.env.example`). **Не** пушьте весь `.env` в EAS — там серверные секреты.

Отметьте чувствительные значения как **Sensitive**. Если EAS ругается на смену типа переменной — удалите переменную в [expo.dev](https://expo.dev) → Project → Environment variables и выполните push снова.

### Профили сборки (`eas.json`)

| Профиль | Назначение | Android | iOS |
|---------|------------|---------|-----|
| `development` | Dev Client, внутренняя раздача | APK | — |
| `preview` | Тест без магазина | APK | internal (device build) |
| `production` | Google Play / App Store | AAB (app-bundle) | store |

Команды:

```bash
# Preview Android/iOS
npx eas build --profile preview --platform android
npx eas build --profile preview --platform ios

# Production
npx eas build --profile production --platform android
npx eas build --profile production --platform ios

# Публикация в сторы (после настройки submit в eas.json)
npx eas submit --platform android
npx eas submit --platform ios
```

Перед первым `eas submit` заполните в `eas.json` блоки `submit.production` (Apple ID, ASC API Key, service account Google Play и т.д.).

---

## Бэкенд оплаты и сайт

Приложение открывает оплату во встроенном браузере (`expo-web-browser`) и использует API сайта:

- `POST /api/create-payment` — создание платежа, `paymentUrl`, `transactionId`
- `GET /api/payment-status/:transactionId` — статус после возврата
- `POST /api/payment-webhook` — уведомления платёжной системы

Контракт и пример сервера (Node): [`server/README.md`](../server/README.md). Локально: `npm run server` — порт **3334** (или `PAYMENT_SERVER_PORT` в `.env`).

Требования к success/fail страницам и deep links: [`PAYMENT_STORES.md`](./PAYMENT_STORES.md).

Схема URL приложения: `travelhub://booking-success?bookingId=...` / `travelhub://booking-fail?bookingId=...` (в `app.config.js` задан `scheme: "travelhub"`).

---

## CRM SOTA (U-ON)

Настройка и сценарии: [`SOTA_CRM_INTEGRATION.md`](./SOTA_CRM_INTEGRATION.md). Справочник эндпоинтов: [`SOTA_CRM_API.md`](./SOTA_CRM_API.md).

В production ключ на сервере задаётся через **`UON_API_KEY`** (EAS / `.env` для Node или `.env` сайта для PHP), не храните ключи в репозитории.

---

## Поддержка пользователей

Контакты для пользователей и для публикации в сторах:

| Канал | Значение |
|--------|----------|
| Email | `hello@travelhub63.ru` |
| Телефон | +7 (495) 660-36-66, для ссылок `tel:`: `+74956603666` → `tel:+74956603666` |

В приложении: экран **Помощь и поддержка** (`HelperChatScreen`), кнопки mailto и звонка; в юридических текстах — `LegalDocumentScreen` и файлы [`TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md), [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md). Единый источник в коде: `src/config/support.ts`.

---

## Магазины и соответствие правилам

- Внешняя оплата физических услуг (туры/отели), не IAP — см. [`PAYMENT_STORES.md`](./PAYMENT_STORES.md).
- Юридические тексты для публикации: [`TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md), [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md).

---

## OTA-обновления

В `app.config.js` настроены `updates.url` и `runtimeVersion` (политика `appVersion`). Новые JS-сборки публикуются в EAS Update на канал **`production`** (см. `eas.json` → `build.production.channel`).

---

## Чеклист перед релизом

1. **Секреты**: production `.env` / EAS без `localhost`, без тестовых ключей в репозитории.
2. **Оплата**: `PAYMENT_PAGE_URL` указывает на боевой сайт; API отвечает; success-страница отдаёт deep link из `returnUrl` / `failReturnUrl`.
3. **Юридические страницы:** `web/legal/*.html` на travelhub63.ru; `IOS_ENABLE_PUSH=1` в EAS.
4. **U-ON**: `UON_API_KEY` на сервере / в EAS для Node; тест создания заявки.
5. **Сборка**: `production` AAB/IPA; версии `version` / `versionCode` / `buildNumber` увеличены.
6. **UI релиза**: отельный флоу удалён (`RELEASE_HIDE_NEXT_PATCH_UI`); персональные рекомендации скрыты; поиск туров — `runSearch: true` на экране результатов.
7. **Сторы**: скриншоты, описание, политика конфиденциальности, контакты поддержки.
8. **Sentry**: `EXPO_PUBLIC_SENTRY_DSN` в EAS для production; тестовая ошибка видна в консоли Sentry.

Ручная проверка на устройстве (модалки, пуши, геолокация, длинные списки, оплата в боевом режиме) — см. [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md).
