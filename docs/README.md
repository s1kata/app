# Документация TravelHub

| Документ | Описание |
|----------|----------|
| [**PRODUCTION.md**](./PRODUCTION.md) | **Главный документ для продакшена**: переменные окружения, EAS, оплата, CRM, OTA, чеклист |
| [DEPLOY_SITE.md](./DEPLOY_SITE.md) | Деплой PHP/SQL на travelhub63.ru (auth, CRM, Tourvisor proxy, оплата) |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | Ручные проверки на устройстве перед/после релиза |
| [IOS_TEST_CHECKLIST.md](./IOS_TEST_CHECKLIST.md) | Чеклист iOS / TestFlight |
| [PAYMENT_STORES.md](./PAYMENT_STORES.md) | Оплата вне приложения и правила App Store / Google Play |
| [PREVIEW_BUILD.md](./PREVIEW_BUILD.md) | Сборка preview для внутреннего теста |
| [SOTA_CRM_INTEGRATION.md](./SOTA_CRM_INTEGRATION.md) | Настройка интеграции с U-ON (SOTA) |
| [SOTA_CRM_API.md](./SOTA_CRM_API.md) | Краткий справочник API U-ON |
| [AUDIT_POINT_FIXES.md](./AUDIT_POINT_FIXES.md) | Журнал точечных правок и известных ограничений |
| [TERMS_OF_SERVICE.md](./TERMS_OF_SERVICE.md) | Условия использования |
| [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) | Политика конфиденциальности |
| [../src/config/releaseUiFlags.ts](../src/config/releaseUiFlags.ts) | Флаги скрытого UI (отели / next-patch) |
| [../server/README.md](../server/README.md) | Node API оплаты (референс; на проде — PHP на сайте) |

**Поддержка:** hello@travelhub63.ru, +7 (495) 660-36-66 — см. экран «Помощь и поддержка» в приложении.

## Актуальная архитектура клиента (релиз 1.0.x)

- **Поиск туров:** форма `ApiTourHotelSearch` → экран результатов с `runSearch: true` → `searchTours()` (poll Tourvisor + fetch).
- **Tourvisor:** только через прокси `${WEBSITE_BASE_URL}/api/tourvisor-mobile` (JWT на сервере).
- **Auth:** `auth-mobile.php` + JWT Bearer (не Firebase Auth).
- **CRM / бонусы:** прокси `/api/crm/*` на сайте, ключ U-ON только на сервере.
- **Отели:** UI и экраны удалены из релизной ветки (`RELEASE_HIDE_NEXT_PATCH_UI`); вернуть в next-patch.

Корень проекта: [README.md](../README.md).
