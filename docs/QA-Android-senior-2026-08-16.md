# TravelHub Android — Senior QA Report

**Date:** 2026-08-16  
**Device:** OPPO CPH2127 (`adb` serial `8feda72`)  
**APK:** `TravelHub-1.1.0-vc5-preview.apk` → `com.iliastravelhub.app` **1.1.0 / vc5**  
**Artifacts:** `C:\Users\Ильяс\Downloads\th-android-qa` (`v5-*-parse.txt` / screenshots)  
**Tester:** gememix76142@gmail.com (password not stored here)

---

## Verdict (device smoke vc5)

| Item | Result |
|------|--------|
| Install | **PASS** — package present, `versionName=1.1.0` `versionCode=5` |
| Profile footer | **PASS** — `TravelHub v1.1.0` |
| Login | Already signed in (Ильяс) |
| Bookings CRM sync | **PASS** — **1** booking (SAND BEACH, Хургада, 122 664 ₽, ожидает оплаты) |
| Purchase history | **PASS** — same lead №24334 / 122 664 RUB |
| Favorites | **PASS** — **15** tours (many «Тур недоступен») |
| Hot tours prices | **PASS** — Egypt ~**99 018–99 641** ₽ (Moscow) |
| Search TH prices | **PASS** — Samara→Thailand cheapest shown **~250 504** ₽ (not ~7619) |
| Details price | **PASS** — Egypt 99 018 ₽; Thailand LAMAI 250 504 ₽ |
| Settings smoke | **PASS** — theme/lang/currency; no logout/delete |
| Unpaid book ×2 | Skipped (already **1** unpaid; optional 2nd not needed) |
| Paid checkout | Not exercised |

**Overall device smoke: PASS** (with residual UX note below).

---

## Fix verification (this APK)

| Fix | On device |
|-----|-----------|
| Booking CRM sync before Firestore read | Bookings + history populated after install |
| Price sanity (no ~7619 TH) | Thailand results/details ≥100k+ |

---

## OTA preview (2026-08-17)

| Field | Value |
|-------|-------|
| Channel | `preview` |
| Runtime | `1.1.0` (vc5 APK compatible) |
| Update group | `4d2cd4d0-7e11-44f9-937a-efacae9d174b` |
| Android update ID | `01a00ed4-1440-7a1a-867d-c2f97ab107dc` |
| Dashboard | https://expo.dev/accounts/s1kata12/projects/travelhub/updates/4d2cd4d0-7e11-44f9-937a-efacae9d174b |
| Message | Search wizard bottomPad + DateRangeCalendar inline; BookingService sync; tourPriceSanity; ApiTourResultsScreen fixes |

**Shipped JS (working tree, no new APK):**

- `DateRangeCalendar.tsx` — inline variant: smaller grid (`maxHeight: 220`), no Apply footer (parent wizard «Далее»)
- `ApiTourSearchScreen.tsx` — `bottomPad` extra 56 via `useTabBarMetrics`
- `BookingService.ts` — CRM sync before Firestore read
- `tourPriceSanity` / `ApiTourResultsScreen.tsx` — price floor fixes
- Plus ~60 other JS files from recent sessions (reviews, home, favorites, validation, etc.)

**Device verify OTA:** not run 2026-08-17 — OPPO `8feda72` offline (adb: no devices). Pull: kill app ×2 on vc5 preview build.

---

## Code follow-ups (remaining)

| Sev | Issue | Status |
|-----|-------|--------|
| Med | Search wizard «Далее» under tabs | **OTA shipped** — verify on device when online |
| Low | Copy «1 бронирований» | Pluralization (not fixed this pass) |

---

## Rules reminder

- Unpaid / «оплачу позже» **MAX 2**; **no payment**
- Do not logout / delete account

---

*Session: device smoke completed on CPH2127 after sideload of vc5.*
