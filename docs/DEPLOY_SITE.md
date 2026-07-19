# Деплой на travelhub63.ru (SpaceWeb)

Приложение TravelHub ходит на сайт за **авторизацией**, **поиском туров**, **CRM** и **оплатой**.  
Секреты (MySQL, JWT, Tourvisor, Tinkoff, U-ON) — **только на сервере**, не в приложении.

> **Пошагово для панели SpaceWeb** (куда заливать `privacy.html`, FTP, `public_html`):  
> **[DEPLOY_SPACEWEB.md](./DEPLOY_SPACEWEB.md)**

---

## 1. MySQL (phpMyAdmin на SpaceWeb)

1. Панель SpaceWeb → MySQL → создать/выбрать БД.
2. phpMyAdmin → вкладка **SQL**.

### Если таблицы `users` на сайте **ещё нет**

Выполнить целиком файл из репозитория:

```
sql/auth_schema.sql
```

### Если `users` **уже есть** (общая с сайтом)

Выполнить только:

- `refresh_tokens`
- `password_reset_tokens`

из того же `sql/auth_schema.sql`.

### Отзывы (reviews)

Выполнить:

```
sql/reviews_schema.sql
```

Создаёт таблицы `reviews`, `review_helpful`.

В `auth-mobile.config.php` прописать реальные имена таблиц и колонок (см. `auth-mobile.config.example.php`).

**Пароли:** `auth-mobile.php` использует `password_hash()` / `password_verify()`. Если на сайте другой алгоритм — нужен адаптер в `handle_login` / `handle_register`.

---

## 2. Файлы на сервере (FTP / файловый менеджер)

### Обязательно (новое — вход SQL)

| Файл в репозитории | Куда на сервере |
|--------------------|-----------------|
| `auth-mobile.php` | `/api/auth-mobile.php` |
| `api/health.php` | `/api/health.php` |
| `auth-mobile.config.example.php` → копия | `/api/auth-mobile.config.php` |
| `api/lib/auth-jwt.php` | `/api/lib/auth-jwt.php` |
| `api/lib/reviews-helpers.php` | `/api/lib/reviews-helpers.php` |
| `api/crm/reviews.php` | `/api/crm/reviews.php` |
| `api/crm/review-helpful.php` | `/api/crm/review-helpful.php` |

`auth-mobile.config.php` **не коммитить** в git (пароли БД и `jwt_secret`).

Минимум в config:

```php
'jwt_secret' => 'случайная_строка_минимум_32_символа',
'health_check_token' => 'случайная_строка_минимум_32_символа',
'db' => [ /* host, name, user, pass из SpaceWeb */ ],
'site_url' => 'https://travelhub63.ru',
'allowed_origins' => ['https://travelhub63.ru'],
```

`health_check_token` должен совпадать с `HEALTH_CHECK_TOKEN` в EAS (`eas-secrets.production.env`).

### Уже должны быть на сайте (настраивались ранее)

| Путь | Назначение |
|------|------------|
| `/api/tourvisor-mobile` | Прокси Tourvisor (JWT на сервере) |
| `/api/create-payment` | Создание платежа Tinkoff |
| `/api/payment-status/:id` | Статус оплаты |
| `/api/payment-webhook` | Webhook Tinkoff |
| `/api/crm/submit-booking` | Заявка в U-ON |
| `/api/crm/client-bookings` | Список броней (опционально) |
| `/api/crm/user-departure-documents` | Документы на вылет |
| `/api/crm/reviews.php` | Отзывы (GET/POST/PUT/DELETE) |
| `/api/crm/review-helpful.php` | «Полезно» на отзыве |

---

## 3. JWT на оплате и CRM (важно)

Приложение после входа шлёт:

```
Authorization: Bearer <accessToken из auth-mobile.php>
```

В токене поле **`sub`** = id пользователя в SQL (строка).

Если `create-payment` / `crm/*` ещё проверяют **Firebase ID token** — замените проверку на JWT:

