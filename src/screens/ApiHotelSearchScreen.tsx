/**
 * Экран отелей: не зарегистрирован в AppNavigator в текущем релизе (см. releaseUiFlags).
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
  Modal,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { dictionaryService } from '../services/DictionaryService';
import { tourvisorApi } from '../services/TourvisorApiService';
import { hotelCacheService } from '../services/HotelCacheService';
import {
  HotelCompact,
  Country,
  Region,
  HotelSearchParams,
  PaginatedResponse,
  HotelGroupService,
  HotelService,
} from '../types/tourvisor';
import { platform } from '../utils/platform';
import { cacheService, CacheType } from '../services/CacheService';
import { searchHotelsAll } from '../hooks/useHotelSearch';
import { normalizeHotelImages, getHotelImageUrl } from '../utils/hotelImages';
import { hotelCategoryStarCount } from '../utils/hotelCategory';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import CachedImage from '../components/ui/CachedImage';
import { useHotelListDetailImages } from '../hooks/useHotelListDetailImages';
import { logger } from '../utils/logger';
import { i18n } from '../config/i18n';
import { radius, shadows } from '../config/designSystem';

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

  const handleHotelPress = useCallback(
    (hotel: HotelCompact) => {
      hotelCacheService.set(hotel.id, hotel);
      navigation.navigate('ApiHotelDetails', { hotelId: hotel.id, hotelPreview: hotel });
    },
    [navigation]
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
        page: 1,
        limit: 20,
      };
      
      logger.debug('[HotelSearch] Setting search params:', newParams);
      setSearchParams(newParams);
    }
  }, [route?.params?.searchParams, apiReady]);

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
    // Если уже была неудача, не делаем новые запросы
    if (hasFailedOnce && !reset) {
      return;
    }

    // Предотвращаем множественные одновременные запросы
    if (isLoading || (isLoadingMore && !reset)) {
      return;
    }

    // Валидация: согласно документации Tourvisor API, countryId является обязательным параметром для метода /hotels
    // Если countryId не указан и это не поиск по всем странам, прекращаем выполнение
    if (!searchParams.countryId && reset) {
      logger.warn('[HotelSearch] countryId is required according to Tourvisor API documentation. Cannot load hotels without country.');
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    // Генерируем ключ кэша на основе параметров поиска
    const cacheKey = getCacheKeyFromParams(searchParams);

    try {
      if (reset) {
        setIsLoading(true);
        setHotels([]);
        setSearchParams(prev => ({ ...prev, page: 1 }));
        setHasFailedOnce(false);

        // Загружаем все отели по выбранным фильтрам сразу (все страницы)
        if (searchParams.countryId) {
          const params: HotelSearchParams = {
            ...searchParams,
            page: 1,
            limit: 100,
          };
          const data = await searchHotelsAll(params);
          if (data.length > 0) {
            setHotels(data);
            setTotalCount(data.length);
            await saveHotelsToGlobalCache(data);
            setIsLoading(false);
            setIsLoadingMore(false);
            return;
          }
        }
      } else {
        setIsLoadingMore(true);
      }

      // Если выбрано "Все страны" (нет countryId), загружаем ВСЕ отели из ВСЕХ доступных стран
      if (!searchParams.countryId) {
        // Используем только уже загруженные страны - без автоматической загрузки
        const countriesToLoad = countries;
        
        if (countriesToLoad.length === 0) {
          logger.warn('[HotelSearch] No countries available. Please load countries first or select a specific country.');
          setIsLoading(false);
          setIsLoadingMore(false);
          return;
        }
        
        logger.debug(`[HotelSearch] Loading hotels for all countries. Total countries: ${countriesToLoad.length}`);
        
        // Базовые параметры для запросов
        // Согласно документации Tourvisor API: countryId обязателен для каждого запроса
        // Опциональные: regionId, category, types, rating, page, limit
        const baseParams: Partial<HotelSearchParams> = {
          page: 1,
          limit: 100, // Уменьшаем лимит для более стабильной работы
        };
          
        if (searchParams.category) {
          baseParams.category = searchParams.category;
        }
        if (searchParams.types && searchParams.types.length > 0) {
          baseParams.types = searchParams.types;
        }
        if (searchParams.rating) {
          baseParams.rating = searchParams.rating;
        }
        // Примечание: hotelServices не поддерживается в методе /hotels согласно документации Tourvisor API
        // Услуги отелей используются только в поиске туров, не в поиске отелей

        // Ограничиваем количество стран для ускорения - берем только первые 10 самых популярных
        const countriesToLoadLimited = countriesToLoad.slice(0, 10);
        const MAX_TOTAL_HOTELS = 1000; // Максимальное количество отелей для загрузки
        const HOTELS_PER_COUNTRY = 100; // Отелей на страну
        
        // Функция для загрузки отелей из страны
        // Согласно документации Tourvisor API: countryId обязателен для метода /hotels
        const loadHotelsForCountry = async (country: Country, retryCount = 0): Promise<HotelCompact[]> => {
          const allHotelsForCountry: HotelCompact[] = [];
          let currentPage = 1;
          let hasMore = true;
          const maxRetries = 2;
          
          while (hasMore && allHotelsForCountry.length < HOTELS_PER_COUNTRY) {
            try {
              // Согласно документации Tourvisor API: GET /hotels
              // countryId (required), regionId, category, types, rating, page (default: 1), limit (default: 20)
              const params: HotelSearchParams = {
                countryId: country.id, // Обязательный параметр согласно документации
                page: currentPage,
                limit: 50, // Размер страницы
                ...(baseParams.category && { category: baseParams.category }),
                ...(baseParams.types && baseParams.types.length > 0 && { types: baseParams.types }),
                ...(baseParams.rating && { rating: baseParams.rating }),
              };
              
              const response = await tourvisorApi.getHotels(params);
              
              if (response.data && response.data.length > 0) {
                // Нормализуем фото из любых полей API (picturelink, picture, image, images, photo и т.д.)
                const hotelsWithData = response.data.map((hotel: any) => {
                  if (allHotelsForCountry.length === 0 && currentPage === 1 && __DEV__) {
                    logger.debug(`[HotelSearch] Sample hotel from API:`, JSON.stringify(hotel, null, 2).substring(0, 800));
                  }
                  return normalizeHotelImages({ ...hotel }) as HotelCompact;
                });
                
                allHotelsForCountry.push(...hotelsWithData);
                logger.debug(`[HotelSearch] Loaded ${response.data.length} hotels from ${country.name} (page ${currentPage}, total: ${allHotelsForCountry.length}, with images: ${hotelsWithData.filter(h => h.picturelink).length})`);
                
                // Проверяем, закончились ли страницы
                const totalPages = response.totalPages || Math.ceil(response.total / (params.limit || 50));
                hasMore = currentPage < totalPages && 
                         response.data.length === params.limit && 
                         allHotelsForCountry.length < HOTELS_PER_COUNTRY;
                currentPage++;
              } else {
                logger.debug(`[HotelSearch] No hotels found for ${country.name} (page ${currentPage})`);
                hasMore = false;
              }
            } catch (error: any) {
              logger.error(`[HotelSearch] Error loading hotels for ${country.name}:`, error.message);
              // Обработка ошибки 429 (Too Many Requests)
              if (error?.message?.includes('429') && retryCount < maxRetries) {
                const delay = Math.pow(2, retryCount) * 1000; // Экспоненциальная задержка: 1s, 2s
                logger.debug(`[HotelSearch] Rate limit hit for ${country.name}, retrying after ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return loadHotelsForCountry(country, retryCount + 1);
              }
              
              // Для других ошибок просто прекращаем загрузку для этой страны
              hasMore = false;
            }
          }
          
          return allHotelsForCountry;
        };

        // Загружаем отели из всех стран последовательно
        const allHotels: HotelCompact[] = [];
        let successfulCountries = 0;
        let failedCountries = 0;
        
        // Обновляем состояние по мере загрузки для показа прогресса
        const updateHotelsProgressively = (newHotels: HotelCompact[]) => {
          const uniqueHotels = newHotels.filter((hotel, index, self) =>
            index === self.findIndex(h => h.id === hotel.id)
          );
          setHotels(prev => {
            const combined = [...prev, ...uniqueHotels];
            return combined.filter((hotel, index, self) =>
              index === self.findIndex(h => h.id === hotel.id)
            );
          });
          setTotalCount(uniqueHotels.length);
        };
        
        // Загружаем страны последовательно для избежания rate limit
        for (let i = 0; i < countriesToLoadLimited.length && allHotels.length < MAX_TOTAL_HOTELS; i++) {
          const country = countriesToLoadLimited[i];
          logger.debug(`[HotelSearch] Loading hotels for ${country.name} (${i + 1}/${countriesToLoadLimited.length})`);
          
          try {
            const hotels = await loadHotelsForCountry(country);
            if (hotels.length > 0) {
              successfulCountries++;
              // Добавляем отели
              const remaining = MAX_TOTAL_HOTELS - allHotels.length;
              allHotels.push(...hotels.slice(0, remaining));
              
              // Обновляем UI прогрессивно
              if (reset && allHotels.length > 0) {
                updateHotelsProgressively(allHotels);
              }
            }
          } catch (error: any) {
            logger.error(`[HotelSearch] Failed to load hotels for ${country.name}:`, error.message);
            failedCountries++;
          }
          
          // Задержка между странами (кроме последней)
          if (i < countriesToLoadLimited.length - 1 && allHotels.length < MAX_TOTAL_HOTELS) {
            await new Promise(resolve => setTimeout(resolve, 300)); // 300ms задержка между странами
          }
        }

        logger.debug(`[HotelSearch] Finished loading. Total hotels: ${allHotels.length}, Successful countries: ${successfulCountries}, Failed countries: ${failedCountries}`);

        // Финальная обработка - удаляем дубликаты и обновляем состояние
        const uniqueHotels = allHotels.filter((hotel, index, self) =>
          index === self.findIndex(h => h.id === hotel.id)
        );

        // Сортируем по ID для стабильности
        uniqueHotels.sort((a, b) => a.id - b.id);

        // Обновляем состояние
        if (reset) {
          setHotels(uniqueHotels);
        } else {
          setHotels(prev => {
            const combined = [...prev, ...uniqueHotels];
            // Удаляем дубликаты
            return combined.filter((hotel, index, self) =>
              index === self.findIndex(h => h.id === hotel.id)
            );
          });
        }
        
        setTotalCount(uniqueHotels.length);
        
        // Сохраняем в оба кэша: специфичный по параметрам и общий кэш всех отелей
        if (reset && uniqueHotels.length > 0) {
          await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, uniqueHotels);
          logger.debug(`[HotelSearch] Hotels cached by params: ${uniqueHotels.length} hotels saved (key: "${cacheKey}")`);
          await saveHotelsToGlobalCache(uniqueHotels);
        }
        
        // Отключено: загрузка фото через getHotelDetails требует отдельной подписки API
        // Используем только изображения из базового списка отелей (/hotels)
        // if (uniqueHotels.length > 0) {
        //   loadHotelImages(uniqueHotels.slice(0, 50));
        // }
        
        // Если получили пустой результат, устанавливаем флаг неудачи
        if (uniqueHotels.length === 0) {
          logger.warn('[HotelSearch] No hotels found for all countries');
          setHasFailedOnce(true);
        }
        
        // Все отели загружены, больше загружать нечего
        setHasMore(false);
      } else {
        // Загрузка отелей для конкретной страны - ограничиваем до 2000 отелей
        const MAX_HOTELS = 2000;
        const allHotelsForCountry: HotelCompact[] = [];
        let currentPage = reset ? 1 : searchParams.page || 1;
        let hasMorePages = true;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (hasMorePages && allHotelsForCountry.length < MAX_HOTELS) {
          // Рассчитываем лимит для текущей страницы
          const remaining = MAX_HOTELS - allHotelsForCountry.length;
          const pageLimit = Math.min(remaining, 200); // Увеличиваем размер страницы для скорости
          
          // Согласно документации Tourvisor API: GET /hotels
          // Обязательный параметр: countryId (integer)
          // Опциональные: regionId (integer), category (integer), types (Array of integers), 
          //                rating (number), page (integer, default: 1), limit (integer, default: 20)
          // Документация: https://api.tourvisor.ru/search/docs
          if (!searchParams.countryId) {
            logger.error('[HotelSearch] countryId is required for /hotels endpoint according to Tourvisor API documentation');
            setHasFailedOnce(true);
            setHasMore(false);
            break;
          }
          
          const params: HotelSearchParams = {
            countryId: searchParams.countryId, // Обязательный параметр согласно документации
            page: currentPage,
            limit: pageLimit,
          };
          
          // Опциональные параметры согласно документации
          if (searchParams.regionId) {
            params.regionId = searchParams.regionId;
          }
          if (searchParams.category) {
            params.category = searchParams.category;
          }
          if (searchParams.types && searchParams.types.length > 0) {
            params.types = searchParams.types;
          }
          if (searchParams.rating) {
            params.rating = searchParams.rating;
          }
          // Примечание: hotelServices не поддерживается в методе /hotels согласно документации Tourvisor API
          // Услуги отелей используются только в поиске туров (параметр hotelServices в TourSearchParams)

          try {
            const response: PaginatedResponse<HotelCompact> = await tourvisorApi.getHotels(params);

            if (response.data && response.data.length > 0) {
              const hotelsWithData = response.data.map((hotel: any) =>
                normalizeHotelImages({ ...hotel }) as HotelCompact
              );
              
              allHotelsForCountry.push(...hotelsWithData);
              
              // Проверяем, достигли ли лимита или закончились страницы
              const totalPages = response.totalPages || Math.ceil(response.total / (params.limit || 100));
              hasMorePages = currentPage < totalPages && 
                           response.data.length === params.limit && 
                           allHotelsForCountry.length < MAX_HOTELS;
              currentPage++;
              retryCount = 0; // Сбрасываем счетчик повторов при успехе
              
              // Убрана задержка между страницами для скорости
            } else {
              hasMorePages = false;
            }
            } catch (error: any) {
              // Обработка ошибки 429 (Too Many Requests)
              if (error?.message?.includes('429') && retryCount < maxRetries) {
                const delay = Math.pow(2, retryCount) * 1000; // Экспоненциальная задержка: 1s, 2s, 4s
                await new Promise(resolve => setTimeout(resolve, delay));
                retryCount++;
                // Не увеличиваем currentPage, повторяем тот же запрос
              } else {
                hasMorePages = false;
              }
            }
        }

        // Если получили пустой результат, останавливаем дальнейшие запросы
        if (allHotelsForCountry.length === 0) {
          setHasFailedOnce(true);
          setHasMore(false);
        }

        if (reset) {
          setHotels(allHotelsForCountry);
        } else {
          setHotels(prev => {
            const combined = [...prev, ...allHotelsForCountry];
            // Удаляем дубликаты
            return combined.filter((hotel, index, self) =>
              index === self.findIndex(h => h.id === hotel.id)
            );
          });
        }

        // Подсчитываем общее количество (используем длину массива, так как загрузили все)
        setTotalCount(allHotelsForCountry.length);
        
        // Сохраняем в оба кэша: специфичный по параметрам и общий кэш всех отелей
        if (reset && allHotelsForCountry.length > 0) {
          await cacheService.set(CacheType.SEARCH_RESULTS, cacheKey, allHotelsForCountry);
          logger.debug(`[HotelSearch] Hotels cached by params: ${allHotelsForCountry.length} hotels saved (key: "${cacheKey}")`);
          await saveHotelsToGlobalCache(allHotelsForCountry);
        }
        
        // Отключено: загрузка фото через getHotelDetails требует отдельной подписки API
        // Используем только изображения из базового списка отелей (/hotels)
        // if (allHotelsForCountry.length > 0) {
        //   loadHotelImages(allHotelsForCountry.slice(0, 50));
        // }
        
        // Все отели загружены
        setHasMore(false);
      }
    } catch (error: any) {
      logger.error('[HotelSearch] Failed to load hotels:', error);
      
      // При ошибке пытаемся использовать устаревший кэш (только для reset)
      if (reset) {
        // 1. Сначала проверяем специфичный кэш по параметрам
        const staleCache = await cacheService.get<HotelCompact[]>(CacheType.SEARCH_RESULTS, cacheKey, true);
        if (staleCache && staleCache.length > 0) {
          logger.debug(`[HotelSearch] Using stale specific cache: ${staleCache.length} hotels (key: "${cacheKey}")`);
          setHotels(staleCache);
          setTotalCount(staleCache.length);
          setIsLoading(false);
          setIsLoadingMore(false);
          return;
        }
        
        // 2. Если специфичного кэша нет, проверяем общий кэш всех отелей
        const allCachedHotels = await getAllHotelsFromCache();
        if (allCachedHotels && allCachedHotels.length > 0) {
          logger.debug(`[HotelSearch] Found ${allCachedHotels.length} hotels in stale global cache, filtering by params...`);
          const filteredHotels = filterHotelsByParams(allCachedHotels, searchParams);
          
          if (filteredHotels && filteredHotels.length > 0) {
            const limitedHotels = filteredHotels.slice(0, searchParams.limit || 20);
            logger.debug(`[HotelSearch] Using ${limitedHotels.length} matching hotels from stale global cache`);
            setHotels(limitedHotels);
            setTotalCount(filteredHotels.length);
            setIsLoading(false);
            setIsLoadingMore(false);
            return;
          }
        }
        
        logger.debug(`[HotelSearch] No stale cache available (specific: "${cacheKey}", global: ${allCachedHotels?.length || 0} hotels)`);
      }

      if (reset) {
        Alert.alert(i18n.t('errors.errorLoad'), i18n.t('errors.tryChangeFilters'), [
          { text: i18n.t('common.ok') },
        ]);
      }

      // Устанавливаем флаг неудачи, чтобы остановить дальнейшие запросы
      setHasFailedOnce(true);
      setHasMore(false);
      
      // Тихая обработка ошибок для демо API (403, 429 ожидаем)
      // Не очищаем отели, если они уже загружены
      if (reset && hotels.length === 0) {
        setHotels([]);
      }
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
    navigation.navigate('ApiHotelResults', {
      searchParams: { ...searchParams, page: 1, limit: 20 },
    });
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

  // Рендер компактных фильтров
  const renderCompactFilters = () => (
    <View style={styles.filtersContainer}>
      {/* Поиск */}
      <View style={[styles.searchWrapper, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}>
        <Ionicons name="search" size={16} color={theme.primary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder="Поиск отелей..."
          placeholderTextColor={theme.secondaryText}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearButton}
          >
            <Ionicons name="close-circle" size={16} color={theme.secondaryText} />
          </TouchableOpacity>
        )}
      </View>
      
      {/* Компактная строка фильтров */}
      <View style={styles.filtersRow}>
        {/* Кнопка фильтров - объединяет все фильтры */}
        <TouchableOpacity
          style={styles.filtersButton}
          onPress={() => setShowFiltersModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="options" size={16} color={theme.primary} />
          <Text style={[styles.filtersButtonText, { color: theme.text }]}>Фильтры</Text>
          {activeFiltersCount > 0 && (
            <View style={styles.filtersBadge}>
              <Text style={styles.filtersBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Быстрые фильтры по категории */}
        <View style={styles.categoryButtons}>
          {[3, 4, 5].map(category => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryButtonCompact,
                searchParams.category === category && styles.categoryButtonActive
              ]}
              onPress={() => updateSearchParam('category', searchParams.category === category ? undefined : category)}
              activeOpacity={0.7}
            >
              {Array.from({ length: category }, (_, i) => (
                <Ionicons key={i} name="star" size={10} color={searchParams.category === category ? "#fff" : "#FFD700"} />
              ))}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Активные фильтры - чипсы */}
      {activeFiltersCount > 0 && (
        <View style={styles.activeFiltersRow}>
          {selectedCountry && (
            <TouchableOpacity
              style={styles.filterChip}
              onPress={() => {
                updateSearchParam('countryId', undefined);
                updateSearchParam('regionId', undefined);
              }}
            >
              <Text style={[styles.filterChipText, { color: theme.text }]}>{selectedCountry.name}</Text>
              <Ionicons name="close" size={12} color={theme.primary} />
            </TouchableOpacity>
          )}
          {selectedRegion && (
            <TouchableOpacity
              style={styles.filterChip}
              onPress={() => updateSearchParam('regionId', undefined)}
            >
              <Text style={[styles.filterChipText, { color: theme.text }]}>{selectedRegion.name}</Text>
              <Ionicons name="close" size={12} color={theme.primary} />
            </TouchableOpacity>
          )}
          {searchParams.category && (
            <TouchableOpacity
              style={styles.filterChip}
              onPress={() => updateSearchParam('category', undefined)}
            >
              <Text style={[styles.filterChipText, { color: theme.text }]}>{searchParams.category}★</Text>
              <Ionicons name="close" size={12} color={theme.primary} />
            </TouchableOpacity>
          )}
          {searchParams.rating && (
            <TouchableOpacity
              style={styles.filterChip}
              onPress={() => updateSearchParam('rating', undefined)}
            >
              <Text style={styles.filterChipText}>Рейтинг {searchParams.rating}+</Text>
              <Ionicons name="close" size={12} color="#0066CC" />
            </TouchableOpacity>
          )}
        </View>
      )}
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Заголовок модального окна */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Фильтры</Text>
            <TouchableOpacity
              onPress={() => setShowFiltersModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#1D1D1F" />
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
                style={styles.modalSelector}
                onPress={() => {
                  setShowCountryPicker(!showCountryPicker);
                  setShowRegionPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="earth" size={18} color="#0066CC" />
                <Text style={styles.modalSelectorText}>
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
                  style={styles.modalSelector}
                  onPress={() => {
                    if (regions.length > 0) {
                      setShowRegionPicker(!showRegionPicker);
                      setShowCountryPicker(false);
                    }
                  }}
                  activeOpacity={0.7}
                  disabled={regions.length === 0}
                >
                  <Ionicons name="location" size={18} color="#0066CC" />
                  <Text style={[styles.modalSelectorText, regions.length === 0 && styles.selectorTextDisabled]}>
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
                      searchParams.category === category && styles.categoryButtonActive
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
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalResetButton}
              onPress={() => {
                updateSearchParam('countryId', undefined);
                updateSearchParam('regionId', undefined);
                updateSearchParam('category', undefined);
                updateSearchParam('rating', undefined);
                updateSearchParam('types', undefined);
                updateSearchParam('hotelServices', undefined);
              }}
            >
              <Text style={styles.modalResetText}>Сбросить</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalApplyButton}
              onPress={() => setShowFiltersModal(false)}
            >
              <Text style={styles.modalApplyText}>Применить</Text>
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

    return (
      <TouchableOpacity
        style={styles.hotelCard}
        onPress={() => handleHotelPress(item)}
        activeOpacity={0.8}
      >
        {/* Изображение отеля из API (picturelink, picture, image, images и т.д.) или плейсхолдер */}
        <View style={styles.hotelImageContainer}>
          <CachedImage
            source={hotelImage}
            style={styles.hotelImage}
            recyclingKey={`hotel-search-${item.id}`}
          />

          {/* Градиент для лучшей читаемости текста */}
          <View style={[styles.imageGradient, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />

          {/* Бейдж категории */}
          <View style={styles.categoryBadge}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              {Array.from({ length: starCount }, (_, i) => (
                <Ionicons key={i} name="star" size={12} color="#FFD700" />
              ))}
            </View>
          </View>

          {/* Бейдж рейтинга */}
          {item.rating > 0 && (
            <View style={styles.ratingBadgeOverlay}>
              <Ionicons name="star" size={14} color="#fff" />
              <Text style={styles.ratingTextOverlay}>{item.rating.toFixed(1)}</Text>
            </View>
          )}

          {/* Информация поверх изображения */}
          <View style={styles.hotelImageOverlay}>
            <Text style={styles.hotelNameOverlay} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={styles.hotelLocationOverlay}>
              <Ionicons name="location" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.hotelLocationTextOverlay} numberOfLines={1}>
                {item.region.name}
                {item.subRegion && `, ${item.subRegion.name}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Информация об отеле - нижняя часть */}
        <View style={styles.hotelContent}>
          <View style={styles.hotelInfoRow}>
            <View style={styles.hotelCategoryBadge}>
              <Ionicons name="business" size={16} color="#0066CC" />
              <Text style={styles.categoryTextBadge}>
                {item.category} звезд{item.category === 1 ? 'а' : item.category < 5 ? 'ы' : ''}
              </Text>
            </View>
            {item.country && (
              <View style={styles.hotelCountryBadge}>
                <Ionicons name="flag" size={14} color="#6E6E73" />
                <Text style={styles.countryText}>
                  {item.country.name}
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.hotelActionButton}>
            <Text style={styles.hotelActionText}>Подробнее</Text>
            <Ionicons name="arrow-forward" size={16} color="#0066CC" />
          </View>
        </View>
      </TouchableOpacity>
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Поиск отелей</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.formScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.filtersWrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {renderCompactFilters()}
        </View>

        <View style={styles.searchButtonBlock}>
          <TouchableOpacity
            style={[styles.searchButton, { backgroundColor: theme.primary }]}
            onPress={handleSearchHotels}
            activeOpacity={0.85}
          >
            <Ionicons name="search" size={22} color="#fff" />
            <Text style={styles.searchButtonText}>Найти отели</Text>
          </TouchableOpacity>
          {!searchParams.countryId && (
            <Text style={[styles.searchHint, { color: theme.secondaryText }]}>
              Выберите страну и при необходимости регион, категорию и рейтинг
            </Text>
          )}
        </View>
      </ScrollView>

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
  categoryButtonCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  categoryButtonActive: {
    backgroundcolor: '#0066CC',
    bordercolor: '#0066CC',
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
    // backgroundColor убран - используется динамический через inline стиль
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
    width: '100%',
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  hotelImageContainer: {
    width: '100%',
    height: 280,
    position: 'relative',
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
    backgroundColor: '#F0F7FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    bordercolor: '#0066CC',
    gap: 6,
    position: 'relative',
  },
  filtersButtonText: {
    fontSize: 14,
    color: '#0066CC',
    fontWeight: '600',
  },
  filtersBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
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
    bordercolor: '#0066CC',
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
    // backgroundColor убран - используется динамический через inline стиль
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
  modalScroll: {
  },
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
    // backgroundColor убран - используется динамический через inline стиль
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginTop: 8,
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
    backgroundcolor: '#0066CC',
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
    // color убран - используется динамический через inline стиль
    color: '#1D1D1F',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    // color убран - используется динамический через inline стиль
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
