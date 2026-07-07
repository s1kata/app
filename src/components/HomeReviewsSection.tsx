import React from 'react';
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
import { shadows, spacing } from '../config/designSystem';

interface HomeReviewsSectionProps {
  navigation: { navigate: (screen: string, params?: object) => void };
}

export default function HomeReviewsSection({ navigation }: HomeReviewsSectionProps) {
  const { theme, user, isAuthenticated, authReady } = useAppContext();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 64;
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  const { reviews, loading, error, reload } = useReviews({
    scope: 'all',
    withAuth: isAuthenticated && !isGuest,
    authReady: isGuest ? true : authReady,
    limit: 5,
  });

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Ionicons name="chatbubbles" size={24} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>
              {i18n.t('home.customerReviews')}
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            {i18n.t('home.whatClientsSay')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Reviews')}>
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
        contentContainerStyle={styles.scrollContent}
      >
        {loading && reviews.length === 0 ? (
          <ActivityIndicator
            color={theme.primary}
            style={styles.loader}
          />
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
        ) : reviews.length === 0 ? (
          <View style={[styles.emptyWrap, { width: cardWidth, borderColor: theme.border }]}>
            <Ionicons name="chatbubbles-outline" size={32} color={theme.secondaryText} />
            <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
              {i18n.t('home.noReviewsYet')}
            </Text>
          </View>
        ) : (
          reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              compact
              showTourMeta
              style={{
                width: cardWidth,
                marginRight: spacing.md,
                ...shadows.card,
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
    paddingHorizontal: spacing.lg,
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
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
  },
  seeAllWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAll: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 4,
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
    borderRadius: 16,
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

