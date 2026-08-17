import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { useReviews } from '../hooks/useReviews';
import ReviewCard from './ReviewCard';
import AuthRequiredCard from './ux/AuthRequiredCard';
import { i18n } from '../config/i18n';
import { spacing, radius, shadows, typography } from '../config/designSystem';
import { navigateRoot } from '../utils/navHelpers';

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
  const { width } = useWindowDimensions();
  const isNarrow = width < 360;
  const [showAuthCard, setShowAuthCard] = useState(false);
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const { reviews, loading, error, reload } = useReviews({
    tourId,
    hotelId: hotelId != null ? String(hotelId) : undefined,
    withAuth: isAuthenticated && !isGuest,
    authReady: isGuest ? true : authReady,
    limit: 3,
  });

  const avg =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
      : 0;

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
    if (!isAuthenticated || isGuest) {
      setShowAuthCard(true);
      return;
    }
    openReviews(true);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.text, fontSize: isNarrow ? 16 : 18 }]}>
            {i18n.t('tour.reviewsTitle')}
          </Text>
          {reviews.length > 0 ? (
            <View style={[styles.avgChip, { backgroundColor: `${theme.primary}16` }]}>
              <Ionicons name="star" size={12} color="#F5A623" />
              <Text style={[styles.avgText, { color: theme.text }]}>{avg.toFixed(1)}</Text>
              <Text style={{ color: theme.secondaryText, fontSize: 12 }}>· {reviews.length}</Text>
            </View>
          ) : null}
        </View>
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
        <View style={[styles.emptyCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={28} color={theme.primary} />
          <Text style={[styles.empty, { color: theme.secondaryText, marginVertical: 0 }]}>
            {i18n.t('tour.noReviews')}
          </Text>
        </View>
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
            showTourMeta={false}
            style={styles.reviewItem}
          />
        ))
      )}

      <TouchableOpacity
        style={[
          styles.addBtn,
          shadows.button,
          { backgroundColor: theme.primary, minHeight: isNarrow ? 46 : 50 },
        ]}
        onPress={handleAddReview}
        activeOpacity={0.85}
      >
        <Ionicons name="create-outline" size={18} color={theme.surface} />
        <Text style={[styles.addBtnText, { color: theme.surface }]}>{i18n.t('tour.addReview')}</Text>
      </TouchableOpacity>

      <AuthRequiredCard
        visible={showAuthCard}
        title={i18n.t('ux.authRequiredTitle')}
        message={i18n.t('reviews.authRequiredBody')}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 0 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: 8,
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  title: { ...typography.h3 },
  avgChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  avgText: { fontSize: 12, fontWeight: '800' },
  link: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 14, marginVertical: spacing.sm, textAlign: 'center' },
  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    borderStyle: 'dashed',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
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
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  addBtnText: { fontSize: 15, fontWeight: '700' },
});
