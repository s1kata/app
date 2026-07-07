let relinkInProgress = false;
let relinkUpdatedAt = 0;
let openedInAppPaymentBrowser = false;
let externalPaymentSession = false;

export function markPaymentRelinkInProgress(value: boolean): void {
  relinkInProgress = value;
  relinkUpdatedAt = Date.now();
  if (!value) {
    externalPaymentSession = false;
  }
}

export function isPaymentRelinkInProgress(maxAgeMs = 120000): boolean {
  if (!relinkInProgress) return false;
  if (Date.now() - relinkUpdatedAt > maxAgeMs) {
    relinkInProgress = false;
    externalPaymentSession = false;
    return false;
  }
  return true;
}

export function markExternalPaymentSession(active: boolean): void {
  externalPaymentSession = active;
  if (active) {
    relinkInProgress = true;
    relinkUpdatedAt = Date.now();
  }
}

export function isExternalPaymentSession(): boolean {
  return externalPaymentSession;
}

export function markPaymentOpenedInExternalBrowser(): void {
  openedInAppPaymentBrowser = false;
}

export function markPaymentOpenedInAppBrowser(): void {
  openedInAppPaymentBrowser = true;
}

export function shouldDismissInAppBrowserOnReturn(): boolean {
  return openedInAppPaymentBrowser;
}
