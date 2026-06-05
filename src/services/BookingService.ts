import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { requireAuthForBooking } from '../auth/requireAuth';
import { authSession } from './AuthSession';
import { i18n } from '../config/i18n';
import { Booking, BookingParty, BookingStatus, TourSnapshot } from '../types';
import { sanitizeString, MAX_LENGTHS } from '../utils/validation';
import { sotaCrmService } from './SotaCrmService';
import { pointsService } from './PointsService';
import { logger } from '../utils/logger';
import { crmOutboundQueue } from './crm/CrmOutboundQueue';
import type { CrmBookingQueuePayload } from '../types/crmQueue';
import { networkService } from './NetworkService';
import { bookingLocalStore } from './BookingLocalStore';

/**
 * Бронирования: очередь → CRM (сайт) → локальный кэш (AsyncStorage) или Firestore (legacy).
 * Источник истины по заявке — CRM на travelhub63.ru.
 */
class BookingService {
  private static instance: BookingService;
  private readonly COLLECTION_NAME = 'bookings';

  private constructor() {}

  static getInstance(): BookingService {
    if (!BookingService.instance) {
      BookingService.instance = new BookingService();
    }
    return BookingService.instance;
  }

  private useFirestore(): boolean {
    return !!db;
  }

  private sanitizeForFirestore(obj: unknown): unknown {
    if (obj === undefined) return null;
    if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map((item) => this.sanitizeForFirestore(item));
    if (typeof obj === 'object' && obj !== null && (obj as object).constructor === Object) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        const val = (obj as Record<string, unknown>)[key];
        out[key] = val !== undefined ? this.sanitizeForFirestore(val) : null;
      }
      return out;
    }
    return obj;
  }

  private static dedupeBookingsForDisplay(bookings: Booking[]): Booking[] {
    const keyOf = (b: Booking): string => {
      const ref =
        b.type === 'tour'
          ? `tour:${String(b.tourId ?? '')}`
          : `hotel:${String(b.hotelId ?? '')}`;
      const start = String(b.startDate || '').slice(0, 10);
      return `${String(b.userId)}|${b.type}|${ref}|${start}`;
    };
    const seen = new Set<string>();
    const out: Booking[] = [];
    for (const b of bookings) {
      const k = keyOf(b);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
    return out;
  }

  async persistAfterCrmSuccess(
    payload: CrmBookingQueuePayload,
    crmRequestId: string,
    idempotencyKey: string,
  ): Promise<{ firestoreBookingId: string }> {
    if (!this.useFirestore()) {
      const localId = await bookingLocalStore.saveFromCrmPayload(
        payload,
        crmRequestId,
        idempotencyKey,
      );
      return { firestoreBookingId: localId };
    }

    const now = new Date().toISOString();
    const docData = this.sanitizeForFirestore({
      userId: payload.userId,
      tourId: payload.tourId ?? null,
      hotelId: payload.hotelId ?? null,
      type: payload.type,
      status: 'pending' as BookingStatus,
      bookingDate: now,
      departureCity: payload.departureCity || null,
      startDate: payload.startDate,
      endDate: payload.endDate,
      nights: payload.nights ?? null,
      totalPrice: payload.totalPrice,
      currency: payload.currency,
      participants: payload.participants,
      party: payload.party ?? null,
      tourOperator: payload.tourOperator ?? null,
      contactInfo: payload.contactInfo,
      specialRequests: payload.specialRequests ?? null,
      tourSnapshot: payload.tourSnapshot ?? null,
      paymentStatus: 'pending' as const,
      sotaBookingId: crmRequestId,
      idempotencyKey,
      syncVersion: 1,
    });
    const bookingRef = await addDoc(collection(db!, this.COLLECTION_NAME), {
      ...(docData as Record<string, unknown>),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    logger.info(`[BookingService] Firestore cache after CRM: ${bookingRef.id} (crm=${crmRequestId})`);
    return { firestoreBookingId: bookingRef.id };
  }

  async createBooking(bookingData: {
    userId: string;
    tourId?: string;
    hotelId?: string;
    type: 'tour' | 'hotel';
    departureCity: string;
    startDate: string;
    endDate: string;
    nights: number;
    totalPrice: number;
    currency: string;
    party: BookingParty;
    tourOperator?: string;
    contactInfo: {
      name: string;
      phone: string;
      email: string;
    };
    specialRequests?: string;
    tourSnapshot?: TourSnapshot;
  }): Promise<{
    success: boolean;
    bookingId?: string;
    error?: string;
    crmSent?: boolean;
    queued?: boolean;
    idempotencyKey?: string;
  }> {
    try {
      const appUser = await authSession.getAppUser();
      const authGate = await requireAuthForBooking(appUser);
      if (!authGate.ok) {
        return {
          success: false,
          error:
            authGate.reason === 'signed_out'
              ? 'Войдите в аккаунт, чтобы оформить бронирование.'
              : 'Бронирование доступно только зарегистрированным пользователям.',
        };
      }
      if (bookingData.userId !== authGate.uid) {
        return { success: false, error: 'Несовпадение пользователя.' };
      }

      const participants =
        Math.max(0, Number(bookingData.party?.adults || 0)) +
        (Array.isArray(bookingData.party?.childrenAges) ? bookingData.party.childrenAges.length : 0);

      const contactInfo = {
        name: sanitizeString(bookingData.contactInfo?.name, MAX_LENGTHS.name),
        phone: sanitizeString(bookingData.contactInfo?.phone, MAX_LENGTHS.phone),
        email: sanitizeString(bookingData.contactInfo?.email, MAX_LENGTHS.email),
      };
      const specialRequests = bookingData.specialRequests
        ? sanitizeString(bookingData.specialRequests, MAX_LENGTHS.specialRequests)
        : null;
      const departureCity = sanitizeString(bookingData.departureCity, MAX_LENGTHS.name);
      const tourOperator = bookingData.tourOperator
        ? sanitizeString(bookingData.tourOperator, MAX_LENGTHS.name)
        : null;

      const queuePayload: CrmBookingQueuePayload = {
        userId: bookingData.userId,
        tourId: bookingData.tourId,
        hotelId: bookingData.hotelId,
        type: bookingData.type,
        departureCity,
        startDate: bookingData.startDate,
        endDate: bookingData.endDate,
        nights: bookingData.nights,
        totalPrice: bookingData.totalPrice,
        currency: bookingData.currency,
        participants,
        party: bookingData.party ?? { adults: 1, childrenAges: [] },
        tourOperator,
        contactInfo,
        specialRequests,
        tourSnapshot: bookingData.tourSnapshot ?? null,
      };

      const task = await crmOutboundQueue.enqueue(queuePayload);

      await networkService.checkConnection();

      if (!networkService.isOnline) {
        void crmOutboundQueue.drain();
        return {
          success: true,
          queued: true,
          idempotencyKey: task.idempotencyKey,
          crmSent: false,
        };
      }

      const processed = await crmOutboundQueue.processTaskNow(task.id);
      if (processed.queuedOffline) {
        void crmOutboundQueue.drain();
        return {
          success: true,
          queued: true,
          idempotencyKey: task.idempotencyKey,
          crmSent: false,
        };
      }
      if (!processed.ok || !processed.firestoreBookingId) {
        return {
          success: false,
          error: processed.error || 'Не удалось создать заявку в CRM',
        };
      }

      return {
        success: true,
        bookingId: processed.firestoreBookingId,
        crmSent: true,
        idempotencyKey: task.idempotencyKey,
      };
    } catch (error: unknown) {
      logger.error('[BookingService] Error creating booking:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create booking',
      };
    }
  }

  async getBookingById(bookingId: string): Promise<Booking | null> {
    try {
      if (this.useFirestore()) {
        const bookingDoc = await getDoc(doc(db!, this.COLLECTION_NAME, bookingId));
        if (!bookingDoc.exists()) {
          return bookingLocalStore.getById(bookingId);
        }
        const data = bookingDoc.data();
        return {
          id: bookingDoc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        } as Booking;
      }
      return bookingLocalStore.getById(bookingId);
    } catch (error: unknown) {
      logger.error('[BookingService] Error getting booking:', error);
      return bookingLocalStore.getById(bookingId);
    }
  }

  async getUserBookings(userId: string): Promise<Booking[]> {
    try {
      if (this.useFirestore()) {
        const q = query(collection(db!, this.COLLECTION_NAME), where('userId', '==', userId));
        const querySnapshot = await getDocs(q);
        const bookings: Booking[] = [];
        querySnapshot.forEach((snap) => {
          const data = snap.data();
          bookings.push({
            id: snap.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          } as Booking);
        });
        bookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return BookingService.dedupeBookingsForDisplay(bookings);
      }

      const local = await bookingLocalStore.getByUserId(userId);
      return BookingService.dedupeBookingsForDisplay(local);
    } catch (error: unknown) {
      logger.error('[BookingService] Error getting user bookings:', error);
      const local = await bookingLocalStore.getByUserId(userId);
      return BookingService.dedupeBookingsForDisplay(local);
    }
  }

  async deleteBooking(bookingId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const booking = await this.getBookingById(bookingId);
      if (!booking) {
        return { success: false, error: i18n.t('bookings.notFound') };
      }
      if (String(booking.userId) !== String(userId)) {
        return { success: false, error: i18n.t('bookings.cannotDeleteOthers') };
      }

      if (this.useFirestore()) {
        await deleteDoc(doc(db!, this.COLLECTION_NAME, bookingId));
      } else {
        const ok = await bookingLocalStore.remove(bookingId, userId);
        if (!ok) return { success: false, error: i18n.t('bookings.notFound') };
      }

      logger.info(`[BookingService] Booking ${bookingId} deleted`);
      return { success: true };
    } catch (error: unknown) {
      logger.error('[BookingService] Error deleting booking:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : i18n.t('bookings.deleteError'),
      };
    }
  }

  async maybeAwardLoyaltyAfterPaidBooking(userId: string, bookingId: string): Promise<void> {
    try {
      const booking = await this.getBookingById(bookingId);
      if (!booking || booking.paymentStatus !== 'paid') return;
      const totalPrice = Number(booking.totalPrice) || 0;
      if (totalPrice <= 0) return;
      await pointsService.awardPointsForBooking(userId, bookingId, totalPrice);
    } catch (e) {
      logger.warn('[BookingService] maybeAwardLoyaltyAfterPaidBooking:', e);
    }
  }

  async syncWithSotaCrm(bookingId: string, sotaBookingId: string): Promise<{ success: boolean; error?: string }> {
    logger.log(`[BookingService] Sync SOTA ${bookingId} (${sotaBookingId})`);

    try {
      const crmResponse = await sotaCrmService.getBookingById(sotaBookingId);
      if (!crmResponse.success || !crmResponse.data) {
        return {
          success: false,
          error: crmResponse.error || 'Failed to fetch booking from SOTA',
        };
      }

      const documentsResponse = await sotaCrmService.getDepartureDocuments(sotaBookingId);
      const documents = documentsResponse.success ? documentsResponse.data || [] : [];

      const departureDocuments = documents.map((d) => ({
        id: d.id,
        bookingId: sotaBookingId,
        documentType: d.documentType,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        uploadedAt: d.uploadedAt,
        description: d.description,
      }));

      if (this.useFirestore()) {
        await updateDoc(doc(db!, this.COLLECTION_NAME, bookingId), {
          departureDocuments,
          updatedAt: serverTimestamp(),
        });
      } else {
        await bookingLocalStore.update(bookingId, { departureDocuments });
      }

      return { success: true };
    } catch (error: unknown) {
      logger.error(`[BookingService] SOTA sync error ${bookingId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync with SOTA',
      };
    }
  }

  async cancelBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const existing = await this.getBookingById(bookingId);
      if (existing?.paymentStatus && existing.paymentStatus !== 'pending') {
        return {
          success: false,
          error: i18n.t('bookings.cancelOnlyPending') || 'Отмена доступна только до начала оплаты',
        };
      }

      if (this.useFirestore()) {
        await updateDoc(doc(db!, this.COLLECTION_NAME, bookingId), {
          status: 'cancelled' as BookingStatus,
          paymentStatus: 'cancelled' as const,
          updatedAt: serverTimestamp(),
        });
      } else {
        await bookingLocalStore.update(bookingId, {
          status: 'cancelled',
          paymentStatus: 'cancelled',
        });
      }

      logger.info(`[BookingService] Booking ${bookingId} cancelled`);
      return { success: true };
    } catch (error: unknown) {
      logger.error('[BookingService] Error cancelling booking:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel booking',
      };
    }
  }

  /** Обновить статус оплаты локально после poll / deep link (без Firestore). */
  async markPaymentStatus(
    bookingId: string,
    paymentStatus: Booking['paymentStatus'],
    extra?: Partial<Booking>,
  ): Promise<void> {
    if (this.useFirestore()) {
      try {
        await updateDoc(doc(db!, this.COLLECTION_NAME, bookingId), {
          paymentStatus,
          ...extra,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        logger.warn('[BookingService] markPaymentStatus firestore:', e);
      }
      return;
    }
    await bookingLocalStore.update(bookingId, {
      paymentStatus,
      ...extra,
      updatedAt: new Date().toISOString(),
    });
  }
}

export const bookingService = BookingService.getInstance();

crmOutboundQueue.setPersistHandler((payload, crmId, key) =>
  bookingService.persistAfterCrmSuccess(payload, crmId, key),
);
