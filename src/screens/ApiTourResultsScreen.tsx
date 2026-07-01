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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PercentageLoader from '../components/PercentageLoader';
import CachedImage from '../components/ui/CachedImage';

import { tourvisorApi } from '../services/TourvisorApiService';
import { TourHotel, TourSearchStatus, TourSearchParams, Tour } from '../types/tourvisor';
import { useAppContext } from '../contexts/AppContext';
import { cacheService, CacheType } from '../services/CacheService';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import { i18n } from '../config/i18n';
import {
  getTourSearchCacheKey,
  isTourSearchStatusError,
  isTourSearchStatusFinished,
  isTransientTourvisorError,
  TOUR_SEARCH_LIMIT,
  TOUR_SEARCH_MAX_WAIT_MS,
  getTourSearchPollIntervalMs,
  sanitizeTourHotelsFromCache,
} from '../utils/tourSearchCache';
import { getFromSharedCache } from '../services/TourvisorFirestoreCache';
import { saveTourSearchToAllCaches, searchTours } from '../hooks/useTourSearch';
import { preCacheTourDetailsFromSearchResults, cacheTourFromSearchResult, buildTourOutputFromSearchResult } from '../utils/tourDetailsCache';
import { FavoritesService } from '../services/FavoritesService';
import { logger } from '../utils/logger';
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
  secondaryBackground: string;
  error: string;
};

type TourResultCardProps = {
  hotel: TourHotel;
  theme: ResultsTheme;
  favoriteIds: Set<string>;
  onTourPress: (tourId: string, hotel: TourHotel, tour: Tour) => void;
  onFavoritePress: (hotel: TourHotel, tour: Tour) => void;
  formatPrice: (price: number, fromCurrency: string) => string;
  formatDate: (dateStr: string) => string;
};

