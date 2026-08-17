/**
 * Дизайн-система TravelHub — OTA-концепт.
 * Navy + teal + coral, крупные карточки, дружелюбный mobile-first UI.
 */

import { Platform, PixelRatio } from 'react-native';

export const BRAND = {
  blue: '#5DA9A4',
  blueLight: '#7BC4BF',
  blueSubtle: '#EEF6F5',
  orange: '#FF6B6B',
  orangeLight: '#FF8A80',
  navy: '#12122E',
  white: '#FFFFFF',
  dark: '#12122E',
} as const;

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

export const radius = {
  xs: 8,
  sm: 12,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
  full: 9999,
} as const;

const getFontScale = () => Math.min(PixelRatio.getFontScale(), 1.3);

export const typography = {
  get hero() {
    return { fontSize: Math.round(28 * getFontScale()), fontWeight: '800' as const, letterSpacing: -0.6 };
  },
  get h1() {
    return { fontSize: Math.round(24 * getFontScale()), fontWeight: '800' as const, lineHeight: Math.round(30 * getFontScale()) };
  },
  get h2() {
    return { fontSize: Math.round(20 * getFontScale()), fontWeight: '700' as const, lineHeight: Math.round(26 * getFontScale()) };
  },
  get h3() {
    return { fontSize: Math.round(17 * getFontScale()), fontWeight: '700' as const, lineHeight: Math.round(23 * getFontScale()) };
  },
  get body() {
    return { fontSize: Math.round(16 * getFontScale()), fontWeight: '400' as const, lineHeight: Math.round(22 * getFontScale()) };
  },
  get bodyBold() {
    return { fontSize: Math.round(16 * getFontScale()), fontWeight: '700' as const };
  },
  get caption() {
    return { fontSize: Math.round(14 * getFontScale()), fontWeight: '400' as const, lineHeight: Math.round(19 * getFontScale()) };
  },
  get captionBold() {
    return { fontSize: Math.round(14 * getFontScale()), fontWeight: '700' as const };
  },
  get small() {
    return { fontSize: Math.round(12 * getFontScale()), fontWeight: '500' as const };
  },
  get smallBold() {
    return { fontSize: Math.round(12 * getFontScale()), fontWeight: '700' as const };
  },
  get button() {
    return { fontSize: Math.round(16 * getFontScale()), fontWeight: '800' as const };
  },
  get buttonSmall() {
    return { fontSize: Math.round(14 * getFontScale()), fontWeight: '700' as const };
  },
} as const;

export const surfaces = {
  cardBorderWidth: 1,
  cardPadding: spacing.lg,
  cardRadius: radius.xl,
  sectionRadius: radius.xxl,
} as const;

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#12122E',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 14,
    },
    android: { elevation: 3 },
  }),
  cardRaised: Platform.select({
    ios: {
      shadowColor: '#12122E',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
    },
    android: { elevation: 7 },
  }),
  button: Platform.select({
    ios: {
      shadowColor: '#5DA9A4',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
    },
    android: { elevation: 4 },
  }),
  buttonCta: Platform.select({
    ios: {
      shadowColor: '#FF6B6B',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 12,
    },
    android: { elevation: 5 },
  }),
  topBar: Platform.select({
    ios: {
      shadowColor: '#12122E',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
    },
    android: { elevation: 3 },
  }),
} as const;

export const touchTargets = {
  button: 54,
  buttonSmall: 46,
  input: 54,
  iconButton: 44,
} as const;
