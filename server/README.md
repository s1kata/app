# API для travelhub63.ru (платежи Tinkoff Т-касса)

Код в этой папке нужно развернуть на вашем сайте **travelhub63.ru**, чтобы приложение могло создавать платежи и проверять их статус.

## Схема

```
Приложение (React Native) → travelhub63.ru (эти API) → Tinkoff Т-касса → Банк
```

## Эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/create-payment` | Создать платёж, вернуть `paymentUrl` и `transactionId` |
| POST | `/api/payment-webhook` | Webhook от Tinkoff (успех/ошибка оплаты) |
| GET  | `/api/payment-status/:transactionId` | Проверка статуса платежа после возврата из браузера |

## Переменные окружения

В корневом `.env` проекта (или на сервере travelhub63.ru):

```env
TINKOFF_TERMINAL_KEY=XXXXXXXX
TINKOFF_PASSWORD=YYYYYYYY
APP_URL=https://travelhub63.ru
API_URL=https://travelhub63.ru
```

### Локальный тест

Из корня проекта: `npm run server` — поднимается сервер на порту 3334 с эндпоинтами платежей. Чтобы приложение с телефона ходило на него, в `.env` задай `PAYMENT_PAGE_URL=http://ТВОЙ_IP:3334` (подставь IP ПК в локальной сети).

## Интеграция в ваш стек

- **Next.js**: скопируйте логику в `pages/api/create-payment.js`, `pages/api/payment-webhook.js`, `pages/api/payment-status/[transactionId].js` (или в `app/api/.../route.js`).
- **Express**: подключите `handler` как маршруты; для `payment-status` извлеките `transactionId` из `req.params.transactionId`.
- **PHP**: перепишите логику на PHP и вызывайте API платёжной системы (Т-Касса/ЮKassa) из PHP.

## Firebase Auth (опционально)

В `create-payment` приложение шлёт заголовок `Authorization: Bearer <Firebase ID token>`. Чтобы проверять пользователя на сайте:

1. Установите `firebase-admin` на сервере.
2. В `create-payment` после извлечения токена:  
   `const decoded = await admin.auth().verifyIdToken(token);`  
   и проверьте `decoded.uid === req.body.userId`.

## Tinkoff Т-касса

- Документация: https://developer.tinkoff.ru/eacq/api/init
- В личном кабинете укажите NotificationURL: `https://travelhub63.ru/api/payment-webhook`

## БД

В коде оставлены закомментированные вызовы `db.payments` и `db.orders`. Подключите свою БД (PostgreSQL, MySQL, Prisma и т.д.) и раскомментируйте/адаптируйте под свою схему.