const TourResultCard = memo(function TourResultCard({
  hotel,
  theme,
  favoriteIds,
  onTourPress,
  onFavoritePress,
  formatPrice,
  formatDate,
}: TourResultCardProps) {
  if (!hotel?.id || !hotel.name || !hotel.region?.name || !Array.isArray(hotel.tours) || hotel.tours.length === 0) {
    return null;
  }

  const visibleTours = hotel.tours.filter(
    (t) => t && t.operator?.name && t.meal?.name && typeof t.price === 'number' && t.date,
  );
  if (visibleTours.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {hotel.picturelink ? (
        <CachedImage
          source={hotel.picturelink}
          style={styles.cardImage}
          contentFit="cover"
          recyclingKey={`hotel-${hotel.id}`}
        />
      ) : (
        <View style={[styles.cardImagePlaceholder, { backgroundColor: theme.secondaryBackground }]}>
          <Ionicons name="image-outline" size={40} color={theme.secondaryText} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={[styles.hotelName, { color: theme.text }]} numberOfLines={2}>
          {hotel.name}
        </Text>
        <Text style={[styles.hotelRegion, { color: theme.secondaryText }]}>
          {hotel.region.name}
          {hotel.subRegion ? `, ${hotel.subRegion.name}` : ''}
        </Text>
        {hotel.rating > 0 && (
          <View style={[styles.rating, { backgroundColor: theme.primary }]}>
            <Ionicons name="star" size={12} color="#fff" />
            <Text style={styles.ratingText}>{hotel.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      <View style={styles.toursList}>
        {visibleTours.map((tour, idx) => (
          <TouchableOpacity
            key={`${tour.id}-${idx}`}
            style={[styles.tourRow, { borderColor: theme.border }]}
            onPress={() => onTourPress(tour.id, hotel, tour)}
            activeOpacity={0.7}
          >
            <View style={styles.tourLeft}>
              <Text style={[styles.tourOperator, { color: theme.primary }]}>
                {tour.operator.name}
              </Text>
              <Text style={[styles.tourMeta, { color: theme.secondaryText }]}>
                {tour.adults} {i18n.t('tours.adultsShort')} · {tour.nights} {i18n.t('search.nights')} · {tour.meal.name}
              </Text>
            </View>
            <View style={[styles.tourRight, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <TouchableOpacity
                onPress={() => onFavoritePress(hotel, tour)}
                style={styles.favoriteIcon}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={favoriteIds.has(String(tour.id)) ? 'heart' : 'heart-outline'}
                  size={20}
                  color={favoriteIds.has(String(tour.id)) ? theme.error : theme.secondaryText}
                />
              </TouchableOpacity>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.tourPrice, { color: theme.primary }]}>
                  {formatPrice(tour.price, tour.currency)}
                </Text>
                <Text style={[styles.tourDate, { color: theme.secondaryText }]}>
                  {formatDate(tour.date)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

export default function ApiTourResultsScreen({ navigation, route }: ApiTourResultsScreenProps) {
  const { theme, isDark, user, currency } = useAppContext();
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  const params = route.params ?? {};
  const searchId = params.searchId ?? -1;
  const searchParams = params.searchParams;
  const useCache = params.useCache === true;
  const runSearch = params.runSearch === true;

  const [tours, setTours] = useState<TourHotel[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<TourSearchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showingStaleHint, setShowingStaleHint] = useState(false);

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
      const valid = sanitizeTourHotelsFromCache(raw);
      setTours(valid);
      setHasMore(false);
      if (valid.length > 0) schedulePreCache(valid, currencyCode);
      return valid;
    },
    [schedulePreCache],
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
          const key = getTourSearchCacheKey(searchParams, TOUR_SEARCH_LIMIT);
          cacheService.get<TourHotel[]>(CacheType.SEARCH_RESULTS, key, true).then((cached) => {
            if (!mountedRef.current) return;
            applyTourList(cached ?? [], searchParams.currency || 'RUB');
          }).catch(() => {
            if (mountedRef.current) setTours([]);
          }).finally(() => {
            if (mountedRef.current) setIsLoading(false);
          });
          return;
        }
        if (mountedRef.current) {
          setTours([]);
          setHasMore(false);
          setLoadError((e as Error)?.message || i18n.t('search.errorSearchFailed'));
        }
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [searchId, searchParams, fetchResultsForSearchId, applyTourList]
  );

  /** Кэш только при полном совпадении параметров и свежести до 2 недель (Firestore + localStorage). */
  const loadFromCache = useCallback(async (): Promise<boolean> => {
    if (!searchParams) {
      setIsLoading(false);
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
        setTours([]);
        setLoadError(i18n.t('search.cacheCorrupted'));
        return false;
      }
      setTours(valid);
      setHasMore(false);
      if (valid.length) schedulePreCache(valid, searchParams.currency || 'RUB');
      return valid.length > 0;
    } catch {
      if (mountedRef.current) setTours([]);
      return false;
    } finally {
      if (mountedRef.current) setIsLoading(false);
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
      setTours(valid);
      setHasMore(false);
      setShowingStaleHint(true);
      setIsLoading(false);
      schedulePreCache(valid, searchParams.currency || 'RUB');
      return true;
    } catch {
      return false;
    }
  }, [searchParams, schedulePreCache]);

  useEffect(() => {
    FavoritesService.getInstance().getFavoriteTours().then((favs) => {
      if (mountedRef.current) setFavoriteIds(new Set(favs.map((f) => String(f.id))));
    });
  }, []);

  const handleFavoritePress = useCallback(
    async (hotel: TourHotel, tour: Tour) => {
      try {
        if (isGuest || !user) {
          const { Alert } = await import('react-native');
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
    setLoadError(null);
    setLoaderProgress(0);
    let p = 0;
    progressIntervalRef.current = setInterval(() => {
      p = Math.min(p + 3 + Math.random() * 4, 90);
      setLoaderProgress(p);
    }, 150);
    try {
      let list = await searchTours(searchParams, TOUR_SEARCH_LIMIT, false);
      if (!list.length) {
        logger.warn('[ApiTourResults] cache returned empty, forcing live Tourvisor search');
        list = await searchTours(searchParams, TOUR_SEARCH_LIMIT, true);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoaderProgress(100);
      if (!mountedRef.current) return;
      setLoadError(null);
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
        setTours([]);
        setLoadError((e as Error)?.message || i18n.t('search.errorSearchFailed'));
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [searchParams, applyTourList]);

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
        const hasCachedResults = await loadFromCache();
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

        if (isTourSearchStatusFinished(st.status, st.progress)) {
          stopPollingAndLoad();
          return true;
        }
        return false;
      } catch (e: unknown) {
        const err = e as Error;
        const is429 = err?.message?.includes('429') || err?.message?.includes('Rate limit');
        if (is429 && searchParams && mountedRef.current) {
          stopPolling();
          loadFromCache();
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

  const formatPrice = useCallback(
    (price: number, fromCurrency: string) =>
      settingsService.formatTourPrice(price, fromCurrency as Currency, currency),
    [currency],
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
        favoriteIds={favoriteIds}
        onTourPress={handleTourPress}
        onFavoritePress={handleFavoritePress}
        formatPrice={formatPrice}
        formatDate={formatDate}
      />
    ),
    [theme, favoriteIds, handleTourPress, handleFavoritePress, formatPrice, formatDate],
  );

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      <TouchableOpacity
        style={styles.headerBack}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={24} color={theme.text} />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('search.results')}</Text>
        {searchParams?.dateFrom && searchParams?.dateTo && (
          <Text style={[styles.headerSubtitle, { color: theme.secondaryText }]} numberOfLines={1}>
            {formatDate(searchParams.dateFrom)} — {formatDate(searchParams.dateTo)}
          </Text>
        )}
      </View>
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
    if (loadError) {
      return (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={56} color={theme.secondaryText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('search.errorLoad')}</Text>
          <Text style={[styles.emptySub, { color: theme.secondaryText }]}>{loadError}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.primary }]}
            onPress={handleRetrySearch}
          >
            <Text style={styles.retryBtnText}>{i18n.t('search.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Ionicons name="airplane-outline" size={56} color={theme.secondaryText} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('tours.notFoundShort')}</Text>
        <Text style={[styles.emptySub, { color: theme.secondaryText }]}>
          {i18n.t('search.changeParams')}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />
      {renderHeader()}
      {renderStatus()}
      {renderStaleHint()}
      {runSearch && isLoading && tours.length === 0 ? (
        <PercentageLoader visible={true} progress={loaderProgress} />
      ) : isLoading && tours.length === 0 && !loadError ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>{i18n.t('search.loading')}</Text>
          <Text style={[styles.loadingHint, { color: theme.secondaryText }]}>
            {i18n.t('search.loadingSlow')}
          </Text>
        </View>
      ) : (
        <FlatList
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
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
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  cardImage: {
    width: '100%',
    height: 180,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: 14,
  },
  hotelName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  hotelRegion: {
    fontSize: 14,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginTop: 8,
  },
  ratingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  toursList: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  tourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 8,
  },
  tourLeft: {
    flex: 1,
  },
  tourOperator: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  tourMeta: {
    fontSize: 13,
  },
  tourRight: {
    alignItems: 'flex-end',
  },
  favoriteIcon: {
    padding: 4,
  },
  tourPrice: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  tourDate: {
    fontSize: 12,
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
