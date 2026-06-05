/**
 * Экран отелей: не в AppNavigator в текущем релизе (см. releaseUiFlags).
 */
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { bookingService } from '../services/BookingService';
import { paymentService, PaymentProvider, openPaymentInBrowser } from '../services/PaymentService';
import { presentPaymentPollOutcome } from '../utils/paymentPollOutcomes';
import { resolvePaymentAfterBrowser } from '../utils/paymentAfterBrowser';
import { showPaymentStatusBar } from '../utils/paymentStatusBanner';
import { requireAuthForBooking } from '../auth/requireAuth';
import { AuthService } from '../services/AuthService';
import { logger } from '../utils/logger';
import { notificationService } from '../services/NotificationService';
import { validatePhone } from '../utils/validation';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { websiteTourService } from '../services/WebsiteTourService';

/** Отель, переданный с экрана деталей (mappedHotel) */
export interface HotelBookingParams {
  id: string;
  name: string;
  description: string;
  location: string;
  country: string;
  category: string;
  rating: number;
  reviews: number;
  price: number;
  currency: string;
  image: string;
  gallery: string[];
  amenities: string[];
  stars: number;
  mealTypes: string[];
  available: boolean;
}

interface HotelBookingFormScreenProps {
  navigation: any;
  route: { params: { hotel: HotelBookingParams } };
}

const getDefaultDates = () => {
  const from = new Date();
  from.setDate(from.getDate() + 1);
  const to = new Date(from);
  to.setDate(to.getDate() + 3);
  return {
    checkIn: from.toISOString().slice(0, 10),
    checkOut: to.toISOString().slice(0, 10),
  };
};

