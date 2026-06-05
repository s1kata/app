import { PixelRatio } from 'react-native';

// Базовые размеры для iPhone 11 Pro
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

// Значения по умолчанию
let SCREEN_WIDTH = 375;
let SCREEN_HEIGHT = 812;
let dimensionsInitialized = false;

// Кэшированный импорт Dimensions для производительности
let Dimensions: any = null;
function getDimensions() {
  if (!Dimensions) {
    try {
      const RN = require('react-native');
      Dimensions = RN?.Dimensions;
    } catch {
      // Игнорируем ошибку
    }
  }
  return Dimensions;
}

// Безопасное получение Platform
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
function getPlatformOS(): string {
  try {
    const platform = getPlatform();
    return platform?.OS || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Безопасное получение размеров экрана с отложенной инициализацией
function getDimensionsSafe() {
  if (dimensionsInitialized) {
    return { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };
  }
  
  try {
    const Dims = getDimensions();
    if (Dims && typeof Dims.get === 'function') {
      const dims = Dims.get('window');
      if (dims && typeof dims.width === 'number' && typeof dims.height === 'number') {
        SCREEN_WIDTH = dims.width;
        SCREEN_HEIGHT = dims.height;
      }
    }
  } catch (error) {
    // Используем значения по умолчанию
  }
  
  dimensionsInitialized = true;
  return { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };
}

// Вспомогательные функции для получения размеров (без геттеров для избежания проблем с Metro)
function getScreenWidth(): number {
  const dims = getDimensionsSafe();
  return dims.width;
}

function getScreenHeight(): number {
  const dims = getDimensionsSafe();
  return dims.height;
}

export const responsive = {
  // Размеры экрана (функции вместо геттеров)
  screenWidth: getScreenWidth,
  screenHeight: getScreenHeight,

  // Проверки устройств (функции)
  isSmallDevice() {
    return getScreenWidth() < 375;
  },
  isSmallScreen() {
    return getScreenWidth() < 375;
  },
  isMediumDevice() {
    const width = getScreenWidth();
    return width >= 375 && width < 414;
  },
  isLargeDevice() {
    return getScreenWidth() >= 414;
  },
  
  // iOS размеры (функции вместо геттеров)
  isIPhoneSE() {
    return getScreenWidth() === 320;
  },
  isIPhone8() {
    return getScreenWidth() === 375 && getScreenHeight() === 667;
  },
  isIPhone11() {
    return getScreenWidth() === 414 && getScreenHeight() === 896;
  },
  isIPhone12() {
    return getScreenWidth() === 390 && getScreenHeight() === 844;
  },
  isIPhone12Mini() {
    return getScreenWidth() === 360 && getScreenHeight() === 780;
  },
  isIPhone12ProMax() {
    return getScreenWidth() === 428 && getScreenHeight() === 926;
  },
  isIPhone13() {
    return getScreenWidth() === 390 && getScreenHeight() === 844;
  },
  isIPhone14() {
    return getScreenWidth() === 390 && getScreenHeight() === 844;
  },
  isIPhone14Pro() {
    return getScreenWidth() === 393 && getScreenHeight() === 852;
  },
  isIPhone14ProMax() {
    return getScreenWidth() === 430 && getScreenHeight() === 932;
  },
  
  // Платформа (функции вместо геттеров)
  isIOS() {
    return getPlatformOS() === 'ios';
  },
  isAndroid() {
    return getPlatformOS() === 'android';
  },
  
  // Масштабирование
  scale: (size: number) => {
    return (getScreenWidth() / BASE_WIDTH) * size;
  },
  
  verticalScale: (size: number) => {
    return (getScreenHeight() / BASE_HEIGHT) * size;
  },
  
  moderateScale: (size: number, factor = 0.5) => {
    const scaled = (getScreenWidth() / BASE_WIDTH) * size;
    return size + (scaled - size) * factor;
  },
  
  // Отступы
  getHorizontalPadding: () => {
    const width = getScreenWidth();
    if (width < 375) return 16;
    if (width < 414) return 20;
    return 24;
  },
  
  getVerticalPadding: () => {
    const height = getScreenHeight();
    if (height < 700) return 16;
    if (height < 800) return 20;
    return 24;
  },
  
  // Размеры шрифтов
  getFontSize: (base: number, factor = 0.5) => {
    const scaled = (getScreenWidth() / BASE_WIDTH) * base;
    return base + (scaled - base) * factor;
  },
  
  // Радиусы
  borderRadius: {
    small: 8,
    medium: 12,
    large: 16,
    xlarge: 24,
  },
  
  // Иконки
  iconSize: {
    small: 16,
    medium: 20,
    large: 24,
    xlarge: 32,
  },
  
  // Кнопки
  buttonHeight: {
    small: 36,
    medium: 44,
    large: 52,
  },
  
  // Утилиты
  wp: (percentage: number) => {
    return (getScreenWidth() * percentage) / 100;
  },
  
  hp: (percentage: number) => {
    return (getScreenHeight() * percentage) / 100;
  },
  
  // Проверка на планшет
  isTablet: () => {
    const width = getScreenWidth();
    const height = getScreenHeight();
    const aspectRatio = height / width;
    return aspectRatio < 1.6 && Math.min(width, height) >= 600;
  },
};

// Экспортируем объект responsive
export default responsive;

// Размеры шрифтов
// Используем простой объект без Proxy, геттеров и кэширования
// для избежания проблем с "property is not configurable"
export const fontSize = {
  tiny: 10,
  small: 12,
  regular: 14,
  medium: 16,
  large: 18,
  xlarge: 20,
  xxlarge: 24,
  huge: 32,
};

// Функция для получения адаптивного размера шрифта
// Используйте эту функцию вместо прямого доступа к fontSize, если нужна адаптивность
export const getAdaptiveFontSize = (base: number, factor = 0.5): number => {
  return responsive.getFontSize(base, factor);
};
