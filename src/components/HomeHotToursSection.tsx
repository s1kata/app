/**
 * Витрина горящих туров на Home — server Tourvisor hots, крупные карточки.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import { fetchHotToursViaBackend } from '../services/sync/NextPatchBackendClient';
import { TourHot } from '../types/tourvisor';
import { radius, shadows, spacing } from '../config/designSystem';
import { logger } from '../utils/logger';

const CACHE_KEY = 'home_hot_tours_v2';
const CACHE_TTL_MS = 15 * 60 * 1000;
const LIMIT = 8;
const DEFAULT_DEPARTURE = 1; // Москва

type Props = {
  navigation: any;
  refreshKey?: number;
};

type CachePayload = { at: number; items: TourHot[]; departureId: number };

function ShimmerCard({ width, theme }: { width: number; theme: { card: string; border: string } }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-width, width] });
  return (
    <View
      style={[
        styles.card,
        shadows.card,
        { width, backgroundColor: theme.card, borderColor: theme.border, marginRight: 12 },
      ]}
    >
      <View style={[styles.image, { backgroundColor: `${theme.border}88`, overflow: 'hidden' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1, width: width * 0.55 }}
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

export default function HomeHotToursSection({ navigation, refreshKey = 0 }: Props) {
  const { theme, apiReady } = useAppContext();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<TourHot[]>([]);
  const [loading, setLoading] = useState(true);
  const cardW = Math.min(300, width * 0.78);

  const load = useCallback(async (bypassCache = false) => {
    setLoading(true);

    const fetchAndStore = async (soft: boolean) => {
      try {
        const recent = await recommendationService.getRecentSearches();
        const departureId = recent.find((r) => r.departureId)?.departureId || DEFAULT_DEPARTURE;

        // Сначала без фильтра по странам — так горящие стабильнее заполняются
        const baseParams: Parameters<typeof tourvisorApi.getHotTours>[0] = {
          departureId,
          currency: 'RUB',
          onlyCharter: false,
          limit: 40,
        };

        const tryFetch = async (
          params: Parameters<typeof tourvisorApi.getHotTours>[0],
        ): Promise<TourHot[]> => {
          try {
            const remote = await fetchHotToursViaBackend(params);
            if (remote.success && remote.data?.length) return remote.data;
            logger.debug('[HomeHotTours] backend miss:', remote.error);
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

        let hot = await tryFetch(baseParams);

        // Если пусто — пробуем departure Москва (1)
        if (!hot.length && departureId !== DEFAULT_DEPARTURE) {
          hot = await tryFetch({ ...baseParams, departureId: DEFAULT_DEPARTURE });
        }

        const list = (Array.isArray(hot) ? hot : []).slice(0, LIMIT);
        if (list.length) {
          void hotelPictureCache.ingestFromTours(
            list.map((h) => ({ hotel: h.hotel, picture: h.hotel?.picturelink })),
          );
          setItems(list);
          await AsyncStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              at: Date.now(),
              items: list,
              departureId: list.length ? departureId : DEFAULT_DEPARTURE,
            } satisfies CachePayload),
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

  const openItem = (item: TourHot) => {
    if (item.country?.id) {
      navigation.navigate('ApiHotTours', {
        countryId: item.country.id,
        countryName: item.country.name,
      });
      return;
    }
    openAll();
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
        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {[0, 1, 2].map((k) => (
            <ShimmerCard key={k} width={cardW} theme={theme} />
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
        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          decelerationRate="fast"
        >
          {items.map((item, idx) => {
            const drop = discountPercent(item);
            const key = `hot_${item.hotel?.id}_${item.date}_${idx}`;
            const image = item.hotel?.picturelink || DEFAULT_HOTEL_IMAGE;
            const geo = [item.country?.name, item.hotel?.region?.name].filter(Boolean).join(' · ');
            return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.88}
                onPress={() => openItem(item)}
                delayPressIn={50}
                style={[
                  styles.card,
                  shadows.card,
                  { width: cardW, backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <View>
                  <CachedImage
                    source={{ uri: image }}
                    style={styles.image}
                    contentFit="cover"
                    recyclingKey={key}
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.55)']}
                    style={styles.imageFade}
                  />
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: theme.accent || '#FF6B00' }]}>
                      <Ionicons name="flame" size={12} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={styles.badgeText}>{i18n.t('home.hotDealsBadge')}</Text>
                    </View>
                    {drop != null ? (
                      <View style={[styles.badge, { backgroundColor: '#16A34A', marginLeft: 6 }]}>
                        <Text style={styles.badgeText}>−{drop}%</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.body}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                    {item.hotel?.name || i18n.t('hotTours.title')}
                  </Text>
                  <Text style={[styles.geo, { color: theme.secondaryText }]} numberOfLines={1}>
                    {geo}
                  </Text>
                  <Text style={[styles.meta, { color: theme.secondaryText }]} numberOfLines={1}>
                    {item.date} · {item.nights}{' '}
                    {item.nights === 1
                      ? i18n.t('search.night')
                      : item.nights < 5
                        ? i18n.t('search.nights2')
                        : i18n.t('search.nights')}
                  </Text>
                  <View style={styles.priceRow}>
                    <View>
                      {item.priceOld > item.price ? (
                        <Text style={[styles.oldPrice, { color: theme.secondaryText }]}>
                          {Number(item.priceOld).toLocaleString('ru-RU')} ₽
                        </Text>
                      ) : null}
                      <Text style={[styles.price, { color: theme.primary }]}>
                        {i18n.t('hotTours.from')} {Number(item.price || 0).toLocaleString('ru-RU')} ₽
                      </Text>
                    </View>
                    <View style={styles.ctaRow}>
                      <Text style={[styles.cta, { color: theme.primary }]}>
                        {i18n.t('recommendations.view')}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={theme.primary} />
                    </View>
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
  row: { paddingRight: 8 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: 12,
  },
  image: { width: '100%', height: 168 },
  imageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
  },
  badgeRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  body: { padding: 12, gap: 4 },
  name: { fontSize: 15, fontWeight: '700' },
  geo: { fontSize: 12 },
  meta: { fontSize: 12, marginTop: 2 },
  priceRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  oldPrice: {
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  price: { fontSize: 17, fontWeight: '800' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cta: { fontSize: 13, fontWeight: '700' },
  skelLine: { height: 10, borderRadius: 6 },
});
