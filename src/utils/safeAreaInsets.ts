import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

/**
 * Универсальный нижний отступ: iOS safe area + минимум на Android (жесты/кнопки).
 */
export function getBottomSafeInset(insets: EdgeInsets, minFallback = 8): number {
  if (Platform.OS === 'android') {
    return Math.max(insets.bottom, minFallback);
  }
  return Math.max(insets.bottom, 0);
}
