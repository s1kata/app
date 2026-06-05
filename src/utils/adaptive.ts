import { Dimensions, PixelRatio } from 'react-native';

// Размеры экрана
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Получаем масштаб шрифта из системных настроек
const getFontScale = () => PixelRatio.getFontScale();

// Брейкпоинты для адаптивности
export const BREAKPOINTS = {
  xs: 360,    // Очень маленькие экраны (iPhone SE, старые Android)
  sm: 375,    // Маленькие экраны (iPhone 8, iPhone X)
  md: 414,    // Средние экраны (iPhone 8 Plus, iPhone 11 Pro Max)
  lg: 768,    // Большие экраны (iPad)
  xl: 1024,   // Очень большие экраны (iPad Pro)
};

const REF_WIDTH = 390;
const REF_HEIGHT = 844;

/** Масштаб по ширине (опора 390px). factor 0..1 — сила масштабирования. */
export function scaleByWidth(size: number, factor: number = 0.5): number {
  const scaled = (SCREEN_WIDTH / REF_WIDTH) * size;
  return Math.round(size + (scaled - size) * factor);
}

/** Масштаб по высоте (опора 844px). */
export function scaleByHeight(size: number, factor: number = 0.5): number {
  const scaled = (SCREEN_HEIGHT / REF_HEIGHT) * size;
  return Math.round(size + (scaled - size) * factor);
}

