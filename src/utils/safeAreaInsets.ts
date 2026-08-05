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
 * Полная высота кастомного таб-бара (контент + safe area).
 * Совпадает с layout в AppNavigator: paddingTop 4 + icon 44 + label + paddingBottom (inset+8).
 */
export function getTabBarHeight(insets: EdgeInsets, fontScale = 1): number {
  const scale = Math.min(fontScale, 1.2);
  // Совпадает с AppNavigator: label fontSize 9
  const labelHeight = Math.round(9 * scale);
  // paddingTop(4) + iconBall(44) + label marginTop(4) + label + paddingBottom(safeBottom+8)
  const content = 4 + 44 + 4 + labelHeight;
  return content + getTabBarBottomInset(insets) + 8;
}

/**
 * Нижний padding контента на экранах с абсолютным таб-баром (+ опционально FAB).
 */
export function getTabScreenBottomPadding(
  insets: EdgeInsets,
  fontScale = 1,
  options?: { includeFab?: boolean; extra?: number },
): number {
  const includeFab = options?.includeFab !== false;
  const extra = options?.extra ?? 16;
  const fabClearance = includeFab ? TAB_BAR_FAB_SIZE + TAB_BAR_FAB_GAP : 0;
  return getTabBarHeight(insets, fontScale) + fabClearance + extra;
}
