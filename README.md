# TravelHub — туристический помощник

[![Expo](https://img.shields.io/badge/Expo-000000?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=reactnative&logoColor=61DAFB)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

Мобильное приложение для поиска туров и планирования путешествий: Tourvisor API (через прокси на сайте), JWT-авторизация, оплата через внешний сайт, CRM SOTA (U-ON).

## Возможности

- Поиск туров (Tourvisor API через `travelhub63.ru/api/tourvisor-mobile`)
- Авторизация через `auth-mobile.php` (JWT Bearer)
- Бронирования и синхронизация с CRM SOTA
- Оплата через защищённую страницу на сайте (не IAP)
- Избранное и отзывы
- Погода (Open-Meteo, без ключа)
- Push-уведомления
- Тёмная и светлая тема

> **Релиз 1.0.x:** отельный поиск и связанные экраны удалены из ветки (`RELEASE_HIDE_NEXT_PATCH_UI`). Возврат — в next-patch.

## Стек

- **Expo** ~54, **React Native** 0.81, **React** 19
- **TypeScript**
- **React Navigation**
- **Tourvisor API** (серверный прокси на travelhub63.ru)
- **Оплата:** Тинькофф через travelhub63.ru

## Быстрый старт

```bash
npm install
cp .env.example .env
# Заполните .env — см. комментарии в .env.example и docs/PRODUCTION.md
npm start
```

## Переменные окружения

Скопируйте `.env.example` в `.env`. Файл `.env` в git не коммитить.

Базовый набор для рабочего приложения:
- `EAS_PROJECT_ID`
- `WEBSITE_BASE_URL`, `PAYMENT_PAGE_URL` (сайт travelhub63.ru: auth, CRM, Tourvisor proxy, оплата Тинькофф)
- `TOURVISOR_TOKEN` — только dev; в store-билдах — прокси `/api/tourvisor-mobile` на сайте
- `IOS_ENABLE_PUSH=1` — локальное напоминание в 12:00 (production)

Деплой PHP/SQL на хостинг: **[docs/DEPLOY_SITE.md](docs/DEPLOY_SITE.md)**.  
EAS Secrets: **[docs/PRODUCTION.md](docs/PRODUCTION.md)**.

## Поиск туров

Форма `ApiTourHotelSearch` → экран результатов с `runSearch: true` → единый путь `searchTours()` (poll + fetch). Кэш AsyncStorage, TTL **14 дней**; устаревшие записи не показываются.

## Сборки EAS

```bash
# Переменные в облако EAS
npx eas env:push preview --path .env
npx eas env:push production --path .env

# Сборки
npx eas build --profile preview --platform android
npx eas build --profile preview --platform ios
npx eas build --profile production --platform android
npx eas build --profile production --platform ios
```

Подробности: [docs/PRODUCTION.md](docs/PRODUCTION.md), TestFlight: [docs/TESTFLIGHT.md](docs/TESTFLIGHT.md), preview: [docs/PREVIEW_BUILD.md](docs/PREVIEW_BUILD.md), релизные проверки: [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Структура проекта

```
├── src/
│   ├── components/     # ApiTourHotelSearch, UI-компоненты
│   ├── screens/        # Экраны навигации (туры, профиль, бронирования)
│   ├── services/       # Tourvisor, CRM, Auth, Booking
│   ├── config/         # i18n, releaseUiFlags, support
│   ├── contexts/
│   ├── hooks/
│   ├── utils/
│   └── types/
├── api/                # PHP на сайте (auth, CRM, tourvisor-mobile)
├── server/             # Node API оплаты (референс; на проде — PHP)
├── assets/
├── app.config.js
├── eas.json
└── .env.example
```

## Документация

| Раздел | Файл |
|--------|------|
| **TestFlight (iOS)** | [docs/TESTFLIGHT.md](docs/TESTFLIGHT.md) |
| **Продакшен (главный)** | [docs/PRODUCTION.md](docs/PRODUCTION.md) |
| Указатель по всем doc | [docs/README.md](docs/README.md) |
| Журнал правок / cleanup | [docs/AUDIT_POINT_FIXES.md](docs/AUDIT_POINT_FIXES.md) |
| API оплаты на сайте | [server/README.md](server/README.md) |

## Поддержка

- **Email:** [hello@travelhub63.ru](mailto:hello@travelhub63.ru)
- **Телефон:** +7 (495) 660-36-66 ([tel:+74956603666](tel:+74956603666))

Те же контакты указаны в приложении: **Профиль → Помощь и поддержка**, а также в разделах политики конфиденциальности и условий использования.
