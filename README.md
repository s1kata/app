# TravelHub V2 (1.1.0)

**Ветка:** `main` · **версия:** 1.1.0

## Назначение

Новый UI и функции. Preview OTA (iOS + Android) и TestFlight iOS.  
**Не** публиковать в App Store 1.0.3 через OTA.

## Новое относительно store 1.0.3

- Поиск: wizard v2, `EditSearchSheet`, `DestinationPickerSheet`
- Главная: travel ideas, quick nav, обновлённые секции
- `SupportChatService` → `support-chat.php`
- `StickyTourBar`, `TourPriceLabel`, design tokens (navy/teal/coral)
- Hybrid loader (нет premature empty на результатах)
- `ToursMapScreen`, `PopularHotelsScreen` v2
- ReviewCard, country images, horizontal calendar

## Сборки EAS

```powershell
cd D:\mobile-app\v2
npm ci

npm run start                  # dev
npm run build:preview          # APK preview (Android + можно iOS)
npm run update:preview         # OTA → channel preview

npm run build:production:ios   # TestFlight
npm run update:production      # OTA → channel production (TF iOS)
```

## Версии

| Поле | Значение |
|------|----------|
| version | 1.1.0 |
| runtimeVersion | 1.1.0 |
| EAS channel preview | `preview` |
| EAS channel production | `production` (TestFlight only) |

## Cursor workspace

Для разработки v2 открывай **`D:\mobile-app\v2`** как корень workspace.
