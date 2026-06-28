import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Tour } from '../types/tourvisor';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { dictionaryService } from '../services/DictionaryService';
import { tourvisorApi } from '../services/TourvisorApiService';
import { TourHot, TourHotel, Country, Departure, HotToursParams, TourSearchParams } from '../types/tourvisor';
import { platform } from '../utils/platform';
import { preCacheTourDetailsFromSearchResults, cacheTourFromSearchResult, buildTourOutputFromSearchResult } from '../utils/tourDetailsCache';
import { FavoritesService } from '../services/FavoritesService';
import { cacheService, CacheType } from '../services/CacheService';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import { notificationService } from '../services/NotificationService';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';

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
    departureId: route?.params?.departureId || 1,
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

  // Dictionary data
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDeparture, setSelectedDeparture] = useState<Departure | null>(null);
  const [selectedCountries, setSelectedCountries] = useState<Country[]>([]);
  const promoNotificationSent = useRef(false);

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
      if (apiReady && selectedDeparture && !hasFailedOnce) {
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

      // Set default departure (Moscow) или из route.params
      const departureIdToUse = route?.params?.departureId || 1;
      const defaultDeparture = departuresData.find(d => d.id === departureIdToUse);
      if (defaultDeparture) {
        setSelectedDeparture(defaultDeparture);
        setSearchParams(prev => ({ ...prev, departureId: departureIdToUse }));
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
    
    // Если уже была неудача, не делаем новые запросы
    if (hasFailedOnce) {
      return;
    }

    // Предотвращаем множественные одновременные запросы
    if (isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      setHasFailedOnce(false); // Сбрасываем флаг перед новой попыткой

      // Если выбраны конкретные страны, загружаем туры ТОЛЬКО для них
      // Если countryId передан в route.params, НЕ загружаем для всех стран
      const countriesToLoad = selectedCountries.length > 0 
        ? selectedCountries 
        : (route?.params?.countryId ? [] : countries); // Если countryId передан, но страны не выбраны - не загружаем

      // Проверяем, что страны загружены
      if (countriesToLoad.length === 0) {
        if (route?.params?.countryId) {
          logger.debug('[HotTours] Waiting for country filter to be set from route params...');
        } else {
          logger.debug('[HotTours] Countries not loaded yet, waiting...');
        }
        setIsLoading(false);
        return;
      }

      logger.debug(`[HotTours] Loading tours for ${countriesToLoad.length} country/countries:`, 
        countriesToLoad.map(c => c.name).join(', '));
      const allTourHotels: TourHotel[] = [];

      // Загружаем туры для каждой страны отдельно с задержками, чтобы избежать rate limit
      const delayBetweenCountries = 2000; // 2 секунды между странами (поиск асинхронный)
      
      for (let i = 0; i < countriesToLoad.length; i++) {
        const country = countriesToLoad[i];
        let retryCount = 0;
        const maxRetries = 2;
        let success = false;
        
        while (!success && retryCount < maxRetries) {
          try {
            // Используем обычный поиск туров вместо горящих туров
            // Сначала получаем доступные даты для страны, чтобы использовать валидные даты
            let dateFrom: string;
            let dateTo: string;
            
            try {
              // Пытаемся получить доступные даты из API
              logger.debug(`[HotTours] Fetching available dates for ${country.name} (departureId: ${selectedDeparture.id}, countryId: ${country.id})`);
              const availableDates = await dictionaryService.getTourDates(
                selectedDeparture.id,
                country.id,
                undefined, // arrivalId
                searchParams.onlyCharter || false
              );
              logger.debug(`[HotTours] Received ${availableDates?.length || 0} available dates for ${country.name}`);
              
              if (availableDates && availableDates.length > 0) {
                // Фильтруем даты, оставляя только будущие (начиная с завтра)
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                const tomorrowStr = tomorrow.toISOString().split('T')[0];
                
                // API не принимает сегодняшнюю дату, нужна дата строго в будущем
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayStr = today.toISOString().split('T')[0];
                
                const futureDates = availableDates.filter(date => {
                  // Строго больше сегодня (не >=), чтобы исключить сегодняшнюю дату
                  const isFuture = date > todayStr;
                  if (!isFuture) {
                    logger.debug(`[HotTours] Filtering out date ${date} (today: ${todayStr})`);
                  }
                  return isFuture;
                });
                
                logger.debug(`[HotTours] Filtered dates for ${country.name}: ${availableDates.length} total, ${futureDates.length} future (today: ${todayStr})`);
                
                if (futureDates.length > 0) {
                  // Используем первую будущую доступную дату как dateFrom
                  dateFrom = futureDates[0];
                  logger.debug(`[HotTours] Selected dateFrom: ${dateFrom} (first future date)`);
                  // Используем последнюю доступную дату или дату через 14 дней от первой
                  const lastDate = futureDates[futureDates.length - 1];
                  const firstDateObj = new Date(dateFrom);
                  const maxDateObj = new Date(firstDateObj);
                  maxDateObj.setDate(maxDateObj.getDate() + 14); // Максимум 14 дней от первой даты
                  const lastDateObj = new Date(lastDate);
                  
                  // Берем минимум из последней доступной даты и даты через 14 дней
                  dateTo = lastDateObj < maxDateObj ? lastDate : maxDateObj.toISOString().split('T')[0];
                  
                  logger.debug(`[HotTours] Using available dates for ${country.name}: ${dateFrom} to ${dateTo} (${futureDates.length} future dates from ${availableDates.length} total)`);
                } else {
                  // Если все даты в прошлом, используем завтра и +14 дней
                  dateFrom = tomorrowStr;
                  const dateToObj = new Date(tomorrow);
                  dateToObj.setDate(dateToObj.getDate() + 14);
                  dateTo = dateToObj.toISOString().split('T')[0];
                  logger.debug(`[HotTours] All available dates are in the past, using tomorrow: ${dateFrom} to ${dateTo}`);
                }
              } else {
                // Если доступных дат нет, используем завтрашнюю дату и +14 дней
                // API может не принимать сегодняшнюю дату
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1); // Завтра вместо сегодня
                tomorrow.setHours(0, 0, 0, 0);
                dateFrom = tomorrow.toISOString().split('T')[0];
                const dateToObj = new Date(tomorrow);
                dateToObj.setDate(dateToObj.getDate() + 14);
                dateTo = dateToObj.toISOString().split('T')[0];
                logger.debug(`[HotTours] No available dates found, using default range: ${dateFrom} to ${dateTo}`);
              }
            } catch (datesError: any) {
              // Если не удалось получить доступные даты, используем завтрашнюю дату и +14 дней
              // API не принимает сегодняшнюю дату, обязательно используем завтра
              logger.warn(`[HotTours] Could not get available dates for ${country.name}, using tomorrow:`, datesError.message);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1); // Завтра вместо сегодня
              tomorrow.setHours(0, 0, 0, 0);
              dateFrom = tomorrow.toISOString().split('T')[0];
              const dateToObj = new Date(tomorrow);
              dateToObj.setDate(dateToObj.getDate() + 14);
              dateTo = dateToObj.toISOString().split('T')[0];
              logger.debug(`[HotTours] Using fallback dates (CATCH BLOCK): ${dateFrom} to ${dateTo} (today was: ${today.toISOString().split('T')[0]})`);
            }
            
            // ВАЖНО: Проверяем, что dateFrom не сегодняшняя дата
            const todayCheck = new Date();
            todayCheck.setHours(0, 0, 0, 0);
            const todayStrCheck = todayCheck.toISOString().split('T')[0];
            if (dateFrom <= todayStrCheck) {
              logger.error(`[HotTours] ERROR: dateFrom (${dateFrom}) is today or in the past! Today is ${todayStrCheck}. Forcing tomorrow.`);
              const tomorrow = new Date(todayCheck);
              tomorrow.setDate(tomorrow.getDate() + 1);
              dateFrom = tomorrow.toISOString().split('T')[0];
              const dateToObj = new Date(tomorrow);
              dateToObj.setDate(dateToObj.getDate() + 14);
              dateTo = dateToObj.toISOString().split('T')[0];
              logger.debug(`[HotTours] Corrected dates: ${dateFrom} to ${dateTo}`);
            }

            // Вычисляем максимальное количество ночей на основе диапазона дат
            const dateFromObj = new Date(dateFrom);
            const dateToObj = new Date(dateTo);
            const maxNights = Math.floor((dateToObj.getTime() - dateFromObj.getTime()) / (1000 * 60 * 60 * 24));
            
            // Используем разумные значения для поиска туров
            // Согласно документации API, nightsTo должен быть валидным значением
            // Важно: nightsTo должен быть строго больше nightsFrom
            const nightsFrom = 3;
            
            // Вычисляем nightsTo на основе диапазона дат
            // Используем максимальное количество ночей, которое может быть в диапазоне дат
            // Но не меньше 7 и не больше 30 (разумные пределы для туров)
            let nightsTo: number;
            
            // Если диапазон дат позволяет, используем его как основу
            // Но добавляем запас, чтобы покрыть туры разной длительности
            if (maxNights < 7) {
              nightsTo = 7; // Минимум 7 ночей
            } else if (maxNights <= 14) {
              // Для диапазона до 14 дней используем стандартные значения туров
              // Используем 15 вместо 14, так как API может не принимать значение 14
              nightsTo = 15; // Стандартный максимум для большинства туров
            } else {
              // Для больших диапазонов используем максимум 30 ночей
              nightsTo = Math.min(maxNights, 30);
            }
            
            // ВАЖНО: Убеждаемся, что nightsTo строго больше nightsFrom
            if (nightsTo <= nightsFrom) {
              nightsTo = nightsFrom + 1;
            }
            
            logger.debug(`[HotTours] Date range: ${dateFrom} to ${dateTo} = ${maxNights} days`);
            logger.debug(`[HotTours] Nights range: ${nightsFrom} to ${nightsTo} (calculated from ${maxNights} days, nightsTo > nightsFrom: ${nightsTo > nightsFrom})`);
            
            const tourSearchParams: TourSearchParams = {
              departureId: selectedDeparture.id,
              countryId: country.id, // Один ID страны (required)
              dateFrom: dateFrom,
              dateTo: dateTo,
              nightsFrom: nightsFrom,
              nightsTo: nightsTo,
              adults: 2,
              childs: [],
              currency: 'RUB',
              onlyCharter: searchParams.onlyCharter || false,
            };
            
            logger.debug(`[HotTours] Calculated nights range: ${nightsFrom}-${nightsTo} (based on date range: ${dateFrom} to ${dateTo}, max possible: ${maxNights} nights)`);

            logger.debug(`[HotTours] Starting tour search for country ${country.name} (ID: ${country.id}):`, {
              departureId: tourSearchParams.departureId,
              countryId: tourSearchParams.countryId,
              dateFrom: tourSearchParams.dateFrom,
              dateTo: tourSearchParams.dateTo,
              nightsFrom: tourSearchParams.nightsFrom,
              nightsTo: tourSearchParams.nightsTo,
              adults: tourSearchParams.adults,
              currency: tourSearchParams.currency,
              onlyCharter: tourSearchParams.onlyCharter,
            });
            logger.debug(`[HotTours] Full search params:`, JSON.stringify(tourSearchParams, null, 2));

            // Запускаем поиск
            logger.debug(`[HotTours] Attempting to start search for ${country.name}...`);
            let searchResult;
            try {
              searchResult = await tourvisorApi.startTourSearch(tourSearchParams);
              const searchId = searchResult.searchId;
              logger.debug(`[HotTours] ✅ Search started successfully for ${country.name}, searchId: ${searchId}`);
            } catch (searchStartError: any) {
              // Если ошибка при запуске поиска (400, 403 и т.д.)
              logger.error(`[HotTours] ❌ Failed to start search for ${country.name}:`, searchStartError.message);
              if (searchStartError?.message?.includes('400') || searchStartError?.message?.includes('invalid')) {
                // Ошибка валидации параметров - не продолжаем для этой страны
                logger.error(`[HotTours] Invalid parameters for ${country.name}, skipping. Error:`, searchStartError.message);
                success = true; // Помечаем как успех, чтобы не блокировать другие страны
                continue; // Переходим к следующей стране
              }
              throw searchStartError; // Пробрасываем другие ошибки
            }
            
            const searchId = searchResult.searchId;

            // Ждем завершения поиска (polling статуса)
            let searchCompleted = false;
            let attempts = 0;
            const maxAttempts = 30; // Максимум 30 попыток (около 90 секунд)
            
            while (!searchCompleted && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 3000)); // Ждем 3 секунды между проверками
              
              try {
                const status = await tourvisorApi.getTourSearchStatus(searchId, false);
                logger.debug(`[HotTours] Search status for ${country.name}: ${status.status}, progress: ${status.progress}%`);
                
                if (status.status === 'completed') {
                  searchCompleted = true;
                  
                  // Получаем результаты поиска
                  const results = await tourvisorApi.getTourSearchResults(searchId, 200); // Максимум 200 отелей
                  logger.debug(`[HotTours] Search completed for ${country.name}, found ${results?.length || 0} hotels`);
                  
                  if (results && results.length > 0) {
                    // Фильтруем только отели с турами для нужной страны
                    const filteredHotels = results.filter(hotel => 
                      hotel.country?.id === country.id && hotel.tours && hotel.tours.length > 0
                    );
                    allTourHotels.push(...filteredHotels);
                    logger.debug(`[HotTours] Added ${filteredHotels.length} hotels with tours for ${country.name}`);
                  }
                } else if (status.status === 'error') {
                  throw new Error(`Search failed for ${country.name}`);
                }
              } catch (statusError: any) {
                logger.error(`[HotTours] Error checking search status for ${country.name}:`, statusError);
                if (statusError?.message?.includes('403') || statusError?.message?.includes('forbidden')) {
                  throw statusError; // Пробрасываем 403
                }
              }
              
              attempts++;
            }

            if (!searchCompleted) {
              logger.warn(`[HotTours] Search timeout for ${country.name} after ${maxAttempts} attempts`);
            }
            
            success = true;
          } catch (error: any) {
            // Обработка ошибки 403 (Forbidden) - токен недействителен или нет прав
            // Если fallback уже был попробован и все равно 403, тогда показываем ошибку
            if (error?.message?.includes('403') || error?.message?.includes('forbidden')) {
              logger.error(`[HotTours] 403 Forbidden for country ${country.name} (fallback also failed):`, error.message);
              // Не продолжаем попытки для этой страны
              success = true;
              // Если это первая страна и у нас есть countryId в route, показываем ошибку
              if (i === 0 && route?.params?.countryId) {
                setHasFailedOnce(true);
                throw error; // Пробрасываем ошибку, чтобы показать пользователю
              }
            }
            // Обработка ошибки 429 (Too Many Requests)
            else if (error?.message?.includes('429') && retryCount < maxRetries - 1) {
              const delay = Math.pow(2, retryCount) * 1000; // Экспоненциальная задержка: 1s, 2s, 4s
              await new Promise(resolve => setTimeout(resolve, delay));
              retryCount++;
            } else {
              success = true; // Продолжаем загрузку для других стран даже если одна не удалась
            }
          }
        }
        
        // Задержка между странами (кроме последней)
        if (i < countriesToLoad.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenCountries));
        }
      }

      // Удаляем дубликаты по ID отеля
      const uniqueHotels = allTourHotels.filter((hotel, index, self) =>
        index === self.findIndex(h => h.id === hotel.id)
      );

      // Если получили пустой результат, останавливаем дальнейшие запросы
      if (uniqueHotels.length === 0 && countriesToLoad.length > 0) {
        setHasFailedOnce(true);
        logger.warn('[HotTours] No tours found for selected countries');
      }
      
      setHotTours(uniqueHotels);
      if (uniqueHotels.length > 0) {
        preCacheTourDetailsFromSearchResults(uniqueHotels, searchParams.currency || 'RUB').catch(() => {});
        const cacheKey = `hot_${selectedDeparture.id}_${countriesToLoad.map(c => c.id).sort().join(',')}`;
        cacheService.set(CacheType.HOT_TOURS, cacheKey, uniqueHotels).catch(() => {});
        // Уведомление об акции: "Скидка на тур {название}" — один раз за сессию
        if (!promoNotificationSent.current) {
          const first = uniqueHotels[0];
          const firstTour = first?.tours?.[0];
          const tourName = firstTour ? `${first.name}, ${first.country?.name || ''}` : first?.name || 'Акционный тур';
          const tourId = firstTour?.id?.toString();
          notificationService.sendPromoTourNotification(tourName, tourId).catch(() => {});
          promoNotificationSent.current = true;
        }
      }
    } catch (error: any) {
      // Устанавливаем флаг неудачи, чтобы остановить дальнейшие запросы
      setHasFailedOnce(true);
      // Тихая обработка ошибок для демо API (403, 429 ожидаем)
      // Не очищаем туры, если они уже загружены
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

  const formatPrice = useCallback(
    (price: number, fromCurrency: string = 'RUB') =>
      settingsService.formatTourPrice(price, fromCurrency as Currency, currency),
    [currency]
  );

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, []);

  /** Маршрута Search/Map в приложении нет — открываем координаты первого отеля в картографическом приложении. */
  const openHotToursMap = useCallback(() => {
    if (hotTours.length === 0) return;
    const h = hotTours[0];
    const lat = typeof h.latitude === 'number' ? h.latitude : null;
    const lng = typeof h.longitude === 'number' ? h.longitude : null;
    if (lat == null || lng == null) {
      Alert.alert(i18n.t('common.error'), 'Нет координат для отображения на карте.');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(i18n.t('common.error'), 'Не удалось открыть карту.');
    });
  }, [hotTours]);

  const renderHotTourItem = useCallback(({ item }: { item: TourHotel }) => {
    // TourHotel содержит массив туров, берем первый тур для отображения или минимальную цену
    const firstTour = item.tours && item.tours.length > 0 ? item.tours[0] : null;
    const minPrice = item.tours && item.tours.length > 0 
      ? Math.min(...item.tours.map(t => t.price))
      : item.price;

    if (!firstTour) {
      return null; // Пропускаем отели без туров
    }

    return (
      <TouchableOpacity
        style={[styles.tourCard, { backgroundColor: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.18)' }]}
        onPress={() => {
          cacheTourFromSearchResult(item, firstTour, firstTour.currency || 'RUB').catch(() => {});
          navigation.navigate('ApiTourDetails', {
            tourId: firstTour.id,
            currency: firstTour.currency || 'RUB',
          });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.tourHeader}>
          <View style={styles.tourInfo}>
            <Text style={[styles.hotelName, { color: theme.text }]} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={[styles.hotelLocation, { color: theme.secondaryText }]}>
              {item.region.name}
              {item.subRegion && `, ${item.subRegion.name}`}
            </Text>
          </View>
          <View style={[styles.tourOperator, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <TouchableOpacity
              onPress={() => handleFavoritePress(item, firstTour)}
              style={styles.favoriteIcon}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={favoriteIds.has(String(firstTour.id)) ? 'heart' : 'heart-outline'}
                size={22}
                color={favoriteIds.has(String(firstTour.id)) ? theme.error : theme.secondaryText}
              />
            </TouchableOpacity>
            <Text style={[styles.operatorName, { color: theme.primary }]}>
              {firstTour.operator.name}
            </Text>
          </View>
        </View>

        <View style={styles.tourDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="location" size={16} color={'#6E6E73'} />
            <Text style={[styles.detailText, { color: '#6E6E73' }]}>
              {item.country.name}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={16} color={'#6E6E73'} />
            <Text style={[styles.detailText, { color: '#6E6E73' }]}>
              {formatDate(firstTour.date)} • {firstTour.nights} {i18n.t('search.nights')}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="restaurant" size={16} color={'#6E6E73'} />
            <Text style={[styles.detailText, { color: '#6E6E73' }]}>
              {firstTour.meal.russianName}
            </Text>
          </View>
        
        {item.tours.length > 1 && (
          <View style={styles.detailRow}>
            <Ionicons name="options" size={16} color={'#0066CC'} />
            <Text style={[styles.detailText, { color: '#0066CC' }]}>
              {i18n.t('hotTours.moreTours')} {item.tours.length - 1} {item.tours.length - 1 === 1 ? i18n.t('hotTours.moreToursOne') : i18n.t('hotTours.moreToursMany')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.priceSection}>
        <View style={styles.priceContainer}>
          <Text style={[styles.currentPrice, { color: '#0066CC' }]}>
            {i18n.t('hotTours.from')} {formatPrice(minPrice, firstTour.currency || 'RUB')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
    );
  }, [
    favoriteIds,
    formatDate,
    formatPrice,
    handleFavoritePress,
    navigation,
    theme,
    user,
    isGuest,
    isDark,
  ]);

  const renderFilters = () => (
    <View style={[styles.filtersContainer, { backgroundColor: '#FFFFFF' }]}>
      <View style={styles.filterHeader}>
        <Text style={[styles.filterTitle, { color: '#1D1D1F' }]}>{i18n.t('hotTours.filters')}</Text>
        <TouchableOpacity onPress={clearFilters} activeOpacity={0.7}>
          <Text style={[styles.clearFiltersText, { color: '#0066CC' }]}>{i18n.t('hotTours.resetFilters')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.countriesFilter}>
        {countries.slice(0, 10).map(country => {
          const isSelected = selectedCountries.some(c => c.id === country.id);
          return (
            <TouchableOpacity
              key={country.id}
              style={[
                styles.countryChip,
                {
                  backgroundColor: isSelected ? '#0066CC' : '#3399FF',
                  borderColor: 'rgba(255, 255, 255, 0.18)'
                }
              ]}
              onPress={() => toggleCountryFilter(country)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.countryChipText,
                { color: isSelected ? '#fff' : '#1D1D1F' }
              ]}>
                {country.name}
              </Text>
            </TouchableOpacity>
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

      {/* Header */}
      <View style={[styles.header, { backgroundColor: '#FFFFFF', borderBottomColor: 'rgba(255, 255, 255, 0.18)' }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={'#1D1D1F'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#1D1D1F' }]}>
          {route?.params?.countryName ? `${i18n.t('hotTours.titleCountry')} ${route.params.countryName}` : i18n.t('hotTours.title')}
        </Text>
        <View style={styles.headerRight}>
          {hotTours.length > 0 && (
            <TouchableOpacity
              style={styles.mapButton}
              onPress={openHotToursMap}
              activeOpacity={0.7}
            >
              <Ionicons name="map" size={22} color={'#0066CC'} />
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
              color={showFilters ? '#0066CC' : '#1D1D1F'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Departure Selector */}
      <View style={[styles.departureSelector, { backgroundColor: '#FFFFFF' }]}>
        <Text style={[styles.selectorLabel, { color: '#6E6E73' }]}>Город вылета</Text>
        <TouchableOpacity
          style={[styles.selector, { borderColor: 'rgba(255, 255, 255, 0.18)' }]}
          onPress={() => {
            // Could implement departure selection modal here
            Alert.alert(i18n.t('info.departureMoscow'), i18n.t('info.departureMoscowDesc'));
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectorText, { color: '#1D1D1F' }]}>
            {selectedDeparture?.name || i18n.t('hotTours.selectCity')}
          </Text>
          <Ionicons name="chevron-down" size={20} color={'#6E6E73'} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      {showFilters && renderFilters()}

      {/* Results Count */}
      <View style={[styles.resultsHeader, { backgroundColor: '#F0F2F5' }]}>
        <Text style={[styles.resultsText, { color: '#6E6E73' }]}>
          {i18n.t('hotTours.foundLine')}: {hotTours.length}
        </Text>
        {hotTours.length > 0 && (
          <TouchableOpacity
            style={styles.mapButtonHeader}
            onPress={openHotToursMap}
            activeOpacity={0.7}
          >
            <Ionicons name="map" size={18} color={'#0066CC'} />
            <Text style={[styles.mapButtonText, { color: '#0066CC' }]}>{i18n.t('hotTours.onMap')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tours List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={'#0066CC'} />
          <Text style={[styles.loadingText, { color: '#1D1D1F' }]}>
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
              <Ionicons name="airplane-outline" size={48} color={'#6E6E73'} />
              <Text style={[styles.emptyText, { color: '#6E6E73' }]}>
                {hasFailedOnce && route?.params?.countryId 
                  ? i18n.t('search.errorLoad') 
                  : i18n.t('tours.notFoundShort')}
              </Text>
              <Text style={[styles.emptySubtext, { color: '#6E6E73' }]}>
                {hasFailedOnce && route?.params?.countryId
                  ? i18n.t('errors.checkApiToken')
                  : i18n.t('errors.tryChangeFilters')}
              </Text>
            </View>
          }
        />
      )}
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
    color: '#0066CC',
  },
  toursList: {
    padding: 16,
  },
  tourCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
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
    fontSize: 18,
    fontWeight: '700',
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
