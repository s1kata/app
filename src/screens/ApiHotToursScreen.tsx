import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Tour } from '../types/tourvisor';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { dictionaryService } from '../services/DictionaryService';
import { tourvisorApi } from '../services/TourvisorApiService';
import { TourHotel, Country, Departure, HotToursParams, TourHot } from '../types/tourvisor';
import { platform } from '../utils/platform';
import { preCacheTourDetailsFromSearchResults, cacheTourFromSearchResult, tourHotsToTourHotels, buildTourOutputFromSearchResult } from '../utils/tourDetailsCache';
import { FavoritesService } from '../services/FavoritesService';
import AuthRequiredCard from '../components/ux/AuthRequiredCard';
import { cacheService, CacheType } from '../services/CacheService';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import { notificationService } from '../services/NotificationService';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import CachedImage from '../components/ui/CachedImage';
import ScreenHeader from '../components/ui/ScreenHeader';
import FilterChip from '../components/ui/FilterChip';
import TourPriceLabel from '../components/ui/TourPriceLabel';
import {
  isPlausibleHotItem,
  pickSaneCheapestTour,
  saneMinTourPrice,
} from '../utils/tourPriceSanity';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchHotToursViaBackend } from '../services/sync/NextPatchBackendClient';
import { radius, shadows, spacing } from '../config/designSystem';
import { navigateRoot } from '../utils/navHelpers';

const DEPARTURE_PREF_KEY = 'user_preferred_departure_id';

interface ApiHotToursScreenProps {
  navigation: any;
  route: any;
}

