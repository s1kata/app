/**
 * Экран поиска отелей (next-patch).
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  FlatList,
  Modal,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { dictionaryService } from '../services/DictionaryService';
import { hotelCacheService } from '../services/HotelCacheService';
import {
  HotelCompact,
  Country,
  Region,
  HotelSearchParams,
  PaginatedResponse,
  HotelGroupService,
  HotelService,
  TourSearchParams,
} from '../types/tourvisor';
import { platform } from '../utils/platform';
import { cacheService, CacheType } from '../services/CacheService';
import { searchHotelsAll, getHotelsPage } from '../hooks/useHotelSearch';
import { normalizeHotelImages, getHotelImageUrl } from '../utils/hotelImages';
import { hotelCategoryStarCount } from '../utils/hotelCategory';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import CachedImage from '../components/ui/CachedImage';
import { useHotelListDetailImages } from '../hooks/useHotelListDetailImages';
import { logger } from '../utils/logger';
import { i18n } from '../config/i18n';
import { radius, shadows } from '../config/designSystem';
import { hotelListPrice } from '../utils/hotelTourSearch';

interface ApiHotelSearchScreenProps {
  navigation: any;
  route: any;
}

export default function ApiHotelSearchScreen({ navigation, route }: ApiHotelSearchScreenProps) {
  const { apiReady, theme, isDark } = useAppContext();
  const { height: windowHeight } = useWindowDimensions();

  /**
   * Генерирует ключ кэша на основе параметров поиска отелей
   * Согласно документации Tourvisor API: /hotels поддерживает только countryId, regionId, category, types, rating, page, limit
   */
  const getCacheKeyFromParams = (params: HotelSearchParams): string => {
    const sortedTypes = params.types ? [...params.types].sort().join(',') : '';
    
    const keyParts = [
      params.countryId ? `cnt${params.countryId}` : '',
      params.regionId ? `reg${params.regionId}` : '',
      params.category ? `cat${params.category}` : '',
      params.rating ? `rat${params.rating}` : '',
      sortedTypes ? `types${sortedTypes}` : '',
      params.page ? `page${params.page}` : 'page1',
      params.limit ? `lim${params.limit}` : 'lim20',
    ].filter(Boolean);
    
    return `hotel_search_${keyParts.join('_')}`;
  };

  /**
   * Получает все отели из общего кэша
   */
  const getAllHotelsFromCache = async (): Promise<HotelCompact[]> => {
    try {
      const allHotels = await cacheService.get<HotelCompact[]>(CacheType.ALL_HOTELS, 'all_hotels', true);
      return allHotels || [];
    } catch (error) {
      logger.debug('[HotelSearch] Failed to get all hotels from cache:', error);
      return [];
    }
  };

  /**
   * Сохраняет отели в общий кэш (добавляет к существующим, убирая дубликаты)
   */
  const saveHotelsToGlobalCache = async (newHotels: HotelCompact[]): Promise<void> => {
    try {
      const existingHotels = await getAllHotelsFromCache();
      const existingIds = new Set(existingHotels.map(h => h.id));
      
      // Добавляем только новые отели (без дубликатов)
      const uniqueNewHotels = newHotels.filter(h => !existingIds.has(h.id));
      const allHotels = [...existingHotels, ...uniqueNewHotels];
      
      await cacheService.set(CacheType.ALL_HOTELS, 'all_hotels', allHotels);
      logger.debug(`[HotelSearch] Saved ${uniqueNewHotels.length} new hotels to global cache (total: ${allHotels.length})`);
    } catch (error) {
      logger.error('[HotelSearch] Failed to save hotels to global cache:', error);
    }
  };

  /**
   * Фильтрует отели из общего кэша по параметрам поиска
   */
  const filterHotelsByParams = (hotels: HotelCompact[], params: HotelSearchParams): HotelCompact[] => {
    return hotels.filter(hotel => {
      // Проверяем страну
      if (params.countryId && hotel.country.id !== params.countryId) return false;
      
      // Проверяем регион
      if (params.regionId && hotel.region.id !== params.regionId) return false;
      
      // Проверяем категорию
      if (params.category && hotel.category < params.category) return false;
      
      // Проверяем рейтинг
      if (params.rating && hotel.rating < params.rating) return false;
      
      // Проверяем типы отелей
      if (params.types && params.types.length > 0) {
        if (!params.types.includes(hotel.type)) return false;
      }
      
      // Проверяем услуги (это сложнее, так как услуги могут быть в разных форматах)
      // Пока пропускаем проверку услуг, так как структура может отличаться
      
      return true;
    });
  };

  // Search parameters
  // Согласно документации Tourvisor API: countryId является обязательным параметром
  // page (default: 1), limit (default: 20) согласно документации
  const [searchParams, setSearchParams] = useState<HotelSearchParams>({
    page: 1,
    limit: 20,
  });

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hotels, setHotels] = useState<HotelCompact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastSearchParams, setLastSearchParams] = useState<string>('');
  const [hasFailedOnce, setHasFailedOnce] = useState(false); // Флаг для остановки после первой неудачи
  

  // Dictionary data
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [hotelTypes, setHotelTypes] = useState<any[]>([]);
  const [hotelServices, setHotelServices] = useState<HotelGroupService[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showRatingPicker, setShowRatingPicker] = useState(false);
  const [showServicesPicker, setShowServicesPicker] = useState(false);

  const regionsRequestGen = useRef(0);
  const hotelTypesRequestGen = useRef(0);
  const hotelServicesRequestGen = useRef(0);

  const hotelDetailImages = useHotelListDetailImages(
    hotels,
    !isLoading && hotels.length > 0 && apiReady
  );

  const tourContext = (route?.params?.tourContext || {}) as Partial<TourSearchParams>;

  const handleHotelPress = useCallback(
    (hotel: HotelCompact) => {
      hotelCacheService.set(hotel.id, hotel);
      navigation.navigate('ApiHotelDetails', {
        hotelId: hotel.id,
        hotelPreview: hotel,
        tourContext,
      });
    },
    [navigation, tourContext]
  );

  const handleOpenTours = useCallback(
    (hotel: HotelCompact) => {
      // Hotel-first: сначала хаб отеля с турами, не общий search results
      hotelCacheService.set(hotel.id, hotel);
      navigation.navigate('ApiHotelDetails', {
        hotelId: hotel.id,
        hotelPreview: hotel,
        tourContext,
        focusTours: true,
      });
    },
    [navigation, tourContext]
  );

  const loadDictionaryData = useCallback(async (isCancelled?: () => boolean) => {
    const dead = () => isCancelled?.() === true;
    try {
      logger.debug('[HotelSearch] Loading countries...');
      let countriesData: Country[] = [];
      
      try {
        countriesData = await dictionaryService.getCountriesAll();
        logger.debug(`[HotelSearch] Loaded ${countriesData.length} countries`);
      } catch (error: any) {
        logger.warn('[HotelSearch] Failed to load countries:', error?.message);
        countriesData = [];
      }
      if (dead()) return;
      
      if (countriesData.length > 0) {
        setCountries(countriesData);
        logger.debug(`[HotelSearch] Countries set in state. First country: ${countriesData[0]?.name}`);
      } else {
        logger.warn('[HotelSearch] No countries loaded. Search functionality may be limited.');
        setCountries([]);
      }
    } catch (error) {
      logger.error('[HotelSearch] Failed to load countries:', error);
      if (!dead()) setCountries([]);
    }
  }, []);

  // Load dictionary data on mount - только один раз при первой загрузке
  useEffect(() => {
    if (!apiReady || !isInitialLoad) return;
    let cancelled = false;
    const run = async () => {
      await loadDictionaryData(() => cancelled);
      if (!cancelled) setIsInitialLoad(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiReady, isInitialLoad, loadDictionaryData]);

  // Обработка параметров из route.params (когда переходим с главного экрана)
  useEffect(() => {
    if (route?.params?.searchParams && apiReady) {
      const params = route.params.searchParams;
      logger.debug('[HotelSearch] Received search params from route:', params);
      
      // Применяем параметры из route (только те, что есть в HotelSearchParams)
      // checkIn, checkOut, adults, rooms не используются в API поиска отелей
      const newParams: HotelSearchParams = {
        countryId: params.countryId,
        regionId: params.regionId,
        category: params.category,
        rating: params.rating,
        types: params.types,
        page: 1,
        limit: 20,
      };
      
      logger.debug('[HotelSearch] Setting search params:', newParams);
      setSearchParams(newParams);
      setHasFailedOnce(false);
      setLastSearchParams('');
    }
  }, [route?.params?.searchParams, apiReady]);

  // Автозагрузка при смене страны/фильтров (в т.ч. после перехода с главной)
  useEffect(() => {
    if (!apiReady || isInitialLoad) return;
    if (!searchParams.countryId) return;
    const key = getCacheKeyFromParams(searchParams);
    if (key === lastSearchParams) return;
    setLastSearchParams(key);
    void loadHotels(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadHotels замыкается на актуальные params
  }, [apiReady, isInitialLoad, searchParams.countryId, searchParams.regionId, searchParams.category, searchParams.rating]);

  // Загружаем регионы при выборе страны (отмена устаревших ответов при смене countryId)
  useEffect(() => {
    if (!searchParams.countryId) {
      regionsRequestGen.current += 1;
      setRegions([]);
      return;
    }
    const gen = ++regionsRequestGen.current;
    (async () => {
      try {
        const regionsData = await dictionaryService.getRegions(searchParams.countryId!);
        if (gen !== regionsRequestGen.current) return;
        setRegions(regionsData);
      } catch (error) {
        logger.error('Failed to load regions:', error);
        if (gen === regionsRequestGen.current) setRegions([]);
      }
    })();
  }, [searchParams.countryId]);

  // Load hotel types when country is selected
  useEffect(() => {
    if (!searchParams.countryId) {
      hotelTypesRequestGen.current += 1;
      setHotelTypes([]);
      return;
    }
    const gen = ++hotelTypesRequestGen.current;
    const countryId = searchParams.countryId;
    (async () => {
      try {
        const typesData = await dictionaryService.getHotelTypes(countryId);
        if (gen !== hotelTypesRequestGen.current) return;
        setHotelTypes(typesData);
      } catch (error) {
        logger.error('Failed to load hotel types:', error);
        if (gen === hotelTypesRequestGen.current) setHotelTypes([]);
      }
    })();
  }, [searchParams.countryId]);

  // Load hotel services when country or region is selected
  useEffect(() => {
    if (!searchParams.countryId) {
      hotelServicesRequestGen.current += 1;
      setHotelServices([]);
      return;
    }
    const gen = ++hotelServicesRequestGen.current;
    const countryId = searchParams.countryId;
    const regionId = searchParams.regionId;
    (async () => {
      try {
        const servicesData = await dictionaryService.getHotelGroupServices(
          countryId,
          regionId ? [regionId] : undefined
        );
        if (gen !== hotelServicesRequestGen.current) return;
        setHotelServices(servicesData);
      } catch (error) {
        logger.error('Failed to load hotel services:', error);
        if (gen === hotelServicesRequestGen.current) setHotelServices([]);
      }
    })();
  }, [searchParams.countryId, searchParams.regionId]);

  const loadHotels = async (reset: boolean = false) => {
    if (hasFailedOnce && !reset) return;
    if (isLoading || (isLoadingMore && !reset)) return;
    if (!searchParams.countryId) {
      if (reset) {
        setHotels([]);
        setTotalCount(0);
        setHasMore(false);
      }
      return;
    }

    const pageToLoad = reset ? 1 : Math.max(1, searchParams.page || 1);
    const limit = 20;

    if (reset) {
      setIsLoading(true);
      setHasFailedOnce(false);
      setSearchParams((prev) => ({ ...prev, page: 1, limit }));
    } else {
      setIsLoadingMore(true);
    }

    try {
      const params: HotelSearchParams = {
        countryId: searchParams.countryId,
        page: pageToLoad,
        limit,
      };
      if (searchParams.regionId) params.regionId = searchParams.regionId;
      if (searchParams.category) params.category = searchParams.category;
      if (searchParams.types?.length) params.types = searchParams.types;
      if (searchParams.rating) params.rating = searchParams.rating;

      // GET /hotels = каталог (без цен). enrich на бэке подтягивает фото через /hotels/{id}.
      // Цены — только через поиск туров (см. api.tourvisor.ru/search/docs).
      const response = await getHotelsPage(params);
      const pageHotels = (response.data || []).map((hotel) =>
        normalizeHotelImages({ ...hotel }) as HotelCompact
      );

      if (reset) {
        setHotels(pageHotels);
      } else {
        setHotels((prev) => {
          const seen = new Set(prev.map((h) => h.id));
          return [...prev, ...pageHotels.filter((h) => !seen.has(h.id))];
        });
      }

      const total = response.total || pageHotels.length;
      const totalPages = Math.max(1, response.totalPages || Math.ceil(total / limit));
      setTotalCount(total);
      const nextPage = pageToLoad + 1;
      setHasMore(pageToLoad < totalPages && pageHotels.length > 0);
      setSearchParams((prev) => ({ ...prev, page: nextPage, limit }));
      setHasFailedOnce(false);
    } catch (error) {
      logger.error('[HotelSearch] load failed:', error);
      if (reset) {
        setHotels([]);
        setTotalCount(0);
      }
      setHasFailedOnce(true);
      setHasMore(false);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadMoreHotels = () => {
    // Не загружаем больше, если уже была неудача
    if (hasFailedOnce) {
      return;
    }
    if (!isLoadingMore && hasMore) {
      loadHotels();
    }
  };

  const handleSearchHotels = () => {
    if (!searchParams.countryId) {
      Alert.alert('Ошибка', 'Выберите страну для поиска отелей');
      return;
    }
    setHasFailedOnce(false);
    setLastSearchParams('');
    void loadHotels(true);
  };

  const updateSearchParam = <K extends keyof HotelSearchParams>(
    key: K,
    value: HotelSearchParams[K]
  ) => {
    setSearchParams(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const filteredHotels = useMemo(
    () =>
      hotels.filter(
        hotel =>
          searchQuery === '' ||
          hotel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          hotel.region.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [hotels, searchQuery]
  );

  const selectedCountry = countries.find(c => c.id === searchParams.countryId);
  const selectedRegion = regions.find(r => r.id === searchParams.regionId);

  // Подсчет активных фильтров
  const activeFiltersCount = [
    searchParams.countryId,
    searchParams.regionId,
    searchParams.category,
    searchParams.rating,
    searchParams.types && searchParams.types.length > 0,
    searchParams.hotelServices && searchParams.hotelServices.length > 0,
  ].filter(Boolean).length;

  const summaryLabel = useMemo(() => {
    const parts: string[] = [];
    if (selectedCountry?.name) parts.push(selectedCountry.name);
    if (selectedRegion?.name) parts.push(selectedRegion.name);
    if (searchParams.category) parts.push(`${searchParams.category}★+`);
    return parts.length > 0 ? parts.join(' · ') : 'Выберите направление';
  }, [selectedCountry, selectedRegion, searchParams.category]);

  // Панель результатов: сводка + поиск по названию + быстрые звёзды (без повторной кнопки «Найти»)
  const renderResultsToolbar = () => (
    <View style={styles.filtersContainer}>
      <TouchableOpacity
        style={[
          styles.summaryBar,
          { backgroundColor: theme.secondaryBackground, borderColor: theme.border },
        ]}
        onPress={() => setShowFiltersModal(true)}
        activeOpacity={0.75}
      >
        <Ionicons name="location" size={18} color={theme.primary} />
        <View style={styles.summaryBarTextWrap}>
          <Text style={[styles.summaryBarTitle, { color: theme.text }]} numberOfLines={1}>
            {summaryLabel}
          </Text>
          <Text style={[styles.summaryBarHint, { color: theme.secondaryText }]}>
            Изменить поиск
          </Text>
        </View>
        <Ionicons name="create-outline" size={18} color={theme.secondaryText} />
      </TouchableOpacity>

      <View
        style={[
          styles.searchWrapper,
          { backgroundColor: theme.secondaryBackground, borderColor: theme.border },
        ]}
      >
        <Ionicons name="search" size={16} color={theme.primary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Поиск по названию..."
          placeholderTextColor={theme.secondaryText}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={16} color={theme.secondaryText} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filtersRow}>
        <TouchableOpacity
          style={[
            styles.filtersButton,
            {
              backgroundColor: theme.secondaryBackground,
              borderColor: theme.border,
            },
          ]}
          onPress={() => setShowFiltersModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="options" size={16} color={theme.primary} />
          <Text style={[styles.filtersButtonText, { color: theme.text }]}>Фильтры</Text>
          {activeFiltersCount > 0 && (
            <View style={[styles.filtersBadge, { backgroundColor: theme.primary }]}>
              <Text style={styles.filtersBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.categoryButtons}>
          {[3, 4, 5].map((category) => {
            const selected = searchParams.category === category;
            return (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryButtonCompact,
                  {
                    backgroundColor: selected ? theme.primary : theme.secondaryBackground,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() =>
                  updateSearchParam('category', selected ? undefined : category)
                }
                activeOpacity={0.7}
              >
                {Array.from({ length: category }, (_, i) => (
                  <Ionicons
                    key={i}
                    name="star"
                    size={10}
                    color={selected ? '#fff' : '#E8B923'}
                  />
                ))}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  // Рендер всех фильтров в модальном окне
  const renderFiltersModal = () => (
    <Modal
      visible={showFiltersModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowFiltersModal(false)}
    >
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
          {/* Заголовок модального окна */}
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Фильтры</Text>
            <TouchableOpacity
              onPress={() => setShowFiltersModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Контент модального окна */}
          <ScrollView
            style={[styles.modalScroll, { maxHeight: windowHeight * 0.7 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Выбор страны */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Страна</Text>
              <TouchableOpacity
                style={[styles.modalSelector, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}
                onPress={() => {
                  setShowCountryPicker(!showCountryPicker);
                  setShowRegionPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="earth" size={18} color={theme.primary} />
                <Text style={[styles.modalSelectorText, { color: theme.text }]}>
                  {selectedCountry ? selectedCountry.name : 'Все страны'}
                </Text>
                <Ionicons
                  name={showCountryPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#6E6E73"
                />
              </TouchableOpacity>

              {showCountryPicker && (
                <View style={styles.modalDropdown}>
                  <TouchableOpacity
                    style={styles.dropdownOption}
                    onPress={() => {
                      setSearchParams(prev => ({
                        ...prev,
                        countryId: undefined,
                        regionId: undefined,
                        page: 1
                      }));
                      setShowCountryPicker(false);
                      setRegions([]);
                      setLastSearchParams(''); // Сбрасываем кэш для принудительной перезагрузки
                      setHasFailedOnce(false); // Сбрасываем флаг неудачи
                      setHotels([]); // Очищаем список отелей перед загрузкой
                      setIsLoading(true); // Устанавливаем состояние загрузки
                      // Принудительно загружаем отели для всех стран
                      setTimeout(() => {
                        loadHotels(true);
                      }, 100);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>Все страны</Text>
                  </TouchableOpacity>
                  {countries.length > 0 ? (
                    countries.slice(0, 50).map(country => (
                      <TouchableOpacity
                        key={country.id}
                        style={styles.dropdownOption}
                        onPress={() => {
                          updateSearchParam('countryId', country.id);
                          updateSearchParam('regionId', undefined);
                          setShowCountryPicker(false);
                          setTimeout(() => {
                            if (country.id) {
                              dictionaryService.getRegions(country.id).then(setRegions).catch((e) => logger.error('[HotelSearch] getRegions:', e));
                            }
                          }, 100);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>{country.name}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.dropdownOption}>
                      <Text style={[styles.dropdownOptionText, { color: '#8E8E93' }]}>
                        Загрузка стран...
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Выбор региона */}
            {searchParams.countryId && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Регион</Text>
                <TouchableOpacity
                  style={[
                    styles.modalSelector,
                    {
                      backgroundColor: theme.secondaryBackground,
                      borderColor: theme.border,
                      opacity: regions.length === 0 ? 0.6 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (regions.length > 0) {
                      setShowRegionPicker(!showRegionPicker);
                      setShowCountryPicker(false);
                    }
                  }}
                  activeOpacity={0.7}
                  disabled={regions.length === 0}
                >
                  <Ionicons name="location" size={18} color={theme.primary} />
                  <Text style={[styles.modalSelectorText, { color: theme.text }, regions.length === 0 && styles.selectorTextDisabled]}>
                    {selectedRegion ? selectedRegion.name : regions.length > 0 ? 'Все регионы' : 'Загрузка...'}
                  </Text>
                  {regions.length > 0 && (
                    <Ionicons
                      name={showRegionPicker ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="#6E6E73"
                    />
                  )}
                </TouchableOpacity>

                {showRegionPicker && regions.length > 0 && (
                  <View style={styles.modalDropdown}>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        updateSearchParam('regionId', undefined);
                        setShowRegionPicker(false);
                      }}
                    >
                      <Text style={styles.dropdownOptionText}>Все регионы</Text>
                    </TouchableOpacity>
                    {regions.slice(0, 30).map(region => (
                      <TouchableOpacity
                        key={region.id}
                        style={styles.dropdownOption}
                        onPress={() => {
                          updateSearchParam('regionId', region.id);
                          setShowRegionPicker(false);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>{region.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Фильтр по категории */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Категория отеля</Text>
              <View style={styles.modalCategoryButtons}>
                {[3, 4, 5].map(category => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.modalCategoryButton,
                      searchParams.category === category && {
                        backgroundColor: theme.primary,
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => updateSearchParam('category', searchParams.category === category ? undefined : category)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {Array.from({ length: category }, (_, i) => (
                        <Ionicons key={i} name="star" size={14} color={searchParams.category === category ? "#fff" : "#FFD700"} />
                      ))}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Фильтр по рейтингу */}
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Рейтинг</Text>
              <TouchableOpacity
                style={styles.modalSelector}
                onPress={() => {
                  setShowRatingPicker(!showRatingPicker);
                  setShowCountryPicker(false);
                  setShowRegionPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="star-outline" size={18} color="#0066CC" />
                <Text style={styles.modalSelectorText}>
                  {searchParams.rating
                    ? `Рейтинг: ${searchParams.rating === 0 ? 'Любой' : searchParams.rating === 2 ? '3.0+' : searchParams.rating === 3 ? '3.5+' : searchParams.rating === 4 ? '4.0+' : '4.5+'}`
                    : 'Рейтинг: Любой'}
                </Text>
                <Ionicons
                  name={showRatingPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#6E6E73"
                />
              </TouchableOpacity>

              {showRatingPicker && (
                <View style={styles.modalDropdown}>
                  <TouchableOpacity
                    style={styles.dropdownOption}
                    onPress={() => {
                      updateSearchParam('rating', undefined);
                      setShowRatingPicker(false);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>Любой рейтинг</Text>
                  </TouchableOpacity>
                  {[
                    { value: 2, label: '3.0 и выше' },
                    { value: 3, label: '3.5 и выше' },
                    { value: 4, label: '4.0 и выше' },
                    { value: 5, label: '4.5 и выше' },
                  ].map(rating => (
                    <TouchableOpacity
                      key={rating.value}
                      style={[
                        styles.dropdownOption,
                        searchParams.rating === rating.value && styles.dropdownOptionSelected
                      ]}
                      onPress={() => {
                        updateSearchParam('rating', searchParams.rating === rating.value ? undefined : rating.value);
                        setShowRatingPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownOptionText,
                        searchParams.rating === rating.value && styles.dropdownOptionTextSelected
                      ]}>
                        {rating.label}
                        {searchParams.rating === rating.value && ' ✓'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Фильтр по типу отеля */}
            {searchParams.countryId && hotelTypes.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Тип отеля</Text>
                <TouchableOpacity
                  style={styles.modalSelector}
                  onPress={() => {
                    setShowTypePicker(!showTypePicker);
                    setShowCountryPicker(false);
                    setShowRegionPicker(false);
                    setShowRatingPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="business-outline" size={18} color="#0066CC" />
                  <Text style={styles.modalSelectorText}>
                    {searchParams.types && searchParams.types.length > 0
                      ? `${searchParams.types.length} тип${searchParams.types.length > 1 ? 'а' : ''}`
                      : 'Все типы отелей'}
                  </Text>
                  <Ionicons
                    name={showTypePicker ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#6E6E73"
                  />
                </TouchableOpacity>

                {showTypePicker && (
                  <View style={styles.modalDropdown}>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        updateSearchParam('types', undefined);
                        setShowTypePicker(false);
                      }}
                    >
                      <Text style={styles.dropdownOptionText}>Все типы</Text>
                    </TouchableOpacity>
                    {hotelTypes.map(type => {
                      const isSelected = searchParams.types?.includes(type.id);
                      return (
                        <TouchableOpacity
                          key={type.id}
                          style={[
                            styles.dropdownOption,
                            isSelected && styles.dropdownOptionSelected
                          ]}
                          onPress={() => {
                            const currentTypes = searchParams.types || [];
                            const newTypes = isSelected
                              ? currentTypes.filter(t => t !== type.id)
                              : [...currentTypes, type.id];
                            updateSearchParam('types', newTypes.length > 0 ? newTypes : undefined);
                          }}
                        >
                          <Text style={[
                            styles.dropdownOptionText,
                            isSelected && styles.dropdownOptionTextSelected
                          ]}>
                            {type.name}
                            {isSelected && ' ✓'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Фильтр по услугам */}
            {searchParams.countryId && hotelServices.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Услуги отелей</Text>
                <TouchableOpacity
                  style={styles.modalSelector}
                  onPress={() => {
                    setShowServicesPicker(!showServicesPicker);
                    setShowCountryPicker(false);
                    setShowRegionPicker(false);
                    setShowTypePicker(false);
                    setShowRatingPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="list-outline" size={18} color="#0066CC" />
                  <Text style={styles.modalSelectorText}>
                    {searchParams.hotelServices && searchParams.hotelServices.length > 0
                      ? `${searchParams.hotelServices.length} услуг${searchParams.hotelServices.length > 1 ? 'и' : 'а'}`
                      : 'Все услуги'}
                  </Text>
                  <Ionicons
                    name={showServicesPicker ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#6E6E73"
                  />
                </TouchableOpacity>

                {showServicesPicker && (
                  <View style={[styles.modalDropdown, { maxHeight: 300 }]}>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => {
                        updateSearchParam('hotelServices', undefined);
                        setShowServicesPicker(false);
                      }}
                    >
                      <Text style={styles.dropdownOptionText}>Все услуги</Text>
                    </TouchableOpacity>
                    {hotelServices.map((serviceGroup, groupIndex) => (
                      <View key={groupIndex}>
                        <View style={styles.serviceGroupHeader}>
                          <Text style={styles.serviceGroupTitle}>{serviceGroup.name}</Text>
                        </View>
                        {serviceGroup.items?.map((service: HotelService) => {
                          const isSelected = searchParams.hotelServices?.includes(service.id);
                          return (
                            <TouchableOpacity
                              key={service.id}
                              style={[
                                styles.dropdownOption,
                                styles.serviceOption,
                                isSelected && styles.dropdownOptionSelected
                              ]}
                              onPress={() => {
                                const currentServices = searchParams.hotelServices || [];
                                const newServices = isSelected
                                  ? currentServices.filter((s: number) => s !== service.id)
                                  : [...currentServices, service.id];
                                updateSearchParam('hotelServices', newServices.length > 0 ? newServices : undefined);
                              }}
                            >
                              <Text style={[
                                styles.dropdownOptionText,
                                isSelected && styles.dropdownOptionTextSelected
                              ]}>
                                {service.name}
                                {isSelected && ' ✓'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Кнопки действий */}
          <View style={[styles.modalActions, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
            <TouchableOpacity
              style={[styles.modalResetButton, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}
              onPress={() => {
                // Страну не сбрасываем — API требует countryId
                updateSearchParam('regionId', undefined);
                updateSearchParam('category', undefined);
                updateSearchParam('rating', undefined);
                updateSearchParam('types', undefined);
                updateSearchParam('hotelServices', undefined);
              }}
            >
              <Text style={[styles.modalResetText, { color: theme.text }]}>Сбросить</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalApplyButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                setShowFiltersModal(false);
                if (searchParams.countryId) {
                  setHasFailedOnce(false);
                  setLastSearchParams('');
                  void loadHotels(true);
                }
              }}
            >
              <Text style={styles.modalApplyText}>Показать</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderHotelItem = ({ item }: { item: HotelCompact }) => {
    const hotelImage =
      hotelDetailImages[item.id] || getHotelImageUrl(item as never) || DEFAULT_HOTEL_IMAGE;
    const starCount = hotelCategoryStarCount(item.category);
    const snippet =
      item.descriptionSnippet ||
      (item as { common?: { description?: string } }).common?.description ||
      '';
    const cleanSnippet = snippet
      ? String(snippet)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';

    return (
      <View style={[styles.hotelCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity onPress={() => handleHotelPress(item)} activeOpacity={0.85}>
          <View style={styles.hotelImageContainer}>
            <CachedImage
              source={hotelImage}
              style={styles.hotelImage}
              recyclingKey={`hotel-search-${item.id}`}
            />
            {item.rating > 0 && (
              <View style={[styles.ratingBadgeOverlay, { backgroundColor: theme.primary }]}>
                <Ionicons name="star" size={12} color="#fff" />
                <Text style={styles.ratingTextOverlay}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>

          <View style={styles.hotelContent}>
            <Text style={[styles.hotelNamePlain, { color: theme.text }]} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={styles.hotelMetaRow}>
              {starCount > 0 && (
                <View style={styles.starsRow}>
                  {Array.from({ length: starCount }, (_, i) => (
                    <Ionicons key={i} name="star" size={12} color="#E8B923" />
                  ))}
                </View>
              )}
              <Text
                style={[styles.hotelLocationPlain, { color: theme.secondaryText }]}
                numberOfLines={1}
              >
                {item.region?.name}
                {item.subRegion ? `, ${item.subRegion.name}` : ''}
                {item.country?.name ? ` · ${item.country.name}` : ''}
              </Text>
            </View>
            {cleanSnippet ? (
              <Text
                style={[styles.hotelSnippet, { color: theme.secondaryText }]}
                numberOfLines={2}
              >
                {cleanSnippet}
              </Text>
            ) : null}
            {(() => {
              const price = hotelListPrice(item);
              return (
                <Text
                  style={[
                    styles.hotelPriceHint,
                    { color: price > 0 ? theme.primary : theme.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {price > 0
                    ? `от ${price.toLocaleString('ru-RU')} ₽`
                    : 'Выберите отель — цены в турах'}
                </Text>
              );
            })()}
          </View>
        </TouchableOpacity>

        <View style={styles.hotelCardActions}>
          <TouchableOpacity
            style={[styles.hotelSecondaryBtn, { borderColor: theme.border }]}
            onPress={() => handleHotelPress(item)}
            activeOpacity={0.8}
          >
            <Text style={[styles.hotelSecondaryBtnText, { color: theme.text }]}>Об отеле</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.hotelPrimaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => handleOpenTours(item)}
            activeOpacity={0.85}
          >
            <Ionicons name="airplane-outline" size={16} color="#fff" />
            <Text style={styles.hotelPrimaryBtnText}>Смотреть туры</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View>
      <View style={[styles.filtersWrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {renderResultsToolbar()}
      </View>
      {!isLoading && searchParams.countryId ? (
        <Text style={[styles.resultsText, { color: theme.secondaryText, marginHorizontal: 16, marginTop: 12 }]}>
          {searchQuery
            ? `Найдено: ${filteredHotels.length}`
            : totalCount > 0
              ? `Отелей: ${totalCount.toLocaleString('ru-RU')}`
              : filteredHotels.length > 0
                ? `Показано: ${filteredHotels.length}`
                : ''}
        </Text>
      ) : null}
    </View>
  );

  const listEmpty = () => {
    if (isLoading || isInitialLoad) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.emptyStateText, { color: theme.secondaryText, marginTop: 12 }]}>
            Ищем отели…
          </Text>
        </View>
      );
    }
    if (!searchParams.countryId) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="bed-outline" size={48} color={theme.secondaryText} />
          <Text style={[styles.emptyStateTitle, { color: theme.text }]}>Выберите страну</Text>
          <Text style={[styles.emptyStateText, { color: theme.secondaryText }]}>
            Откройте фильтры и укажите направление
          </Text>
          <TouchableOpacity
            style={[styles.emptyCta, { backgroundColor: theme.primary }]}
            onPress={() => setShowFiltersModal(true)}
          >
            <Text style={styles.emptyCtaText}>Открыть фильтры</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={48} color={theme.secondaryText} />
        <Text style={[styles.emptyStateTitle, { color: theme.text }]}>Ничего не найдено</Text>
        <Text style={[styles.emptyStateText, { color: theme.secondaryText }]}>
          Измените курорт, звёзды или сбросьте фильтры
        </Text>
        <TouchableOpacity
          style={[styles.emptyCta, { backgroundColor: theme.primary }]}
          onPress={() => setShowFiltersModal(true)}
        >
          <Text style={styles.emptyCtaText}>Изменить фильтры</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (!apiReady) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar style="dark" />
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline" size={48} color="#8E8E93" />
          <Text style={styles.emptyStateTitle}>API не настроен</Text>
          <Text style={styles.emptyStateText}>
            Проверьте настройки JWT токена
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Отели</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setShowFiltersModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredHotels}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderHotelItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.loadingMoreText, { color: theme.secondaryText }]}>Ещё отели…</Text>
            </View>
          ) : null
        }
        contentContainerStyle={[
          styles.listContent,
          filteredHotels.length === 0 ? { flexGrow: 1 } : null,
        ]}
        onEndReached={loadMoreHotels}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />

      {isLoading && filteredHotels.length > 0 ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : null}

      {renderFiltersModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor убран - используется динамический через inline стиль
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    // backgroundColor убран - используется динамический через inline стиль
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
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
    color: '#1D1D1F',
    flex: 1,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 40,
    justifyContent: 'flex-end',
  },
  headerButton: {
    padding: 8,
  },
  formScroll: {
    flexGrow: 1,
  },
  searchButtonBlock: {
    padding: 20,
    paddingTop: 24,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  searchHint: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  filtersWrapper: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  filtersContainer: {
    gap: 8,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor убран - используется динамический через inline стиль
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    // borderColor убран - используется динамический через inline стиль
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    // color убран - используется динамический через inline стиль
    padding: 0,
  },
  clearButton: {
    padding: 2,
  },
  selectorCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    gap: 6,
    flex: 1,
    minWidth: 100,
  },
  selectorTextCompact: {
    flex: 1,
    fontSize: 13,
    color: '#1D1D1F',
    fontWeight: '500',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    gap: 8,
  },
  selectorText: {
    flex: 1,
    fontSize: 16,
    color: '#1D1D1F',
    fontWeight: '500',
  },
  selectorTextDisabled: {
    color: '#8E8E93',
  },
  dropdown: {
    // backgroundColor убран - используется динамический через inline стиль
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginTop: 4,
    maxHeight: 200,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#1D1D1F',
  },
  dropdownOptionSelected: {
    backgroundColor: '#F0F7FF',
  },
  dropdownOptionTextSelected: {
    color: '#0066CC',
    fontWeight: '600',
  },
  serviceGroupHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  serviceGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
  serviceOption: {
    paddingLeft: 32,
  },
  categoryButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  resultsHeader: {
    marginBottom: 12,
  },
  resultsText: {
    fontSize: 14,
    // color убран - используется динамический через inline стиль
    fontWeight: '500',
  },
  hotelCard: {
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  hotelImageContainer: {
    width: '100%',
    height: 168,
    position: 'relative',
    backgroundColor: '#E5E5E5',
  },
  hotelImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E5E5',
  },
  hotelImagePlaceholder: {
    width: '100%',
    height: '100%',
    // backgroundColor убран - используется динамический через inline стиль
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  categoryBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  ratingBadgeOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundcolor: '#0066CC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  ratingTextOverlay: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  hotelImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 24,
  },
  hotelNameOverlay: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hotelLocationOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hotelLocationTextOverlay: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '500',
    flex: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hotelContent: {
    padding: 20,
    // backgroundColor убран - используется динамический через inline стиль
  },
  hotelInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  hotelCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F7FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  categoryTextBadge: {
    fontSize: 14,
    color: '#0066CC',
    fontWeight: '600',
  },
  hotelCountryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countryText: {
    fontSize: 14,
    color: '#6E6E73',
    fontWeight: '500',
  },
  hotelActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F7FF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  hotelActionText: {
    fontSize: 16,
    color: '#0066CC',
    fontWeight: '700',
  },
  filtersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 6,
    position: 'relative',
  },
  filtersButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryBarTextWrap: {
    flex: 1,
    gap: 2,
  },
  summaryBarTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  summaryBarHint: {
    fontSize: 12,
    fontWeight: '500',
  },
  hotelNamePlain: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  hotelMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  hotelLocationPlain: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  hotelSnippet: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  hotelPriceHint: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  hotelCardActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  hotelSecondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotelSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  hotelPrimaryBtn: {
    flex: 1.2,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  hotelPrimaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyCta: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  categoryButtonCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  filtersBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  filtersBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#0066CC',
  },
  filterChipText: {
    fontSize: 12,
    color: '#0066CC',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    ...shadows.cardRaised,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D1D1F',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScroll: {},
  modalSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 12,
  },
  modalSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    gap: 10,
  },
  modalSelectorText: {
    flex: 1,
    fontSize: 16,
    color: '#1D1D1F',
    fontWeight: '500',
  },
  modalDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginTop: 8,
    maxHeight: 200,
    backgroundColor: '#FFFFFF',
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  modalCategoryButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCategoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  modalResetButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
  },
  modalResetText: {
    fontSize: 16,
    color: '#6E6E73',
    fontWeight: '600',
  },
  modalApplyButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0066CC',
    alignItems: 'center',
  },
  modalApplyText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },
  loadingMore: {
    padding: 16,
    alignItems: 'center',
  },
  loadingMoreText: {
    fontSize: 14,
    color: '#6E6E73',
    marginTop: 8,
  },
});
