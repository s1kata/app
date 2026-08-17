import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '../contexts/AppContext';
import { type ReviewDto } from '../services/ReviewsApiClient';
import { i18n } from '../config/i18n';
import { radius, spacing, shadows } from '../config/designSystem';

interface ReviewCardProps {
  review: ReviewDto;
  style?: ViewStyle;
  compact?: boolean;
  showTourMeta?: boolean;
}

function formatReviewDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  try {
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return raw;
  }
}

function avatarColors(name: string): [string, string] {
  const palette: [string, string][] = [
    ['#5DA9A4', '#7BC4BF'],
    ['#FF6B6B', '#FF8A80'],
    ['#4C6EF5', '#748FFC'],
    ['#F59F00', '#FCC419'],
    ['#AE3EC9', '#CC5DE8'],
    ['#0CA678', '#38D9A9'],
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % 997;
  return palette[hash % palette.length];
}

export default function ReviewCard({
  review,
  style,
  compact = false,
  showTourMeta = true,
}: ReviewCardProps) {
  const { theme } = useAppContext();
  const { width } = useWindowDimensions();
  const isNarrow = width < 360;
  const userName = review.userName || i18n.t('reviews.anonymous');
  const hasTourMeta = showTourMeta && (review.hotelName || review.countryName);
  const dateLabel = formatReviewDate(review.date);
  const [c1, c2] = useMemo(() => avatarColors(userName), [userName]);
  const avatarSize = compact ? (isNarrow ? 36 : 40) : isNarrow ? 42 : 48;

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        shadows.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['rgba(93,169,164,0.22)', 'rgba(255,107,107,0.12)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topAccent}
      />

      <View style={styles.header}>
        <LinearGradient
          colors={[c1, c2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.avatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
            },
          ]}
        >
          <Text style={[styles.avatarText, { fontSize: compact ? 15 : 17 }]}>
            {userName.charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>

        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.userName, { color: theme.text, fontSize: isNarrow ? 14 : 15 }]}
              numberOfLines={1}
            >
              {userName}
            </Text>
            {review.verified ? (
              <View style={[styles.verifiedChip, { backgroundColor: `${theme.primary}18` }]}>
                <Ionicons name="shield-checkmark" size={11} color={theme.primary} />
                <Text style={[styles.verifiedText, { color: theme.primary }]}>
                  {i18n.t('reviews.verified')}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Ionicons
                  key={i}
                  name={i <= review.rating ? 'star' : 'star-outline'}
                  size={compact ? 12 : 14}
                  color="#F5A623"
                />
              ))}
            </View>
            {dateLabel ? (
              <Text style={[styles.date, { color: theme.tertiaryText || theme.secondaryText }]}>
                {dateLabel}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={16}
          color={theme.primary}
          style={styles.quoteIcon}
        />
        <Text
          style={[
            styles.text,
            { color: theme.text, fontSize: isNarrow ? 13 : 14, lineHeight: isNarrow ? 19 : 21 },
            compact && styles.textCompact,
          ]}
          numberOfLines={compact ? (isNarrow ? 3 : 4) : undefined}
        >
          {review.text}
        </Text>
      </View>

      {(hasTourMeta || (review.helpful ?? 0) > 0) && (
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          {hasTourMeta ? (
            <View style={styles.tourMeta}>
              <View style={[styles.tourBadge, { backgroundColor: `${theme.primary}14` }]}>
                <Ionicons name="airplane" size={12} color={theme.primary} />
              </View>
              <Text style={[styles.metaText, { color: theme.secondaryText }]} numberOfLines={1}>
                {[review.hotelName, review.countryName].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {(review.helpful ?? 0) > 0 ? (
            <View style={styles.helpful}>
              <Ionicons name="thumbs-up-outline" size={13} color={theme.secondaryText} />
              <Text style={[styles.helpfulText, { color: theme.secondaryText }]}>
                {review.helpful}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardCompact: {
    padding: spacing.md,
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: 10,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#12122E',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  userName: {
    fontWeight: '800',
    flexShrink: 1,
  },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  date: {
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  quoteIcon: {
    marginTop: 2,
  },
  text: {
    flex: 1,
    fontWeight: '500',
  },
  textCompact: {},
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  tourMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  tourBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  helpful: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  helpfulText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
