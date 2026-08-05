import { useSyncExternalStore } from 'react';
import {
  getTabBarHeight,
  getTabScreenBottomPadding,
  TAB_BAR_FAB_GAP,
  TAB_BAR_FAB_SIZE,
} from './safeAreaInsets';
import type { EdgeInsets } from 'react-native-safe-area-context';

type Metrics = {
  tabBarHeight: number;
  fabHeight: number;
};

let metrics: Metrics = {
  tabBarHeight: 0,
  fabHeight: TAB_BAR_FAB_SIZE,
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
  const fabHeight = measured.fabHeight > 0 ? measured.fabHeight : TAB_BAR_FAB_SIZE;

  return {
    tabBarHeight,
    fabHeight,
    contentBottomPadding: (options) => {
      const includeFab = options?.includeFab !== false;
      const extra = options?.extra ?? 16;
      const fabClearance = includeFab ? fabHeight + TAB_BAR_FAB_GAP : 0;
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
    const includeFab = options?.includeFab !== false;
    const extra = options?.extra ?? 16;
    const fabH = m.fabHeight > 0 ? m.fabHeight : TAB_BAR_FAB_SIZE;
    return m.tabBarHeight + (includeFab ? fabH + TAB_BAR_FAB_GAP : 0) + extra;
  }
  return getTabScreenBottomPadding(insets, fontScale, options);
}
