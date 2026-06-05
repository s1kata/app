import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenContainer from '../config/ScreenContainer';
import { PrimaryButton } from '../components/ui';
import { spacing, typography, radius } from '../config/designSystem';
import { tourvisorApi } from '../services/TourvisorApiService';
import { TourOutput, TourFlightsOutput, TourSearchParams } from '../types/tourvisor';
import { platform } from '../utils/platform';
import { useAppContext } from '../contexts/AppContext';
import { cacheService, CacheType } from '../services/CacheService';
import { FavoritesService } from '../services/FavoritesService';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';

interface ApiTourDetailsScreenProps {
  navigation: any;
  route: any;
}

export default function ApiTourDetailsScreen({ navigation, route }: ApiTourDetailsScreenProps) {
  // ==========================================
  // ВСЕ ХУКИ ДОЛЖНЫ ВЫЗЫВАТЬСЯ ПЕРВЫМИ
  // В ОДНОМ И ТОМ ЖЕ ПОРЯДКЕ НА КАЖДОМ РЕНДЕРЕ
  // ==========================================
  
  // 1. Context hook
  const { theme, isDark, user, currency } = useAppContext();
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  
  // 2. State hooks - всегда вызываются в одном порядке
  const [tour, setTour] = useState<TourOutput | null>(null);
  const [flights, setFlights] = useState<TourFlightsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFlights, setIsLoadingFlights] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  
  // 3. Ref hooks
  const isMountedRef = useRef(true);
  
  // 4. Extract route params - простые значения без хуков
  // Извлекаем напрямую, без мемоизации для максимальной простоты
  const routeParams = route?.params || {};
  const tourId = routeParams.tourId || '';
  const searchParamsParam = routeParams.searchParams;
  const currencyParam = routeParams.currency;
  
  // 5. Memo hooks - создаем searchParams с мемоизацией
  // Всегда создаем объект для стабильности
  const searchParams = useMemo(() => {
    const params = searchParamsParam || {
      departureId: 0,
      countryId: 0,
      dateFrom: '',
      dateTo: '',
      nightsFrom: 1,
      nightsTo: 30,
      adults: 2,
      currency: currencyParam || 'RUB',
      onlyCharter: false,
    };
    return params;
  }, [searchParamsParam, currencyParam]);
  
  // Извлекаем currency - простое значение, не хук
  const currencyValue = searchParams.currency;
  
  // 6. Layout effect hook
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
      if (parent) {
        parent.setOptions({
          tabBarStyle: undefined,
          tabBarVisible: undefined,
        });
      }
    };
  }, [navigation]);
  
  // 7. Callback hooks - все useCallback вызываются в одном порядке
  const loadTourDetailsInBackground = useCallback(async (cacheKey: string, tourId: string, currency: string) => {
    try {
      const tourData = await tourvisorApi.getTourDetails(tourId, currency);
      if (tourData && isMountedRef.current) {
        await cacheService.set(CacheType.TOUR_DETAILS, cacheKey, tourData);
        setTour(tourData);
        logger.debug('Tour details updated in background');
      }
    } catch (error: any) {
      logger.debug('Background update failed:', error?.message);
      await cacheService.updateMetadata(CacheType.TOUR_DETAILS, cacheKey, {
        lastUpdateAttempt: Date.now(),
        updateError: error?.message || 'Unknown error',
      });
    }
  }, []);
  
  const loadTourDetails = useCallback(async () => {
    if (!tourId) {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      return;
    }

    const tourIdStr = String(tourId);
    const currency = (currencyValue || 'RUB').toUpperCase();
    const cacheKey = `tour_${tourIdStr}_${currency}`;

    try {
      // Сначала проверяем кэш — без спиннера, чтобы при попадании сразу показать данные
      const cachedTour = await cacheService.get<TourOutput>(CacheType.TOUR_DETAILS, cacheKey);
      if (cachedTour && isMountedRef.current) {
        setTour(cachedTour);
        setIsLoading(false);
        const needsUpdate = await cacheService.needsUpdate(CacheType.TOUR_DETAILS, cacheKey);
        if (needsUpdate) {
          loadTourDetailsInBackground(cacheKey, tourIdStr, currency).catch(() => {});
        }
        return;
      }

      if (isMountedRef.current) {
        setIsLoading(true);
      }

      const tourData = await tourvisorApi.getTourDetails(tourIdStr, currency);
      if (isMountedRef.current) {
        setTour(tourData);
      }

      if (tourData) {
        await cacheService.set(CacheType.TOUR_DETAILS, cacheKey, tourData);
      }
    } catch (error: any) {
      logger.error('Failed to load tour details:', error);

      const staleCache = await cacheService.get<TourOutput>(CacheType.TOUR_DETAILS, cacheKey, true);
      if (staleCache && isMountedRef.current) {
        setTour(staleCache);
      } else if (!staleCache && isMountedRef.current) {
        navigation.goBack();
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [tourId, currencyValue, loadTourDetailsInBackground, navigation]);
  
  const loadFlights = useCallback(async () => {
    if (!tour) return;

    try {
      if (isMountedRef.current) {
        setIsLoadingFlights(true);
      }
      const flightsData = await tourvisorApi.getTourFlights(tour.id, currencyValue);
      if (isMountedRef.current) {
        setFlights(flightsData);
      }
    } catch (error) {
      logger.error('Failed to load flights:', error);
      if (isMountedRef.current) {
        setFlights(null);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingFlights(false);
      }
    }
  }, [tour, currencyValue]);

  const handleFavoritePress = useCallback(async () => {
    if (!tour) return;
    if (isGuest || !user) {
      Alert.alert(
        i18n.t('favorites.authRequired'),
        i18n.t('auth.favoritesRequired'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('auth.login'), onPress: () => navigation.navigate('Login') },
        ]
      );
      return;
    }
    const result = await FavoritesService.getInstance().toggleTourFavorite(tour);
    if (result.success && isMountedRef.current) {
      setIsFavorite(result.isFavorite);
    }
  }, [tour, isGuest, user, navigation]);

  // 8. Effect hooks - все useEffect вызываются в одном порядке
  useEffect(() => {
    if (tour?.id) {
      FavoritesService.getInstance().isTourFavorite(tour.id).then((fav) => {
        if (isMountedRef.current) setIsFavorite(fav);
      });
    } else {
      setIsFavorite(false);
    }
  }, [tour?.id]);

  useEffect(() => {
    isMountedRef.current = true;
    loadTourDetails();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [loadTourDetails]);

  // Все фото отеля: основное + из hotel.picturelink и hotel.images (внешний вид отеля)
  const galleryUrls = useMemo(() => {
    if (!tour) return [] as string[];
    const urls: string[] = [];
    if (tour.picture) urls.push(tour.picture);
    const h = tour.hotel as { picturelink?: string; images?: string[] };
    if (h?.picturelink && !urls.includes(h.picturelink)) urls.push(h.picturelink);
    if (Array.isArray(h?.images)) h.images.forEach((url) => url && !urls.includes(url) && urls.push(url));
    return urls;
  }, [tour]);
  
  // Вспомогательные функции (не хуки) — цены в валюте из настроек
  const formatPrice = (price: number, fromCurrency: string) =>
    settingsService.formatTourPrice(price, fromCurrency as Currency, currency);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return i18n.t('tourDetails.dateNotSpecified');
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return i18n.t('tourDetails.dateNotSpecified');
      }
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        weekday: 'short'
      });
    } catch (error) {
      logger.error('Error formatting date:', error);
      return i18n.t('tourDetails.dateNotSpecified');
    }
  };

  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5);
  };

  const renderTourInfo = () => {
    if (!tour) return null;

    const countryName = tour.hotel?.country?.name;
    const stars = (tour.hotel as any)?.category ?? 0;
    const chipBg = isDark ? 'rgba(0,102,204,0.18)' : '#EBF4FF';
    const chipTextColor = theme.primary;

    const infoChips = [
      tour.date ? { icon: '📅', label: formatDate(tour.date) } : null,
      tour.nights ? { icon: '🌙', label: `${tour.nights} ${i18n.t('tours.nightsShort')}` } : null,
      (tour.adults > 0) ? {
        icon: '👥',
        label: `${tour.adults} ${i18n.t('tours.adultsShort')}${tour.childs > 0 ? ` + ${tour.childs} ${i18n.t('tours.childrenShort')}` : ''}`,
      } : null,
      tour.meal?.name ? { icon: '🍽', label: tour.meal.name } : null,
      tour.roomType ? { icon: '🏨', label: tour.roomType } : null,
      tour.departure?.name ? { icon: '✈', label: tour.departure.name } : null,
    ].filter(Boolean) as { icon: string; label: string }[];

    return (
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        {/* Название отеля */}
        <Text style={[styles.tourTitle, { color: theme.text }]} numberOfLines={3}>
          {tour.hotel.name}
        </Text>

        {/* Звёзды */}
        {stars > 0 && (
          <View style={styles.starsRow}>
            {Array.from({ length: 5 }, (_, i) => (
              <Ionicons key={i} name="star" size={14} color={i < stars ? '#FF6B00' : (isDark ? '#444' : '#DDD')} />
            ))}
          </View>
        )}

        {/* Геолокация */}
        {(countryName || tour.hotel.region?.name) && (
          <View style={styles.geoRow}>
            <Ionicons name="location" size={14} color={theme.secondaryText} />
            <Text style={[styles.geoText, { color: theme.secondaryText }]} numberOfLines={1}>
              {[countryName, tour.hotel.region?.name, tour.hotel.subRegion?.name].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        {/* Чипсы с информацией */}
        {infoChips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            {infoChips.map((chip, i) => (
              <View key={i} style={[styles.infoChip, { backgroundColor: chipBg }]}>
                <Text style={styles.chipIcon}>{chip.icon}</Text>
                <Text style={[styles.chipLabel, { color: chipTextColor }]}>{chip.label}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Бейджи (Акция, Чартер, Мало мест) */}
        {(tour.isPromo || tour.isCharter || tour.flightPlace === 2) && (
          <View style={styles.tourBadges}>
            {tour.isPromo && (
              <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                <Text style={styles.badgeText}>Акция</Text>
              </View>
            )}
            {tour.isCharter && (
              <View style={[styles.badge, { backgroundColor: theme.success }]}>
                <Text style={styles.badgeText}>Чартер</Text>
              </View>
            )}
            {tour.flightPlace === 2 && (
              <View style={[styles.badge, { backgroundColor: theme.warning }]}>
                <Text style={styles.badgeText}>Мало мест</Text>
              </View>
            )}
          </View>
        )}

        {/* Секция «Об отеле» */}
        {tour.hotelDescription ? (
          <View style={styles.detailSection}>
            <View style={[styles.detailSectionBar, { backgroundColor: theme.primary }]} />
            <View style={styles.detailSectionContent}>
              <Text style={[styles.detailSectionTitle, { color: theme.text }]}>Об отеле</Text>
              <Text style={[styles.descriptionText, { color: theme.secondaryText }]}>
                {tour.hotelDescription}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Секция «Детали» */}
        <View style={styles.detailSection}>
          <View style={[styles.detailSectionBar, { backgroundColor: theme.primary }]} />
          <View style={styles.detailSectionContent}>
            <Text style={[styles.detailSectionTitle, { color: theme.text }]}>Детали тура</Text>
            <View style={styles.paramsGrid}>
              {tour.operator?.name && (
                <View style={styles.paramBlock}>
                  <Text style={[styles.paramLabel, { color: theme.tertiaryText }]}>Туроператор</Text>
                  <Text style={[styles.paramValue, { color: theme.text }]}>{tour.operator.name}</Text>
                </View>
              )}
              {tour.placement && (
                <View style={styles.paramBlock}>
                  <Text style={[styles.paramLabel, { color: theme.tertiaryText }]}>Размещение</Text>
                  <Text style={[styles.paramValue, { color: theme.text }]}>{tour.placement}</Text>
                </View>
              )}
              {tour.hotel.rating > 0 && (
                <View style={styles.paramBlock}>
                  <Text style={[styles.paramLabel, { color: theme.tertiaryText }]}>Рейтинг</Text>
                  <Text style={[styles.paramValue, { color: theme.text }]}>{tour.hotel.rating.toFixed(1)} ★</Text>
                </View>
              )}
              {tour.fuelCharge > 0 && (
                <View style={styles.paramBlock}>
                  <Text style={[styles.paramLabel, { color: theme.tertiaryText }]}>Топл. сбор</Text>
                  <Text style={[styles.paramValue, { color: theme.text }]}>{formatPrice(tour.fuelCharge, tour.currency)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Цена */}
        <View style={[styles.priceBlock, { borderColor: theme.border }]}>
          <Text style={[styles.priceLabelText, { color: theme.secondaryText }]}>Итоговая стоимость</Text>
          <Text style={[styles.priceValue, { color: theme.primary }]}>
            {formatPrice(tour.price, tour.currency)}
          </Text>
        </View>
      </View>
    );
  };

  const renderFlights = () => {
    if (!flights?.flights) return null;

    return (
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Авиарейсы</Text>
          {!flights.flights.length && (
            <TouchableOpacity
              style={[styles.loadButton, { backgroundColor: theme.primary }]}
              onPress={loadFlights}
              disabled={isLoadingFlights}
              activeOpacity={0.8}
            >
              {isLoadingFlights ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="airplane" size={16} color="#fff" />
                  <Text style={styles.loadButtonText}>Загрузить</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {flights.flights.map((flight, flightIndex) => (
          <View key={flightIndex} style={styles.flightContainer}>
            {flight.forward && (
              <View style={styles.flightDirection}>
                <Text style={[styles.directionTitle, { color: theme.primary }]}>Туда</Text>
                <Text style={[styles.flightDate, { color: theme.secondaryText }]}>
                  {formatDate(flight.dateForward)}
                </Text>

                {flight.forward.map((direction, dirIndex) => (
                  <View key={dirIndex} style={styles.flightSegment}>
                    <View style={styles.flightHeader}>
                      <Text style={[styles.flightNumber, { color: theme.text }]}>
                        {direction.number}
                      </Text>
                      <Text style={[styles.airline, { color: theme.secondaryText }]}>
                        {direction.company.name}
                      </Text>
                    </View>

                    <View style={styles.flightRoute}>
                      <View style={styles.routePoint}>
                        <Text style={[styles.airportCode, { color: theme.primary }]}>
                          {direction.departure.port.id}
                        </Text>
                        <Text style={[styles.airportName, { color: theme.text }]}>
                          {direction.departure.port.name}
                        </Text>
                        <Text style={[styles.time, { color: theme.secondaryText }]}>
                          {formatTime(direction.departure.time)}
                        </Text>
                      </View>

                      <View style={styles.routeArrow}>
                        <Ionicons name="airplane" size={20} color={theme.secondaryText} />
                      </View>

                      <View style={styles.routePoint}>
                        <Text style={[styles.airportCode, { color: theme.primary }]}>
                          {direction.arrival.port.id}
                        </Text>
                        <Text style={[styles.airportName, { color: theme.text }]}>
                          {direction.arrival.port.name}
                        </Text>
                        <Text style={[styles.time, { color: theme.secondaryText }]}>
                          {formatTime(direction.arrival.time)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.flightDetails}>
                      <Text style={[styles.plane, { color: theme.secondaryText }]}>
                        {direction.plane}
                      </Text>
                      {direction.class && (
                        <Text style={[styles.class, { color: theme.secondaryText }]}>
                          Класс: {direction.class}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {flight.backward && (
              <View style={styles.flightDirection}>
                <Text style={[styles.directionTitle, { color: theme.primary }]}>Обратно</Text>
                <Text style={[styles.flightDate, { color: theme.secondaryText }]}>
                  {formatDate(flight.dateBackward)}
                </Text>

                {flight.backward.map((direction, dirIndex) => (
                  <View key={dirIndex} style={styles.flightSegment}>
                    <View style={styles.flightHeader}>
                      <Text style={[styles.flightNumber, { color: theme.text }]}>
                        {direction.number}
                      </Text>
                      <Text style={[styles.airline, { color: theme.secondaryText }]}>
                        {direction.company.name}
                      </Text>
                    </View>

                    <View style={styles.flightRoute}>
                      <View style={styles.routePoint}>
                        <Text style={[styles.airportCode, { color: theme.primary }]}>
                          {direction.departure.port.id}
                        </Text>
                        <Text style={[styles.airportName, { color: theme.text }]}>
                          {direction.departure.port.name}
                        </Text>
                        <Text style={[styles.time, { color: theme.secondaryText }]}>
                          {formatTime(direction.departure.time)}
                        </Text>
                      </View>

                      <View style={styles.routeArrow}>
                        <Ionicons name="airplane" size={20} color={theme.secondaryText} />
                      </View>

                      <View style={styles.routePoint}>
                        <Text style={[styles.airportCode, { color: theme.primary }]}>
                          {direction.arrival.port.id}
                        </Text>
                        <Text style={[styles.airportName, { color: theme.text }]}>
                          {direction.arrival.port.name}
                        </Text>
                        <Text style={[styles.time, { color: theme.secondaryText }]}>
                          {formatTime(direction.arrival.time)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.flightDetails}>
                      <Text style={[styles.plane, { color: theme.secondaryText }]}>
                        {direction.plane}
                      </Text>
                      {direction.class && (
                        <Text style={[styles.class, { color: theme.secondaryText }]}>
                          Класс: {direction.class}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {flights.info?.surcharges && flights.info.surcharges.length > 0 && (
          <View style={styles.surcharges}>
            <Text style={[styles.surchargesTitle, { color: theme.text }]}>Обязательные доплаты</Text>
            {flights.info.surcharges.map((surcharge, index) => (
              <View key={index} style={styles.surchargeItem}>
                <Text style={[styles.surchargeName, { color: theme.text }]}>{surcharge.name}</Text>
                <Text style={[styles.surchargeAmount, { color: theme.primary }]}>
                  {formatPrice(surcharge.amount, surcharge.currency)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Ранние возвраты ТОЛЬКО после всех хуков
  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {i18n.t('tours.loading')}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!tour) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.error} />
          <Text style={[styles.errorText, { color: theme.text }]}>
            Тур не найден
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.backButtonText}>Вернуться</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const handleBookPress = () => {
    if (isGuest || !user) {
      Alert.alert(
        i18n.t('favorites.authRequired'),
        i18n.t('booking.authRequiredDesc'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('auth.login'), onPress: () => navigation.navigate('Login') },
          { text: i18n.t('auth.register'), onPress: () => navigation.navigate('Register') },
        ]
      );
      return;
    }
    navigation.navigate('TourBooking', { tour, searchParams });
  };

  const stickyBottom = insets.bottom + 16;

  return (
    <ScreenContainer>

      {/* Шапка */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          Детали тура
        </Text>
        <TouchableOpacity
          style={styles.headerFavorite}
          onPress={handleFavoritePress}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavorite ? theme.error : theme.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: stickyBottom + 68 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Свайпаемая галерея */}
        {galleryUrls.length > 0 && (
          <View style={styles.gallerySection}>
            <FlatList
              data={galleryUrls}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(uri, i) => `${uri}-${i}`}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setActiveGalleryIndex(index);
              }}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item }}
                  style={{ width: SCREEN_WIDTH, height: GALLERY_HEIGHT }}
                  resizeMode="cover"
                />
              )}
              style={{ height: GALLERY_HEIGHT }}
            />
            {/* Индикатор точек */}
            {galleryUrls.length > 1 && (
              <View style={styles.galleryDots}>
                {galleryUrls.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.galleryDot,
                      { backgroundColor: i === activeGalleryIndex ? theme.primary : 'rgba(255,255,255,0.6)' },
                      i === activeGalleryIndex && styles.galleryDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}
        
        {renderTourInfo()}
        {renderFlights()}
      </ScrollView>

      {/* Sticky кнопка «Оставить заявку» */}
      <View style={[styles.stickyFooter, { 
        backgroundColor: theme.card, 
        borderTopColor: theme.border,
        paddingBottom: stickyBottom,
      }]}>
        <PrimaryButton
          title="Оставить заявку"
          onPress={handleBookPress}
          variant="cta"
          style={styles.bookingButton}
        />
      </View>
    </ScreenContainer>
  );
}

const GALLERY_HEIGHT = 240;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Шапка
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginHorizontal: 4,
  },
  headerFavorite: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: { flex: 1 },
  scrollContent: {},

  // Галерея
  gallerySection: {
    width: '100%',
    marginBottom: 12,
    position: 'relative',
  },
  galleryDots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  galleryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  galleryDotActive: {
    width: 18,
    borderRadius: 3,
  },

  // Основная секция тура
  section: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },

  tourTitle: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 8,
  },

  starsRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 6,
  },

  geoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  geoText: {
    fontSize: 13,
    flex: 1,
  },

  // Чипсы
  chipsScroll: {
    marginBottom: 12,
  },
  chipsContent: {
    gap: 8,
    paddingRight: 4,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  chipIcon: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Бейджи
  tourBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Разделы с оранжевой полоской
  detailSection: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 4,
  },
  detailSectionBar: {
    width: 3,
    borderRadius: 2,
    marginRight: 12,
  },
  detailSectionContent: {
    flex: 1,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
  },

  // Сетка параметров
  paramsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  paramBlock: {
    width: '50%',
    marginBottom: 12,
    paddingRight: 8,
  },
  paramLabel: {
    fontSize: 11,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  paramValue: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Цена
  priceBlock: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  priceLabelText: {
    fontSize: 13,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 26,
    fontWeight: '700',
  },

  // Sticky footer
  stickyFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  bookingButton: {
    width: '100%',
  },

  // Loading / Error
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Рейсы
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  loadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  loadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  flightContainer: {
    marginBottom: 24,
  },
  flightDirection: {
    marginBottom: 16,
  },
  directionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  flightDate: {
    fontSize: 14,
    marginBottom: 8,
  },
  flightSegment: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 10,
  },
  flightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  flightNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  airline: {
    fontSize: 14,
  },
  flightRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  routePoint: {
    alignItems: 'center',
    flex: 1,
  },
  airportCode: {
    fontSize: 18,
    fontWeight: '700',
  },
  airportName: {
    fontSize: 12,
    marginTop: 2,
  },
  time: {
    fontSize: 14,
    marginTop: 2,
  },
  routeArrow: {
    marginHorizontal: 12,
  },
  flightDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  plane: { fontSize: 12 },
  class: { fontSize: 12 },
  surcharges: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  surchargesTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  surchargeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  surchargeName: {
    fontSize: 14,
    flex: 1,
  },
  surchargeAmount: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Legacy (kept for unused refs)
  tourName: { fontSize: 13, marginBottom: 4 },
  tourMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 14 },
  priceSection: {},
  priceLabel: {},
  fuelChargeText: {},
  hotelDescription: {},
  descriptionTitle: {},
  detailRow: {},
  detailLabel: {},
  detailValue: {},
  tourDetails: {},
  headerSpacer: { width: 40 },
  bookingSection: {},
  imageContainer: {},
  hotelImage: {},
  galleryHero: {},
  galleryHeroImage: {},
  galleryStripScroll: {},
  galleryStrip: {},
  galleryThumbWrap: {},
  galleryThumb: {},
});
