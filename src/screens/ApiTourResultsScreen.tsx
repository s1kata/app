import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  StatusBar,
  InteractionManager,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PercentageLoader from '../components/PercentageLoader';
import CachedImage from '../components/ui/CachedImage';
import ScreenHeader from '../components/ui/ScreenHeader';
import PrimaryButton from '../components/ui/PrimaryButton';
import TourPriceLabel from '../components/ui/TourPriceLabel';
import { BRAND, radius, shadows, spacing, typography } from '../config/designSystem';
import { navigateRoot, safeGoBack } from '../utils/navHelpers';
import { formatAdultsRu, formatNightsRangeRu, formatNightsRu } from '../utils/pluralRu';

import { tourvisorApi } from '../services/TourvisorApiService';
import { TourHotel, TourSearchStatus, TourSearchParams, Tour } from '../types/tourvisor';
import { useAppContext } from '../contexts/AppContext';
import { cacheService, CacheType } from '../services/CacheService';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import { i18n } from '../config/i18n';
import {
  getTourSearchCacheKey,
  applyTourSearchPriceFilter,
  isTourSearchStatusError,
  isTourSearchStatusFinished,
  canFetchTourSearchResultsEarly,
  isTransientTourvisorError,
  TOUR_SEARCH_LIMIT,
  TOUR_SEARCH_MAX_WAIT_MS,
  getTourSearchPollIntervalMs,
  sanitizeTourHotelsFromCache,
} from '../utils/tourSearchCache';
import { getFromSharedCache } from '../services/TourvisorFirestoreCache';
import { hotelPictureCache } from '../services/HotelPictureCache';
import { saveTourSearchToAllCaches, searchTours } from '../hooks/useTourSearch';
import { preCacheTourDetailsFromSearchResults, cacheTourFromSearchResult, buildTourOutputFromSearchResult } from '../utils/tourDetailsCache';
import { FavoritesService } from '../services/FavoritesService';
import AuthRequiredCard from '../components/ux/AuthRequiredCard';
import EditSearchSheet from '../components/EditSearchSheet';
import { logger } from '../utils/logger';
import { isPlausiblePackagePrice, pickSaneCheapestTour } from '../utils/tourPriceSanity';
import { validateTourSearchParams } from '../utils/validateTourSearchParams';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import type { ApiTourResultsRouteParams } from '../navigation/types';

type ApiTourResultsScreenProps = {
  navigation: NavigationProp<Record<string, object | undefined>> & {
    navigate: (screen: string, params?: object) => void;
    goBack: () => void;
    replace: (screen: string, params?: object) => void;
  };
  route: RouteProp<{ ApiTourResults: ApiTourResultsRouteParams }, 'ApiTourResults'>;
};

type ResultsTheme = {
  card: string;
  border: string;
  text: string;
  secondaryText: string;
  primary: string;
  accent?: string;
  deep?: string;
  secondaryBackground: string;
  error: string;
};

type TourResultCardProps = {
  hotel: TourHotel;
  theme: ResultsTheme;
  currency: Currency;
  favoriteIds: Set<string>;
  onTourPress: (tourId: string, hotel: TourHotel, tour: Tour) => void;
  onFavoritePress: (hotel: TourHotel, tour: Tour) => void;
  formatDate: (dateStr: string) => string;
  mediaWidth: number;
};

