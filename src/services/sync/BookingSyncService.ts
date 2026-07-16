import type { Booking, SotaBooking } from '../../types';
import { bookingLocalStore } from '../BookingLocalStore';
import { fetchClientBookingsViaBackend } from '../crm/CrmBackendClient';
import { fetchBookingsMetaViaBackend, upsertBookingMetaViaBackend } from './UserDataBackendClient';
import {
  applyMetaToBooking,
  bookingMergeKey,
  bookingToMetaDto,
  crmRowToBooking,
  mergeBookingLists,
  type BookingMetaDto,
} from './bookingMapper';
import { logger } from '../../utils/logger';

function findMetaForCrmRow(metaList: BookingMetaDto[], row: SotaBooking): BookingMetaDto | undefined {
  const crmId = String(row.id || '').trim();
  const bookingNumber = String(row.bookingNumber || '').trim();
  return metaList.find((m) => {
    const crm = String(m.crmRequestId || '').trim();
    const idem = String(m.idempotencyKey || '').trim();
    return (
      (crm && (crm === crmId || crm === bookingNumber)) ||
      (idem && (idem === crmId || idem === bookingNumber))
    );
  });
}

function findMetaForLocal(metaList: BookingMetaDto[], local: Booking): BookingMetaDto | undefined {
  return metaList.find((m) => {
    if (m.localBookingId && m.localBookingId === local.id) return true;
    if (m.crmRequestId && local.sotaBookingId && m.crmRequestId === local.sotaBookingId) return true;
    if (m.idempotencyKey && local.idempotencyKey && m.idempotencyKey === local.idempotencyKey) return true;
    return false;
  });
}

class BookingSyncService {
  private syncInFlight = new Map<string, Promise<void>>();

  async syncForUser(
    userId: string,
    contact?: { email?: string | null; phone?: string | null },
  ): Promise<Booking[]> {
    if (!userId || userId.startsWith('guest_')) {
      return bookingLocalStore.getByUserId(userId);
    }

    const existing = this.syncInFlight.get(userId);
    if (existing) {
      await existing;
      return bookingLocalStore.getByUserId(userId);
    }

    const task = this.doSync(userId, contact);
    this.syncInFlight.set(userId, task);
    try {
      await task;
    } finally {
      this.syncInFlight.delete(userId);
    }
    return bookingLocalStore.getByUserId(userId);
  }

  private async doSync(
    userId: string,
    contact?: { email?: string | null; phone?: string | null },
  ): Promise<void> {
    const local = await bookingLocalStore.getByUserId(userId);
    const metaRes = await fetchBookingsMetaViaBackend();
    const metaList: BookingMetaDto[] = metaRes.success && Array.isArray(metaRes.data) ? metaRes.data : [];

    let crmRows: SotaBooking[] = [];
    const email = contact?.email?.trim() || undefined;
    const phone = contact?.phone?.trim() || undefined;
    if (email || phone) {
      const crmRes = await fetchClientBookingsViaBackend(email, phone);
      if (crmRes.success && Array.isArray(crmRes.data)) {
        crmRows = crmRes.data as SotaBooking[];
      } else if (crmRes.error && crmRes.error !== 'no_backend' && crmRes.error !== 'unauthorized') {
        logger.debug('[BookingSync] CRM pull:', crmRes.error);
      }
    }

    const fromCrm: Booking[] = crmRows.map((row) => {
      const meta = findMetaForCrmRow(metaList, row);
      return crmRowToBooking(row, userId, meta);
    });

    const localWithMeta = local.map((b) => {
      const meta = findMetaForLocal(metaList, b);
      return meta ? applyMetaToBooking(b, meta) : b;
    });

    const crmKeys = new Set<string>(fromCrm.map((b) => bookingMergeKey(b)));
    const localOnly = localWithMeta.filter((b) => !crmKeys.has(bookingMergeKey(b)));

    const merged = mergeBookingLists([...fromCrm, ...localOnly]);
    await bookingLocalStore.setBookingsForUser(userId, merged);

    for (const b of merged) {
      if (b.sotaBookingId || b.idempotencyKey) {
        void this.pushMetaQuiet(b);
      }
    }
  }

  async pushMeta(booking: Booking): Promise<void> {
    if (!booking.userId || booking.userId.startsWith('guest_')) return;
    if (!booking.sotaBookingId && !booking.idempotencyKey) return;

    const meta = bookingToMetaDto(booking);
    const res = await upsertBookingMetaViaBackend(meta);
    if (!res.success) {
      logger.debug('[BookingSync] pushMeta failed:', res.error);
    }
  }

  private async pushMetaQuiet(booking: Booking): Promise<void> {
    try {
      await this.pushMeta(booking);
    } catch (e) {
      logger.debug('[BookingSync] pushMetaQuiet:', e);
    }
  }
}

export const bookingSyncService = new BookingSyncService();
