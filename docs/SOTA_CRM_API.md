# SOTA CRM (U-ON.Travel) — API Запросы

## Базовый URL
- Production: `https://api.u-on.ru`
- Тест: задайте `SOTA_CRM_BASE_URL` в .env (например `http://localhost:3333`)

## Аутентификация
- API-ключ передаётся в пути: `https://api.u-on.ru/{API_KEY}/endpoint`
- Ключ: U-ON.Travel → Настройки → Интеграции → API
- Переменная на сервере: `UON_API_KEY` (.env / EAS Secrets для Node). Устаревшее имя `SOTA_API_KEY` поддерживается как fallback в `server/sota/uonClient.js`.

## Эндпоинты

### 1. Создание заявки (request/create)
- **Метод:** POST
- **Путь:** `/{key}/request/create.json`
- **Тело:** JSON с полями r_id_internal, r_dat, r_dat_begin, r_dat_end, u_name, u_surname, u_phone, u_email, note, price, services[]
- **Retry:** 3 попытки с экспоненциальной задержкой при 5xx/сетевых ошибках

### 2. Поиск клиента по email (user/email)
- **Метод:** POST
- **Путь:** `/{key}/user/email.json`
- **Тело:** `{ "email": "client@example.com" }`

### 3. Поиск клиента по телефону (user/phone)
- **Метод:** GET
- **Путь:** `/{key}/user/phone/{phone}.json`

### 4. Бронирования клиента (request-by-client)
- **Метод:** GET
- **Путь:** `/{key}/request-by-client/{clientId}/1.json`

### 5. Заявка по ID (request/{id})
- **Метод:** GET
- **Путь:** `/{key}/request/{id}.json`

### 6. Документы заявки
- Файлы приходят в `request/{id}` в поле `files[]`

### 7. Добавление файла (request-file/create)
- **Метод:** POST
- **Путь:** `/{key}/request-file/create.json`
- **Тело:** r_id, file_name, file_url, file_note?, file_is_private?

### 8. Уведомление об оплате (request-action/create)
- **Метод:** POST
- **Путь:** `/{key}/request-action/create.json`

## Валидация ответов
- Проверка `response.ok` и `content-type: application/json`
- Парсинг ошибок из `message` или `error` в JSON
- При HTML-ответе (404) — отдельное сообщение

## Rate limit
- Не более 10 запросов/сек (100мс между запросами)
