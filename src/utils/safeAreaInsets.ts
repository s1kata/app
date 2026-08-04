import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

/** Минимальный нижний отступ таб-бара (Android gesture nav / старые устройства). */
export const TAB_BAR_MIN_BOTTOM = 16;

/**
 * Универсальный нижний отступ: iOS safe area + минимум на Android (жесты/кнопки).
 */
export function getBottomSafeInset(insets: EdgeInsets, minFallback = 8): number {
  if (Platform.OS === 'android') {
    return Math.max(insets.bottom, minFallback);
  }
  return Math.max(insets.bottom, 0);
}

/** Нижний inset таб-бара — одинаковая логика на iOS и Android. */
export function getTabBarBottomInset(insets: EdgeInsets): number {
  return getBottomSafeInset(insets, TAB_BAR_MIN_BOTTOM);
}

/**
 * Полная высота кастомного таб-бара (контент + safe area).
 * Должна совпадать с расчётом в AppNavigator для paddingBottom на экранах.
 */
export function getTabBarHeight(insets: EdgeInsets, fontScale = 1): number {
  const baseHeight = 48;
  const scaledHeight = baseHeight * Math.min(fontScale, 1.2);
  return Math.round(scaledHeight) + getTabBarBottomInset(insets) + 6;
}
