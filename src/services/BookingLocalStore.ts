/**
 * Локальный кэш бронирований (AsyncStorage) когда Firestore отключён.
 * Источник истины по заявке — CRM на сайте; здесь только отображение в приложении.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Booking, BookingStatus } from '../types';
import { generateUuidV4 } from '../utils/uuid';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@travelhub/local_bookings';

async function readAll(): Promise<Booking[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Booking[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(bookings: Booking[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
}

export const bookingLocalStore = {
  async saveFromCrmPayload(
    payload: {
      userId: string;
      tourId?: string;
      hotelId?: string;
      type: 'tour' | 'hotel';
      departureCity: string;
      startDate: string;
      endDate: string;
      nights?: number;
      totalPrice: number;
      currency: string;
      participants: number;
      party?: Booking['party'];
      tourOperator?: string | null;
      contactInfo: Booking['contactInfo'];
      specialRequests?: string | null;
      tourSnapshot?: Booking['tourSnapshot'];
    },
    crmRequestId: string,
    idempotencyKey: string,
    bookingId?: string,
  ): Promise<string> {
    const now = new Date().toISOString();
    const id = bookingId || generateUuidV4();
    const booking: Booking = {
      id,
      userId: payload.userId,
      tourId: payload.tourId,
      hotelId: payload.hotelId,
      type: payload.type,
      status: 'pending' as BookingStatus,
      bookingDate: now,
      departureCity: payload.departureCity || undefined,
      startDate: payload.startDate,
      endDate: payload.endDate,
      nights: payload.nights,
      totalPrice: payload.totalPrice,
      currency: payload.currency,
      participants: payload.participants,
      party: payload.party,
      tourOperator: payload.tourOperator || undefined,
      contactInfo: payload.contactInfo,
      specialRequests: payload.specialRequests || undefined,
      tourSnapshot: payload.tourSnapshot,
      paymentStatus: 'pending',
      sotaBookingId: crmRequestId,
      idempotencyKey,
      syncVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    const all = await readAll();
    const idx = all.findIndex((b) => b.id === id || b.idempotencyKey === idempotencyKey);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...booking, id: all[idx].id };
    } else {
      all.unshift(booking);
    }
    await writeAll(all);
    logger.info(`[BookingLocalStore] saved booking ${id} (crm=${crmRequestId})`);
    return idx >= 0 ? all[idx].id : id;
  },

  async getById(bookingId: string): Promise<Booking | null> {
    const all = await readAll();
    return all.find((b) => b.id === bookingId) ?? null;
  },

  async getByUserId(userId: string): Promise<Booking[]> {
    const all = await readAll();
    return all
      .filter((b) => String(b.userId) === String(userId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async update(bookingId: string, patch: Partial<Booking>): Promise<boolean> {
    const all = await readAll();
    const idx = all.findIndex((b) => b.id === bookingId);
    if (idx < 0) return false;
    all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
    await writeAll(all);
    return true;
  },

  async remove(bookingId: string, userId: string): Promise<boolean> {
    const all = await readAll();
    const item = all.find((b) => b.id === bookingId);
    if (!item || String(item.userId) !== String(userId)) return false;
    await writeAll(all.filter((b) => b.id !== bookingId));
    return true;
  },
};
