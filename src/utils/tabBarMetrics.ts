import { useSyncExternalStore } from 'react';
import {
  getTabBarHeight,
  getTabScreenBottomPadding,
} from './safeAreaInsets';
import type { EdgeInsets } from 'react-native-safe-area-context';

type Metrics = {
  tabBarHeight: number;
  /** 0 = FAB отключён (концепт с 5 табами без плавающей кнопки) */
  fabHeight: number;
};

let metrics: Metrics = {
  tabBarHeight: 0,
  fabHeight: 0,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setTabBarMetrics(partial: Partial<Metrics>) {
  const next = { ...metrics, ...partial };
  if (
    next.tabBarHeight === metrics.tabBarHeight &&
    next.fabHeight === metrics.fabHeight
  ) {
    return;
  }
  metrics = next;
  emit();
}

export function getTabBarMetrics(): Metrics {
  return metrics;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTabBarMetrics(
  insets: EdgeInsets,
  fontScale = 1,
): Metrics & { contentBottomPadding: (options?: { includeFab?: boolean; extra?: number }) => number } {
  const measured = useSyncExternalStore(subscribe, getTabBarMetrics, getTabBarMetrics);
  const fallbackTab = getTabBarHeight(insets, fontScale);
  const tabBarHeight = measured.tabBarHeight > 0 ? measured.tabBarHeight : fallbackTab;
  // Важно: fabHeight=0 валиден (FAB убран). Не подставлять TAB_BAR_FAB_SIZE.
  const fabHeight = measured.fabHeight;

  return {
    tabBarHeight,
    fabHeight,
    contentBottomPadding: (options) => {
      // По умолчанию без FAB — 5 табов как на концепте
      const includeFab = options?.includeFab === true;
      const extra = options?.extra ?? 16;
      const fabClearance = includeFab && fabHeight > 0 ? fabHeight + 12 : 0;
      return tabBarHeight + fabClearance + extra;
    },
  };
}

/** Fallback without hook (rare); prefer useTabBarMetrics in screens. */
export function estimateTabScreenBottomPadding(
  insets: EdgeInsets,
  fontScale = 1,
  options?: { includeFab?: boolean; extra?: number },
): number {
  const m = getTabBarMetrics();
  if (m.tabBarHeight > 0) {
    const includeFab = options?.includeFab === true;
    const extra = options?.extra ?? 16;
    const fabClearance = includeFab && m.fabHeight > 0 ? m.fabHeight + 12 : 0;
    return m.tabBarHeight + fabClearance + extra;
  }
  return getTabScreenBottomPadding(insets, fontScale, {
    includeFab: options?.includeFab === true,
    extra: options?.extra,
  });
}
