import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { sotaCrmService } from '../services/SotaCrmService';
import { bookingService } from '../services/BookingService';
import { Booking, SotaBooking } from '../types';
import { PrimaryButton } from '../components/ui';

function formatDate(s: string): string {
  if (!s) return '—';
  const d = s.split('T')[0];
  const date = new Date(d);
  if (isNaN(date.getTime())) return s;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mapLocalBookingToSota(b: Booking): SotaBooking {
  const snap = b.tourSnapshot;
  const tourName = snap?.hotelName
    || [snap?.countryName, snap?.regionName].filter(Boolean).join(', ')
    || '—';
  const statusLabel =
    b.paymentStatus === 'paid'
      ? 'Оплачено'
      : b.paymentStatus === 'pending' || b.paymentStatus === 'payment_processing'
        ? 'Ожидает оплаты'
        : b.status;

  return {
    id: b.id,
    bookingNumber: b.sotaBookingId || b.idempotencyKey || b.id,
    clientName: b.contactInfo?.name || '—',
    clientPhone: b.contactInfo?.phone || '',
    clientEmail: b.contactInfo?.email || '',
    tourName,
    departureDate: b.startDate,
    returnDate: b.endDate,
    participants: b.participants,
    status: statusLabel,
    totalPrice: b.totalPrice,
    currency: b.currency || snap?.currency || 'RUB',
    documents: b.departureDocuments || [],
    createdAt: b.createdAt,
    updatedAt: b.updatedAt || b.createdAt,
  };
}

export default function PurchaseHistoryScreen({ navigation }: any) {
  const { user, theme } = useAppContext();
  const [bookings, setBookings] = useState<SotaBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const email = (user as any)?.email || undefined;
  const phone = (user as any)?.phoneNumber || (user as any)?.phone || undefined;

  const load = useCallback(async () => {
    if (isGuest || (!email && !phone && !user?.uid)) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await sotaCrmService.getBookings({
        clientEmail: email,
        clientPhone: phone,
      });
      if (res.success && res.data && res.data.length > 0) {
        setBookings(res.data);
        return;
      }

      const crmUnavailable =
        !res.success &&
        (res.error?.toLowerCase().includes('404') ||
          res.error?.toLowerCase().includes('not found') ||
          res.error?.toLowerCase().includes('недоступна') ||
          res.error?.toLowerCase().includes('unauthorized'));

      if (user?.uid) {
        const local = await bookingService.getUserBookings(user.uid);
        const mapped = local.map(mapLocalBookingToSota);
        if (mapped.length > 0) {
          setBookings(mapped);
          if (crmUnavailable) {
            setError(null);
          }
          return;
        }
      }

      if (res.success) {
        setBookings([]);
      } else {
        setError(res.error || i18n.t('purchaseHistory.unavailable'));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (user?.uid) {
        try {
          const local = await bookingService.getUserBookings(user.uid);
          const mapped = local.map(mapLocalBookingToSota);
          if (mapped.length > 0) {
            setBookings(mapped);
            setError(null);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      setError(
        msg.toLowerCase().includes('404') || msg.toLowerCase().includes('not found')
          ? i18n.t('purchaseHistory.unavailable')
          : msg || i18n.t('purchaseHistory.unavailable')
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isGuest, email, phone, user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleRepeatOrder = useCallback(() => {
    const tabNav = navigation.getParent?.();
    if (tabNav?.navigate) {
      tabNav.navigate('Home', { screen: 'HomeMain' });
      return;
    }
    navigation.navigate('Home', { screen: 'HomeMain' });
  }, [navigation]);

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.secondaryText }]}>
            {i18n.t('purchaseHistory.title')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={theme.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('purchaseHistory.title')}</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />
        }
      >
        {error && (
          <View style={[styles.errorBox, { backgroundColor: `${theme.error}18`, borderColor: theme.error }]}>
            <Ionicons name="warning-outline" size={20} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        )}

        {bookings.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="receipt-outline" size={48} color={theme.tertiaryText} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('purchaseHistory.empty')}</Text>
            <Text style={[styles.emptyDesc, { color: theme.secondaryText }]}>
              {i18n.t('purchaseHistory.emptyDesc')}
            </Text>
          </View>
        ) : (
          bookings.map((b) => (
            <View
              key={b.id}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <View style={styles.cardRow}>
                <Text style={[styles.tourName, { color: theme.text }]} numberOfLines={2}>
                  {b.tourName || '—'}
                </Text>
                <Text style={[styles.price, { color: theme.primary }]}>
                  {b.totalPrice != null ? `${b.totalPrice.toLocaleString('ru-RU')} ${b.currency || '₽'}` : '—'}
                </Text>
              </View>
              <View style={styles.meta}>
                <Text style={[styles.metaText, { color: theme.secondaryText }]}>
                  {formatDate(b.departureDate)} — {formatDate(b.returnDate)}
                </Text>
                <Text style={[styles.status, { color: theme.tertiaryText }]}>{b.status || '—'}</Text>
              </View>
              {b.bookingNumber ? (
                <Text style={[styles.bookingNumber, { color: theme.tertiaryText }]}>
                  № {b.bookingNumber}
                </Text>
              ) : null}
              <PrimaryButton
                title={i18n.t('purchaseHistory.repeatOrder')}
                onPress={handleRepeatOrder}
                outline
                small
                iconLeft={<Ionicons name="refresh-outline" size={16} color={theme.primary} />}
                style={styles.repeatBtn}
                textStyle={styles.repeatBtnText}
              />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  scroll: { flexGrow: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 14 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyDesc: { fontSize: 14, textAlign: 'center' },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  tourName: { flex: 1, fontSize: 16, fontWeight: '600' },
  price: { fontSize: 16, fontWeight: '700' },
  meta: { marginTop: 8 },
  metaText: { fontSize: 13 },
  status: { fontSize: 12, marginTop: 2 },
  bookingNumber: { fontSize: 12, marginTop: 4 },
  repeatBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  repeatBtnText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
});
