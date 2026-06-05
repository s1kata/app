# Чек-лист тестирования TravelHub на iOS

Логи в Xcode: фильтр по `[iOS Test]`, `[Navigation]`, `[Network]`, `[Lifecycle]`, `[ErrorBoundary]`.

## Подготовка Xcode

1. Открыть `ios/*.xcworkspace` (после `npx expo prebuild` / EAS dev build).
2. **Product → Scheme → Edit Scheme → Run → Info**: включить **Debug executable**.
3. **Run → Arguments → Environment**: при необходимости `OS_ACTIVITY_MODE=disable` не ставить (нужны системные логи).
4. Консоль Xcode: показать **All Output**, не только errors.
5. Metro: `npx expo start` — JS-логи дублируются в терминал.

При старте в консоли должны появиться:

```
=== DEV MODE ===
Platform: ios ...
[INFO] ... [App] App startup
[INFO] ... [App] App mounted
```

## 1. Запуск

| Действие | Ожидание | Лог `[iOS Test]` / тег |
|----------|----------|-------------------------|
| Холодный старт | Splash → Login или MainTabs | `1_launch`, `[Lifecycle] SplashScreen` |
| Нет белого экрана после splash | Splash скрывается ≤ 5 с | `App startup`, `NavigationContainer ready` |
| ErrorBoundary не срабатывает | Нет красного экрана ошибки | — |

## 2. Авторизация

| Действие | Ожидание | Лог |
|----------|----------|-----|
| Вход email/пароль | MainTabs | `2_auth`, `Screen → MainTabs` |
| Регистрация | Успех / валидация | `[Network]` запросы Firebase |
| Выход | Login | `Screen → Login` |
| Сессия после перезапуска | Автовход из AsyncStorage | `1_launch` + `isAuthenticated: true` |

## 3. Поиск туров

| Действие | Ожидание | Лог |
|----------|----------|-----|
| Выбор вылета / страны / дат | Модалки открываются (iOS overFullScreen) | `[Lifecycle] ApiTourHotelSearch` |
| Поиск | Loader → результаты | `3_tour_search`, `[Network]` Tourvisor |
| Горячие туры | Список / пусто с сообщением | `Screen → ApiHotTours` |

## 4. Карточка тура

| Действие | Ожидание | Лог |
|----------|----------|-----|
| Открыть тур из списка | Детали, фото | `4_tour_card`, `Screen → ApiTourDetails` |
| Назад | Список без краша | `[Navigation]` |

## 5. Бронирование

| Действие | Ожидание | Лог |
|----------|----------|-----|
| Форма бронирования | KeyboardAvoidingView `padding` на iOS | `5_booking`, `Screen → TourBooking` |
| Заполнить и отправить | Успех / ошибка валидации | `[Network]` CRM |

## 6. Оплата

| Действие | Ожидание | Лог |
|----------|----------|-----|
| Оплатить из Bookings | Открывается браузер / WebBrowser | `6_payment` |
| Успешная оплата | Alert + обновление списка | `[Network]` payment-status |
| Отмена | Возврат без краша | — |

## 7. Возврат из браузера (deep link)

| Действие | Ожидание | Лог |
|----------|----------|-----|
| `travelhub://booking-success?...` | Bookings + poll статуса | `7_browser_return`, `[DeepLink]` |
| `travelhub://booking-fail?...` | Сообщение об ошибке | `[DeepLink]` |

## 8. Уведомления

| Действие | Ожидание | Лог |
|----------|----------|-----|
| Разрешить push (первый запуск) | Диалог iOS | `8_notifications` |
| Тап по уведомлению | Навигация на экран | `[Navigation]` |

## Типичные проблемы iOS

| Симптом | Где смотреть |
|---------|----------------|
| Краш при открытии модалки | `[Lifecycle]` + `presentationStyle` |
| Таб-бар перекрывает контент | `safe area` / `insets.bottom` в логах Dimensions |
| «Офлайн» при Wi‑Fi | `[NetworkService]`, fetch ping |
| 403 Tourvisor | `[Tourvisor API]` в логах (JWT / IP whitelist) |
| Необработанная ошибка | `[GlobalError]`, `[UnhandledPromiseRejection]`, `[ErrorBoundary]` |

## Опционально: отправка логов на сервер

В `.env`:

```
EXPO_PUBLIC_LOG_ENDPOINT=https://your-server.com/api/client-logs
```

Отправляются уровни WARN и ERROR (и тестовые INFO с `[iOS Test]` при вызове `logIosTestStep`).
