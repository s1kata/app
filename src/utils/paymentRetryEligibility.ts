import type { Booking } from '../types';

/** Через сколько «Оплата обрабатывается» снова показывать «Оплатить» (повторный Init). */
export const PAYMENT_PROCESSING_RETRY_MS = 3 * 60 * 1000;

function parseTime(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** processing старше порога — можно начать оплату заново. */
export function isPaymentProcessingStale(booking: Booking, nowMs = Date.now()): boolean {
  if (booking.paymentStatus !== 'payment_processing') return false;
  const anchor = parseTime(booking.updatedAt) || parseTime(booking.createdAt);
  if (!anchor) return true;
  return nowMs - anchor >= PAYMENT_PROCESSING_RETRY_MS;
}

/**
 * Можно ли показать кнопку «Оплатить».
 * pending / failed / cancelled — да; payment_processing — только если устарел.
 */
export function canShowPayBooking(booking: Booking, nowMs = Date.now()): boolean {
  if (booking.status === 'cancelled') return false;
  const ps = booking.paymentStatus || 'pending';
  if (ps === 'paid' || ps === 'refunded') return false;
  if (ps === 'payment_processing') return isPaymentProcessingStale(booking, nowMs);
  return ps === 'pending' || ps === 'failed' || ps === 'cancelled';
}

/** Свежий processing — показать «Проверить статус», без повторного Init. */
export function canShowCheckPaymentStatus(booking: Booking, nowMs = Date.now()): boolean {
  if (booking.status === 'cancelled') return false;
  if (booking.paymentStatus !== 'payment_processing') return false;
  return !isPaymentProcessingStale(booking, nowMs);
}
