import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@travelhub/bonus_redemption_';
const DEDUCTED_PREFIX = '@travelhub/bonus_deducted_';

export interface PendingBonusRedemption {
  bookingId: string;
  bonusesToSpend: number;
  discountRub: number;
  tourPrice: number;
  bcId: number;
  createdAt: number;
}

export async function savePendingBonusRedemption(data: PendingBonusRedemption): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${data.bookingId}`, JSON.stringify(data));
}

export async function getPendingBonusRedemption(
  bookingId: string,
): Promise<PendingBonusRedemption | null> {
  const raw = await AsyncStorage.getItem(`${PREFIX}${bookingId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingBonusRedemption;
  } catch {
    return null;
  }
}

export async function clearPendingBonusRedemption(bookingId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PREFIX}${bookingId}`);
}

export async function isBonusDeductedForBooking(bookingId: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(`${DEDUCTED_PREFIX}${bookingId}`);
  return v === '1';
}

export async function markBonusDeductedForBooking(bookingId: string): Promise<void> {
  await AsyncStorage.setItem(`${DEDUCTED_PREFIX}${bookingId}`, '1');
}
