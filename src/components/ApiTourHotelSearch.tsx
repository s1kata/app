import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { adaptive } from '../utils/adaptive';
import { platform } from '../utils/platform';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dictionaryService } from '../services/DictionaryService';
import { getDeparturesAndCountriesFromFirestore } from '../services/DictionaryFirestoreCache';
import { tourvisorApi } from '../services/TourvisorApiService';
import { cacheService, CacheType } from '../services/CacheService';
import { locationService } from '../services/LocationService';
import { Country, Departure, Region, Meal, TourSearchParams, TourHotel } from '../types/tourvisor';
import { filterMealsForUi, isValidTourMealId, sanitizeTourMealParam } from '../utils/tourvisorMeals';
import TourSearchLoader from './TourSearchLoader';
import DateRangeCalendar from './DateRangeCalendar';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { radius, shadows } from '../config/designSystem';
import { logger } from '../utils/logger';
import { transparentModalProps } from '../utils/modalConfig';
import { useLifecycleLog } from '../hooks/useLifecycleLog';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import { RELEASE_HIDE_NEXT_PATCH_UI } from '../config/releaseUiFlags';

const DEPARTURE_PREF_KEY = 'user_preferred_departure_id';
const DEPARTURE_DEFAULT_LOCK_KEY = 'departure_default_locked';
const DEFAULT_DEPARTURE_CITY = 'самара';
const DEFAULT_COUNTRY_NAME = 'турц';

interface ApiTourHotelSearchProps {
  navigation: any;
  onSearchTours?: (params: any) => void;
  onSearchHotels?: (params: any) => void;
  onOpenHotTours?: () => void;
  enableHotelSearch?: boolean;
}

