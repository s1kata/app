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
import { requireAuthForBooking } from '../auth/requireAuth';
import { TourOutput } from '../types/tourvisor';
import type { TourSnapshot } from '../types';
import { logger } from '../utils/logger';
import { validatePassportData, validatePhone } from '../utils/validation';
import { AuthService } from '../services/AuthService';
import { websiteTourService } from '../services/WebsiteTourService';
import { notificationService } from '../services/NotificationService';
import { bonusService } from '../services/BonusService';
import { BonusRedemptionBlock } from '../components/BonusRedemptionBlock';
import type { BonusQuote } from '../config/bonusRules';
import AuthRequiredCard from '../components/ux/AuthRequiredCard';
import BookingWizardProgress from '../components/ux/BookingWizardProgress';
import { PaymentPrepareModal } from '../components/ux/PaymentFlowModals';
import PrimaryButton from '../components/ui/PrimaryButton';
import { formatDateRuLong } from '../utils/formatDateRu';
import { paymentUxBus } from '../services/PaymentUxBus';

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

  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [bonusesToSpend, setBonusesToSpend] = useState(0);
  const [bonusQuote, setBonusQuote] = useState<BonusQuote | null>(null);
  const [bonusBcId, setBonusBcId] = useState<number | null>(null);
  const [bonusAvailable, setBonusAvailable] = useState(0);
  const [showAuthCard, setShowAuthCard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(3);
  const [showPaymentPrepare, setShowPaymentPrepare] = useState(false);
  const pendingPaymentActionRef = useRef<(() => Promise<void>) | null>(null);

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
    if (isGuest || !user) {
      setShowAuthCard(true);
      setWizardStep(1);
      return;
    }
    setShowAuthCard(false);
    if (loadingProfile) return;
    if (!userHasPassport) {
      setWizardStep(2);
      return;
    }
    setWizardStep(3);
  }, [user, isGuest, loadingProfile, userHasPassport]);

  useEffect(() => {
    loadUserProfile();
  }, [user, isGuest]);

  useFocusEffect(
    useCallback(() => {
      if (user?.uid && !isGuest) loadUserProfile();
    }, [user?.uid, isGuest])
  );

  const loadUserProfile = async () => {
    if (!user?.uid || isGuest) return;

    try {
      setLoadingProfile(true);
      const userData = await AuthService.getCurrentUser();

      if (userData) {
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
        setFormData(prev => ({
          ...prev,
          name: user.displayName || prev.name,
          email: user.email || prev.email,
        }));
      }
    } catch (error) {
      logger.error('[TourBookingScreen] Error loading profile:', error);
      setProfilePassportError('Не удалось проверить паспортные данные');
      // При ошибке используем данные из локальной сессии
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
      newErrors.startDate = i18n.t('ux.pickDate');
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.startDate.trim())) {
      newErrors.startDate = i18n.t('ux.pickDate');
    }

    const nights = Number(formData.nights);
    if (!Number.isFinite(nights) || nights < 1 || nights > 30) {
      newErrors.nights = 'Количество ночей: от 1 до 30';
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

  const userEmail = formData.email || user?.email || '';
  const userPhone = formData.phone || (user as any)?.phoneNumber || (user as any)?.phone || '';

  const loadBonusInfo = useCallback(async () => {
    if (isGuest || (!userEmail && !userPhone)) {
      setBonusAvailable(0);
      setBonusBcId(null);
      return;
    }
    setBonusLoading(true);
    try {
      const res = await bonusService.getBonusBalanceAndHistory({
        email: userEmail || undefined,
        phone: userPhone || undefined,
      });
      if (res.success && res.data) {
        setBonusAvailable(res.data.availableBalance ?? res.data.balance);
        setBonusBcId(res.data.bcId ?? bonusService.getCardIdFromTransactions(res.data.transactions));
      }
    } catch (e) {
      logger.warn('[TourBookingScreen] bonus load failed', e);
    } finally {
      setBonusLoading(false);
    }
  }, [isGuest, userEmail, userPhone]);

  useEffect(() => {
    if (!isGuest && user) loadBonusInfo();
  }, [isGuest, user, loadBonusInfo]);

  const refreshBonusQuote = useCallback(async () => {
    const tourPrice = calculateTotalPrice();
    const spend = bonusEnabled ? bonusesToSpend : 0;
    const res = await bonusService.quoteRedemption({
      tourPrice,
      bonusesToSpend: spend,
      email: userEmail || undefined,
      phone: userPhone || undefined,
      availableBalance: bonusAvailable,
      bcId: bonusBcId,
    });
    if (res.success && res.data) {
      setBonusQuote(res.data);
    } else {
      setBonusQuote(null);
    }
  }, [
    bonusEnabled,
    bonusesToSpend,
    bonusAvailable,
    bonusBcId,
    userEmail,
    userPhone,
    tour.price,
    formData.adults,
    formData.childrenCount,
  ]);

  useEffect(() => {
    void refreshBonusQuote();
  }, [refreshBonusQuote]);

  const getPayablePrice = (): number => {
    if (bonusEnabled && bonusQuote && bonusQuote.bonusesToSpend > 0) {
      return bonusQuote.payableRub;
    }
    return calculateTotalPrice();
  };

  const getBonusDiscount = (): number => {
    if (bonusEnabled && bonusQuote) return bonusQuote.discountRub;
    return 0;
  };

  const isBonusRedemptionValid = (): boolean => {
    if (!bonusEnabled || bonusesToSpend <= 0) return true;
    if (!bonusQuote || !bonusBcId) return false;
    if (bonusesToSpend < (bonusQuote.minBonuses ?? 0)) return false;
    return bonusQuote.bonusesToSpend === bonusesToSpend;
  };

  const handleBooking = async (payImmediately: boolean) => {
    if (bookingSubmitLock.current) return;
    const bookingAuth = await requireAuthForBooking(user);
    if (!bookingAuth.ok) {
      setShowAuthCard(true);
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

    if (bonusEnabled && bonusesToSpend > 0 && !isBonusRedemptionValid()) {
      Alert.alert(i18n.t('common.error'), bonusQuote?.minBonuses
        ? i18n.t('bonus.minHint').replace('{min}', String(bonusQuote.minBonuses))
        : i18n.t('bonus.redeemFailed'));
      return;
    }

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
        tourOperator: String(formData.tourOperator || tour.operator?.name || 'TravelHub').trim(),
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

      if (bonusEnabled && bonusesToSpend > 0 && bonusBcId) {
        const saveBonus = await bonusService.saveRedemptionForBooking({
          bookingId: bookingResult.bookingId,
          tourPrice: calculateTotalPrice(),
          bonusesToSpend,
          bcId: bonusBcId,
          email: userEmail || undefined,
          phone: userPhone || undefined,
        });
        if (!saveBonus.success) {
          throw new Error(saveBonus.error || i18n.t('bonus.redeemFailed'));
        }
      }

      const payableAmount = getPayablePrice();
      const paymentResult = await paymentService.createPayment(selectedPaymentProvider!, {
        bookingId: bookingResult.bookingId,
        amount: payableAmount,
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

      const bookingId = bookingResult.bookingId;
      pendingPaymentActionRef.current = async () => {
        try {
          await bookingService.markPaymentStatus(bookingId, 'payment_processing');
          await openPaymentInBrowser(paymentResult.paymentUrl!);
        } catch (error) {
          logger.warn('Ошибка открытия страницы оплаты:', error);
          await bookingService.markPaymentStatus(bookingId, 'pending').catch(() => {});
          paymentUxBus.showPaymentRecovery(() => navigation.navigate('MainTabs', { screen: 'Bookings' }));
        } finally {
          setIsSubmitting(false);
        }
      };
      setShowPaymentPrepare(true);
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
          {!isGuest && user ? <BookingWizardProgress currentStep={wizardStep} /> : null}

          {wizardStep === 2 && !loadingProfile ? (
            <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('profile.personalData')}</Text>
              <Text style={[styles.bookingMethodDesc, { color: theme.secondaryText, marginBottom: 16 }]}>
                {i18n.t('booking.requirePersonalDataDesc')}
              </Text>
              <PrimaryButton
                title={i18n.t('profile.personalData')}
                onPress={() => navigation.navigate('Profile', { screen: 'PersonalData' })}
                variant="cta"
              />
            </View>
          ) : null}

          {wizardStep === 3 ? (
          <>
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
              <Text style={[styles.totalLabel, { color: theme.secondaryText }]}>{i18n.t('bonus.tourPrice')}:</Text>
              <Text style={[styles.totalValue, { color: theme.text }]}>
                {formatPrice(calculateTotalPrice(), tour.currency)}
              </Text>
            </View>
            {getBonusDiscount() > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.secondaryText }]}>{i18n.t('bonus.discount')}:</Text>
                <Text style={[styles.totalValue, { color: theme.success }]}>
                  −{formatPrice(getBonusDiscount(), tour.currency)}
                </Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.text, fontWeight: '700' }]}>
                {getBonusDiscount() > 0 ? i18n.t('bonus.toPay') : 'Итого'}:
              </Text>
              <Text style={[styles.totalValue, { color: theme.primary, fontWeight: '700' }]}>
                {formatPrice(getPayablePrice(), tour.currency)}
              </Text>
            </View>
          </View>

          {/* Booking Form */}
          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Данные бронирования</Text>

            {/* На этапе бронирования поисковые параметры только для чтения */}
            <View style={[styles.readOnlySummary, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}>
              <Text style={[styles.readOnlyTitle, { color: theme.text }]}>Параметры тура</Text>
              <Text style={[styles.readOnlyRow, { color: theme.secondaryText }]}>
                Вылет: {formatDateRuLong(formData.startDate) || formatDate(tour.date)}
              </Text>
              <Text style={[styles.readOnlyRow, { color: theme.secondaryText }]}>
                Ночей: {formData.nights}
              </Text>
              <Text style={[styles.readOnlyRow, { color: theme.secondaryText }]}>
                Туристы: {formData.adults} взрослых{formData.childrenCount > 0 ? `, ${formData.childrenCount} детей` : ''}
              </Text>
              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
                <Text style={[styles.readOnlyLink, { color: theme.primary }]}>Изменить параметры тура в поиске</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {!canBook && !loadingProfile && (
              <View style={[styles.passportWarning, { backgroundColor: theme.warning + '20', borderColor: theme.warning }]}>
                <Ionicons name="information-circle" size={22} color={theme.warning} />
                <Text style={[styles.passportWarningText, { color: theme.text }]}>{i18n.t('booking.requirePersonalDataDesc')}</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Profile', { screen: 'PersonalData' })} style={styles.passportWarningLink}>
                  <View style={styles.personalDataLinkRow}>
                    <Text style={{ color: theme.primary, fontWeight: '600' }}>{i18n.t('profile.personalData')}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.primary} />
                  </View>
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
                <Text style={[styles.bookingMethodTitle, { color: theme.text }]}>{i18n.t('booking.payLater')}</Text>
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
                <Text style={[styles.bookingMethodTitle, { color: theme.text }]}>{i18n.t('booking.payNow')}</Text>
                <Text style={[styles.bookingMethodDesc, { color: theme.secondaryText }]}>
                  Выберите способ оплаты ниже
                </Text>
              </View>
              {bookingMethod === 'with_payment' && <Ionicons name="checkmark-circle" size={24} color={theme.primary} />}
            </TouchableOpacity>

            {bookingMethod === 'with_payment' && (
              <BonusRedemptionBlock
                theme={{
                  card: theme.card,
                  border: theme.border,
                  text: theme.text,
                  secondaryText: theme.secondaryText,
                  tertiaryText: theme.tertiaryText,
                  primary: theme.primary,
                  secondaryBackground: theme.secondaryBackground,
                  success: theme.success,
                  warning: theme.warning,
                }}
                enabled={bonusEnabled}
                onEnabledChange={(v) => {
                  setBonusEnabled(v);
                  if (!v) setBonusesToSpend(0);
                }}
                bonusesToSpend={bonusesToSpend}
                onBonusesChange={setBonusesToSpend}
                quote={bonusQuote}
                formatPrice={(n) => formatPrice(n, tour.currency)}
                loading={bonusLoading}
              />
            )}

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
                  {bookingMethod === 'with_payment' ? i18n.t('booking.payNow') : i18n.t('booking.payLater')}
                </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
          )}
          </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <AuthRequiredCard
        visible={showAuthCard}
        onLater={() => {
          setShowAuthCard(false);
          navigation.goBack();
        }}
        onLogin={() => {
          setShowAuthCard(false);
          navigation.navigate('Login', { returnTo: { name: 'TourBooking', params: { tour, searchParams } } });
        }}
        onRegister={() => {
          setShowAuthCard(false);
          navigation.navigate('Register', { returnTo: { name: 'TourBooking', params: { tour, searchParams } } });
        }}
      />
      <PaymentPrepareModal
        visible={showPaymentPrepare}
        onCancel={() => {
          setShowPaymentPrepare(false);
          setIsSubmitting(false);
          pendingPaymentActionRef.current = null;
        }}
        onContinue={async () => {
          setShowPaymentPrepare(false);
          const action = pendingPaymentActionRef.current;
          pendingPaymentActionRef.current = null;
          try {
            if (action) await action();
            else {
              paymentUxBus.showPaymentRecovery(() => navigation.navigate('MainTabs', { screen: 'Bookings' }));
              setIsSubmitting(false);
            }
          } catch {
            setIsSubmitting(false);
            paymentUxBus.showPaymentRecovery(() => navigation.navigate('MainTabs', { screen: 'Bookings' }));
          }
        }}
      />
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
  readOnlySummary: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  readOnlyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  readOnlyRow: {
    fontSize: 14,
    marginBottom: 4,
  },
  readOnlyLink: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
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
  personalDataLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