/** Значение по брейкпоинту ширины. */
export function getResponsiveValue<T>(values: { xs?: T; sm?: T; md?: T; lg?: T; xl?: T; default: T }): T {
  if (SCREEN_WIDTH >= BREAKPOINTS.xl) return values.xl ?? values.lg ?? values.default;
  if (SCREEN_WIDTH >= BREAKPOINTS.lg) return values.lg ?? values.md ?? values.default;
  if (SCREEN_WIDTH >= BREAKPOINTS.md) return values.md ?? values.sm ?? values.default;
  if (SCREEN_WIDTH >= BREAKPOINTS.sm) return values.sm ?? values.xs ?? values.default;
  return values.xs ?? values.default;
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

// Адаптивная система
export const adaptive = {
  // Базовые размеры
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,

  // Проверка размеров экрана
  isExtraSmall: () => SCREEN_WIDTH < BREAKPOINTS.xs,
  isSmall: () => SCREEN_WIDTH >= BREAKPOINTS.xs && SCREEN_WIDTH < BREAKPOINTS.sm,
  isMedium: () => SCREEN_WIDTH >= BREAKPOINTS.sm && SCREEN_WIDTH < BREAKPOINTS.md,
  isLarge: () => SCREEN_WIDTH >= BREAKPOINTS.md && SCREEN_WIDTH < BREAKPOINTS.lg,
  isExtraLarge: () => SCREEN_WIDTH >= BREAKPOINTS.lg,

  // Упрощенные проверки для мобильных
  isCompact: () => SCREEN_WIDTH < BREAKPOINTS.sm,        // Компактные экраны (< 375px)
  isRegular: () => SCREEN_WIDTH >= BREAKPOINTS.sm && SCREEN_WIDTH < BREAKPOINTS.lg, // Обычные экраны
  isWide: () => SCREEN_WIDTH >= BREAKPOINTS.lg,          // Широкие экраны
  isSmallScreen: SCREEN_WIDTH < BREAKPOINTS.sm,

  // Платформа (геттеры для безопасного доступа)
  get isIOS() {
    return getPlatformOS() === 'ios';
  },
  get isAndroid() {
    return getPlatformOS() === 'android';
  },

  // Адаптивные значения для компонентов
  spacing: {
    tiny: scaleByWidth(5, 0.6),
    small: scaleByWidth(10, 0.6),
    medium: scaleByWidth(14, 0.5),
    large: scaleByWidth(18, 0.5),
    xlarge: scaleByWidth(22, 0.5),
    xxlarge: scaleByWidth(28, 0.5),
  },

  fontSize: {
    caption: () => Math.round(scaleByWidth(13, 0.4) * getFontScale()),
    body: () => Math.round(scaleByWidth(15, 0.4) * getFontScale()),
    subtitle: () => Math.round(scaleByWidth(17, 0.4) * getFontScale()),
    title: () => Math.round(scaleByWidth(19, 0.4) * getFontScale()),
    headline: () => Math.round(scaleByWidth(22, 0.4) * getFontScale()),
    display: () => Math.round(scaleByWidth(26, 0.4) * getFontScale()),
  },
  
  // Утилита для масштабирования любого размера шрифта
  scaleFont: (size: number) => Math.round(size * getFontScale()),

  iconSize: {
    small: scaleByWidth(18, 0.5),
    medium: scaleByWidth(22, 0.5),
    large: scaleByWidth(26, 0.5),
    xlarge: scaleByWidth(30, 0.5),
  },

  borderRadius: {
    small: scaleByWidth(7, 0.4),
    medium: scaleByWidth(10, 0.4),
    large: scaleByWidth(14, 0.4),
    xlarge: scaleByWidth(18, 0.4),
  },

  // Адаптивные размеры для карточек и компонентов
  card: {
    padding: scaleByWidth(14, 0.5),
    margin: scaleByWidth(10, 0.5),
    borderRadius: scaleByWidth(14, 0.4),
  },

  button: {
    height: scaleByWidth(44, 0.4),
    paddingHorizontal: scaleByWidth(18, 0.5),
    paddingVertical: scaleByWidth(10, 0.4),
    borderRadius: scaleByWidth(10, 0.4),
  },

  input: {
    height: scaleByWidth(44, 0.4),
    paddingHorizontal: scaleByWidth(14, 0.5),
    borderRadius: scaleByWidth(10, 0.4),
  },

  // Адаптивные размеры для изображений
  image: {
    thumbnail: scaleByWidth(70, 0.5),
    small: scaleByWidth(90, 0.5),
    medium: scaleByWidth(140, 0.5),
    large: scaleByWidth(220, 0.5),
  },

  // Адаптивные размеры для списков
  list: {
    itemHeight: scaleByWidth(66, 0.4),
    separatorHeight: 1,
  },

  // Адаптивные размеры для модальных окон
  modal: {
    maxWidth: Math.min(SCREEN_WIDTH - scaleByWidth(32), 400),
    padding: scaleByWidth(20, 0.5),
  },

  // Утилиты для масштабирования
  scale: (size: number, factor: number = 0.5) => {
    const scaled = (SCREEN_WIDTH / REF_WIDTH) * size;
    return Math.round(size + (scaled - size) * factor);
  },
  scaleByWidth,
  scaleByHeight,
  getResponsiveValue,

  // Процент от ширины экрана
  wp: (percentage: number) => (SCREEN_WIDTH * percentage) / 100,

  // Процент от высоты экрана
  hp: (percentage: number) => (SCREEN_HEIGHT * percentage) / 100,

  // Проверка на планшет
  isTablet: () => {
    const aspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
    return aspectRatio < 1.6 && Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) >= 600;
  },

  // Проверка на очень маленькие экраны
  isVerySmall: () => SCREEN_WIDTH < 340,

  // Проверка на очень большие экраны
  isVeryLarge: () => SCREEN_WIDTH > 500,

  // Адаптивные горизонтальные отступы
  getHorizontalPadding: () => scaleByWidth(20, 0.5),
  // Адаптивные вертикальные отступы
  getVerticalPadding: () => scaleByWidth(14, 0.4),
};

// Типы для TypeScript
export type AdaptiveSize = keyof typeof adaptive.spacing;
export type AdaptiveFontSize = keyof typeof adaptive.fontSize;
export type AdaptiveIconSize = keyof typeof adaptive.iconSize;