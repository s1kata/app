// Переменные из .env попадают в приложение через extra. После изменения .env перезапустите: npx expo start --clear
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: true });

/** Cleartext HTTP только вне production/preview.
 * Источник окружения: EAS_BUILD_PROFILE (автоматически на EAS) или APP_ENV (из secrets/local env).
 */
const runtimeEnv = (process.env.EAS_BUILD_PROFILE || process.env.APP_ENV || '').toLowerCase();
const isProductionLike = runtimeEnv === 'production' || runtimeEnv === 'preview';
const updateChannel = (process.env.EAS_BUILD_PROFILE || process.env.APP_ENV || 'development').toLowerCase();
const websiteBaseUrl = (process.env.WEBSITE_BASE_URL || process.env.EXPO_PUBLIC_WEBSITE_BASE_URL || "https://travelhub63.ru").replace(/\/+$/, "");
// VIP app icon source vector: ./assets/icons/icon-vip.svg
// PNG for native icons is auto-generated from SVG to .generated/icon-vip-1024.png
const appIconPng = "./.generated/icon-vip-1024.png";
/** Все запросы Tourvisor из приложения только через PHP-прокси на сайте (токен только на сервере). */
const tourvisorPassthroughUrl = `${websiteBaseUrl}/api/tourvisor-mobile`;
const hasSentryUploadCreds =
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT &&
  !!process.env.SENTRY_AUTH_TOKEN;

/** EAS / Expo project id: `EAS_PROJECT_ID` в .env / EAS Secrets перекрывает значение по умолчанию. */
const easProjectId = (process.env.EAS_PROJECT_ID || "0f6984f9-e3d1-46f5-ae15-dd0e5b4deef2").trim();

/**
 * EAS production / preview: задайте в Secrets или в UI (Environment variables), не в репозитории:
 * — APP_ENV (опционально; можно задать в EAS Secrets/Env, если нужно)
 * — PAYMENT_PAGE_URL, WEBSITE_BASE_URL — публичный хост API и сайта (без секретов)
 * — FIREBASE_* — публичные ключи клиента Firebase (в бандле)
 * — Preview/Production: клиентский TOURVISOR_* в бандл не кладётся; JWT только на сервере (backend tourvisor-mobile.php).
 * — Development: опционально TOURVISOR_TOKEN / TOURVISOR_API_URL для прямого API.
 * — EXPO_OWNER (опционально): владелец проекта на expo.dev; по умолчанию s1kata12
 * — EAS_PROJECT_ID (опционально: по умолчанию задан в app.config.js; переменная перекрывает)
 * — EXPO_PUBLIC_SENTRY_DSN — мониторинг ошибок (Sentry); SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN — для загрузки source maps на EAS build
 * Не задавайте в production: EXPO_PUBLIC_UON_API_KEY (ключ U-ON в клиенте отключён при APP_ENV=production|preview)
 * Сервер (Node на хостинге, не в приложении): TINKOFF_*, UON_API_KEY, Firebase Admin, APP_URL/API_URL.
 *
 * Сторы iOS + Android: одни и те же EAS Secrets (FIREBASE_*, URL, TOURVISOR_*); отдельно — подпись
 * (EAS credentials) и submit: Google JSON-ключ локально, Apple — EXPO_APPLE_ID или ASC API Key в credentials.
 */
