// Metro для Expo 54. Sentry Metro (withSentryConfig / getSentryExpoConfig) отключён:
// на RN 0.81 + @sentry/react-native 7.2 возможен краш «Debug ID was not found in the bundle» из-за цепочки serializer.
// Сборка ошибок в Sentry через init в приложении сохраняется; source maps для JS — через EAS/плагин Sentry при необходимости.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: false,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  keep_classnames: true,
  keep_fnames: true,
};

module.exports = config;
