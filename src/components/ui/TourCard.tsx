/**
 * Карточка тура для списков (горизонтальный макет).
 * Фото слева, название, гео, звёзды/рейтинг, цена и кнопка «Выбрать».
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import CachedImage from './CachedImage';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import { spacing, radius, typography, shadows, touchTargets } from '../../config/designSystem';
import { TourOutput } from '../../types/tourvisor';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_HOTEL_IMAGE } from '../../constants/images';

interface TourCardProps {
  tour: TourOutput;
  onPress: () => void;
  formatPrice: (price: number, currency: string) => string;
}

const Stars = ({ count }: { count: number }) => {
  const stars = Math.max(0, Math.min(5, Math.round(count)));
  return (
    <View style={starStyles.row}>
      {Array.from({ length: 5 }, (_, i) => (
        <Ionicons
          key={i}
          name="star"
          size={12}
          color={i < stars ? '#FF6B6B' : '#DDDDDD'}
        />
      ))}
    </View>
  );
};

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
});

const TourCard = React.memo(function TourCard({ tour, onPress, formatPrice }: TourCardProps) {
  const { theme } = useAppContext();
  const { width } = useWindowDimensions();
  const isNarrow = width < 360;
  const imageSize = isNarrow ? 84 : width >= 414 ? 104 : 96;
  const imageUri = tour.picture || (tour.hotel as { picturelink?: string })?.picturelink;
  const stars = (tour.hotel as any)?.stars ?? 0;
  const rating = Number((tour.hotel as any)?.rating ?? 0);
  const reviewsCount = Number((tour.hotel as any)?.reviews ?? (tour.hotel as any)?.reviewcount ?? 0);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.card,
        shadows.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          padding: isNarrow ? spacing.xs + 2 : spacing.sm,
        },
      ]}
    >
      <View style={[styles.imageWrap, { width: imageSize, height: imageSize, borderRadius: radius.md }]}>
        {imageUri ? (
          <CachedImage
            source={{ uri: imageUri }}
            style={{ width: imageSize, height: imageSize }}
            contentFit="cover"
            fallbackUri={DEFAULT_HOTEL_IMAGE}
          />
        ) : (
          <View
            style={[
              styles.imagePlaceholder,
              { width: imageSize, height: imageSize, backgroundColor: theme.lightGray },
            ]}
          >
            <Ionicons name="image-outline" size={28} color={theme.inactive} />
          </View>
        )}
        {rating > 0 ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#F5A623" />
            <Text style={styles.ratingBadgeText}>{rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.info, { marginLeft: isNarrow ? spacing.xs + 2 : spacing.sm }]}>
        <Text
          style={[styles.hotelName, { color: theme.text, fontSize: isNarrow ? 14 : 16 }]}
          numberOfLines={2}
        >
          {tour.hotel?.name || 'Тур'}
        </Text>

        <View style={styles.ratingRow}>
          {stars > 0 && <Stars count={stars} />}
          {reviewsCount > 0 ? (
            <Text style={[styles.reviewsHint, { color: theme.secondaryText }]}>
              {reviewsCount} {i18n.t('tour.reviewsTitle').toLowerCase()}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.geo, { color: theme.secondaryText }]} numberOfLines={1}>
          {[tour.hotel?.region?.name, tour.hotel?.subRegion?.name].filter(Boolean).join(' · ')}
        </Text>

        <Text style={[styles.meta, { color: theme.tertiaryText }]} numberOfLines={1}>
          {[
            tour.date ? tour.date : null,
            tour.nights ? `${tour.nights} ${i18n.t('tours.nightsShort')}` : null,
            tour.meal?.name || null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        <View style={styles.footer}>
          <Text style={[styles.price, { color: theme.primary, fontSize: isNarrow ? 16 : 18 }]}>
            {formatPrice(tour.price, tour.currency)}
          </Text>
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.82}
            style={[
              styles.selectBtn,
              {
                backgroundColor: theme.accent,
                height: isNarrow ? 40 : touchTargets.buttonSmall,
                paddingHorizontal: isNarrow ? 10 : spacing.sm,
              },
            ]}
          >
            <Text style={[styles.selectBtnText, { fontSize: isNarrow ? 12 : 13 }]}>
              {i18n.t('tours.book')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default TourCard;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  imageWrap: {
    overflow: 'hidden',
    flexShrink: 0,
    position: 'relative',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(18,18,46,0.82)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  ratingBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  info: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  hotelName: {
    ...typography.bodyBold,
    lineHeight: 20,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  reviewsHint: {
    fontSize: 11,
    fontWeight: '600',
  },
  geo: {
    ...typography.small,
    fontSize: 12,
  },
  meta: {
    fontSize: 12,
    fontWeight: '400',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 8,
  },
  price: {
    fontWeight: '800',
    flexShrink: 1,
  },
  selectBtn: {
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  selectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
