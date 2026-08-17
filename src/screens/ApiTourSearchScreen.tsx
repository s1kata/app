import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { dictionaryService } from '../services/DictionaryService';
import { tourvisorApi } from '../services/TourvisorApiService';
import { TourSearchParams, Country, Departure, Region, Meal } from '../types/tourvisor';
import { filterMealsForUi, sanitizeTourMealParam } from '../utils/tourvisorMeals';
import { logger } from '../utils/logger';
import { BRAND, radius, shadows, spacing, typography } from '../config/designSystem';
import { useTabBarMetrics } from '../utils/tabBarMetrics';
import type { NavigationProp } from '@react-navigation/native';
import PrimaryButton from '../components/ui/PrimaryButton';
import ScreenHeader from '../components/ui/ScreenHeader';
import DateRangeCalendar from '../components/DateRangeCalendar';
import BookingWizardProgress from '../components/ux/BookingWizardProgress';
import { filterExcludedDestinationCountries } from '../config/homeDestinations';
import { savePreferredDepartureId, resolvePreferredDepartureId } from '../services/IdeaCollectionService';
import { safeGoBack } from '../utils/navHelpers';
import { formatAdultsRu, formatChildrenRu, formatNightsRangeRu } from '../utils/pluralRu';
import { toYmd } from '../utils/dateYmd';

const SEARCH_WIZARD_STEPS = 5 as const;
type WizardStep = 1 | 2 | 3 | 4 | 5;

const NIGHT_PRESETS = [
  { from: 5, to: 7, label: '5–7' },
  { from: 7, to: 10, label: '7–10' },
  { from: 7, to: 11, label: '7–11' },
  { from: 7, to: 14, label: '7–14' },
  { from: 10, to: 14, label: '10–14' },
  { from: 14, to: 21, label: '14–21' },
] as const;

const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

type ApiTourSearchScreenProps = {
  navigation: NavigationProp<Record<string, object | undefined>>;
  route: { params?: Record<string, unknown> };
};

function computePrefillStep(prefill: Partial<TourSearchParams>): WizardStep {
  if (!prefill.departureId) return 1;
  if (!prefill.countryId) return 2;
  if (!prefill.dateFrom || !prefill.dateTo) return 3;
  if (prefill.nightsFrom == null || prefill.nightsTo == null) return 4;
  return 5;
}

