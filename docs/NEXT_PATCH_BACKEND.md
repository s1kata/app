# Next-patch + server-first backend

Полная архитектура: [`SERVER_FIRST_ARCHITECTURE.md`](./SERVER_FIRST_ARCHITECTURE.md)

## Endpoints

| Endpoint | Назначение |
|----------|------------|
| `POST /api/tours/search` | Старт поиска туров |
| `GET /api/tours/search-status` | Статус поиска |
| `GET /api/tours/search-results` | Результаты (+ operator filter) |
| `GET /api/tours/search-continue` | Continue |
| `GET /api/tours/details` | Детали тура |
| `GET /api/tours/flights` | Перелёты |
| `GET /api/tours/dates` | Даты |
| `POST/GET /api/tours/hots` | Горящие |
| `POST/GET /api/hotels/search` | Отели |
| `GET /api/hotels/details` | Детали отеля |
| `GET/POST /api/user/recommendations` | Рекомендации |
| `GET/POST/DELETE /api/user/price-watches` | Price watches |
| `GET/POST/DELETE /api/user/push-tokens` | Expo tokens |
| `GET/PUT /api/cache/hotel-images` | Кэш фото |
| `GET/POST /api/cron/price-watch` | Cron: price drops |
| `GET/POST /api/cron/daily-hots` | Cron: daily digest |

SQL: [`../sql/next_patch_schema.sql`](../sql/next_patch_schema.sql)

## Деплой SpaceWeb

1. Залить `api/tours/*`, `api/hotels/*`, `api/cron/*`, `api/user/*`, `api/cache/*`, `api/lib/*`, корневой `api/.htaccess`
2. Не затирать полный `crm-read-helpers` / `uon-client` на проде
3. Конфиг:
   ```php
   'tourvisor_token' => '...',
   'cron_token' => '...',
   ```
4. SQL schema
5. Cron:
   ```bash
   curl -s -H "X-Cron-Token: SECRET" "https://travelhub63.ru/api/cron/price-watch.php"
   curl -s -H "X-Cron-Token: SECRET" "https://travelhub63.ru/api/cron/daily-hots.php"
   ```

## Клиент

- `releaseArchitectureFlags.ts` — `PREFER_DOMAIN_TOUR_API`, `SERVER_OWNED_PUSH_DIGEST`
- `TourvisorApiService` — server-first domain API, proxy fallback
- `NextPatchBackendClient` — все доменные вызовы
