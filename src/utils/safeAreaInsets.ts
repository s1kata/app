import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

/** Минимальный нижний отступ таб-бара (Android gesture nav / старые устройства). */
export const TAB_BAR_MIN_BOTTOM = 16;

/**
 * Высота FAB «Избранное» (icon 20 + label ~12 + paddingVertical 12 + border).
 * Точное значение подставляется через tabBarMetrics.onLayout.
 */
export const TAB_BAR_FAB_SIZE = 72;

/** Зазор между FAB и верхней кромкой таб-бара. */
export const TAB_BAR_FAB_GAP = 12;

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
 * Полная высота кастомного таб-бара (floating bar + float gap + safe area).
 * Совпадает с AppNavigator: bar (pad 10+8 + icon 22 + label + activeDot) + floatGap 8 + inset.
 */
export function getTabBarHeight(insets: EdgeInsets, fontScale = 1): number {
  const scale = Math.min(fontScale, 1.2);
  const labelHeight = Math.round(10 * scale);
  // paddingTop(10) + icon(22) + label mt(3) + label + activeDot(3+4) + paddingBottom(8)
  const barContent = 10 + Math.round(22 * scale) + 3 + labelHeight + 7 + 8;
  const floatGap = 8;
  return barContent + floatGap + getTabBarBottomInset(insets);
}

/**
 * Нижний padding контента на экранах с абсолютным таб-баром (+ опционально FAB).
 */
export function getTabScreenBottomPadding(
  insets: EdgeInsets,
  fontScale = 1,
  options?: { includeFab?: boolean; extra?: number },
): number {
  // FAB убран из концепта — clearance только по явному запросу
  const includeFab = options?.includeFab === true;
  const extra = options?.extra ?? 16;
  const fabClearance = includeFab ? TAB_BAR_FAB_SIZE + TAB_BAR_FAB_GAP : 0;
  return getTabBarHeight(insets, fontScale) + fabClearance + extra;
}
