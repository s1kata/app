import type { NavigationState, PartialState } from '@react-navigation/native';
import { logger } from './logger';

function getActiveRouteName(state: NavigationState | PartialState<NavigationState> | undefined): string | undefined {
  if (!state?.routes?.length) return undefined;
  const index = typeof state.index === 'number' ? state.index : 0;
  const route = state.routes[index];
  if (!route) return undefined;
  const nested = route.state as NavigationState | PartialState<NavigationState> | undefined;
  if (nested?.routes?.length) {
    return getActiveRouteName(nested) ?? route.name;
  }
  return route.name;
}

let lastLoggedRoute: string | undefined;

/**
 * Логирует смену активного экрана (видно в Xcode / Metro).
 */
export function logNavigationStateChange(state: NavigationState | undefined): void {
  const routeName = getActiveRouteName(state);
  if (!routeName || routeName === lastLoggedRoute) return;
  lastLoggedRoute = routeName;
  logger.navigation('Screen →', { route: routeName });
}

export function resetNavigationLog(): void {
  lastLoggedRoute = undefined;
}
