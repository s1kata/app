import type { BookingParty, TourSnapshot } from './index';

/** Статус задачи в персистентной очереди (AsyncStorage) */
export type CrmQueueTaskStatus = 'pending' | 'processing' | 'success' | 'failed';

export type CrmQueueTaskType = 'CREATE_APPLICATION';

/**
 * Полезная нагрузка для CRM + последующей записи в Firestore (кэш после успеха CRM).
 * Дублирует поля createBooking — одна структура на весь поток.
 */
export interface CrmBookingQueuePayload {
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
  participants: number;
  party: BookingParty;
  tourOperator?: string | null;
  contactInfo: { name: string; phone: string; email: string };
  specialRequests?: string | null;
  tourSnapshot?: TourSnapshot | null;
}

/**
 * Задача очереди: CRM — единственная запись «истины»; Firestore только после успеха.
 */
export interface CrmQueueTask {
  id: string;
  type: CrmQueueTaskType;
  /** Стабильный ключ для r_id_internal и защиты от дублей при retry */
  idempotencyKey: string;
  status: CrmQueueTaskStatus;
  retries: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  payload: CrmBookingQueuePayload;
}
