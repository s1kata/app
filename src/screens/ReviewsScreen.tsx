import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import {
  listReviews,
  createReview,
  updateReview,
  deleteReview,
  toggleReviewHelpful,
  type ReviewDto,
} from '../services/ReviewsApiClient';
import { sanitizeString, MAX_LENGTHS } from '../utils/validation';
import { validateReviewText } from '../utils/reviewProfanity';
import { mapReviewDto, type ReviewListItem } from '../utils/reviewMappers';
import { reviewsRefreshBus } from '../services/ReviewsRefreshBus';
import ReviewFormModal from '../components/ReviewFormModal';
import { logger } from '../utils/logger';

interface Review extends ReviewListItem {
  userAvatar?: string;
  photos?: string[];
}

interface ReviewsScreenProps {
  navigation: any;
  route: {
    params?: {
      tourId?: string;
      hotelId?: string;
      hotelName?: string;
      countryName?: string;
      title?: string;
      openAdd?: boolean;
    };
  };
}

export default function ReviewsScreen({ navigation, route }: ReviewsScreenProps) {
  const { theme, user, isAuthenticated, authReady } = useAppContext();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'rating' | 'helpful'>('newest');
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [showAddReviewModal, setShowAddReviewModal] = useState(false);
  const [showEditReviewModal, setShowEditReviewModal] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Форма для нового отзыва (фото не добавляем)
  const [newReview, setNewReview] = useState({
    rating: 5,
    text: '',
  });
  
  // Отслеживаем, какие отзывы пользователь отметил как полезные
  const [helpfulReviews, setHelpfulReviews] = useState<Set<string>>(new Set());

  const sortedReviews = [...reviews].sort((a, b) => {
    switch (sortBy) {
      case 'rating':
        return b.rating - a.rating;
      case 'helpful':
        return b.helpful - a.helpful;
      default:
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
  }).filter(review => filterRating === null || review.rating === filterRating);

  const reviewCount = reviews.length;
  const averageRating =
    reviewCount === 0 ? 0 : reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount;

  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => {
    const count = reviews.filter((r) => r.rating === rating).length;
    return {
      rating,
      count,
      percentage: reviewCount === 0 ? 0 : (count / reviewCount) * 100,
    };
  });

  const { tourId, hotelId, hotelName, countryName, title, openAdd } = route.params || {};
  const tourIdStr = tourId != null && tourId !== '' ? String(tourId) : undefined;
  const hotelIdStr = hotelId != null && hotelId !== '' ? String(hotelId) : undefined;
  const isTourContext = Boolean(tourIdStr);
  const screenTitle = title || (isTourContext ? 'Отзывы о туре' : 'Отзывы');

  const emitReviewsRefresh = useCallback(
    (review?: ReviewDto) => {
      reviewsRefreshBus.emit({
        tourId: isTourContext ? tourIdStr ?? null : null,
        review,
        global: true,
      });
    },
    [isTourContext, tourIdStr],
  );

  const resetReviewForm = useCallback(() => {
    setNewReview({ rating: 5, text: '' });
  }, []);

  const closeAddModal = useCallback(() => {
    setShowAddReviewModal(false);
    resetReviewForm();
  }, [resetReviewForm]);

  const closeEditModal = useCallback(() => {
    setShowEditReviewModal(false);
    setEditingReview(null);
    resetReviewForm();
  }, [resetReviewForm]);

  useEffect(() => {
    if (openAdd) setShowAddReviewModal(true);
  }, [openAdd]);

  // Скрываем навигационный таб на этом экране
  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({
        tabBarStyle: { display: 'none' },
      });
    }
    
    return () => {
      // Восстанавливаем таб при уходе с экрана
      if (parent) {
        parent.setOptions({
          tabBarStyle: undefined, // Восстанавливаем дефолтные настройки
        });
      }
    };
  }, [navigation]);

  const loadReviews = useCallback(async () => {
    if (!authReady) {
      return;
    }
    try {
      setIsLoading(true);
      setLoadError(null);
      const items = await listReviews({
        tourId: tourIdStr,
        scope: tourIdStr ? 'tour' : 'all',
        withAuth: isAuthenticated,
      });
      const loadedReviews: Review[] = items.map((r: ReviewDto) => ({
        ...mapReviewDto(r),
        photos: [],
      }));
      const helpfulSet = new Set<string>();
      items.forEach((r) => {
        if (r.userMarkedHelpful) helpfulSet.add(r.id);
      });
      setHelpfulReviews(helpfulSet);
      setReviews(loadedReviews);
    } catch (error) {
      logger.error('Error loading reviews:', error);
      setLoadError((error as Error)?.message || 'Не удалось загрузить отзывы');
    } finally {
      setIsLoading(false);
    }
  }, [tourIdStr, isAuthenticated, authReady]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  useFocusEffect(
    useCallback(() => {
      void loadReviews();
    }, [loadReviews]),
  );

  useEffect(() => {
    return reviewsRefreshBus.subscribe(() => {
      void loadReviews();
    });
  }, [loadReviews]);

  const handleSubmitReview = async () => {
    // Проверяем авторизацию с красивым уведомлением
    const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
    if (!isAuthenticated || !user || isGuest) {
      Alert.alert(
        'Требуется авторизация',
        'Для того чтобы оставить отзыв, необходимо войти в систему или зарегистрироваться.',
        [
          {
            text: 'Отмена',
            style: 'cancel',
          },
          {
            text: 'Войти',
            onPress: () => navigation.navigate('Login'),
          },
          {
            text: 'Зарегистрироваться',
            onPress: () => navigation.navigate('Login', { initialTab: 'register' }),
            style: 'default',
          },
        ],
        { cancelable: true }
      );
      setShowAddReviewModal(false);
      return;
    }

    const rawText = newReview.text.trim();
    const validationError = validateReviewText(rawText);
    if (validationError) {
      Alert.alert('Ошибка', validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      Keyboard.dismiss();

      const sanitizedText = sanitizeString(rawText, MAX_LENGTHS.text);
      const result = await createReview({
        ...(isTourContext
          ? {
              tourId: tourIdStr,
              hotelId: hotelIdStr,
              hotelName: hotelName || undefined,
              countryName: countryName || undefined,
            }
          : {}),
        rating: Math.min(5, Math.max(1, Math.round(Number(newReview.rating) || 5))),
        text: sanitizedText,
      });

      if (!result.success) {
        Alert.alert('Ошибка', result.error || 'Не удалось сохранить отзыв. Попробуйте позже.');
        return;
      }

      await loadReviews();
      emitReviewsRefresh(result.review);

      resetReviewForm();
      setShowAddReviewModal(false);
      Alert.alert('Успешно', 'Ваш отзыв добавлен!');
    } catch (error: unknown) {
      if (__DEV__) logger.error('Error submitting review:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить отзыв. Попробуйте позже.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditReview = (review: Review) => {
    if (!review.isOwn) {
      Alert.alert('Ошибка', 'Вы можете редактировать только свои отзывы');
      return;
    }
    
    setEditingReview(review);
    setNewReview({ rating: review.rating, text: review.text });
    setShowEditReviewModal(true);
  };

  const handleUpdateReview = async () => {
    if (!editingReview || !user) return;

    if (!newReview.text.trim()) {
      Alert.alert('Ошибка', 'Пожалуйста, напишите отзыв');
      return;
    }

    const validationError = validateReviewText(newReview.text.trim());
    if (validationError) {
      Alert.alert('Ошибка', validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      Keyboard.dismiss();

      const result = await updateReview(editingReview.id, {
        rating: Math.min(5, Math.max(1, Math.round(Number(newReview.rating) || 5))),
        text: sanitizeString(newReview.text.trim(), MAX_LENGTHS.text),
      });

      if (!result.success) {
        Alert.alert('Ошибка', result.error || 'Не удалось обновить отзыв.');
        return;
      }

      await loadReviews();
      emitReviewsRefresh();

      closeEditModal();
      Alert.alert('Успешно', 'Отзыв обновлен!');
    } catch (error: unknown) {
      if (__DEV__) logger.error('Error updating review:', error);
      Alert.alert('Ошибка', 'Не удалось обновить отзыв. Попробуйте позже.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    Alert.alert(
      'Удалить отзыв?',
      'Вы уверены, что хотите удалить этот отзыв? Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await deleteReview(reviewId);
              if (!result.success) {
                Alert.alert('Ошибка', result.error || 'Не удалось удалить отзыв');
                return;
              }
              await loadReviews();
              emitReviewsRefresh();
              Alert.alert('Успешно', 'Отзыв удален');
            } catch (error) {
              if (__DEV__) logger.error('Error deleting review:', error);
              Alert.alert('Ошибка', 'Не удалось удалить отзыв');
            }
          },
        },
      ]
    );
  };

  const handleToggleHelpful = async (reviewId: string) => {
    if (!isAuthenticated || !user) {
      Alert.alert('Ошибка', 'Необходимо войти в систему');
      return;
    }

    try {
      const isHelpful = helpfulReviews.has(reviewId);
      const result = await toggleReviewHelpful(reviewId, !isHelpful);
      if (!result.success) {
        Alert.alert('Ошибка', result.error || 'Не удалось обновить оценку');
        return;
      }
      setHelpfulReviews((prev) => {
        const next = new Set(prev);
        if (!isHelpful) next.add(reviewId);
        else next.delete(reviewId);
        return next;
      });
      await loadReviews();
    } catch (error) {
      logger.error('Error toggling helpful:', error);
      Alert.alert('Ошибка', 'Не удалось обновить оценку');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backIcon}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {screenTitle}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading && reviews.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.secondaryText }]}>Загрузка отзывов...</Text>
        </View>
      ) : loadError && reviews.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.secondaryText} />
          <Text style={[styles.loadingText, { color: theme.secondaryText }]}>{loadError}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={() => void loadReviews()}
          >
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Общая статистика */}
        <View style={[styles.statsCard, { backgroundColor: theme.card }]}>
          <View style={styles.ratingSummary}>
            <Text style={[styles.averageRating, { color: theme.text }]}>
              {averageRating.toFixed(1)}
            </Text>
            <View style={styles.starsContainer}>
              {Array.from({ length: 5 }, (_, i) => (
                <Ionicons
                  key={i}
                  name={i < Math.floor(averageRating) ? 'star' : 'star-outline'}
                  size={24}
                  color="#FFD700"
                />
              ))}
            </View>
            <Text style={[styles.reviewsCount, { color: theme.secondaryText }]}>
              {reviews.length} отзывов
            </Text>
          </View>

          {/* Распределение рейтингов */}
          <View style={styles.distribution}>
            {ratingDistribution.map((item) => (
              <TouchableOpacity
                key={item.rating}
                style={styles.distributionRow}
                onPress={() =>
                  setFilterRating(filterRating === item.rating ? null : item.rating)
                }
              >
                <Text style={[styles.distributionRating, { color: theme.text }]}>
                  {item.rating}
                </Text>
                <Ionicons name="star" size={14} color="#FFD700" />
                <View
                  style={[
                    styles.distributionBar,
                    {
                      backgroundColor: theme.border,
                      width: '100%',
                      marginHorizontal: 8,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.distributionFill,
                      {
                        width: `${item.percentage}%`,
                        backgroundColor: theme.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.distributionCount, { color: theme.secondaryText }]}>
                  {item.count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Фильтры и сортировка */}
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filtersRow}>
              {[
                { id: 'newest', label: 'Новые' },
                { id: 'rating', label: 'По рейтингу' },
                { id: 'helpful', label: 'Полезные' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.filterButton,
                    {
                      backgroundColor:
                        sortBy === option.id ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setSortBy(option.id as any)}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      {
                        color: sortBy === option.id ? '#FFFFFF' : theme.text,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Список отзывов */}
        {sortedReviews.map((review) => (
          <View
            key={review.id}
            style={[styles.reviewCard, { backgroundColor: theme.card }]}
          >
            <View style={styles.reviewHeader}>
              <View style={styles.userInfo}>
                <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.avatarText}>
                    {review.userName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userDetails}>
                  <View style={styles.userNameRow}>
                    <Text style={[styles.userName, { color: theme.text }]}>
                      {review.userName}
                    </Text>
                    {review.verified && (
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color={theme.primary}
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </View>
                  <Text style={[styles.reviewDate, { color: theme.secondaryText }]}>
                    {formatDate(review.date)}
                  </Text>
                </View>
              </View>
              <View style={styles.ratingContainer}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Ionicons
                    key={i}
                    name={i < review.rating ? 'star' : 'star-outline'}
                    size={16}
                    color="#FFD700"
                  />
                ))}
              </View>
            </View>

            <Text style={[styles.reviewText, { color: theme.text }]}>
              {review.text}
            </Text>

            {(review.hotelName || review.countryName) ? (
              <View style={[styles.tourMeta, { borderTopColor: theme.border }]}>
                <Ionicons name="airplane" size={14} color={theme.secondaryText} />
                <Text style={[styles.tourMetaText, { color: theme.secondaryText }]}>
                  {[review.hotelName, review.countryName].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ) : null}

            {review.photos && review.photos.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photosContainer}
              >
                {review.photos.map((photo, index) => (
                  <Image
                    key={index}
                    source={{ uri: photo }}
                    style={styles.photo}
                  />
                ))}
              </ScrollView>
            )}

            <View style={styles.reviewFooter}>
              <TouchableOpacity
                style={styles.helpfulButton}
                onPress={() => handleToggleHelpful(review.id)}
              >
                <Ionicons 
                  name={helpfulReviews.has(review.id) ? "thumbs-up" : "thumbs-up-outline"} 
                  size={16} 
                  color={helpfulReviews.has(review.id) ? theme.primary : theme.secondaryText} 
                />
                <Text style={[
                  styles.helpfulText, 
                  { color: helpfulReviews.has(review.id) ? theme.primary : theme.secondaryText }
                ]}>
                  Полезно ({review.helpful})
                </Text>
              </TouchableOpacity>
              
              {review.isOwn && (
                <View style={styles.reviewActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleEditReview(review)}
                  >
                    <Ionicons name="pencil" size={16} color={theme.secondaryText} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDeleteReview(review.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.error} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ))}

        {sortedReviews.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color={theme.secondaryText} />
            <Text style={[styles.emptyText, { color: theme.text }]}>
              Нет отзывов
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.secondaryText }]}>
              Станьте первым, кто оставит отзыв!
            </Text>
          </View>
        )}

        {/* Кнопка добавления отзыва в конце страницы */}
        <View style={[styles.addReviewSection, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={[styles.addReviewButton, { backgroundColor: theme.primary }]}
            onPress={() => {
              if (!isAuthenticated || !user) {
                Alert.alert(
                  'Требуется авторизация',
                  'Для того чтобы оставить отзыв, необходимо войти в систему или зарегистрироваться.',
                  [
                    {
                      text: 'Отмена',
                      style: 'cancel',
                    },
                    {
                      text: 'Войти',
                      onPress: () => navigation.navigate('Login'),
                    },
                    {
                      text: 'Зарегистрироваться',
                      onPress: () => navigation.navigate('Login', { initialTab: 'register' }),
                      style: 'default',
                    },
                  ],
                  { cancelable: true }
                );
                return;
              }
              setShowAddReviewModal(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle" size={22} color="#FFFFFF" />
            <Text style={styles.addReviewButtonText}>Оставить отзыв</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      )}

      <ReviewFormModal
        visible={showAddReviewModal}
        title="Оставить отзыв"
        submitLabel="Отправить"
        rating={newReview.rating}
        text={newReview.text}
        isSubmitting={isSubmitting}
        onClose={closeAddModal}
        onSubmit={handleSubmitReview}
        onRatingChange={(rating) => setNewReview((prev) => ({ ...prev, rating }))}
        onTextChange={(text) => setNewReview((prev) => ({ ...prev, text }))}
        theme={theme}
      />

      <ReviewFormModal
        visible={showEditReviewModal}
        title="Редактировать отзыв"
        submitLabel="Сохранить"
        rating={newReview.rating}
        text={newReview.text}
        isSubmitting={isSubmitting}
        onClose={closeEditModal}
        onSubmit={handleUpdateReview}
        onRatingChange={(rating) => setNewReview((prev) => ({ ...prev, rating }))}
        onTextChange={(text) => setNewReview((prev) => ({ ...prev, text }))}
        theme={theme}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  backIcon: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  scrollView: {
    flexGrow: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  statsCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  ratingSummary: {
    alignItems: 'center',
    marginBottom: 24,
  },
  averageRating: {
    fontSize: 48,
    fontWeight: '800',
    marginBottom: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  reviewsCount: {
    fontSize: 14,
  },
  distribution: {
    gap: 12,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distributionRating: {
    fontSize: 14,
    fontWeight: '600',
    width: 20,
  },
  distributionBar: {
    height: 8,
    borderRadius: 4,
    flex: 1,
  },
  distributionFill: {
    height: '100%',
    borderRadius: 4,
  },
  distributionCount: {
    fontSize: 12,
    width: 30,
    textAlign: 'right',
  },
  filtersContainer: {
    marginBottom: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  userDetails: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
  },
  reviewDate: {
    fontSize: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  tourMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    marginBottom: 12,
    borderTopWidth: 1,
  },
  tourMetaText: {
    fontSize: 12,
    flex: 1,
  },
  photosContainer: {
    marginBottom: 12,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
  },
  reviewFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  helpfulButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  helpfulText: {
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  addReviewSection: {
    marginTop: 24,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
  },
  addReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  addReviewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
});
