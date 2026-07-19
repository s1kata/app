# Деплой: ежедневные уведомления в 12:00

## Важно: PHP на сервер **не нужен**

Напоминание в 12:00 — **локальное** уведомление на устройстве (`expo-notifications`).
Сервер travelhub63.ru **не участвует** в отправке этого пуша.

На сервер **ничего заливать не нужно** только из‑за этой фичи.

---

## Что нужно сделать

### 1. EAS Secrets (production)

```bash
cd "D:\mobile app\app"
# В eas-secrets.production.env должно быть:
IOS_ENABLE_PUSH=1

npm run eas:env-push:production
eas env:list --environment production
```

### 2. Native build (обязательно, если раньше было `IOS_ENABLE_PUSH=0`)

OTA **не** добавит нативный модуль уведомлений.

```bash
npm run typecheck
npm run lint
npm run build:production:ios
# при необходимости Android:
npm run build:production:android
```

### 3. OTA (после билда с push-модулем)

```bash
npm run update:production
```

### 4. App Store / TestFlight

```bash
eas submit --platform ios --latest
```

---

## Проверка на устройстве

1. Удалить приложение → установить заново.
2. Пройти 18+ → Consent OK → **разрешить уведомления**.
3. Настройки → Профиль → Настройки → «Напоминание в 12:00» — включено.
4. iOS: Настройки → TravelHub → Уведомления — разрешены.
5. Дождаться 12:00 по времени телефона (или dev-тест с изменённым hour).

---

## Изменённые файлы приложения (git)

| Файл | Назначение |
|------|------------|
| `App.tsx` | bootstrap после consent, AppState re-schedule |
| `src/services/NotificationService.ts` | `bootstrapAfterConsent`, daily 12:00, toggle |
| `src/screens/ProfileSettings.tsx` | переключатель «Напоминание в 12:00» |
| `src/config/i18n.ts` | тексты |
| `eas-secrets.template.env` | `IOS_ENABLE_PUSH=1` по умолчанию |