export default function ApiTourSearchScreen({ navigation, route }: ApiTourSearchScreenProps) {
  const { apiReady, theme, isDark, currency, fontScale } = useAppContext();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { contentBottomPadding } = useTabBarMetrics(insets, fontScale);
  const bottomPad = contentBottomPadding({ includeFab: false, extra: 56 });
  const calendarMinDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [nightsTouched, setNightsTouched] = useState(false);
  const [searchParams, setSearchParams] = useState<Partial<TourSearchParams>>({
    adults: 2,
    childs: [],
    currency,
    onlyCharter: false,
    nightsFrom: 7,
    nightsTo: 11,
  });
  /** Возраст детей как строки (для ввода). В Tourvisor уходит массив чисел `childs`. */
  const [childrenAgesInput, setChildrenAgesInput] = useState<string[]>([]);

  useEffect(() => {
    setSearchParams((prev) => ({ ...prev, currency }));
  }, [currency]);

  // Prefill с главной («Идеи для путешествий») + прыжок на нужный шаг
  useEffect(() => {
    const prefill = route?.params?.searchPrefill as Partial<TourSearchParams> | undefined;
    if (!prefill || typeof prefill !== 'object') return;
    setSearchParams((prev) => ({
      ...prev,
      ...prefill,
      currency: prefill.currency || prev.currency || currency,
      nightsFrom: prefill.nightsFrom ?? prev.nightsFrom ?? 7,
      nightsTo: prefill.nightsTo ?? prev.nightsTo ?? 11,
    }));
    if (Array.isArray(prefill.childs)) {
      setChildrenAgesInput(prefill.childs.map((n) => String(n)));
    }
    setWizardStep(computePrefillStep(prefill));
  }, [route?.params?.searchPrefill, route?.params?.ideaId, currency]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [departures, setDepartures] = useState<Departure[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);

  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);

  useEffect(() => {
    if (apiReady) {
      void loadDictionaryData();
    }
  }, [apiReady]);

  // Страны только для выбранного города вылета
  useEffect(() => {
    if (!apiReady || searchParams.departureId == null) {
      setCountries([]);
      setCountriesLoading(false);
      return;
    }
    let cancelled = false;
    setCountriesLoading(true);
    dictionaryService
      .getCountries(searchParams.departureId, searchParams.onlyCharter ?? false)
      .then((list) => {
        if (cancelled) return;
        const next = filterExcludedDestinationCountries(list || []);
        setCountries(next);
        setSearchParams((prev) => {
          if (prev.countryId != null && !next.some((c) => c.id === prev.countryId)) {
            const cleaned = { ...prev };
            delete cleaned.countryId;
            delete cleaned.regionIds;
            return cleaned;
          }
          return prev;
        });
      })
      .catch(() => {
        if (!cancelled) setCountries([]);
      })
      .finally(() => {
        if (!cancelled) setCountriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiReady, searchParams.departureId, searchParams.onlyCharter]);

  const openCountryPicker = useCallback(() => {
    if (!searchParams.departureId) {
      Alert.alert(i18n.t('common.error'), 'Сначала выберите город вылета');
      setWizardStep(1);
      setShowDepartureModal(true);
      return;
    }
    setShowCountryModal(true);
  }, [searchParams.departureId]);

  const loadDictionaryData = async () => {
    try {
      setIsLoading(true);
      let departuresData: Departure[] = [];
      let mealsData: Meal[] = [];

      try {
        departuresData = await dictionaryService.getDepartures();
      } catch (error: unknown) {
        logger.warn('Failed to load departures:', (error as Error)?.message);
        departuresData = [];
      }

      try {
        mealsData = filterMealsForUi(await dictionaryService.getMeals());
      } catch (error: unknown) {
        logger.warn('Failed to load meals:', (error as Error)?.message);
        mealsData = [];
      }

      setDepartures(departuresData);
      setMeals(mealsData);
      setCountries([]);
      if (departuresData.length > 0) {
        const preferredId = await resolvePreferredDepartureId();
        const preferred =
          departuresData.find((d) => d.id === preferredId)?.id ?? departuresData[0].id;
        setSearchParams((prev) => ({
          ...prev,
          departureId: prev.departureId ?? preferred,
        }));
      }
      if (departuresData.length === 0) {
        logger.warn('Critical dictionary data not loaded. Search functionality may be limited.');
      }
    } catch (error) {
      logger.error('Failed to load dictionary data:', error);
      setDepartures([]);
      setCountries([]);
      setMeals([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchParams.departureId && searchParams.countryId) {
      void loadRegions();
    } else {
      setRegions([]);
    }
  }, [searchParams.departureId, searchParams.countryId]);

  const loadRegions = async () => {
    try {
      const regionsData = await dictionaryService.getRegions(searchParams.countryId);
      setRegions(regionsData);
    } catch (error) {
      logger.error('Failed to load regions:', error);
    }
  };

  const updateSearchParam = <K extends keyof TourSearchParams>(
    key: K,
    value: TourSearchParams[K] | undefined
  ) => {
    setSearchParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleSearch = async () => {
    if (!searchParams.departureId) {
      Alert.alert(i18n.t('common.error'), 'Выберите город вылета');
      setWizardStep(1);
      setShowDepartureModal(true);
      return;
    }
    if (!searchParams.countryId) {
      Alert.alert(i18n.t('common.error'), 'Выберите страну');
      setWizardStep(2);
      openCountryPicker();
      return;
    }
    if (!searchParams.dateFrom || !searchParams.dateTo) {
      Alert.alert(i18n.t('common.error'), 'Выберите даты вылета');
      setWizardStep(3);
      return;
    }
    if (!searchParams.adults) {
      Alert.alert(i18n.t('common.error'), i18n.t('search.errorRequired'));
      setWizardStep(5);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dateFrom = new Date(searchParams.dateFrom!);
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date(searchParams.dateTo!);
    dateTo.setHours(0, 0, 0, 0);

    let validDateFrom = searchParams.dateFrom!;
    if (dateFrom < today) {
      validDateFrom = toYmd(today);
      updateSearchParam('dateFrom', validDateFrom);
    }

    const validDateFromObj = new Date(validDateFrom);
    validDateFromObj.setHours(0, 0, 0, 0);
    let validDateTo = searchParams.dateTo!;
    if (dateTo < validDateFromObj) {
      const newDateTo = new Date(validDateFromObj);
      newDateTo.setDate(newDateTo.getDate() + 7);
      validDateTo = toYmd(newDateTo);
      updateSearchParam('dateTo', validDateTo);
    }

    const finalNightsFrom = Math.max(1, Math.min(30, Number(searchParams.nightsFrom) || 7));
    let finalNightsTo = Math.max(1, Math.min(30, Number(searchParams.nightsTo) || 11));
    if (finalNightsTo < finalNightsFrom) finalNightsTo = finalNightsFrom;

    const childAges: number[] = [];
    if (childrenAgesInput.length > 0) {
      for (let i = 0; i < childrenAgesInput.length; i++) {
        const raw = String(childrenAgesInput[i] ?? '').trim();
        const age = Number(raw);
        if (!raw) {
          Alert.alert(i18n.t('common.error'), i18n.t('search.errorChildAge'));
          setWizardStep(5);
          return;
        }
        if (!Number.isInteger(age) || age < 0 || age > 17) {
          Alert.alert(i18n.t('common.error'), i18n.t('search.errorChildAgeRange'));
          setWizardStep(5);
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

  const formatDateShort = (dateStr: string) => {
    const parts = dateStr.split('-').map(Number);
    const day = parts[2];
    const month = MONTHS_SHORT[parts[1] - 1] || '';
    return `${day} ${month}`;
  };

  const selectedDeparture = departures.find((d) => d.id === searchParams.departureId);
  const selectedCountry = countries.find((c) => c.id === searchParams.countryId);
  const selectedMeal = meals.find((m) => m.id === searchParams.meal);
  const selectedRegion = regions.find((r) => r.id === searchParams.regionIds?.[0]);

  const wizardLabels = useMemo(
    () => [
      i18n.t('search.wizardStepFrom'),
      i18n.t('search.wizardStepTo'),
      i18n.t('search.wizardStepWhen'),
      i18n.t('search.wizardStepNights'),
      i18n.t('search.wizardStepTourists'),
    ],
    []
  );

  const stepHint = useMemo(() => {
    switch (wizardStep) {
      case 1:
        return i18n.t('search.wizardHintFrom');
      case 2:
        return i18n.t('search.wizardHintTo');
      case 3:
        return i18n.t('search.wizardHintWhen');
      case 4:
        return i18n.t('search.wizardHintNights');
      case 5:
        return i18n.t('search.wizardHintTourists');
      default:
        return '';
    }
  }, [wizardStep]);

  const goToStep = useCallback((step: WizardStep) => {
    setWizardStep(step);
  }, []);

  const addChild = () => {
    if (childrenAgesInput.length >= 10) return;
    setChildrenAgesInput((prev) => [...prev, '']);
  };

  const removeChild = (idx: number) => {
    setChildrenAgesInput((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!apiReady) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>Инициализация API...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const adultsCount = searchParams.adults || 2;
  const kidsCount = childrenAgesInput.length;
  const guestsSummary =
    kidsCount > 0
      ? `${formatAdultsRu(adultsCount)}, ${formatChildrenRu(kidsCount)}`
      : formatAdultsRu(adultsCount);
  const nightsSummary =
    searchParams.nightsFrom != null && searchParams.nightsTo != null
      ? formatNightsRangeRu(searchParams.nightsFrom, searchParams.nightsTo)
      : formatNightsRangeRu(7, 11);
  const whenSummary =
    searchParams.dateFrom && searchParams.dateTo
      ? `${formatDateShort(searchParams.dateFrom)} – ${formatDateShort(searchParams.dateTo)}`
      : undefined;

  const searchStackIndex = navigation.getState?.()?.index ?? 0;
  const showBack = searchStackIndex > 0;

  const renderSummaryChips = () => {
    if (wizardStep <= 1) return null;
    const chips: { key: string; label: string; step: WizardStep }[] = [];
    if (selectedDeparture?.name) {
      chips.push({ key: 'from', label: selectedDeparture.name, step: 1 });
    }
    if (wizardStep >= 2 && selectedCountry?.name) {
      chips.push({ key: 'to', label: selectedCountry.name, step: 2 });
    }
    if (wizardStep >= 4 && whenSummary) {
      chips.push({ key: 'when', label: whenSummary, step: 3 });
    }
    if (wizardStep >= 5) {
      chips.push({ key: 'nights', label: nightsSummary, step: 4 });
    }

    if (chips.length === 0) return null;

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {chips.map((chip, index) => (
          <React.Fragment key={chip.key}>
            {index > 0 ? (
              <Ionicons
                name="chevron-forward"
                size={12}
                color={theme.secondaryText}
                style={styles.chipArrow}
              />
            ) : null}
            <TouchableOpacity
              style={[
                styles.summaryChip,
                { backgroundColor: theme.secondaryBackground, borderColor: theme.border },
              ]}
              onPress={() => goToStep(chip.step)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Вернуться к шагу: ${chip.label}`}
            >
              <Text style={[styles.summaryChipText, { color: theme.text }]} numberOfLines={1}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </ScrollView>
    );
  };

  const renderNavRow = (opts: {
    onBack?: () => void;
    onNext?: () => void;
    nextDisabled?: boolean;
    nextTitle?: string;
    nextLoading?: boolean;
  }) => (
    <View style={styles.navRow}>
      {opts.onBack ? (
        <PrimaryButton
          title={i18n.t('common.back')}
          onPress={opts.onBack}
          outline
          style={styles.navBtn}
        />
      ) : (
        <View style={styles.navBtn} />
      )}
      {opts.onNext ? (
        <PrimaryButton
          title={opts.nextTitle ?? i18n.t('common.next')}
          onPress={opts.onNext}
          disabled={opts.nextDisabled}
          loading={opts.nextLoading}
          variant="cta"
          style={styles.navBtn}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      <ScreenHeader
        title={i18n.t('nav.search')}
        onBack={showBack ? () => safeGoBack(navigation, 'Home') : undefined}
        plain={!showBack}
        noSafeTop
      />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad, paddingHorizontal: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heroSubtitle, { color: theme.secondaryText }]}>
          {i18n.t('search.wizardHeroSubtitle')}
        </Text>

        <BookingWizardProgress
          currentStep={wizardStep}
          totalSteps={SEARCH_WIZARD_STEPS}
          labels={wizardLabels}
          showCurrentLabelInHeader
        />

        {renderSummaryChips()}

        <Text style={[styles.stepHint, { color: theme.secondaryText }]}>{stepHint}</Text>

        {isLoading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.inlineLoadingText, { color: theme.secondaryText }]}>
              Загрузка справочников…
            </Text>
          </View>
        ) : null}

        {/* Step 1 — Откуда */}
        {wizardStep === 1 ? (
          <View style={[styles.stepCard, shadows.cardRaised, { backgroundColor: theme.card }]}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {i18n.t('search.wizardStepFrom')}
            </Text>
            <TouchableOpacity
              style={[
                styles.pickerRow,
                { backgroundColor: theme.secondaryBackground, borderColor: theme.border },
              ]}
              onPress={() => setShowDepartureModal(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                selectedDeparture?.name
                  ? `${i18n.t('search.departureCityLabel')}: ${selectedDeparture.name}`
                  : i18n.t('search.selectCity')
              }
            >
              <View style={[styles.pickerIcon, { backgroundColor: BRAND.blueSubtle }]} accessible={false}>
                <Ionicons name="airplane-outline" size={18} color={theme.primary} />
              </View>
              <View style={styles.pickerText} importantForAccessibility="no-hide-descendants">
                <Text style={[styles.pickerLabel, { color: theme.secondaryText }]}>
                  {i18n.t('search.departureCityLabel')}
                </Text>
                <Text
                  style={[
                    styles.pickerValue,
                    { color: selectedDeparture ? theme.text : theme.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {selectedDeparture?.name || i18n.t('search.selectCity')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
            </TouchableOpacity>
            {renderNavRow({
              onNext: () => {
                if (!searchParams.departureId) {
                  Alert.alert(i18n.t('common.error'), 'Выберите город вылета');
                  setShowDepartureModal(true);
                  return;
                }
                goToStep(2);
              },
              nextDisabled: !searchParams.departureId,
            })}
          </View>
        ) : null}

        {/* Step 2 — Куда */}
        {wizardStep === 2 ? (
          <View style={[styles.stepCard, shadows.cardRaised, { backgroundColor: theme.card }]}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {i18n.t('search.wizardStepTo')}
            </Text>
            <TouchableOpacity
              style={[
                styles.pickerRow,
                { backgroundColor: theme.secondaryBackground, borderColor: theme.border },
              ]}
              onPress={() => {
                if (!searchParams.departureId) {
                  Alert.alert(i18n.t('common.error'), 'Сначала выберите город вылета');
                  return;
                }
                openCountryPicker();
              }}
              activeOpacity={0.7}
              disabled={!searchParams.departureId}
              accessibilityRole="button"
              accessibilityLabel={
                selectedCountry?.name
                  ? `${i18n.t('search.countryLabel')}: ${selectedCountry.name}`
                  : i18n.t('search.selectCountry')
              }
            >
              <View style={[styles.pickerIcon, { backgroundColor: BRAND.blueSubtle }]} accessible={false}>
                <Ionicons name="earth-outline" size={18} color={theme.primary} />
              </View>
              <View style={styles.pickerText} importantForAccessibility="no-hide-descendants">
                <Text style={[styles.pickerLabel, { color: theme.secondaryText }]}>
                  {i18n.t('search.countryLabel')}
                </Text>
                <Text
                  style={[
                    styles.pickerValue,
                    { color: selectedCountry ? theme.text : theme.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {selectedCountry?.name ||
                    (searchParams.departureId
                      ? i18n.t('search.selectCountry')
                      : 'Сначала выберите город вылета')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
            </TouchableOpacity>
            {renderNavRow({
              onBack: () => goToStep(1),
              onNext: () => {
                if (!searchParams.countryId) {
                  Alert.alert(i18n.t('common.error'), 'Выберите страну');
                  openCountryPicker();
                  return;
                }
                goToStep(3);
              },
              nextDisabled: !searchParams.countryId,
            })}
          </View>
        ) : null}

        {/* Step 3 — Когда (календарь INLINE) */}
        {wizardStep === 3 ? (
          <View style={[styles.stepCard, shadows.cardRaised, { backgroundColor: theme.card }]}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {i18n.t('search.wizardStepWhen')}
            </Text>
            <Text style={[styles.whenExplain, { color: theme.secondaryText }]}>
              {i18n.t('search.wizardWhenExplain')}
            </Text>
            {whenSummary ? (
              <Text style={[styles.whenSelected, { color: theme.primary }]}>{whenSummary}</Text>
            ) : null}
            <View style={styles.calendarWrap}>
              <DateRangeCalendar
                variant="inline"
                onDateRangeSelect={(dateFrom, dateTo) => {
                  updateSearchParam('dateFrom', dateFrom);
                  updateSearchParam('dateTo', dateTo);
                  if (!nightsTouched) {
                    const a = new Date(dateFrom + 'T12:00:00');
                    const b = new Date(dateTo + 'T12:00:00');
                    const diff = Math.max(
                      1,
                      Math.round((b.getTime() - a.getTime()) / 86400000),
                    );
                    const from = Math.max(1, Math.min(28, diff - 1));
                    const to = Math.max(from, Math.min(28, diff + 1));
                    updateSearchParam('nightsFrom', from);
                    updateSearchParam('nightsTo', to);
                  }
                }}
                initialDateFrom={searchParams.dateFrom}
                initialDateTo={searchParams.dateTo}
                minDate={calendarMinDate}
              />
            </View>
            {renderNavRow({
              onBack: () => goToStep(2),
              onNext: () => {
                if (!searchParams.dateFrom || !searchParams.dateTo) {
                  Alert.alert(i18n.t('common.error'), 'Выберите даты вылета');
                  return;
                }
                goToStep(4);
              },
              nextDisabled: !searchParams.dateFrom || !searchParams.dateTo,
            })}
          </View>
        ) : null}

        {/* Step 4 — Ночи */}
        {wizardStep === 4 ? (
          <View style={[styles.stepCard, shadows.cardRaised, { backgroundColor: theme.card }]}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {i18n.t('search.wizardStepNights')}
            </Text>
            {searchParams.dateFrom && searchParams.dateTo && !nightsTouched ? (
              <Text style={[styles.whenExplain, { color: theme.secondaryText }]}>
                {`По датам: ${formatNightsRangeRu(
                  searchParams.nightsFrom ?? 7,
                  searchParams.nightsTo ?? 11,
                )}. Можно изменить.`}
              </Text>
            ) : null}
            <View style={styles.nightsGrid}>
              {NIGHT_PRESETS.map((preset) => {
                const selected =
                  searchParams.nightsFrom === preset.from &&
                  searchParams.nightsTo === preset.to;
                return (
                  <TouchableOpacity
                    key={preset.label}
                    style={[
                      styles.nightsChip,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected
                          ? `${theme.primary}18`
                          : theme.secondaryBackground,
                      },
                    ]}
                    onPress={() => {
                      setNightsTouched(true);
                      updateSearchParam('nightsFrom', preset.from);
                      updateSearchParam('nightsTo', preset.to);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.nightsChipText,
                        { color: selected ? theme.primary : theme.text },
                      ]}
                    >
                      {preset.label} {i18n.t('form.nightsShort')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {renderNavRow({
              onBack: () => goToStep(3),
              onNext: () => goToStep(5),
            })}
          </View>
        ) : null}

        {/* Step 5 — Туристы + опционально регион/питание */}
        {wizardStep === 5 ? (
          <View style={[styles.stepCard, shadows.cardRaised, { backgroundColor: theme.card }]}>
            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {i18n.t('search.wizardStepTourists')}
            </Text>

            <View
              style={[
                styles.touristsCard,
                { backgroundColor: theme.secondaryBackground, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.passengerLabel, { color: theme.secondaryText }]}>
                {i18n.t('form.adults')}
              </Text>
              <View style={styles.counter}>
                <TouchableOpacity
                  style={[styles.counterButton, { borderColor: theme.border, backgroundColor: theme.card }]}
                  onPress={() => {
                    const current = searchParams.adults || 2;
                    updateSearchParam('adults', Math.max(1, current - 1));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={16} color={theme.primary} />
                </TouchableOpacity>
                <Text style={[styles.counterText, { color: theme.text }]}>
                  {searchParams.adults || 2}
                </Text>
                <TouchableOpacity
                  style={[styles.counterButton, { borderColor: theme.border, backgroundColor: theme.card }]}
                  onPress={() => {
                    const current = searchParams.adults || 2;
                    updateSearchParam('adults', Math.min(10, current + 1));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={16} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addChildBtn, { borderColor: theme.primary }]}
              onPress={addChild}
              activeOpacity={0.7}
              disabled={childrenAgesInput.length >= 10}
            >
              <Ionicons name="person-add-outline" size={18} color={theme.primary} />
              <Text style={[styles.addChildBtnText, { color: theme.primary }]}>
                {i18n.t('search.addChild')}
              </Text>
            </TouchableOpacity>

            {childrenAgesInput.length > 0 ? (
              <View style={styles.childrenList}>
                <Text style={[styles.passengerLabel, { color: theme.secondaryText, marginBottom: spacing.xs }]}>
                  {i18n.t('search.childrenAge')}
                </Text>
                {childrenAgesInput.map((age, idx) => (
                  <View
                    key={`child_${idx}`}
                    style={[styles.childRow, { borderColor: theme.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.pickerLabel,
                          { color: theme.secondaryText, marginBottom: 6 },
                        ]}
                      >
                        {i18n.t('search.childAgeLabel')} {idx + 1}
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
                    <TouchableOpacity
                      onPress={() => removeChild(idx)}
                      style={styles.removeChildBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Удалить ребёнка"
                    >
                      <Ionicons name="trash-outline" size={20} color={theme.error || '#E53935'} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={[styles.optionalTitle, { color: theme.secondaryText }]}>
              Регион и питание (необязательно)
            </Text>

            <TouchableOpacity
              style={[
                styles.pickerRow,
                { backgroundColor: theme.secondaryBackground, borderColor: theme.border },
              ]}
              onPress={() => {
                if (!searchParams.countryId) {
                  Alert.alert(i18n.t('common.error'), i18n.t('search.selectCountry'));
                  return;
                }
                setShowRegionModal(true);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.pickerIcon, { backgroundColor: BRAND.blueSubtle }]}>
                <Ionicons name="map-outline" size={18} color={theme.primary} />
              </View>
              <View style={styles.pickerText}>
                <Text style={[styles.pickerLabel, { color: theme.secondaryText }]}>Регион</Text>
                <Text
                  style={[
                    styles.pickerValue,
                    { color: selectedRegion ? theme.text : theme.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {selectedRegion?.name || i18n.t('search.anyRegion')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.pickerRow,
                {
                  backgroundColor: theme.secondaryBackground,
                  borderColor: theme.border,
                  marginTop: spacing.sm,
                },
              ]}
              onPress={() => setShowMealModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.pickerIcon, { backgroundColor: BRAND.blueSubtle }]}>
                <Ionicons name="restaurant-outline" size={18} color={theme.primary} />
              </View>
              <View style={styles.pickerText}>
                <Text style={[styles.pickerLabel, { color: theme.secondaryText }]}>Питание</Text>
                <Text
                  style={[
                    styles.pickerValue,
                    { color: selectedMeal ? theme.text : theme.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {selectedMeal
                    ? selectedMeal.russianName || selectedMeal.fullRussianName || selectedMeal.name
                    : i18n.t('search.anyMeal')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
            </TouchableOpacity>

            <Text style={[styles.guestsSummary, { color: theme.secondaryText }]}>
              {guestsSummary} · {nightsSummary}
            </Text>

            {renderNavRow({
              onBack: () => goToStep(4),
            })}

            <PrimaryButton
              title={i18n.t('search.findTours')}
              onPress={() => void handleSearch()}
              loading={isSearching}
              variant="cta"
              iconLeft={<Ionicons name="search" size={20} color="#fff" />}
              style={styles.findBtn}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* Departure Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={showDepartureModal}
        onRequestClose={() => setShowDepartureModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDepartureModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.card,
                maxHeight: windowHeight * 0.78,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {i18n.t('search.selectCity')}
              </Text>
              <TouchableOpacity onPress={() => setShowDepartureModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
              {departures.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.modalItem, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    updateSearchParam('departureId', item.id);
                    updateSearchParam('countryId', undefined);
                    updateSearchParam('regionIds', undefined);
                    void savePreferredDepartureId(item.id);
                    setShowDepartureModal(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: theme.text }]}>{item.name}</Text>
                  {searchParams.departureId === item.id ? (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Country Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={showCountryModal}
        onRequestClose={() => setShowCountryModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCountryModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.card,
                maxHeight: windowHeight * 0.78,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {i18n.t('search.selectCountry')}
              </Text>
              <TouchableOpacity onPress={() => setShowCountryModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
              {countriesLoading ? (
                <ActivityIndicator color={theme.primary} style={styles.modalLoading} />
              ) : countries.length === 0 ? (
                <Text style={[styles.modalEmpty, { color: theme.secondaryText }]}>
                  Нет направлений для этого города вылета
                </Text>
              ) : (
                countries.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.modalItem, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      updateSearchParam('countryId', item.id);
                      updateSearchParam('regionIds', undefined);
                      setShowCountryModal(false);
                    }}
                  >
                    <Text style={[styles.modalItemText, { color: theme.text }]}>{item.name}</Text>
                    {searchParams.countryId === item.id ? (
                      <Ionicons name="checkmark" size={20} color={theme.primary} />
                    ) : null}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Region Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={showRegionModal}
        onRequestClose={() => setShowRegionModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowRegionModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.card,
                maxHeight: windowHeight * 0.78,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {i18n.t('search.selectRegion')}
              </Text>
              <TouchableOpacity onPress={() => setShowRegionModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
              <TouchableOpacity
                style={[styles.modalItem, { borderBottomColor: theme.border }]}
                onPress={() => {
                  updateSearchParam('regionIds', undefined);
                  setShowRegionModal(false);
                }}
              >
                <Text style={[styles.modalItemText, { color: theme.text }]}>
                  {i18n.t('search.anyRegion')}
                </Text>
                {!searchParams.regionIds?.length ? (
                  <Ionicons name="checkmark" size={20} color={theme.primary} />
                ) : null}
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
                  <Text style={[styles.modalItemText, { color: theme.text }]}>{region.name}</Text>
                  {searchParams.regionIds?.[0] === region.id ? (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Meal Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={showMealModal}
        onRequestClose={() => setShowMealModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMealModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.card,
                maxHeight: windowHeight * 0.78,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {i18n.t('search.selectMeal')}
              </Text>
              <TouchableOpacity onPress={() => setShowMealModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
              <TouchableOpacity
                style={[styles.modalItem, { borderBottomColor: theme.border }]}
                onPress={() => {
                  updateSearchParam('meal', undefined);
                  setShowMealModal(false);
                }}
              >
                <Text style={[styles.modalItemText, { color: theme.text }]}>
                  {i18n.t('search.anyMeal')}
                </Text>
                {!searchParams.meal ? (
                  <Ionicons name="checkmark" size={20} color={theme.primary} />
                ) : null}
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
                  <Text style={[styles.modalItemText, { color: theme.text }]}>
                    {meal.russianName || meal.fullRussianName || meal.name}
                  </Text>
                  {searchParams.meal === meal.id ? (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  pageTitle: {
    ...typography.h2,
    flex: 1,
    paddingRight: spacing.sm,
  },
  supportBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  content: {
    flex: 1,
  },
  heroSubtitle: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  stepHint: {
    ...typography.body,
    marginBottom: spacing.md,
  },
  chipsScroll: {
    marginBottom: spacing.sm,
    maxHeight: 48,
  },
  chipsContent: {
    alignItems: 'center',
    paddingRight: spacing.md,
    gap: 4,
  },
  summaryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full ?? radius.lg,
    borderWidth: 1,
    maxWidth: 148,
    flexShrink: 1,
  },
  summaryChipText: {
    ...typography.captionBold,
  },
  chipArrow: {
    marginHorizontal: 2,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inlineLoadingText: {
    ...typography.caption,
  },
  stepCard: {
    borderRadius: radius.xxl,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  stepTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  whenExplain: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  whenSelected: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  calendarWrap: {
    marginBottom: spacing.sm,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  pickerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerText: {
    flex: 1,
    minWidth: 0,
  },
  pickerLabel: {
    ...typography.small,
    marginBottom: 2,
  },
  pickerValue: {
    ...typography.bodyBold,
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  navBtn: {
    flex: 1,
  },
  nightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  nightsChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minWidth: '30%',
    alignItems: 'center',
  },
  nightsChipText: {
    ...typography.captionBold,
  },
  touristsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  passengerLabel: {
    ...typography.body,
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
  addChildBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    marginBottom: spacing.sm,
  },
  addChildBtnText: {
    ...typography.captionBold,
  },
  childrenList: {
    marginBottom: spacing.md,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  childAgeInput: {
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  removeChildBtn: {
    padding: spacing.sm,
    marginBottom: 2,
  },
  optionalTitle: {
    ...typography.captionBold,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  guestsSummary: {
    ...typography.caption,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  findBtn: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: '100%',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalLoading: {
    marginVertical: 28,
  },
  modalEmpty: {
    padding: 20,
    textAlign: 'center',
    fontSize: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
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
  },
  modalItemText: {
    fontSize: 16,
  },
});
