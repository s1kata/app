/**
 * Блок «Готовые предложения» на карточке отеля — как на концепте 14.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TourSearchParams } from '../types/tourvisor';
import { useHotelTours, type HotelTourOffer } from '../hooks/useHotelTours';
import { i18n } from '../config/i18n';
import { radius, spacing, shadows } from '../config/designSystem';
import PrimaryButton from './ui/PrimaryButton';
import TourPriceLabel from './ui/TourPriceLabel';
import CachedImage from './ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { formatAdultsRu, formatNightsRu } from '../utils/pluralRu';

type Theme = {
  text: string;
  secondaryText: string;
  primary: string;
  accent?: string;
  deep?: string;
  card: string;
  border: string;
  secondaryBackground: string;
};

type Props = {
  hotel: {
    id: number;
    country?: { id: number };
    category?: number;
    region?: { id: number };
    name?: string;
    picturelink?: string;
  } | null;
  tourContext?: Partial<TourSearchParams>;
  theme: Theme;
  navigation: { navigate: (s: string, p?: object) => void };
  enabled?: boolean;
  hotelImage?: string;
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function endDate(dateStr: string, nights: number): string {
  if (!dateStr || !nights) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + nights);
  return formatDate(d.toISOString().slice(0, 10));
}

function OfferRow({
  offer,
  theme,
  thumb,
  adults,
  onPress,
}: {
  offer: HotelTourOffer;
  theme: Theme;
  thumb: string;
  adults: number;
  onPress: () => void;
}) {
  const t = offer.tour;
  const meal = t.meal?.russianName || t.meal?.name || '';
  const from = formatDate(t.date);
  const to = endDate(t.date, Number(t.nights) || 0);
  const range = from && to ? `${from} — ${to}` : from;

  return (
    <TouchableOpacity
      style={[styles.row, shadows.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <CachedImage source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
      <View style={styles.rowMid}>
        <Text style={[styles.rowTitle, { color: theme.deep || theme.text }]} numberOfLines={1}>
          {range}
        </Text>
        <Text style={[styles.rowSub, { color: theme.secondaryText }]} numberOfLines={1}>
          {[t.nights ? formatNightsRu(t.nights) : '', adults > 0 ? formatAdultsRu(adults) : '']
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {meal ? (
          <Text style={[styles.rowSub, { color: theme.secondaryText }]} numberOfLines={1}>
            {meal}
          </Text>
        ) : null}
        <View style={styles.confirmRow}>
          <Ionicons name="checkmark-circle" size={14} color={theme.primary} />
          <Text style={[styles.confirmText, { color: theme.primary }]} numberOfLines={1}>
            Моментальное подтверждение
          </Text>
        </View>
      </View>
      <View style={styles.priceCol}>
        <TourPriceLabel amount={Number(t.price) || 0} caption="за тур" />
        <View style={[styles.selectPill, { backgroundColor: theme.accent || theme.primary }]}>
          <Text style={styles.selectPillText}>Смотреть тур</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HotelToursSection({
  hotel,
  tourContext,
  theme,
  navigation,
  enabled = true,
  hotelImage,
}: Props) {
  const {
    loading,
    loadingMore,
    error,
    offers,
    totalFound,
    minPrice,
    hasMore,
    reload,
    loadMore,
    openOffer,
    params,
  } = useHotelTours(hotel, tourContext, enabled && !!hotel?.id);

  const thumb =
    hotelImage ||
    hotel?.picturelink ||
    (offers[0]?.hotel as { picturelink?: string } | undefined)?.picturelink ||
    DEFAULT_HOTEL_IMAGE;
  const adults = Number(params?.adults || tourContext?.adults || 2);

  const openAll = () => {
    if (!params) return;
    navigation.navigate('ApiTourResults', {
      searchParams: params,
      useCache: false,
      runSearch: true,
    });
  };

  return (
    <View style={[styles.wrap, shadows.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: theme.deep || theme.text }]}>Готовые предложения</Text>
          {minPrice > 0 ? (
            <TourPriceLabel amount={minPrice} caption="цена за тур" style={{ marginTop: 4 }} />
          ) : totalFound > 0 ? (
            <Text style={[styles.meta, { color: theme.secondaryText }]}>
              {totalFound} вариантов
            </Text>
          ) : null}
        </View>
        {params ? (
          <TouchableOpacity onPress={openAll} hitSlop={10}>
            <Text style={[styles.seeAll, { color: theme.primary }]}>Смотреть все</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => void reload()}
            hitSlop={10}
            style={[styles.refreshBtn, { borderColor: theme.border, backgroundColor: theme.secondaryBackground }]}
          >
            <Ionicons name="refresh" size={18} color={theme.primary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.meta, { color: theme.secondaryText, marginTop: 8 }]}>
            Ищем туры…
          </Text>
        </View>
      ) : error && offers.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: theme.deep || theme.text }]}>Не удалось загрузить</Text>
          <Text style={[styles.meta, { color: theme.secondaryText, textAlign: 'center' }]}>
            {error}
          </Text>
          <PrimaryButton
            title={i18n.t('home.hotDealsRetry')}
            onPress={() => void reload()}
            variant="cta"
            small
            style={{ marginTop: 12, minWidth: 140 }}
          />
        </View>
      ) : offers.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="airplane-outline" size={28} color={theme.secondaryText} />
          <Text style={[styles.emptyTitle, { color: theme.deep || theme.text, marginTop: 8 }]}>
            На ближайшие даты туров нет
          </Text>
          <Text style={[styles.meta, { color: theme.secondaryText, textAlign: 'center' }]}>
            Попробуйте обновить или открыть полный поиск с другими датами
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {offers.map((o) => (
            <OfferRow
              key={o.key}
              offer={o}
              theme={theme}
              thumb={thumb}
              adults={adults}
              onPress={() => void openOffer(o, navigation)}
            />
          ))}
          {hasMore ? (
            <TouchableOpacity
              style={[styles.moreBtn, { borderColor: theme.border, backgroundColor: theme.secondaryBackground }]}
              onPress={() => void loadMore()}
              disabled={loadingMore}
              activeOpacity={0.85}
            >
              {loadingMore ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <Text style={[styles.moreOutlineText, { color: theme.primary }]}>
                  Показать ещё 25
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  meta: { fontSize: 13, marginTop: 2 },
  seeAll: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', paddingVertical: 20, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 10,
    gap: 10,
  },
  thumb: {
    width: 64,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: '#E8EEF5',
  },
  rowMid: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  confirmText: { fontSize: 11, fontWeight: '600', flex: 1 },
  priceCol: { alignItems: 'flex-end', gap: 6, maxWidth: 120 },
  selectPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  selectPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  moreBtn: {
    marginTop: 4,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  moreOutlineText: { fontWeight: '700', fontSize: 14 },
});