```php
require_once __DIR__ . '/lib/auth-jwt.php';
$CONFIG = require __DIR__ . '/auth-mobile.config.php';
$claims = auth_jwt_require_bearer($CONFIG);
$userId = (string) $claims['sub'];
// userId из тела запроса должен совпадать с $userId
```

Тот же `jwt_secret`, что в `auth-mobile.config.php`. Логику Tinkoff и U-ON не менять.

---

## 4. Проверка после деплоя

### Auth

```bash
curl -X POST https://travelhub63.ru/api/auth-mobile.php \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"ВАШ_EMAIL","password":"ВАШ_ПАРОЛЬ"}'
```

Ожидание: `"success":true`, `accessToken`, `user`.

### Health (для CRM-очереди в приложении)

```bash
curl -X POST https://travelhub63.ru/api/auth-mobile.php \
  -H "Content-Type: application/json" \
  -H "X-Health-Token: ВАШ_health_check_token" \
  -d '{"action":"health"}'
```

Отдельный endpoint для проверки маршрута и БД:

```bash
curl https://travelhub63.ru/api/health.php \
  -H "X-Health-Token: ВАШ_health_check_token"
```

Ожидание: HTTP 200. Без заголовка — 403.

### Приложение (.env / EAS)

```env
SITE_BASE_URL=https://travelhub63.ru
AUTH_API_BASE_URL=https://travelhub63.ru
HEALTH_CHECK_TOKEN=тот_же_что_health_check_token_на_сервере
CRM_API_BASE_URL=https://travelhub63.ru
PAYMENT_API_BASE_URL=https://travelhub63.ru
```

**Не задавать** в production store:

- `FIREBASE_*`
- `TOURVISOR_TOKEN` (прокси на сайте)
- `EXPO_PUBLIC_UON_API_KEY`

```bash
npm run eas:env-push:production
```

Пересобрать приложение после смены env.

---

## 4.1. Юридические страницы (App Store)

Залить из репозитория в **корень** `public_html/`:

| Файл в репозитории | URL на сайте |
|--------------------|--------------|
| `web/legal/privacy.html` | https://travelhub63.ru/privacy.html |
| `web/legal/terms.html` | https://travelhub63.ru/terms.html |
| `web/legal/security.html` | https://travelhub63.ru/security.html |

В App Store Connect → Privacy Policy URL: `https://travelhub63.ru/privacy.html`

---

## 4.2. Долгая сессия (до выхода из профиля)

В `auth-mobile.config.php` на сервере:

```php
'refresh_ttl' => 31536000,  // 365 дней (рекомендуется)
```

Приложение не сбрасывает сессию при сетевых ошибках; выход — только кнопка «Выйти» в профиле. Срок жизни refresh-токена задаётся на сервере.

---

## 5. Чеклист

- [ ] SQL: users (+ токены) в phpMyAdmin
- [ ] SQL: `reviews_schema.sql`
- [ ] `/api/auth-mobile.php` + `/api/health.php` + `auth-mobile.config.php` (`refresh_ttl` 365 дней)
- [ ] `/api/lib/auth-jwt.php`, `/api/lib/reviews-helpers.php`
- [ ] `/api/crm/reviews.php`, `/api/crm/review-helpful.php`
- [ ] curl login/register OK
- [ ] `web/legal/*.html` → privacy.html, terms.html, security.html на сайте
- [ ] create-payment / CRM принимают JWT (auth-mobile)
- [ ] tourvisor-mobile отвечает (поиск в приложении)
- [ ] EAS: `SITE_BASE_URL`, `IOS_ENABLE_PUSH=1`, без `FIREBASE_*`
- [ ] Тест на iPhone: вход → поиск → бронь → оплата → отзыв

---

## 6. Локальная разработка

```bash
npm install
cp .env.example .env   # если есть
# SITE_BASE_URL=https://travelhub63.ru
# HEALTH_CHECK_TOKEN=как на сервере
npm start
```

Для dev можно задать `TOURVISOR_TOKEN` для прямого API; в preview/production — только прокси сайта.
