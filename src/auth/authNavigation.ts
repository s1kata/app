import type { NavigationContainerRef } from '@react-navigation/native';
import type { RefObject } from 'react';

let navigationRef: RefObject<NavigationContainerRef<Record<string, object | undefined>> | null> | null =
  null;

export function setAuthNavigationRef(
  ref: RefObject<NavigationContainerRef<Record<string, object | undefined>> | null>,
): void {
  navigationRef = ref;
}

/** CRM 401 после неудачного refresh — сброс сессии и экран входа. */
export function navigateToLoginAfterSessionExpired(): void {
  try {
    navigationRef?.current?.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  } catch {
    navigationRef?.current?.navigate('Login' as never);
  }
}
