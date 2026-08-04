import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { dictionaryService } from '../services/DictionaryService';
import { tourvisorApi } from '../services/TourvisorApiService';
import { TourSearchParams, Country, Departure, Region, Meal } from '../types/tourvisor';
import { platform } from '../utils/platform';
import { filterMealsForUi, sanitizeTourMealParam } from '../utils/tourvisorMeals';
import { logger } from '../utils/logger';
import { radius, shadows } from '../config/designSystem';

import type { NavigationProp } from '@react-navigation/native';

type ApiTourSearchScreenProps = {
  navigation: NavigationProp<Record<string, object | undefined>>;
  route: { params?: Record<string, unknown> };
};

export default function ApiTourSearchScreen({ navigation, route }: ApiTourSearchScreenProps) {
  const { apiReady, theme, isDark, currency } = useAppContext();

  // Search parameters state (валюта из настроек приложения)
  const [searchParams, setSearchParams] = useState<Partial<TourSearchParams>>({
    adults: 2,
    childs: [],
    currency,
    onlyCharter: false,
  });

  // Синхронизируем валюту из настроек при открытии экрана
  useEffect(() => {
    setSearchParams(prev => ({ ...prev, currency }));
  }, [currency]);
  /** {i18n.t('search.childrenAge')} как строки (для ввода). В параметры Tourvisor уходит массив чисел `childs`. */
  const [childrenAgesInput, setChildrenAgesInput] = useState<string[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Dictionary data state
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // Modal states
  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateType, setDateType] = useState<'dateFrom' | 'dateTo'>('dateFrom');

  // Load dictionary data on mount
  useEffect(() => {
    if (apiReady) {
      loadDictionaryData();
    }
  }, [apiReady]);

  // Подгрузка стран только для выбранного города вылета (только страны, в которые есть туры из этого города)
  useEffect(() => {
    if (!apiReady || searchParams.departureId == null) {
      setCountries([]);
      return;
    }
    let cancelled = false;
    dictionaryService
      .getCountries(searchParams.departureId, searchParams.onlyCharter ?? false)
      .then((list) => {
        if (!cancelled) setCountries(list);
      })
      .catch(() => {
        if (!cancelled) setCountries([]);
      });
    return () => { cancelled = true; };
  }, [apiReady, searchParams.departureId, searchParams.onlyCharter]);

  const loadDictionaryData = async () => {
    try {
      setIsLoading(true);

      // Загружаем справочники (страны подгружаются по выбранному городу вылета — только с турами из этого города)
      let departuresData: Departure[] = [];
      let mealsData: Meal[] = [];
      
      try {
        departuresData = await dictionaryService.getDepartures();
      } catch (error: any) {
        logger.warn('Failed to load departures:', error?.message);
        departuresData = [];
      }
      
      try {
        mealsData = await dictionaryService.getMeals();
        mealsData = filterMealsForUi(mealsData);
      } catch (error: unknown) {
        logger.warn('Failed to load meals:', (error as Error)?.message);
        mealsData = [];
      }

      setDepartures(departuresData);
      setMeals(mealsData);
      setCountries([]);
      // По умолчанию выбираем первый город вылета, чтобы сразу подгрузить список доступных стран
      if (departuresData.length > 0) {
        setSearchParams(prev => ({ ...prev, departureId: prev.departureId ?? departuresData[0].id }));
      }

      if (departuresData.length === 0) {
        logger.warn('Critical dictionary data not loaded. Search functionality may be limited.');
      }
    } catch (error) {
      logger.error('Failed to load dictionary data:', error);
      // Устанавливаем пустые массивы, чтобы UI не зависал
      setDepartures([]);
      setCountries([]);
      setMeals([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load regions when departure and country are selected
  useEffect(() => {
    if (searchParams.departureId && searchParams.countryId) {
      loadRegions();
      loadAvailableDates();
    }
  }, [searchParams.departureId, searchParams.countryId]);

  // Автоматический расчет nightsFrom/nightsTo на основе выбранных дат
  // Согласно документации API: nightsFrom и nightsTo - обязательные параметры типа integer
  useEffect(() => {
    if (searchParams.dateFrom && searchParams.dateTo) {
      // Парсим даты в формате YYYY-MM-DD, устанавливаем время в 00:00:00 для точного расчета
      const dateFromParts = searchParams.dateFrom.split('-').map(Number);
      const dateToParts = searchParams.dateTo.split('-').map(Number);
      const dateFromObj = new Date(dateFromParts[0], dateFromParts[1] - 1, dateFromParts[2]);
      const dateToObj = new Date(dateToParts[0], dateToParts[1] - 1, dateToParts[2]);
      
      // Вычисляем разницу в днях (календарные дни между датами)
      // Например: вылет 1 января, возвращение 8 января = 7 дней = 7 ночей
      const diffTime = dateToObj.getTime() - dateFromObj.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      // Количество ночей = разница в календарных днях
      // Например: вылет 1 января, возвращение 8 января = 7 ночей (ночь с 1 на 2, с 2 на 3, ..., с 7 на 8)
      // Минимум 1 ночь, максимум 30 ночей (стандартное ограничение для туров)
      const calculatedNights = Math.max(1, Math.min(diffDays, 30));
      
      // Используем диапазон ±2 ночи от вычисленного значения для гибкости поиска
      const nightsFrom = Math.max(1, calculatedNights - 2);
      const nightsTo = Math.min(30, calculatedNights + 2);
      
      // Убеждаемся, что nightsTo > nightsFrom (требование API)
      const finalNightsFrom = nightsFrom;
      const finalNightsTo = nightsTo > nightsFrom ? nightsTo : nightsFrom + 1;
      
      // Обновляем параметры только если они изменились
      if (searchParams.nightsFrom !== finalNightsFrom || searchParams.nightsTo !== finalNightsTo) {
        updateSearchParam('nightsFrom', finalNightsFrom);
        updateSearchParam('nightsTo', finalNightsTo);
      }
    }
  }, [searchParams.dateFrom, searchParams.dateTo]);

  const loadRegions = async () => {
    try {
      const regionsData = await dictionaryService.getRegions(searchParams.countryId);
      setRegions(regionsData);
    } catch (error) {
      logger.error('Failed to load regions:', error);
    }
  };

  const loadAvailableDates = async () => {
    try {
      const dates = await dictionaryService.getTourDates(
        searchParams.departureId!,
        searchParams.countryId!
      );
      setAvailableDates(dates);
    } catch (error) {
      logger.error('Failed to load available dates:', error);
    }
  };

  const handleSearch = async () => {
    // Валидация обязательных параметров согласно документации API
    if (!searchParams.departureId || !searchParams.countryId ||
        !searchParams.dateFrom || !searchParams.dateTo ||
        !searchParams.adults) {
      Alert.alert(i18n.t('common.error'), i18n.t('search.errorRequired'));
      return;
    }
    
    // nightsFrom и nightsTo будут вычислены автоматически на основе дат

    // Валидация дат: проверяем, что даты не в прошлом
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dateFrom = new Date(searchParams.dateFrom!);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date(searchParams.dateTo!);
    dateTo.setHours(0, 0, 0, 0);

    // Если dateFrom в прошлом, используем сегодняшнюю дату
    let validDateFrom = searchParams.dateFrom!;
    if (dateFrom < today) {
      validDateFrom = today.toISOString().split('T')[0];
      // Обновляем состояние с исправленной датой
      updateSearchParam('dateFrom', validDateFrom);
    }

    // Если dateTo раньше dateFrom, корректируем
    const validDateFromObj = new Date(validDateFrom);
    validDateFromObj.setHours(0, 0, 0, 0);
    let validDateTo = searchParams.dateTo!;
    if (dateTo < validDateFromObj) {
      // Устанавливаем dateTo на dateFrom + 7 дней
      const newDateTo = new Date(validDateFromObj);
      newDateTo.setDate(newDateTo.getDate() + 7);
      validDateTo = newDateTo.toISOString().split('T')[0];
      updateSearchParam('dateTo', validDateTo);
    }

    // Вычисляем количество ночей на основе выбранных дат
    // Согласно документации API: nightsFrom и nightsTo - обязательные integer параметры
    // Парсим даты в формате YYYY-MM-DD, устанавливаем время в 00:00:00 для точного расчета
    const dateFromParts = validDateFrom.split('-').map(Number);
    const dateToParts = validDateTo.split('-').map(Number);
    const dateFromObj = new Date(dateFromParts[0], dateFromParts[1] - 1, dateFromParts[2]);
    const dateToObj = new Date(dateToParts[0], dateToParts[1] - 1, dateToParts[2]);
    dateFromObj.setHours(0, 0, 0, 0);
    dateToObj.setHours(0, 0, 0, 0);
    
    // Вычисляем разницу в днях (календарные дни между датами)
    // Например: вылет 1 января, возвращение 8 января = 7 дней = 7 ночей
    const diffTime = dateToObj.getTime() - dateFromObj.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    // Количество ночей = разница в календарных днях
    // Например: вылет 1 января, возвращение 8 января = 7 ночей (ночь с 1 на 2, с 2 на 3, ..., с 7 на 8)
    // Минимум 1 ночь, максимум 30 ночей (стандартное ограничение для туров)
    const calculatedNights = Math.max(1, Math.min(diffDays, 30));
    
    // Используем диапазон ±2 ночи от вычисленного значения для гибкости поиска
    const nightsFrom = Math.max(1, calculatedNights - 2);
    const nightsTo = Math.min(30, calculatedNights + 2);
    
    // Убеждаемся, что nightsTo > nightsFrom (требование API)
    const finalNightsFrom = nightsFrom;
    const finalNightsTo = nightsTo > nightsFrom ? nightsTo : nightsFrom + 1;

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

    const params: TourSearchParams = {
      departureId: searchParams.departureId!,
      countryId: searchParams.countryId!,
      dateFrom: validDateFrom,
      dateTo: validDateTo,
      nightsFrom: finalNightsFrom,
      nightsTo: finalNightsTo,
      adults: searchParams.adults!,
      childs: childAges,
      currency: searchParams.currency || currency || 'RUB',
      onlyCharter: searchParams.onlyCharter !== undefined ? searchParams.onlyCharter : false,
      ...(searchParams.regionIds && { regionIds: searchParams.regionIds }),
      ...(sanitizeTourMealParam(searchParams.meal) !== undefined
        ? { meal: sanitizeTourMealParam(searchParams.meal) }
        : {}),
    };

    try {
      setIsSearching(true);

      if (tourvisorApi.isRateLimited()) {
        Alert.alert(i18n.t('errors.rateLimit'), i18n.t('errors.rateLimitDesc'));
        return;
      }

      navigation.navigate('ApiTourResults', {
        searchParams: params,
        useCache: false,
        runSearch: true,
      });
    } catch (error: unknown) {
      logger.error('Search failed:', error);
      Alert.alert(i18n.t('common.error'), i18n.t('search.errorSearchFailed'));
    } finally {
      setIsSearching(false);
    }
  };

  const updateSearchParam = <K extends keyof TourSearchParams>(
    key: K,
    value: TourSearchParams[K]
  ) => {
    setSearchParams(prev => ({ ...prev, [key]: value }));
  };

  const setChildrenCount = (nextCount: number) => {
    const clamped = Math.max(0, Math.min(10, nextCount));
    // При изменении количества детей очищаем значения возрастов,
    // чтобы удалённые цифры не появлялись снова в TextInput.
    setChildrenAgesInput(Array.from({ length: clamped }, () => ''));
  };

  const formatDate = (dateStr: string) => {
    // Парсим дату в формате YYYY-MM-DD без учета временных зон
    // Это предотвращает смещение даты на день назад/вперед
    const parts = dateStr.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    
    // Форматируем дату вручную, чтобы избежать проблем с временными зонами
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}.${month}.${year}`;
  };

  const getSelectedDeparture = () => {
    return departures.find(d => d.id === searchParams.departureId);
  };

  const getSelectedCountry = () => {
    return countries.find(c => c.id === searchParams.countryId);
  };

  const getSelectedMeal = () => {
    return meals.find(m => m.id === searchParams.meal);
  };

  const getSelectedRegion = () => {
    return regions.find(r => r.id === searchParams.regionIds?.[0]);
  };

  if (!apiReady) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Инициализация API...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('search.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Departure City */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Город вылета</Text>
          <TouchableOpacity
            style={[styles.selector, { borderColor: theme.border }]}
            onPress={() => setShowDepartureModal(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.selectorText, {
              color: getSelectedDeparture() ? theme.text : theme.secondaryText
            }]}>
              {getSelectedDeparture()?.name || i18n.t('search.selectCity')}
            </Text>
            <Ionicons name="chevron-down" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Country */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Страна</Text>
          <TouchableOpacity
            style={[styles.selector, { borderColor: theme.border }]}
            onPress={() => setShowCountryModal(true)}
            activeOpacity={0.7}
            disabled={!searchParams.departureId}
          >
            <Text style={[styles.selectorText, {
              color: getSelectedCountry() ? theme.text : theme.secondaryText
            }]}>
              {getSelectedCountry()?.name || 'Сначала выберите город вылета'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Region */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Регион</Text>
          <TouchableOpacity
            style={[styles.selector, { borderColor: theme.border }]}
            onPress={() => setShowRegionModal(true)}
            activeOpacity={0.7}
            disabled={!searchParams.countryId}
          >
            <Text style={[styles.selectorText, {
              color: getSelectedRegion() ? theme.text : theme.secondaryText
            }]}>
              {getSelectedRegion()?.name || i18n.t('search.selectRegion')}
            </Text>
            <Ionicons name="chevron-down" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Dates */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Даты</Text>
          <View style={styles.datesRow}>
            <TouchableOpacity
              style={[styles.dateSelector, { borderColor: theme.border }]}
              onPress={() => {
                setDateType('dateFrom');
                setShowDateModal(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.dateLabel, { color: theme.secondaryText }]}>С</Text>
              <Text style={[styles.dateText, {
                color: searchParams.dateFrom ? theme.text : theme.secondaryText
              }]}>
                {searchParams.dateFrom ? formatDate(searchParams.dateFrom) : i18n.t('search.select')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dateSelector, { borderColor: theme.border }]}
              onPress={() => {
                setDateType('dateTo');
                setShowDateModal(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.dateLabel, { color: theme.secondaryText }]}>По</Text>
              <Text style={[styles.dateText, {
                color: searchParams.dateTo ? theme.text : theme.secondaryText
              }]}>
                {searchParams.dateTo ? formatDate(searchParams.dateTo) : i18n.t('search.select')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nights - автоматически рассчитывается на основе дат согласно документации API */}
        {searchParams.dateFrom && searchParams.dateTo && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('search.nightsCount')}</Text>
            <View style={styles.nightsRow}>
              <Text style={[styles.nightsText, { color: theme.text }]}>
                {searchParams.nightsFrom || '-'} - {searchParams.nightsTo || '-'} {i18n.t('search.nights')}
              </Text>
              <Text style={[styles.nightsHint, { color: theme.secondaryText }]}>
                (рассчитывается автоматически)
              </Text>
            </View>
          </View>
        )}

        {/* Passengers */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Пассажиры</Text>
          <View style={styles.passengersRow}>
            <View style={styles.passengerItem}>
              <Text style={[styles.passengerLabel, { color: theme.secondaryText }]}>Взрослые</Text>
              <View style={styles.counter}>
                <TouchableOpacity
                  style={[styles.counterButton, { borderColor: 'rgba(255, 255, 255, 0.18)' }]}
                  onPress={() => {
                    const current = searchParams.adults || 2;
                    updateSearchParam('adults', Math.max(1, current - 1));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={16} color={'#0066CC'} />
                </TouchableOpacity>
                <Text style={[styles.counterText, { color: theme.text }]}>
                  {searchParams.adults || 2}
                </Text>
                <TouchableOpacity
                  style={[styles.counterButton, { borderColor: 'rgba(255, 255, 255, 0.18)' }]}
                  onPress={() => {
                    const current = searchParams.adults || 2;
                    updateSearchParam('adults', Math.min(10, current + 1));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={16} color={'#0066CC'} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.passengerItem}>
              <Text style={[styles.passengerLabel, { color: theme.secondaryText }]}>Дети</Text>
              <View style={styles.counter}>
                <TouchableOpacity
                  style={[styles.counterButton, { borderColor: 'rgba(255, 255, 255, 0.18)' }]}
                  onPress={() => {
                    setChildrenCount(childrenAgesInput.length - 1);
                  }}
                  activeOpacity={0.7}
                  disabled={childrenAgesInput.length === 0}
                >
                  <Ionicons name="remove" size={16} color={'#0066CC'} />
                </TouchableOpacity>
                <Text style={[styles.counterText, { color: theme.text }]}>
                  {childrenAgesInput.length}
                </Text>
                <TouchableOpacity
                  style={[styles.counterButton, { borderColor: 'rgba(255, 255, 255, 0.18)' }]}
                  onPress={() => {
                    setChildrenCount(childrenAgesInput.length + 1);
                  }}
                  activeOpacity={0.7}
                  disabled={childrenAgesInput.length >= 10}
                >
                  <Ionicons name="add" size={16} color={'#0066CC'} />
                </TouchableOpacity>
              </View>
            </View>

            {childrenAgesInput.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.passengerLabel, { color: theme.secondaryText, marginBottom: 8 }]}>
                  {i18n.t('search.childrenAge')}
                </Text>
                {childrenAgesInput.map((age, idx) => (
                  <View key={`child_age_${idx}`} style={{ marginBottom: 10 }}>
                    <Text style={[styles.passengerLabel, { color: theme.secondaryText, marginBottom: 6 }]}>
                      Ребёнок {idx + 1}
                    </Text>
                    <TextInput
                      style={[
                        styles.childAgeInput,
                        {
                          borderColor: theme.border,
                          backgroundColor: theme.secondaryBackground,
                          color: theme.text,
                        },
                      ]}
                      value={age}
                      onChangeText={(v) =>
                        setChildrenAgesInput((prev) => {
                          const next = [...prev];
                          next[idx] = v.replace(/\D/g, '').slice(0, 2);
                          return next;
                        })
                      }
                      placeholder="Например: 7"
                      placeholderTextColor={theme.tertiaryText}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Meal Type */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Тип питания</Text>
          <TouchableOpacity
            style={[styles.selector, { borderColor: 'rgba(255, 255, 255, 0.18)' }]}
            onPress={() => setShowMealModal(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.selectorText, {
              color: getSelectedMeal() ? '#1D1D1F' : '#6E6E73'
            }]}>
              {getSelectedMeal()?.name || 'Любой тип питания'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Search Button */}
        <TouchableOpacity
          style={[styles.searchButton, { backgroundColor: '#FF6B00' }]}
          onPress={handleSearch}
          disabled={isSearching}
          activeOpacity={0.8}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="search" size={20} color="#fff" />
              <Text style={styles.searchButtonText}>{i18n.t('search.findTours')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Departure City Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDepartureModal}
        onRequestClose={() => setShowDepartureModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{i18n.t('search.selectCity')}</Text>
              <TouchableOpacity onPress={() => setShowDepartureModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {departures.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.modalItem, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    updateSearchParam('departureId', item.id);
                    // Очищаем страну, так как список стран зависит от города вылета
                    updateSearchParam('countryId', undefined);
                    setShowDepartureModal(false);
                  }}
                >
                    <Text style={[styles.modalItemText, { color: theme.text }]}>{item.name}</Text>
                  {searchParams.departureId === item.id && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Country Modal — скрываем статус-бар, чтобы убрать системный индикатор (чёрный pill) */}
      {showCountryModal && <StatusBar hidden />}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showCountryModal}
        onRequestClose={() => setShowCountryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{i18n.t('search.selectCountry')}</Text>
              <TouchableOpacity onPress={() => setShowCountryModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {countries.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.modalItem, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    updateSearchParam('countryId', item.id);
                    // Очищаем регионы, так как они зависят от страны
                    updateSearchParam('regionIds', undefined);
                    setShowCountryModal(false);
                  }}
                >
                    <Text style={[styles.modalItemText, { color: theme.text }]}>{item.name}</Text>
                  {searchParams.countryId === item.id && (
                    <Ionicons name="checkmark" size={20} color={'#0066CC'} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Region Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showRegionModal}
        onRequestClose={() => setShowRegionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: 'rgba(255, 255, 255, 0.18)' }]}>
              <Text style={[styles.modalTitle, { color: '#1D1D1F' }]}>{i18n.t('search.selectRegion')}</Text>
              <TouchableOpacity onPress={() => setShowRegionModal(false)}>
                <Ionicons name="close" size={24} color={'#1D1D1F'} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[styles.modalItem, { borderBottomColor: 'rgba(255, 255, 255, 0.18)' }]}
                onPress={() => {
                  updateSearchParam('regionIds', undefined);
                  setShowRegionModal(false);
                }}
              >
                <Text style={[styles.modalItemText, { color: '#1D1D1F' }]}>
                  Любой регион
                </Text>
                {!searchParams.regionIds?.length && (
                  <Ionicons name="checkmark" size={20} color={'#0066CC'} />
                )}
              </TouchableOpacity>

              {regions.map((region) => (
                <TouchableOpacity
                  key={region.id}
                  style={[styles.modalItem, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    updateSearchParam('regionIds', [region.id]);
                    setShowRegionModal(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: '#1D1D1F' }]}>
                    {region.name}
                  </Text>
                  {searchParams.regionIds?.[0] === region.id && (
                    <Ionicons name="checkmark" size={20} color={'#0066CC'} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Meal Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showMealModal}
        onRequestClose={() => setShowMealModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: 'rgba(255, 255, 255, 0.18)' }]}>
              <Text style={[styles.modalTitle, { color: '#1D1D1F' }]}>{i18n.t('search.selectMeal')}</Text>
              <TouchableOpacity onPress={() => setShowMealModal(false)}>
                <Ionicons name="close" size={24} color={'#1D1D1F'} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[styles.modalItem, { borderBottomColor: 'rgba(255, 255, 255, 0.18)' }]}
                onPress={() => {
                  updateSearchParam('meal', undefined);
                  setShowMealModal(false);
                }}
              >
                <Text style={[styles.modalItemText, { color: '#1D1D1F' }]}>
                  Любой тип питания
                </Text>
                {!searchParams.meal && (
                  <Ionicons name="checkmark" size={20} color={'#0066CC'} />
                )}
              </TouchableOpacity>

              {meals.map((meal) => (
                <TouchableOpacity
                  key={meal.id}
                  style={[styles.modalItem, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    const validMeal = sanitizeTourMealParam(meal.id);
                    if (validMeal !== undefined) updateSearchParam('meal', validMeal);
                    setShowMealModal(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: '#1D1D1F' }]}>
                    {meal.name}
                  </Text>
                  {searchParams.meal === meal.id && (
                    <Ionicons name="checkmark" size={20} color={'#0066CC'} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Date Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDateModal}
        onRequestClose={() => setShowDateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: 'rgba(255, 255, 255, 0.18)' }]}>
              <Text style={[styles.modalTitle, { color: '#1D1D1F' }]}>
                {i18n.t('search.select')} {dateType === 'dateFrom' ? i18n.t('search.selectDateDeparture') : i18n.t('search.selectDateReturn')}
              </Text>
              <TouchableOpacity onPress={() => setShowDateModal(false)}>
                <Ionicons name="close" size={24} color={'#1D1D1F'} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {availableDates.map((date) => (
                <TouchableOpacity
                  key={date}
                  style={[styles.modalItem, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    updateSearchParam(dateType === 'dateFrom' ? 'dateFrom' : 'dateTo', date);
                    setShowDateModal(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: '#1D1D1F' }]}>
                    {formatDate(date)}
                  </Text>
                  {((dateType === 'dateFrom' && searchParams.dateFrom === date) ||
                    (dateType === 'dateTo' && searchParams.dateTo === date)) && (
                    <Ionicons name="checkmark" size={20} color={'#0066CC'} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  childAgeInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  selectorText: {
    fontSize: 16,
    flex: 1,
  },
  datesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateSelector: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 14,
  },
  nightsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  nightSelector: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nightsText: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'center',
  },
  nightsHint: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  passengersRow: {
    gap: 16,
  },
  passengerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passengerLabel: {
    fontSize: 16,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
    marginBottom: 32,
    ...shadows.button,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  modalItemText: {
    fontSize: 16,
  },
});
