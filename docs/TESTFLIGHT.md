# TestFlight — загрузка TravelHub на iOS

Пошаговый гайд для production-сборки и тестирования через Apple TestFlight.

---

## Предварительные требования

- [Apple Developer Program](https://developer.apple.com/programs/) (платная подписка)
- Аккаунт [expo.dev](https://expo.dev) (владелец: `s1kata12`)
- Установлены: Node.js, `npm`, `eas-cli` (`npm i -g eas-cli`)
- Вход: `eas login`

---

## 1. Секреты EAS (production)

```bash
cd /path/to/app-main
```

Проверьте `eas-secrets.production.env`:

- `IOS_ENABLE_PUSH=1` — локальные уведомления (12:00) в native-билде
- `SITE_BASE_URL`, `AUTH_API_*`, `CRM_*`, `TOURVISOR_*`
- **Без** `FIREBASE_*`, **без** `TOURVISOR_TOKEN` в production

```bash
npm run eas:env-push:production
eas env:list --environment production
```

---

## 2. Юридические страницы на сайте

Залейте на **travelhub63.ru** через панель SpaceWeb — подробно: **[DEPLOY_SPACEWEB.md](./DEPLOY_SPACEWEB.md)** (раздел 3).

| Из репозитория | На сервере |
|----------------|------------|
| `web/legal/privacy.html` | `public_html/privacy.html` |
| `web/legal/terms.html` | `public_html/terms.html` |
| `web/legal/security.html` | `public_html/security.html` |

Проверка:

- https://travelhub63.ru/privacy.html
- https://travelhub63.ru/terms.html
- https://travelhub63.ru/security.html

В **App Store Connect** укажите URL политики: `https://travelhub63.ru/privacy.html`

---

## 3. Сессия на сервере (рекомендуется)

В `auth-mobile.config.php` увеличьте срок refresh-токена (сессия до выхода из профиля):

```php
'refresh_ttl' => 31536000,  // 365 дней
```

---

## 4. Сборка iOS

```bash
npm install
npm run typecheck
npm run build:production:ios
```

Или с очисткой кэша при проблемах:

```bash
eas build --profile production --platform ios --clear-cache
```

Дождитесь завершения на [expo.dev](https://expo.dev) → проект TravelHub → Builds.

---

## 5. Credentials (первый раз)

EAS запросит:

- **Apple ID** / App Store Connect API Key
- **Distribution certificate** и **provisioning profile** — EAS создаст автоматически (`eas credentials`)

Bundle ID: `com.iliastravelhub.app`

---

## 6. Submit в App Store Connect

После успешной сборки:

```bash
eas submit --platform ios --latest
```

Или вручную: скачать `.ipa` с expo.dev → **Transporter** (Mac App Store).

---

## 7. TestFlight в App Store Connect

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Мои приложения** → TravelHub
2. Если приложения нет — **+** → New App → iOS → bundle `com.iliastravelhub.app`
3. **TestFlight** → дождаться обработки билда (5–30 мин, иногда до 24 ч)
4. **Внутреннее тестирование** — до 100 тестеров из команды (сразу после обработки)
5. **Внешнее тестирование** — нужна краткая «Beta App Review» (обычно 24–48 ч)

### Добавить тестеров

- **Внутренние:** Users and Access → добавить email в команду
- **Внешние:** TestFlight → External Testing → группа → добавить email

Тестеры устанавливают приложение **TestFlight** из App Store и принимают приглашение.

---

## 8. Чеклист теста на iPhone (TestFlight)

- [ ] Установка без краша на сплэше
- [ ] Вход / регистрация
- [ ] Закрыть приложение → открыть → **остались залогинены**
- [ ] Поиск туров
- [ ] Бронь (заявка в CRM)
- [ ] Экран оплаты (Tinkoff)
- [ ] Разрешение на **уведомления** → напоминание в 12:00 (локальное)
- [ ] Настройки → Политика конфиденциальности → открывается
- [ ] Выход из профиля → снова экран входа

---

## 9. App Store (после TestFlight)

1. Заполнить метаданные: описание, скриншоты (6.7", 6.5"), ключевые слова
2. **Privacy Policy URL:** `https://travelhub63.ru/privacy.html`
3. **Support URL / email:** hello@travelhub63.ru
4. Privacy questionnaire: email, паспорт (при брони), геолокация (опционально), уведомления
5. **Оплата:** указать, что покупка тура — **вне приложения** (веб-оплата), не IAP
6. Submit for Review

---

## 10. Частые проблемы

| Проблема | Решение |
|----------|---------|
| Provisioning profile | `eas build --clear-cache` |
| «Invalid bundle» | Проверить `IOS_BUNDLE_ID` в EAS и Apple Developer |
| 401 при брони | Один `jwt_secret` на auth и payment |
| Вылет из аккаунта | `refresh_ttl` на сервере + пересборка с session-fix |
| Нет уведомлений в 12:00 | `IOS_ENABLE_PUSH=1` в EAS + разрешение в iOS Settings |

---

## Команды (шпаргалка)

```bash
npm run eas:env-push:production
npm run build:production:ios
eas submit --platform ios --latest
eas build:list --platform ios
```
