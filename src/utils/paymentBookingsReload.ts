/**
 * Регистрация обработчика перезагрузки списка броней после возврата из оплаты (deep link).
 * BookingsScreen подписывается при монтировании; usePaymentDeepLinks вызывает после опроса статуса.
 */
type ReloadFn = () => Promise<void>;

let bookingsReloadHandler: ReloadFn | null = null;

export function registerBookingsReloadHandler(handler: ReloadFn | null): void {
  bookingsReloadHandler = handler;
}

export async function reloadBookingsAfterPayment(): Promise<void> {
  if (bookingsReloadHandler) {
    await bookingsReloadHandler();
  }
}
