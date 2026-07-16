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
  if (f === 'refunded') return false;
  // Отмена/ошибка → повторный Init (pending / processing) или поздний paid.
  if (f === 'cancelled' || f === 'failed') {
    return to === 'pending' || to === 'payment_processing' || to === 'paid';
  }
  // Stuck processing: unlock для retry или финальный unpaid/paid.
  if (f === 'payment_processing') {
    return (
      to === 'paid' ||
      to === 'failed' ||
      to === 'cancelled' ||
      to === 'pending' ||
      to === 'payment_processing'
    );
  }
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
 * Слияние статуса оплаты: paid не откатывается;
 * cancelled/failed не перетираются устаревшим payment_processing.
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

  const isTerminalUnpaid = (s: Booking['paymentStatus']) => s === 'cancelled' || s === 'failed';

  if (isTerminalUnpaid(l) || isTerminalUnpaid(r)) {
    if (isTerminalUnpaid(l) && isTerminalUnpaid(r)) {
      return lTime >= rTime ? l : r;
    }
    if (isTerminalUnpaid(l) && (r === 'payment_processing' || r === 'pending')) {
      // Новый Init (processing новее) побеждает старый cancelled/failed.
      if (r === 'payment_processing' && rTime > lTime) return r;
      return l;
    }
    if (isTerminalUnpaid(r) && (l === 'payment_processing' || l === 'pending')) {
      if (l === 'payment_processing' && lTime > rTime) return l;
      return r;
    }
  }

  if (l === 'payment_processing' || r === 'payment_processing') {
    return 'payment_processing';
  }

  return lTime >= rTime ? l : r;
}
