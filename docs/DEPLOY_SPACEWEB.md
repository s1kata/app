# Деплой на SpaceWeb (travelhub63.ru)

Пошаговый гайд: куда заливать файлы приложения TravelHub на хостинге **SpaceWeb**.

> Общая схема API и SQL — в [DEPLOY_SITE.md](./DEPLOY_SITE.md).  
> TestFlight после деплоя — в [TESTFLIGHT.md](./TESTFLIGHT.md).

---

## 1. Вход в SpaceWeb

1. Откройте [https://cp.sweb.ru](https://cp.sweb.ru) (или [spaceweb.ru](https://spaceweb.ru) → «Войти»).
2. Раздел **«Хостинг»** → сайт **travelhub63.ru**.
3. Запомните три способа работы с файлами (любой подходит):

| Способ | Где в панели | Когда удобно |
|--------|--------------|--------------|
| **Файловый менеджер** | Сайт → «Файловый менеджер» | 1–5 файлов, правка config |
| **FTP** | Сайт → «FTP-доступ» | Много файлов, папки `api/crm/` |
| **SSH** | «SSH-доступ» (если включён) | Скрипты очистки кэша, `curl` |

**FTP-данные:** хост обычно `ftp.spaceweb.ru` или `travelhub63.ru`, логин/пароль — в карточке FTP в панели.  
Клиент: FileZilla, Cyberduck или встроенный менеджер SpaceWeb.

---

## 2. Корневая папка сайта (`public_html`)

У домена **travelhub63.ru** корень сайта в FTP/менеджере называется **`public_html`**.

Полный путь на диске SpaceWeb часто выглядит так (имя аккаунта может отличаться):

```
/home/ВАШ_ЛОГИН/ВАШ_САЙТ/public_html/
```

или

```
/domains/travelhub63.ru/public_html/
```

**Правило:** всё, что лежит в `public_html`, открывается в браузере как `https://travelhub63.ru/...`

Пример дерева (упрощённо):

```
public_html/
├── index.html              ← главная сайта (если есть)
├── privacy.html            ← ЗАЛИТЬ из репозитория
├── terms.html              ← ЗАЛИТЬ
├── security.html           ← ЗАЛИТЬ
├── frontend/               ← уже на сайте (favicon и т.д.)
└── api/
    ├── auth-mobile.php
    ├── auth-mobile.config.php   ← секреты, только на сервере
    ├── tourvisor-mobile/        ← прокси туров (уже есть)
    ├── create-payment             ← оплата (уже есть)
    ├── lib/
    │   ├── auth-jwt.php
    │   └── reviews-helpers.php
    └── crm/
        ├── submit-booking.php
        ├── bonus-balance.php
        ├── reviews.php          ← отзывы (если ещё 404 — залить)
        └── review-helpful.php
```

---

## 3. Юридические страницы (App Store) — самое простое

Нужно для Apple: URL политики конфиденциальности.

### Что залить

| Файл в репозитории на вашем Mac | Куда на SpaceWeb |
|--------------------------------|------------------|
| `web/legal/privacy.html` | `public_html/privacy.html` |
| `web/legal/terms.html` | `public_html/terms.html` |
| `web/legal/security.html` | `public_html/security.html` |

**Важно:** файлы лежат **в корне** `public_html`, **не** в подпапке `web/legal/`.

### Через файловый менеджер SpaceWeb

1. Панель → travelhub63.ru → **Файловый менеджер**.
2. Откройте папку **`public_html`** (это корень сайта).
3. Кнопка **«Загрузить»** / перетащите три `.html` файла.
4. Если файлы с такими именами уже есть — **замените** (перезапишите).

### Через FTP (FileZilla)

1. Подключитесь к FTP (логин из панели).
2. Справа откройте **`public_html`**.
3. Слева — папка `app-main/web/legal/` на компьютере.
4. Перетащите `privacy.html`, `terms.html`, `security.html` в **`public_html`** (не в подпапку).

### Проверка в браузере

Откройте (должна открыться страница TravelHub, без 404):

- https://travelhub63.ru/privacy.html
- https://travelhub63.ru/terms.html
- https://travelhub63.ru/security.html

В **App Store Connect** → Privacy Policy URL:  
`https://travelhub63.ru/privacy.html`

---

## 4. API для приложения (PHP)

### Куда класть файлы из репозитория `app-main/api/`

| Локально (репозиторий) | На сервере (от `public_html`) |
|------------------------|-------------------------------|
| `api/auth-mobile.php` | `api/auth-mobile.php` |
| `api/auth-mobile.config.example.php` → скопировать и переименовать | `api/auth-mobile.config.php` |
| `api/lib/auth-jwt.php` | `api/lib/auth-jwt.php` |
| `api/lib/reviews-helpers.php` | `api/lib/reviews-helpers.php` |
| `api/crm/reviews.php` | `api/crm/reviews.php` |
| `api/crm/review-helpful.php` | `api/crm/review-helpful.php` |
| `api/crm/submit-booking.php` | `api/crm/submit-booking.php` |
| `api/crm/bonus-balance.php` | `api/crm/bonus-balance.php` |
| `api/crm/bcard-activate.php` | `api/crm/bcard-activate.php` |
| `api/crm/bcard-bonus-create.php` | `api/crm/bcard-bonus-create.php` |

URL в приложении: `https://travelhub63.ru/api/auth-mobile.php`, `https://travelhub63.ru/api/crm/reviews.php` и т.д.

### Папка `api/lib/`

Если папки **`api/lib`** на сервере нет — создайте в менеджере:  
`public_html` → `api` → «Создать папку» → `lib`.

### `auth-mobile.config.php` (секреты)

1. В менеджере: `public_html/api/`.
2. Скопируйте `auth-mobile.config.example.php` → **`auth-mobile.config.php`** (если ещё нет).
3. Откройте **редактор** и заполните:

```php
'jwt_secret' => 'длинная_случайная_строка_32+_символов',
'refresh_ttl' => 31536000,  // 365 дней — сессия до выхода из профиля
'db' => [
    'host' => 'localhost',           // часто localhost на SpaceWeb
    'name' => 'имя_БД_из_панели',
    'user' => 'пользователь_БД',
    'pass' => 'пароль_БД',
],
'site_url' => 'https://travelhub63.ru',
'allowed_origins' => ['https://travelhub63.ru'],
```

Данные БД: панель SpaceWeb → **MySQL** → ваша база (имя, пользователь, пароль).

**Не загружайте** `auth-mobile.config.php` в git и не отдавайте его публично — внутри пароли.

### Права на файлы

Обычно SpaceWeb выставляет сам. Если API отдаёт 500:

- папки: **755**
- `.php` файлы: **644**

В менеджере: правый клик → «Права» / «Атрибуты».

### Версия PHP

Панель → сайт → **PHP** → версия **8.1+** (у вас использовался **8.4**).  
Для папки `api/` можно задать ту же версию, что и для всего сайта.

---

## 5. База данных (phpMyAdmin)

1. Панель SpaceWeb → **MySQL** → ваша БД → **phpMyAdmin**.
2. Слева выберите базу сайта.
3. Вкладка **SQL** → вставьте содержимое файла → **Выполнить**.

| Задача | Файл в репозитории |
|--------|-------------------|
| Пользователи и токены (если таблиц ещё нет) | `sql/auth_schema.sql` |
| Только токены (если `users` уже есть) | фрагменты из `sql/auth_schema.sql` |
| Отзывы | `sql/reviews_schema.sql` |

После SQL проверьте в phpMyAdmin, что есть таблицы вроде `mobile_users`, `mobile_refresh_tokens`, `reviews`.

---

## 6. Проверка после загрузки

### Юридические страницы

В браузере — три URL из раздела 3 (без 404).

### Авторизация

На Mac в Терминале (подставьте свой email/пароль):

```bash
curl -s -X POST https://travelhub63.ru/api/auth-mobile.php \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"ВАШ_EMAIL","password":"ВАШ_ПАРОЛЬ"}'
```

Ожидание: `"success":true` и поля `accessToken`, `user`.

### Отзывы (если залили PHP + SQL)

```bash
curl -s "https://travelhub63.ru/api/crm/reviews.php?limit=5"
```

Не должно быть **404**. Пустой список `[]` — нормально.

### Туры (уже должно работать)

```bash
curl -s -o /dev/null -w "%{http_code}" "https://travelhub63.ru/api/tourvisor-mobile"
```

Ожидание: **200** или **401** (не 404).

---

## 7. Частые ошибки на SpaceWeb

| Симптом | Что проверить |
|---------|----------------|
| 404 на `privacy.html` | Файл в **`public_html`**, не в `web/legal/` на сервере |
| 404 на `/api/crm/reviews.php` | Файл не залит или лежит не в `public_html/api/crm/` |
| 500 на auth | Ошибка в `auth-mobile.config.php`, неверные `db.*`, смотреть логи PHP в панели |
| 401 при брони/оплате | Разный `jwt_secret` в auth и в скриптах оплаты/CRM |
| Сессия сбрасывается через месяц | На сервере `refresh_ttl` → `31536000` |
| Старый текст политики | Очистить кэш браузера или открыть в режиме инкогнито |

**Логи:** панель → сайт → **Журналы** / **Логи ошибок** (error_log).

---

## 8. Мини-чеклист «сделал на SpaceWeb»

- [ ] `public_html/privacy.html`, `terms.html`, `security.html` — открываются в браузере
- [ ] `public_html/api/auth-mobile.php` + `auth-mobile.config.php` с `refresh_ttl` 365 дней
- [ ] `public_html/api/lib/auth-jwt.php`
- [ ] `public_html/api/crm/reviews.php` + `review-helpful.php` + SQL `reviews_schema.sql`
- [ ] curl login → success
- [ ] В App Store Connect указан `https://travelhub63.ru/privacy.html`

---

## 9. Что не трогать без необходимости

- Рабочие скрипты **оплаты** и **tourvisor-mobile** на сервере — только если меняете JWT или ключи Tinkoff.
- Папку **`frontend/`** на сайте — favicon в legal-страницах ссылается на `/frontend/favicon.svg`; не удаляйте.
- Файл **`.env`** приложения — только на Mac / в EAS, **не** заливать в `public_html`.
