import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { db } from '../config/firebase';
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp, updateDoc, deleteDoc, doc, increment } from 'firebase/firestore';
import { platform } from '../utils/platform';
import { sanitizeString, MAX_LENGTHS } from '../utils/validation';
import { logger } from '../utils/logger';
import { radius } from '../config/designSystem';

interface Review {
  id: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  date: string;
  text: string;
  photos?: string[];
  helpful: number;
  verified: boolean;
}

interface ReviewsScreenProps {
  navigation: any;
  route: {
    params?: {
      tourId?: string;
      hotelId?: string;
      title?: string;
    };
  };
}

export default function ReviewsScreen({ navigation, route }: ReviewsScreenProps) {
  const { theme, user, isAuthenticated } = useAppContext();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'rating' | 'helpful'>('newest');
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [showAddReviewModal, setShowAddReviewModal] = useState(false);
  const [showEditReviewModal, setShowEditReviewModal] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const { tourId, hotelId, title } = route.params || {};

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

  // Загрузка отзывов из Firestore
  useEffect(() => {
    loadReviews();
  }, [tourId, hotelId]);

  const loadReviews = async () => {
    try {
      setIsLoading(true);
      if (!db) {
        setReviews([]);
        setIsLoading(false);
        return;
      }

      const reviewsRef = collection(db, 'reviews');
      let q = query(reviewsRef, orderBy('createdAt', 'desc'));
      
      if (tourId) {
        q = query(reviewsRef, where('tourId', '==', tourId), orderBy('createdAt', 'desc'));
      } else if (hotelId) {
        q = query(reviewsRef, where('hotelId', '==', hotelId), orderBy('createdAt', 'desc'));
      }

      const querySnapshot = await getDocs(q);
      const loadedReviews: Review[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedReviews.push({
          id: doc.id,
          userName: data.userName || 'Пользователь',
          userAvatar: data.userAvatar,
          rating: data.rating || 5,
          date: data.createdAt?.toDate?.()?.toISOString() || data.date || new Date().toISOString(),
          text: data.text || '',
          photos: data.photos || [],
          helpful: data.helpful || 0,
          verified: data.verified || false,
        });
      });
      
      // Загружаем информацию о том, какие отзывы пользователь отметил как полезные
      if (user && db) {
        await loadHelpfulReviews();
      }

      setReviews(loadedReviews);
    } catch (error) {
      logger.error('Error loading reviews:', error);
      setReviews([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHelpfulReviews = async () => {
    try {
      if (!user || !db || !isAuthenticated) {
        setHelpfulReviews(new Set());
        return;
      }
      
      const helpfulRef = collection(db, 'reviewHelpful');
      const q = query(helpfulRef, where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      const helpfulSet = new Set<string>();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.reviewId) {
          helpfulSet.add(data.reviewId);
        }
      });
      
      setHelpfulReviews(helpfulSet);
    } catch (error) {
      logger.error('Error loading helpful reviews:', error);
      // При ошибке просто очищаем список - это не критично
      setHelpfulReviews(new Set());
    }
  };

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
    if (!rawText) {
      Alert.alert('Ошибка', 'Пожалуйста, напишите отзыв');
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (!db) {
        Alert.alert('Ошибка', 'Firebase недоступен. Отзыв не может быть сохранен.');
        return;
      }

      // Проверка: 1 отзыв на тур/отель от пользователя
      if (tourId) {
        const existingQ = query(
          collection(db, 'reviews'),
          where('userId', '==', user.uid),
          where('tourId', '==', tourId)
        );
        const existingSnap = await getDocs(existingQ);
        if (!existingSnap.empty) {
          Alert.alert('Ошибка', 'Вы уже оставили отзыв на этот тур.');
          setIsSubmitting(false);
          return;
        }
      } else if (hotelId) {
        const existingQ = query(
          collection(db, 'reviews'),
          where('userId', '==', user.uid),
          where('hotelId', '==', hotelId)
        );
        const existingSnap = await getDocs(existingQ);
        if (!existingSnap.empty) {
          Alert.alert('Ошибка', 'Вы уже оставили отзыв на этот отель.');
          setIsSubmitting(false);
          return;
        }
      }

      const reviewData = {
        tourId: tourId || null,
        hotelId: hotelId || null,
        userId: user.uid,
        userName: sanitizeString(user.displayName || user.email?.split('@')[0] || 'Пользователь', MAX_LENGTHS.name),
        userAvatar: user.photoURL || null,
        rating: Math.min(5, Math.max(1, Math.round(Number(newReview.rating) || 5))),
        text: sanitizeString(rawText, MAX_LENGTHS.text),
        photos: [] as string[],
        helpful: 0,
        verified: !user.uid.startsWith('guest_') && !user.isAnonymous,
        createdAt: Timestamp.now(),
        date: new Date().toISOString(),
        updatedAt: Timestamp.now(),
      };

      await addDoc(collection(db, 'reviews'), reviewData);
      
      await loadReviews();
      setNewReview({ rating: 5, text: '' });
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
    if (review.userName !== (user?.displayName || user?.email?.split('@')[0] || 'Пользователь')) {
      Alert.alert('Ошибка', 'Вы можете редактировать только свои отзывы');
      return;
    }
    
    setEditingReview(review);
    setNewReview({ rating: review.rating, text: review.text });
    setShowEditReviewModal(true);
  };

  const handleUpdateReview = async () => {
    if (!editingReview || !db || !user) return;

    if (!newReview.text.trim()) {
      Alert.alert('Ошибка', 'Пожалуйста, напишите отзыв');
      return;
    }

    try {
      setIsSubmitting(true);

      const reviewRef = doc(db, 'reviews', editingReview.id);
      await updateDoc(reviewRef, {
        rating: Math.min(5, Math.max(1, Math.round(Number(newReview.rating) || 5))),
        text: sanitizeString(newReview.text.trim(), MAX_LENGTHS.text),
        updatedAt: Timestamp.now(),
      });

      await loadReviews();
      setEditingReview(null);
      setNewReview({ rating: 5, text: '' });
      setShowEditReviewModal(false);
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
              if (!db) return;
              await deleteDoc(doc(db, 'reviews', reviewId));
              await loadReviews();
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
    if (!isAuthenticated || !user || !db) {
      Alert.alert('Ошибка', 'Необходимо войти в систему');
      return;
    }

    try {
      const isHelpful = helpfulReviews.has(reviewId);
      const helpfulRef = collection(db, 'reviewHelpful');
      const reviewRef = doc(db, 'reviews', reviewId);

      if (isHelpful) {
        // Убираем отметку "полезно"
        const q = query(helpfulRef, where('reviewId', '==', reviewId), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(async (doc) => {
          await deleteDoc(doc.ref);
        });
        await updateDoc(reviewRef, { helpful: increment(-1) });
        setHelpfulReviews(prev => {
          const newSet = new Set(prev);
          newSet.delete(reviewId);
          return newSet;
        });
      } else {
        // Добавляем отметку "полезно"
        await addDoc(helpfulRef, {
          reviewId,
          userId: user.uid,
          createdAt: Timestamp.now(),
        });
        await updateDoc(reviewRef, { helpful: increment(1) });
        setHelpfulReviews(prev => new Set(prev).add(reviewId));
      }

      // Обновляем список отзывов для обновления счетчика
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
          Отзывы
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.secondaryText }]}>Загрузка отзывов...</Text>
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
              
              {user && review.userName === (user.displayName || user.email?.split('@')[0] || 'Пользователь') && (
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

      {/* Модальное окно для добавления отзыва */}
      <Modal
        visible={showAddReviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddReviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Оставить отзыв</Text>
              <TouchableOpacity
                onPress={() => setShowAddReviewModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {/* Рейтинг */}
              <View style={styles.modalSection}>
                <Text style={[styles.modalLabel, { color: theme.text }]}>Оценка</Text>
                <View style={styles.ratingSelector}>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      onPress={() => setNewReview({ ...newReview, rating })}
                      style={styles.ratingStarButton}
                    >
                      <Ionicons
                        name={rating <= newReview.rating ? 'star' : 'star-outline'}
                        size={32}
                        color={rating <= newReview.rating ? '#FFD700' : '#CCCCCC'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Текст отзыва */}
              <View style={styles.modalSection}>
                <Text style={[styles.modalLabel, { color: theme.text }]}>Ваш отзыв</Text>
                <TextInput
                  style={[styles.reviewTextInput, { 
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.border,
                  }]}
                  placeholder="Расскажите о вашем опыте..."
                  placeholderTextColor={theme.secondaryText}
                  multiline
                  numberOfLines={6}
                  value={newReview.text}
                  onChangeText={(text) => setNewReview({ ...newReview, text })}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setShowAddReviewModal(false);
                  setNewReview({ rating: 5, text: '' });
                }}
              >
                <Text style={[styles.modalCancelText, { color: theme.text }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, { backgroundColor: theme.primary }]}
                onPress={showEditReviewModal ? handleUpdateReview : handleSubmitReview}
                disabled={isSubmitting || !newReview.text.trim()}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>
                    {showEditReviewModal ? 'Сохранить' : 'Отправить'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модальное окно для редактирования отзыва */}
      <Modal
        visible={showEditReviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowEditReviewModal(false);
          setEditingReview(null);
          setNewReview({ rating: 5, text: '' });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Редактировать отзыв</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowEditReviewModal(false);
                  setEditingReview(null);
                  setNewReview({ rating: 5, text: '' });
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {/* Рейтинг */}
              <View style={styles.modalSection}>
                <Text style={[styles.modalLabel, { color: theme.text }]}>Оценка</Text>
                <View style={styles.ratingSelector}>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      onPress={() => setNewReview({ ...newReview, rating })}
                      style={styles.ratingStarButton}
                    >
                      <Ionicons
                        name={rating <= newReview.rating ? 'star' : 'star-outline'}
                        size={32}
                        color={rating <= newReview.rating ? '#FFD700' : '#CCCCCC'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Текст отзыва */}
              <View style={styles.modalSection}>
                <Text style={[styles.modalLabel, { color: theme.text }]}>Ваш отзыв</Text>
                <TextInput
                  style={[styles.reviewTextInput, { 
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.border,
                  }]}
                  placeholder="Расскажите о вашем опыте..."
                  placeholderTextColor={theme.secondaryText}
                  multiline
                  numberOfLines={6}
                  value={newReview.text}
                  onChangeText={(text) => setNewReview({ ...newReview, text })}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setShowEditReviewModal(false);
                  setEditingReview(null);
                  setNewReview({ rating: 5, text: '' });
                }}
              >
                <Text style={[styles.modalCancelText, { color: theme.text }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, { backgroundColor: theme.primary }]}
                onPress={handleUpdateReview}
                disabled={isSubmitting || !newReview.text.trim()}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>Сохранить</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  ratingSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  ratingStarButton: {
    padding: 4,
  },
  reviewTextInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    maxHeight: 200,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
});
