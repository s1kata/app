import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { useReviews } from '../hooks/useReviews';
import ReviewCard from './ReviewCard';
import { i18n } from '../config/i18n';
import { spacing, radius } from '../config/designSystem';

interface TourReviewsSectionProps {
  tourId: string;
  hotelId?: number;
  hotelName?: string;
  countryName?: string;
  navigation: { navigate: (screen: string, params?: object) => void };
}

export default function TourReviewsSection({
  tourId,
  hotelId,
  hotelName,
  countryName,
  navigation,
}: TourReviewsSectionProps) {
  const { theme, user, isAuthenticated, authReady } = useAppContext();
  const { reviews, loading, error, reload } = useReviews({
    tourId,
    withAuth: isAuthenticated,
    authReady,
    limit: 3,
  });

  const openReviews = (openAdd?: boolean) => {
    navigation.navigate('Reviews', {
      tourId,
      hotelId: hotelId != null ? String(hotelId) : undefined,
      hotelName,
      countryName,
      title: i18n.t('tour.reviewsTitle'),
      openAdd,
    });
  };

  const handleAddReview = () => {
    const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
    if (!isAuthenticated || isGuest) {
      Alert.alert(i18n.t('reviews.authRequiredTitle'), i18n.t('reviews.authRequiredBody'), [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        { text: i18n.t('auth.login'), onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }
    openReviews(true);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{i18n.t('tour.reviewsTitle')}</Text>
        <TouchableOpacity onPress={() => openReviews()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.link, { color: theme.primary }]}>{i18n.t('tour.allReviews')}</Text>
        </TouchableOpacity>
      </View>

      {loading && reviews.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: spacing.md }} />
      ) : error && reviews.length === 0 ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.empty, { color: theme.secondaryText }]}>
            Не удалось загрузить отзывы
          </Text>
          <TouchableOpacity onPress={() => void reload()}>
            <Text style={[styles.link, { color: theme.primary }]}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : reviews.length === 0 ? (
        <Text style={[styles.empty, { color: theme.secondaryText }]}>{i18n.t('tour.noReviews')}</Text>
      ) : (
        reviews.map((review) => (
          <ReviewCard
            key={review.id}
            review={{
              ...review,
              hotelName: review.hotelName ?? hotelName ?? null,
              countryName: review.countryName ?? countryName ?? null,
            }}
            compact
            style={styles.reviewItem}
          />
        ))
      )}

      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: theme.primary }]}
        onPress={handleAddReview}
        activeOpacity={0.85}
      >
        <Ionicons name="create-outline" size={18} color={theme.surface} />
        <Text style={[styles.addBtnText, { color: theme.surface }]}>{i18n.t('tour.addReview')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700' },
  link: { fontSize: 14, fontWeight: '600' },
  empty: { fontSize: 14, marginVertical: spacing.sm },
  errorWrap: { marginVertical: spacing.sm, gap: 4 },
  reviewItem: {
    marginBottom: spacing.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  addBtnText: { fontSize: 15, fontWeight: '600' },
});
