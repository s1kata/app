import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { sotaCrmService } from '../services/SotaCrmService';
import { bookingService } from '../services/BookingService';
import { paymentService, openPaymentInBrowser } from '../services/PaymentService';
import { showPaymentStatusBar } from '../utils/paymentStatusBanner';
import { Booking } from '../types/index';
import { logger } from '../utils/logger';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import { registerBookingsReloadHandler } from '../utils/paymentBookingsReload';
import { shadows, typography, surfaces, BRAND, radius, spacing } from '../config/designSystem';
import { FilterChip, ScreenHeader } from '../components/ui';
import CachedImage from '../components/ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { PaymentPrepareModal } from '../components/ux/PaymentFlowModals';
import { paymentUxBus } from '../services/PaymentUxBus';
import GuestModeBanner from '../components/ux/GuestModeBanner';
import { navigateRoot, navigateTab, safeGoBack } from '../utils/navHelpers';
import { formatAdultsRu, formatChildrenRu, formatNightsRu } from '../utils/pluralRu';
import {
  getBookingLegDisplay,
  getPaymentLegDisplay,
  mapCrmLeadStatusToBookingStatus,
  statusToneColor,
  type StatusLegDisplay,
} from '../utils/bookingStatus';
import {
  canShowCheckPaymentStatus,
  canShowPayBooking,
} from '../utils/paymentRetryEligibility';
import { useTabBarMetrics } from '../utils/tabBarMetrics';
import {
  getLastPaymentTransaction,
  pollPaymentUntilFinal,
} from '../services/PaymentService';
import { presentPaymentPollOutcome } from '../utils/paymentPollOutcomes';
import { resolvePaymentStatusFromPoll } from '../utils/resolvePaymentStatusFromPoll';
import { bonusService } from '../services/BonusService';
import { authSession } from '../services/AuthSession';

