/**
 * Витрина популярных отелей — только с турами и ценой (mobile-first).
 */
import React, { useMemo, useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import CachedImage from '../components/ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { POPULAR_HOTEL_COUNTRIES, type PopularHotelCountry } from '../config/popularHotelsCountries';
import {
  sortPopularHotels,
  usePopularHotels,
  type PopularHotelCard,
  type PopularHotelsSort,
} from '../hooks/usePopularHotels';
import { BRAND, radius, shadows, spacing, typography } from '../config/designSystem';

const PAGE = 12;

type Props = {
  navigation: any;
};

function StarChips({
  value,
  onChange,
  theme,
}: {
  value: number;
  onChange: (n: number) => void;
  theme: { text: string; secondaryText: string; border: string; card: string; primary: string };
}) {
  const opts = [
    { v: 0, label: 'Все' },
    { v: 3, label: '3+' },
    { v: 4, label: '4+' },
    { v: 5, label: '5★' },
  ];
  return (
    <View style={styles.starsRow}>
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <TouchableOpacity
            key={o.v}
            onPress={() => onChange(o.v)}
            activeOpacity={0.85}
            style={[
              styles.starChip,
              {
                backgroundColor: active ? theme.primary : theme.card,
                borderColor: active ? theme.primary : theme.border,
              },
            ]}
          >
            <Text style={{ color: active ? '#fff' : theme.secondaryText, fontWeight: '700', fontSize: 13 }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function HotelCard({
  item,
  theme,
  onPress,
}: {
  item: PopularHotelCard;
  theme: any;
  onPress: () => void;
}) {
  const stars = Number(item.category) || 0;
  const rating = Number(item.rating) || 0;
  const place = item.region?.name || item.country?.name || '';
  const price = item.minPrice || Number(item.price) || 0;

  return (
    <TouchableOpacity
      style={[styles.card, shadows.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.media}>
        <CachedImage
          source={{ uri: item.picturelink || DEFAULT_HOTEL_IMAGE }}
          style={styles.image}
          contentFit="cover"
        />
        <View style={styles.badges}>
          {stars > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{stars}★</Text>
            </View>
          ) : (
            <View />
          )}
          {rating > 0 ? (
            <View style={styles.badge}>
              <Ionicons name="star" size={11} color="#B45309" />
              <Text style={[styles.badgeText, { color: '#B45309' }]}>{rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.body}>
        {place ? (
          <Text style={[styles.place, { color: theme.primary }]} numberOfLines={1}>
            {place.toUpperCase()}
          </Text>
        ) : null}
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.foot}>
          <View>
            <Text style={[styles.priceLabel, { color: theme.secondaryText }]}>туры от</Text>
            <Text style={[styles.price, { color: BRAND.orange }]}>
              {price > 0 ? `${price.toLocaleString('ru-RU')} ₽` : '—'}
            </Text>
          </View>
          <View style={[styles.go, { backgroundColor: theme.primary }]}>
            <Text style={styles.goText}>Туры</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function PopularHotelsScreen({ navigation }: Props) {
  const { theme, isDark } = useAppContext();
  const [country, setCountry] = useState<PopularHotelCountry>(POPULAR_HOTEL_COUNTRIES[0]);
  const [minStars, setMinStars] = useState(0);
  const [sort, setSort] = useState<PopularHotelsSort>('price');
  const [shown, setShown] = useState(PAGE);

  const { hotels, loading, error, tourContext, reload } = usePopularHotels(country, minStars);

  const sorted = useMemo(
    () => sortPopularHotels(hotels, sort, 0),
    [hotels, sort],
  );

  const visible = useMemo(() => sorted.slice(0, shown), [sorted, shown]);

  const onSelectCountry = useCallback((c: PopularHotelCountry) => {
    setCountry(c);
    setShown(PAGE);
  }, []);

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerEyebrow, { color: theme.primary }]}>ТОЛЬКО С ТУРАМИ</Text>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Популярные отели</Text>
        </View>
      </View>

      <View style={[styles.sticky, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {POPULAR_HOTEL_COUNTRIES.map((c) => {
            const active = c.id === country.id;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => onSelectCountry(c)}
                activeOpacity={0.85}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.text : theme.card,
                    borderColor: active ? theme.text : theme.border,
                  },
                ]}
              >
                <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 13 }}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.row2}>
          <StarChips value={minStars} onChange={(n) => { setMinStars(n); setShown(PAGE); }} theme={theme} />
          <TouchableOpacity
            onPress={() => {
              const order: PopularHotelsSort[] = ['price', 'rating', 'stars'];
              const i = order.indexOf(sort);
              setSort(order[(i + 1) % order.length]);
              setShown(PAGE);
            }}
            style={[styles.sortBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Ionicons name="swap-vertical" size={14} color={theme.primary} />
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }}>
              {sort === 'price' ? 'Цена' : sort === 'rating' ? 'Рейтинг' : 'Звёзды'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={{ color: theme.secondaryText, fontWeight: '600', fontSize: 13 }}>
          {loading ? 'Загрузка…' : `${sorted.length} отелей`}
        </Text>
      </View>

      {loading && visible.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={{ color: theme.secondaryText, marginTop: 12, fontWeight: '600' }}>
            Подбираем отели с турами…
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="bed-outline" size={36} color={theme.secondaryText} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {error ? 'Не удалось загрузить' : 'Нет отелей с турами'}
              </Text>
              <Text style={{ color: theme.secondaryText, textAlign: 'center', marginTop: 6, paddingHorizontal: 24 }}>
                {error || 'Выберите другую страну или звёзды'}
              </Text>
              <TouchableOpacity
                style={[styles.retry, { backgroundColor: theme.primary }]}
                onPress={() => void reload()}
              >
                <Text style={styles.retryText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <HotelCard item={item} theme={theme} onPress={() => openHotel(item)} />
          )}
          ListFooterComponent={
            shown < sorted.length ? (
              <TouchableOpacity
                style={[styles.more, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => setShown((s) => s + PAGE)}
              >
                <Text style={{ color: theme.text, fontWeight: '700' }}>Показать ещё</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ height: 24 }} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  backBtn: { padding: 4 },
  headerEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  headerTitle: { ...typography.h3, marginTop: 2 },
  sticky: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chips: { paddingHorizontal: spacing.md, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: 8,
  },
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: 8,
  },
  starsRow: { flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap', minWidth: 0 },
  starChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  metaRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  list: { paddingHorizontal: spacing.md, paddingBottom: 40, gap: 12 },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  media: { aspectRatio: 16 / 10, backgroundColor: '#E8EEF5' },
  image: { width: '100%', height: '100%' },
  badges: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#12122E' },
  body: { padding: spacing.md, gap: 4 },
  place: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  name: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  foot: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: { fontSize: 12, fontWeight: '600' },
  price: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  go: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  goText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56 },
  emptyTitle: { marginTop: 10, fontSize: 17, fontWeight: '700' },
  retry: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  more: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
