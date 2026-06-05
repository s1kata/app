# Preview-сборка (тест без магазина)

Preview-профиль используется для внутреннего теста:
- **Android:** APK для установки без Google Play
- **iOS:** internal build для установки на устройство через EAS/TestFlight-процесс

## 1. Загрузить переменные в EAS (окружение preview)

Из корня проекта:

```bash
npx eas env:push preview --path .env
```

Если переменные уже помечены как **Secret** и push падает с ошибкой смены типа:

1. [expo.dev](https://expo.dev) → проект → **Environment variables** → **Preview**
2. Удалите нужные переменные и выполните `eas env:push preview --path .env` снова

## 2. Сборка

```bash
npx eas build --profile preview --platform android
npx eas build --profile preview --platform ios
```

Или из `package.json`:
- `npm run build:preview` (Android preview)
- `npx eas build --profile preview --platform ios` (iOS preview)

Нужен аккаунт Expo: `npx eas login`. Сборка идет в облаке EAS; по завершении получаете ссылку на artifact.

## 3. Что проверить в `.env`

Минимум для приложения: **Firebase**, **Tourvisor** (`TOURVISOR_TOKEN`), **EAS_PROJECT_ID**.

Для полного теста оплаты и CRM добавьте `PAYMENT_PAGE_URL`, `UON_API_KEY` (сервер Node) и снова выполните `eas env:push preview`.

Общая схема продакшена: [PRODUCTION.md](./PRODUCTION.md).
