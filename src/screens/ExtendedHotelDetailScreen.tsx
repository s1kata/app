/**
 * Экран отелей: не в AppNavigator в текущем релизе (см. releaseUiFlags).
 */
import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { responsive } from '../utils/responsive';
import { ExtendedHotelData, getHotelBySlug } from '../data/extendedHotels';
import { settingsService, type Currency } from '../services/SettingsService';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';

interface ExtendedHotelDetailScreenProps {
  navigation: any;
  route: any;
}

export default function ExtendedHotelDetailScreen({ navigation, route }: ExtendedHotelDetailScreenProps) {
  const { user } = useAppContext();
  const { hotelSlug } = route.params;
  const [hotel, setHotel] = useState<ExtendedHotelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Проверяем, является ли пользователь гостем
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  // Скрываем нижнюю навигацию на экране просмотра деталей отеля
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
          tabBarStyle: undefined,
        });
      }
    };
  }, [navigation]);

  useEffect(() => {
    loadHotelData();
  }, [hotelSlug]);

  const loadHotelData = async () => {
    try {
      const hotelData = getHotelBySlug(hotelSlug);
      if (hotelData) {
        setHotel(hotelData);
      } else {
        Alert.alert(i18n.t('common.error'), i18n.t('hotel.notFound'));
        navigation.goBack();
      }
    } catch (error) {
      logger.error('Error loading hotel:', error);
      Alert.alert(i18n.t('common.error'), i18n.t('hotel.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleBookNow = () => {
    if (!hotel) return;

    // Проверяем авторизацию перед бронированием
    if (isGuest || !user) {
      Alert.alert(
        i18n.t('favorites.authRequired'),
        i18n.t('booking.authRequiredDesc'),
        [
          {
            text: i18n.t('common.cancel'),
            style: 'cancel',
          },
          {
            text: i18n.t('auth.login'),
            onPress: () => navigation.navigate('Login'),
          },
          {
            text: i18n.t('auth.register'),
            onPress: () => navigation.navigate('Register'),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Бронирование отеля',
      `Вы хотите забронировать ${hotel.name}?`,
      [
        {
          text: 'Забронировать',
          onPress: () => {
            // Навигация к поиску отелей через API
            navigation.navigate('ApiHotelSearch');
          }
        },
        { text: 'Отмена', style: 'cancel' }
      ]
    );
  };

  const getCurrentPrice = () => {
    if (!hotel) return { price: 0, currency: 'USD' };
    const currentCurrency = settingsService.getSettings().currency;
    const price = hotel.priceFrom[currentCurrency];
    return { price, currency: currentCurrency };
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: '#F0F2F5' }]}>
        <View style={[styles.container, styles.centerContent]}>
          <ActivityIndicator size="large" color={'#0066CC'} />
          <Text style={[styles.loadingText, { color: '#1D1D1F' }]}>Загружаем отель...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hotel) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: '#F0F2F5' }]}>
        <View style={[styles.container, styles.centerContent]}>
          <Text style={[styles.errorText, { color: '#1D1D1F' }]}>Отель не найден</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { price, currency } = getCurrentPrice();
  const currencySymbol = settingsService.getCurrencySymbol(currency as Currency);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: '#F0F2F5' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: '#F0F2F5' }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: '#F8F9FA' }]}
        >
          <Ionicons name="arrow-back" size={24} color={'#0066CC'} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.hotelName, { color: '#1D1D1F' }]} numberOfLines={1}>
            {hotel.name}
          </Text>
          <Text style={[styles.hotelLocation, { color: '#6E6E73' }]}>
            {hotel.location}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: hotel.images[currentImageIndex] }}
            style={styles.mainImage}
            resizeMode="cover"
          />
          <View style={[styles.imageGradient, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />

          {/* Image indicators */}
          <View style={styles.imageIndicators}>
            {hotel.images.map((_, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => setCurrentImageIndex(index)}
                style={[
                  styles.indicator,
                  index === currentImageIndex && styles.activeIndicator
                ]}
              />
            ))}
          </View>

          {/* Price badge */}
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>
              от {currencySymbol}{price}
            </Text>
            <Text style={styles.pricePeriod}>за ночь</Text>
          </View>
        </View>

        {/* Rating and Reviews */}
        <View style={styles.ratingContainer}>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={20} color="#FFD700" />
            <Text style={styles.ratingText}>{hotel.rating}</Text>
            <Text style={styles.reviewsText}>({hotel.reviews} отзывов)</Text>
          </View>
          <View style={styles.starsRow}>
            {Array.from({ length: 5 }, (_, i) => (
              <Ionicons
                key={i}
                name={i < Math.floor(hotel.stars) ? "star" : "star-outline"}
                size={16}
                color="#FFD700"
              />
            ))}
          </View>
        </View>

        {/* Why Recommended */}
        {hotel.whyRecommended && hotel.whyRecommended.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
              Почему рекомендуем
            </Text>
            {hotel.whyRecommended.map((reason, index) => (
              <View key={index} style={styles.reasonItem}>
                <Ionicons name="checkmark-circle" size={20} color={'#0066CC'} />
                <Text style={[styles.reasonText, { color: '#1D1D1F' }]}>{reason}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
            Описание
          </Text>
          <Text style={[styles.descriptionText, { color: '#6E6E73' }]}>
            {hotel.description}
          </Text>
        </View>

        {/* Highlights */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
            Преимущества
          </Text>
          <View style={styles.highlightsGrid}>
            {hotel.highlights.map((highlight, index) => (
              <View key={index} style={[styles.highlightItem, { backgroundColor: '#F8F9FA' }]}>
                <Text style={[styles.highlightText, { color: '#1D1D1F' }]}>{highlight}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Amenities */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
            Удобства
          </Text>
          <View style={styles.amenitiesGrid}>
            {hotel.amenities.map((amenity, index) => (
              <View key={index} style={[styles.amenityItem, { backgroundColor: '#F8F9FA' }]}>
                <Ionicons name="checkmark" size={16} color={'#0066CC'} />
                <Text style={[styles.amenityText, { color: '#1D1D1F' }]}>{amenity}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Location Info */}
        {(hotel.distanceToBeach || hotel.distanceToAirport) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
              Расположение
            </Text>
            {hotel.distanceToBeach && (
              <View style={styles.locationItem}>
                <Ionicons name="water" size={20} color={'#0066CC'} />
                <Text style={[styles.locationText, { color: '#6E6E73' }]}>
                  Пляж: {hotel.distanceToBeach}
                </Text>
              </View>
            )}
            {hotel.distanceToAirport && (
              <View style={styles.locationItem}>
                <Ionicons name="airplane" size={20} color={'#0066CC'} />
                <Text style={[styles.locationText, { color: '#6E6E73' }]}>
                  Аэропорт: {hotel.distanceToAirport}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Romantic Features (for romantic hotels) */}
        {hotel.romanticFeatures && hotel.romanticFeatures.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
              Романтические особенности
            </Text>
            {hotel.romanticFeatures.map((feature, index) => (
              <View key={index} style={styles.romanticItem}>
                <Ionicons name="heart" size={16} color="#FF6B9D" />
                <Text style={[styles.romanticText, { color: '#6E6E73' }]}>{feature}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Family Friendly (for family hotels) */}
        {hotel.familyFriendly && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
              Подходит для семей
            </Text>
            <View style={styles.familyFeatures}>
              <View style={styles.familyItem}>
                <Ionicons name="people" size={20} color={'#0066CC'} />
                <Text style={[styles.familyText, { color: '#1D1D1F' }]}>Семейные номера</Text>
              </View>
              <View style={styles.familyItem}>
                <Ionicons name="restaurant" size={20} color={'#0066CC'} />
                <Text style={[styles.familyText, { color: '#1D1D1F' }]}>Детское меню</Text>
              </View>
              <View style={styles.familyItem}>
                <Ionicons name="game-controller" size={20} color={'#0066CC'} />
                <Text style={[styles.familyText, { color: '#1D1D1F' }]}>Детская анимация</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Book Button */}
      <View style={[styles.bottomContainer, { backgroundColor: '#F0F2F5' }]}>
        <View style={styles.priceInfo}>
          <Text style={[styles.finalPrice, { color: '#1D1D1F' }]}>
            от {currencySymbol}{price} <Text style={styles.perNight}>за ночь</Text>
          </Text>
          <Text style={[styles.includesText, { color: '#6E6E73' }]}>
            Включает завтрак
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.bookButton, { backgroundColor: '#0066CC' }]}
          onPress={handleBookNow}
          activeOpacity={0.8}
        >
          <Text style={styles.bookButtonText}>Забронировать</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50, // Account for status bar
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerTitle: {
    flex: 1,
  },
  hotelName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  hotelLocation: {
    fontSize: 14,
    marginTop: 2,
  },
  imageContainer: {
    height: 300,
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 4,
  },
  activeIndicator: {
    backgroundColor: '#fff',
  },
  priceBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  priceText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pricePeriod: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.8,
  },
  ratingContainer: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#FFD700',
  },
  reviewsText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  starsRow: {
    flexDirection: 'row',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reasonText: {
    fontSize: 16,
    lineHeight: 22,
    marginLeft: 12,
    flex: 1,
  },
  descriptionText: {
    fontSize: 16,
    lineHeight: 24,
  },
  highlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  highlightItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    margin: 4,
  },
  highlightText: {
    fontSize: 14,
    fontWeight: '500',
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    margin: 4,
  },
  amenityText: {
    fontSize: 14,
    marginLeft: 6,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 16,
    marginLeft: 12,
  },
  romanticItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  romanticText: {
    fontSize: 16,
    marginLeft: 12,
  },
  familyFeatures: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  familyItem: {
    alignItems: 'center',
    flex: 1,
  },
  familyText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  bottomContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  priceInfo: {
    flex: 1,
  },
  finalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  perNight: {
    fontSize: 16,
    fontWeight: 'normal',
  },
  includesText: {
    fontSize: 14,
    marginTop: 4,
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    marginLeft: 16,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
});
