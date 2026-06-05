/**
 * Глобальный статус-бар оплаты (верхний баннер, не react-native StatusBar).
 */

export type PaymentBannerVariant = 'success' | 'error' | 'warning' | 'info';

export type PaymentBannerPayload = {
  message: string;
  variant: PaymentBannerVariant;
  id: number;
};

type Listener = (payload: PaymentBannerPayload | null) => void;

let listener: Listener | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

export function subscribePaymentStatusBanner(cb: Listener): () => void {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

/** Показать статус-бар оплаты (автоскрытие ~5 с). */
export function showPaymentStatusBar(
  message: string,
  variant: PaymentBannerVariant = 'info',
): void {
  if (!message?.trim()) return;
  if (hideTimer) clearTimeout(hideTimer);
  const payload: PaymentBannerPayload = { message: message.trim(), variant, id: ++seq };
  listener?.(payload);
  hideTimer = setTimeout(() => {
    listener?.(null);
    hideTimer = null;
  }, 5000);
}

/** Алиас из ТЗ (то же, что showPaymentStatusBar). */
export const showStatusBar = showPaymentStatusBar;

export function hidePaymentStatusBar(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  listener?.(null);
}
