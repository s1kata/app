/**
 * Витрина горящих туров на Home — вертикальная лента как маркетплейс,
 * туры из нескольких городов вылета (не только Москва).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { Image } from 'expo-image';
import CachedImage from './ui/CachedImage';
import TourPriceLabel from './ui/TourPriceLabel';
import { isPlausibleHotItem } from '../utils/tourPriceSanity';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { tourvisorApi } from '../services/TourvisorApiService';
import { hotelPictureCache } from '../services/HotelPictureCache';
import { recommendationService } from '../services/RecommendationService';
import { dictionaryService } from '../services/DictionaryService';
import { fetchHotToursViaBackend } from '../services/sync/NextPatchBackendClient';
import { TourHot } from '../types/tourvisor';
import { radius, shadows, spacing } from '../config/designSystem';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import { logger } from '../utils/logger';
import { cacheTourFromHot, tourHotToHotelAndTour, buildTourOutputFromSearchResult } from '../utils/tourDetailsCache';
import { FavoritesService } from '../services/FavoritesService';
import type { Hotel } from '../types';
import { navigateRoot } from '../utils/navHelpers';
import { formatDepartureFrom } from '../utils/ruFromCity';
import { formatDateRuShort } from '../utils/formatDateRu';
import { formatNightsRu } from '../utils/pluralRu';

const CACHE_KEY = 'home_hot_tours_v4';
const CACHE_TTL_MS = 15 * 60 * 1000;
/** Даже просроченный кэш показываем сразу (SWR), пока сеть обновляет. */
const STALE_MAX_MS = 24 * 60 * 60 * 1000;
const LIMIT = 12;
/** Home: максимум 2 города — скорость важнее широты. */
const HOME_DEPARTURE_LIMIT = 2;
const DEPARTURE_PREF_KEY = 'user_preferred_departure_id';
const MAJOR_DEPARTURE_NAMES = ['москва', 'самара'];

type Props = {
  navigation: any;
  refreshKey?: number;
};

type CachePayload = { at: number; items: TourHot[] };

/** RAM: повторный заход на Home без чтения AsyncStorage. */
let memoryHotCache: CachePayload | null = null;

function prefetchHotImages(list: TourHot[]) {
  const urls = list
    .map((h) => h.hotel?.picturelink)
    .filter((u): u is string => typeof u === 'string' && u.length > 8)
    .slice(0, 12);
  if (urls.length) void Image.prefetch(urls);
}

