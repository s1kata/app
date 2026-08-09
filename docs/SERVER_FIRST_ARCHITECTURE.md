# Server-first architecture (TravelHub store)

## Принцип

| Слой | Ответственность |
|------|-----------------|
| **Сервер** (`travelhub63.ru/api`) | Ключи, Tourvisor/U-ON/Tinkoff/Expo Push, поиск, цены, CRM, крон, антиабьюз |
| **Клиент** | UI, формы, локальный кэш, permissions, deep links, optimistic UX |

Флаги: `src/config/releaseArchitectureFlags.ts`

- `PREFER_DOMAIN_TOUR_API` — туры через `/api/tours/*`
- `SERVER_OWNED_PUSH_DIGEST` — daily hot push с сервера, не local schedule

---

## Tourvisor на сервере

| Endpoint | Назначение |
|----------|------------|
| `POST /api/tours/search` | Старт поиска → `{ searchId }` |
| `GET /api/tours/search-status?id=` | Статус |
| `GET /api/tours/search-results?id=&limit=` | Результаты (+ фильтр операторов) |
| `GET /api/tours/search-continue?id=` | Continue quota |
| `GET /api/tours/details?id=&currency=` | Карточка тура |
| `GET /api/tours/flights?id=&currency=` | Перелёты |
| `GET /api/tours/dates?...` | Даты |
| `POST/GET /api/tours/hots` | Горящие |
| `POST/GET /api/hotels/search` | Отели |
| `GET /api/hotels/details?id=` | Детали отеля |

Клиент: `TourvisorApiService` → сначала domain API (`NextPatchBackendClient`), при 404 — fallback на `tourvisor-mobile` proxy.

**В стор-билде Tourvisor token только в `auth-mobile.config.php`.**

---

## Пуши

| Канал | Кто шлёт |
|-------|----------|
| Price drop | `cron/price-watch.php` |
| Daily hot digest 12:00 | `cron/daily-hots.php` |
| Token register | клиент → `/api/user/push-tokens` |
| Deep link open | клиент |

Локальный `scheduleNotificationAsync` daily **выключен** при `SERVER_OWNED_PUSH_DIGEST=true`.

Cron examples:
```bash
# каждый час
curl -s -H "X-Cron-Token: SECRET" "https://travelhub63.ru/api/cron/price-watch.php"
# ежедневно 12:00 MSK
curl -s -H "X-Cron-Token: SECRET" "https://travelhub63.ru/api/cron/daily-hots.php"
```

---

## Что остаётся на клиенте (правильно)

- Экраны / навигация / анимации
- Кэш результатов (AsyncStorage, FreshCache)
- Фильтр бюджета на выдаче (priceTo не шлём в Tourvisor)
- Theme / i18n / fontScale
- Permission prompts
- Offline queue брони → flush на CRM API

---

## Деплой checklist

1. Залить все `api/tours/*.php`, `api/cron/daily-hots.php`, helpers, `.htaccess`
2. `tourvisor_token` + `cron_token` в конфиге
3. SQL `next_patch_schema.sql` (push tokens, watches, …)
4. Настроить оба cron
5. Проверить: поиск тура, детали, hot home, пуш token после login

См. также [`NEXT_PATCH_BACKEND.md`](./NEXT_PATCH_BACKEND.md).
