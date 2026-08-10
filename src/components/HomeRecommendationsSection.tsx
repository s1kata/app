import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import CachedImage from './ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import {
  recommendationService,
  RecommendationItem,
} from '../services/RecommendationService';
import { radius, shadows, spacing } from '../config/designSystem';
import { RELEASE_HIDE_NEXT_PATCH_UI } from '../config/releaseUiFlags';

type Props = {
  navigation: any;
  refreshKey?: number;
};

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

export default function HomeRecommendationsSection({ navigation, refreshKey = 0 }: Props) {
  const { theme, isAuthenticated, user } = useAppContext();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const cardW = Math.min(280, width * 0.72);

  const load = useCallback(async () => {
    if (RELEASE_HIDE_NEXT_PATCH_UI) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await recommendationService.getRecommendations(8);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey, isAuthenticated]);

  if (RELEASE_HIDE_NEXT_PATCH_UI) return null;

  const openItem = (item: RecommendationItem) => {
    if (item.tourId) {
      navigation.navigate('ApiTourDetails', { tourId: item.tourId });
      return;
    }
    if (item.countryId) {
      navigation.navigate('ApiHotTours', {
        countryId: item.countryId,
        countryName: item.countryName,
      });
      return;
    }
    navigation.navigate('ApiHotTours');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>
            {i18n.t('recommendations.title').toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>{i18n.t('home.usefulRecommendations')}</Text>
        </View>
        {!isGuest && isAuthenticated ? (
          <TouchableOpacity
            onPress={() => void load()}
            hitSlop={12}
            style={[styles.refreshBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="refresh" size={18} color={theme.primary} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && items.length === 0 ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          style={styles.gallery}
        >
          {[0, 1, 2].map((k) => (
            <ShimmerCard key={k} width={cardW} theme={theme} />
          ))}
        </ScrollView>
      ) : items.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: `${theme.primary}14` }]}>
            <Ionicons name="sparkles" size={22} color={theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('recommendations.empty')}</Text>
          <Text style={[styles.hint, { color: theme.secondaryText }]}>
            {i18n.t('recommendations.emptyDesc')}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          style={styles.gallery}
          decelerationRate="fast"
          snapToInterval={cardW + 12}
          snapToAlignment="start"
          disableIntervalMomentum
        >
          {items.map((item) => (
            <TouchableOpacity
              key={item.key}
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
                  source={{ uri: item.image || DEFAULT_HOTEL_IMAGE }}
                  style={styles.image}
                  contentFit="cover"
                  recyclingKey={item.key}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.45)']}
                  style={styles.imageFade}
                />
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                    <Text style={styles.badgeText}>
                      {item.source === 'favorite' ? i18n.t('favorites.tours') : i18n.t('hotTours.title')}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.body}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[styles.geo, { color: theme.secondaryText }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
                <View style={styles.priceRow}>
                  {item.price > 0 ? (
                    <Text style={[styles.price, { color: theme.primary }]}>
                      от {item.price.toLocaleString('ru-RU')} ₽
                    </Text>
                  ) : (
                    <View />
                  )}
                  <View style={styles.ctaRow}>
                    <Text style={[styles.cta, { color: theme.primary }]}>
                      {i18n.t('recommendations.view')}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.primary} />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Text style={[styles.footer, { color: theme.tertiaryText }]}>
        {i18n.t('recommendations.footer')}
      </Text>
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
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  gallery: { marginHorizontal: -2 },
  row: { paddingRight: 8, paddingVertical: 2 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: 12,
  },
  image: { width: '100%', height: 148 },
  imageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  badgeRow: { position: 'absolute', top: 10, left: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  body: { padding: 12, gap: 4 },
  name: { fontSize: 15, fontWeight: '700' },
  geo: { fontSize: 12 },
  priceRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: { fontSize: 16, fontWeight: '800' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cta: { fontSize: 13, fontWeight: '700' },
  footer: { fontSize: 11, marginTop: 10 },
  skelLine: { height: 10, borderRadius: 6 },
});
