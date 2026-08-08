import type { Booking } from '../types';

/**
 * Можно ли показать кнопку «Оплатить».
 * — pending: ещё не начинали оплату / можно Init;
 * — failed / cancelled: банк (webhook) подтвердил отказ/отмену → повтор;
 * — payment_processing: НЕ показываем «Оплатить» только из‑за долгого ожидания —
 *   пока терминальный статус не пришёл, остаётся «Проверить оплату».
 */
export function canShowPayBooking(booking: Booking): boolean {
  if (booking.status === 'cancelled') return false;
  const ps = booking.paymentStatus || 'pending';
  if (ps === 'paid' || ps === 'refunded' || ps === 'payment_processing') return false;
  return ps === 'pending' || ps === 'failed' || ps === 'cancelled';
}

/**
 * Пока оплата в processing — только ручная проверка статуса (без повторного Init).
 */
export function canShowCheckPaymentStatus(booking: Booking): boolean {
  if (booking.status === 'cancelled') return false;
  return booking.paymentStatus === 'payment_processing';
}