module.exports = {
  expo: {
    name: "TravelHub",
    slug: "travelhub",
    owner: (process.env.EXPO_OWNER || "s1kata12").trim(),
    version: "1.0.1",
    scheme: "travelhub",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: appIconPng,
    splash: {
      image: appIconPng,
      resizeMode: "contain",
      backgroundColor: "#0A5BFF"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.travelhub.app",
      icon: appIconPng,
      buildNumber: "4",
      infoPlist: {
        // RU + EN в одной строке — ревью App Store / TestFlight и пользователи EN-системы
        NSLocationWhenInUseUsageDescription:
          "Мы используем ваше местоположение для погоды, часового пояса и персонализации поиска туров и отелей рядом с вами. Данные не продаём третьим лицам.\n\nWe use your location for weather, timezone, and personalizing nearby tour and hotel search. We do not sell your location data.",
        NSUserNotificationsUsageDescription:
          "Уведомления о бронированиях, горящих турах и персональных предложениях.\n\nNotifications about bookings, hot tours, and personal offers.",
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["remote-notification"]
      }
    },
    android: {
      package: "com.travelhub.app",
      versionCode: 4,
      usesCleartextTraffic: !isProductionLike,
      adaptiveIcon: {
        foregroundImage: appIconPng,
        backgroundColor: "#F5F7FA"
      },
      icon: appIconPng,
      /** Только то, что использует код (expo-location). Камера/галерея не подключены — не запрашиваем лишние разрешения. */
      permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"]
    },
    plugins: [
      "expo-web-browser",
      [
        "expo-notifications",
        {
          icon: appIconPng,
          color: "#0066CC",
          sounds: []
        }
      ],
      ...(hasSentryUploadCreds
        ? [[
            "@sentry/react-native/expo",
            {
              url: process.env.SENTRY_URL || "https://sentry.io/",
              organization: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT
            }
          ]]
        : [])
    ],
    ...(easProjectId
      ? {
          updates: {
            url: `https://u.expo.dev/${easProjectId}`,
            // Убираем 400 "channel-name required" в standalone/release билдах
            requestHeaders: {
              "expo-channel-name": updateChannel,
            },
          }
        }
      : {}),
    runtimeVersion: {
      policy: "appVersion"
    },
    extra: {
      eas: {
        ...(easProjectId ? { projectId: easProjectId } : {}),
        buildProfile: process.env.EAS_BUILD_PROFILE || process.env.APP_ENV || "unknown"
      },
      // Базовый URL сайта для оплаты. Важно: без слэша в конце, только хост (https://travelhub63.ru).
      paymentPageUrl: process.env.PAYMENT_PAGE_URL || "https://travelhub63.ru",
      // URL сайта для туров/отелей (dev/stage/prod)
      websiteBaseUrl,
      // Tourvisor: preview/production — только HTTPS passthrough на WEBSITE_BASE_URL (без прямого api.tourvisor.ru в клиенте).
      tourvisorToken: isProductionLike ? "" : (process.env.TOURVISOR_TOKEN || process.env.TOURVISOR_JWT_TOKEN || ""),
      tourvisorApiUrl: isProductionLike ? tourvisorPassthroughUrl : (process.env.TOURVISOR_API_URL || tourvisorPassthroughUrl),
      // Worker в store/preview отключаем — иначе ошибочный secret перебивает passthrough.
      tourvisorWorkerUrl: isProductionLike ? "" : (process.env.TOURVISOR_WORKER_URL || ""),
      // U-ON: ключ на сервере — UON_API_KEY (Node / PHP). В бандл для dev — только EXPO_PUBLIC_UON_API_KEY.
      sotaCrmBaseUrl: process.env.SOTA_CRM_BASE_URL || "",
      // В store/preview ключ в клиент не кладём (CRM через прокси). Dev: EXPO_PUBLIC_UON_API_KEY (fallback: EXPO_PUBLIC_SOTA_API_KEY).
      uonApiKey: isProductionLike
        ? ""
        : (process.env.EXPO_PUBLIC_UON_API_KEY || process.env.EXPO_PUBLIC_SOTA_API_KEY || "").trim(),
      // Firebase Configuration
      firebaseApiKey: process.env.FIREBASE_API_KEY || "",
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      firebaseAppId: process.env.FIREBASE_APP_ID || "",
      firebaseMeasurementId: process.env.FIREBASE_MEASUREMENT_ID || "",
      sentryDsn: (process.env.EXPO_PUBLIC_SENTRY_DSN || "").trim(),
      sentryEnableInDev: process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV === "1" ? "1" : "0"
    }
  }
};
