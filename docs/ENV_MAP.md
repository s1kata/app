# Карта переменных окружения и API TravelHub

Базовый хост по умолчанию: **`https://travelhub63.ru`** (без слэша в конце).

В мобильном приложении **отдельные URL на каждый сервис** (по умолчанию один хост):

| Переменная | Сервис | API |
|------------|--------|-----|
| `SITE_BASE_URL` | Общий fallback | — |
| `AUTH_API_BASE_URL` + `AUTH_API_PATH` | Вход, регистрация | `auth-mobile.php` |
| `CRM_API_BASE_URL` | CRM, заявки | `/api/crm/*` |
| `BONUS_API_BASE_URL` | Бонусы | `/api/crm/bonus-*`, `bcard-*` |
| `PAYMENT_API_BASE_URL` | Оплата | `create-payment`, `payment-status` |
| `TOURVISOR_API_URL` | Туры | `/api/tourvisor-mobile` |

`app.config.js` → `expo.extra` → `src/config/apiEndpoints.ts`.

**Firebase не нужен** — вход через `auth-mobile.php`, брони в AsyncStorage.

---

## Пути API (приложение → travelhub63.ru)

### Вход (JWT)

| Метод | Путь | Файл на сервере |
|-------|------|-----------------|
| POST | `/api/auth-mobile.php` | `api/auth-mobile.php` |
| health | `?action=health` + опционально `X-Health-Token` | тот же |

Клиент: `AuthApiClient`, `AuthService`, `AuthSession` (SecureStore), `backendHealth.ts`.

**Секреты только на сервере** (`api/auth-mobile.config.php`):

- `jwt_secret`, `jwt_issuer` (`travelhub-auth`)
- `db.*`, `health_check_token` (опционально), `allowed_origins`, `refresh_ttl` (рекомендуется 365 дней)

**В EAS / `.env`:** `HEALTH_CHECK_TOKEN` — только если на сервере включён `health_check_token`. `IOS_ENABLE_PUSH=1` — локальное напоминание в 12:00 (production).

---

### CRM (Bearer JWT, без U-ON ключа в приложении)

База: `getCrmBackendBaseUrl()` → тот же хост, что оплата.

| Метод | Путь | PHP в репозитории |
|-------|------|-------------------|
| POST | `/api/crm/submit-booking.php` | `api/crm/submit-booking.php` |
| POST | `/api/crm/submit-booking` | fallback |
| POST | `/api/crm-submit-booking.php` | `api/crm-submit-booking.php` |
| GET | `/api/crm/bonus-balance.php` | `api/crm/bonus-balance.php` |
| POST | `/api/crm/bcard-activate.php` | `api/crm/bcard-activate.php` |
| POST | `/api/crm/bcard-bonus-create.php` | `api/crm/bcard-bonus-create.php` |
| GET | `/api/crm/user-departure-documents` | деплой на сайте |
| GET | `/api/crm/client-bookings` | деплой на сайте |
| GET/POST/PUT/DELETE | `/api/crm/reviews.php` | `api/crm/reviews.php` |
| POST | `/api/crm/review-helpful.php` | `api/crm/review-helpful.php` |

Клиент: `CrmBackendClient`, `CrmOutboundQueue`, `SotaCrmService`, `BookingService`, `ReviewsApiClient`.

**Секрет на сервере:** `uon_api_key` в PHP config или `UON_API_KEY` в Node.

---

### Оплата (Bearer JWT)

| Метод | Путь | Где реализовано |
|-------|------|-----------------|
| POST | `/api/create-payment` | `server/api/create-payment.js` (Node на хосте) |
| GET | `/api/payment-status/:id` | `server/api/payment-status.js` |

Клиент: `PaymentService` → WebView банка (Tinkoff).

**Секреты только на сервере:**

- `TINKOFF_TERMINAL_KEY`, `TINKOFF_PASSWORD`
- `JWT_SECRET` (тот же, что auth-mobile) для проверки Bearer

---

### Туры (Tourvisor)

| Production | Путь |
|------------|------|
| Passthrough | `GET/POST` `${host}/api/tourvisor-mobile` |

Токен Tourvisor **только на сервере** (`TOURVISOR_TOKEN` / `TOURVISOR_JWT_TOKEN` в PHP).

В **development** можно задать в `.env`: `TOURVISOR_TOKEN`, `TOURVISOR_API_URL`.

---

## Что куда класть

### EAS mobile (`eas-secrets.production.env`)

```
SITE_BASE_URL, AUTH_API_*,
CRM_API_BASE_URL, BONUS_API_BASE_URL,
PAYMENT_API_BASE_URL, TOURVISOR_API_URL,
IOS_BUNDLE_ID, ANDROID_PACKAGE, APP_ENV=production,
IOS_ENABLE_PUSH=1
```

**Не включать:** `WEBSITE_BASE_URL` (если account-wide), `FIREBASE_*`, `JWT_*`, `UON_*`, `TINKOFF_*`.

```bash
npm run eas:env-push:production
```

### Локально (`.env`)

Те же `*_API_BASE_URL` + `TOURVISOR_TOKEN` только для dev.

### Сервер travelhub63.ru

**PHP** `api/auth-mobile.config.php`:

- `jwt_secret`, `jwt_issuer`, `db`, `health_check_token`, `allowed_origins`

**PHP/Node** для CRM, оплаты, Tourvisor:

- `UON_API_KEY`
- `TINKOFF_TERMINAL_KEY`, `TINKOFF_PASSWORD`
- `TOURVISOR_TOKEN` (на прокси tourvisor-mobile)
- `JWT_SECRET` (= jwt_secret auth-mobile)

---

## Ошибка `account-wide variables cannot be overwritten`

На [expo.dev](https://expo.dev) → **Account** → **Environment variables** уже задан `WEBSITE_BASE_URL`.

Варианты:

1. **Убрать** `WEBSITE_BASE_URL` из `eas-secrets.production.env` (рекомендуется) — дефолт `https://travelhub63.ru` в `app.config.js`.
2. Или **отвязать** переменную от проекта в UI expo.dev.

После push проверка:

```bash
eas env:list --environment production
```
