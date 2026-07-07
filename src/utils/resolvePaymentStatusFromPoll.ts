import type { PaymentStatusResult } from '../services/PaymentService';
import type { Booking } from '../types';

/**
 * Маппинг результата опроса платёжного API → paymentStatus брони.
 * success → paid, failed → failed, cancelled → cancelled, pending → payment_processing.
 */
export function resolvePaymentStatusFromPoll(
  result: PaymentStatusResult,
): Booking['paymentStatus'] | null {
  if (!result.success) return null;
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
