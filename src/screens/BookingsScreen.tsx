import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { shadows, typography, surfaces } from '../config/designSystem';
import { PaymentPrepareModal } from '../components/ux/PaymentFlowModals';
import { paymentUxBus } from '../services/PaymentUxBus';
import GuestModeBanner from '../components/ux/GuestModeBanner';
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
import {
  getLastPaymentTransaction,
  pollPaymentUntilFinal,
} from '../services/PaymentService';
import { presentPaymentPollOutcome } from '../utils/paymentPollOutcomes';
import { resolvePaymentStatusFromPoll } from '../utils/resolvePaymentStatusFromPoll';
import { bonusService } from '../services/BonusService';
import { authSession } from '../services/AuthSession';

export default function BookingsScreen({ navigation }: any) {
  const { user, theme } = useAppContext();
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
      presentPaymentPollOutcome({
        transactionId: last.transactionId,
        result: statusResult,
        onStatusResolved: async (result) => {
          // После ручной проверки: pending = можно оплатить снова, не «вечный processing».
          if (result.success && result.status === 'pending') {
            await bookingService.markPaymentStatus(booking.id, 'pending');
            setBookings((prev) =>
              prev.map((b) =>
                b.id === booking.id
                  ? { ...b, paymentStatus: 'pending', updatedAt: new Date().toISOString() }
                  : b,
              ),
            );
            return;
          }
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
      month: 'long',
      year: 'numeric',
    });
  };

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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('bookings.title')}</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit={true} minimumFontScale={0.8}>
            {i18n.t('bookings.title')}
          </Text>
          {bookings.length > 0 && (
            <Text style={[styles.headerSubtitle, { color: theme.secondaryText }]} numberOfLines={1}>
              {bookings.length} {i18n.t('bookings.count')}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
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
              onCreateProfile={() => navigation.navigate('Register')}
            />
          ) : null}
          {/* Бронирования из Tourvisor */}
          {bookings.length > 0 && (
            <View style={styles.bookingsSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="calendar" size={24} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('bookings.title')}</Text>
              </View>
              {bookings.map((booking) => {
                const bookingLeg = getBookingLegStatus(booking);
                const paymentLeg = getPaymentLegStatus(booking);
                const snap = booking.tourSnapshot;
                const title = snap?.hotelName || i18n.t('bookings.tour');
                const location = [snap?.regionName, snap?.subRegionName].filter(Boolean).join(', ') || '—';
                const nights = snap?.nights ?? 0;

                return (
                  <TouchableOpacity
                    key={booking.id}
                    style={[styles.bookingCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
                    activeOpacity={0.9}
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
                    <View style={styles.imageContainer}>
                      {snap?.hotelImage ? (
                        <Image
                          source={{ uri: snap.hotelImage }}
                          style={styles.bookingImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.bookingImage, styles.imagePlaceholder, { backgroundColor: theme.secondaryBackground }]}>
                          <Ionicons name="image-outline" size={32} color={theme.inactive} />
                        </View>
                      )}
                      <View style={[styles.imageGradient, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
                    </View>

                    <View style={styles.bookingInfo}>
                      <Text style={[styles.hotelName, { color: theme.text }]} numberOfLines={2}>
                        {title}
                      </Text>
                      <View style={styles.legStatusBlock}>
                        <View style={styles.legStatusLine}>
                          <Text style={[styles.legStatusKey, { color: theme.secondaryText }]}>
                            {i18n.t('bookings.legBooking')}:
                          </Text>
                          <View
                            style={[
                              styles.statusChip,
                              { backgroundColor: bookingLeg.color + '22', borderColor: bookingLeg.color + '44' },
                            ]}
                          >
                            <Ionicons name={bookingLeg.icon} size={14} color={bookingLeg.color} />
                            <Text style={[styles.statusChipText, { color: bookingLeg.color }]} numberOfLines={1}>
                              {bookingLeg.text}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.legStatusLine}>
                          <Text style={[styles.legStatusKey, { color: theme.secondaryText }]}>
                            {i18n.t('bookings.legPayment')}:
                          </Text>
                          <View
                            style={[
                              styles.statusChip,
                              { backgroundColor: paymentLeg.color + '22', borderColor: paymentLeg.color + '44' },
                            ]}
                          >
                            <Ionicons name={paymentLeg.icon} size={14} color={paymentLeg.color} />
                            <Text style={[styles.statusChipText, { color: paymentLeg.color }]} numberOfLines={1}>
                              {paymentLeg.text}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {booking.paymentStatus === 'paid' && booking.status === 'pending' ? (
                        <Text style={[styles.paidHint, { color: theme.secondaryText }]}>
                          {i18n.t('bookings.paidAwaitingConfirmation')}
                        </Text>
                      ) : null}
                      <View style={styles.locationRow}>
                        <Ionicons name="location" size={14} color={theme.secondaryText} />
                        <Text style={[styles.locationText, { color: theme.secondaryText }]}>
                          {location}
                        </Text>
                      </View>
                      <View style={styles.detailsRow}>
                        <View style={[styles.detailItem, { backgroundColor: theme.primary + '15' }]}>
                          <Ionicons name="calendar" size={14} color={theme.primary} />
                          <Text style={[styles.detailText, { color: theme.primary }]}>{formatDate(booking.startDate)}</Text>
                        </View>
                        {nights > 0 && (
                          <View style={[styles.detailItem, { backgroundColor: theme.primary + '15' }]}>
                            <Ionicons name="moon" size={14} color={theme.primary} />
                            <Text style={[styles.detailText, { color: theme.primary }]}>{nights} {i18n.t('search.nights')}</Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.priceRow, { borderTopColor: theme.border }]}>
                        <View>
                          <Text style={[styles.priceLabel, { color: theme.secondaryText }]}>{i18n.t('bookings.cost')}</Text>
                          <Text style={[styles.price, { color: theme.primary }]}>
                            {formatPrice(booking.totalPrice, booking.currency)}
                          </Text>
                        </View>
                        {snap?.operatorName && (
                          <View style={[styles.operatorBadge, { backgroundColor: theme.primary + '15' }]}>
                            <Text style={[styles.operatorText, { color: theme.primary }]}>{snap.operatorName}</Text>
                          </View>
                        )}
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
                                {i18n.t('payment.checkAgain')}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      {canShowPayBooking(booking) && (
                        <TouchableOpacity
                          style={[styles.payButton, { backgroundColor: theme.accent }]}
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

                      {/* TODO: Закомментировано до получения тестовых данных от заказчика (Никита). Вернуть после настройки API.
                      {(() => {
                        const tourDocuments = getDocumentsForDate(booking.startDate);
                        if (tourDocuments.length > 0) {
                          return (
                            <View style={[styles.documentsSection, { borderTopColor: theme.border }]}>
                              <Text style={[styles.documentsTitle, { color: theme.text }]}>{i18n.t('bookings.departureDocs')}</Text>
                              {tourDocuments.map((doc) => (
                                <TouchableOpacity
                                  key={doc.id}
                                  style={[styles.documentItem, { backgroundColor: theme.secondaryBackground }]}
                                  onPress={() => handleDocumentPress(doc, doc.bookingId)}
                                  disabled={loadingDocuments.has(doc.id)}
                                >
                                  <Ionicons
                                    name={getDocumentTypeIcon(doc.documentType)}
                                    size={20}
                                    color={theme.primary}
                                  />
                                  <View style={styles.documentInfo}>
                                    <Text style={[styles.documentName, { color: theme.text }]}>
                                      {doc.fileName || getDocumentTypeName(doc.documentType)}
                                    </Text>
                                    {doc.description && (
                                      <Text style={[styles.documentDescription, { color: theme.secondaryText }]}>{doc.description}</Text>
                                    )}
                                  </View>
                                  {loadingDocuments.has(doc.id) ? (
                                    <ActivityIndicator size="small" color={theme.primary} />
                                  ) : (
                                    <Ionicons name="download-outline" size={20} color={theme.primary} />
                                  )}
                                </TouchableOpacity>
                              ))}
                            </View>
                          );
                        }
                        return null;
                      })()}
                      */}
                    </View>
                  </TouchableOpacity>
                );
              })}
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
                onPress={() => navigation.navigate('Home')}
              >
                <View style={[styles.emptyButtonGradient, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.emptyButtonText, { color: theme.surface }]}>
                    {i18n.t('bookings.findTours')}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

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
    paddingBottom: 112,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
  },
  backButton: {
    marginRight: 12,
    flexShrink: 0,
  },
  headerTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: typography.h1,
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
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
    ...shadows.cardRaised,
  },
  imageContainer: {
    height: 180,
    position: 'relative',
  },
  bookingImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bookingInfo: {
    padding: 14,
  },
  hotelName: {
    ...typography.h3,
    marginBottom: 8,
  },
  legStatusBlock: {
    marginBottom: 10,
    gap: 4,
  },
  paidHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  legStatusLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  legStatusKey: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 88,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: '78%',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  locationText: {
    fontSize: 13,
    marginLeft: 5,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  priceLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  price: typography.h2,
  operatorBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  operatorText: {
    fontSize: 12,
    fontWeight: '600',
  },
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
  documentsSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  documentsTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  documentInfo: {
    flex: 1,
    marginLeft: 10,
  },
  documentName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  documentDescription: {
    fontSize: 12,
  },
  documentsSectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  bookingsSection: {
    marginTop: 8,
  },
  bookingDocumentsCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  bookingDocumentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  bookingDocumentsInfo: {
    flex: 1,
    marginRight: 10,
  },
  bookingDocumentsTourName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  bookingDocumentsMeta: {
    gap: 6,
  },
  bookingDocumentsMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bookingDocumentsMetaText: {
    fontSize: 13,
  },
  upcomingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  upcomingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066CC',
  },
  documentsList: {
    gap: 6,
  },
});
