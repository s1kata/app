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
import { TourOutput } from '../types/tourvisor';
import type { TourSnapshot } from '../types';
import { logger } from '../utils/logger';
import { validatePassportData, validatePhone } from '../utils/validation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserProfile } from '../types/firestore';
import { websiteTourService } from '../services/WebsiteTourService';
import { notificationService } from '../services/NotificationService';

interface TourBookingScreenProps {
  navigation: any;
  route: {
    params: {
      tour: TourOutput;
      searchParams: any;
    };
  };
}

export default function TourBookingScreen({ navigation, route }: TourBookingScreenProps) {
  const { theme, isDark, user } = useAppContext();
  const { tour, searchParams } = route.params;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingMethod, setBookingMethod] = useState<'without_payment' | 'with_payment' | null>(null);
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState<PaymentProvider | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [userHasPassport, setUserHasPassport] = useState(false);
  const [profilePassportError, setProfilePassportError] = useState<string | null>(null);
  const bookingSubmitLock = useRef(false);

  // Проверяем, является ли пользователь гостем
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const canBook = userHasPassport;

  // Форма бронирования
  const [formData, setFormData] = useState({
    startDate: tour?.date ? String(tour.date).trim() : '',
    nights: Math.max(1, Math.min(30, Number(tour?.nights) || 1)),
    tourOperator: (tour?.operator?.name || '').trim(),
    name: '',
    phone: '',
    email: '',
    adults: Math.max(1, Math.min(20, Number(searchParams?.adults ?? tour?.adults ?? 1) || 1)),
    childrenCount: Array.isArray(searchParams?.childs) ? searchParams.childs.length : 0,
    /** В виде строк для удобства ввода в TextInput */
    childrenAges: (Array.isArray(searchParams?.childs) ? searchParams.childs : []).map((a: any) => String(a ?? '').trim()),
    specialRequests: '',
  });

  // Валидация формы
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Скрываем нижнюю навигацию на экране бронирования
  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({
        tabBarStyle: { 
          display: 'none',
          height: 0,
        },
        tabBarVisible: false,
      });
    }
    
    return () => {
      // Восстанавливаем таб при уходе с экрана
      if (parent) {
        parent.setOptions({
          tabBarStyle: undefined,
          tabBarVisible: undefined,
        });
      }
    };
  }, [navigation]);

  useEffect(() => {
    // Проверяем авторизацию при входе на экран
    if (isGuest || !user) {
      Alert.alert(
        i18n.t('favorites.authRequired'),
        i18n.t('booking.authRequiredDesc'),
        [
          {
            text: i18n.t('common.cancel'),
            style: 'cancel',
            onPress: () => navigation.goBack(),
          },
          {
            text: i18n.t('auth.login'),
            onPress: () => {
              navigation.navigate('Login', { returnTo: { name: 'TourBooking', params: { tour, searchParams } } });
            },
          },
          {
            text: i18n.t('auth.register'),
            onPress: () => {
              navigation.navigate('Register', { returnTo: { name: 'TourBooking', params: { tour, searchParams } } });
            },
          },
        ]
      );
      return;
    }

    // Загружаем профиль пользователя для автозаполнения
    loadUserProfile();
  }, [user, isGuest, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (user?.uid && !isGuest) loadUserProfile();
    }, [user?.uid, isGuest])
  );

  const loadUserProfile = async () => {
    if (!user?.uid || isGuest) return;

    try {
      if (!db) return;
      setLoadingProfile(true);
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data() as UserProfile;
        const passport = userData.passport;
        const passportError = validatePassportData({
          series: passport?.series,
          number: passport?.number,
          issuedBy: passport?.issuedBy,
          issueDate: passport?.issueDate,
          birthDate: passport?.birthDate,
        });
        setProfilePassportError(passportError);
        setUserHasPassport(!passportError && !!passport);
        setFormData(prev => ({
          ...prev,
          name: userData.fullName || user.displayName || prev.name,
          email: userData.email || user.email || prev.email,
          phone: userData.phone || prev.phone,
        }));
      } else {
        setUserHasPassport(false);
        setProfilePassportError('Заполните паспортные данные в профиле');
        // Если профиля нет, используем данные из Firebase Auth
        setFormData(prev => ({
          ...prev,
          name: user.displayName || prev.name,
          email: user.email || prev.email,
        }));
      }
    } catch (error) {
      logger.error('[TourBookingScreen] Error loading profile:', error);
      setProfilePassportError('Не удалось проверить паспортные данные');
      // В случае ошибки используем данные из Firebase Auth
      setFormData(prev => ({
        ...prev,
        name: user?.displayName || prev.name,
        email: user?.email || prev.email,
      }));
    } finally {
      setLoadingProfile(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.startDate.trim()) {
      newErrors.startDate = 'Укажите дату начала тура';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.startDate.trim())) {
      newErrors.startDate = 'Формат даты: YYYY-MM-DD';
    }

    const nights = Number(formData.nights);
    if (!Number.isFinite(nights) || nights < 1 || nights > 30) {
      newErrors.nights = 'Количество ночей: от 1 до 30';
    }

    if (!formData.tourOperator.trim()) {
      newErrors.tourOperator = 'Введите туроператора';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Введите имя';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Введите телефон';
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = i18n.t('booking.invalidPhone');
    }

    if (!userHasPassport) {
      newErrors.passport = profilePassportError || i18n.t('booking.requirePersonalData');
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Введите email';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Введите корректный email';
    }

    const adults = Number(formData.adults);
    if (!Number.isFinite(adults) || adults < 1 || adults > 20) {
      newErrors.adults = 'Взрослых: от 1 до 20';
    }
    const childrenCount = Math.max(0, Math.min(10, Number(formData.childrenCount) || 0));
    if (childrenCount > 0) {
      if (!Array.isArray(formData.childrenAges) || formData.childrenAges.length !== childrenCount) {
        newErrors.childrenAges = 'Укажите возраст каждого ребёнка';
      } else {
        for (let i = 0; i < formData.childrenAges.length; i++) {
          const raw = String(formData.childrenAges[i] ?? '').trim();
          const age = Number(raw);
          if (!raw) {
            newErrors.childrenAges = 'Укажите возраст каждого ребёнка';
            break;
          }
          if (!Number.isInteger(age) || age < 0 || age > 17) {
            newErrors.childrenAges = 'Возраст ребёнка: 0–17';
            break;
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Очищаем ошибку при изменении поля
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const setChildrenCount = (nextCount: number) => {
    const clamped = Math.max(0, Math.min(10, nextCount));
    setFormData(prev => {
      // При любом изменении количества детей очищаем поля возрастов,
      // чтобы удалённые значения не "возвращались" в TextInput.
      const nextAges = Array.from({ length: clamped }, () => '');
      return { ...prev, childrenCount: clamped, childrenAges: nextAges };
    });
    if (errors.childrenAges) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.childrenAges;
        return next;
      });
    }
  };

  const setChildAge = (index: number, value: string) => {
    setFormData(prev => {
      const ages = Array.isArray(prev.childrenAges) ? [...prev.childrenAges] : [];
      if (index < 0 || index >= ages.length) return prev;
      ages[index] = value;
      return { ...prev, childrenAges: ages };
    });
    if (errors.childrenAges) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.childrenAges;
        return next;
      });
    }
  };

  const getParticipants = (): number => {
    const adults = Math.max(1, Math.min(20, Number(formData.adults) || 1));
    const children = Math.max(0, Math.min(10, Number(formData.childrenCount) || 0));
    return adults + children;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Дата не указана';
    try {
      const date = new Date(dateString);
      const t = date.getTime();
      if (!Number.isFinite(t)) return 'Дата не указана';
      const year = date.getUTCFullYear();
      if (year < 1970 || year > 2100) return 'Дата не указана';
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (_) {
      return 'Дата не указана';
    }
  };

  const safeDateToISO = (d: Date): string | null => {
    try {
      const t = d.getTime();
      if (!Number.isFinite(t)) return null;
      const y = d.getUTCFullYear();
      if (y < 1970 || y > 2100) return null;
      return d.toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return paymentService.formatAmount(price, currency);
  };

  const calculateTotalPrice = (): number => {
    return tour.price * getParticipants();
  };

  const handleBooking = async (payImmediately: boolean) => {
    if (bookingSubmitLock.current) return;
    const bookingAuth = await requireAuthForBooking(user);
    if (!bookingAuth.ok) {
      const body =
        bookingAuth.reason === 'auth_desync'
          ? 'Сессия в приложении не совпадает с аккаунтом Firebase. Выйдите и войдите снова, затем повторите бронирование.'
          : i18n.t('booking.authRequiredDesc');
      Alert.alert(i18n.t('favorites.authRequired'), body, [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('auth.login'),
          onPress: () => navigation.navigate('Login', { returnTo: { name: 'TourBooking', params: { tour, searchParams } } }),
        },
      ]);
      return;
    }

    if (!validateForm()) {
      Alert.alert(i18n.t('common.error'), i18n.t('booking.fillAllFields'));
      return;
    }

    if (payImmediately && !selectedPaymentProvider) {
      Alert.alert(i18n.t('common.error'), i18n.t('booking.selectPayment'));
      return;
    }
    if (!bookingMethod) return;

    bookingSubmitLock.current = true;
    const nights = Math.max(1, Math.min(30, Number(formData.nights) || Number(tour.nights) || 1));
    const siteBase = websiteTourService.getBaseUrl().replace(/\/+$/, '');
    const widgetParams: Record<string, string> = {
      country: tour.hotel?.country?.name ?? '',
      hotel_name: tour.hotel?.name ?? '',
      price: formatPrice(calculateTotalPrice(), tour.currency),
      nights: String(nights),
      meal: tour.meal?.name ?? '',
      region: tour.hotel?.region?.name ?? '',
      departure_city: (tour?.departure?.name || '').trim(),
      image: tour.picture ?? tour.hotel?.picturelink ?? '',
    };
    const widgetQuery = Object.entries(widgetParams)
      .filter(([_, value]) => value && value.trim() !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    const tourPackageUrl = `${siteBase}/frontend/window/tour-detail.php${widgetQuery ? `?${widgetQuery}` : ''}`;

    setIsSubmitting(true);
    const op = (formData.tourOperator || tour.operator?.name || '').trim();
    const tourSnapshot: TourSnapshot = {
      hotelName: tour.hotel?.name ?? '',
      countryName: tour.hotel?.country?.name ?? undefined,
      hotelImage: (tour.picture ?? tour.hotel?.picturelink) || undefined,
      regionName: tour.hotel?.region?.name ?? undefined,
      subRegionName: tour.hotel?.subRegion?.name ?? undefined,
      nights,
      currency: tour.currency ?? 'RUB',
      operatorName: op || undefined,
      tourPackageUrl,
    };

    const startDateStr = formData.startDate ? String(formData.startDate).trim() : '';
    const fallbackStart = safeDateToISO(new Date()) ?? '2026-01-01';
    let endDateStr = startDateStr || fallbackStart;
    try {
      if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
        const [y, m, d] = startDateStr.split('-').map(Number);
        if (y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          const startDate = new Date(y, m - 1, d);
          const endDate = new Date(y, m - 1, d + nights);
          const endIso = safeDateToISO(endDate);
          if (endIso) endDateStr = endIso;
        }
      } else if (!startDateStr) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + nights);
        const endIso = safeDateToISO(endDate);
        if (endIso) endDateStr = endIso;
      }
    } catch (_) {
      endDateStr = startDateStr || fallbackStart;
    }

    try {
      const adults = Math.max(1, Math.min(20, Number(formData.adults) || 1));
      const childrenCount = Math.max(0, Math.min(10, Number(formData.childrenCount) || 0));
      const childrenAges = (formData.childrenAges || [])
        .slice(0, childrenCount)
        .map((x: any) => Number(String(x ?? '').trim()))
        .filter((n: number) => Number.isFinite(n));
      const bookingResult = await bookingService.createBooking({
        userId: bookingAuth.uid,
        tourId: tour.id.toString(),
        type: 'tour',
        departureCity: (tour?.departure?.name || '').trim(),
        startDate: startDateStr || fallbackStart,
        endDate: endDateStr,
        nights,
        totalPrice: calculateTotalPrice(),
        currency: tour.currency,
        party: { adults, childrenAges },
        tourOperator: String(formData.tourOperator || '').trim(),
        contactInfo: {
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
        },
        specialRequests: formData.specialRequests?.trim() || undefined,
        tourSnapshot,
      });

      if (!bookingResult.success) {
        throw new Error(bookingResult.error || 'Failed to create booking');
      }

      if (bookingResult.queued) {
        Alert.alert(
          'Заявка в очереди',
          'Нет подключения к интернету. Заявка будет отправлена в CRM автоматически при появлении сети. Оплату можно будет оформить в «Мои бронирования» после синхронизации.',
          [{ text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'Bookings' }) }],
        );
        return;
      }

      if (!bookingResult.bookingId) {
        throw new Error(bookingResult.error || 'Не удалось получить номер бронирования');
      }

      void notificationService.notifyBookingThankYou();

      if (!payImmediately || bookingMethod === 'without_payment') {
        Alert.alert(
          'Бронирование создано',
          'Тур забронирован. Оплатить можно в разделе «Мои бронирования».',
          [{ text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'Bookings' }) }]
        );
        return;
      }

      const paymentResult = await paymentService.createPayment(selectedPaymentProvider!, {
        bookingId: bookingResult.bookingId,
        amount: calculateTotalPrice(),
        currency: tour.currency,
        description: `Бронирование тура: ${tour.hotel.name}`,
        returnUrl: `travelhub://payment/success?bookingId=${bookingResult.bookingId}`,
        metadata: {
          tourId: tour.id,
          hotelName: tour.hotel.name,
        },
      });

      if (!paymentResult.success || !paymentResult.paymentUrl || !paymentResult.transactionId) {
        throw new Error(paymentResult.error || 'Не удалось создать платёж');
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
                    if (user?.uid && bookingResult.bookingId) {
                      await bookingService.maybeAwardLoyaltyAfterPaidBooking(user.uid, bookingResult.bookingId);
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
    } catch (error: any) {
      logger.error('[TourBookingScreen] Booking error:', error);
      const msg = error?.message || '';
      const fallback = msg && !/network|fetch|timeout|connection|недоступен|unavailable/i.test(msg)
        ? msg
        : i18n.t('errors.serverUnavailable');
      Alert.alert(i18n.t('common.error'), fallback || i18n.t('booking.createError'));
    } finally {
      bookingSubmitLock.current = false;
      setIsSubmitting(false);
    }
  };

  const paymentProviders: PaymentProvider[] = ['tbank'];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Бронирование тура</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Tour Info Card */}
          <View style={[styles.tourCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.tourTitle, { color: theme.text }]} numberOfLines={2}>
              {tour.hotel.name}
            </Text>
            <View style={styles.tourMeta}>
              <Text style={[styles.metaText, { color: theme.secondaryText }]}>
                {formatDate(tour.date)} • {tour.nights} ночей
              </Text>
              <Text style={[styles.metaText, { color: theme.secondaryText }]}>
                {tour.hotel.region.name}
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: theme.secondaryText }]}>Цена за человека:</Text>
              <Text style={[styles.priceValue, { color: theme.primary }]}>
                {formatPrice(tour.price, tour.currency)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.text }]}>Итого:</Text>
              <Text style={[styles.totalValue, { color: theme.primary }]}>
                {formatPrice(calculateTotalPrice(), tour.currency)}
              </Text>
            </View>
          </View>

          {/* Booking Form */}
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Данные бронирования</Text>

            {/* Start date */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Дата начала тура *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.secondaryBackground,
                    borderColor: errors.startDate ? theme.error : theme.border,
                    color: theme.text,
                  },
                ]}
                value={formData.startDate}
                onChangeText={(value) => handleInputChange('startDate', value)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.tertiaryText}
              />
              {errors.startDate && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.startDate}</Text>
              )}
            </View>

            {/* Nights */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Количество ночей *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.secondaryBackground,
                    borderColor: errors.nights ? theme.error : theme.border,
                    color: theme.text,
                  },
                ]}
                value={String(formData.nights)}
                onChangeText={(value) => handleInputChange('nights', value)}
                placeholder="7"
                placeholderTextColor={theme.tertiaryText}
                keyboardType="number-pad"
                maxLength={2}
              />
              {errors.nights && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.nights}</Text>
              )}
            </View>

            {/* Tour operator */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Туроператор *</Text>
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
                onChangeText={(value) => handleInputChange('tourOperator', value)}
                placeholder="Например: Anex Tour"
                placeholderTextColor={theme.tertiaryText}
              />
              {errors.tourOperator && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.tourOperator}</Text>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 12 }]}>Состав</Text>

            {/* Adults */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Взрослые *</Text>
              <View style={styles.participantsRow}>
                <TouchableOpacity
                  style={[styles.participantButton, { borderColor: theme.border }]}
                  onPress={() => handleInputChange('adults', Math.max(1, Number(formData.adults) - 1))}
                  disabled={Number(formData.adults) <= 1}
                >
                  <Ionicons name="remove" size={20} color={theme.primary} />
                </TouchableOpacity>
                <Text style={[styles.participantCount, { color: theme.text }]}>
                  {formData.adults}
                </Text>
                <TouchableOpacity
                  style={[styles.participantButton, { borderColor: theme.border }]}
                  onPress={() => handleInputChange('adults', Math.min(20, Number(formData.adults) + 1))}
                  disabled={Number(formData.adults) >= 20}
                >
                  <Ionicons name="add" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>
              {errors.adults && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.adults}</Text>
              )}
            </View>

            {/* Children */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Дети (кол-во) *</Text>
              <View style={styles.participantsRow}>
                <TouchableOpacity
                  style={[styles.participantButton, { borderColor: theme.border }]}
                  onPress={() => setChildrenCount(Number(formData.childrenCount) - 1)}
                  disabled={Number(formData.childrenCount) <= 0}
                >
                  <Ionicons name="remove" size={20} color={theme.primary} />
                </TouchableOpacity>
                <Text style={[styles.participantCount, { color: theme.text }]}>
                  {formData.childrenCount}
                </Text>
                <TouchableOpacity
                  style={[styles.participantButton, { borderColor: theme.border }]}
                  onPress={() => setChildrenCount(Number(formData.childrenCount) + 1)}
                  disabled={Number(formData.childrenCount) >= 10}
                >
                  <Ionicons name="add" size={20} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {Number(formData.childrenCount) > 0 && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>Возраст детей *</Text>
                {formData.childrenAges.map((age: string, idx: number) => (
                  <View key={`child_age_${idx}`} style={{ marginBottom: 10 }}>
                    <Text style={[styles.inputLabel, { color: theme.secondaryText, marginBottom: 6 }]}>
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
                      onChangeText={(value) => setChildAge(idx, value)}
                      placeholder="Например: 7"
                      placeholderTextColor={theme.tertiaryText}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                ))}
                {errors.childrenAges && (
                  <Text style={[styles.errorText, { color: theme.error }]}>{errors.childrenAges}</Text>
                )}
              </View>
            )}

            {!canBook && !loadingProfile && (
              <View style={[styles.passportWarning, { backgroundColor: theme.warning + '20', borderColor: theme.warning }]}>
                <Ionicons name="information-circle" size={22} color={theme.warning} />
                <Text style={[styles.passportWarningText, { color: theme.text }]}>{i18n.t('booking.requirePersonalDataDesc')}</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Profile', { screen: 'PersonalData' })} style={styles.passportWarningLink}>
                  <Text style={{ color: theme.primary, fontWeight: '600' }}>{i18n.t('profile.personalData')} →</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <Text style={[styles.sectionTitle, { color: theme.text }]}>Контактные данные</Text>

            {/* Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Имя *</Text>
              <TextInput
                style={[
                  styles.input,
                  { 
                    backgroundColor: theme.secondaryBackground,
                    borderColor: errors.name ? theme.error : theme.border,
                    color: theme.text,
                  },
                ]}
                value={formData.name}
                onChangeText={(value) => handleInputChange('name', value)}
                placeholder="Введите ваше имя"
                placeholderTextColor={theme.tertiaryText}
              />
              {errors.name && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.name}</Text>
              )}
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Телефон *</Text>
              <TextInput
                style={[
                  styles.input,
                  { 
                    backgroundColor: theme.secondaryBackground,
                    borderColor: errors.phone ? theme.error : theme.border,
                    color: theme.text,
                  },
                ]}
                value={formData.phone}
                onChangeText={(value) => handleInputChange('phone', value)}
                placeholder="+7 (999) 123-45-67"
                placeholderTextColor={theme.tertiaryText}
                keyboardType="phone-pad"
              />
              {errors.phone && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.phone}</Text>
              )}
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Email *</Text>
              <TextInput
                style={[
                  styles.input,
                  { 
                    backgroundColor: theme.secondaryBackground,
                    borderColor: errors.email ? theme.error : theme.border,
                    color: theme.text,
                  },
                ]}
                value={formData.email}
                onChangeText={(value) => handleInputChange('email', value)}
                placeholder="example@mail.com"
                placeholderTextColor={theme.tertiaryText}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.email}</Text>
              )}
            </View>

            {/* Special Requests */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Особые пожелания</Text>
              <TextInput
                style={[
                  styles.textArea,
                  { 
                    backgroundColor: theme.secondaryBackground,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                value={formData.specialRequests}
                onChangeText={(value) => handleInputChange('specialRequests', value)}
                placeholder="Дополнительная информация (необязательно)"
                placeholderTextColor={theme.tertiaryText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Способ бронирования */}
          <View style={[styles.paymentCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Способ бронирования</Text>
            <TouchableOpacity
              style={[
                styles.bookingMethodOption,
                {
                  backgroundColor: bookingMethod === 'without_payment' ? theme.primary + '20' : theme.secondaryBackground,
                  borderColor: bookingMethod === 'without_payment' ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setBookingMethod('without_payment')}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={24} color={bookingMethod === 'without_payment' ? theme.primary : theme.secondaryText} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bookingMethodTitle, { color: theme.text }]}>Без оплаты</Text>
                <Text style={[styles.bookingMethodDesc, { color: theme.secondaryText }]}>
                  Оплатить можно позже в разделе «Мои бронирования»
                </Text>
              </View>
              {bookingMethod === 'without_payment' && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
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
              <Ionicons name="card-outline" size={24} color={bookingMethod === 'with_payment' ? theme.primary : theme.secondaryText} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bookingMethodTitle, { color: theme.text }]}>С оплатой</Text>
                <Text style={[styles.bookingMethodDesc, { color: theme.secondaryText }]}>
                  Выберите способ оплаты ниже
                </Text>
              </View>
              {bookingMethod === 'with_payment' && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
            </TouchableOpacity>

            {bookingMethod === 'with_payment' && (
              <>
                <Text style={[styles.sectionSubtitle, { color: theme.text, marginTop: 16, marginBottom: 12 }]}>Платёжная система</Text>
                <View style={styles.paymentMethods}>
                  {paymentProviders.map((provider) => (
                <TouchableOpacity
                  key={provider}
                  style={[
                    styles.paymentMethod,
                    {
                      backgroundColor: selectedPaymentProvider === provider 
                        ? theme.primary + '20' 
                        : theme.secondaryBackground,
                      borderColor: selectedPaymentProvider === provider 
                        ? theme.primary 
                        : theme.border,
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

          {bookingMethod === 'with_payment' && (
            <Text style={[styles.paymentSecureNote, { color: theme.secondaryText }]}>
              {i18n.t('payment.secureNote')}
            </Text>
          )}

          {/* Кнопка: Забронировать (без оплаты) или Забронировать и оплатить (с оплатой) */}
          {bookingMethod && (
            <TouchableOpacity
              style={[styles.submitButton, !canBook && styles.submitButtonDisabled]}
              onPress={() => {
                if (!canBook) {
                  Alert.alert(i18n.t('booking.requirePersonalData'), i18n.t('booking.requirePersonalDataDesc'), [
                    { text: i18n.t('common.cancel'), style: 'cancel' },
                    { text: i18n.t('profile.personalData'), onPress: () => navigation.navigate('Profile', { screen: 'PersonalData' }) },
                  ]);
                  return;
                }
                handleBooking(bookingMethod === 'with_payment');
              }}
            disabled={isSubmitting || !canBook || (bookingMethod === 'with_payment' && !selectedPaymentProvider)}
            activeOpacity={0.8}
          >
            <View style={[styles.submitButtonGradient, { backgroundColor: theme.primary }]}>
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
<Ionicons name={bookingMethod === 'with_payment' ? 'card' : 'calendar'} size={20} color="#fff" />
                <Text style={styles.submitButtonText}>
                  {bookingMethod === 'with_payment' ? 'Забронировать и оплатить' : 'Забронировать'}
                </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 40,
  },
  headerSpacer: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flexGrow: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100, // Увеличенный отступ снизу, чтобы кнопка не перекрывалась таб-баром
  },
  tourCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  tourTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  tourMeta: {
    marginBottom: 12,
  },
  metaText: {
    fontSize: 14,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 14,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  formCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 100,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  passportWarning: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  passportWarningText: {
    fontSize: 14,
    lineHeight: 20,
  },
  passportWarningLink: {
    paddingVertical: 4,
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  participantButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantCount: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },
  paymentCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
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
  paymentMethods: {
    gap: 12,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  paymentMethodText: {
    flex: 1,
    fontSize: 16,
  },
  paymentHint: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  submitButtonSecondary: {
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
    marginTop: 8,
  },
  submitButtonSecondaryText: {
    fontSize: 18,
    fontWeight: '700',
  },
  paymentSecureNote: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
});