export default function ApiHotToursScreen({ navigation, route }: ApiHotToursScreenProps) {
  const { apiReady, theme, isDark, user, currency, backendRefreshCounter } = useAppContext();
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  // Логируем параметры route при монтировании
  useEffect(() => {
    logger.debug('[ApiHotTours] Component mounted. Route params:', route?.params);
    if (route?.params?.countryId) {
      logger.debug('[ApiHotTours] Country ID from route:', route.params.countryId);
      logger.debug('[ApiHotTours] Country Name from route:', route.params.countryName);
    }
  }, []);

  // Search parameters — валюта из настроек приложения
  const [searchParams, setSearchParams] = useState<HotToursParams>({
    departureId: route?.params?.departureId || 0,
    currency,
    onlyCharter: route?.params?.onlyCharter || false,
    limit: 200,
  });

  useEffect(() => {
    setSearchParams(prev => ({ ...prev, currency }));
  }, [currency]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [hotTours, setHotTours] = useState<TourHotel[]>([]);
  const [hasFailedOnce, setHasFailedOnce] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showAuthCard, setShowAuthCard] = useState(false);
  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [departureQuery, setDepartureQuery] = useState('');

  // Dictionary data
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDeparture, setSelectedDeparture] = useState<Departure | null>(null);
  const [selectedCountries, setSelectedCountries] = useState<Country[]>([]);
  const promoNotificationSent = useRef(false);

  const filteredDepartures = useMemo(() => {
    const q = departureQuery.trim().toLowerCase();
    if (!q) return departures;
    return departures.filter((d) => d.name.toLowerCase().includes(q));
  }, [departures, departureQuery]);

  const pickDeparture = useCallback((dep: Departure) => {
    setSelectedDeparture(dep);
    setSearchParams((prev) => ({ ...prev, departureId: dep.id }));
    setShowDepartureModal(false);
    setDepartureQuery('');
    setHasFailedOnce(false);
    void AsyncStorage.setItem(DEPARTURE_PREF_KEY, String(dep.id)).catch(() => {});
  }, []);

  // Load dictionary data and hot tours on mount
  useEffect(() => {
    if (apiReady) {
      logger.debug('[ApiHotTours] API ready, loading dictionary data');
      loadDictionaryData();
    }
  }, [apiReady]);
  
  // Обработка изменений route.params при фокусе экрана
  useEffect(() => {
    if (route?.params) {
      logger.debug('[ApiHotTours] Route params changed:', route.params);
    }
  }, [route?.params]);

  // Set country filter from route params - инициализация туров для определенной страны
  useEffect(() => {
    if (route?.params?.countryId && countries.length > 0) {
      const country = countries.find(c => c.id === route.params.countryId);
      if (country && !selectedCountries.some(c => c.id === country.id)) {
        logger.debug('[HotTours] Setting country from route params:', country.name);
        setSelectedCountries([country]);
      }
    }
    
    // Устанавливаем параметры из route.params если они переданы
    if (route?.params?.departureId && departures.length > 0) {
      const departure = departures.find(d => d.id === route.params.departureId);
      if (departure && (!selectedDeparture || selectedDeparture.id !== departure.id)) {
        logger.debug('[HotTours] Setting departure from route params:', departure.name);
        setSelectedDeparture(departure);
        setSearchParams(prev => ({ ...prev, departureId: route.params.departureId }));
      }
    }
    
    if (route?.params?.onlyCharter !== undefined) {
      setSearchParams(prev => ({ ...prev, onlyCharter: route.params.onlyCharter }));
    }
  }, [route?.params?.countryId, route?.params?.departureId, route?.params?.onlyCharter, countries, departures]);

  // Reload hot tours when filters change
  useEffect(() => {
    // Если передан countryId в route.params, загружаем туры ТОЛЬКО после установки фильтра по стране
    if (route?.params?.countryId) {
      // Ждем пока countries загрузятся и selectedCountries установится
      if (apiReady && selectedDeparture && countries.length > 0 && selectedCountries.length > 0) {
        const countryFromRoute = countries.find(c => c.id === route.params.countryId);
        if (countryFromRoute && selectedCountries[0].id === countryFromRoute.id) {
          logger.debug('[HotTours] Country filter set, loading tours for:', countryFromRoute.name);
          setHasFailedOnce(false);
          loadHotTours();
        }
      }
    } else {
      // Если countryId не передан, загружаем как обычно (для всех стран или выбранных)
      if (apiReady && selectedDeparture) {
        setHasFailedOnce(false);
        loadHotTours();
      }
    }
  }, [selectedDeparture, selectedCountries, countries, route?.params?.countryId]);

  useEffect(() => {
    if (backendRefreshCounter <= 0) return;
    setHasFailedOnce(false);
    void loadDictionaryData();
  }, [backendRefreshCounter]);

  const loadDictionaryData = async () => {
    try {
      const [departuresData, countriesData] = await Promise.all([
        dictionaryService.getDepartures(),
        dictionaryService.getCountriesAll(),
      ]);

      setDepartures(departuresData);
      setCountries(countriesData);

      let departureIdToUse = route?.params?.departureId ? Number(route.params.departureId) : 0;
      if (!departureIdToUse) {
        try {
          const saved = await AsyncStorage.getItem(DEPARTURE_PREF_KEY);
          if (saved && departuresData.some((d) => String(d.id) === saved)) {
            departureIdToUse = Number(saved);
          }
        } catch {
          /* ignore */
        }
      }
      if (!departureIdToUse) {
        const samara = departuresData.find((d) => d.name.toLowerCase().includes('самара'));
        departureIdToUse = samara?.id || departuresData[0]?.id || 1;
      }

      const defaultDeparture = departuresData.find((d) => d.id === departureIdToUse);
      if (defaultDeparture) {
        setSelectedDeparture(defaultDeparture);
        setSearchParams((prev) => ({ ...prev, departureId: departureIdToUse }));
      }

      // Если передан countryId в route.params, сразу устанавливаем фильтр по стране
      if (route?.params?.countryId && countriesData.length > 0) {
        const country = countriesData.find(c => c.id === route.params.countryId);
        if (country) {
          logger.debug('[HotTours] Setting country filter immediately:', country.name);
          setSelectedCountries([country]);
        }
      }
    } catch (error) {
      logger.error('[HotTours] Error loading dictionary data:', error);
      // Тихая обработка ошибок для демо API
    }
  };

  const loadHotTours = async () => {
    if (!selectedDeparture) return;
    if (isLoading) return;

    try {
      setIsLoading(true);
      setHasFailedOnce(false);

      const countryIds =
        selectedCountries.length > 0
          ? selectedCountries.map((c) => c.id)
          : route?.params?.countryId
            ? [Number(route.params.countryId)]
            : undefined;

      const params: HotToursParams = {
        departureId: selectedDeparture.id,
        currency: searchParams.currency || currency || 'RUB',
        onlyCharter: !!searchParams.onlyCharter,
        limit: 80,
        countryIds,
      };

      let hots: TourHot[] = [];
      try {
        const remote = await fetchHotToursViaBackend(params);
        if (remote.success && remote.data?.length) {
          hots = remote.data;
        }
      } catch (e) {
        logger.debug('[HotTours] backend:', (e as Error)?.message);
      }
      if (!hots.length) {
        try {
          const legacy = await tourvisorApi.getHotTours(params);
          hots = Array.isArray(legacy) ? legacy : [];
        } catch (e) {
          logger.debug('[HotTours] legacy:', (e as Error)?.message);
        }
      }

      const uniqueHotels = tourHotsToTourHotels(hots.filter(isPlausibleHotItem));
      if (uniqueHotels.length === 0) {
        logger.warn('[HotTours] No tours found');
      }

      setHotTours(uniqueHotels);
      if (uniqueHotels.length > 0) {
        preCacheTourDetailsFromSearchResults(uniqueHotels, params.currency).catch(() => {});
        const cacheKey = `hot_v2_${selectedDeparture.id}_${(countryIds || []).join(',')}`;
        cacheService.set(CacheType.HOT_TOURS, cacheKey, uniqueHotels).catch(() => {});
        if (!promoNotificationSent.current) {
          const first = uniqueHotels[0];
          const firstTour = first?.tours?.[0];
          const tourName = firstTour
            ? `${first.name}, ${first.country?.name || ''}`
            : first?.name || 'Акционный тур';
          notificationService.sendPromoTourNotification(tourName, firstTour?.id?.toString()).catch(() => {});
          promoNotificationSent.current = true;
        }
      }
    } catch (error: any) {
      setHasFailedOnce(true);
      if (hotTours.length === 0) {
        setHotTours([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCountryFilter = (country: Country) => {
    setSelectedCountries(prev => {
      const isSelected = prev.some(c => c.id === country.id);
      if (isSelected) {
        return prev.filter(c => c.id !== country.id);
      } else {
        return [...prev, country];
      }
    });
  };

  const clearFilters = () => {
    setSelectedCountries([]);
    setHasFailedOnce(false);
  };

  const hotToursMountedRef = useRef(true);
  useEffect(() => {
    hotToursMountedRef.current = true;
    FavoritesService.getInstance()
      .getFavoriteTours()
      .then((favs) => {
        if (hotToursMountedRef.current) {
          setFavoriteIds(new Set(favs.map((f) => String(f.id))));
        }
      })
      .catch(() => {});
    return () => {
      hotToursMountedRef.current = false;
    };
  }, []);

  const handleFavoritePress = useCallback(
    async (item: TourHotel, firstTour: Tour) => {
      try {
        if (isGuest || !user) {
          setShowAuthCard(true);
          return;
        }
        const tourOutput = buildTourOutputFromSearchResult(item, firstTour);
        const result = await FavoritesService.getInstance().toggleTourFavorite(tourOutput);
        if (result.success) {
          const tourId = String(firstTour.id);
          setFavoriteIds((prev) => {
            const next = new Set(prev);
            if (result.isFavorite) next.add(tourId);
            else next.delete(tourId);
            return next;
          });
        } else if (result.error) {
          Alert.alert(i18n.t('common.error'), result.error);
        }
      } catch (error) {
        logger.error('[ApiHotTours] favorite toggle:', error);
        Alert.alert(i18n.t('common.error'), i18n.t('auth.connectionError'));
      }
    },
    [isGuest, user, navigation]
  );

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, []);

  /** Маршрут ToursMap — пины всех отелей с координатами. */
  const openHotToursMap = useCallback(() => {
    if (hotTours.length === 0) return;
    const pins = hotTours
      .map((h) => {
        const lat = typeof h.latitude === 'number' ? h.latitude : null;
        const lng = typeof h.longitude === 'number' ? h.longitude : null;
        if (lat == null || lng == null) return null;
        const firstTour = h.tours?.[0];
        const minPrice =
          h.tours && h.tours.length > 0
            ? saneMinTourPrice(
                h.tours.map((t) => ({
                  price: t.price,
                  currency: t.currency,
                  nights: t.nights,
                  country: h.country,
                })),
                h.country?.id,
              ) || undefined
            : Number(h.price) || undefined;
        return {
          id: String(h.id),
          lat,
          lng,
          title: h.name || h.region?.name || '',
          price: Number(minPrice) || undefined,
          tourId: firstTour?.id ? String(firstTour.id) : undefined,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      lat: number;
      lng: number;
      title: string;
      price?: number;
      tourId?: string;
    }>;
    if (!pins.length) {
      Alert.alert(i18n.t('common.error'), i18n.t('map.noCoords'));
      return;
    }
    navigation.navigate('ToursMap', {
      title: i18n.t('hotTours.onMap'),
      pins,
    });
  }, [hotTours, navigation]);

  const renderHotTourItem = useCallback(({ item }: { item: TourHotel }) => {
    // TourHotel содержит массив туров — берём правдоподобно дешёвый, не сырой min (мусор API)
    const firstTour =
      pickSaneCheapestTour(
        (item.tours || []).map((t) => ({
          ...t,
          country: item.country,
        })),
        item.country?.id,
      ) || (item.tours && item.tours.length > 0 ? item.tours[0] : null);
    const minPrice =
      saneMinTourPrice(
        (item.tours || []).map((t) => ({
          price: t.price,
          currency: t.currency,
          nights: t.nights,
          country: item.country,
        })),
        item.country?.id,
      ) || item.price;

    if (!firstTour || !(Number(minPrice) > 0)) {
      return null; // Пропускаем отели без туров / с битой ценой
    }

    return (
      <TouchableOpacity
        style={[styles.tourCard, { backgroundColor: theme.card, borderColor: theme.border, overflow: 'hidden', padding: 0 }]}
        onPress={() => {
          cacheTourFromSearchResult(item, firstTour, firstTour.currency || 'RUB').catch(() => {});
          navigation.navigate('ApiTourDetails', {
            tourId: firstTour.id,
            currency: firstTour.currency || 'RUB',
          });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardImageWrap}>
          <CachedImage
            source={{ uri: item.picturelink || DEFAULT_HOTEL_IMAGE }}
            style={styles.cardImage}
            contentFit="cover"
            recyclingKey={`hot_${item.id}_${firstTour.id}`}
          />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} style={styles.cardImageFade} />
          <TouchableOpacity
            onPress={() => handleFavoritePress(item, firstTour)}
            style={styles.cardFavoriteBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={favoriteIds.has(String(firstTour.id)) ? 'heart' : 'heart-outline'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
          {(item.rating ?? 0) > 0 ? (
            <View style={styles.cardRatingBadge}>
              <Ionicons name="star" size={12} color="#FFD700" />
              <Text style={styles.cardRatingText}>{item.rating}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.tourHeader}>
            <View style={styles.tourInfo}>
              <Text style={[styles.hotelName, { color: theme.text }]} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={[styles.hotelLocation, { color: theme.secondaryText }]}>
                {item.region?.name || ''}
                {item.subRegion?.name ? `, ${item.subRegion.name}` : ''}
              </Text>
            </View>
            <Text style={[styles.operatorName, { color: theme.primary }]} numberOfLines={1}>
              {firstTour.operator?.name || ''}
            </Text>
          </View>

          <View style={styles.tourDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="location" size={16} color={theme.secondaryText} />
              <Text style={[styles.detailText, { color: theme.secondaryText }]}>
                {item.country?.name || ''}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="calendar" size={16} color={theme.secondaryText} />
              <Text style={[styles.detailText, { color: theme.secondaryText }]}>
                {formatDate(firstTour.date)} • {firstTour.nights} {i18n.t('search.nights')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="restaurant" size={16} color={theme.secondaryText} />
              <Text style={[styles.detailText, { color: theme.secondaryText }]}>
                {firstTour.meal?.russianName || firstTour.meal?.name || ''}
              </Text>
            </View>

            {item.tours.length > 1 && (
              <View style={styles.detailRow}>
                <Ionicons name="options" size={16} color={theme.primary} />
                <Text style={[styles.detailText, { color: theme.primary }]}>
                  {i18n.t('hotTours.moreTours')} {item.tours.length - 1}{' '}
                  {item.tours.length - 1 === 1
                    ? i18n.t('hotTours.moreToursOne')
                    : i18n.t('hotTours.moreToursMany')}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.priceSection}>
            <TourPriceLabel
              amount={settingsService.convertPrice(
                minPrice,
                (firstTour.currency || 'RUB') as Currency,
                currency,
              )}
              currencySymbol={settingsService.getCurrencySymbol(currency)}
              caption="за тур"
              accent
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [
    favoriteIds,
    formatDate,
    currency,
    handleFavoritePress,
    navigation,
    theme,
    user,
    isGuest,
    isDark,
  ]);

  const renderFilters = () => (
    <View style={[styles.filtersContainer, { backgroundColor: theme.card }]}>
      <View style={styles.filterHeader}>
        <Text style={[styles.filterTitle, { color: theme.text }]}>{i18n.t('hotTours.filters')}</Text>
        <TouchableOpacity onPress={clearFilters} activeOpacity={0.7}>
          <Text style={[styles.clearFiltersText, { color: theme.primary }]}>{i18n.t('hotTours.resetFilters')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.countriesFilter}>
        {countries.slice(0, 10).map(country => {
          const isSelected = selectedCountries.some(c => c.id === country.id);
          return (
            <FilterChip
              key={country.id}
              label={country.name}
              active={isSelected}
              onPress={() => toggleCountryFilter(country)}
            />
          );
        })}
      </ScrollView>
    </View>
  );

  if (!apiReady) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {i18n.t('common.initializingApi')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />

      <ScreenHeader
        title={route?.params?.countryName ? `${i18n.t('hotTours.titleCountry')} ${route.params.countryName}` : i18n.t('hotTours.title')}
        onBack={() => navigation.goBack()}
        noSafeTop
        right={
          <View style={styles.headerRight}>
            {hotTours.length > 0 && (
              <TouchableOpacity
                style={styles.mapButton}
                onPress={openHotToursMap}
                activeOpacity={0.7}
              >
                <Ionicons name="map" size={22} color={theme.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowFilters(!showFilters)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="filter"
                size={22}
                color={showFilters ? theme.primary : theme.text}
              />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Departure Selector */}
      <View style={[styles.departureSelector, { backgroundColor: theme.card }]}>
        <Text style={[styles.selectorLabel, { color: theme.secondaryText }]}>Город вылета</Text>
        <TouchableOpacity
          style={[styles.selector, { borderColor: theme.border }]}
          onPress={() => setShowDepartureModal(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectorText, { color: theme.text }]}>
            {selectedDeparture?.name || i18n.t('hotTours.selectCity')}
          </Text>
          <Ionicons name="chevron-down" size={20} color={theme.secondaryText} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showDepartureModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDepartureModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDepartureModal(false)} />
        <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            {i18n.t('hotTours.selectCity')}
          </Text>
          <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.secondaryBackground }]}>
            <Ionicons name="search" size={18} color={theme.secondaryText} />
            <TextInput
              value={departureQuery}
              onChangeText={setDepartureQuery}
              placeholder={i18n.t('countries.searchPlaceholder')}
              placeholderTextColor={theme.secondaryText}
              style={[styles.searchInput, { color: theme.text }]}
              autoCorrect={false}
            />
            {departureQuery ? (
              <TouchableOpacity onPress={() => setDepartureQuery('')}>
                <Ionicons name="close-circle" size={18} color={theme.secondaryText} />
              </TouchableOpacity>
            ) : null}
          </View>
          <FlatList
            data={filteredDepartures}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => {
              const active = selectedDeparture?.id === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.depRow,
                    { borderBottomColor: theme.border },
                    active && { backgroundColor: `${theme.primary}12` },
                  ]}
                  onPress={() => pickDeparture(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.depRowText, { color: theme.text }]}>{item.name}</Text>
                  {active ? <Ionicons name="checkmark" size={20} color={theme.primary} /> : null}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.emptySubtext, { color: theme.secondaryText, padding: 20 }]}>
                {i18n.t('tours.notFoundShort')}
              </Text>
            }
          />
        </View>
      </Modal>

      {/* Filters */}
      {showFilters && renderFilters()}

      {/* Results Count */}
      <View style={[styles.resultsHeader, { backgroundColor: theme.secondaryBackground }]}>
        <Text style={[styles.resultsText, { color: theme.secondaryText }]}>
          {i18n.t('hotTours.foundLine')}: {hotTours.length}
        </Text>
        {hotTours.length > 0 && (
          <TouchableOpacity
            style={styles.mapButtonHeader}
            onPress={openHotToursMap}
            activeOpacity={0.7}
          >
            <Ionicons name="map" size={18} color={theme.primary} />
            <Text style={[styles.mapButtonText, { color: theme.primary }]}>{i18n.t('hotTours.onMap')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tours List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {i18n.t('search.loading')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={hotTours}
          renderItem={renderHotTourItem}
          keyExtractor={(item, index) => {
            const first = item.tours?.[0];
            return `${item.id}-${first?.id ?? 't'}-${first?.date ?? index}-${index}`;
          }}
          contentContainerStyle={styles.toursList}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={6}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="airplane-outline" size={48} color={theme.secondaryText} />
              <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
                {hasFailedOnce && route?.params?.countryId 
                  ? i18n.t('search.errorLoad') 
                  : i18n.t('tours.notFoundShort')}
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.secondaryText }]}>
                {hasFailedOnce && route?.params?.countryId
                  ? i18n.t('errors.checkApiToken')
                  : i18n.t('errors.tryChangeFilters')}
              </Text>
            </View>
          }
        />
      )}
      <AuthRequiredCard
        visible={showAuthCard}
        title={i18n.t('ux.authRequiredTitle')}
        message={i18n.t('auth.favoritesRequired')}
        onLater={() => setShowAuthCard(false)}
        onLogin={() => {
          setShowAuthCard(false);
          navigateRoot(navigation, 'Login');
        }}
        onRegister={() => {
          setShowAuthCard(false);
          navigateRoot(navigation, 'Register');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerSpacer: {
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  departureSelector: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  selectorLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  selectorText: {
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    marginTop: -12,
    maxHeight: '72%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginVertical: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  depRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  depRowText: {
    fontSize: 16,
  },
  filtersContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  clearFiltersText: {
    fontSize: 14,
  },
  countriesFilter: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  countryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  countryChipText: {
    fontSize: 14,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F0F2F5',
  },
  resultsText: {
    fontSize: 14,
    color: '#6E6E73',
  },
  mapButtonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#EBF4FF',
  },
  mapButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5DA9A4',
  },
  toursList: {
    padding: 16,
  },
  tourCard: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardImageWrap: {
    width: '100%',
    aspectRatio: 16 / 10,
    position: 'relative',
    backgroundColor: '#E8EEF5',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  cardFavoriteBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardRatingBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cardRatingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardBody: {
    padding: 16,
  },
  tourHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tourInfo: {
    flex: 1,
    marginRight: 12,
  },
  hotelName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  hotelLocation: {
    fontSize: 14,
  },
  tourOperator: {
    alignItems: 'flex-end',
  },
  favoriteIcon: {
    padding: 4,
  },
  operatorName: {
    fontSize: 14,
    fontWeight: '500',
  },
  tourDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  detailText: {
    fontSize: 14,
  },
  priceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  oldPrice: {
    fontSize: 14,
    textDecorationLine: 'line-through',
  },
  currentPrice: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  priceFromLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  discountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  discountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  tourBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
