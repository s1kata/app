import type { Booking, BookingStatus } from '../types';

export type BookingStatusI18nKey =
  | 'bookings.statusCancelled'
  | 'bookings.statusCompleted'
  | 'bookings.statusConfirmed'
  | 'bookings.statusPending';

export type PaymentStatusI18nKey =
  | 'bookings.statusPaid'
  | 'bookings.paymentProcessing'
  | 'bookings.paymentFailed'
  | 'bookings.paymentCancelled'
  | 'bookings.paymentRefunded'
  | 'bookings.paymentPending';

export type StatusChipIcon =
  | 'close-circle'
  | 'checkmark-done-circle'
  | 'checkmark-circle'
  | 'time-outline'
  | 'sync'
  | 'alert-circle'
  | 'remove-circle-outline'
  | 'return-down-back'
  | 'hourglass-outline';

export type StatusLegDisplay = {
  i18nKey: BookingStatusI18nKey | PaymentStatusI18nKey;
  icon: StatusChipIcon;
  tone: 'success' | 'warning' | 'error' | 'muted';
};

/**
 * U-ON lead / CRM → статус заявки в приложении.
 * Возвращает null, если распознать статус не удалось.
 */
export function mapCrmLeadStatusToBookingStatus(crmStatusRaw?: string | null): BookingStatus | null {
  const s = String(crmStatusRaw || '').toLowerCase().trim();
  if (!s || s === '—' || s === '-') return null;

  if (s.includes('cancel') || s.includes('отмен') || s.includes('аннул') || s.includes('refus')) {
    return 'cancelled';
  }
  if (
    s.includes('complete') ||
    s.includes('closed') ||
    s.includes('заверш') ||
    s.includes('архив') ||
    s.includes('выдан') ||
    s.includes('done')
  ) {
    return 'completed';
  }
  if (
    s.includes('confirm') ||
    s.includes('approved') ||
    s.includes('подтверж') ||
    s.includes('согласован')
  ) {
    return 'confirmed';
  }
  if (
    s.includes('new') ||
    s.includes('open') ||
    s.includes('pending') ||
    s.includes('wait') ||
    s.includes('нов') ||
    s.includes('обработ') ||
    s.includes('work') ||
    s.includes('в работе') ||
    s.includes('lead')
  ) {
    return 'pending';
  }

  return null;
}

/** Опционально: оплата из текста CRM (не перетирает локальный paid). */
export function inferPaymentStatusFromCrmLead(crmStatusRaw?: string | null): Booking['paymentStatus'] | undefined {
  const s = String(crmStatusRaw || '').toLowerCase();
  if (s.includes('оплач') || s.includes('paid')) return 'paid';
  return undefined;
}

export function getBookingLegDisplay(status: BookingStatus): StatusLegDisplay {
  switch (status) {
    case 'cancelled':
      return { i18nKey: 'bookings.statusCancelled', icon: 'close-circle', tone: 'error' };
    case 'completed':
      return { i18nKey: 'bookings.statusCompleted', icon: 'checkmark-done-circle', tone: 'success' };
    case 'confirmed':
      return { i18nKey: 'bookings.statusConfirmed', icon: 'checkmark-circle', tone: 'success' };
    case 'pending':
    default:
      return { i18nKey: 'bookings.statusPending', icon: 'time-outline', tone: 'warning' };
  }
}

export function getPaymentLegDisplay(paymentStatus: Booking['paymentStatus'] | undefined): StatusLegDisplay {
  const ps = paymentStatus || 'pending';
  switch (ps) {
    case 'paid':
      return { i18nKey: 'bookings.statusPaid', icon: 'checkmark-circle', tone: 'success' };
    case 'payment_processing':
      return { i18nKey: 'bookings.paymentProcessing', icon: 'sync', tone: 'warning' };
    case 'failed':
      return { i18nKey: 'bookings.paymentFailed', icon: 'alert-circle', tone: 'error' };
    case 'cancelled':
      return { i18nKey: 'bookings.paymentCancelled', icon: 'remove-circle-outline', tone: 'muted' };
    case 'refunded':
      return { i18nKey: 'bookings.paymentRefunded', icon: 'return-down-back', tone: 'muted' };
    case 'pending':
    default:
      return { i18nKey: 'bookings.paymentPending', icon: 'hourglass-outline', tone: 'warning' };
  }
}

export function statusToneColor(
  tone: StatusLegDisplay['tone'],
  theme: { success: string; warning: string; error: string; secondaryText: string },
): string {
  switch (tone) {
    case 'success':
      return theme.success;
    case 'error':
      return theme.error;
    case 'muted':
      return theme.secondaryText;
    case 'warning':
    default:
      return theme.warning;
  }
}
