import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { type ReviewDto } from '../services/ReviewsApiClient';
import { i18n } from '../config/i18n';
import { radius, spacing } from '../config/designSystem';

interface ReviewCardProps {
  review: ReviewDto;
  style?: ViewStyle;
  compact?: boolean;
  showTourMeta?: boolean;
}

export default function ReviewCard({
  review,
  style,
  compact = false,
  showTourMeta = true,
}: ReviewCardProps) {
  const { theme } = useAppContext();
  const userName = review.userName || i18n.t('reviews.anonymous');
  const hasTourMeta = showTourMeta && (review.hotelName || review.countryName);

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        { backgroundColor: theme.card, borderColor: theme.border },
        style,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={[styles.avatarText, { color: theme.surface }]}>
            {userName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
            {userName}
          </Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons
                key={i}
                name={i <= review.rating ? 'star' : 'star-outline'}
                size={compact ? 12 : 14}
                color="#FFB800"
              />
            ))}
          </View>
        </View>
      </View>

      <Text
        style={[styles.text, { color: theme.text }, compact && styles.textCompact]}
        numberOfLines={compact ? 4 : undefined}
      >
        {review.text}
      </Text>

      {hasTourMeta ? (
        <View style={[styles.meta, { borderTopColor: theme.border }]}>
          <Ionicons name="airplane" size={14} color={theme.secondaryText} />
          <Text style={[styles.metaText, { color: theme.secondaryText }]} numberOfLines={1}>
            {[review.hotelName, review.countryName].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
  },
  cardCompact: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  textCompact: {
    fontSize: 14,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    flex: 1,
  },
});