function ShimmerCard({ theme }: { theme: { card: string; border: string } }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] });
  return (
    <View
      style={[
        styles.hCard,
        shadows.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={[styles.hPhotoWrap, { backgroundColor: `${theme.border}88`, overflow: 'hidden' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1, width: 90 }}
          />
        </Animated.View>
      </View>
      <View style={styles.hBody}>
        <View style={[styles.skelLine, { width: '78%', backgroundColor: theme.border }]} />
        <View style={[styles.skelLine, { width: '52%', backgroundColor: theme.border, marginTop: 8 }]} />
        <View style={[styles.skelLine, { width: '40%', backgroundColor: theme.border, marginTop: 12, height: 14 }]} />
      </View>
    </View>
  );
}

function discountPercent(item: TourHot): number | null {
  const old = Number(item.priceOld) || 0;
  const cur = Number(item.price) || 0;
  if (old <= 0 || cur <= 0 || cur >= old) return null;
  return Math.max(1, Math.round((1 - cur / old) * 100));
}

function tourKey(item: TourHot): string {
  return [
    item.departure?.id || 0,
    item.hotel?.id || 0,
    item.date || '',
    item.nights || 0,
    item.price || 0,
  ].join(':');
}

async function resolveDeparturePool(): Promise<{ pool: number[]; names: Map<number, string> }> {
  const names = new Map<number, string>();
  try {
    const deps = await dictionaryService.getDepartures();
    for (const d of deps) names.set(d.id, d.name);

    let preferred = 0;
    const saved = await AsyncStorage.getItem(DEPARTURE_PREF_KEY);
    if (saved && deps.some((d) => String(d.id) === saved)) {
      preferred = Number(saved);
    } else {
      const samara = deps.find((d) => d.name.toLowerCase().includes('москва'));
      preferred = samara?.id || deps[0]?.id || 1;
    }

    const recent = await recommendationService.getRecentSearches();
    const recentDep = recent.find((r) => r.departureId)?.departureId;

    const pool: number[] = [];
    const push = (id?: number) => {
      if (!id || pool.includes(id) || pool.length >= HOME_DEPARTURE_LIMIT) return;
      pool.push(id);
    };
    push(preferred);
    push(recentDep);
    for (const needle of MAJOR_DEPARTURE_NAMES) {
      const found = deps.find((d) => d.name.toLowerCase().includes(needle));
      push(found?.id);
    }
    if (!pool.length) pool.push(1);
    return { pool, names };
  } catch (e) {
    logger.debug('[HomeHotTours] departures:', (e as Error)?.message);
    return { pool: [1], names };
  }
}

function favoriteKey(item: TourHot): string {
  const tid = item.tourId ? String(item.tourId).trim() : '';
  if (tid) return `t:${tid}`;
  const hid = Number(item.hotel?.id) || 0;
  return hid ? `h:${hid}` : '';
}

export default function HomeHotToursSection({ navigation, refreshKey = 0 }: Props) {
  const { theme, apiReady, user, language, currency } = useAppContext();
  void language;
  const [items, setItems] = useState<TourHot[]>(() => memoryHotCache?.items ?? []);
  const [loading, setLoading] = useState(() => !(memoryHotCache?.items?.length));
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  useEffect(() => {
    if (!user || isGuest) {
      setFavoriteIds(new Set());
      return;
    }
    void (async () => {
      try {
        const fs = FavoritesService.getInstance();
        const [tours, hotels] = await Promise.all([fs.getFavoriteTours(), fs.getFavoriteHotels()]);
        const ids = new Set<string>();
        tours.forEach((t) => ids.add(`t:${t.id}`));
        hotels.forEach((h) => ids.add(`h:${h.id}`));
        setFavoriteIds(ids);
      } catch {
        /* ignore */
      }
    })();
  }, [user, isGuest, refreshKey]);

  const load = useCallback(async (forceNetwork = false) => {
    const fetchAndStore = async (soft: boolean) => {
      try {
        const { pool, names } = await resolveDeparturePool();

        const tryFetch = async (departureId: number): Promise<TourHot[]> => {
          const params = {
            departureId,
            currency: (currency || 'RUB') as Currency,
            onlyCharter: false,
            limit: 16,
          };
          try {
            const remote = await fetchHotToursViaBackend(params);
            if (remote.success && remote.data?.length) return remote.data;
          } catch (e) {
            logger.debug('[HomeHotTours] backend error:', (e as Error)?.message);
          }
          try {
            const legacy = await tourvisorApi.getHotTours(params);
            return Array.isArray(legacy) ? legacy : [];
          } catch (e) {
            logger.debug('[HomeHotTours] legacy fallback:', (e as Error)?.message);
            return [];
          }
        };

        const chunks = await Promise.all(pool.map((id) => tryFetch(id)));
        const merged: TourHot[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < chunks.length; i++) {
          const depId = pool[i];
          const depName = names.get(depId) || '';
          for (const row of chunks[i]) {
            const withDep: TourHot = {
              ...row,
              departure: {
                id: row.departure?.id || depId,
                name: row.departure?.name || depName,
                nameGenitive: row.departure?.nameGenitive || '',
              },
            };
            const key = tourKey(withDep);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(withDep);
          }
        }

        const sane = merged.filter(isPlausibleHotItem);
        sane.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        const list = sane.slice(0, LIMIT);

        if (list.length) {
          void hotelPictureCache.ingestFromTours(
            list.map((h) => ({ hotel: h.hotel, picture: h.hotel?.picturelink })),
          );
          prefetchHotImages(list);
          setItems(list);
          const payload: CachePayload = { at: Date.now(), items: list };
          memoryHotCache = payload;
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        } else if (!soft) {
          setItems([]);
        }
      } catch (e) {
        logger.debug('[HomeHotTours] fetch', (e as Error)?.message);
        if (!soft) setItems([]);
      } finally {
        setLoading(false);
      }
    };

    try {
      // 1) RAM
      if (!forceNetwork && memoryHotCache?.items?.length) {
        setItems(memoryHotCache.items);
        setLoading(false);
        prefetchHotImages(memoryHotCache.items);
        const age = Date.now() - memoryHotCache.at;
        if (age < CACHE_TTL_MS) {
          void fetchAndStore(true);
          return;
        }
        void fetchAndStore(true);
        return;
      }

      // 2) Disk (включая просроченный до STALE_MAX)
      if (!forceNetwork) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CachePayload;
          const age = Date.now() - (parsed?.at || 0);
          if (parsed?.items?.length && age < STALE_MAX_MS) {
            memoryHotCache = parsed;
            setItems(parsed.items);
            setLoading(false);
            prefetchHotImages(parsed.items);
            void fetchAndStore(true);
            return;
          }
        }
      }

      // 3) Холодный старт / принудительное обновление
      if (!memoryHotCache?.items?.length) setLoading(true);
      await fetchAndStore(false);
    } catch (e) {
      logger.debug('[HomeHotTours]', (e as Error)?.message);
      if (!memoryHotCache?.items?.length) setItems([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!apiReady) return;
    void load(refreshKey > 0);
  }, [apiReady, load, refreshKey]);

  const openAll = () => navigation.navigate('ApiHotTours');

  const toggleFavorite = async (item: TourHot) => {
    try {
      if (!user || isGuest) {
        Alert.alert(i18n.t('favorites.authRequired'), i18n.t('auth.favoritesRequired'), [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          {
            text: i18n.t('auth.login'),
            onPress: () => navigateRoot(navigation, 'Login'),
          },
        ]);
        return;
      }

      const realTourId = item.tourId ? String(item.tourId).trim() : '';
      if (realTourId) {
        const pair = tourHotToHotelAndTour(item);
        if (!pair) {
          Alert.alert(i18n.t('common.error'), i18n.t('favorites.updateFailed'));
          return;
        }
        const tour = buildTourOutputFromSearchResult(pair.hotel, pair.tour);
        const result = await FavoritesService.getInstance().toggleTourFavorite(tour);
        if (!result.success) {
          Alert.alert(i18n.t('common.error'), result.error || i18n.t('favorites.updateFailed'));
          return;
        }
        const key = `t:${realTourId}`;
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (result.isFavorite) next.add(key);
          else next.delete(key);
          return next;
        });
        return;
      }

      // Нет реального tourId (часто в витрине акций) — сохраняем отель
      const hid = Number(item.hotel?.id) || 0;
      if (!hid) {
        Alert.alert(i18n.t('common.error'), i18n.t('favorites.updateFailed'));
        return;
      }
      const hotel: Hotel = {
        id: String(hid),
        name: String(item.hotel?.name || ''),
        description: '',
        location: item.hotel?.region?.name || '',
        country: item.country?.name || item.hotel?.country?.name || '',
        category: String(item.hotel?.category || ''),
        rating: Number(item.hotel?.rating) || 0,
        reviews: 0,
        price: Number(item.price) || 0,
        currency: item.currency || 'RUB',
        image: item.hotel?.picturelink || '',
        gallery: item.hotel?.picturelink ? [item.hotel.picturelink] : [],
        amenities: [],
        stars: Number(item.hotel?.category) || 0,
        mealTypes: [],
        available: true,
      };
      const result = await FavoritesService.getInstance().toggleHotelFavorite(hotel);
      if (!result.success) {
        Alert.alert(i18n.t('common.error'), result.error || i18n.t('favorites.updateFailed'));
        return;
      }
      const key = `h:${hid}`;
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (result.isFavorite) next.add(key);
        else next.delete(key);
        return next;
      });
    } catch (e) {
      logger.debug('[HomeHotTours] favorite', (e as Error)?.message);
      Alert.alert(i18n.t('common.error'), i18n.t('favorites.updateFailed'));
    }
  };

  const openItem = async (item: TourHot) => {
    try {
      const tourId = await cacheTourFromHot(item, item.currency || 'RUB');
      if (tourId) {
        navigation.navigate('ApiTourDetails', {
          tourId,
          currency: item.currency || 'RUB',
        });
        return;
      }
    } catch (e) {
      logger.debug('[HomeHotTours] open details:', (e as Error)?.message);
    }
    navigation.navigate('ApiHotTours', {
      countryId: item.country?.id,
      countryName: item.country?.name,
      departureId: item.departure?.id,
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.deep || theme.text }]}>
          {i18n.t('home.hotToursTitle')}
        </Text>
        <TouchableOpacity onPress={openAll} hitSlop={12}>
          <Text style={[styles.allBtnText, { color: theme.primary }]}>{i18n.t('home.seeAllArrow')}</Text>
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {[0, 1, 2].map((k) => (
            <ShimmerCard key={k} theme={theme} />
          ))}
        </ScrollView>
      ) : items.length === 0 ? (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => void load(true)}
          style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <View style={[styles.emptyIcon, { backgroundColor: `${theme.accent || theme.primary}14` }]}>
            <Ionicons name="flame" size={22} color={theme.accent || theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('home.hotDealsEmpty')}</Text>
          <Text style={[styles.hint, { color: theme.secondaryText }]}>
            {i18n.t('home.hotDealsEmptyDesc')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => void load(true)}
              style={[styles.allBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            >
              <Text style={[styles.allBtnText, { color: theme.primary }]}>
                {i18n.t('home.hotDealsRetry')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openAll}
              style={[styles.allBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            >
              <Text style={[styles.allBtnText, { color: theme.primary }]}>
                {i18n.t('home.hotDealsAll')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.primary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {items.map((item, idx) => {
            const drop = discountPercent(item);
            const key = `hot_${tourKey(item)}_${idx}`;
            const image = item.hotel?.picturelink || DEFAULT_HOTEL_IMAGE;
            const place = [item.country?.name, item.hotel?.region?.name].filter(Boolean).join(', ');
            const mealName =
              item.meal?.russianName || item.meal?.fullRussianName || item.meal?.name || '';
            const fKey = favoriteKey(item);
            const isFav = fKey ? favoriteIds.has(fKey) : false;
            const displayPrice = settingsService.convertPrice(
              Number(item.price) || 0,
              (item.currency || 'RUB') as Currency,
              currency,
            );
            const displayOld = settingsService.convertPrice(
              Number(item.priceOld) || 0,
              (item.currency || 'RUB') as Currency,
              currency,
            );
            const currencySymbol = settingsService.getCurrencySymbol(currency);
            return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.9}
                onPress={() => void openItem(item)}
                style={[styles.hCard, shadows.card, { backgroundColor: theme.card, borderColor: theme.border }]}
                accessibilityRole="button"
                accessibilityLabel={[
                  place || item.hotel?.name || i18n.t('hotTours.title'),
                  item.nights ? formatNightsRu(item.nights) : '',
                  item.date ? formatDateRuShort(item.date) : '',
                  mealName,
                  item.departure?.name
                    ? formatDepartureFrom(item.departure.name, language)
                    : '',
                  displayPrice
                    ? `от ${displayPrice.toLocaleString('ru-RU')} ${currencySymbol}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(', ')}
              >
                <View style={styles.hPhotoWrap} importantForAccessibility="no-hide-descendants">
                  <CachedImage source={{ uri: image }} style={styles.hPhoto} contentFit="cover" recyclingKey={key} />
                  {drop != null ? (
                    <View style={styles.dropBadge} accessible={false}>
                      <Text style={styles.dropText}>−{drop}%</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.heartBtn}
                    onPress={() => void toggleFavorite(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
                  >
                    <Ionicons
                      name={isFav ? 'heart' : 'heart-outline'}
                      size={16}
                      color={isFav ? '#FF6B6B' : '#fff'}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.hBody} importantForAccessibility="no-hide-descendants">
                  <Text style={[styles.hName, { color: theme.deep || theme.text }]} numberOfLines={1}>
                    {place || item.hotel?.name || i18n.t('hotTours.title')}
                  </Text>
                  <Text style={[styles.hMeta, { color: theme.secondaryText }]} numberOfLines={1}>
                    {[item.nights ? formatNightsRu(item.nights) : '', item.date ? formatDateRuShort(item.date) : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {(mealName || item.departure?.name) ? (
                    <View style={styles.hIcons}>
                      {mealName ? (
                        <View style={styles.hIconChip}>
                          <Ionicons name="restaurant-outline" size={12} color={theme.secondaryText} />
                          <Text style={[styles.hIconText, { color: theme.secondaryText }]} numberOfLines={1}>
                            {mealName}
                          </Text>
                        </View>
                      ) : null}
                      {item.departure?.name ? (
                        <View style={styles.hIconChip}>
                          <Ionicons name="airplane-outline" size={12} color={theme.secondaryText} />
                          <Text style={[styles.hIconText, { color: theme.secondaryText }]} numberOfLines={1}>
                            {formatDepartureFrom(item.departure.name, language)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.hPriceRow}>
                    <TourPriceLabel
                      amount={displayPrice}
                      currencySymbol={currencySymbol}
                      fromPrefix
                      caption="за тур"
                      accent
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    {item.priceOld > item.price ? (
                      <Text style={[styles.oldPrice, { color: theme.secondaryText }]}>
                        {displayOld.toLocaleString('ru-RU')} {currencySymbol}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '800' },
  allBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  allBtnText: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  empty: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 22,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  dropBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dropText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  oldPrice: {
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginBottom: 1,
  },
  hScroll: { paddingRight: 8, gap: 12 },
  hCard: {
    width: 236,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginRight: 4,
  },
  hPhotoWrap: {
    width: '100%',
    height: 148,
    backgroundColor: '#E8EEF5',
  },
  hPhoto: { width: '100%', height: '100%' },
  heartBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hBody: { padding: 12, gap: 4 },
  hName: { fontSize: 15, fontWeight: '800' },
  hMeta: { fontSize: 12, fontWeight: '500' },
  hIcons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  hIconChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  hIconText: { fontSize: 11, fontWeight: '500', maxWidth: 96 },
  hPriceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  skelLine: { height: 10, borderRadius: 6 },
});
