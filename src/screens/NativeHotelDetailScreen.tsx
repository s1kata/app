/**
 * Экран отелей: не в AppNavigator в текущем релизе (см. releaseUiFlags).
 */
import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { HotelData } from '../data/hotelsData';
import { platform } from '../utils/platform';
import { useAppContext } from '../contexts/AppContext';

// Динамические размеры экрана — через useWindowDimensions в компоненте.

interface NativeHotelDetailScreenProps {
  navigation: any;
  route: any;
}

export default function NativeHotelDetailScreen({ navigation, route }: NativeHotelDetailScreenProps) {
  const { user, theme, isDark } = useAppContext();
  const { hotel }: { hotel: HotelData } = route.params;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const bottomInset = platform.isIOS
    ? windowHeight / Math.max(windowWidth, 1) > 2
      ? 34
      : 0
    : 0;
  
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
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
  
  // Проверка, является ли пользователь гостем
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  // Открыть поиск отелей через API
  const handleQuickBooking = () => {
    // Проверка на гостевой режим
    if (isGuest) {
      Alert.alert(
        'Требуется авторизация',
        'Для бронирования отелей необходимо войти в систему. Хотите войти или зарегистрироваться?',
        [
          {
            text: 'Отмена',
            style: 'cancel',
          },
          {
            text: 'Войти',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
      return;
    }
    navigation.navigate('ApiHotelSearch');
  };

  // Открыть поиск отелей через API
  const handleManualBooking = () => {
    // Проверка на гостевой режим
    if (isGuest) {
      Alert.alert(
        'Требуется авторизация',
        'Для бронирования отелей необходимо войти в систему. Хотите войти или зарегистрироваться?',
        [
          {
            text: 'Отмена',
            style: 'cancel',
          },
          {
            text: 'Войти',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
      return;
    }
    navigation.navigate('ApiHotelSearch');
  };

  // Рендер звёзд отеля
  const renderStars = () => {
    return Array.from({ length: hotel.stars }, (_, i) => (
      <Ionicons key={i} name="star" size={18} color="#FFD700" />
    ));
  };

  // Получить иконку для удобства
  const getAmenityIcon = (amenity: string): string => {
    const iconMap: { [key: string]: string } = {
      'Пляж': 'sunny',
      'СПА': 'leaf',
      'Гольф': 'golf',
      'Бассейны': 'water',
      'Бассейн': 'water',
      'Рестораны': 'restaurant',
      'Фитнес': 'fitness',
      'Аквапарк': 'water',
      'Анимация': 'musical-notes',
      'Детский клуб': 'people',
      'Теннис': 'tennisball',
      'Конный спорт': 'walk',
      'Wi-Fi': 'wifi',
      'Ночной клуб': 'moon',
    };
    return iconMap[amenity] || 'checkmark-circle';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: '#FFFFFF', borderBottomColor: 'rgba(255, 255, 255, 0.18)' }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={'#1D1D1F'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#1D1D1F' }]} numberOfLines={1}>
          {hotel.name}
        </Text>
        <TouchableOpacity style={styles.shareButton}>
          <Ionicons name="share-outline" size={24} color={'#1D1D1F'} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 + bottomInset }}
      >
        {/* Hotel Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: hotel.images[currentImageIndex] || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800' }}
            style={styles.hotelImage}
          />
          
          {/* Image Navigation */}
          {hotel.images.length > 1 && (
            <View style={styles.imageNavigation}>
              {hotel.images.map((_, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.imageDot,
                    { backgroundColor: index === currentImageIndex ? '#fff' : 'rgba(255,255,255,0.5)' }
                  ]}
                  onPress={() => setCurrentImageIndex(index)}
                />
              ))}
            </View>
          )}

          {/* Badges */}
          <View style={styles.badgesContainer}>
            <View style={styles.starsBadge}>
              {renderStars()}
            </View>
            {hotel.featured && (
              <View style={[styles.featuredBadge, { backgroundcolor: '#0066CC' }]}>
                <Ionicons name="trophy" size={14} color="#fff" />
                <Text style={styles.featuredText}>Рекомендуем</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.content}>
          {/* Hotel Name & Rating */}
          <View style={styles.titleSection}>
            <Text style={[styles.hotelName, { color: '#1D1D1F' }]}>{hotel.name}</Text>
            <View style={styles.ratingRow}>
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={18} color="#FFD700" />
                <Text style={[styles.ratingValue, { color: '#1D1D1F' }]}>{hotel.rating}</Text>
                <Text style={[styles.reviewsCount, { color: '#6E6E73' }]}>
                  ({hotel.reviews} отзывов)
                </Text>
              </View>
            </View>
          </View>

          {/* Location */}
          <View style={styles.locationSection}>
            <Ionicons name="location" size={20} color={'#0066CC'} />
            <Text style={[styles.locationText, { color: '#1D1D1F' }]}>{hotel.location}</Text>
          </View>

          {/* Distance Info */}
          <View style={styles.distanceSection}>
            {hotel.distanceToBeach && (
              <View style={[styles.distanceItem, { backgroundColor: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.18)' }]}>
                <Ionicons name="sunny" size={20} color="#FF9500" />
                <Text style={[styles.distanceText, { color: '#1D1D1F' }]}>{hotel.distanceToBeach}</Text>
              </View>
            )}
            {hotel.distanceToAirport && (
              <View style={[styles.distanceItem, { backgroundColor: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.18)' }]}>
                <Ionicons name="airplane" size={20} color={'#0066CC'} />
                <Text style={[styles.distanceText, { color: '#1D1D1F' }]}>{hotel.distanceToAirport}</Text>
              </View>
            )}
          </View>

          {/* Price Section */}
          <View style={[styles.priceSection, { backgroundcolor: '#0066CC' + '10', bordercolor: '#0066CC' + '30' }]}>
            <View style={styles.priceInfo}>
              <Text style={[styles.priceLabel, { color: '#6E6E73' }]}>Цена от</Text>
              <View style={styles.priceRow}>
                <Text style={[styles.priceValue, { color: '#0066CC' }]}>
                  ${hotel.priceFrom}
                </Text>
                <Text style={[styles.priceCurrency, { color: '#6E6E73' }]}>/ ночь</Text>
              </View>
            </View>
          </View>

          {/* Booking Buttons */}
          <View style={styles.bookingSection}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>Забронировать</Text>
            
            {/* Quick Booking with Autofill */}
            <TouchableOpacity
              style={[styles.bookingButton, styles.quickBookingButton, { backgroundcolor: '#0066CC' }]}
              onPress={handleQuickBooking}
            >
              <View style={styles.bookingButtonContent}>
                <Ionicons name="flash" size={24} color="#fff" />
                <View style={styles.bookingButtonText}>
                  <Text style={styles.bookingButtonTitle}>Быстрое бронирование</Text>
                  <Text style={styles.bookingButtonSubtitle}>Автопоиск отеля на сайте</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Manual Booking */}
            <TouchableOpacity
              style={[styles.bookingButton, styles.manualBookingButton, { backgroundColor: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.18)' }]}
              onPress={handleManualBooking}
            >
              <View style={styles.bookingButtonContent}>
                <Ionicons name="search" size={24} color={'#0066CC'} />
                <View style={styles.bookingButtonText}>
                  <Text style={[styles.bookingButtonTitle, { color: '#1D1D1F' }]}>Посмотреть на сайте</Text>
                  <Text style={[styles.bookingButtonSubtitle, { color: '#6E6E73' }]}>Открыть страницу отелей</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color={'#6E6E73'} />
            </TouchableOpacity>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>Описание</Text>
            <Text style={[styles.descriptionText, { color: '#1D1D1F' }]}>{hotel.description}</Text>
          </View>

          {/* Highlights */}
          {hotel.highlights && hotel.highlights.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>Особенности</Text>
              <View style={styles.highlightsList}>
                {hotel.highlights.map((highlight, index) => (
                  <View key={index} style={[styles.highlightItem, { backgroundColor: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.18)' }]}>
                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                    <Text style={[styles.highlightText, { color: '#1D1D1F' }]}>{highlight}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Amenities */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>Удобства</Text>
            <View style={styles.amenitiesGrid}>
              {hotel.amenities.map((amenity, index) => (
                <View key={index} style={[styles.amenityItem, { backgroundColor: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.18)' }]}>
                  <Ionicons name={getAmenityIcon(amenity) as any} size={20} color={'#0066CC'} />
                  <Text style={[styles.amenityText, { color: '#1D1D1F' }]}>{amenity}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Best For */}
          {hotel.bestFor && hotel.bestFor.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>Идеально для</Text>
              <View style={styles.bestForContainer}>
                {hotel.bestFor.map((item, index) => (
                  <View key={index} style={[styles.bestForBadge, { backgroundcolor: '#0066CC' + '15' }]}>
                    <Text style={[styles.bestForText, { color: '#0066CC' }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Booking Bar */}
      <View style={[
        styles.bottomBar, 
        { 
          backgroundColor: '#FFFFFF', 
          borderTopColor: 'rgba(255, 255, 255, 0.18)',
          paddingBottom: platform.isIOS ? bottomInset + 16 : 16,
        }
      ]}>
        <View style={styles.bottomPriceContainer}>
          <Text style={[styles.bottomPriceLabel, { color: '#6E6E73' }]}>от</Text>
          <Text style={[styles.bottomPrice, { color: '#0066CC' }]}>${hotel.priceFrom}</Text>
          <Text style={[styles.bottomPricePeriod, { color: '#6E6E73' }]}>/ ночь</Text>
        </View>
        <TouchableOpacity
          style={[styles.bottomBookButton, { backgroundcolor: '#0066CC' }]}
          onPress={handleQuickBooking}
        >
          <Ionicons name="flash" size={20} color="#fff" />
          <Text style={styles.bottomBookButtonText}>Забронировать</Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  shareButton: {
    padding: 8,
  },
  imageContainer: {
    position: 'relative',
  },
  hotelImage: {
    width: '100%',
    height: 280,
    resizeMode: 'cover',
  },
  imageNavigation: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  imageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgesContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  starsBadge: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  featuredText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  titleSection: {
    marginBottom: 16,
  },
  hotelName: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 32,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
  reviewsCount: {
    fontSize: 14,
    marginLeft: 6,
  },
  locationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationText: {
    fontSize: 16,
    marginLeft: 8,
  },
  distanceSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  distanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  distanceText: {
    fontSize: 14,
  },
  priceSection: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  priceInfo: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceValue: {
    fontSize: 36,
    fontWeight: '700',
  },
  priceCurrency: {
    fontSize: 16,
    marginLeft: 8,
  },
  bookingSection: {
    marginBottom: 24,
  },
  bookingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  quickBookingButton: {},
  manualBookingButton: {
    borderWidth: 1,
  },
  bookingButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bookingButtonText: {
    marginLeft: 16,
  },
  bookingButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  bookingButtonSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  descriptionText: {
    fontSize: 16,
    lineHeight: 24,
  },
  highlightsList: {
    gap: 10,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  highlightText: {
    fontSize: 15,
    flex: 1,
  },
  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  amenityText: {
    fontSize: 14,
  },
  bestForContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bestForBadge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bestForText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  bottomPriceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  bottomPriceLabel: {
    fontSize: 14,
    marginRight: 4,
  },
  bottomPrice: {
    fontSize: 26,
    fontWeight: '700',
  },
  bottomPricePeriod: {
    fontSize: 14,
    marginLeft: 4,
  },
  bottomBookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  bottomBookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
