import type { Booking, BookingStatus } from '../types';

const BOOKING_RANK: Record<BookingStatus, number> = {
  pending: 0,
  confirmed: 1,
  completed: 2,
  cancelled: 10,
};

function parseTime(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Допустим ли переход статуса заявки. */
export function canTransitionBookingStatus(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true;
  if (from === 'cancelled' || from === 'completed') return false;
  if (to === 'pending' && from === 'confirmed') return false;
  return true;
}

/** Допустим ли переход статуса оплаты. */
export function canTransitionPaymentStatus(
  from: Booking['paymentStatus'] | undefined,
  to: Booking['paymentStatus'],
): boolean {
  const f = from || 'pending';
  if (f === to) return true;
  if (f === 'paid') return to === 'paid' || to === 'refunded';
  if (f === 'refunded' || f === 'cancelled') return false;
  if (to === 'pending' && (f === 'payment_processing' || f === 'failed')) return false;
  return true;
}

/**
 * Слияние статуса заявки: терминальные состояния и более «продвинутый» этап побеждают.
 * CRM — источник правды при reconcile.
 */
export function resolveBookingStatusMerge(a: BookingStatus, b: BookingStatus): BookingStatus {
  if (a === 'cancelled' || b === 'cancelled') return 'cancelled';
  if (a === 'completed' || b === 'completed') return 'completed';
  return BOOKING_RANK[a] >= BOOKING_RANK[b] ? a : b;
}

/**
 * Слияние статуса оплаты: paid не откатывается; processing важнее pending.
 */
export function resolvePaymentStatusMerge(
  local?: Booking['paymentStatus'],
  remote?: Booking['paymentStatus'],
  localUpdated?: string,
  remoteUpdated?: string,
): Booking['paymentStatus'] {
  const l = local || 'pending';
  const r = remote || 'pending';
  const lTime = parseTime(localUpdated);
  const rTime = parseTime(remoteUpdated);

  if (l === 'paid' || r === 'paid') return 'paid';
  if (l === 'refunded' || r === 'refunded') return 'refunded';

  if (l === 'payment_processing' || r === 'payment_processing') {
    if (l === 'failed' || r === 'failed') {
      return lTime >= rTime ? l : r;
    }
    return 'payment_processing';
  }

  if (l === 'failed' || r === 'failed') {
    return lTime >= rTime ? l : r;
  }

  if (l === 'cancelled' || r === 'cancelled') {
    return lTime >= rTime ? l : r;
  }

  return lTime >= rTime ? l : r;
}
