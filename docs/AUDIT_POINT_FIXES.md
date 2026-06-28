# Аудит: точечные правки (Android / iOS)

## Исправлено

| Область | Проблема | Правка |
|---------|----------|--------|
| Поиск туров | Первый поиск пустой, повтор находит | Единый путь `runSearch: true` → `searchTours()`; валидация курорта |
| Поиск туров | `meal=8` и др. невалидные id | Whitelist 2,3,4,5,7,9, sanitizer в API |
| Поиск туров | `[]` показывал ошибку | Empty state + `setLoadError(null)` |
| API ошибки | Технические HTTP-сообщения | `mapTourvisorHttpError` (400/404/500) |
| CRM 401 | Logout без перехода | `navigateToLoginAfterSessionExpired` |
| Оплата | Закрытие браузера без проверки | `resolvePaymentAfterBrowser` + баннер |
| Оплата | `cancelled` → `failed` | `payment-status.js` → `cancelled` |
| Deep link | Только `booking-success` | + `travelhub://payment/success\|fail` |
| AsyncStorage | `JSON.parse` без catch | try/catch + очистка ключа |
| Уведомления | Нет ежедневного напоминания | `scheduleDailyHotToursNotification` 12:00 |
| Код | Мёртвые hotel/mock файлы | Удалены (см. ниже) |

## Удалено из релизной ветки (next-patch)

Отельный флоу не в навигаторе — файлы удалены:

- `ApiHotelSearchScreen`, `ApiHotelDetailsScreen`, `HotelBookingFormScreen`
- `NativeHotelDetailScreen`, `ExtendedHotelDetailScreen`
- `useHotelSearch`, `HotelCacheService`, `HotelFirestoreCache`, `hotelSearchCache`
- Mock-данные: `toursData`, `hotelsData`, `extendedHotels`
- Неиспользуемые: `ImageStorageService`, `UpdateService`, `AppLoader`, `DepartureDocumentsScreen` (stub)

## Требует отдельной работы

| Область | Рекомендация |
|---------|--------------|
| PHP-бэкенд | Синхронизировать payment-status / webhook с Node `server/` |
| TypeScript | ~20 ошибок tsc (`backgroundcolor`, legacy types) |
| Tourvisor 403 с телефона | Прокси `tourvisor-mobile` (в конфиге) |
| Expo Go Android | Push — только development build |

## Чеклисты

- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)
- [IOS_TEST_CHECKLIST.md](./IOS_TEST_CHECKLIST.md)