export default function BookingsScreen({ navigation }: any) {
  const { user, theme, fontScale } = useAppContext();
  const insets = useSafeAreaInsets();
  const { contentBottomPadding } = useTabBarMetrics(insets, fontScale);
  const bottomPad = contentBottomPadding({ includeFab: false });
  const [bookings, setBookings] = useState<Booking[]>([]);
  /* TODO: Закомментировано до получения тестовых данных от заказчика (Никита). Вернуть после настройки API.
  const [departureDocuments, setDepartureDocuments] = useState<DepartureDocument[]>([]);
  const [documentsByDate, setDocumentsByDate] = useState<Map<string, DepartureDocument[]>>(new Map());
  const [crmBookingsWithDocuments, setCrmBookingsWithDocuments] = useState<Array<{ booking: SotaBooking; documents: DepartureDocument[] }>>([]);
  const [loadingDocuments, setLoadingDocuments] = useState<Set<string>>(new Set());
  */
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [paymentPrepare, setPaymentPrepare] = useState<{
    booking: Booking;
    paymentUrl: string;
  } | null>(null);
  const bookingsRef = useRef<Booking[]>([]);
  const crmPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crmSyncInFlightRef = useRef(false);

  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const mapCrmStatusToBookingStatus = mapCrmLeadStatusToBookingStatus;

  const syncCrmStatusesForVisibleBookings = useCallback(async (source: Booking[]) => {
    if (!source.length || crmSyncInFlightRef.current) return;

    const candidates = source.filter(
      (b) =>
        b.status !== 'cancelled' &&
        (b.status === 'pending' || b.status === 'confirmed') &&
        Boolean((b as any).sotaBookingId || (b as any).crmBookingId || (b as any).requestId)
    );
    if (!candidates.length) return;

    crmSyncInFlightRef.current = true;
    try {
      await Promise.all(
        candidates.map(async (b) => {
          try {
            const crmId = String((b as any).sotaBookingId || (b as any).crmBookingId || (b as any).requestId || '').trim();
            if (!crmId) return;

            const r = await sotaCrmService.getBookingById(crmId);
            if (!r?.success || !r.data) return;

            const crmStatusRaw =
              (r.data as any).status ||
              (r.data as any).requestStatus ||
              '';

            const nextStatus = mapCrmStatusToBookingStatus(crmStatusRaw);
            if (!nextStatus || nextStatus === b.status) return;

            const updated = await bookingService.updateBookingStatus(b.id, nextStatus);
            if (!updated) return;
          } catch (e) {
            logger.warn('[BookingsScreen] CRM status sync item failed:', e);
          }
        })
      );
    } finally {
      crmSyncInFlightRef.current = false;
    }
  }, []);

  const stopCrmPoll = useCallback(() => {
    if (crmPollRef.current) {
      clearInterval(crmPollRef.current);
      crmPollRef.current = null;
    }
  }, []);

  const startCrmPollIfNeeded = useCallback((items: Booking[]) => {
    const hasLive = items.some(
      (b) =>
        (b.status === 'pending' || b.status === 'confirmed') &&
        Boolean((b as any).sotaBookingId || (b as any).crmBookingId || (b as any).requestId)
    );

    if (!hasLive) {
      stopCrmPoll();
      return;
    }

    if (crmPollRef.current) return;

    crmPollRef.current = setInterval(async () => {
      try {
        const current = bookingsRef.current || [];
        await syncCrmStatusesForVisibleBookings(current);

        if (user?.uid && !isGuest) {
          const latest = await bookingService.getUserBookings(user.uid);
          const own = latest.filter((b) => b.userId === user.uid);
          setBookings(own);
          bookingsRef.current = own;
          startCrmPollIfNeeded(own);
        }
      } catch (e) {
        logger.warn('[BookingsScreen] CRM poll failed:', e);
      }
    }, 30000);
  }, [stopCrmPoll, syncCrmStatusesForVisibleBookings, user?.uid, isGuest]);

  /* TODO: Закомментировано до получения тестовых данных от заказчика (Никита). Вернуть после настройки API.
  const loadDepartureDocuments = useCallback(async () => {
    try {
      if (!user?.email) {
        return;
      }

      if (!sotaCrmService.hasCredentials()) {
        logger.debug('[BookingsScreen] SOTA credentials not configured');
        return;
      }

      const userPhone = (user as any).phoneNumber || (user as any).phone || undefined;
      const response = await sotaCrmService.getUserDepartureDocuments(
        user.email || undefined,
        userPhone
      );

      if (response.success && response.data) {
        setCrmBookingsWithDocuments(response.data);
        const allDocuments: DepartureDocument[] = [];
        const docsByDate = new Map<string, DepartureDocument[]>();
        response.data.forEach(
          ({ booking, documents }: { booking: SotaBooking; documents: DepartureDocument[] }) => {
          documents.forEach((doc: DepartureDocument) => {
            allDocuments.push(doc);
            const depRaw = booking.departureDate?.split('T')[0] || '';
            if (depRaw) {
              if (!docsByDate.has(depRaw)) docsByDate.set(depRaw, []);
              docsByDate.get(depRaw)!.push(doc);
            }
          });
        });
        setDepartureDocuments(allDocuments);
        setDocumentsByDate(docsByDate);
        logger.debug(`[BookingsScreen] Loaded ${allDocuments.length} departure documents from SOTA`);
      } else {
        const msg = String(response.error || '');
        const is404 = /\b404\b|HTTP\s*404|Not Found/i.test(msg);
        if (is404) {
          logger.debug('[BookingsScreen] Departure documents endpoint unavailable (404), skipping');
        } else {
          logger.warn('[BookingsScreen] Failed to load departure documents:', response.error);
        }
      }
    } catch (error: any) {
      logger.error('[BookingsScreen] Error loading departure documents:', error);
    }
  }, [user]);
  */

  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);

      if (!isGuest && user?.uid) {
        const userBookings = await bookingService.getUserBookings(user.uid);
        const ownBookings = userBookings.filter(b => b.userId === user.uid);
        setBookings(ownBookings);
        bookingsRef.current = ownBookings;

        await syncCrmStatusesForVisibleBookings(ownBookings);

        const afterSync = await bookingService.getUserBookings(user.uid);
        const ownAfterSync = afterSync.filter((b) => b.userId === user.uid);
        setBookings(ownAfterSync);
        bookingsRef.current = ownAfterSync;
        startCrmPollIfNeeded(ownAfterSync);

        for (const b of ownBookings) {
          if (b.paymentStatus === 'paid') {
            await bookingService.maybeAwardLoyaltyAfterPaidBooking(user.uid, b.id);
          }
        }
        /* TODO: документы на вылет — см. loadDepartureDocuments выше
        if (user?.email) {
          await loadDepartureDocuments();
        }
        */
      } else {
        stopCrmPoll();
        setBookings([]);
      }
    } catch (error: any) {
      logger.error('[BookingsScreen] Error loading bookings:', error);
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    isGuest,
    user?.uid,
    startCrmPollIfNeeded,
    stopCrmPoll,
    syncCrmStatusesForVisibleBookings,
  ]);

  const loadBookingsRef = useRef(loadBookings);
  loadBookingsRef.current = loadBookings;

  useEffect(() => {
    registerBookingsReloadHandler(loadBookings);
    return () => registerBookingsReloadHandler(null);
  }, [loadBookings]);

  useEffect(() => {
    return () => stopCrmPoll();
  }, [stopCrmPoll]);

  useFocusEffect(
    useCallback(() => {
      void loadBookingsRef.current();
    }, [])
  );

  /* TODO: Закомментировано до получения тестовых данных от заказчика (Никита). Вернуть после настройки API.
  const getDocumentsForDate = (dateStr: string): DepartureDocument[] => {
    if (!dateStr) return [];
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return [];
    const dateKey = date.toISOString().split('T')[0];
    return documentsByDate.get(dateKey) || [];
  };

  const handleDocumentPress = async (document: DepartureDocument, bookingId: string) => {
    try {
      setLoadingDocuments(prev => new Set(prev).add(document.id));
      if (document.fileUrl) {
        const canOpen = await Linking.canOpenURL(document.fileUrl);
        if (canOpen) {
          await Linking.openURL(document.fileUrl);
        } else {
          const downloadResponse = await sotaCrmService.downloadDocument(document.id, bookingId);
          if (downloadResponse.success && downloadResponse.data) {
            Alert.alert(i18n.t('bookings.docOther'), i18n.t('bookings.docLoaded'));
          } else {
            Alert.alert(i18n.t('common.error'), downloadResponse.error || i18n.t('bookings.docError'));
          }
        }
      } else {
        Alert.alert(i18n.t('common.error'), i18n.t('bookings.docNoUrl'));
      }
    } catch (error: any) {
      logger.error('[BookingsScreen] Error opening document:', error);
      Alert.alert(i18n.t('common.error'), i18n.t('bookings.docError'));
    } finally {
      setLoadingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(document.id);
        return newSet;
      });
    }
  };

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case 'voucher':
        return 'document-text';
      case 'ticket':
        return 'airplane';
      case 'insurance':
        return 'shield-checkmark';
      case 'visa':
        return 'card';
      default:
        return 'document';
    }
  };

  const getDocumentTypeName = (type: string) => {
    switch (type) {
      case 'voucher': return i18n.t('bookings.docVoucher');
      case 'ticket': return i18n.t('bookings.docTicket');
      case 'insurance': return i18n.t('bookings.docInsurance');
      case 'visa': return i18n.t('bookings.docVisa');
      default: return i18n.t('bookings.docOther');
    }
  };
  */

  const onRefresh = () => {
    setRefreshing(true);
    loadBookings();
  };

  const openTourFromBooking = (booking: Booking) => {
    if (booking.type === 'tour' && booking.tourId) {
      navigateTab(navigation, 'Search', 'ApiTourDetails', {
        tourId: String(booking.tourId),
        currency: booking.currency || booking.tourSnapshot?.currency,
      });
      return;
    }
    const url = booking.tourSnapshot?.tourPackageUrl;
    if (url) {
      void Linking.openURL(url);
      return;
    }
    Alert.alert(i18n.t('common.error'), 'Ссылка на тур недоступна');
  };

  const handleCancelBooking = (booking: Booking) => {
    Alert.alert(
      i18n.t('bookings.cancel'),
      `Отменить заявку «${booking.tourSnapshot?.hotelName || i18n.t('bookings.tour')}»?`,
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('bookings.cancel'),
          style: 'destructive',
          onPress: async () => {
            const result = await bookingService.cancelBooking(booking.id);
            if (result.success) {
              setBookings((prev) =>
                prev.map((b) =>
                  b.id === booking.id
                    ? { ...b, status: 'cancelled' as const, paymentStatus: 'cancelled' as const }
                    : b,
                ),
              );
            } else {
              Alert.alert(i18n.t('common.error'), result.error || i18n.t('common.error'));
            }
          },
        },
      ],
    );
  };

  const handleCancelPayment = (booking: Booking) => {
    Alert.alert(
      'Отменить оплату',
      'Если оплата уже прошла в банке, статус обновится автоматически.',
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: 'Отменить',
          style: 'destructive',
          onPress: async () => {
            await bookingService.markPaymentStatus(booking.id, 'cancelled');
            setBookings((prev) =>
              prev.map((b) =>
                b.id === booking.id ? { ...b, paymentStatus: 'cancelled' as const } : b,
              ),
            );
          },
        },
      ],
    );
  };

  const handlePayBooking = async (booking: Booking) => {
    if (!canShowPayBooking(booking)) return;
    if (payingBookingId) return;
    const title = booking.tourSnapshot?.hotelName || i18n.t('bookings.tour');
    setPayingBookingId(booking.id);
    logIosTestStep(IosTestStep.PAYMENT, { bookingId: booking.id, amount: booking.totalPrice });
    try {
      const paymentResult = await paymentService.createPayment('tbank', {
        bookingId: booking.id,
        amount: booking.totalPrice ?? 0,
        currency: booking.currency || 'RUB',
        description: `${booking.type === 'tour' ? i18n.t('payment.tourTitle') : i18n.t('payment.hotelTitle')}: ${title}`,
        returnUrl: `travelhub://payment/success?bookingId=${booking.id}`,
      });
      if (!paymentResult.success || !paymentResult.paymentUrl || !paymentResult.transactionId) {
        showPaymentStatusBar(paymentResult.error || i18n.t('payment.loadError'), 'error');
        Alert.alert(i18n.t('common.error'), paymentResult.error || i18n.t('payment.loadError'));
        setPayingBookingId(null);
        return;
      }
      setPayingBookingId(null);
      setPaymentPrepare({
        booking,
        paymentUrl: paymentResult.paymentUrl,
      });
    } catch (error: any) {
      logger.error('[BookingsScreen] Pay booking error:', error);
      showPaymentStatusBar(error?.message || i18n.t('payment.loadError'), 'error');
      Alert.alert(i18n.t('common.error'), error?.message || i18n.t('payment.loadError'));
      setPayingBookingId(null);
    }
  };

  const runPaymentFromPrepare = async () => {
    if (!paymentPrepare) return;
    const { booking, paymentUrl } = paymentPrepare;
    setPaymentPrepare(null);
    setPayingBookingId(booking.id);
    try {
      await bookingService.markPaymentStatus(booking.id, 'payment_processing');
      setBookings((prev) =>
        prev.map((b) =>
          b.id === booking.id
            ? {
                ...b,
                paymentStatus: 'payment_processing',
                updatedAt: new Date().toISOString(),
              }
            : b,
        ),
      );
      await openPaymentInBrowser(paymentUrl);
    } catch (error) {
      logger.warn('[BookingsScreen] Failed to open payment page:', error);
      await bookingService.markPaymentStatus(booking.id, 'pending').catch(() => {});
      setBookings((prev) =>
        prev.map((b) =>
          b.id === booking.id
            ? { ...b, paymentStatus: 'pending', updatedAt: new Date().toISOString() }
            : b,
        ),
      );
      paymentUxBus.showPaymentRecovery(() => navigation.navigate('MainTabs', { screen: 'Bookings' }));
    } finally {
      setPayingBookingId(null);
    }
  };

  const applyPollResultToBooking = async (bookingId: string, result: Parameters<typeof resolvePaymentStatusFromPoll>[0]) => {
    const paymentStatus = resolvePaymentStatusFromPoll(result);
    if (!paymentStatus) return;
    const extra: { paidAt?: string } = {};
    if (paymentStatus === 'paid') {
      extra.paidAt = result.paidAt || new Date().toISOString();
    }
    await bookingService.markPaymentStatus(bookingId, paymentStatus, extra);
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              paymentStatus,
              updatedAt: new Date().toISOString(),
              ...(extra.paidAt ? { paidAt: extra.paidAt } : {}),
            }
          : b,
      ),
    );
  };

  const handleCheckPaymentStatus = async (booking: Booking) => {
    if (payingBookingId) return;
    setPayingBookingId(booking.id);
    try {
      const last = await getLastPaymentTransaction();
      if (!last?.transactionId || String(last.orderId) !== String(booking.id)) {
        await bookingService.markPaymentStatus(booking.id, 'pending');
        setBookings((prev) =>
          prev.map((b) =>
            b.id === booking.id
              ? { ...b, paymentStatus: 'pending', updatedAt: new Date().toISOString() }
              : b,
          ),
        );
        Alert.alert(i18n.t('payment.pendingTitle'), i18n.t('payment.retryAvailable'));
        return;
      }
      const statusResult = await pollPaymentUntilFinal(last.transactionId, {
        intervalMs: 3000,
        maxWaitMs: 45000,
      });
      const stored = await authSession.getStoredUser();
      const uid = stored?.id;
      // Пока банк не прислал failed/cancelled/success — остаёмся в payment_processing.
      // «Оплатить» не показываем только из‑за таймаута опроса.
      presentPaymentPollOutcome({
        transactionId: last.transactionId,
        result: statusResult,
        onStatusResolved: async (result) => {
          await applyPollResultToBooking(booking.id, result);
        },
        onReload: async () => {
          loadBookings();
        },
        onBeforeSuccessAlert: async () => {
          if (uid) {
            await bookingService.maybeAwardLoyaltyAfterPaidBooking(uid, booking.id);
            const userStored = await authSession.getStoredUser();
            await bonusService.redeemAfterSuccessfulPayment(
              booking.id,
              userStored?.email,
              userStored?.phone,
            );
          }
        },
        // OK — остановить цикл проверки; повтор только по кнопке на карточке или «Проверить снова».
        onPendingOk: () => undefined,
        alertSuccess: () => {
          paymentUxBus.showPaymentSuccess(() => undefined);
        },
        alertFailed: () => {
          Alert.alert(i18n.t('common.error'), i18n.t('payment.failedRetryMessage'));
        },
        alertFallbackError: () => {
          Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'));
        },
        alertNetworkError: (message) => {
          Alert.alert(i18n.t('common.error'), message);
        },
      });
    } catch (e) {
      logger.warn('[BookingsScreen] check payment status:', e);
      Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'));
    } finally {
      setPayingBookingId(null);
    }
  };

  const formatPrice = (price: number, currency?: string) => {
    const code = (currency || 'RUB').toUpperCase();
    const symbol = code === 'USD' ? '$' : code === 'EUR' ? '€' : '₽';
    return `${price.toLocaleString('ru-RU')} ${symbol}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr || typeof dateStr !== 'string') return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateRange = (start?: string, end?: string) => {
    if (!start) return '—';
    if (!end) return formatDate(start);
    return `${formatDate(start)} – ${formatDate(end)}`;
  };

  const filteredBookings =
    statusFilter === 'all'
      ? bookings
      : bookings.filter((b) => b.status === statusFilter);

  type StatusChip = {
    text: string;
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
  };

  const toStatusChip = (display: StatusLegDisplay): StatusChip => ({
    text: i18n.t(display.i18nKey),
    color: statusToneColor(display.tone, theme),
    icon: display.icon,
  });

  /** Статус заявки (CRM / бронь), без смешивания с оплатой */
  const getBookingLegStatus = (booking: Booking): StatusChip =>
    toStatusChip(getBookingLegDisplay(booking.status));

  /** Статус оплаты отдельной строкой */
  const getPaymentLegStatus = (booking: Booking): StatusChip =>
    toStatusChip(getPaymentLegDisplay(booking.paymentStatus));

  if (loading && bookings.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <ScreenHeader
          title={i18n.t('bookings.title')}
          onBack={navigation.canGoBack?.() ? () => safeGoBack(navigation) : undefined}
          noSafeTop
        />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScreenHeader
        title={i18n.t('bookings.title')}
        subtitle={bookings.length > 0 ? `${bookings.length} ${i18n.t('bookings.count')}` : undefined}
        onBack={navigation.canGoBack?.() ? () => safeGoBack(navigation) : undefined}
        noSafeTop
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.bookingsContainer}>
          {isGuest ? (
            <GuestModeBanner
              large
              title={i18n.t('bookings.guestBannerTitle')}
              message={i18n.t('bookings.guestBannerBody')}
              onCreateProfile={() => navigateRoot(navigation, 'Register')}
            />
          ) : null}

          {!isGuest && bookings.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(
                [
                  { id: 'all' as const, label: i18n.t('bookings.filterAll') },
                  { id: 'pending' as const, label: i18n.t('bookings.filterInProgress') },
                  { id: 'confirmed' as const, label: i18n.t('bookings.filterConfirmed') },
                ] as const
              ).map((chip) => (
                <FilterChip
                  key={chip.id}
                  label={chip.label}
                  active={statusFilter === chip.id}
                  onPress={() => setStatusFilter(chip.id)}
                  style={
                    statusFilter === chip.id
                      ? { backgroundColor: theme.deep === '#12122E' ? BRAND.navy : theme.primary, borderColor: 'transparent' }
                      : undefined
                  }
                />
              ))}
            </ScrollView>
          ) : null}

          {filteredBookings.length > 0 && (
            <View style={styles.bookingsSection}>
              {filteredBookings.map((booking) => {
                const bookingLeg = getBookingLegStatus(booking);
                const paymentLeg = getPaymentLegStatus(booking);
                const snap = booking.tourSnapshot;
                const title = snap?.hotelName || i18n.t('bookings.tour');
                const location = [snap?.regionName, snap?.subRegionName].filter(Boolean).join(', ') || '—';
                const nights = snap?.nights ?? booking.nights ?? 0;
                const guests = booking.party?.adults || booking.participants;
                const childrenCount = booking.party?.childrenAges?.length || 0;

                return (
                  <TouchableOpacity
                    key={booking.id}
                    style={[styles.bookingCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}
                    activeOpacity={0.9}
                    onPress={() => openTourFromBooking(booking)}
                    onLongPress={() => {
                      Alert.alert(
                        i18n.t('bookings.deleteConfirm'),
                        `«${title}». ${i18n.t('bookings.deleteConfirmDesc')}`,
                        [
                          { text: i18n.t('common.cancel'), style: 'cancel' },
                          {
                            text: i18n.t('bookings.delete'),
                            style: 'destructive',
                            onPress: async () => {
                              if (!user?.uid) return;
                              const result = await bookingService.deleteBooking(booking.id, user.uid);
                              if (result.success) {
                                setBookings(prev => prev.filter(b => b.id !== booking.id));
                              } else {
                                Alert.alert(i18n.t('common.error'), result.error);
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <View style={styles.cardRow}>
                      <View style={styles.thumbWrap}>
                        {snap?.hotelImage ? (
                          <CachedImage
                            source={{ uri: snap.hotelImage }}
                            style={styles.thumb}
                            contentFit="cover"
                            fallbackUri={DEFAULT_HOTEL_IMAGE}
                          />
                        ) : (
                          <View style={[styles.thumb, styles.imagePlaceholder, { backgroundColor: theme.secondaryBackground }]}>
                            <Ionicons name="image-outline" size={28} color={theme.inactive} />
                          </View>
                        )}
                      </View>

                      <View style={styles.cardBody}>
                        <View style={styles.cardTop}>
                          <Text style={[styles.hotelName, { color: theme.deep || theme.text }]} numberOfLines={2}>
                            {title}
                          </Text>
                          <View
                            style={[
                              styles.statusChip,
                              { backgroundColor: bookingLeg.color + '22', borderColor: bookingLeg.color + '44' },
                            ]}
                          >
                            <Text style={[styles.statusChipText, { color: bookingLeg.color }]} numberOfLines={1}>
                              {bookingLeg.text}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.metaLine}>
                          <Ionicons name="location-outline" size={14} color={theme.secondaryText} />
                          <Text style={[styles.metaText, { color: theme.secondaryText }]} numberOfLines={1}>
                            {location}
                          </Text>
                        </View>
                        <View style={styles.metaLine}>
                          <Ionicons name="calendar-outline" size={14} color={theme.secondaryText} />
                          <Text style={[styles.metaText, { color: theme.secondaryText }]} numberOfLines={1}>
                            {formatDateRange(booking.startDate, booking.endDate)}
                            {nights > 0 ? ` · ${formatNightsRu(nights)}` : ''}
                          </Text>
                        </View>
                        {(guests || childrenCount) ? (
                          <Text style={[styles.guestsText, { color: theme.tertiaryText }]} numberOfLines={1}>
                            {[
                              guests ? formatAdultsRu(guests) : null,
                              childrenCount ? formatChildrenRu(childrenCount) : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        ) : null}

                        <View style={styles.paymentLegRow}>
                          <Text style={[styles.legStatusKey, { color: theme.secondaryText }]}>
                            {i18n.t('bookings.legPayment')}:
                          </Text>
                          <View
                            style={[
                              styles.statusChip,
                              { backgroundColor: paymentLeg.color + '22', borderColor: paymentLeg.color + '44' },
                            ]}
                          >
                            <Ionicons name={paymentLeg.icon} size={13} color={paymentLeg.color} />
                            <Text style={[styles.statusChipText, { color: paymentLeg.color }]} numberOfLines={1}>
                              {paymentLeg.text}
                            </Text>
                          </View>
                        </View>

                        {booking.paymentStatus === 'paid' && booking.status === 'pending' ? (
                          <Text style={[styles.paidHint, { color: theme.secondaryText }]}>
                            {i18n.t('bookings.paidAwaitingConfirmation')}
                          </Text>
                        ) : null}

                        <View style={styles.priceRow}>
                          <View>
                            <Text style={[styles.priceLabel, { color: theme.secondaryText }]}>
                              {i18n.t('bookings.sum')}
                            </Text>
                            <Text style={[styles.price, { color: theme.deep || theme.text }]}>
                              {formatPrice(booking.totalPrice, booking.currency)}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={theme.tertiaryText} />
                        </View>

                        {canShowCheckPaymentStatus(booking) && (
                          <TouchableOpacity
                            style={[styles.payButton, styles.checkButton, { borderColor: theme.accent }]}
                            onPress={() => handleCheckPaymentStatus(booking)}
                            disabled={!!payingBookingId}
                            activeOpacity={0.8}
                          >
                            {payingBookingId === booking.id ? (
                              <ActivityIndicator size="small" color={theme.accent} />
                            ) : (
                              <>
                                <Ionicons name="refresh-outline" size={20} color={theme.accent} />
                                <Text style={[styles.payButtonText, { color: theme.accent }]}>
                                  {i18n.t('payment.checkStatus')}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}

                        {canShowPayBooking(booking) && (
                          <TouchableOpacity
                            style={[styles.payButton, { backgroundColor: BRAND.orange }]}
                            onPress={() => handlePayBooking(booking)}
                            disabled={!!payingBookingId}
                            activeOpacity={0.8}
                          >
                            {payingBookingId === booking.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="card-outline" size={20} color="#fff" />
                                <Text style={styles.payButtonText}>{i18n.t('bookings.pay')}</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}

                        {booking.paymentStatus === 'payment_processing' ? (
                          <TouchableOpacity
                            style={[styles.payButton, styles.checkButton, { borderColor: theme.error }]}
                            onPress={() => handleCancelPayment(booking)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="close-circle-outline" size={20} color={theme.error} />
                            <Text style={[styles.payButtonText, { color: theme.error }]}>
                              Отменить оплату
                            </Text>
                          </TouchableOpacity>
                        ) : null}

                        {booking.status !== 'cancelled' &&
                        booking.paymentStatus === 'pending' ? (
                          <TouchableOpacity
                            style={[styles.payButton, styles.checkButton, { borderColor: theme.secondaryText }]}
                            onPress={() => handleCancelBooking(booking)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={18} color={theme.secondaryText} />
                            <Text style={[styles.payButtonText, { color: theme.secondaryText }]}>
                              {i18n.t('bookings.cancel')}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[styles.supportBanner, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '33' }]}
                onPress={() => navigateTab(navigation, 'Profile', 'HelperChat')}
                activeOpacity={0.85}
              >
                <View style={[styles.supportIcon, { backgroundColor: theme.primary }]}>
                  <Ionicons name="notifications-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.supportTitle, { color: theme.deep || theme.text }]}>
                    {i18n.t('bookings.supportTitle')}
                  </Text>
                  <Text style={[styles.supportBody, { color: theme.secondaryText }]}>
                    {i18n.t('bookings.supportBody')}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {bookings.length === 0 && !loading && !isGuest && (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconContainer, { backgroundColor: theme.secondaryBackground }]}>
                <Ionicons name="calendar-outline" size={64} color={theme.inactive} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {i18n.t('bookings.noBookings')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
                {i18n.t('bookings.emptyDesc')}
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigateTab(navigation, 'Search')}
              >
                <View style={[styles.emptyButtonGradient, { backgroundColor: BRAND.orange }]}>
                  <Text style={[styles.emptyButtonText, { color: theme.surface }]}>
                    {i18n.t('bookings.findTours')}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {!isGuest && bookings.length > 0 && filteredBookings.length === 0 ? (
            <View style={styles.emptyFilter}>
              <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
                Нет заявок в этом статусе
              </Text>
            </View>
          ) : null}

        </View>
      </ScrollView>
      <PaymentPrepareModal
        visible={!!paymentPrepare}
        onCancel={() => setPaymentPrepare(null)}
        onContinue={() => void runPaymentFromPrepare()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRow: {
    paddingBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 48,
  },
  emptyFilter: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  emptyButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bookingsContainer: {
    padding: 16,
    gap: 12,
  },
  bookingCard: {
    borderRadius: surfaces.cardRadius,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: spacing.sm,
    ...shadows.cardRaised,
  },
  cardRow: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  thumbWrap: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumb: {
    width: 92,
    height: 92,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  hotelName: {
    ...typography.bodyBold,
    flex: 1,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 13,
    flex: 1,
  },
  guestsText: {
    fontSize: 12,
    marginBottom: 6,
  },
  paymentLegRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  paidHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  legStatusKey: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: '70%',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  priceLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  price: typography.h3,
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    ...shadows.buttonCta,
  },
  checkButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  payButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  supportBanner: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  supportIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportTitle: {
    ...typography.captionBold,
    marginBottom: 2,
  },
  supportBody: {
    ...typography.small,
    lineHeight: 18,
  },
  bookingsSection: {
    marginTop: 4,
  },
});

