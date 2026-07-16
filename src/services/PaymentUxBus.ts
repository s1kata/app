type ShowSuccessFn = (onDone?: () => void) => void;
type ShowRecoveryFn = (onDone?: () => void) => void;

let showSuccessHandler: ShowSuccessFn | null = null;
let showRecoveryHandler: ShowRecoveryFn | null = null;

/** Глобальный показ полноэкранного «Оплата прошла!» после возврата из банка. */
export const paymentUxBus = {
  registerShowSuccess(handler: ShowSuccessFn): void {
    showSuccessHandler = handler;
  },
  unregisterShowSuccess(): void {
    showSuccessHandler = null;
  },
  showPaymentSuccess(onDone?: () => void): void {
    showSuccessHandler?.(onDone);
  },
  registerShowRecovery(handler: ShowRecoveryFn): void {
    showRecoveryHandler = handler;
  },
  unregisterShowRecovery(): void {
    showRecoveryHandler = null;
  },
  showPaymentRecovery(onDone?: () => void): void {
    showRecoveryHandler?.(onDone);
  },
};
