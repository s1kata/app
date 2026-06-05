/**
 * Экран отелей: не в AppNavigator в текущем релизе (см. releaseUiFlags).
 */
import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { tourvisorApi } from '../services/TourvisorApiService';
import { hotelCacheService } from '../services/HotelCacheService';
import { Hotel, HotelCompact } from '../types/tourvisor';
import { platform } from '../utils/platform';
import { useAppContext } from '../contexts/AppContext';
import AppLoader from '../components/AppLoader';
import CachedImage from '../components/ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { getHotelImageUrl, getHotelImageUrls, normalizeHotelImages } from '../utils/hotelImages';
import { logger } from '../utils/logger';

interface ApiHotelDetailsScreenProps {
  navigation: any;
  route: any;
}

type DisplayHotel = Hotel | HotelCompact;

function normalizeHtmlText(raw: string | undefined | null): string {
  if (!raw) return '';
  let text = raw;
  // Простейшая нормализация HTML из Tourvisor: заменяем списки и переносы строк.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/?ul[^>]*>/gi, '\n');
  text = text.replace(/<\/?p[^>]*>/gi, '');
  // Удаляем все остальные теги.
  text = text.replace(/<[^>]+>/g, '');
  // Нормализуем переносы строк и пробелы.
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export default function ApiHotelDetailsScreen({ navigation, route }: ApiHotelDetailsScreenProps) {
  const { theme, isDark } = useAppContext();
  const { hotelId, hotelPreview } = route.params || {};

  const initialHotel = useMemo((): DisplayHotel | null => {
    if (hotelPreview && hotelId != null && hotelPreview.id === hotelId) {
      return normalizeHotelImages({ ...(hotelPreview as object) }) as DisplayHotel;
    }
    if (hotelId != null) {
      const cached = hotelCacheService.get(hotelId);
      if (cached) return normalizeHotelImages({ ...(cached as object) }) as DisplayHotel;
    }
    return null;
  }, [hotelId, hotelPreview]);

  const [hotel, setHotel] = useState<DisplayHotel | null>(initialHotel);
  const [isLoading, setIsLoading] = useState(!initialHotel);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Скрываем нижнюю навигацию на экране просмотра деталей отеля
  useLayoutEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.setOptions({
        tabBarStyle: { 
          display: 'none',
          height: 0,
        },
        tabBarVisible: false,
      });
    }
    
    return () => {
      // Восстанавливаем таб при уходе с экрана
      if (parent) {
        parent.setOptions({
          tabBarStyle: undefined,
          tabBarVisible: undefined,
        });
      }
    };
  }, [navigation]);

  useEffect(() => {
    loadHotelDetails();
  }, [hotelId]);

  const loadHotelDetails = async () => {
    const preview = hotelPreview?.id === hotelId ? hotelPreview : null;
    const cached = hotelCacheService.get(hotelId);

    if (preview) {
      const normalized = normalizeHotelImages(preview as any) as DisplayHotel;
      setHotel(normalized);
      hotelCacheService.set(hotelId, preview);
      setIsLoading(false);
    } else if (cached) {
      const normalized = normalizeHotelImages(cached as any) as DisplayHotel;
      setHotel(normalized);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    try {
      const hotelData = await tourvisorApi.getHotelDetails(hotelId);
      const withImages = normalizeHotelImages(hotelData as any) as typeof hotelData;
      const merged = { ...hotelData, ...withImages };
      setHotel(merged);
      hotelCacheService.set(hotelId, merged);

      const urls = getHotelImageUrls(merged as never);
      if (urls.length > 0) {
        ExpoImage.prefetch(urls.slice(0, 12));
      }
    } catch (error: any) {
      if (error?.status === 403 || error?.message?.includes('403')) {
        if (!preview && !cached) navigation.goBack();
      } else {
        if (!preview && !cached) {
          logger.error('[ApiHotelDetailsScreen] Failed to load hotel details:', error);
          navigation.goBack();
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderStars = (category: number) => {
    return Array.from({ length: Math.min(5, category) }, (_, i) => (
      <Ionicons key={i} name="star" size={16} color="#FFD700" />
    ));
  };

  const getHotelPrice = (h: DisplayHotel): number =>
    (h as { price?: number; priceFrom?: number }).price ??
    (h as { price?: number; priceFrom?: number }).priceFrom ??
    0;

  const getHotelCurrency = (h: DisplayHotel): string =>
    (h as { currency?: string }).currency ?? 'RUB';

  const handleBooking = () => {
    if (!hotel) return;
    const h = hotel as { common?: { description?: string } };
    const price = getHotelPrice(hotel);
    const currency = getHotelCurrency(hotel);
    const galleryUrls = getHotelImageUrls(hotel as never);
    const mainImage = getHotelImageUrl(hotel as never) || DEFAULT_HOTEL_IMAGE;
    const mappedHotel = {
      id: String(hotel.id),
      name: hotel.name,
      description: h.common?.description || '',
      location: hotel.region?.name || '',
      country: hotel.country?.name || '',
      category: String(hotel.category),
      rating: hotel.rating,
      reviews: 0,
      price,
      currency,
      image: mainImage,
      gallery: galleryUrls.length > 0 ? galleryUrls : [DEFAULT_HOTEL_IMAGE],
      amenities: [],
      stars: hotel.category,
      mealTypes: [],
      available: true,
    };
    navigation.navigate('HotelBooking', { hotel: mappedHotel });
  };

  const galleryUrls = (() => {
    if (!hotel) return [] as string[];
    const urls = getHotelImageUrls(hotel as never);
    const limited = urls.length > 0 ? urls.slice(0, 5) : [DEFAULT_HOTEL_IMAGE];
    return limited;
  })();

  const renderImageCarousel = () => {
    if (galleryUrls.length === 0) {
      return (
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.secondaryBackground }]}>
          <Ionicons name="image-outline" size={48} color={theme.secondaryText} />
          <Text style={[styles.placeholderText, { color: theme.secondaryText }]}>
            Фото недоступны
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.imageContainer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(event) => {
            const slideSize = event.nativeEvent.layoutMeasurement.width;
            const index = event.nativeEvent.contentOffset.x / slideSize;
            setActiveImageIndex(Math.round(index));
          }}
          scrollEventThrottle={16}
        >
          {galleryUrls.map((imageUrl, index) => (
            <CachedImage
              key={`${imageUrl}-${index}`}
              source={imageUrl}
              style={styles.hotelImage}
              recyclingKey={`hotel-detail-${hotelId}-${index}`}
            />
          ))}
        </ScrollView>
        <View style={styles.imageIndicators}>
          {galleryUrls.map((_, index) => (
            <View
              key={index}
              style={[
                styles.indicator,
                { backgroundColor: index === activeImageIndex ? theme.primary : theme.secondaryText }
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderHotelInfo = () => {
    if (!hotel) return null;

    return (
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.hotelName, { color: theme.text }]}>
          {hotel.name}
        </Text>

        <View style={styles.hotelMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="location" size={16} color={theme.secondaryText} />
            <Text style={[styles.metaText, { color: theme.secondaryText }]}>
              {hotel.region.name}
              {hotel.subRegion && `, ${hotel.subRegion.name}`}
            </Text>
          </View>

          <View style={styles.metaItem}>
            <View style={{ flexDirection: 'row' }}>
              {renderStars(hotel.category)}
            </View>
            <Text style={[styles.categoryText, { color: theme.secondaryText }]}>
              {hotel.category}*
            </Text>
          </View>

          {hotel.rating > 0 && (
            <View style={[styles.ratingBadge, { backgroundColor: theme.primary }]}>
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={styles.ratingText}>{hotel.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>

        {(hotel as Hotel).common?.description
          ? (
            <Text style={[styles.description, { color: theme.text }]}>
              {normalizeHtmlText((hotel as Hotel).common!.description)}
            </Text>
          )
          : (
            <Text style={[styles.description, { color: theme.secondaryText }]}>
              Отель в {hotel.region.name}
              {hotel.country?.name ? `, ${hotel.country.name}` : ''}. Категория {hotel.category}★
              {hotel.rating > 0 ? `. Рейтинг ${hotel.rating.toFixed(1)}.` : '.'}
            </Text>
          )}

        <View style={[styles.priceRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.priceLabel, { color: theme.secondaryText }]}>
            {getHotelPrice(hotel) > 0 ? 'Цена от' : 'Цена'}
          </Text>
          <Text style={[styles.priceValue, { color: getHotelPrice(hotel) > 0 ? theme.primary : theme.secondaryText }]}>
            {getHotelPrice(hotel) > 0
              ? `${getHotelPrice(hotel).toLocaleString('ru-RU')} ${getHotelCurrency(hotel)} за ночь`
              : 'Договорная'}
          </Text>
        </View>
      </View>
    );
  };

  const renderLocationInfo = () => {
    const common = (hotel as Hotel).common;
    if (!common) return null;

    return (
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Расположение</Text>

        {common.address && (
          <View style={styles.infoRow}>
            <Ionicons name="location" size={20} color={theme.secondaryText} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              {normalizeHtmlText(common.address)}
            </Text>
          </View>
        )}

        {common.place && (
          <View style={styles.infoRow}>
            <Ionicons name="map" size={20} color={theme.secondaryText} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              {normalizeHtmlText(common.place)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderServices = () => {
    const svc = (hotel as Hotel).services;
    if (!svc) return null;

    const services = [];

    if (svc.free) {
      services.push({ title: 'Бесплатные услуги', content: svc.free });
    }
    if (svc.available) {
      services.push({ title: 'Доступные услуги', content: svc.available });
    }
    if (svc.child) {
      services.push({ title: 'Для детей', content: svc.child });
    }
    if (svc.servicesPay) {
      services.push({ title: 'Платные услуги', content: svc.servicesPay });
    }

    if (services.length === 0) return null;

    return (
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Услуги</Text>

        {services.map((service, index) => (
          <View key={index} style={styles.serviceItem}>
            <Text style={[styles.serviceTitle, { color: theme.primary }]}>
              {service.title}
            </Text>
            <Text style={[styles.serviceContent, { color: theme.text }]}>
              {normalizeHtmlText(service.content)}
            </Text>
          </View>
        ))}

        {svc.tags && svc.tags.length > 0 && (
          <View style={styles.serviceTags}>
            {svc.tags.map((tag, index) => (
              <View key={index} style={[styles.tagContainer, { backgroundColor: theme.primary }]}>
                <Text style={[styles.tagText, { color: theme.text }]}>{tag.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderInfrastructure = () => {
    const infra = (hotel as Hotel).infrastructure;
    if (!infra) return null;

    return (
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Инфраструктура</Text>

        {infra.beach && (
          <View style={styles.infoRow}>
            <Ionicons name="water" size={20} color={theme.secondaryText} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              {normalizeHtmlText(infra.beach)}
            </Text>
          </View>
        )}

        {infra.territory && (
          <View style={styles.infoRow}>
            <Ionicons name="business" size={20} color={theme.secondaryText} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              {normalizeHtmlText(infra.territory)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderContactInfo = () => {
    const common = (hotel as Hotel).common;
    if (!common) return null;

    return (
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Контакты</Text>

        {common.phone && (
          <View style={styles.infoRow}>
            <Ionicons name="call" size={20} color={theme.secondaryText} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              {normalizeHtmlText(common.phone)}
            </Text>
          </View>
        )}

        {common.site && (
          <View style={styles.infoRow}>
            <Ionicons name="globe" size={20} color={theme.secondaryText} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              {normalizeHtmlText(common.site)}
            </Text>
          </View>
        )}

        {common.build && (
          <View style={styles.infoRow}>
            <Ionicons name="construct" size={20} color={theme.secondaryText} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              {`Построен: ${normalizeHtmlText(common.build)}`}
            </Text>
          </View>
        )}

        {common.repair && (
          <View style={styles.infoRow}>
            <Ionicons name="hammer" size={20} color={theme.secondaryText} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              {`Последний ремонт: ${normalizeHtmlText(common.repair)}`}
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (!hotel && isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <AppLoader message="Загрузка отеля..." />
      </SafeAreaView>
    );
  }

  if (!hotel) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.error} />
          <Text style={[styles.errorText, { color: theme.text }]}>
            Отель не найден
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={styles.backButtonText}>Вернуться</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />

      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {hotel.name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderImageCarousel()}
        {renderHotelInfo()}
        {renderLocationInfo()}
        {renderServices()}
        {renderInfrastructure()}

        <View style={[styles.bookingSection, { backgroundColor: theme.card }]}>
          <Text style={[styles.bookingSectionTitle, { color: theme.text }]}>Бронирование и оплата</Text>
          <Text style={[styles.bookingSectionText, { color: theme.secondaryText }]}>
            Перейдите к бронированию для выбора дат и оплаты
          </Text>
          <TouchableOpacity
            style={[styles.bookingButton, { backgroundColor: theme.primary }]}
            onPress={handleBooking}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar" size={20} color="#fff" />
            <Text style={styles.bookingButtonText}>Забронировать</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  imageContainer: {
    position: 'relative',
  },
  hotelImage: {
    width: '100%',
    height: 250,
  },
  imagePlaceholder: {
    width: '100%',
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 16,
    marginTop: 8,
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  section: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  hotelName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  hotelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
  },
  categoryText: {
    fontSize: 14,
    marginLeft: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  ratingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  priceRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  priceLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 16,
    flex: 1,
    lineHeight: 24,
  },
  coordinates: {
    marginTop: 8,
  },
  coordinatesText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  serviceItem: {
    marginBottom: 16,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  serviceContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  serviceTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tagContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  bookingSection: {
    margin: 16,
    marginBottom: 32,
    padding: 20,
    borderRadius: 12,
    ...platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  bookingSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  bookingSectionText: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  bookingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  bookingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});