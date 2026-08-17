/**
 * Популярные отели — горизонтальные карточки как на концепте 13.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import CachedImage from '../components/ui/CachedImage';
import FilterChip from '../components/ui/FilterChip';
import TourPriceLabel from '../components/ui/TourPriceLabel';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { POPULAR_HOTEL_COUNTRIES, type PopularHotelCountry } from '../config/popularHotelsCountries';
import {
  sortPopularHotels,
  usePopularHotels,
  type PopularHotelCard,
  type PopularHotelsSort,
} from '../hooks/usePopularHotels';
import { radius, shadows, spacing } from '../config/designSystem';
import { FavoritesService } from '../services/FavoritesService';
import { navigateRoot, navigateTab } from '../utils/navHelpers';
import type { Hotel } from '../types';
import { i18n } from '../config/i18n';
import AuthRequiredCard from '../components/ux/AuthRequiredCard';

const PAGE = 12;

type Props = {
  navigation: any;
  route?: { params?: { countryId?: number } };
};

function HotelRow({
  item,
  theme,
  mediaWidth,
  isFavorite,
  onPress,
  onToggleFavorite,
}: {
  item: PopularHotelCard;
  theme: any;
  mediaWidth: number;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const stars = Number(item.category) || 0;
  const place = item.region?.name || item.country?.name || '';
  const price = item.minPrice || Number(item.price) || 0;

  return (
    <TouchableOpacity
      style={[styles.rowCard, shadows.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[styles.rowMedia, { width: mediaWidth }]}>
        <CachedImage
          source={{ uri: item.picturelink || DEFAULT_HOTEL_IMAGE }}
          fallbackUri={DEFAULT_HOTEL_IMAGE}
          style={styles.rowImage}
          contentFit="cover"
        />
        <TouchableOpacity
          style={[styles.rowHeart, { backgroundColor: theme.card }]}
          onPress={onToggleFavorite}
          hitSlop={8}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={14}
            color={isFavorite ? '#FF6B6B' : theme.deep || theme.text}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, { color: theme.deep || theme.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.starsRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Ionicons
              key={i}
              name="star"
              size={11}
              color={i < stars ? theme.primary : theme.border}
            />
          ))}
        </View>
        {place ? (
          <Text style={{ color: theme.secondaryText, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {place}
          </Text>
        ) : null}
        <View style={styles.rowFoot}>
          <TourPriceLabel amount={price} caption="за тур" style={{ flex: 1, minWidth: 0, paddingRight: 8 }} />
          <View style={[styles.toursBtn, { backgroundColor: theme.accent }]}>
            <Text style={styles.toursBtnText}>Туры</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function PopularHotelsScreen({ navigation, route }: Props) {
  const { theme, isDark, user } = useAppContext();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const mediaWidth = Math.max(96, Math.min(128, Math.round(screenWidth * 0.3)));
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const initial =
    POPULAR_HOTEL_COUNTRIES.find((c) => c.id === Number(route?.params?.countryId)) ||
    POPULAR_HOTEL_COUNTRIES[0];
  const [country, setCountry] = useState<PopularHotelCountry>(initial);
  const [minStars, setMinStars] = useState(0);
  const [sort] = useState<PopularHotelsSort>('price');
  const [shown, setShown] = useState(PAGE);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showAuthCard, setShowAuthCard] = useState(false);

  useEffect(() => {
    const id = Number(route?.params?.countryId);
    if (!id) return;
    const found = POPULAR_HOTEL_COUNTRIES.find((c) => c.id === id);
    if (found) setCountry(found);
  }, [route?.params?.countryId]);

  useEffect(() => {
    if (!user || isGuest) {
      setFavoriteIds(new Set());
      return;
    }
    void FavoritesService.getInstance()
      .getFavoriteHotels()
      .then((list) => setFavoriteIds(new Set(list.map((h) => String(h.id)))))
      .catch(() => {});
  }, [user, isGuest]);

  const { hotels, loading, error, tourContext, reload } = usePopularHotels(country, minStars);
  const sorted = useMemo(() => sortPopularHotels(hotels, sort, 0), [hotels, sort]);
  const visible = useMemo(() => sorted.slice(0, shown), [sorted, shown]);

  const openHotel = useCallback(
    (item: PopularHotelCard) => {
      navigation.navigate('ApiHotelDetails', {
        hotelId: item.id,
        hotelPreview: item,
        tourContext,
        focusTours: true,
      });
    },
    [navigation, tourContext],
  );

  const toggleHotelFavorite = useCallback(
    async (item: PopularHotelCard) => {
      try {
        if (!user || isGuest) {
          setShowAuthCard(true);
          return;
        }
        const hotel: Hotel = {
          id: String(item.id),
          name: item.name,
          description: '',
          location: item.region?.name || '',
          country: item.country?.name || '',
          category: String(item.category || ''),
          rating: Number(item.rating) || 0,
          reviews: 0,
          price: Number(item.minPrice || item.price) || 0,
          currency: 'RUB',
          image: item.picturelink || '',
          gallery: item.picturelink ? [item.picturelink] : [],
          amenities: [],
          stars: Number(item.category) || 0,
          mealTypes: [],
          available: true,
        };
        const result = await FavoritesService.getInstance().toggleHotelFavorite(hotel);
        if (!result.success) {
          Alert.alert(i18n.t('common.error'), result.error || i18n.t('favorites.updateFailed'));
          return;
        }
        const hid = String(item.id);
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (result.isFavorite) next.add(hid);
          else next.delete(hid);
          return next;
        });
      } catch {
        Alert.alert(i18n.t('common.error'), i18n.t('favorites.updateFailed'));
      }
    },
    [user, isGuest],
  );

  const listPadBottom = Math.max(28, insets.bottom + 16);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigateTab(navigation, 'Home'))}
          style={[styles.back, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={theme.deep} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.deep }]} numberOfLines={1}>
          Популярные отели
        </Text>
        <TouchableOpacity
          onPress={() => navigateTab(navigation, 'Favorites')}
          style={[styles.back, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name="heart-outline" size={20} color={theme.deep} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {POPULAR_HOTEL_COUNTRIES.map((c) => (
          <FilterChip
            key={c.id}
            label={c.name}
            active={c.id === country.id}
            onPress={() => {
              setCountry(c);
              setShown(PAGE);
            }}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={[styles.chips, { paddingTop: 0 }]}
      >
        {[
          { v: 0, label: 'Все' },
          { v: 3, label: '3+' },
          { v: 4, label: '4+' },
          { v: 5, label: '5★' },
        ].map((o) => (
          <FilterChip
            key={o.v}
            label={o.label}
            active={minStars === o.v}
            onPress={() => {
              setMinStars(o.v);
              setShown(PAGE);
            }}
          />
        ))}
      </ScrollView>

      {loading && visible.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: listPadBottom }]}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: theme.secondaryText }}>{error || 'Нет отелей с турами'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <HotelRow
              item={item}
              theme={theme}
              mediaWidth={mediaWidth}
              isFavorite={favoriteIds.has(String(item.id))}
              onPress={() => openHotel(item)}
              onToggleFavorite={() => void toggleHotelFavorite(item)}
            />
          )}
          ListFooterComponent={
            shown < sorted.length ? (
              <TouchableOpacity
                style={[styles.more, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => setShown((s) => s + PAGE)}
              >
                <Text style={{ color: theme.deep || theme.text, fontWeight: '700' }}>Показать ещё</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ height: 8 }} />
            )
          }
        />
      )}
      <AuthRequiredCard
        visible={showAuthCard}
        title={i18n.t('favorites.authRequired')}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 18, fontWeight: '800' },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, alignItems: 'center' },
  list: { paddingHorizontal: spacing.md, gap: 12 },
  rowCard: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
    height: 128,
  },
  rowMedia: { backgroundColor: '#E8EEF5', height: '100%' },
  rowImage: { width: '100%', height: '100%' },
  rowHeart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0, padding: 12, justifyContent: 'space-between' },
  rowName: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  starsRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  rowFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  toursBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  toursBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  more: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
