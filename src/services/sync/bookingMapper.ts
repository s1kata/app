import type { Booking, BookingStatus, SotaBooking, TourSnapshot } from '../../types';
import { mapCrmLeadStatusToBookingStatus } from '../../utils/bookingStatus';
import {
  resolveBookingStatusMerge,
  resolvePaymentStatusMerge,
} from '../../utils/bookingStatusTransitions';

export interface BookingMetaDto {
  localBookingId?: string | null;
  crmRequestId?: string | null;
  idempotencyKey?: string | null;
  paymentStatus?: Booking['paymentStatus'];
  tourSnapshot?: TourSnapshot | null;
  payableRub?: number | null;
  bonusSpent?: number | null;
  paidAt?: string | null;
  payment?: Booking['payment'];
  updatedAt?: string;
  createdAt?: string;
}

function parseTime(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function mapCrmStatusToBookingStatus(crmStatusRaw?: string): BookingStatus {
  return mapCrmLeadStatusToBookingStatus(crmStatusRaw) ?? 'pending';
}

const BOOKING_STATUS_RU: Record<BookingStatus, string> = {
  pending: 'В обработке',
  confirmed: 'Подтверждено',
  cancelled: 'Отменено',
  completed: 'Завершён',
};

export function mergePaymentStatus(
  local?: Booking['paymentStatus'],
  remote?: Booking['paymentStatus'],
  localUpdated?: string,
  remoteUpdated?: string,
): Booking['paymentStatus'] {
  return resolvePaymentStatusMerge(local, remote, localUpdated, remoteUpdated);
}

export function bookingMergeKey(b: Pick<Booking, 'sotaBookingId' | 'idempotencyKey' | 'id'>): string {
  if (b.sotaBookingId) return `crm:${b.sotaBookingId}`;
  if (b.idempotencyKey) return `idem:${b.idempotencyKey}`;
  return `local:${b.id}`;
}

export function crmRowToBooking(
  row: SotaBooking,
  userId: string,
  meta?: BookingMetaDto | null,
): Booking {
  const crmId = String(row.id || row.bookingNumber || '').trim();
  const now = new Date().toISOString();
  const metaSnapshot = meta?.tourSnapshot ?? undefined;
  const tourSnapshot: TourSnapshot | undefined =
    metaSnapshot ||
    (row.tourName && row.tourName !== '—'
      ? {
          hotelName: row.tourName,
          currency: row.currency || 'RUB',
          nights: 0,
        }
      : undefined);

  const paymentStatus = meta?.paymentStatus || 'pending';

  return {
    id: meta?.localBookingId || `crm_${crmId}`,
    userId,
    type: 'tour',
    status: mapCrmStatusToBookingStatus(row.status),
    bookingDate: row.createdAt || now,
    startDate: row.departureDate || '',
    endDate: row.returnDate || '',
    totalPrice: Number(row.totalPrice) || 0,
    currency: row.currency || 'RUB',
    participants: Number(row.participants) || 0,
    contactInfo: {
      name: row.clientName || '—',
      phone: row.clientPhone || '',
      email: row.clientEmail || '',
    },
    paymentStatus,
    paidAt: meta?.paidAt || undefined,
    payment: meta?.payment,
    tourSnapshot,
    sotaBookingId: crmId || undefined,
    idempotencyKey: meta?.idempotencyKey || undefined,
    departureDocuments: row.documents || [],
    createdAt: row.createdAt || meta?.createdAt || now,
    updatedAt: meta?.updatedAt || row.updatedAt || row.createdAt || now,
    syncVersion: 1,
  };
}

export function mergeBookings(local: Booking, remote: Booking): Booking {
  const lTime = parseTime(local.updatedAt);
  const rTime = parseTime(remote.updatedAt);
  const newerIsLocal = lTime >= rTime;

  const paymentStatus = mergePaymentStatus(
    local.paymentStatus,
    remote.paymentStatus,
    local.updatedAt,
    remote.updatedAt,
  );

  const base = newerIsLocal ? { ...remote, ...local } : { ...local, ...remote };

  return {
    ...base,
    id: local.id || remote.id,
    userId: local.userId || remote.userId,
    status: resolveBookingStatusMerge(local.status, remote.status),
    sotaBookingId: local.sotaBookingId || remote.sotaBookingId,
    idempotencyKey: local.idempotencyKey || remote.idempotencyKey,
    tourSnapshot: local.tourSnapshot || remote.tourSnapshot,
    paymentStatus,
    payment: newerIsLocal ? local.payment || remote.payment : remote.payment || local.payment,
    paidAt: local.paidAt || remote.paidAt,
    departureDocuments:
      (local.departureDocuments?.length ? local.departureDocuments : remote.departureDocuments) || [],
    updatedAt:
      lTime >= rTime
        ? local.updatedAt || remote.updatedAt
        : remote.updatedAt || local.updatedAt,
    syncVersion: Math.max(local.syncVersion || 0, remote.syncVersion || 0) + 1,
  };
}

export function mergeBookingLists(bookings: Booking[]): Booking[] {
  const map = new Map<string, Booking>();
  for (const b of bookings) {
    const key = bookingMergeKey(b);
    const existing = map.get(key);
    map.set(key, existing ? mergeBookings(existing, b) : b);
  }
  return Array.from(map.values()).sort(
    (a, b) => parseTime(b.createdAt) - parseTime(a.createdAt),
  );
}

export function applyMetaToBooking(booking: Booking, meta: BookingMetaDto): Booking {
  return mergeBookings(booking, {
    ...booking,
    id: meta.localBookingId || booking.id,
    sotaBookingId: meta.crmRequestId || booking.sotaBookingId,
    idempotencyKey: meta.idempotencyKey || booking.idempotencyKey,
    paymentStatus: meta.paymentStatus || booking.paymentStatus,
    tourSnapshot: meta.tourSnapshot || booking.tourSnapshot,
    paidAt: meta.paidAt || booking.paidAt,
    payment: meta.payment || booking.payment,
    updatedAt: meta.updatedAt || booking.updatedAt,
  });
}

export function bookingToMetaDto(booking: Booking): BookingMetaDto {
  return {
    localBookingId: booking.id,
    crmRequestId: booking.sotaBookingId || null,
    idempotencyKey: booking.idempotencyKey || null,
    paymentStatus: booking.paymentStatus,
    tourSnapshot: booking.tourSnapshot || null,
    payableRub: booking.totalPrice != null ? Number(booking.totalPrice) : null,
    paidAt: booking.paidAt || null,
    payment: booking.payment,
    updatedAt: booking.updatedAt,
  };
}

export function mapLocalBookingToSota(b: Booking): SotaBooking {
  const snap = b.tourSnapshot;
  const tourName =
    snap?.hotelName || [snap?.countryName, snap?.regionName].filter(Boolean).join(', ') || '—';

  return {
    id: b.sotaBookingId || b.id,
    bookingNumber: b.sotaBookingId || b.idempotencyKey || b.id,
    clientName: b.contactInfo?.name || '—',
    clientPhone: b.contactInfo?.phone || '',
    clientEmail: b.contactInfo?.email || '',
    tourName,
    departureDate: b.startDate,
    returnDate: b.endDate,
    participants: b.participants,
    status: BOOKING_STATUS_RU[b.status] || BOOKING_STATUS_RU.pending,
    totalPrice: b.totalPrice,
    currency: b.currency || snap?.currency || 'RUB',
    documents: b.departureDocuments || [],
    createdAt: b.createdAt,
    updatedAt: b.updatedAt || b.createdAt,
  };
}
