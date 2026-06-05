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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { sotaCrmService } from '../services/SotaCrmService';
import { bookingService } from '../services/BookingService';
import { paymentService, openPaymentInBrowser } from '../services/PaymentService';
import { presentPaymentPollOutcome } from '../utils/paymentPollOutcomes';
import { resolvePaymentAfterBrowser } from '../utils/paymentAfterBrowser';
import { showPaymentStatusBar } from '../utils/paymentStatusBanner';
import { Booking, DepartureDocument, SotaBooking } from '../types/index';
import { logger } from '../utils/logger';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import { registerBookingsReloadHandler } from '../utils/paymentBookingsReload';

export default function BookingsScreen({ navigation }: any) {
  const { user, theme } = useAppContext();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [departureDocuments, setDepartureDocuments] = useState<DepartureDocument[]>([]);
  const [documentsByDate, setDocumentsByDate] = useState<Map<string, DepartureDocument[]>>(new Map());
  const [crmBookingsWithDocuments, setCrmBookingsWithDocuments] = useState<Array<{ booking: SotaBooking; documents: DepartureDocument[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState<Set<string>>(new Set());
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  const loadDepartureDocuments = useCallback(async () => {
    try {
      if (!user?.email) {
        return;
      }

      // Проверяем, настроены ли учетные данные для SOTA
      if (!sotaCrmService.hasCredentials()) {
        logger.debug('[BookingsScreen] SOTA credentials not configured');
        return;
      }

      // Получаем телефон из user объекта (может быть в phoneNumber или в customClaims)
      const userPhone = (user as any).phoneNumber || (user as any).phone || undefined;
      
      // Получаем все документы на вылет для пользователя
      const response = await sotaCrmService.getUserDepartureDocuments(
        user.email || undefined,
        userPhone
      );

      if (response.success && response.data) {
        // Сохраняем бронирования с документами для отображения
        setCrmBookingsWithDocuments(response.data);
        
        // Собираем все документы в один массив
        const allDocuments: DepartureDocument[] = [];
        const docsByDate = new Map<string, DepartureDocument[]>();

        response.data.forEach(
          ({ booking, documents }: { booking: SotaBooking; documents: DepartureDocument[] }) => {
          documents.forEach((doc: DepartureDocument) => {
            allDocuments.push(doc);
            // Группируем документы по дате вылета бронирования
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

  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);

      if (!isGuest && user?.uid) {
        const userBookings = await bookingService.getUserBookings(user.uid);
        const ownBookings = userBookings.filter(b => b.userId === user.uid);
        setBookings(ownBookings);
        for (const b of ownBookings) {
          if (b.paymentStatus === 'paid') {
            await bookingService.maybeAwardLoyaltyAfterPaidBooking(user.uid, b.id);
          }
        }
        if (user?.email) {
          await loadDepartureDocuments();
        }
      } else {
        setBookings([]);
      }
    } catch (error: any) {
      logger.error('[BookingsScreen] Error loading bookings:', error);
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isGuest, user?.uid, user?.email, loadDepartureDocuments]);

  const loadBookingsRef = useRef(loadBookings);
  loadBookingsRef.current = loadBookings;

  useEffect(() => {
    registerBookingsReloadHandler(loadBookings);
    return () => registerBookingsReloadHandler(null);
  }, [loadBookings]);

  useFocusEffect(
    useCallback(() => {
      void loadBookingsRef.current();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ref держит актуальный loadBookings; при фокусе всегда свежий список (после браузера/оплаты)
    }, [])
  );

  // Получить документы для конкретной даты вылета
  const getDocumentsForDate = (dateStr: string): DepartureDocument[] => {
    if (!dateStr) return [];
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return [];
    const dateKey = date.toISOString().split('T')[0];
    return documentsByDate.get(dateKey) || [];
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBookings();
  };

  const handleDocumentPress = async (document: DepartureDocument, bookingId: string) => {
    try {
      setLoadingDocuments(prev => new Set(prev).add(document.id));
      
      // Пытаемся открыть документ по URL
      if (document.fileUrl) {
        const canOpen = await Linking.canOpenURL(document.fileUrl);
        if (canOpen) {
          await Linking.openURL(document.fileUrl);
        } else {
          // Если не удалось открыть напрямую, пытаемся скачать
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

  const handlePayBooking = async (booking: Booking) => {
    if (
      booking.paymentStatus === 'paid' ||
      booking.paymentStatus === 'payment_processing' ||
      booking.status === 'cancelled'
    )
      return;
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
      Alert.alert(
        i18n.t('payment.redirectTitle'),
        i18n.t('payment.redirectMessage'),
        [
          { text: i18n.t('payment.cancel'), style: 'cancel', onPress: () => setPayingBookingId(null) },
          {
            text: i18n.t('payment.openButton'),
            onPress: async () => {
              try {
                const browserResult = await openPaymentInBrowser(paymentResult.paymentUrl!);
                const statusResult = await resolvePaymentAfterBrowser(
                  paymentResult.transactionId!,
                  browserResult,
                );
                presentPaymentPollOutcome({
                  transactionId: paymentResult.transactionId!,
                  result: statusResult,
                  onReload: loadBookings,
                  alertSuccess: () =>
                    Alert.alert(i18n.t('payment.successTitle'), i18n.t('payment.successMessage'), [
                      { text: i18n.t('common.ok') },
                    ]),
                  alertFailed: () =>
                    Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'), [
                      { text: i18n.t('common.ok') },
                    ]),
                  alertFallbackError: () =>
                    Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'), [
                      { text: i18n.t('common.ok') },
                    ]),
                  alertNetworkError: (message) =>
                    Alert.alert(i18n.t('common.error'), message, [{ text: i18n.t('common.ok') }]),
                });
              } finally {
                setPayingBookingId(null);
              }
            },
          },
        ]
      );
    } catch (error: any) {
      logger.error('[BookingsScreen] Pay booking error:', error);
      showPaymentStatusBar(error?.message || i18n.t('payment.loadError'), 'error');
      Alert.alert(i18n.t('common.error'), error?.message || i18n.t('payment.loadError'));
      setPayingBookingId(null);
    }
  };

  const formatPrice = (price: number) => {
    return `${price.toLocaleString('ru-RU')} ₽`;
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

  /** Статус заявки (CRM / бронь), без смешивания с оплатой */
  const getBookingLegStatus = (booking: Booking): StatusChip => {
    if (booking.status === 'cancelled') {
      return { text: i18n.t('bookings.statusCancelled'), color: theme.error, icon: 'close-circle' };
    }
    if (booking.status === 'completed') {
      return { text: i18n.t('bookings.statusCompleted'), color: theme.success, icon: 'checkmark-done-circle' };
    }
    if (booking.status === 'confirmed') {
      return { text: i18n.t('bookings.statusConfirmed'), color: theme.success, icon: 'checkmark-circle' };
    }
    return { text: i18n.t('bookings.statusPending'), color: theme.warning, icon: 'time-outline' };
  };

  /** Статус оплаты отдельной строкой */
  const getPaymentLegStatus = (booking: Booking): StatusChip => {
    const ps = booking.paymentStatus || 'pending';
    if (ps === 'paid') {
      return { text: i18n.t('bookings.statusPaid'), color: theme.success, icon: 'checkmark-circle' };
    }
    if (ps === 'payment_processing') {
      return { text: i18n.t('bookings.paymentProcessing'), color: theme.warning, icon: 'sync' };
    }
    if (ps === 'failed') {
      return { text: i18n.t('bookings.paymentFailed'), color: theme.error, icon: 'alert-circle' };
    }
    if (ps === 'cancelled') {
      return { text: i18n.t('bookings.paymentCancelled'), color: theme.secondaryText, icon: 'remove-circle-outline' };
    }
    if (ps === 'refunded') {
      return { text: i18n.t('bookings.paymentRefunded'), color: theme.secondaryText, icon: 'return-down-back' };
    }
    return { text: i18n.t('bookings.paymentPending'), color: theme.warning, icon: 'hourglass-outline' };
  };

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.bookingsContainer}>
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
                          <Text style={[styles.price]}>{formatPrice(booking.totalPrice)} {booking.currency}</Text>
                        </View>
                        {snap?.operatorName && (
                          <View style={[styles.operatorBadge, { backgroundColor: theme.primary + '15' }]}>
                            <Text style={[styles.operatorText, { color: theme.primary }]}>{snap.operatorName}</Text>
                          </View>
                        )}
                      </View>

                      {booking.paymentStatus !== 'paid' && booking.status !== 'cancelled' && (
                        <TouchableOpacity
                          style={styles.payButton}
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
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Пустое состояние */}
          {bookings.length === 0 && !loading && (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconContainer, { backgroundColor: theme.secondaryBackground }]}>
                <Ionicons name="calendar-outline" size={64} color={theme.inactive} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {isGuest ? i18n.t('bookings.signIn') : i18n.t('bookings.noBookings')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
                {isGuest ? i18n.t('bookings.emptyDescGuest') : i18n.t('bookings.emptyDesc')}
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigation.navigate(isGuest ? 'Login' : 'Home')}
              >
                <View style={[styles.emptyButtonGradient, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.emptyButtonText, { color: theme.surface }]}>
                    {isGuest ? i18n.t('auth.login') : i18n.t('bookings.findTours')}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
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
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
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
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  legStatusBlock: {
    marginBottom: 10,
    gap: 4,
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
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0066CC',
  },
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
    backgroundColor: '#0066CC',
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
