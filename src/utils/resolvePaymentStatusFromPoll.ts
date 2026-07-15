import type { PaymentStatusResult } from '../services/PaymentService';
import type { Booking } from '../types';

/**
 * Маппинг результата опроса платёжного API → paymentStatus брони.
 * paid ТОЛЬКО при status === 'success' (банк CONFIRMED через API).
 * pending → payment_processing (или вызывающий код может unlock в pending).
 */
export function resolvePaymentStatusFromPoll(
  result: PaymentStatusResult,
): Booking['paymentStatus'] | null {
  if (!result.success || !result.status) return null;
  switch (result.status) {
    case 'success':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'pending':
      return 'payment_processing';
    default:
      return null;
  }
}
