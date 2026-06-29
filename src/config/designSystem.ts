/**
 * Единая дизайн-система TravelHub.
 * Travel-стандарт: синий #0066CC + голубой фон + белые карточки.
 * Оранжевый #FF6B00 — только для CTA-кнопок и бейджей скидок.
 */

import { Platform, PixelRatio } from 'react-native';

/** Базовые цвета бренда */
export const BRAND = {
  /** Основной синий — навигация, иконки, ссылки */
  blue: '#0066CC',
  /** Светлый синий — hover, активные состояния */
  blueLight: '#3399FF',
  /** Очень светлый голубой — фон инпутов, чипсов */
  blueSubtle: '#F0F7FF',
  /** CTA-оранжевый — главные кнопки действия, бейджи скидок */
  orange: '#FF6B00',
  /** Светло-оранжевый — pressed-состояние CTA */
  orangeLight: '#FF8C33',
  /** Белый */
  white: '#FFFFFF',
  /** Тёмный текст */
  dark: '#1A1A1A',
} as const;

/** Шкала отступов (базис 4px) */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

/** Скругления */
export const radius = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

/** Типографическая иерархия. Учитывает fontScale для доступности. */
const getFontScale = () => Math.min(PixelRatio.getFontScale(), 1.3);

export const typography = {
  get hero() {
    return { fontSize: Math.round(28 * getFontScale()), fontWeight: '700' as const, letterSpacing: -0.5 };
  },
  get h1() {
    return { fontSize: Math.round(24 * getFontScale()), fontWeight: '700' as const, lineHeight: Math.round(30 * getFontScale()) };
  },
  get h2() {
    return { fontSize: Math.round(20 * getFontScale()), fontWeight: '700' as const, lineHeight: Math.round(26 * getFontScale()) };
  },
  get h3() {
    return { fontSize: Math.round(18 * getFontScale()), fontWeight: '600' as const, lineHeight: Math.round(24 * getFontScale()) };
  },
  get body() {
    return { fontSize: Math.round(16 * getFontScale()), fontWeight: '400' as const, lineHeight: Math.round(22 * getFontScale()) };
  },
  get bodyBold() {
    return { fontSize: Math.round(16 * getFontScale()), fontWeight: '600' as const };
  },
  get caption() {
    return { fontSize: Math.round(14 * getFontScale()), fontWeight: '400' as const, lineHeight: Math.round(19 * getFontScale()) };
  },
  get captionBold() {
    return { fontSize: Math.round(14 * getFontScale()), fontWeight: '600' as const };
  },
  get small() {
    return { fontSize: Math.round(12 * getFontScale()), fontWeight: '400' as const };
  },
  get smallBold() {
    return { fontSize: Math.round(12 * getFontScale()), fontWeight: '600' as const };
  },
  get button() {
    return { fontSize: Math.round(16 * getFontScale()), fontWeight: '700' as const };
  },
  get buttonSmall() {
    return { fontSize: Math.round(14 * getFontScale()), fontWeight: '600' as const };
  },
} as const;

/** Единый "дорогой" стиль поверхностей. */
export const surfaces = {
  cardBorderWidth: 1,
  cardPadding: spacing.lg,
  cardRadius: radius.xl,
  sectionRadius: radius.xxl,
} as const;

/** Тени для карточек (iOS + Android) */
export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 10,
    },
    android: { elevation: 3 },
  }),
  cardRaised: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
  }),
  /** Тень синей кнопки */
  button: Platform.select({
    ios: {
      shadowColor: '#0066CC',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
    },
    android: { elevation: 4 },
  }),
  /** Тень CTA-кнопки (оранжевая) */
  buttonCta: Platform.select({
    ios: {
      shadowColor: '#FF6B00',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 8,
    },
    android: { elevation: 5 },
  }),
  topBar: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 4 },
  }),
} as const;

/** Высота интерактивных элементов (минимум 44px для пальца) */
export const touchTargets = {
  button: 52,
  buttonSmall: 44,
  input: 52,
  iconButton: 44,
} as const;
