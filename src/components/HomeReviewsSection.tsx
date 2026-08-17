import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { useReviews } from '../hooks/useReviews';
import ReviewCard from './ReviewCard';
import { i18n } from '../config/i18n';
import { shadows, spacing, radius, typography } from '../config/designSystem';
import type { ReviewDto } from '../services/ReviewsApiClient';

interface HomeReviewsSectionProps {
  navigation: { navigate: (screen: string, params?: object) => void };
}

function buildShowcaseReviews(): ReviewDto[] {
  const now = Date.now();
  return [
    {
      id: 'showcase-1',
      userId: 'showcase',
      userName: i18n.t('reviews.showcaseName1'),
      rating: 5,
      text: i18n.t('reviews.review1'),
      helpful: 24,
      verified: true,
      date: new Date(now - 5 * 86400000).toISOString(),
      hotelName: i18n.t('reviews.tour1'),
      countryName: null,
    },
    {
      id: 'showcase-2',
      userId: 'showcase',
      userName: i18n.t('reviews.showcaseName2'),
      rating: 5,
      text: i18n.t('reviews.review2'),
      helpful: 18,
      verified: true,
      date: new Date(now - 12 * 86400000).toISOString(),
      hotelName: i18n.t('reviews.tour2'),
      countryName: null,
    },
    {
      id: 'showcase-3',
      userId: 'showcase',
      userName: i18n.t('reviews.showcaseName3'),
      rating: 4,
      text: i18n.t('reviews.review3'),
      helpful: 11,
      verified: true,
      date: new Date(now - 20 * 86400000).toISOString(),
      hotelName: i18n.t('reviews.tour3'),
      countryName: null,
    },
  ];
}

function isUsefulReviewText(text: string | null | undefined): boolean {
  const t = (text || '').trim();
  if (t.length < 12) return false;
  const letters = t.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  if (letters.length < 8) return false;
  const unique = new Set(letters.toLowerCase()).size;
  if (unique < 4) return false;
  if (/(.)\1{4,}/.test(t)) return false;
  return true;
}

export default function HomeReviewsSection({ navigation }: HomeReviewsSectionProps) {
  const { theme, user, isAuthenticated, authReady } = useAppContext();
  const { width: screenWidth } = useWindowDimensions();
  const pad = screenWidth < 360 ? spacing.md : spacing.lg;
  const cardWidth = Math.min(Math.max(screenWidth - pad * 2 - 28, 260), 360);
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  const { reviews, loading, error, reload } = useReviews({
    scope: 'all',
    withAuth: isAuthenticated && !isGuest,
    authReady: isGuest ? true : authReady,
    limit: 8,
  });

  const showcase = useMemo(() => buildShowcaseReviews(), []);
  const qualityReviews = useMemo(
    () => reviews.filter((r) => isUsefulReviewText(r.text)),
    [reviews],
  );
  const displayReviews =
    qualityReviews.length > 0 ? qualityReviews : !loading && !error ? showcase : [];

  return (
    <View style={[styles.section, { paddingHorizontal: pad }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <View style={[styles.iconBubble, { backgroundColor: `${theme.primary}18` }]}>
              <Ionicons name="chatbubbles" size={18} color={theme.primary} />
            </View>
            <Text style={[styles.title, { color: theme.deep || theme.text }]}>
              {i18n.t('home.customerReviews')}
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            {i18n.t('home.whatClientsSay')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Reviews')} hitSlop={10}>
          <View style={styles.seeAllWrap}>
            <Text style={[styles.seeAll, { color: theme.primary }]}>
              {i18n.t('home.seeAll')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.primary} />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + spacing.md}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
      >
        {loading && reviews.length === 0 ? (
          <ActivityIndicator color={theme.primary} style={styles.loader} />
        ) : error && reviews.length === 0 ? (
          <View style={[styles.emptyWrap, { width: cardWidth, borderColor: theme.border }]}>
            <Ionicons name="cloud-offline-outline" size={32} color={theme.secondaryText} />
            <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
              Не удалось загрузить отзывы
            </Text>
            <TouchableOpacity onPress={() => void reload()} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: theme.primary }]}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : (
          displayReviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              compact
              showTourMeta
              style={{
                width: cardWidth,
                marginRight: spacing.md,
                ...shadows.cardRaised,
              }}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.sm,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    flexShrink: 1,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    paddingLeft: 40,
  },
  seeAllWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingTop: 4,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingRight: 4,
    paddingBottom: 4,
  },
  loader: {
    marginVertical: 24,
    marginHorizontal: 16,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.xl,
    borderStyle: 'dashed',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
