import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { bookingService } from '../services/BookingService';
import { mapLocalBookingToSota } from '../services/sync/bookingMapper';
import { SotaBooking } from '../types';
import { PrimaryButton, ScreenHeader } from '../components/ui';
import { radius, shadows, spacing, typography } from '../config/designSystem';

function formatDate(s: string): string {
  if (!s) return '—';
  const d = s.split('T')[0];
  const date = new Date(d);
  if (isNaN(date.getTime())) return s;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PurchaseHistoryScreen({ navigation }: any) {
  const { user, theme } = useAppContext();
  const [bookings, setBookings] = useState<SotaBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  const load = useCallback(async () => {
    if (isGuest || !user?.uid) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const merged = await bookingService.getUserBookings(user.uid);
      const mapped = merged.map(mapLocalBookingToSota);
      setBookings(mapped);
      if (mapped.length === 0) {
        setError(null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || i18n.t('purchaseHistory.unavailable'));
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isGuest, user?.uid]);

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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
        <ScreenHeader title={i18n.t('purchaseHistory.title')} onBack={() => navigation.goBack()} />
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScreenHeader title={i18n.t('purchaseHistory.title')} onBack={() => navigation.goBack()} />
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
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: theme.primary + '18',
                      borderColor: theme.primary + '33',
                    },
                  ]}
                >
                  <Text style={[styles.statusPillText, { color: theme.primary }]}>{b.status || '—'}</Text>
                </View>
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
  scroll: { flexGrow: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  loadingText: { ...typography.caption },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  errorText: { flex: 1, ...typography.caption },
  empty: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  emptyTitle: { ...typography.h3 },
  emptyDesc: { ...typography.caption, textAlign: 'center' },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.xs },
  tourName: { flex: 1, ...typography.bodyBold },
  price: { ...typography.bodyBold },
  meta: { marginTop: spacing.xs, gap: spacing.xs },
  metaText: { ...typography.small },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    borderWidth: 1,
    marginTop: spacing.xxs,
  },
  statusPillText: { ...typography.smallBold },
  bookingNumber: { ...typography.small, marginTop: spacing.xxs },
  repeatBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  repeatBtnText: { ...typography.buttonSmall, letterSpacing: 0.2 },
});
