# TravelHub — туристический помощник

[![Expo](https://img.shields.io/badge/Expo-000000?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=reactnative&logoColor=61DAFB)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-039BE5?style=for-the-badge&logo=Firebase&logoColor=white)](https://firebase.google.com)

Мобильное приложение для поиска туров, бронирования отелей и планирования путешествий: Tourvisor API, Firebase, оплата через внешний сайт, CRM SOTA (U-ON).

## Возможности

- Поиск туров и отелей (Tourvisor API)
- Авторизация (Firebase Auth)
- Бронирования и синхронизация с CRM SOTA
- Оплата через защищённую страницу на сайте (не IAP)
- Избранное, отзывы, рекомендации
- Погода (Open-Meteo, без ключа)
- Push-уведомления
- Тёмная и светлая тема

## Стек

- **Expo** ~54, **React Native** 0.81, **React** 19
- **TypeScript**
- **Firebase** (Auth, Firestore, Storage)
- **React Navigation**
- **Tourvisor API**

## Быстрый старт

```bash
cd TravelHubNew
npm install
cp .env.example .env
# Заполните .env — см. комментарии в .env.example и docs/PRODUCTION.md
npm start
```

## Переменные окружения

Скопируйте `.env.example` в `.env`. Файл `.env` в git не коммитить.

Базовый набор для рабочего приложения:
- `EAS_PROJECT_ID`
- `WEBSITE_BASE_URL`, `PAYMENT_PAGE_URL` (сайт travelhub63.ru: auth, поиск, CRM, оплата)
- `TOURVISOR_TOKEN` — только dev; в store — прокси `/api/tourvisor-mobile` на сайте
- `FIREBASE_*` — опционально (legacy Firestore-кэш); вход через `auth-mobile.php`

Деплой PHP/SQL на хостинг: **[docs/DEPLOY_SITE.md](docs/DEPLOY_SITE.md)**.  
EAS Secrets: **[docs/PRODUCTION.md](docs/PRODUCTION.md)**.

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

Подробности: [docs/PRODUCTION.md](docs/PRODUCTION.md), preview: [docs/PREVIEW_BUILD.md](docs/PREVIEW_BUILD.md), релизные проверки: [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Кэш поиска туров

Приоритет **свежести**: данные из кэша (AsyncStorage / Firestore, TTL **14 дней**) или актуальная загрузка из Tourvisor. Устаревшие записи не показываются.

## Структура проекта

```
├── src/
│   ├── components/
│   ├── screens/
│   ├── services/
│   ├── config/
│   ├── contexts/
│   ├── hooks/
│   ├── utils/
│   └── types/
├── server/           # API оплаты для размещения на сайте (см. server/README.md)
├── assets/
├── app.config.js
├── eas.json
└── .env.example
```

## Документация

| Раздел | Файл |
|--------|------|
| **Продакшен (главный)** | [docs/PRODUCTION.md](docs/PRODUCTION.md) |
| Указатель по всем doc | [docs/README.md](docs/README.md) |
| API оплаты на сайте | [server/README.md](server/README.md) |


## Поддержка

- **Email:** [hello@travelhub63.ru](mailto:hello@travelhub63.ru)
- **Телефон:** +7 (495) 660-36-66 ([tel:+74956603666](tel:+74956603666))

Те же контакты указаны в приложении: **Профиль → Помощь и поддержка**, а также в разделах политики конфиденциальности и условий использования.
