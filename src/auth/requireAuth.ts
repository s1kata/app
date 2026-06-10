import type { AppUser } from '../types/auth';
import { authSession } from '../services/AuthSession';
import { getValidAccessToken } from '../services/AuthApiClient';

export type BookingAuthUser = Pick<AppUser, 'uid' | 'isAnonymous'> | null | undefined;

/** Гость — бронирование и оплата запрещены. */
export function isBookingGuest(user: BookingAuthUser): boolean {
  if (!user?.uid) return true;
  return user.uid.startsWith('guest_') || user.isAnonymous === true;
}

/**
 * Бронь и оплата завязаны на JWT-сессию (Bearer для /api/create-payment).
 */
export async function requireAuthForBooking(
  user: BookingAuthUser,
): Promise<
  { ok: true; uid: string } | { ok: false; reason: 'guest' | 'signed_out' | 'auth_desync' }
> {
  const token = await getValidAccessToken();
  const stored = await authSession.getStoredUser();
  const liveUid = stored?.id;

  if (!token || !liveUid) {
    return { ok: false, reason: 'signed_out' };
  }
  if (user?.uid && user.uid !== liveUid) {
    return { ok: false, reason: 'auth_desync' };
  }
  const effective: BookingAuthUser = user ?? { uid: liveUid, isAnonymous: false };
  if (isBookingGuest(effective)) {
    return { ok: false, reason: 'guest' };
  }
  return { ok: true, uid: liveUid };
}
