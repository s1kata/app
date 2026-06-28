import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { useAppContext } from '../contexts/AppContext';
import { db } from '../config/firebase';
import { i18n } from '../config/i18n';
import { spacing, radius } from '../config/designSystem';
import { logger } from '../utils/logger';

type TourReview = {
  id: string;
  userName: string;
  rating: number;
  text: string;
  date: string;
};

interface TourReviewsSectionProps {
  tourId: string;
  hotelId?: number;
  navigation: { navigate: (screen: string, params?: object) => void };
}

export default function TourReviewsSection({ tourId, hotelId, navigation }: TourReviewsSectionProps) {
  const { theme, user, isAuthenticated } = useAppContext();
  const [reviews, setReviews] = useState<TourReview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      if (!db || !tourId) {
        setReviews([]);
        return;
      }
      const reviewsRef = collection(db, 'reviews');
      const q = query(
        reviewsRef,
        where('tourId', '==', tourId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      const list: TourReview[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          userName: data.userName || i18n.t('reviews.anonymous'),
          rating: data.rating || 5,
          text: data.text || '',
          date: data.createdAt?.toDate?.()?.toISOString() || data.date || '',
        });
      });
      setReviews(list.slice(0, 3));
    } catch (e) {
      logger.debug('[TourReviewsSection] load failed:', (e as Error)?.message || e);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const openReviews = (openAdd?: boolean) => {
    navigation.navigate('Reviews', {
      tourId,
      hotelId: hotelId ? String(hotelId) : undefined,
      title: i18n.t('tour.reviewsTitle'),
      openAdd,
    });
  };

  const handleAddReview = () => {
    const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
    if (!isAuthenticated || !user || isGuest) {
      Alert.alert(i18n.t('reviews.authRequiredTitle'), i18n.t('reviews.authRequiredBody'), [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        { text: i18n.t('auth.login'), onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }
    openReviews(true);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]}>{i18n.t('tour.reviewsTitle')}</Text>
        <TouchableOpacity onPress={() => openReviews()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.link, { color: theme.primary }]}>{i18n.t('tour.allReviews')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: spacing.md }} />
      ) : reviews.length === 0 ? (
        <Text style={[styles.empty, { color: theme.secondaryText }]}>{i18n.t('tour.noReviews')}</Text>
      ) : (
        reviews.map((r) => (
          <View key={r.id} style={[styles.reviewItem, { borderColor: theme.border }]}>
            <View style={styles.reviewTop}>
              <Text style={[styles.userName, { color: theme.text }]}>{r.userName}</Text>
              <View style={styles.stars}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Ionicons
                    key={i}
                    name={i < r.rating ? 'star' : 'star-outline'}
                    size={14}
                    color={theme.warning}
                  />
                ))}
              </View>
            </View>
            <Text style={[styles.reviewText, { color: theme.secondaryText }]} numberOfLines={3}>
              {r.text}
            </Text>
          </View>
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
  wrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700' },
  link: { fontSize: 14, fontWeight: '600' },
  empty: { fontSize: 14, marginVertical: spacing.sm },
  reviewItem: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  reviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: { fontSize: 14, fontWeight: '600' },
  stars: { flexDirection: 'row', gap: 2 },
  reviewText: { fontSize: 14, lineHeight: 20 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  addBtnText: { fontSize: 15, fontWeight: '700' },
});
