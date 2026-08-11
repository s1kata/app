/**
 * Блок туров на хабе отеля: 25 + «Показать ещё».
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
import { radius } from '../config/designSystem';

type Theme = {
  text: string;
  secondaryText: string;
  primary: string;
  card: string;
  border: string;
  secondaryBackground: string;
};

type Props = {
  hotel: { id: number; country?: { id: number }; category?: number; region?: { id: number }; name?: string } | null;
  tourContext?: Partial<TourSearchParams>;
  theme: Theme;
  navigation: { navigate: (s: string, p?: object) => void };
  enabled?: boolean;
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function OfferRow({
  offer,
  theme,
  onPress,
}: {
  offer: HotelTourOffer;
  theme: Theme;
  onPress: () => void;
}) {
  const t = offer.tour;
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {formatDate(t.date)}
          {t.nights ? ` · ${t.nights} н.` : ''}
          {t.meal?.russianName || t.meal?.name
            ? ` · ${t.meal.russianName || t.meal.name}`
            : ''}
        </Text>
        <Text style={[styles.rowSub, { color: theme.secondaryText }]} numberOfLines={1}>
          {t.operator?.russianName || t.operator?.name || 'Туроператор'}
        </Text>
      </View>
      <View style={styles.priceCol}>
        <Text style={[styles.price, { color: theme.primary }]}>
          {(Number(t.price) || 0).toLocaleString('ru-RU')} ₽
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.secondaryText} />
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
  } = useHotelTours(hotel, tourContext, enabled && !!hotel?.id);

  return (
    <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>ТУРЫ В ЭТОТ ОТЕЛЬ</Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {minPrice > 0
              ? `от ${minPrice.toLocaleString('ru-RU')} ₽`
              : 'Готовые предложения'}
          </Text>
          {totalFound > 0 ? (
            <Text style={[styles.meta, { color: theme.secondaryText }]}>
              {totalFound} вариантов · сразу выбирайте
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => void reload()}
          hitSlop={10}
          style={[styles.refreshBtn, { borderColor: theme.border }]}
        >
          <Ionicons name="refresh" size={18} color={theme.primary} />
        </TouchableOpacity>
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
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Не удалось загрузить</Text>
          <Text style={[styles.meta, { color: theme.secondaryText, textAlign: 'center' }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.moreBtn, { backgroundColor: theme.primary, marginTop: 12 }]}
            onPress={() => void reload()}
          >
            <Text style={styles.moreBtnText}>{i18n.t('home.hotDealsRetry')}</Text>
          </TouchableOpacity>
        </View>
      ) : offers.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="airplane-outline" size={28} color={theme.secondaryText} />
          <Text style={[styles.emptyTitle, { color: theme.text, marginTop: 8 }]}>
            На ближайшие даты туров нет
          </Text>
          <Text style={[styles.meta, { color: theme.secondaryText, textAlign: 'center' }]}>
            Попробуйте обновить или открыть полный поиск с другими датами
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {offers.map((o) => (
            <OfferRow
              key={o.key}
              offer={o}
              theme={theme}
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
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  title: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  meta: { fontSize: 13, marginTop: 2 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12 },
  priceCol: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  price: { fontSize: 16, fontWeight: '800' },
  moreBtn: {
    marginTop: 4,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  moreBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  moreOutlineText: { fontWeight: '700', fontSize: 14 },
});