export default function HotelBookingFormScreen({ navigation, route }: HotelBookingFormScreenProps) {
  const { theme, isDark, user } = useAppContext();
  const hotel = route.params?.hotel;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState<PaymentProvider | null>(null);
  const [bookingMethod, setBookingMethod] = useState<'without_payment' | 'with_payment' | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [userHasPassport, setUserHasPassport] = useState(false);
  const canBook = userHasPassport;
  const [formData, setFormData] = useState(() => {
    const def = getDefaultDates();
    return {
      checkIn: def.checkIn,
      checkOut: def.checkOut,
      departureCity: '',
      tourOperator: '',
      name: '',
      phone: '',
      email: '',
      adults: 2,
      childrenCount: 0,
      childrenAges: [] as string[],
      specialRequests: '',
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const bookingSubmitLock = useRef(false);

  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({
        tabBarStyle: { display: 'none', height: 0 },
        tabBarVisible: false,
      });
    }
    return () => {
      if (parent) {
        parent.setOptions({ tabBarStyle: undefined, tabBarVisible: undefined });
      }
    };
  }, [navigation]);

  useEffect(() => {
    if (isGuest || !user) {
      Alert.alert(
        i18n.t('favorites.authRequired'),
        i18n.t('booking.hotelAuthRequiredDesc'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => navigation.goBack() },
          { text: i18n.t('auth.login'), onPress: () => navigation.navigate('Login', { returnTo: { name: 'HotelBooking', params: { hotel } } }) },
          { text: i18n.t('auth.registration'), onPress: () => navigation.navigate('Register', { returnTo: { name: 'HotelBooking', params: { hotel } } }) },
        ]
      );
      return;
    }
    loadUserProfile();
  }, [user, isGuest]);

  const loadUserProfile = async () => {
    if (!user?.uid || isGuest) return;
    try {
      setLoadingProfile(true);
      const d = await AuthService.getCurrentUser();
      if (d) {
        const passport = d.passport;
        setUserHasPassport(!!(passport?.series?.trim() && passport?.number?.trim()));
        setFormData(prev => ({
          ...prev,
          name: d.fullName || user.displayName || prev.name,
          email: d.email || user.email || prev.email,
          phone: d.phone || prev.phone,
        }));
      } else {
        setUserHasPassport(false);
        setFormData(prev => ({
          ...prev,
          name: user.displayName || prev.name,
          email: user.email || prev.email,
        }));
      }
    } catch (e) {
      logger.error('[HotelBookingFormScreen] loadUserProfile:', e);
      setFormData(prev => ({
        ...prev,
        name: user?.displayName || prev.name,
        email: user?.email || prev.email,
      }));
    } finally {
      setLoadingProfile(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user?.uid && !isGuest) loadUserProfile();
    }, [user?.uid, isGuest])
  );

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!formData.departureCity?.trim()) next.departureCity = 'Введите город вылета';
    if (!formData.tourOperator?.trim()) next.tourOperator = 'Введите туроператора';
    if (!formData.name?.trim()) next.name = 'Введите имя';
    if (!formData.phone?.trim()) next.phone = 'Введите телефон';
    else if (!validatePhone(formData.phone)) next.phone = i18n.t('booking.invalidPhone');
    if (!userHasPassport) next.passport = i18n.t('booking.requirePersonalData');
    if (!formData.email?.trim()) next.email = 'Введите email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) next.email = i18n.t('booking.invalidEmail');
    if (!formData.checkIn) next.checkIn = 'Укажите дату заезда';
    if (!formData.checkOut) next.checkOut = 'Укажите дату выезда';
    if (formData.checkIn && formData.checkOut && formData.checkOut <= formData.checkIn) {
      next.checkOut = 'Дата выезда должна быть позже заезда';
    }
    const adults = Number(formData.adults);
    if (!Number.isFinite(adults) || adults < 1 || adults > 20) next.adults = 'Взрослых: от 1 до 20';
    const childrenCount = Math.max(0, Math.min(10, Number(formData.childrenCount) || 0));
    if (childrenCount > 0) {
      if (!Array.isArray(formData.childrenAges) || formData.childrenAges.length !== childrenCount) {
        next.childrenAges = 'Укажите возраст каждого ребёнка';
      } else {
        for (let i = 0; i < formData.childrenAges.length; i++) {
          const raw = String(formData.childrenAges[i] ?? '').trim();
          const age = Number(raw);
          if (!raw) {
            next.childrenAges = 'Укажите возраст каждого ребёнка';
            break;
          }
          if (!Number.isInteger(age) || age < 0 || age > 17) {
            next.childrenAges = 'Возраст ребёнка: 0–17';
            break;
          }
        }
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const setChildrenCount = (nextCount: number) => {
    const clamped = Math.max(0, Math.min(10, nextCount));
    setFormData(prev => {
      const currentAges = Array.isArray(prev.childrenAges) ? prev.childrenAges : [];
      const nextAges = currentAges.slice(0, clamped);
      while (nextAges.length < clamped) nextAges.push('');
      return { ...prev, childrenCount: clamped, childrenAges: nextAges };
    });
    if (errors.childrenAges) setErrors(prev => ({ ...prev, childrenAges: '' }));
  };

  const setChildAge = (index: number, value: string) => {
    setFormData(prev => {
      const ages = Array.isArray(prev.childrenAges) ? [...prev.childrenAges] : [];
      if (index < 0 || index >= ages.length) return prev;
      ages[index] = value;
      return { ...prev, childrenAges: ages };
    });
    if (errors.childrenAges) setErrors(prev => ({ ...prev, childrenAges: '' }));
  };

  const getParticipants = (): number => {
    const adults = Math.max(1, Math.min(20, Number(formData.adults) || 1));
    const children = Math.max(0, Math.min(10, Number(formData.childrenCount) || 0));
    return adults + children;
  };

  const nights = (() => {
    if (!formData.checkIn || !formData.checkOut) return 0;
    const a = new Date(formData.checkIn).getTime();
    const b = new Date(formData.checkOut).getTime();
    return Math.max(0, Math.ceil((b - a) / (24 * 60 * 60 * 1000)));
  })();

  const totalAmount = hotel && hotel.price > 0 ? hotel.price * nights : 0;
  const canPayNow = totalAmount > 0;

  const formatPrice = (price: number, currency: string) =>
    paymentService.formatAmount(price, currency);

  const handleBooking = async (payImmediately: boolean) => {
    if (bookingSubmitLock.current) return;
    const bookingAuth = await requireAuthForBooking(user);
    if (!hotel || !bookingAuth.ok) {
      if (!hotel) return;
      const body =
        !bookingAuth.ok && bookingAuth.reason === 'auth_desync'
          ? 'Сессия в приложении не совпадает с аккаунтом Firebase. Выйдите и войдите снова, затем повторите бронирование.'
          : i18n.t('booking.hotelAuthRequiredDesc');
      Alert.alert(i18n.t('favorites.authRequired'), body, [
        { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => navigation.goBack() },
        { text: i18n.t('auth.login'), onPress: () => navigation.navigate('Login', { returnTo: { name: 'HotelBooking', params: { hotel } } }) },
      ]);
      return;
    }
    if (!validate()) {
      Alert.alert(i18n.t('common.error'), i18n.t('booking.fillAllFields'));
      return;
    }
    if (payImmediately && canPayNow && !selectedPaymentProvider) {
      Alert.alert(i18n.t('common.error'), i18n.t('booking.selectPayment'));
      return;
    }

    bookingSubmitLock.current = true;
    setIsSubmitting(true);
    try {
      const siteBase = websiteTourService.getBaseUrl().replace(/\/+$/, '');
      const hotelImageUrl = (hotel.image || hotel.gallery?.[0] || '').trim() || DEFAULT_HOTEL_IMAGE;
      const widgetParams: Record<string, string> = {
        country: hotel.country,
        hotel_name: hotel.name,
        price: canPayNow ? formatPrice(totalAmount, hotel.currency) : '',
        nights: nights ? String(nights) : '',
        region: hotel.location,
        departure_city: String(formData.departureCity || '').trim(),
        image: hotelImageUrl,
      };
      const widgetQuery = Object.entries(widgetParams)
        .filter(([_, value]) => value && value.trim() !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      const tourPackageUrl = `${siteBase}/frontend/window/tour-detail.php${widgetQuery ? `?${widgetQuery}` : ''}`;

      const tourSnapshot = {
        hotelName: hotel.name,
        countryName: hotel.country,
        hotelImage: hotelImageUrl,
        regionName: hotel.location,
        subRegionName: undefined,
        nights,
        currency: hotel.currency,
        operatorName: (formData.tourOperator || '').trim() || undefined,
        tourPackageUrl,
      };

      const adults = Math.max(1, Math.min(20, Number(formData.adults) || 1));
      const childrenCount = Math.max(0, Math.min(10, Number(formData.childrenCount) || 0));
      const childrenAges = (formData.childrenAges || [])
        .slice(0, childrenCount)
        .map((x: any) => Number(String(x ?? '').trim()))
        .filter((n: number) => Number.isFinite(n));

      const result = await bookingService.createBooking({
        userId: bookingAuth.uid,
        hotelId: hotel.id,
        type: 'hotel',
        departureCity: String(formData.departureCity || '').trim(),
        startDate: formData.checkIn,
        endDate: formData.checkOut,
        nights,
        totalPrice: totalAmount,
        currency: hotel.currency,
        party: { adults, childrenAges },
        tourOperator: String(formData.tourOperator || '').trim(),
        contactInfo: {
          name: formData.name.trim(),
          phone: formData.phone.trim().replace(/\s/g, ''),
          email: formData.email.trim(),
        },
        specialRequests: formData.specialRequests?.trim() || undefined,
        tourSnapshot,
      });

      if (!result.success) throw new Error(result.error);

      if (result.queued) {
        Alert.alert(
          i18n.t('booking.hotelQueuedTitle'),
          i18n.t('booking.hotelQueuedBody'),
          [{ text: i18n.t('common.ok'), onPress: () => navigation.navigate('MainTabs', { screen: 'Bookings' }) }],
        );
        return;
      }

      if (!result.bookingId) throw new Error(result.error || 'Не удалось получить номер бронирования');

      void notificationService.notifyBookingThankYou();

      const crmSent = result.crmSent === true;
      const crmWarning = !crmSent ? i18n.t('booking.hotelCrmWarningAppend') : '';

      if (!payImmediately || !canPayNow) {
        Alert.alert(
          i18n.t('booking.hotelSentTitle'),
          (canPayNow ? i18n.t('booking.hotelSentCanPayBody') : i18n.t('booking.hotelSentManagerBody')) + crmWarning,
          [{ text: i18n.t('common.ok'), onPress: () => navigation.navigate('MainTabs', { screen: 'Bookings' }) }],
        );
        return;
      }

      const paymentResult = await paymentService.createPayment(selectedPaymentProvider!, {
        bookingId: result.bookingId!,
        amount: totalAmount,
        currency: hotel.currency,
        description: `Бронирование отеля: ${hotel.name}`,
        returnUrl: `travelhub://payment/success?bookingId=${result.bookingId}`,
        metadata: { hotelId: hotel.id, hotelName: hotel.name },
      });

      if (!paymentResult.success || !paymentResult.paymentUrl || !paymentResult.transactionId) {
        throw new Error(paymentResult.error || 'Не удалось создать платёж');
      }

      if (!crmSent) {
        Alert.alert(i18n.t('booking.crmNotSentTitle'), i18n.t('booking.crmNotSentBody'), [
          { text: i18n.t('common.ok') },
        ]);
      }

      // По правилам Apple/Google: явно сообщаем о переходе на внешнюю страницу оплаты
      Alert.alert(
        i18n.t('payment.redirectTitle'),
        i18n.t('payment.redirectMessage'),
        [
          { text: i18n.t('payment.cancel'), style: 'cancel', onPress: () => setIsSubmitting(false) },
          {
            text: i18n.t('payment.openButton'),
            onPress: async () => {
              try {
                const browserResult = await openPaymentInBrowser(paymentResult.paymentUrl!);
                const statusResult = await resolvePaymentAfterBrowser(
                  paymentResult.transactionId!,
                  browserResult,
                );
                const goBookings = () => navigation.navigate('MainTabs', { screen: 'Bookings' });
                presentPaymentPollOutcome({
                  transactionId: paymentResult.transactionId!,
                  result: statusResult,
                  onBeforeSuccessAlert: async () => {
                    if (user?.uid && result.bookingId) {
                      await bookingService.maybeAwardLoyaltyAfterPaidBooking(user.uid, result.bookingId);
                    }
                  },
                  onPendingOk: goBookings,
                  alertSuccess: () =>
                    Alert.alert(i18n.t('payment.successTitle'), i18n.t('payment.successMessage'), [
                      { text: i18n.t('common.ok'), onPress: goBookings },
                    ]),
                  alertFailed: () =>
                    Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'), [
                      { text: i18n.t('common.ok'), onPress: goBookings },
                    ]),
                  alertFallbackError: () =>
                    Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'), [
                      { text: i18n.t('common.ok'), onPress: goBookings },
                    ]),
                  alertNetworkError: (message) =>
                    Alert.alert(i18n.t('common.error'), message, [
                      { text: i18n.t('common.ok'), onPress: goBookings },
                    ]),
                });
              } finally {
                setIsSubmitting(false);
              }
            },
          },
        ]
      );
      return;
    } catch (e: any) {
      logger.error('[HotelBookingFormScreen] booking:', e);
      const msg = e?.message || '';
      const fallback = msg && !/network|fetch|timeout|connection|недоступен|unavailable/i.test(msg)
        ? msg
        : i18n.t('errors.serverUnavailable');
      Alert.alert(i18n.t('common.error'), fallback || i18n.t('booking.sendRequestError'));
    } finally {
      bookingSubmitLock.current = false;
      setIsSubmitting(false);
    }
  };

  const formatDate = (s: string) => {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (!hotel) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: theme.text }]}>Отель не передан</Text>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: theme.primary }]} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hotelImage = (hotel.image || hotel.gallery?.[0] || '').trim() || DEFAULT_HOTEL_IMAGE;
  const paymentProviders: PaymentProvider[] = ['tbank'];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.card} />

      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.headerBack} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('booking.hotelHeaderTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.hotelCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Image source={{ uri: hotelImage }} style={styles.hotelImg} resizeMode="cover" />
            <View style={styles.hotelInfo}>
              <Text style={[styles.hotelName, { color: theme.text }]} numberOfLines={2}>{hotel.name}</Text>
              <View style={styles.hotelMeta}>
                <Ionicons name="location-outline" size={14} color={theme.secondaryText} />
                <Text style={[styles.hotelLocation, { color: theme.secondaryText }]}>
                  {hotel.location}, {hotel.country}
                </Text>
              </View>
              {nights > 0 && (
                <Text style={[styles.nightsText, { color: theme.secondaryText }]}>
                  {formData.checkIn && formData.checkOut
                    ? `${formatDate(formData.checkIn)} — ${formatDate(formData.checkOut)} • ${nights} ночей • ${getParticipants()} гостей`
                    : ''}
                </Text>
              )}
              <View style={styles.hotelPriceRow}>
                <Text style={[styles.hotelPriceLabel, { color: theme.secondaryText }]}>Цена за ночь:</Text>
                <Text style={[styles.hotelPriceValue, { color: theme.primary }]}>
                  {hotel.price > 0 ? formatPrice(hotel.price, hotel.currency) : 'Стоимость уточняется'}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Данные бронирования</Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Город вылета *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.secondaryBackground,
                    borderColor: errors.departureCity ? theme.error : theme.border,
                    color: theme.text,
                  },
                ]}
                value={formData.departureCity}
                onChangeText={v => handleChange('departureCity', v)}
                placeholder={i18n.t('booking.exampleCity')}
                placeholderTextColor={theme.tertiaryText}
              />
              {errors.departureCity ? <Text style={[styles.err, { color: theme.error }]}>{errors.departureCity}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Туроператор *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.secondaryBackground,
                    borderColor: errors.tourOperator ? theme.error : theme.border,
                    color: theme.text,
                  },
                ]}
                value={formData.tourOperator}
                onChangeText={v => handleChange('tourOperator', v)}
                placeholder="Например: Anex Tour"
                placeholderTextColor={theme.tertiaryText}
              />
              {errors.tourOperator ? <Text style={[styles.err, { color: theme.error }]}>{errors.tourOperator}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Заезд *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.secondaryBackground, borderColor: errors.checkIn ? theme.error : theme.border, color: theme.text }]}
                value={formData.checkIn}
                onChangeText={v => handleChange('checkIn', v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.tertiaryText}
              />
              {errors.checkIn ? <Text style={[styles.err, { color: theme.error }]}>{errors.checkIn}</Text> : null}
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Выезд *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.secondaryBackground, borderColor: errors.checkOut ? theme.error : theme.border, color: theme.text }]}
                value={formData.checkOut}
                onChangeText={v => handleChange('checkOut', v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.tertiaryText}
              />
              {errors.checkOut ? <Text style={[styles.err, { color: theme.error }]}>{errors.checkOut}</Text> : null}
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Состав *</Text>

              <Text style={[styles.label, { color: theme.secondaryText, marginBottom: 6 }]}>Взрослые</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: theme.border }]}
                  onPress={() => handleChange('adults', Math.max(1, Number(formData.adults) - 1))}
                  disabled={Number(formData.adults) <= 1}
                >
                  <Ionicons name="remove" size={20} color={theme.primary} />
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { color: theme.text }]}>{formData.adults}</Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: theme.border }]}
                  onPress={() => handleChange('adults', Math.min(20, Number(formData.adults) + 1))}
                  disabled={Number(formData.adults) >= 20}
                >
                  <Ionicons name="add" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>
              {errors.adults ? <Text style={[styles.err, { color: theme.error }]}>{errors.adults}</Text> : null}

              <Text style={[styles.label, { color: theme.secondaryText, marginBottom: 6, marginTop: 10 }]}>Дети</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: theme.border }]}
                  onPress={() => setChildrenCount(Number(formData.childrenCount) - 1)}
                  disabled={Number(formData.childrenCount) <= 0}
                >
                  <Ionicons name="remove" size={20} color={theme.primary} />
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { color: theme.text }]}>{formData.childrenCount}</Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: theme.border }]}
                  onPress={() => setChildrenCount(Number(formData.childrenCount) + 1)}
                  disabled={Number(formData.childrenCount) >= 10}
                >
                  <Ionicons name="add" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>

              {Number(formData.childrenCount) > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.label, { color: theme.text }]}>Возраст детей *</Text>
                  {formData.childrenAges.map((age: string, idx: number) => (
                    <View key={`hotel_child_age_${idx}`} style={{ marginTop: 10 }}>
                      <Text style={[styles.label, { color: theme.secondaryText, marginBottom: 6 }]}>
                        Ребёнок {idx + 1}
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: theme.secondaryBackground,
                            borderColor: errors.childrenAges ? theme.error : theme.border,
                            color: theme.text,
                          },
                        ]}
                        value={age}
                        onChangeText={v => setChildAge(idx, v)}
                        placeholder="Например: 7"
                        placeholderTextColor={theme.tertiaryText}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                    </View>
                  ))}
                  {errors.childrenAges ? <Text style={[styles.err, { color: theme.error }]}>{errors.childrenAges}</Text> : null}
                </View>
              )}
            </View>
          </View>

          {!canBook && !loadingProfile && (
            <View style={[styles.passportWarning, { backgroundColor: theme.warning + '20', borderColor: theme.warning }]}>
              <Ionicons name="information-circle" size={22} color={theme.warning} />
              <Text style={[styles.passportWarningText, { color: theme.text }]}>{i18n.t('booking.requirePersonalDataDesc')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Profile', { screen: 'PersonalData' })} style={styles.passportWarningLink}>
                <Text style={{ color: theme.primary, fontWeight: '600' }}>{i18n.t('profile.personalData')} →</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Контактные данные</Text>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Имя *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.secondaryBackground, borderColor: errors.name ? theme.error : theme.border, color: theme.text }]}
                value={formData.name}
                onChangeText={v => handleChange('name', v)}
                placeholder="Введите имя"
                placeholderTextColor={theme.tertiaryText}
              />
              {errors.name ? <Text style={[styles.err, { color: theme.error }]}>{errors.name}</Text> : null}
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Телефон *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.secondaryBackground, borderColor: errors.phone ? theme.error : theme.border, color: theme.text }]}
                value={formData.phone}
                onChangeText={v => handleChange('phone', v)}
                placeholder="+7 (999) 123-45-67"
                placeholderTextColor={theme.tertiaryText}
                keyboardType="phone-pad"
              />
              {errors.phone ? <Text style={[styles.err, { color: theme.error }]}>{errors.phone}</Text> : null}
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Email *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.secondaryBackground, borderColor: errors.email ? theme.error : theme.border, color: theme.text }]}
                value={formData.email}
                onChangeText={v => handleChange('email', v)}
                placeholder="example@mail.com"
                placeholderTextColor={theme.tertiaryText}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email ? <Text style={[styles.err, { color: theme.error }]}>{errors.email}</Text> : null}
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Пожелания</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.secondaryBackground, borderColor: theme.border, color: theme.text }]}
                value={formData.specialRequests}
                onChangeText={v => handleChange('specialRequests', v)}
                placeholder="Дополнительно (необязательно)"
                placeholderTextColor={theme.tertiaryText}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.summaryTitle, { color: theme.text }]}>Итого</Text>
            <Text style={[styles.summaryPrice, { color: theme.primary }]}>
              {totalAmount > 0 ? formatPrice(totalAmount, hotel.currency) : 'Стоимость уточняется'}
            </Text>
            <Text style={[styles.summaryHint, { color: theme.secondaryText }]}>
              {canPayNow
                ? 'Можно забронировать без оплаты и оплатить позже в разделе «Мои бронирования».'
                : 'Менеджер свяжется с вами для подтверждения и оплаты'}
            </Text>
          </View>

          {/* Способ бронирования — только когда есть стоимость */}
          {canPayNow && (
            <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Способ бронирования</Text>
              <TouchableOpacity
                style={[
                  styles.bookingMethodOption,
                  {
                    backgroundColor: bookingMethod === 'without_payment' ? theme.primary + '20' : theme.secondaryBackground,
                    borderColor: bookingMethod === 'without_payment' ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => {
                  setBookingMethod('without_payment');
                  setSelectedPaymentProvider(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="calendar-outline"
                  size={24}
                  color={bookingMethod === 'without_payment' ? theme.primary : theme.secondaryText}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bookingMethodTitle, { color: theme.text }]}>Без оплаты</Text>
                  <Text style={[styles.bookingMethodDesc, { color: theme.secondaryText }]}>
                    Забронируйте сейчас, оплатите позже в разделе «Мои бронирования»
                  </Text>
                </View>
                {bookingMethod === 'without_payment' && (
                  <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.bookingMethodOption,
                  {
                    backgroundColor: bookingMethod === 'with_payment' ? theme.primary + '20' : theme.secondaryBackground,
                    borderColor: bookingMethod === 'with_payment' ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setBookingMethod('with_payment')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="card-outline"
                  size={24}
                  color={bookingMethod === 'with_payment' ? theme.primary : theme.secondaryText}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bookingMethodTitle, { color: theme.text }]}>С оплатой</Text>
                  <Text style={[styles.bookingMethodDesc, { color: theme.secondaryText }]}>
                    Оплатить онлайн сразу после бронирования
                  </Text>
                </View>
                {bookingMethod === 'with_payment' && (
                  <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                )}
              </TouchableOpacity>

              {bookingMethod === 'with_payment' && (
                <>
                  <Text style={[styles.sectionSubtitle, { color: theme.text }]}>Выберите платёжную систему</Text>
                  <View style={styles.paymentMethods}>
                    {paymentProviders.map((provider) => (
                      <TouchableOpacity
                        key={provider}
                        style={[
                          styles.paymentMethod,
                          {
                            backgroundColor: selectedPaymentProvider === provider ? theme.primary + '20' : theme.secondaryBackground,
                            borderColor: selectedPaymentProvider === provider ? theme.primary : theme.border,
                          },
                        ]}
                        onPress={() => setSelectedPaymentProvider(provider)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={paymentService.getProviderIcon(provider) as any}
                          size={24}
                          color={selectedPaymentProvider === provider ? theme.primary : theme.secondaryText}
                        />
                        <Text
                          style={[
                            styles.paymentMethodText,
                            {
                              color: selectedPaymentProvider === provider ? theme.primary : theme.text,
                              fontWeight: selectedPaymentProvider === provider ? '600' : '400',
                            },
                          ]}
                        >
                          {paymentService.getProviderName(provider)}
                        </Text>
                        {selectedPaymentProvider === provider && (
                          <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {canPayNow && bookingMethod === 'with_payment' && (
            <Text style={[styles.paymentSecureNote, { color: theme.secondaryText }]}>
              {i18n.t('payment.secureNote')}
            </Text>
          )}

          {/* Кнопка: Забронировать (без оплаты) или Забронировать и оплатить (с оплатой) */}
          {(canPayNow ? bookingMethod : true) && (
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: theme.primary }, !canBook && styles.submitBtnDisabled]}
              onPress={() => {
                if (!canBook) {
                  Alert.alert(i18n.t('booking.requirePersonalData'), i18n.t('booking.requirePersonalDataDesc'), [
                    { text: i18n.t('common.cancel'), style: 'cancel' },
                    { text: i18n.t('profile.personalData'), onPress: () => navigation.navigate('Profile', { screen: 'PersonalData' }) },
                  ]);
                  return;
                }
                handleBooking(canPayNow ? bookingMethod === 'with_payment' : false);
              }}
              disabled={isSubmitting || loadingProfile || !canBook || (canPayNow && bookingMethod === 'with_payment' && !selectedPaymentProvider)}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name={canPayNow && bookingMethod === 'with_payment' ? 'card' : 'calendar'} size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>
                    {canPayNow
                      ? (bookingMethod === 'with_payment' ? 'Забронировать и оплатить' : 'Забронировать')
                      : 'Отправить заявку на бронирование'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 16, marginBottom: 16 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBack: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  headerSpacer: { width: 40 },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  hotelCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  hotelImg: { width: '100%', height: 160 },
  hotelInfo: { padding: 14 },
  hotelName: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  hotelMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hotelLocation: { fontSize: 14 },
  nightsText: { fontSize: 13, marginTop: 6 },
  hotelPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  hotelPriceLabel: { fontSize: 14 },
  hotelPriceValue: { fontSize: 16, fontWeight: '700' },
  formCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 14 },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 88,
  },
  err: { fontSize: 12, marginTop: 4 },
  passportWarning: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  passportWarningText: { fontSize: 14, lineHeight: 20 },
  passportWarningLink: { paddingVertical: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: 18, fontWeight: '600', minWidth: 32, textAlign: 'center' },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  summaryPrice: { fontSize: 20, fontWeight: '700' },
  summaryHint: { fontSize: 13, marginTop: 8 },
  paymentCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  bookingMethodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
    gap: 12,
  },
  bookingMethodTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  bookingMethodDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  paymentHint: { fontSize: 14, marginBottom: 12 },
  paymentMethods: { gap: 10 },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  paymentMethodText: { fontSize: 16, flex: 1 },
  submitButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    borderWidth: 2,
    marginBottom: 12,
  },
  submitButtonSecondaryText: { fontSize: 16, fontWeight: '600' },
  paymentSecureNote: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitBtnDisabled: { opacity: 0.6 },
});
