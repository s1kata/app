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
  Timestamp,
  serverTimestamp 
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

/**
 * Сервис для работы с бронированиями туров и отелей
 * Интегрирован с Firebase Firestore и системой SOTA
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

  /**
   * Рекурсивно заменяет undefined на null — Firestore не принимает undefined
   */
  private sanitizeForFirestore(obj: any): any {
    if (obj === undefined) return null;
    if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map((item) => this.sanitizeForFirestore(item));
    if (typeof obj === 'object' && obj.constructor === Object) {
      const out: Record<string, any> = {};
      for (const key of Object.keys(obj)) {
        const val = (obj as Record<string, any>)[key];
        if (val !== undefined) {
          out[key] = this.sanitizeForFirestore(val);
        } else {
          out[key] = null;
        }
      }
      return out;
    }
    return obj;
  }

  /**
   * Один карточный вид на дубликаты одной и той же заявки (одинаковый тур/отель и дата старта).
   * Список уже отсортирован с новыми первыми — оставляем первую запись по ключу.
   */
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

  /**
   * Запись в Firestore только после успешного ответа CRM (см. crmOutboundQueue).
   * Источник истины по заявке — CRM; Firestore — кэш/синхронизация для приложения.
   */
  async persistAfterCrmSuccess(
    payload: CrmBookingQueuePayload,
    crmRequestId: string,
    idempotencyKey: string,
  ): Promise<{ firestoreBookingId: string }> {
    if (!db) {
      throw new Error('Firebase недоступен. Настройте подключение.');
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
    const bookingRef = await addDoc(collection(db, this.COLLECTION_NAME), {
      ...docData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    logger.info(`[BookingService] Кэш Firestore после CRM: ${bookingRef.id} (crm=${crmRequestId})`);
    return { firestoreBookingId: bookingRef.id };
  }

  /**
   * Создание бронирования: очередь → CRM → Firestore (кэш).
   * Офлайн: задача в AsyncStorage, отправка при появлении сети.
   */
  async createBooking(bookingData: {
    userId: string;
    tourId?: string;
    hotelId?: string;
    type: 'tour' | 'hotel';
    /** Город вылета (вводится пользователем) */
    departureCity: string;
    startDate: string;
    endDate: string;
    nights: number;
    totalPrice: number;
    currency: string;
    /** Состав (взрослые и возраст детей). Кол-во участников вычисляется автоматически. */
    party: BookingParty;
    /** Туроператор (вводится пользователем; для тура обязателен) */
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
    /** Заявка в очереди (офлайн); bookingId появится после синхронизации с CRM */
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
      if (!db) {
        return { success: false, error: 'Firebase недоступен. Настройте подключение.' };
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
    } catch (error: any) {
      logger.error('[BookingService] Error creating booking:', error);
      return {
        success: false,
        error: error.message || 'Failed to create booking',
      };
    }
  }

  /**
   * Получение бронирования по ID
   */
  async getBookingById(bookingId: string): Promise<Booking | null> {
    try {
      if (!db) return null;
      const bookingDoc = await getDoc(doc(db, this.COLLECTION_NAME, bookingId));
      
      if (!bookingDoc.exists()) {
        return null;
      }

      const data = bookingDoc.data();
      return {
        id: bookingDoc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      } as Booking;
    } catch (error: any) {
      logger.error('[BookingService] Error getting booking:', error);
      return null;
    }
  }

  /**
   * Получение всех бронирований пользователя
   */
  async getUserBookings(userId: string): Promise<Booking[]> {
    try {
      if (!db) return [];
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);
      const bookings: Booking[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        bookings.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        } as Booking);
      });

      // Сортируем по дате создания (новые первыми)
      bookings.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      return BookingService.dedupeBookingsForDisplay(bookings);
    } catch (error: any) {
      logger.error('[BookingService] Error getting user bookings:', error);
      return [];
    }
  }

  /**
   * Удаление бронирования (для удаления ошибочных или «чужих» записей)
   */
  async deleteBooking(bookingId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!db) return { success: false, error: 'Firebase недоступен' };
      const booking = await this.getBookingById(bookingId);
      if (!booking) {
        return { success: false, error: i18n.t('bookings.notFound') };
      }
      if (String(booking.userId) !== String(userId)) {
        return { success: false, error: i18n.t('bookings.cannotDeleteOthers') };
      }
      await deleteDoc(doc(db, this.COLLECTION_NAME, bookingId));
      logger.info(`[BookingService] Booking ${bookingId} deleted`);
      return { success: true };
    } catch (error: any) {
      logger.error('[BookingService] Error deleting booking:', error);
      return { success: false, error: error.message || i18n.t('bookings.deleteError') };
    }
  }

  /**
   * Начисление баллов после оплаты (идемпотентно). Источник оплаты — webhook на сервере.
   */
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

  /**
   * Синхронизация с SOTA — получение данных о бронировании
   */
  async syncWithSotaCrm(bookingId: string, sotaBookingId: string): Promise<{ success: boolean; error?: string }> {
    logger.log(`[BookingService] 🔄 Начало синхронизации с SOTA для бронирования ${bookingId} (ID: ${sotaBookingId})`);
    
    try {
      // Получаем данные из SOTA
      logger.log(`[BookingService] 📥 Запрос данных бронирования из SOTA: ${sotaBookingId}`);
      const crmResponse = await sotaCrmService.getBookingById(sotaBookingId);
      
      if (!crmResponse.success || !crmResponse.data) {
        logger.error(`[BookingService] ❌ Не удалось получить данные из SOTA:`, crmResponse.error);
        return {
          success: false,
          error: crmResponse.error || 'Failed to fetch booking from SOTA',
        };
      }

      logger.log(`[BookingService] ✅ Данные бронирования получены из SOTA`);
      const crmBooking = crmResponse.data;

      // Получаем документы на вылет
      logger.log(`[BookingService] 📥 Запрос документов на вылет из SOTA: ${sotaBookingId}`);
      const documentsResponse = await sotaCrmService.getDepartureDocuments(sotaBookingId);
      const documents = documentsResponse.success ? documentsResponse.data || [] : [];
      
      if (documentsResponse.success) {
        logger.log(`[BookingService] ✅ Получено документов из SOTA: ${documents.length}`);
      } else {
        logger.warn(`[BookingService] ⚠️ Не удалось получить документы из SOTA:`, documentsResponse.error);
      }

      // Обновляем бронирование в Firebase
      if (!db) return { success: false, error: 'Firebase недоступен' };
      logger.log(`[BookingService] 💾 Обновление бронирования в Firebase с данными из SOTA`);
      await updateDoc(doc(db, this.COLLECTION_NAME, bookingId), {
        departureDocuments: documents.map(doc => ({
          id: doc.id,
          bookingId: sotaBookingId,
          documentType: doc.documentType,
          fileName: doc.fileName,
          fileUrl: doc.fileUrl,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          uploadedAt: doc.uploadedAt,
          description: doc.description,
        })),
        updatedAt: serverTimestamp(),
      });

      logger.log(`[BookingService] ✅ Бронирование ${bookingId} успешно синхронизировано с SOTA`);
      return { success: true };
    } catch (error: any) {
      logger.error(`[BookingService] ❌ Ошибка синхронизации с SOTA для бронирования ${bookingId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to sync with SOTA',
      };
    }
  }

  /**
   * Отмена бронирования
   */
  async cancelBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!db) return { success: false, error: 'Firebase недоступен' };
      const existing = await this.getBookingById(bookingId);
      if (existing?.paymentStatus && existing.paymentStatus !== 'pending') {
        return {
          success: false,
          error: i18n.t('bookings.cancelOnlyPending') || 'Отмена доступна только до начала оплаты',
        };
      }
      await updateDoc(doc(db, this.COLLECTION_NAME, bookingId), {
        status: 'cancelled' as BookingStatus,
        paymentStatus: 'cancelled' as const,
        updatedAt: serverTimestamp(),
      });

      logger.info(`[BookingService] Booking ${bookingId} cancelled`);
      return { success: true };
    } catch (error: any) {
      logger.error('[BookingService] Error cancelling booking:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel booking',
      };
    }
  }
}

export const bookingService = BookingService.getInstance();

crmOutboundQueue.setPersistHandler((payload, crmId, key) =>
  bookingService.persistAfterCrmSuccess(payload, crmId, key),
);
