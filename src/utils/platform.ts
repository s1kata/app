// Безопасная утилита для работы с Platform
// Используется для избежания ошибок "Property 'Platform' doesn't exist" при ранней инициализации

let Platform: any = null;

function getPlatform() {
  if (!Platform) {
    try {
      const RN = require('react-native');
      Platform = RN?.Platform;
    } catch {
      // Игнорируем ошибку
    }
  }
  return Platform;
}

// Безопасное получение OS
export function getPlatformOS(): string {
  try {
    const platform = getPlatform();
    return platform?.OS || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Безопасные проверки платформы
export const platform = {
  get OS() {
    return getPlatformOS();
  },
  get isIOS() {
    return getPlatformOS() === 'ios';
  },
  get isAndroid() {
    return getPlatformOS() === 'android';
  },
  get isWeb() {
    return getPlatformOS() === 'web';
  },
  // Для совместимости с Platform.select
  select: (spec: any) => {
    const os = getPlatformOS();
    if (spec[os] !== undefined) {
      return spec[os];
    }
    if (spec.default !== undefined) {
      return spec.default;
    }
    return undefined;
  },
};

// Экспортируем для обратной совместимости
export default platform;