const TourResultCard = memo(function TourResultCard({
  hotel,
  theme,
  currency,
  favoriteIds,
  onTourPress,
  onFavoritePress,
  formatDate,
  mediaWidth,
}: TourResultCardProps) {
  if (!hotel?.id || !hotel.name || !Array.isArray(hotel.tours) || hotel.tours.length === 0) {
    return null;
  }

  const countryIdHint = Number(hotel.country?.id) || null;
  const visibleTours = hotel.tours.filter(
    (t) =>
      t &&
      t.operator?.name &&
      t.meal?.name &&
      typeof t.price === 'number' &&
      t.date &&
      isPlausiblePackagePrice(t.price, {
        currency: t.currency || hotel.currency,
        countryId: countryIdHint,
        nights: t.nights,
      }),
  );
  if (visibleTours.length === 0) return null;

  const cheapest =
    pickSaneCheapestTour(
      visibleTours.map((t) => ({
        ...t,
        countryId: countryIdHint,
      })),
      countryIdHint,
    ) || visibleTours[0];
  const stars = Math.min(5, Math.max(0, Math.round(Number((hotel as any).stars || hotel.rating || 0))));
  const currencySymbol = settingsService.getCurrencySymbol(currency);
  const mealLabel =
    cheapest.meal?.russianName ||
    cheapest.meal?.fullRussianName ||
    cheapest.meal?.name ||
    '';
  const locationLabel = [hotel.region?.name, hotel.subRegion?.name]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .filter((name, idx, arr) => arr.findIndex((x) => x.toLowerCase() === name.toLowerCase()) === idx)
    .join(', ');

  return (
    <View style={[styles.card, shadows.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.cardMedia, { width: mediaWidth, height: Math.round(mediaWidth * 1.14) }]}>
          {hotel.picturelink ? (
            <CachedImage
              source={hotel.picturelink}
              style={styles.cardImage}
              contentFit="cover"
              recyclingKey={`hotel-${hotel.id}`}
            />
          ) : (
            <View style={[styles.cardImagePlaceholder, { backgroundColor: theme.secondaryBackground }]}>
              <Ionicons name="image-outline" size={28} color={theme.secondaryText} />
            </View>
          )}
          <TouchableOpacity
            onPress={() => onFavoritePress(hotel, cheapest)}
            style={styles.heartBadge}
            activeOpacity={0.7}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              favoriteIds.has(String(cheapest.id))
                ? 'Убрать из избранного'
                : 'Добавить в избранное'
            }
          >
            <Ionicons
              name={favoriteIds.has(String(cheapest.id)) ? 'heart' : 'heart-outline'}
              size={16}
              color={favoriteIds.has(String(cheapest.id)) ? BRAND.orange : theme.deep}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.hotelName, { color: theme.deep || theme.text }]} numberOfLines={3}>
            {hotel.name}
          </Text>
          <View style={styles.starsRow}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Ionicons
                key={i}
                name="star"
                size={11}
                color={i < stars ? '#F5A623' : theme.border}
              />
            ))}
          </View>
          {locationLabel ? (
            <View style={styles.metaLine}>
              <Ionicons name="location-outline" size={13} color={theme.secondaryText} />
              <Text style={[styles.hotelRegion, { color: theme.secondaryText }]} numberOfLines={1}>
                {locationLabel}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaChips}>
            {mealLabel ? (
              <View style={[styles.metaChip, { backgroundColor: BRAND.blueSubtle }]}>
                <Ionicons name="restaurant-outline" size={12} color={BRAND.blue} />
                <Text style={[styles.metaChipText, { color: BRAND.navy }]} numberOfLines={1}>
                  {mealLabel}
                </Text>
              </View>
            ) : null}
            <View style={[styles.metaChip, { backgroundColor: BRAND.blueSubtle }]}>
              <Ionicons name="moon-outline" size={12} color={BRAND.blue} />
              <Text style={[styles.metaChipText, { color: BRAND.navy }]}>
                {formatNightsRu(cheapest.nights)}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.toursList}>
        {visibleTours.map((tour, idx) => {
          const amount = settingsService.convertPrice(
            tour.price,
            (tour.currency || 'RUB') as Currency,
            currency,
          );
          return (
            <TouchableOpacity
              key={`${tour.id}-${idx}`}
              style={[styles.tourRow, { borderColor: theme.border, backgroundColor: theme.secondaryBackground }]}
              onPress={() => onTourPress(tour.id, hotel, tour)}
              activeOpacity={0.7}
            >
              <View style={styles.tourLeft}>
                <Text style={[styles.tourOperator, { color: BRAND.blue }]} numberOfLines={1}>
                  {tour.operator.name}
                </Text>
                <Text style={[styles.tourMeta, { color: theme.secondaryText }]} numberOfLines={1}>
                  {formatAdultsRu(tour.adults)} · {formatDate(tour.date)}
                </Text>
                <TourPriceLabel
                  amount={amount}
                  currencySymbol={currencySymbol}
                  caption="за тур"
                  style={{ marginTop: 4 }}
                />
              </View>
              <View style={styles.selectBtn}>
                <Text style={styles.selectBtnText}>Выбрать</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

export default function ApiTourResultsScreen({ navigation, route }: ApiTourResultsScreenProps) {
  const { theme, isDark, user, currency } = useAppContext();
  const { width: screenWidth } = useWindowDimensions();
  const mediaWidth = Math.max(96, Math.min(120, Math.round(screenWidth * 0.28)));
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  const params = route.params ?? {};
  const searchId = params.searchId ?? -1;
  const searchParams = params.searchParams;
  const useCache = params.useCache === true;
  const runSearch = params.runSearch === true;
  const collectionTitle = typeof params.collectionTitle === 'string' ? params.collectionTitle.trim() : '';
  const ideaId = typeof params.ideaId === 'string' ? params.ideaId : '';

  const [tours, setTours] = useState<TourHotel[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showAuthCard, setShowAuthCard] = useState(false);
  const [status, setStatus] = useState<TourSearchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showingStaleHint, setShowingStaleHint] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlightRef = useRef(false);
  const pollStartedAtRef = useRef(0);
  const pollErrorStreakRef = useRef(0);
  const lastSearchStatusRef = useRef<TourSearchStatus | null>(null);

  const schedulePreCache = useCallback((list: TourHotel[], currencyCode: string) => {
    if (!list.length) return;
    InteractionManager.runAfterInteractions(() => {
      preCacheTourDetailsFromSearchResults(list, currencyCode).catch(() => {});
    });
  }, []);

  const applyTourList = useCallback(
    (raw: unknown, currencyCode: string): TourHotel[] => {
      try {
        const valid = sanitizeTourHotelsFromCache(raw);
        const shown = applyTourSearchPriceFilter(valid, searchParams);
        setTours(shown);
        setHasMore(false);
        if (shown.length > 0) {
          schedulePreCache(shown, currencyCode);
          void hotelPictureCache.ingestFromTours(
            shown.flatMap((h) =>
              (h.tours || []).map((t) => ({
                hotel: {
                  id: h.id,
                  picturelink: h.picturelink,
                },
                picture: h.picturelink,
              })),
            ).concat(
              shown.map((h) => ({
                hotel: { id: h.id, picturelink: h.picturelink },
                picture: h.picturelink,
              })),
            ),
          ).catch(() => {});
        }
        return valid;
      } catch (e) {
        logger.warn('[ApiTourResults] applyTourList failed:', (e as Error)?.message || e);
        return [];
      }
    },
    [schedulePreCache, searchParams],
  );

  const fetchResultsForSearchId = useCallback(async (id: number): Promise<TourHotel[]> => {
    const statusHint = lastSearchStatusRef.current;
    for (let emptyRetry = 0; emptyRetry < 4; emptyRetry++) {
      let list: TourHotel[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          list = await tourvisorApi.getTourSearchResults(id, TOUR_SEARCH_LIMIT);
          break;
        } catch (e) {
          if (!isTransientTourvisorError(e) || attempt >= 2) throw e;
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
      if (list.length > 0) return list;
      if (!statusHint?.minPrice || statusHint.minPrice <= 0 || emptyRetry >= 3) return list;
      await new Promise((r) => setTimeout(r, 1500 * (emptyRetry + 1)));
    }
    return [];
  }, []);

  /** Кэш только при полном совпадении параметров и свежести до 2 недель (Firestore + localStorage).
   * soft: при промахе не трогаем isLoading (идёт live-поиск) — иначе мигает «Туры не найдены».
   */
  const loadFromCache = useCallback(async (mode: 'exclusive' | 'soft' = 'exclusive'): Promise<boolean> => {
    if (!searchParams) {
      if (mode === 'exclusive') setIsLoading(false);
      return false;
    }
    const key = getTourSearchCacheKey(searchParams, TOUR_SEARCH_LIMIT);
    try {
      let cached = await getFromSharedCache(searchParams, TOUR_SEARCH_LIMIT);
      if (!cached?.length) {
        cached = await cacheService.get<TourHotel[]>(CacheType.SEARCH_RESULTS, key, false);
      }
      if (!mountedRef.current) return false;
      const raw = cached ?? [];
      const valid = sanitizeTourHotelsFromCache(raw);
      if (Array.isArray(raw) && raw.length > 0 && valid.length === 0) {
        await cacheService.remove(CacheType.SEARCH_RESULTS, key).catch(() => {});
        if (mode === 'exclusive') {
          setTours([]);
          setLoadError(i18n.t('search.cacheCorrupted'));
          setIsLoading(false);
        }
        return false;
      }
      const shown = applyTourSearchPriceFilter(valid, searchParams);
      // Пустой список после фильтра бюджета — не считаем «готово», иначе empty-flash
      if (!shown.length) {
        if (mode === 'exclusive') {
          setTours([]);
          setIsLoading(false);
        }
        return false;
      }
      setTours(shown);
      setHasMore(false);
      schedulePreCache(shown, searchParams.currency || 'RUB');
      setIsLoading(false);
      return true;
    } catch {
      if (mountedRef.current && mode === 'exclusive') {
        setTours([]);
        setIsLoading(false);
      }
      return false;
    }
  }, [searchParams, schedulePreCache]);

  /** Показать устаревший кэш сразу, пока идёт опрос Tourvisor. */
  const loadStaleCacheIfAny = useCallback(async (): Promise<boolean> => {
    if (!searchParams) return false;
    const key = getTourSearchCacheKey(searchParams, TOUR_SEARCH_LIMIT);
    try {
      let cached = await getFromSharedCache(searchParams, TOUR_SEARCH_LIMIT);
      if (!cached?.length) {
        cached = await cacheService.get<TourHotel[]>(CacheType.SEARCH_RESULTS, key, false);
      }
      if (!mountedRef.current || !cached?.length) return false;
      const valid = sanitizeTourHotelsFromCache(cached);
      if (valid.length === 0) return false;
      const shown = applyTourSearchPriceFilter(valid, searchParams);
      if (shown.length === 0) return false;
      setTours(shown);
      setHasMore(false);
      setShowingStaleHint(true);
      setIsLoading(false);
      schedulePreCache(shown, searchParams.currency || 'RUB');
      return true;
    } catch {
      return false;
    }
  }, [searchParams, schedulePreCache]);

  const loadFromApi = useCallback(
    async () => {
      if (searchId === -1 || !searchParams) return;
      try {
        const list = await fetchResultsForSearchId(searchId);
        if (!mountedRef.current) return;
        setLoadError(null);
        setShowingStaleHint(false);
        const valid = applyTourList(list, searchParams.currency || 'RUB');
        if (valid.length > 0 && searchParams) {
          saveTourSearchToAllCaches(searchParams, valid, TOUR_SEARCH_LIMIT).catch(() => {});
        }
      } catch (e: unknown) {
        const is429 =
          (e as Error)?.message?.includes('429') || (e as Error)?.message?.includes('Rate limit');
        if (is429 && searchParams && mountedRef.current) {
          // Не гасим лоадер до paint: иначе кадр «Туры не найдены»
          const painted = await loadFromCache('soft');
          if (!painted && mountedRef.current) {
            setLoadError(i18n.t('search.errorSearchFailed'));
            setIsLoading(false);
          }
          return;
        }
        if (mountedRef.current) {
          setTours([]);
          setHasMore(false);
          setLoadError((e as Error)?.message || i18n.t('search.errorSearchFailed'));
          setIsLoading(false);
        }
        return;
      }
      if (mountedRef.current) setIsLoading(false);
    },
    [searchId, searchParams, fetchResultsForSearchId, applyTourList, loadFromCache]
  );

  useEffect(() => {
    FavoritesService.getInstance().getFavoriteTours().then((favs) => {
      if (mountedRef.current) setFavoriteIds(new Set(favs.map((f) => String(f.id))));
    });
  }, []);

  const handleFavoritePress = useCallback(
    async (hotel: TourHotel, tour: Tour) => {
      try {
        if (isGuest || !user) {
          setShowAuthCard(true);
          return;
        }
        const tourOutput = buildTourOutputFromSearchResult(hotel, tour);
        const result = await FavoritesService.getInstance().toggleTourFavorite(tourOutput);
        if (result.success && mountedRef.current) {
          const tourId = String(tour.id);
          setFavoriteIds((prev) => {
            const next = new Set(prev);
            if (result.isFavorite) next.add(tourId);
            else next.delete(tourId);
            return next;
          });
        } else if (result.error) {
          const { Alert } = await import('react-native');
          Alert.alert(i18n.t('common.error'), result.error);
        }
      } catch (error) {
        const { Alert } = await import('react-native');
        Alert.alert(i18n.t('common.error'), i18n.t('auth.connectionError'));
      }
    },
    [isGuest, user, navigation]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  const runSearchAndPopulate = useCallback(async () => {
    if (!searchParams || !mountedRef.current) return;

    const validation = validateTourSearchParams(searchParams);
    if (!validation.ok) {
      setLoadError(validation.error || i18n.t('search.errorSearchFailed'));
      setIsLoading(false);
      return;
    }

    setLoadError(null);
    setLoaderProgress(5);
    if (mountedRef.current) setIsLoading(true);

    try {
      const painted =
        (await loadStaleCacheIfAny()) || (await loadFromCache('soft'));
      if (painted && mountedRef.current) {
        setShowingStaleHint(true);
      }
    } catch {
      /* ignore cache paint errors */
    }

    let p = 5;
    progressIntervalRef.current = setInterval(() => {
      p = Math.min(p + 1.5 + Math.random() * 1.5, 18);
      setLoaderProgress((prev) => Math.max(prev, p));
    }, 250);
    const applyProgress = (value: number) => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoaderProgress((prev) => Math.max(prev, Math.max(5, Math.min(99, value))));
    };
    const paintPartial = (partial: TourHotel[]) => {
      if (!mountedRef.current || !partial?.length) return;
      try {
        applyTourList(partial, searchParams.currency || 'RUB');
        setShowingStaleHint(true);
        setIsLoading(false);
      } catch (e) {
        logger.warn('[ApiTourResults] paintPartial failed:', (e as Error)?.message || e);
      }
    };
    try {
      const skipFreshCache = !useCache;
      let list = await searchTours(
        searchParams,
        TOUR_SEARCH_LIMIT,
        skipFreshCache,
        applyProgress,
        paintPartial,
      );
      if (!list.length) {
        logger.warn('[ApiTourResults] empty results, forcing live Tourvisor search');
        if (mountedRef.current) setIsLoading(true);
        list = await searchTours(
          searchParams,
          TOUR_SEARCH_LIMIT,
          true,
          applyProgress,
          paintPartial,
        );
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoaderProgress(100);
      if (!mountedRef.current) return;
      setLoadError(null);
      setShowingStaleHint(false);
      const valid = applyTourList(list, searchParams.currency || 'RUB');
      if (valid.length > 0 && searchParams) {
        saveTourSearchToAllCaches(searchParams, valid, TOUR_SEARCH_LIMIT).catch(() => {});
      }
    } catch (e: unknown) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (mountedRef.current) {
        setTours((prev) => {
          if (prev.length === 0) {
            setLoadError((e as Error)?.message || i18n.t('search.errorSearchFailed'));
          }
          return prev;
        });
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [searchParams, applyTourList, loadFromCache, loadStaleCacheIfAny, useCache]);

  const handleRetrySearch = useCallback(() => {
    if (!searchParams) return;
    setLoadError(null);
    setTours([]);
    setIsLoading(true);
    if (runSearch) {
      runSearchAndPopulate();
      return;
    }
    navigation.replace('ApiTourResults', {
      searchId: -1,
      searchParams,
      useCache: false,
      runSearch: true,
    });
  }, [searchParams, runSearch, runSearchAndPopulate, navigation]);

  useEffect(() => {
    if (!searchParams) {
      setIsLoading(false);
      return;
    }

    if (runSearch) {
      runSearchAndPopulate();
      return;
    }

    if (searchId === -1) {
      void (async () => {
        // soft: не гасим лоадер на промахе — иначе кадр «Туры не найдены» до live-поиска
        const hasCachedResults = await loadFromCache('soft');
        if (!hasCachedResults && mountedRef.current) {
          await runSearchAndPopulate();
        }
      })();
      return;
    }

    let cancelled = false;
    setLoadError(null);
    setShowingStaleHint(false);
    setIsLoading(true);
    lastSearchStatusRef.current = null;
    pollStartedAtRef.current = Date.now();
    pollErrorStreakRef.current = 0;

    if (useCache) {
      void loadStaleCacheIfAny();
    }

    const stopPolling = () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const stopPollingAndLoad = () => {
      stopPolling();
      loadFromApi();
    };

    const failPolling = (message: string) => {
      stopPolling();
      if (mountedRef.current) {
        setLoadError(message);
        setIsLoading(false);
      }
    };

    const pollStatus = async (): Promise<boolean> => {
      if (cancelled || !mountedRef.current) return true;

      const elapsed = Date.now() - pollStartedAtRef.current;
      if (elapsed >= TOUR_SEARCH_MAX_WAIT_MS) {
        stopPollingAndLoad();
        return true;
      }

      try {
        const st = await tourvisorApi.getTourSearchStatus(searchId, false);
        if (cancelled || !mountedRef.current) return true;
        pollErrorStreakRef.current = 0;
        lastSearchStatusRef.current = st;
        setStatus(st);

        if (isTourSearchStatusError(st.status)) {
          failPolling(i18n.t('search.errorProgress'));
          return true;
        }

        if (canFetchTourSearchResultsEarly(st, elapsed) || isTourSearchStatusFinished(st.status, st.progress)) {
          stopPollingAndLoad();
          return true;
        }
        return false;
      } catch (e: unknown) {
        const err = e as Error;
        const is429 = err?.message?.includes('429') || err?.message?.includes('Rate limit');
        if (is429 && searchParams && mountedRef.current) {
          stopPolling();
          const painted = await loadFromCache('soft');
          if (!painted && mountedRef.current) {
            // Кэша нет — не показываем empty, догружаем через live-поиск
            await runSearchAndPopulate();
          }
          return true;
        }

        if (isTransientTourvisorError(e)) {
          pollErrorStreakRef.current += 1;
          if (pollErrorStreakRef.current < 6) return false;
        }

        failPolling(err?.message || i18n.t('search.errorSearchFailed'));
        return true;
      }
    };

    const scheduleNextPoll = (delayMs: number) => {
      if (cancelled) return;
      pollTimerRef.current = setTimeout(() => {
        void (async () => {
          if (cancelled || pollInFlightRef.current) {
            if (!cancelled) {
              const interval = await getTourSearchPollIntervalMs();
              scheduleNextPoll(interval);
            }
            return;
          }
          pollInFlightRef.current = true;
          let finished = false;
          try {
            finished = await pollStatus();
          } finally {
            pollInFlightRef.current = false;
          }
          if (!cancelled && !finished) {
            const interval = await getTourSearchPollIntervalMs();
            scheduleNextPoll(interval);
          }
        })();
      }, delayMs);
    };

    scheduleNextPoll(400);

    const maxWaitTimer = setTimeout(() => {
      if (cancelled || !mountedRef.current) return;
      stopPollingAndLoad();
    }, TOUR_SEARCH_MAX_WAIT_MS);

    return () => {
      cancelled = true;
      clearTimeout(maxWaitTimer);
      stopPolling();
    };
  }, [searchId, useCache, searchParams, runSearch, runSearchAndPopulate, loadFromCache, loadFromApi, loadStaleCacheIfAny]);

  const handleTourPress = useCallback(
    (tourId: string, hotel?: TourHotel, tour?: Tour) => {
      if (hotel && tour) {
        cacheTourFromSearchResult(hotel, tour, searchParams?.currency || 'RUB').catch(() => {});
      }
      navigation.navigate('ApiTourDetails', {
        tourId,
        searchParams: searchParams ?? undefined,
      });
    },
    [navigation, searchParams]
  );

  const formatDate = useCallback(
    (dateStr: string) =>
      new Date(dateStr).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
      }),
    [],
  );

  const renderHotel = useCallback(
    ({ item: hotel }: { item: TourHotel }) => (
      <TourResultCard
        hotel={hotel}
        theme={theme}
        currency={currency}
        favoriteIds={favoriteIds}
        onTourPress={handleTourPress}
        onFavoritePress={handleFavoritePress}
        formatDate={formatDate}
        mediaWidth={mediaWidth}
      />
    ),
    [theme, currency, favoriteIds, handleTourPress, handleFavoritePress, formatDate, mediaWidth],
  );

  const filterChips = React.useMemo(() => {
    if (!searchParams) return [] as { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[];
    const chips: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [];
    if (searchParams.adults) {
      chips.push({
        key: 'adults',
        label: formatAdultsRu(searchParams.adults),
        icon: 'people-outline',
      });
    }
    if (searchParams.nightsFrom) {
      chips.push({
        key: 'nights',
        label: formatNightsRangeRu(searchParams.nightsFrom, searchParams.nightsTo),
        icon: 'moon-outline',
      });
    }
    if (searchParams.dateFrom && searchParams.dateTo) {
      chips.push({
        key: 'dates',
        label: `${formatDate(searchParams.dateFrom)} — ${formatDate(searchParams.dateTo)}`,
        icon: 'calendar-outline',
      });
    }
    return chips;
  }, [searchParams, formatDate]);

  const openChangeSearch = useCallback(() => {
    if (searchParams) {
      setEditSheetOpen(true);
      return;
    }
    safeGoBack(navigation, 'Search');
  }, [navigation, searchParams]);

  const applyEditedSearch = useCallback(
    (next: TourSearchParams) => {
      setEditSheetOpen(false);
      navigation.replace('ApiTourResults', {
        searchId: -1,
        searchParams: next,
        useCache: false,
        runSearch: true,
        collectionTitle: collectionTitle || undefined,
        ideaId: ideaId || undefined,
      });
    },
    [navigation, collectionTitle, ideaId],
  );

  const shiftNearAndSearch = useCallback(() => {
    if (!searchParams) return;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const from = new Date(today);
    from.setDate(from.getDate() + 7);
    const to = new Date(today);
    to.setDate(to.getDate() + 21);
    applyEditedSearch({
      ...searchParams,
      dateFrom: ymd(from),
      dateTo: ymd(to),
    });
  }, [searchParams, applyEditedSearch]);

  const openResultsMap = useCallback(() => {
    const pins = tours
      .map((h) => {
        const lat = typeof h.latitude === 'number' ? h.latitude : null;
        const lng = typeof h.longitude === 'number' ? h.longitude : null;
        if (lat == null || lng == null) return null;
        const toursList = h.tours || [];
        if (!toursList.length) return null;
        const countryIdHint = Number(h.country?.id) || null;
        const cheapest = pickSaneCheapestTour(
          toursList.map((t) => ({ ...t, countryId: countryIdHint })),
          countryIdHint,
        );
        if (!cheapest) return null;
        return {
          id: String(h.id),
          lat,
          lng,
          title: h.name || h.region?.name || '',
          price: Number(cheapest.price) || undefined,
          tourId: cheapest.id ? String(cheapest.id) : undefined,
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
    if (!pins.length) return;
    navigation.navigate('ToursMap', {
      title: collectionTitle || i18n.t('hotTours.onMap'),
      pins,
    });
  }, [tours, navigation, collectionTitle]);

  const renderHeader = () => (
    <View>
      <ScreenHeader
        title={collectionTitle || i18n.t('search.results')}
        subtitle={
          showingStaleHint
            ? i18n.t('search.updatingOffers')
            : searchParams?.dateFrom && searchParams?.dateTo
              ? `${formatDate(searchParams.dateFrom)} — ${formatDate(searchParams.dateTo)}`
              : collectionTitle
                ? i18n.t('search.collection')
                : undefined
        }
        onBack={() => safeGoBack(navigation, 'Home')}
        noSafeTop
      />
      {searchParams ? (
        <View style={[styles.contextCard, shadows.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.contextIcon, { backgroundColor: BRAND.blue }]}>
            <Ionicons name="airplane" size={18} color="#fff" />
          </View>
          <View style={styles.contextBody}>
            <Text style={[styles.contextTitle, { color: theme.deep || theme.text }]} numberOfLines={2}>
              {searchParams.adults ? formatAdultsRu(searchParams.adults) : i18n.t('search.results')}
            </Text>
            <Text style={[styles.contextSub, { color: theme.secondaryText }]} numberOfLines={2}>
              {[
                searchParams.nightsFrom
                  ? formatNightsRangeRu(searchParams.nightsFrom, searchParams.nightsTo)
                  : null,
                searchParams.dateFrom && searchParams.dateTo
                  ? `${formatDate(searchParams.dateFrom)} — ${formatDate(searchParams.dateTo)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.changeBtn, { borderColor: BRAND.blue }]}
            onPress={openChangeSearch}
            activeOpacity={0.8}
          >
            <Text style={[styles.changeBtnText, { color: BRAND.blue }]}>{i18n.t('search.edit')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {tours.length > 0 ? (
        <TouchableOpacity
          style={[styles.mapLink, { borderColor: theme.border }]}
          onPress={openResultsMap}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={16} color={BRAND.blue} />
          <Text style={[styles.mapLinkText, { color: BRAND.blue }]}>{i18n.t('hotTours.onMap')}</Text>
        </TouchableOpacity>
      ) : null}
      {filterChips.length > 0 ? (
        <View style={styles.chipsRow}>
          {filterChips.map((chip) => (
            <View
              key={chip.key}
              style={[styles.filterChip, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Ionicons name={chip.icon} size={13} color={BRAND.blue} />
              <Text style={[styles.filterChipText, { color: theme.deep || theme.text }]} numberOfLines={1}>
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const renderStaleHint = () => {
    if (!showingStaleHint) return null;
    return (
      <View style={[styles.statusBar, { backgroundColor: theme.secondaryBackground }]}>
        <Ionicons name="refresh-outline" size={18} color={theme.primary} />
        <Text style={[styles.statusText, { color: theme.secondaryText }]}>
          {i18n.t('search.staleCacheHint')}
        </Text>
      </View>
    );
  };

  const renderStatus = () => {
    if (!status || loadError) return null;
    const finished = isTourSearchStatusFinished(status.status, status.progress);
    const text = finished
      ? `Найдено: ${tours.length}`
      : isTourSearchStatusError(status.status)
        ? i18n.t('search.errorProgress')
        : `${i18n.t('search.progress')} ${status.progress ?? 0}%`;
    return (
      <View style={[styles.statusBar, { backgroundColor: theme.card }]}>
        <ActivityIndicator
          size="small"
          color={theme.primary}
          animating={!finished && !isTourSearchStatusError(status.status)}
        />
        <Text style={[styles.statusText, { color: theme.text }]}>{text}</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    // Пока идёт поиск — не показываем «не найдены» (лоадер снаружи)
    if (isLoading) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>{i18n.t('search.loading')}</Text>
          <Text style={[styles.loadingHint, { color: theme.secondaryText }]}>
            {i18n.t('search.loadingSlow')}
          </Text>
        </View>
      );
    }
    if (loadError) {
      return (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={56} color={theme.secondaryText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('search.errorLoad')}</Text>
          <Text style={[styles.emptySub, { color: theme.secondaryText }]}>{loadError}</Text>
          <PrimaryButton
            title={i18n.t('search.retry')}
            onPress={handleRetrySearch}
            variant="cta"
            style={{ marginTop: 16, minWidth: 160 }}
          />
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Ionicons name="airplane-outline" size={56} color={theme.secondaryText} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('tours.notFoundShort')}</Text>
        <Text style={[styles.emptySub, { color: theme.secondaryText }]}>
          {i18n.t('search.tryNearerDates')}
        </Text>
        {searchParams ? (
          <Text style={[styles.emptyDiag, { color: theme.tertiaryText }]}>
            {[
              searchParams.dateFrom && searchParams.dateTo
                ? `${formatDate(searchParams.dateFrom)} — ${formatDate(searchParams.dateTo)}`
                : null,
              searchParams.nightsFrom
                ? formatNightsRangeRu(searchParams.nightsFrom, searchParams.nightsTo)
                : null,
              searchParams.adults ? formatAdultsRu(searchParams.adults) : null,
              searchParams.priceTo ? `до ${Number(searchParams.priceTo).toLocaleString('ru-RU')} ₽` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
        <PrimaryButton
          title={i18n.t('search.shiftNear')}
          onPress={shiftNearAndSearch}
          variant="cta"
          style={{ marginTop: 16, minWidth: 200 }}
        />
        <PrimaryButton
          title={i18n.t('search.editParams')}
          onPress={openChangeSearch}
          variant="primary"
          outline
          style={{ marginTop: 10, minWidth: 200 }}
        />
      </View>
    );
  };

  const showFullLoader = isLoading && tours.length === 0 && !loadError;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />
      {renderHeader()}
      {renderStatus()}
      {renderStaleHint()}
      {showFullLoader ? (
        runSearch ? (
          <PercentageLoader visible={true} progress={loaderProgress} />
        ) : (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.text }]}>{i18n.t('search.loading')}</Text>
            <Text style={[styles.loadingHint, { color: theme.secondaryText }]}>
              {i18n.t('search.loadingSlow')}
            </Text>
          </View>
        )
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={tours}
          renderItem={renderHotel}
          keyExtractor={(item, index) => `hotel-${item.id}-${index}`}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={renderEmpty}
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
      {searchParams ? (
        <EditSearchSheet
          visible={editSheetOpen}
          initial={searchParams}
          onClose={() => setEditSheetOpen(false)}
          onApply={applyEditedSearch}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contextCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contextIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextBody: { flex: 1, minWidth: 0 },
  contextTitle: { ...typography.captionBold },
  contextSub: { ...typography.small, marginTop: 2 },
  changeBtn: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    flexShrink: 0,
  },
  changeBtnText: { ...typography.smallBold },
  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  mapLinkText: { ...typography.smallBold },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: '100%',
  },
  filterChipText: {
    ...typography.small,
    fontWeight: '600',
    maxWidth: 180,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  statusText: {
    fontSize: 15,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  listContent: {
    padding: 16,
    // Tab bar hidden on results; SafeAreaView edges include bottom inset.
    paddingBottom: 24,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  cardTop: {
    flexDirection: 'row',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  cardMedia: {
    width: 112,
    height: 128,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  hotelName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 6,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    maxWidth: '100%',
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  hotelRegion: {
    fontSize: 12,
    flex: 1,
  },
  toursList: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  tourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: 8,
    gap: 10,
  },
  tourLeft: {
    flex: 1,
    minWidth: 0,
  },
  tourOperator: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  tourMeta: {
    fontSize: 12,
  },
  tourPrice: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  selectBtn: {
    backgroundColor: BRAND.orange,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 0,
  },
  selectBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 12,
  },
  loadingHint: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyDiag: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 24,
    lineHeight: 16,
  },
  retryBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadMoreBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  loadMoreText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
