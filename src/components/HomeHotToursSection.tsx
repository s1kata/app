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
  useWindowDimensions,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import CachedImage from './ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { tourvisorApi } from '../services/TourvisorApiService';
import { hotelPictureCache } from '../services/HotelPictureCache';
import { recommendationService } from '../services/RecommendationService';
import { dictionaryService } from '../services/DictionaryService';
import { fetchHotToursViaBackend } from '../services/sync/NextPatchBackendClient';
import { TourHot } from '../types/tourvisor';
import { radius, shadows, spacing } from '../config/designSystem';
import { logger } from '../utils/logger';
import { cacheTourFromHot } from '../utils/tourDetailsCache';

const CACHE_KEY = 'home_hot_tours_v3';
const CACHE_TTL_MS = 15 * 60 * 1000;
const LIMIT = 12;
const DEPARTURE_PREF_KEY = 'user_preferred_departure_id';
const MAJOR_DEPARTURE_NAMES = [
  'самара',
  'москва',
  'санкт-петербург',
  'казань',
  'екатеринбург',
  'новосибирск',
  'уфа',
  'краснодар',
  'ростов',
];

type Props = {
  navigation: any;
  refreshKey?: number;
};

type CachePayload = { at: number; items: TourHot[] };

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
        styles.card,
        shadows.card,
        { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 10 },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: `${theme.border}88`, overflow: 'hidden' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1, width: 90 }}
          />
        </Animated.View>
      </View>
      <View style={styles.body}>
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
      const samara = deps.find((d) => d.name.toLowerCase().includes('самара'));
      preferred = samara?.id || deps[0]?.id || 1;
    }

    const recent = await recommendationService.getRecentSearches();
    const recentDep = recent.find((r) => r.departureId)?.departureId;

    const pool: number[] = [];
    const push = (id?: number) => {
      if (!id || pool.includes(id)) return;
      pool.push(id);
    };
    push(preferred);
    push(recentDep);
    for (const needle of MAJOR_DEPARTURE_NAMES) {
      const found = deps.find((d) => d.name.toLowerCase().includes(needle));
      push(found?.id);
      if (pool.length >= 6) break;
    }
    if (!pool.length) pool.push(1);
    return { pool, names };
  } catch (e) {
    logger.debug('[HomeHotTours] departures:', (e as Error)?.message);
    return { pool: [1], names };
  }
}

export default function HomeHotToursSection({ navigation, refreshKey = 0 }: Props) {
  const { theme, apiReady } = useAppContext();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<TourHot[]>([]);
  const [loading, setLoading] = useState(true);
  const thumbSize = Math.min(112, Math.round(width * 0.28));

  const load = useCallback(async (bypassCache = false) => {
    setLoading(true);

    const fetchAndStore = async (soft: boolean) => {
      try {
        const { pool, names } = await resolveDeparturePool();

        const tryFetch = async (departureId: number): Promise<TourHot[]> => {
          const params = {
            departureId,
            currency: 'RUB' as const,
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

        merged.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        const list = merged.slice(0, LIMIT);

        if (list.length) {
          void hotelPictureCache.ingestFromTours(
            list.map((h) => ({ hotel: h.hotel, picture: h.hotel?.picturelink })),
          );
          setItems(list);
          await AsyncStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ at: Date.now(), items: list } satisfies CachePayload),
          );
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
      if (!bypassCache) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CachePayload;
          if (parsed?.items?.length && Date.now() - parsed.at < CACHE_TTL_MS) {
            setItems(parsed.items);
            setLoading(false);
            void fetchAndStore(true);
            return;
          }
        }
      }
      await fetchAndStore(false);
    } catch (e) {
      logger.debug('[HomeHotTours]', (e as Error)?.message);
      setItems([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!apiReady) return;
    void load(refreshKey > 0);
  }, [apiReady, load, refreshKey]);

  const openAll = () => navigation.navigate('ApiHotTours');

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
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: theme.accent || theme.primary }]}>
            {i18n.t('home.hotDealsEyebrow').toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>{i18n.t('home.hotDealsTitle')}</Text>
        </View>
        <TouchableOpacity
          onPress={openAll}
          hitSlop={12}
          style={[styles.allBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
        >
          <Text style={[styles.allBtnText, { color: theme.primary }]}>{i18n.t('home.hotDealsAll')}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View>
          {[0, 1, 2].map((k) => (
            <ShimmerCard key={k} theme={theme} />
          ))}
        </View>
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
        <View>
          {items.map((item, idx) => {
            const drop = discountPercent(item);
            const key = `hot_${tourKey(item)}_${idx}`;
            const image = item.hotel?.picturelink || DEFAULT_HOTEL_IMAGE;
            const geo = [item.country?.name, item.hotel?.region?.name].filter(Boolean).join(' · ');
            const fromCity = item.departure?.name ? `из ${item.departure.name}` : '';
            return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.88}
                onPress={() => openItem(item)}
                style={[
                  styles.card,
                  shadows.card,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <View style={[styles.thumbWrap, { width: thumbSize, height: thumbSize }]}>
                  <CachedImage
                    source={{ uri: image }}
                    style={styles.thumb}
                    contentFit="cover"
                    recyclingKey={key}
                  />
                  <View style={[styles.flameDot, { backgroundColor: theme.accent || '#FF6B00' }]}>
                    <Ionicons name="flame" size={11} color="#fff" />
                  </View>
                  {drop != null ? (
                    <View style={styles.dropBadge}>
                      <Text style={styles.dropText}>−{drop}%</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.body}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                    {item.hotel?.name || i18n.t('hotTours.title')}
                  </Text>
                  {geo ? (
                    <Text style={[styles.geo, { color: theme.secondaryText }]} numberOfLines={1}>
                      {geo}
                    </Text>
                  ) : null}
                  <Text style={[styles.meta, { color: theme.secondaryText }]} numberOfLines={1}>
                    {[
                      fromCity,
                      item.date,
                      item.nights
                        ? `${item.nights} ${
                            item.nights === 1
                              ? i18n.t('search.night')
                              : item.nights < 5
                                ? i18n.t('search.nights2')
                                : i18n.t('search.nights')
                          }`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <View style={styles.priceRow}>
                    <View style={{ flex: 1 }}>
                      {item.priceOld > item.price ? (
                        <Text style={[styles.oldPrice, { color: theme.secondaryText }]}>
                          {Number(item.priceOld).toLocaleString('ru-RU')} ₽
                        </Text>
                      ) : null}
                      <Text style={[styles.price, { color: theme.primary }]}>
                        {Number(item.price || 0).toLocaleString('ru-RU')} ₽
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={openAll}
            style={[styles.moreBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
          >
            <Text style={[styles.moreBtnText, { color: theme.primary }]}>
              {i18n.t('home.hotDealsAll')}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={theme.primary} />
          </TouchableOpacity>
        </View>
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
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
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
    borderRadius: radius.lg,
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
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
    padding: 10,
    gap: 12,
  },
  thumbWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: { width: '100%', height: '100%', borderRadius: radius.md },
  flameDot: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: '#16A34A',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dropText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  body: { flex: 1, justifyContent: 'center', gap: 2, paddingRight: 2 },
  name: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  geo: { fontSize: 12, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 2 },
  priceRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  oldPrice: {
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginBottom: 1,
  },
  price: { fontSize: 18, fontWeight: '800' },
  moreBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  moreBtnText: { fontSize: 14, fontWeight: '700' },
  skelLine: { height: 10, borderRadius: 6 },
});