export default function ApiTourHotelSearch({
  navigation,
  onSearchTours,
  onSearchHotels,
  onOpenHotTours = () => navigation.navigate('ApiHotTours'),
  enableHotelSearch: enableHotelSearchProp = true,
}: ApiTourHotelSearchProps) {
  useLifecycleLog('ApiTourHotelSearch');
  const enableHotelSearch = RELEASE_HIDE_NEXT_PATCH_UI ? false : enableHotelSearchProp;
  const { theme, themeMode, isDark, language, backendRefreshCounter } = useAppContext();
  const { height: windowHeight } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<'tours' | 'hotels'>('tours');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateType, setDateType] = useState<'dateFrom' | 'dateTo'>('dateFrom');

  // Tour search state
  const [tourSearch, setTourSearch] = useState({
    departureId: '',
    countryId: '',
    dateFrom: '',
    dateTo: '',
    adults: 2,
    childs: [] as number[],
    nightsFrom: 5, // Минимум 5 ночей (можно выбрать от 1)
    nightsTo: 14, // Максимум 14 ночей (можно выбрать до 30)
  });
  
  // Дети: возраст как строки (для ввода); в Tourvisor уходит массив чисел `childs`
  const [childrenAgesInput, setChildrenAgesInput] = useState<string[]>([]);

  // Hotel search state
  const [hotelSearch, setHotelSearch] = useState({
    countryId: '',
    regionId: '',
    checkIn: '',
    checkOut: '',
    adults: 2,
    rooms: 1,
  });

  const defaultCountryName = useMemo(
    () => (language === 'ru' ? 'Турция' : 'Turkey'),
    [language]
  );

  // Dictionary data
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);
  const [isLoadingRegions, setIsLoadingRegions] = useState(false);

  // Загрузчик поиска (как на сайте)
  const [loaderVisible, setLoaderVisible] = useState(false);
  const [loaderPercent, setLoaderPercent] = useState(0);
  const [loaderMessage, setLoaderMessage] = useState(() => i18n.t('search.preparing'));

  // Фильтры: питание, курорт, категория отеля, ночи (ручной ввод), туристы (взрослые 1–3 или ручной ввод, дети 0–3 или ручной ввод)
  const [showFilters, setShowFilters] = useState(false);
  const [filterMealId, setFilterMealId] = useState<number | ''>('');
  const [filterRegionId, setFilterRegionId] = useState<string>('');
  const [filterHotelCategory, setFilterHotelCategory] = useState<number | ''>('');
  const [adultsManual, setAdultsManual] = useState(false);
  const [adultsInput, setAdultsInput] = useState('');
  const [childrenManual, setChildrenManual] = useState(false);

  useEffect(() => {
    // Релизный UX: единый сценарий поиска туров без переключателя вкладок.
    if (activeTab !== 'tours') {
      setActiveTab('tours');
    }
  }, [activeTab]);

  useEffect(() => {
    if (!enableHotelSearch && activeTab === 'hotels') {
      setActiveTab('tours');
    }
  }, [enableHotelSearch, activeTab]);

  // Load dictionary data on mount / после восстановления бэкенда
  useEffect(() => {
    let cancelled = false;
    void loadDictionaryData(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [backendRefreshCounter]);

  // Подгрузка стран по выбранному городу вылета; Турция первой (как на сайте)
  useEffect(() => {
    if (!tourSearch.departureId) {
      setCountries([]);
      return;
    }
    let cancelled = false;
    const depId = parseInt(tourSearch.departureId, 10);
    if (isNaN(depId)) {
      setCountries([]);
      return;
    }
    dictionaryService.getCountries(depId, false).then((list) => {
      if (cancelled) return;
      const turkey = list.find((c: Country) => (c.name || '').toLowerCase().includes('турц') || c.id === 12 || c.id === 4);
      const sorted = turkey
        ? [turkey, ...list.filter((c: Country) => c.id !== turkey.id && c.id !== (turkey.id === 12 ? 4 : 12))]
        : list;
      setCountries(sorted);
      // Автоматически выбираем первую страну, если ещё ничего не выбрано
      if (sorted.length > 0) {
        const turkeyDefault = sorted.find((c: Country) => (c.name || '').toLowerCase().includes(DEFAULT_COUNTRY_NAME));
        setTourSearch(prev => {
          if (!prev.countryId) {
            return { ...prev, countryId: (turkeyDefault || sorted[0]).id.toString() };
          }
          // Если текущая страна есть в новом списке — оставляем, иначе — первая
          const stillValid = sorted.some(c => c.id.toString() === prev.countryId);
          return stillValid ? prev : { ...prev, countryId: (turkeyDefault || sorted[0]).id.toString() };
        });
      }
    }).catch(() => {
      if (!cancelled) setCountries([]);
    });
    return () => { cancelled = true; };
  }, [tourSearch.departureId]);

  // Регионы для фильтра (курорты) из API по выбранной стране
  useEffect(() => {
    const countryId = activeTab === 'tours' ? tourSearch.countryId : hotelSearch.countryId;
    if (!countryId) {
      setRegions([]);
      return;
    }
    let cancelled = false;
    setIsLoadingRegions(true);
    dictionaryService.getRegions(parseInt(countryId, 10))
      .then((list) => {
        if (!cancelled) setRegions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRegions(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, tourSearch.countryId, hotelSearch.countryId]);

  // Типы питания из API (фоновая подгрузка, не блокирует форму)
  useEffect(() => {
    let cancelled = false;
    setIsLoadingMeals(true);
    dictionaryService.getMeals()
      .then((list) => {
        if (!cancelled) setMeals(filterMealsForUi(Array.isArray(list) ? list : []));
      })
      .catch(() => {
        if (!cancelled) setMeals([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMeals(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (filterMealId !== '' && !isValidTourMealId(Number(filterMealId))) {
      setFilterMealId('');
    }
  }, [filterMealId, meals]);

  // Load regions when country changes
  useEffect(() => {
    if (hotelSearch.countryId) {
      loadRegions();
    }
  }, [hotelSearch.countryId]);

  const loadDictionaryData = async (isCancelled?: () => boolean) => {
    const dead = () => isCancelled?.() === true;

    const applyDeparturesToForm = async (departuresData: Departure[]) => {
      if (dead() || departuresData.length === 0) return;
      setDepartures(departuresData);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const inWeek = new Date();
      inWeek.setDate(inWeek.getDate() + 8);
      const defaultDateFrom = tomorrow.toISOString().split('T')[0];
      const defaultDateTo = inWeek.toISOString().split('T')[0];

      let preferredDepartureId = departuresData[0].id.toString();
      try {
        const savedId = await AsyncStorage.getItem(DEPARTURE_PREF_KEY);
        const defaultLocked = await AsyncStorage.getItem(DEPARTURE_DEFAULT_LOCK_KEY);
        if (savedId && departuresData.some((d) => d.id.toString() === savedId)) {
          preferredDepartureId = savedId;
        } else {
          const defaultSamara = departuresData.find((d) => d.name.toLowerCase().includes(DEFAULT_DEPARTURE_CITY));
          if (!defaultLocked && defaultSamara) {
            preferredDepartureId = defaultSamara.id.toString();
            await AsyncStorage.setItem(DEPARTURE_DEFAULT_LOCK_KEY, '1');
            await AsyncStorage.setItem(DEPARTURE_PREF_KEY, preferredDepartureId);
            logger.log('Departure set by first-launch default:', defaultSamara.name);
          } else {
            const location = locationService.getCachedLocation() ?? await locationService.getSavedLocation();
            if (location?.city) {
              const cityLower = location.city.toLowerCase();
              const matched = departuresData.find((d) => {
                const nameLower = d.name.toLowerCase();
                return nameLower.includes(cityLower) || cityLower.includes(nameLower);
              });
              if (matched) {
                preferredDepartureId = matched.id.toString();
                logger.log('Departure set by geolocation:', matched.name);
              }
            }
          }
        }
      } catch (prefError) {
        logger.warn('Could not resolve preferred departure:', prefError);
      }

      if (dead()) return;
      setTourSearch((prev) => ({
        ...prev,
        departureId: preferredDepartureId,
        dateFrom: defaultDateFrom,
        dateTo: defaultDateTo,
      }));
      setHotelSearch((prev) => ({ ...prev, checkIn: defaultDateFrom, checkOut: defaultDateTo }));
    };

    try {
      const firestorePack = await getDeparturesAndCountriesFromFirestore();
      if (dead()) return;
      if (firestorePack.departures.length > 0) {
        await applyDeparturesToForm(firestorePack.departures);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      try {
        const departuresData = await dictionaryService.getDepartures();
        if (!dead() && departuresData.length > 0) {
          await applyDeparturesToForm(departuresData);
        }
      } catch (e) {
        if (__DEV__) console.warn('DictionaryService load failed:', (e as Error)?.message);
      }
    } catch (error) {
      logger.error('Failed to load dictionary data:', error);
      if (!dead()) {
        setDepartures([]);
        setCountries([]);
      }
    } finally {
      if (!dead()) setIsLoading(false);
    }
  };

  const loadRegions = async () => {
    try {
      const regionsData = await dictionaryService.getRegions(parseInt(hotelSearch.countryId));
      setRegions(regionsData);
    } catch (error) {
      logger.error('Failed to load regions:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить список регионов.');
    }
  };

  const handleTourSearch = async () => {
    if (!hasData) {
      Alert.alert(i18n.t('common.error'), i18n.t('form.loadingSearchData'));
      return;
    }

    if (!tourSearch.departureId || !tourSearch.countryId) {
      Alert.alert(i18n.t('common.error'), i18n.t('errors.selectDepartureAndCountry'));
      return;
    }

    if (isLoadingRegions) {
      Alert.alert(i18n.t('common.error'), i18n.t('form.loading'));
      return;
    }

    if (!tourSearch.dateFrom || !tourSearch.dateTo) {
      Alert.alert(i18n.t('common.error'), i18n.t('errors.selectDateRange'));
      return;
    }

    // Валидация дат: проверяем, что даты не в прошлом
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dateFrom = new Date(tourSearch.dateFrom);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date(tourSearch.dateTo);
    dateTo.setHours(0, 0, 0, 0);

    // Если dateFrom в прошлом, используем сегодняшнюю дату
    let validDateFrom = tourSearch.dateFrom;
    if (dateFrom < today) {
      validDateFrom = today.toISOString().split('T')[0];
      // Обновляем состояние с исправленной датой
      updateTourSearch('dateFrom', validDateFrom);
    }

    // Если dateTo раньше dateFrom, корректируем
    const validDateFromObj = new Date(validDateFrom);
    validDateFromObj.setHours(0, 0, 0, 0);
    let validDateTo = tourSearch.dateTo;
    if (dateTo < validDateFromObj) {
      // Устанавливаем dateTo на dateFrom + 7 дней
      const newDateTo = new Date(validDateFromObj);
      newDateTo.setDate(newDateTo.getDate() + 7);
      validDateTo = newDateTo.toISOString().split('T')[0];
      updateTourSearch('dateTo', validDateTo);
    }

    // Ночи: из фильтра (ручной ввод)
    const finalNightsFrom = Math.max(1, Math.min(30, tourSearch.nightsFrom || 7));
    const finalNightsTo = Math.max(finalNightsFrom, Math.min(30, tourSearch.nightsTo || 14));

    const childAges: number[] = [];
    if (childrenAgesInput.length > 0) {
      for (let i = 0; i < childrenAgesInput.length; i++) {
        const raw = String(childrenAgesInput[i] ?? '').trim();
        const age = Number(raw);
        if (!raw) {
          Alert.alert(i18n.t('common.error'), i18n.t('search.errorChildAge'));
          return;
        }
        if (!Number.isInteger(age) || age < 0 || age > 17) {
          Alert.alert(i18n.t('common.error'), i18n.t('search.errorChildAgeRange'));
          return;
        }
        childAges.push(age);
      }
    }

    logIosTestStep(IosTestStep.TOUR_SEARCH, {
      departureId: tourSearch.departureId,
      countryId: tourSearch.countryId,
      dateFrom: validDateFrom,
      dateTo: validDateTo,
    });

    let regionsForSearch = regions;
    if (filterRegionId && !regions.some((r) => String(r.id) === String(filterRegionId))) {
      try {
        regionsForSearch = await dictionaryService.getRegions(parseInt(tourSearch.countryId, 10));
        setRegions(Array.isArray(regionsForSearch) ? regionsForSearch : []);
      } catch {
        Alert.alert(i18n.t('common.error'), i18n.t('search.errorLoad'));
        return;
      }
    }

    const validRegionId =
      filterRegionId && regionsForSearch.some((r) => String(r.id) === String(filterRegionId))
        ? parseInt(filterRegionId, 10)
        : null;
    if (filterRegionId && !validRegionId) {
      Alert.alert(i18n.t('common.error'), i18n.t('errors.tryChangeFilters'));
      setFilterRegionId('');
      return;
    }

    const params: TourSearchParams = {
      departureId: parseInt(tourSearch.departureId),
      countryId: parseInt(tourSearch.countryId),
      dateFrom: validDateFrom,
      dateTo: validDateTo,
      nightsFrom: finalNightsFrom,
      nightsTo: finalNightsTo,
      adults: tourSearch.adults,
      childs: childAges,
      currency: 'RUB',
      onlyCharter: false,
    };
    const mealParam = sanitizeTourMealParam(filterMealId);
    if (mealParam !== undefined) params.meal = mealParam;
    if (validRegionId) params.regionIds = [validRegionId];
    if (filterHotelCategory) params.hotelCategory = filterHotelCategory;

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    try {
      setIsSearching(true);
      setLoaderVisible(true);
      setLoaderPercent(0);
      setLoaderMessage(i18n.t('search.preparing'));

      progressInterval = setInterval(() => {
        setLoaderPercent((p) => {
          const next = p + 2 + Math.random() * 4;
          if (next >= 95) return 95;
          setLoaderMessage(
            next >= 85 ? i18n.t('search.almostReady') : next >= 50 ? i18n.t('search.bestOptions') : next >= 25 ? i18n.t('search.checkingHotels') : next >= 1 ? i18n.t('search.searchingTours') : i18n.t('search.preparing')
          );
          return next;
        });
      }, 90);

      if (onSearchTours) {
        onSearchTours(params);
        if (progressInterval) clearInterval(progressInterval);
        setLoaderPercent(100);
        setLoaderMessage(i18n.t('search.done'));
        setTimeout(() => { setLoaderVisible(false); }, 500);
        return;
      }

      try {
        if (tourvisorApi.isRateLimited()) {
          if (progressInterval) clearInterval(progressInterval);
          setLoaderVisible(false);
          Alert.alert(
            i18n.t('errors.rateLimit'),
            i18n.t('errors.rateLimitDesc'),
            [
              { text: i18n.t('common.close'), style: 'cancel' },
              {
                text: i18n.t('common.resetAndRetry'),
                onPress: async () => {
                  await tourvisorApi.clearRateLimitCooldown();
                  handleTourSearch();
                },
              },
            ],
          );
          return;
        }

        if (progressInterval) clearInterval(progressInterval);
        setLoaderVisible(false);
        navigation.navigate('ApiTourResults', {
          searchParams: params,
          useCache: false,
          runSearch: true,
        });
      } catch (err: unknown) {
          const errMessage = err instanceof Error ? err.message : String(err ?? '');
          if (__DEV__) console.warn('[ApiTourHotelSearch] searchTours error:', errMessage);
          if (progressInterval) clearInterval(progressInterval);
          setLoaderVisible(false);
          const errorMessage = errMessage;
          const errorMessageLower = errorMessage.toLowerCase();
          const isRateLimit = errorMessage.includes('429') || errorMessage.includes('Rate limit');
          const isFilterValidationError =
            errorMessageLower.includes('required') ||
            errorMessageLower.includes('invalid') ||
            errorMessageLower.includes('meal') ||
            errorMessageLower.includes('питани') ||
            errorMessageLower.includes('departureid') ||
            errorMessageLower.includes('countryid') ||
            errorMessageLower.includes('nightsfrom') ||
            errorMessageLower.includes('nightsto');
          if (isRateLimit) {
            Alert.alert(
              i18n.t('errors.rateLimit'),
              i18n.t('errors.rateLimitDesc'),
              [
                { text: i18n.t('common.close'), style: 'cancel' },
                {
                  text: i18n.t('common.resetAndRetry'),
                  onPress: async () => {
                    await tourvisorApi.clearRateLimitCooldown();
                    handleTourSearch();
                  },
                },
              ],
            );
          } else if (isFilterValidationError) {
            Alert.alert(
              i18n.t('search.errorLoad'),
              i18n.t('errors.tryChangeFilters'),
              [
                { text: i18n.t('common.close'), style: 'cancel' },
                { text: i18n.t('common.resetAndRetry'), onPress: () => handleTourSearch() },
              ],
            );
          } else {
            Alert.alert(
              i18n.t('search.errorLoad'),
              i18n.t('search.errorSearchFailed'),
              [
                { text: i18n.t('common.close'), style: 'cancel' },
                { text: i18n.t('common.resetAndRetry'), onPress: () => handleTourSearch() },
              ],
            );
          }
        }
    } catch (error: any) {
      logger.error('Search failed:', error);
      setLoaderVisible(false);
      const errorMessage = String(error?.message || '');
      const errorMessageLower = errorMessage.toLowerCase();
      const isRateLimit = errorMessage.includes('Rate limit');
      const isFilterValidationError =
        errorMessageLower.includes('required') ||
        errorMessageLower.includes('invalid') ||
        errorMessageLower.includes('meal') ||
        errorMessageLower.includes('питани') ||
        errorMessageLower.includes('departureid') ||
        errorMessageLower.includes('countryid') ||
        errorMessageLower.includes('nightsfrom') ||
        errorMessageLower.includes('nightsto');
      if (isRateLimit) {
        Alert.alert(
          i18n.t('errors.rateLimit'),
          i18n.t('errors.rateLimitDesc'),
          [
            { text: i18n.t('common.close'), style: 'cancel' },
            {
              text: i18n.t('common.resetAndRetry'),
              onPress: async () => {
                await tourvisorApi.clearRateLimitCooldown();
                handleTourSearch();
              },
            },
          ]
        );
      } else if (isFilterValidationError) {
        Alert.alert(i18n.t('search.errorLoad'), i18n.t('errors.tryChangeFilters'));
      } else {
        Alert.alert(i18n.t('common.error'), i18n.t('search.errorSearchFailed'));
      }
    } finally {
      if (progressInterval != null) {
        try { clearInterval(progressInterval); } catch { /* noop */ }
      }
      setIsSearching(false);
    }
  };

  const handleHotelSearch = () => {
    if (!hotelSearch.countryId) {
      Alert.alert(i18n.t('common.error'), i18n.t('search.selectCountry'));
      return;
    }

    const searchParams = {
      countryId: parseInt(hotelSearch.countryId),
      regionId: hotelSearch.regionId ? parseInt(hotelSearch.regionId) : undefined,
      checkIn: hotelSearch.checkIn || getDefaultDate(1), // Завтра
      checkOut: hotelSearch.checkOut || getDefaultDate(8), // Через неделю
      adults: hotelSearch.adults,
      rooms: hotelSearch.rooms,
    };

    if (onSearchHotels) onSearchHotels(searchParams);
    // NEXT PATCH (hotels): navigation.navigate('ApiHotelSearch', { searchParams });
    else if (__DEV__) {
      logger.debug('[ApiTourHotelSearch] Hotel search disabled in release build');
    }
  };

  const getDefaultDate = (daysFromNow: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short'
    });
  };

  const updateTourSearch = (field: string, value: any) => {
    setTourSearch(prev => ({ ...prev, [field]: value }));
  };

  const updateHotelSearch = (field: string, value: any) => {
    setHotelSearch(prev => ({ ...prev, [field]: value }));
  };

  const renderTourSearchForm = () => (
    <View style={styles.searchForm}>
      {/* Departure */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{i18n.t('form.fromWhere')}</Text>
        <TouchableOpacity 
          style={[styles.picker, { borderColor: theme.border }]}
          onPress={() => setShowDepartureModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="airplane" size={adaptive.iconSize.small} color={theme.secondaryText} />
          <Text style={[styles.pickerText, { color: theme.text }]}>
            {departures.find(d => d.id.toString() === tourSearch.departureId)?.name || i18n.t('search.selectCity')}
          </Text>
          <Ionicons name="chevron-down" size={adaptive.iconSize.small} color={theme.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Country */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{i18n.t('form.toWhere')}</Text>
        <TouchableOpacity 
          style={[styles.picker, { borderColor: theme.border }]}
          onPress={() => setShowCountryModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="location" size={adaptive.iconSize.small} color={theme.secondaryText} />
          <Text style={[styles.pickerText, { color: theme.text }]}>
            {countries.find(c => c.id.toString() === tourSearch.countryId)?.name || i18n.t('search.selectCountry')}
          </Text>
          <Ionicons name="chevron-down" size={adaptive.iconSize.small} color={theme.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Dates */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{i18n.t('form.dates')}</Text>
        <View style={styles.datesRow}>
          <TouchableOpacity 
            style={[styles.dateInput, { borderColor: theme.border }]}
            onPress={() => {
              setDateType('dateFrom');
              setShowDateModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.dateLabel, { color: theme.secondaryText }]}>{i18n.t('form.dateFrom')}</Text>
            <Text style={[styles.dateText, { color: theme.text }]}>
              {tourSearch.dateFrom ? formatDate(tourSearch.dateFrom) : i18n.t('search.select')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.dateInput, { borderColor: theme.border }]}
            onPress={() => {
              setDateType('dateTo');
              setShowDateModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.dateLabel, { color: theme.secondaryText }]}>{i18n.t('form.dateTo')}</Text>
            <Text style={[styles.dateText, { color: theme.text }]}>
              {tourSearch.dateTo ? formatDate(tourSearch.dateTo) : i18n.t('search.select')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Passengers */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{i18n.t('form.passengers')}</Text>
        <View style={styles.passengersRow}>
          <TouchableOpacity
            style={[styles.passengerButton, { borderColor: theme.border }]}
            onPress={() => updateTourSearch('adults', Math.max(1, tourSearch.adults - 1))}
          >
            <Ionicons name="remove" size={adaptive.iconSize.small} color={theme.primary} />
          </TouchableOpacity>
          <Text style={[styles.passengerCount, { color: theme.text }]}>
            {tourSearch.adults} {i18n.t('form.adultsShort')}
          </Text>
          <TouchableOpacity
            style={[styles.passengerButton, { borderColor: theme.border }]}
            onPress={() => updateTourSearch('adults', Math.min(10, tourSearch.adults + 1))}
          >
            <Ionicons name="add" size={adaptive.iconSize.small} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderHotelSearchForm = () => (
    <View style={styles.searchForm}>
      {/* Country */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{i18n.t('form.country')}</Text>
        <TouchableOpacity 
          style={[styles.picker, { borderColor: theme.border }]}
          onPress={() => {
            setShowCountryModal(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="location" size={adaptive.iconSize.small} color={theme.secondaryText} />
          <Text style={[styles.pickerText, { color: theme.text }]}>
            {countries.find(c => c.id.toString() === hotelSearch.countryId)?.name || i18n.t('search.selectCountry')}
          </Text>
          <Ionicons name="chevron-down" size={adaptive.iconSize.small} color={theme.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Region */}
      {regions.length > 0 && (
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{i18n.t('form.resortOptional')}</Text>
          <TouchableOpacity 
            style={[styles.picker, { borderColor: theme.border }]}
            onPress={() => {
              // Логика для выбора курорта
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="map" size={adaptive.iconSize.small} color={theme.secondaryText} />
            <Text style={[styles.pickerText, { color: theme.text }]}>
              {regions.find(r => r.id.toString() === hotelSearch.regionId)?.name || i18n.t('search.anyResort')}
            </Text>
            <Ionicons name="chevron-down" size={adaptive.iconSize.small} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>
      )}

      {/* Dates */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{i18n.t('form.stayDates')}</Text>
        <View style={styles.datesRow}>
          <TouchableOpacity 
            style={[styles.dateInput, { borderColor: theme.border }]}
            onPress={() => {
              setDateType('dateFrom');
              setShowDateModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.dateLabel, { color: theme.secondaryText }]}>{i18n.t('form.checkIn')}</Text>
            <Text style={[styles.dateText, { color: theme.text }]}>
              {hotelSearch.checkIn ? formatDate(hotelSearch.checkIn) : i18n.t('search.select')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.dateInput, { borderColor: theme.border }]}
            onPress={() => {
              setDateType('dateTo');
              setShowDateModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.dateLabel, { color: theme.secondaryText }]}>{i18n.t('form.checkOut')}</Text>
            <Text style={[styles.dateText, { color: theme.text }]}>
              {hotelSearch.checkOut ? formatDate(hotelSearch.checkOut) : i18n.t('search.select')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Guests */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{i18n.t('form.guests')}</Text>
        <View style={styles.passengersRow}>
          <TouchableOpacity
            style={[styles.passengerButton, { borderColor: theme.border }]}
            onPress={() => updateHotelSearch('adults', Math.max(1, hotelSearch.adults - 1))}
          >
            <Ionicons name="remove" size={adaptive.iconSize.small} color={theme.primary} />
          </TouchableOpacity>
          <Text style={[styles.passengerCount, { color: theme.text }]}>
            {hotelSearch.adults} {i18n.t('form.guestsCount')}
          </Text>
          <TouchableOpacity
            style={[styles.passengerButton, { borderColor: theme.border }]}
            onPress={() => updateHotelSearch('adults', Math.min(20, hotelSearch.adults + 1))}
          >
            <Ionicons name="add" size={adaptive.iconSize.small} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Проверяем, загружены ли критичные данные
  const hasData = departures.length > 0 && countries.length > 0;

  // Показываем поисковик всегда, даже при загрузке (но с индикатором)
  // Это позволяет пользователю видеть интерфейс, даже если данные еще загружаются

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Modern Search Card */}
      <View style={[styles.searchCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* Индикатор загрузки, если данные еще загружаются */}
        {isLoading && (
          <View style={[styles.loadingBanner, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.text }]}>
              {i18n.t('form.loadingSearchData')}
            </Text>
          </View>
        )}
        
        {!isLoading && !hasData && (
          <View style={[styles.warningBanner, { backgroundColor: theme.warning || '#FFA500', borderColor: theme.border }]}>
            <Ionicons name="warning-outline" size={16} color="#FFF" />
            <Text style={styles.warningText}>
              {i18n.t('form.dictionaryWarning')}
            </Text>
          </View>
        )}
        
        {/* Compact Search Form */}
        <View style={styles.compactForm}>
          {activeTab === 'tours' ? (
            <>
              <View style={styles.compactRow}>
                <TouchableOpacity 
                  style={[styles.compactInput, { backgroundColor: theme.secondaryBackground, borderColor: theme.border, borderWidth: 1 }]} 
                  activeOpacity={0.7}
                  onPress={() => hasData ? setShowDepartureModal(true) : Alert.alert(i18n.t('common.error'), i18n.t('errors.dataNotLoaded'))}
                  disabled={!hasData}
                >
                  <Ionicons name="airplane-outline" size={20} color={hasData ? theme.primary : theme.secondaryText} />
                  <View style={styles.compactInputContent}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.fromWhere')}</Text>
                    <Text style={[styles.compactValue, { color: hasData ? theme.text : theme.secondaryText }]} numberOfLines={1}>
                      {departures.find(d => d.id.toString() === tourSearch.departureId)?.name || (hasData ? i18n.t('search.moscow') : i18n.t('search.notLoaded'))}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={theme.secondaryText} />
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.compactInput, { backgroundColor: theme.secondaryBackground, borderColor: theme.border, borderWidth: 1 }]} 
                  activeOpacity={0.7}
                  onPress={() => hasData ? setShowCountryModal(true) : Alert.alert(i18n.t('common.error'), i18n.t('errors.dataNotLoaded'))}
                  disabled={!hasData}
                >
                  <Ionicons name="globe-outline" size={20} color={hasData ? theme.primary : theme.secondaryText} />
                  <View style={styles.compactInputContent}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.toWhere')}</Text>
                    <Text style={[styles.compactValue, { color: hasData ? theme.text : theme.secondaryText }]} numberOfLines={1}>
                      {countries.find(c => c.id.toString() === tourSearch.countryId)?.name || (hasData ? defaultCountryName : i18n.t('search.notLoaded'))}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={theme.secondaryText} />
                </TouchableOpacity>
              </View>

              <View style={styles.compactRow}>
                <TouchableOpacity 
                  style={[styles.compactInput, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]} 
                  activeOpacity={0.7}
                  onPress={() => setShowDateModal(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                  <View style={styles.compactInputContent}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.dates')}</Text>
                    <Text style={[styles.compactValue, { color: theme.text }]} numberOfLines={1}>
                      {tourSearch.dateFrom && tourSearch.dateTo
                        ? `${formatDate(tourSearch.dateFrom)} - ${formatDate(tourSearch.dateTo)}`
                        : i18n.t('search.selectDateRange')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={theme.secondaryText} />
                </TouchableOpacity>

              </View>

              <TouchableOpacity
                style={[styles.filtersToggle, { borderColor: theme.border }]}
                onPress={() => setShowFilters(!showFilters)}
                activeOpacity={0.8}
              >
                <Ionicons name="options-outline" size={18} color={theme.primary} />
                <Text style={[styles.filtersToggleText, { color: theme.text }]}>{i18n.t('hotTours.filters')}</Text>
                <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={18} color={theme.secondaryText} />
              </TouchableOpacity>
              {showFilters && (
                <View style={[styles.filtersBlock, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}>
                  <View style={styles.filterRow}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.nights')}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.from')}</Text>
                        <TextInput
                          style={[styles.childAgeInput, { backgroundColor: theme.secondaryBackground, borderColor: theme.border, color: theme.text, minWidth: 48, textAlign: 'center' }]}
                          value={tourSearch.nightsFrom ? String(tourSearch.nightsFrom) : ''}
                          onChangeText={(t) => { if (t === '') { updateTourSearch('nightsFrom', 0); return; } const n = parseInt(t, 10); if (!isNaN(n) && n >= 1 && n <= 30) updateTourSearch('nightsFrom', n); }}
                          placeholder="7"
                          placeholderTextColor={theme.secondaryText}
                          keyboardType="number-pad"
                          maxLength={2}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.to')}</Text>
                        <TextInput
                          style={[styles.childAgeInput, { backgroundColor: theme.secondaryBackground, borderColor: theme.border, color: theme.text, minWidth: 48, textAlign: 'center' }]}
                          value={tourSearch.nightsTo ? String(tourSearch.nightsTo) : ''}
                          onChangeText={(t) => { if (t === '') { updateTourSearch('nightsTo', 0); return; } const n = parseInt(t, 10); if (!isNaN(n) && n >= 1 && n <= 30) updateTourSearch('nightsTo', n); }}
                          placeholder="14"
                          placeholderTextColor={theme.secondaryText}
                          keyboardType="number-pad"
                          maxLength={2}
                        />
                      </View>
                      <Text style={[styles.presetChipText, { color: theme.secondaryText }]}>{i18n.t('form.nightsShort')}</Text>
                    </View>
                  </View>
                  <View style={styles.filterRow}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.meals')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                      <TouchableOpacity style={[styles.presetChip, { borderColor: theme.border, backgroundColor: !filterMealId ? theme.primary + '20' : undefined }]} onPress={() => setFilterMealId('')}>
                        <Text style={[styles.presetChipText, { color: !filterMealId ? theme.primary : theme.text }]}>{i18n.t('form.any')}</Text>
                      </TouchableOpacity>
                      {isLoadingMeals ? (
                        <Text style={[styles.presetChipText, { color: theme.secondaryText }]}>{i18n.t('form.loading')}</Text>
                      ) : (
                        meals.map((m) => (
                          <TouchableOpacity key={m.id} style={[styles.presetChip, { borderColor: theme.border, backgroundColor: filterMealId === m.id ? theme.primary + '20' : undefined }]} onPress={() => setFilterMealId(m.id)}>
                            <Text style={[styles.presetChipText, { color: filterMealId === m.id ? theme.primary : theme.text }]}>{m.russianName || m.name}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                  </View>
                  <View style={styles.filterRow}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.resort')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                      <TouchableOpacity style={[styles.presetChip, { borderColor: theme.border, backgroundColor: !filterRegionId ? theme.primary + '20' : undefined }]} onPress={() => setFilterRegionId('')}>
                        <Text style={[styles.presetChipText, { color: !filterRegionId ? theme.primary : theme.text }]}>{i18n.t('form.anyCategory')}</Text>
                      </TouchableOpacity>
                      {!(activeTab === 'tours' ? tourSearch.countryId : hotelSearch.countryId) ? (
                        <Text style={[styles.presetChipText, { color: theme.secondaryText }]}>{i18n.t('search.selectCountry')}</Text>
                      ) : isLoadingRegions ? (
                        <Text style={[styles.presetChipText, { color: theme.secondaryText }]}>{i18n.t('form.loading')}</Text>
                      ) : (
                        regions.map((r) => (
                          <TouchableOpacity key={r.id} style={[styles.presetChip, { borderColor: theme.border, backgroundColor: filterRegionId === String(r.id) ? theme.primary + '20' : undefined }]} onPress={() => setFilterRegionId(String(r.id))}>
                            <Text style={[styles.presetChipText, { color: filterRegionId === String(r.id) ? theme.primary : theme.text }]} numberOfLines={1}>{r.name}</Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                  </View>
                  <View style={styles.filterRow}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.hotelCategory')}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[
                        { v: '' as const, l: i18n.t('form.anyCategory') },
                        { v: 3, l: '3★+' },
                        { v: 4, l: '4★+' },
                        { v: 5, l: '5★' },
                      ].map(({ v, l }) => (
                        <TouchableOpacity key={String(v)} style={[styles.presetChip, { borderColor: theme.border, backgroundColor: filterHotelCategory === v ? theme.primary + '20' : undefined }]} onPress={() => setFilterHotelCategory(v)}>
                          <Text style={[styles.presetChipText, { color: filterHotelCategory === v ? theme.primary : theme.text }]}>{l}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.filterRow}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.adults')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {[1, 2, 3].map((n) => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => {
                            setAdultsManual(false);
                            updateTourSearch('adults', n);
                            setAdultsInput(String(n));
                          }}
                          style={[styles.presetChip, { borderColor: theme.border, backgroundColor: !adultsManual && tourSearch.adults === n ? theme.primary + '20' : undefined }]}
                        >
                          <Text style={[styles.presetChipText, { color: !adultsManual && tourSearch.adults === n ? theme.primary : theme.text }]}>{n}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        onPress={() => {
                          setAdultsManual(true);
                          setAdultsInput(String(tourSearch.adults));
                        }}
                        style={[styles.presetChip, { borderColor: theme.border, backgroundColor: adultsManual ? theme.primary + '20' : undefined }]}
                      >
                        <Text style={[styles.presetChipText, { color: adultsManual ? theme.primary : theme.text }]}>{i18n.t('form.manualInput')}</Text>
                      </TouchableOpacity>
                      {adultsManual && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <TextInput
                            style={[styles.childAgeInput, { backgroundColor: theme.secondaryBackground, borderColor: theme.border, color: theme.text, minWidth: 48, textAlign: 'center' }]}
                            value={adultsInput}
                            onChangeText={(text) => {
                              setAdultsInput(text.replace(/\D/g, '').slice(0, 2));
                            }}
                            onBlur={() => {
                              const n = parseInt(adultsInput, 10);
                              const normalized =
                                Number.isFinite(n) && n >= 1 && n <= 20 ? n : 1;
                              setAdultsInput(String(normalized));
                              updateTourSearch('adults', normalized);
                            }}
                            keyboardType="number-pad"
                            maxLength={2}
                          />
                          <Text style={[styles.presetChipText, { color: theme.secondaryText }]}>{i18n.t('form.adultsShort')}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.filterRow}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.children')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {[0, 1, 2, 3].map((n) => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => {
                            setChildrenManual(false);
                            if (n === 0) { setChildrenAgesInput([]); setTourSearch((p) => ({ ...p, childs: [] })); } else {
                              const ages = Array(n).fill('5');
                              setChildrenAgesInput(ages);
                              setTourSearch((p) => ({ ...p, childs: ages.map((a) => parseInt(a, 10) || 5) }));
                            }
                          }}
                          style={[styles.presetChip, { borderColor: theme.border, backgroundColor: !childrenManual && childrenAgesInput.length === n ? theme.primary + '20' : undefined }]}
                        >
                          <Text style={[styles.presetChipText, { color: !childrenManual && childrenAgesInput.length === n ? theme.primary : theme.text }]}>{n === 0 ? '0' : n}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        onPress={() => setChildrenManual(true)}
                        style={[styles.presetChip, { borderColor: theme.border, backgroundColor: childrenManual ? theme.primary + '20' : undefined }]}
                      >
                        <Text style={[styles.presetChipText, { color: childrenManual ? theme.primary : theme.text }]}>{i18n.t('form.manualInput')}</Text>
                      </TouchableOpacity>
                      {childrenManual && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <TouchableOpacity style={[styles.presetChip, { borderColor: theme.border }]} onPress={() => { setChildrenAgesInput((p) => p.slice(0, -1)); setTourSearch((p) => ({ ...p, childs: p.childs.slice(0, -1) })); }}>
                            <Ionicons name="remove" size={18} color={theme.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.presetChip, { borderColor: theme.border }]} onPress={() => { setChildrenAgesInput((p) => [...p, '5']); setTourSearch((p) => ({ ...p, childs: [...p.childs, 5] })); }}>
                            <Ionicons name="add" size={18} color={theme.primary} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {childrenAgesInput.length > 0 && (
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {childrenAgesInput.map((age, idx) => (
                          <View key={`fa_${idx}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[styles.compactLabel, { color: theme.secondaryText, width: 100 }]}>{i18n.t('form.age')} {idx + 1}</Text>
                            <TextInput
                              style={[styles.childAgeInput, { flex: 1, backgroundColor: theme.secondaryBackground, borderColor: theme.border, color: theme.text }]}
                              value={age}
                              onChangeText={(v) => {
                                setChildrenAgesInput((p) => { const n = [...p]; n[idx] = v; return n; });
                                setTourSearch((p) => { const next = [...p.childs]; next[idx] = parseInt(v, 10) || 0; return { ...p, childs: next }; });
                              }}
                              placeholder="0–17"
                              placeholderTextColor={theme.secondaryText}
                              keyboardType="number-pad"
                              maxLength={2}
                            />
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={styles.compactRow}>
                <TouchableOpacity 
                  style={[styles.compactInput, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]} 
                  activeOpacity={0.7}
                  onPress={() => hasData ? setShowCountryModal(true) : Alert.alert(i18n.t('common.error'), i18n.t('errors.dataNotLoaded'))}
                  disabled={!hasData}
                >
                  <Ionicons name="location-outline" size={20} color={hasData ? theme.primary : theme.secondaryText} />
                  <View style={styles.compactInputContent}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.country')}</Text>
                    <Text style={[styles.compactValue, { color: hasData ? theme.text : theme.secondaryText }]} numberOfLines={1}>
                      {countries.find(c => c.id.toString() === hotelSearch.countryId)?.name || (hasData ? i18n.t('search.select') : i18n.t('search.notLoaded'))}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={theme.secondaryText} />
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.compactInput, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]} 
                  activeOpacity={0.7}
                  onPress={() => setShowDateModal(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                  <View style={styles.compactInputContent}>
                    <Text style={[styles.compactLabel, { color: theme.secondaryText }]}>{i18n.t('form.dates')}</Text>
                    <Text style={[styles.compactValue, { color: theme.text }]} numberOfLines={1}>
                      {hotelSearch.checkIn && hotelSearch.checkOut
                        ? `${formatDate(hotelSearch.checkIn)} - ${formatDate(hotelSearch.checkOut)}`
                        : i18n.t('search.selectDateRange')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={theme.secondaryText} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Search Button */}
          <TouchableOpacity
            style={[styles.searchButton, (!hasData || isSearching) && { opacity: 0.5 }]}
            onPress={activeTab === 'tours' || !enableHotelSearch ? () => handleTourSearch() : handleHotelSearch}
            activeOpacity={0.8}
            disabled={isSearching || !hasData}
          >
            <View style={[styles.searchButtonGradient, { backgroundColor: theme.accent }]}>
              {isSearching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="search" size={22} color="#fff" />
                  <Text style={styles.searchButtonText}>
                    {activeTab === 'tours' || !enableHotelSearch ? i18n.t('search.findTours') : i18n.t('search.findHotels')}
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>

        </View>
      </View>

      {/* Bottom Sheet — Город вылета */}
      <Modal
        visible={showDepartureModal}
        {...transparentModalProps}
        animationType="slide"
        onRequestClose={() => setShowDepartureModal(false)}
      >
        <TouchableOpacity
          style={styles.bsOverlay}
          activeOpacity={1}
          onPress={() => setShowDepartureModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.bsSheet, { backgroundColor: theme.card, maxHeight: windowHeight * 0.72 }]}
            onPress={() => {}}
          >
            {/* Drag handle */}
            <View style={[styles.bsDragHandle, { backgroundColor: theme.border }]} />

            <View style={[styles.bsHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.bsTitle, { color: theme.text }]}>{i18n.t('search.selectDepartureCity')}</Text>
              <TouchableOpacity onPress={() => setShowDepartureModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={26} color={theme.secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.bsScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {departures.map((departure) => {
                const isSelected = tourSearch.departureId === departure.id.toString();
                return (
                  <TouchableOpacity
                    key={departure.id}
                    style={[
                      styles.bsItem,
                      { borderBottomColor: theme.border },
                      isSelected && { backgroundColor: theme.primary + '12' },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      const depIdStr = departure.id.toString();
                      updateTourSearch('departureId', depIdStr);
                      updateTourSearch('countryId', '');
                      setFilterRegionId('');
                      setHotelSearch(prev => ({ ...prev, countryId: '' }));
                      AsyncStorage.setItem(DEPARTURE_PREF_KEY, depIdStr).catch(() => {});
                      setShowDepartureModal(false);
                    }}
                  >
                    <View style={[styles.bsItemIcon, { backgroundColor: theme.primary + '15' }]}>
                      <Ionicons name="airplane" size={18} color={theme.primary} />
                    </View>
                    <Text style={[styles.bsItemText, { color: theme.text }, isSelected && { color: theme.primary, fontWeight: '700' }]}>
                      {departure.name}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Bottom Sheet — Страна */}
      {showCountryModal && <StatusBar hidden />}
      <Modal
        visible={showCountryModal}
        {...transparentModalProps}
        animationType="slide"
        onRequestClose={() => setShowCountryModal(false)}
      >
        <TouchableOpacity
          style={styles.bsOverlay}
          activeOpacity={1}
          onPress={() => setShowCountryModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.bsSheet, { backgroundColor: theme.card, maxHeight: windowHeight * 0.72 }]}
            onPress={() => {}}
          >
            {/* Drag handle */}
            <View style={[styles.bsDragHandle, { backgroundColor: theme.border }]} />

            <View style={[styles.bsHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.bsTitle, { color: theme.text }]}>{i18n.t('search.selectCountry')}</Text>
              <TouchableOpacity onPress={() => setShowCountryModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={26} color={theme.secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.bsScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {countries.map((country) => {
                const isSelected = activeTab === 'tours'
                  ? tourSearch.countryId === country.id.toString()
                  : hotelSearch.countryId === country.id.toString();
                return (
                  <TouchableOpacity
                    key={country.id}
                    style={[
                      styles.bsItem,
                      { borderBottomColor: theme.border },
                      isSelected && { backgroundColor: theme.primary + '12' },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (activeTab === 'tours') {
                        updateTourSearch('countryId', country.id.toString());
                        setFilterRegionId('');
                      } else {
                        updateHotelSearch('countryId', country.id.toString());
                      }
                      setShowCountryModal(false);
                    }}
                  >
                    <View style={[styles.bsItemIcon, { backgroundColor: theme.primary + '15' }]}>
                      <Ionicons name="globe" size={18} color={theme.primary} />
                    </View>
                    <Text style={[styles.bsItemText, { color: theme.text }, isSelected && { color: theme.primary, fontWeight: '700' }]}>
                      {country.name}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Date Range Calendar Modal */}
      <Modal
        visible={showDateModal}
        {...transparentModalProps}
        animationType="fade"
        onRequestClose={() => setShowDateModal(false)}
        hardwareAccelerated={true}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.card, height: windowHeight * 0.75 },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {activeTab === 'tours' ? i18n.t('search.selectTripDates') : i18n.t('search.selectStayDates')}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowDateModal(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <DateRangeCalendar
                onDateRangeSelect={(dateFrom, dateTo) => {
                  if (activeTab === 'tours') {
                    updateTourSearch('dateFrom', dateFrom);
                    updateTourSearch('dateTo', dateTo);
                  } else {
                    updateHotelSearch('checkIn', dateFrom);
                    updateHotelSearch('checkOut', dateTo);
                  }
                  // Не закрываем окно автоматически - пользователь сам решит когда закрыть
                }}
                onClose={() => setShowDateModal(false)}
                initialDateFrom={activeTab === 'tours' ? tourSearch.dateFrom : hotelSearch.checkIn}
                initialDateTo={activeTab === 'tours' ? tourSearch.dateTo : hotelSearch.checkOut}
                minDate={new Date()}
              />
            </View>
          </View>
        </View>
      </Modal>

      <TourSearchLoader
        visible={loaderVisible}
        percent={loaderPercent}
        message={loaderMessage}
        subMessage={loaderPercent >= 100 ? i18n.t('search.showingResults') : i18n.t('search.findingOffers')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  searchCard: {
    borderRadius: 16,
    padding: 18,
    ...shadows.cardRaised,
    borderWidth: 1,
    minHeight: 360,
  },
  compactForm: {
    gap: 12,
  },
  compactRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compactInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 0,
    gap: 10,
    minHeight: 58,
  },
  compactInputContent: {
    flex: 1,
  },
  compactLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  compactValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactInputText: {
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
    margin: 0,
    minWidth: 25,
    textAlign: 'left',
  },
  compactInputSuffix: {
    fontSize: 15,
    fontWeight: '600',
  },
  miniStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniStepperButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAgeInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 6,
  },
  searchForm: {
    gap: adaptive.spacing.medium,
  },
  inputGroup: {
    gap: adaptive.spacing.tiny,
  },
  inputLabel: {
    fontSize: adaptive.fontSize.caption(),
    fontWeight: '500',
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: adaptive.spacing.medium,
    borderWidth: 1,
    borderRadius: adaptive.borderRadius.medium,
    gap: adaptive.spacing.small,
  },
  pickerText: {
    flex: 1,
    fontSize: adaptive.fontSize.body(),
  },
  datesRow: {
    flexDirection: 'row',
    gap: adaptive.spacing.small,
  },
  dateInput: {
    flex: 1,
    padding: adaptive.spacing.medium,
    borderWidth: 1,
    borderRadius: adaptive.borderRadius.medium,
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: adaptive.fontSize.caption(),
    marginBottom: 2,
  },
  dateText: {
    fontSize: adaptive.fontSize.body(),
    fontWeight: '500',
  },
  passengersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: adaptive.spacing.medium,
  },
  passengerButton: {
    width: adaptive.iconSize.medium + adaptive.spacing.small * 2,
    height: adaptive.iconSize.medium + adaptive.spacing.small * 2,
    borderWidth: 1,
    borderRadius: adaptive.borderRadius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerCount: {
    fontSize: adaptive.fontSize.body(),
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'center',
  },
  searchButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
    ...shadows.buttonCta,
  },
  searchButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 58,
    paddingHorizontal: 24,
    gap: 10,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // ── Bottom Sheet ──────────────────────────────────────────────
  bsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  bsSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    ...shadows.cardRaised,
  },
  bsDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  bsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  bsTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  bsScroll: {
    flexGrow: 0,
  },
  bsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  bsItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bsItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  // ── Legacy modal (used by date picker) ────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalContent: {
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 500,
    ...shadows.cardRaised,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalScroll: {
    maxHeight: 400,
  },
  calendarContainer: {
    padding: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
  },
  loadingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 4,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filtersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  filtersToggleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  filtersBlock: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  filterRow: {
    gap: 8,
  },
});