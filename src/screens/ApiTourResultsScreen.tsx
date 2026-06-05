import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PercentageLoader from '../components/PercentageLoader';

import { tourvisorApi } from '../services/TourvisorApiService';
import { TourHotel, TourSearchStatus, TourSearchParams, Tour } from '../types/tourvisor';
import { useAppContext } from '../contexts/AppContext';
import { cacheService, CacheType } from '../services/CacheService';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import { i18n } from '../config/i18n';
import { getTourSearchCacheKey, TOUR_SEARCH_LIMIT } from '../utils/tourSearchCache';
import { getFromSharedCache } from '../services/TourvisorFirestoreCache';
import { saveTourSearchToAllCaches, searchTours } from '../hooks/useTourSearch';
import { preCacheTourDetailsFromSearchResults, cacheTourFromSearchResult, buildTourOutputFromSearchResult } from '../utils/tourDetailsCache';
import { FavoritesService } from '../services/FavoritesService';

interface ApiTourResultsScreenProps {
  navigation: any;
  route: any;
}

export default function ApiTourResultsScreen({ navigation, route }: ApiTourResultsScreenProps) {
  const { theme, isDark, user, currency } = useAppContext();
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  const params = route?.params ?? {};
  const searchId = params.searchId ?? -1;
  const searchParams = params.searchParams as TourSearchParams | undefined;
  const useCache = params.useCache === true;
  const runSearch = params.runSearch === true;

  const [tours, setTours] = useState<TourHotel[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<TourSearchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const mountedRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFromApi = useCallback(
    async () => {
      if (searchId === -1 || !searchParams) return;
      try {
        const list = await tourvisorApi.getTourSearchResults(searchId, TOUR_SEARCH_LIMIT);
        if (!mountedRef.current) return;
        setTours(list ?? []);
        setHasMore(false);
        if (list && list.length > 0 && searchParams) {
          saveTourSearchToAllCaches(searchParams, list, TOUR_SEARCH_LIMIT).catch(() => {});
          preCacheTourDetailsFromSearchResults(list, searchParams.currency || 'RUB').catch(() => {});
        }
      } catch (e: any) {
        const is429 = e?.message?.includes('429') || e?.message?.includes('Rate limit');
        if (is429 && searchParams && mountedRef.current) {
          const key = getTourSearchCacheKey(searchParams, TOUR_SEARCH_LIMIT);
          cacheService.get<TourHotel[]>(CacheType.SEARCH_RESULTS, key, true).then((cached) => {
            if (!mountedRef.current) return;
            setTours(cached ?? []);
            setHasMore(false);
            if (cached?.length) preCacheTourDetailsFromSearchResults(cached, searchParams.currency || 'RUB').catch(() => {});
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
        }
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [searchId, searchParams]
  );

  /** Кэш только при полном совпадении параметров и свежести до 2 недель (Firestore + localStorage). */
  const loadFromCache = useCallback(async () => {
    if (!searchParams) {
      setIsLoading(false);
      return;
    }
    const key = getTourSearchCacheKey(searchParams, TOUR_SEARCH_LIMIT);
    try {
      let cached = await getFromSharedCache(searchParams, TOUR_SEARCH_LIMIT);
      if (!cached?.length) {
        cached = await cacheService.get<TourHotel[]>(CacheType.SEARCH_RESULTS, key, false);
      }
      if (!mountedRef.current) return;
      setTours(cached ?? []);
      setHasMore(false);
      if (cached?.length) preCacheTourDetailsFromSearchResults(cached, searchParams.currency || 'RUB').catch(() => {});
    } catch {
      if (mountedRef.current) setTours([]);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    FavoritesService.getInstance().getFavoriteTours().then((favs) => {
      if (mountedRef.current) setFavoriteIds(new Set(favs.map((f) => f.id)));
    });
  }, []);

  const handleFavoritePress = useCallback(
    async (hotel: TourHotel, tour: Tour) => {
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
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (result.isFavorite) next.add(tour.id);
          else next.delete(tour.id);
          return next;
        });
      }
    },
    [isGuest, user, navigation]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  const runSearchAndPopulate = useCallback(async () => {
    if (!searchParams || !mountedRef.current) return;
    setLoaderProgress(0);
    let p = 0;
    progressIntervalRef.current = setInterval(() => {
      p = Math.min(p + 3 + Math.random() * 4, 90);
      setLoaderProgress(p);
    }, 150);
    try {
      const list = await searchTours(searchParams, TOUR_SEARCH_LIMIT, false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoaderProgress(100);
      if (!mountedRef.current) return;
      setTours(list ?? []);
      setHasMore(false);
      if (list?.length && searchParams) {
        saveTourSearchToAllCaches(searchParams, list, TOUR_SEARCH_LIMIT).catch(() => {});
        preCacheTourDetailsFromSearchResults(list, searchParams.currency || 'RUB').catch(() => {});
      }
    } catch {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (mountedRef.current) setTours([]);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!searchParams) {
      setIsLoading(false);
      return;
    }

    if (runSearch) {
      runSearchAndPopulate();
      return;
    }

    if (useCache || searchId === -1) {
      loadFromCache();
      return;
    }

    let cancelled = false;

    const stopPollingAndLoad = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      loadFromApi();
    };

    const pollStatus = async () => {
      try {
        const st = await tourvisorApi.getTourSearchStatus(searchId, true);
        if (cancelled || !mountedRef.current) return;
        setStatus(st);

        const statusLower = (st.status || '').toLowerCase();
        const isCompleted = statusLower === 'completed' || (st.progress ?? 0) >= 100;
        const isError = statusLower === 'error';

        if (isError) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (mountedRef.current) setIsLoading(false);
          return;
        }

        if (isCompleted) {
          stopPollingAndLoad();
        }
      } catch (e: any) {
        const is429 = e?.message?.includes('429') || e?.message?.includes('Rate limit');
        if (is429 && searchParams && mountedRef.current) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          loadFromCache();
          return;
        }
        if (mountedRef.current) setIsLoading(false);
      }
    };

    const t1 = setTimeout(() => {
      pollStatus();
      pollIntervalRef.current = setInterval(pollStatus, 3000);
    }, 2000);

    // Запасной вариант: через 5 сек запросить результаты, если по статусу так и не загрузили
    const t2 = setTimeout(() => {
      if (cancelled || !mountedRef.current) return;
      tourvisorApi.getTourSearchResults(searchId, TOUR_SEARCH_LIMIT).then(async (list) => {
        if (cancelled || !mountedRef.current) return;
        const results = list ?? [];
        if (results.length > 0) {
          setTours((prev) => (prev.length > 0 ? prev : results!));
          setHasMore(false);
          if (searchParams) {
            saveTourSearchToAllCaches(searchParams, results!, TOUR_SEARCH_LIMIT).catch(() => {});
            preCacheTourDetailsFromSearchResults(results!, searchParams.currency || 'RUB').catch(() => {});
          }
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
        if (mountedRef.current) setIsLoading(false);
      }).catch((e: any) => {
        const is429 = e?.message?.includes('429') || e?.message?.includes('Rate limit');
        if (is429 && searchParams && mountedRef.current) {
          loadFromCache();
          return;
        }
        if (mountedRef.current) setIsLoading(false);
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [searchId, useCache, searchParams, runSearch, runSearchAndPopulate, loadFromCache, loadFromApi]);

  const handleTourPress = useCallback(
    (tourId: string, hotel?: TourHotel, tour?: Tour) => {
      if (hotel && tour) {
        cacheTourFromSearchResult(hotel, tour, searchParams?.currency || 'RUB').catch(() => {});
      }
      navigation.navigate('ApiTourDetails', {
        tourId,
        searchParams: searchParams ?? {},
      });
    },
    [navigation, searchParams]
  );

  const formatPrice = (price: number, fromCurrency: string) =>
    settingsService.formatTourPrice(price, fromCurrency as Currency, currency);
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });

  const renderHotel = ({ item: hotel }: { item: TourHotel }) => (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {hotel.picturelink ? (
        <Image
          source={{ uri: hotel.picturelink }}
          style={styles.cardImage}
          resizeMode="cover"
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
        {hotel.tours.map((tour, idx) => (
          <TouchableOpacity
            key={`${tour.id}-${idx}`}
            style={[styles.tourRow, { borderColor: theme.border }]}
            onPress={() => handleTourPress(tour.id, hotel, tour)}
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
                onPress={() => handleFavoritePress(hotel, tour)}
                style={styles.favoriteIcon}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={favoriteIds.has(tour.id) ? 'heart' : 'heart-outline'}
                  size={20}
                  color={favoriteIds.has(tour.id) ? theme.error : theme.secondaryText}
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

  const renderStatus = () => {
    if (!status) return null;
    const text =
      status.status === 'completed'
        ? `Найдено: ${tours.length}`
        : status.status === 'error'
          ? i18n.t('search.errorProgress')
          : `${i18n.t('search.progress')} ${status.progress ?? 0}%`;
    return (
      <View style={[styles.statusBar, { backgroundColor: theme.card }]}>
        <ActivityIndicator
          size="small"
          color={theme.primary}
          animating={status.status !== 'completed' && status.status !== 'error'}
        />
        <Text style={[styles.statusText, { color: theme.text }]}>{text}</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="airplane-outline" size={56} color={theme.secondaryText} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('tours.notFoundShort')}</Text>
      <Text style={[styles.emptySub, { color: theme.secondaryText }]}>
        Измените параметры поиска
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />
      {renderHeader()}
      {renderStatus()}
      {runSearch && isLoading && tours.length === 0 ? (
        <PercentageLoader visible={true} progress={loaderProgress} />
      ) : isLoading && tours.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>{i18n.t('search.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={tours}
          renderItem={renderHotel}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={false}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={6}
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
