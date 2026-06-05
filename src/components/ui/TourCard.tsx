/**
 * Карточка тура для списков (горизонтальный макет).
 * Фото 80×80 слева, название, гео, звёзды, цена и кнопка «Выбрать» справа.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CachedImage from './CachedImage';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import { spacing, radius, typography, shadows, touchTargets } from '../../config/designSystem';
import { TourOutput } from '../../types/tourvisor';
import { Ionicons } from '@expo/vector-icons';

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
          color={i < stars ? '#FF6B00' : '#DDDDDD'}
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
  const imageUri = tour.picture || (tour.hotel as { picturelink?: string })?.picturelink;
  const stars = (tour.hotel as any)?.stars ?? 0;

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
        },
      ]}
    >
      {/* Фото отеля */}
      <View style={styles.imageWrap}>
        {imageUri ? (
          <CachedImage source={{ uri: imageUri }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: theme.lightGray }]}>
            <Ionicons name="image-outline" size={28} color={theme.inactive} />
          </View>
        )}
      </View>

      {/* Информация */}
      <View style={styles.info}>
        <Text style={[styles.hotelName, { color: theme.text }]} numberOfLines={2}>
          {tour.hotel.name}
        </Text>

        {stars > 0 && <Stars count={stars} />}

        <Text style={[styles.geo, { color: theme.secondaryText }]} numberOfLines={1}>
          {[tour.hotel.region?.name, tour.hotel.subRegion?.name].filter(Boolean).join(' · ')}
        </Text>

        <Text style={[styles.meta, { color: theme.tertiaryText }]} numberOfLines={1}>
          {[
            tour.startDate ? tour.startDate : null,
            tour.nights ? `${tour.nights} ${i18n.t('tours.nightsShort')}` : null,
            tour.meal?.name || null,
          ].filter(Boolean).join(' · ')}
        </Text>

        {/* Цена + кнопка */}
        <View style={styles.footer}>
          <Text style={[styles.price, { color: theme.primary }]}>
            {formatPrice(tour.price, tour.currency)}
          </Text>
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.82}
            style={[styles.selectBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.selectBtnText}>{i18n.t('tours.book')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default TourCard;

const IMAGE_SIZE = 80;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    alignItems: 'flex-start',
  },
  imageWrap: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: radius.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  imagePlaceholder: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: spacing.sm,
    gap: 4,
  },
  hotelName: {
    ...typography.bodyBold,
    fontSize: 16,
    lineHeight: 20,
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
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
  },
  selectBtn: {
    paddingHorizontal: spacing.sm,
    height: touchTargets.buttonSmall,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
