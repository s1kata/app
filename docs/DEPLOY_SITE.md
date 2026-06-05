# Деплой на travelhub63.ru (SpaceWeb)

Приложение TravelHub ходит на сайт за **авторизацией**, **поиском туров**, **CRM** и **оплатой**.  
Секреты (MySQL, JWT, Tourvisor, Tinkoff, U-ON) — **только на сервере**, не в приложении.

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

В `auth-mobile.config.php` прописать реальные имена таблиц и колонок (см. `auth-mobile.config.example.php`).

**Пароли:** `auth-mobile.php` использует `password_hash()` / `password_verify()`. Если на сайте другой алгоритм — нужен адаптер в `handle_login` / `handle_register`.

---

## 2. Файлы на сервере (FTP / файловый менеджер)

### Обязательно (новое — вход SQL)

| Файл в репозитории | Куда на сервере |
|--------------------|-----------------|
| `auth-mobile.php` | `/api/auth-mobile.php` |
| `auth-mobile.config.example.php` → копия | `/api/auth-mobile.config.php` |
| `api/lib/auth-jwt.php` | `/api/lib/auth-jwt.php` |

`auth-mobile.config.php` **не коммитить** в git (пароли БД и `jwt_secret`).

Минимум в config:

```php
'jwt_secret' => 'случайная_строка_минимум_32_символа',
'db' => [ /* host, name, user, pass из SpaceWeb */ ],
'site_url' => 'https://travelhub63.ru',
'allow_cors' => true,
```

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

### Приложение (.env / EAS)

```env
WEBSITE_BASE_URL=https://travelhub63.ru
PAYMENT_PAGE_URL=https://travelhub63.ru
```

**Не задавать** в production store:

- `FIREBASE_*`
- `TOURVISOR_TOKEN` (прокси на сайте)
- `EXPO_PUBLIC_UON_API_KEY`

```bash
npx eas env:push preview --path .env
npx eas env:push production --path .env
```

Пересобрать приложение после смены env.

---

## 5. Чеклист

- [ ] SQL: users (+ токены) в phpMyAdmin
- [ ] `/api/auth-mobile.php` + `auth-mobile.config.php`
- [ ] `/api/lib/auth-jwt.php`
- [ ] curl login/register OK
- [ ] create-payment / CRM принимают JWT (не Firebase)
- [ ] tourvisor-mobile отвечает (поиск в приложении)
- [ ] EAS: `WEBSITE_BASE_URL`, без `FIREBASE_*`
- [ ] Тест на iPhone: вход → поиск → бронь → оплата

---

## 6. Локальная разработка

```bash
npm install
cp .env.example .env   # если есть
# WEBSITE_BASE_URL=https://travelhub63.ru
npm start
```

Для dev можно задать `TOURVISOR_TOKEN` для прямого API; в preview/production — только прокси сайта.
