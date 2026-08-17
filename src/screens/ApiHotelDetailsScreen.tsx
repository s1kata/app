/**
 * Детали отеля (next-patch).
 */
import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { tourvisorApi } from '../services/TourvisorApiService';
import { hotelCacheService } from '../services/HotelCacheService';
import { Hotel, HotelCompact, TourSearchParams } from '../types/tourvisor';
import { useAppContext } from '../contexts/AppContext';
import AppLoader from '../components/AppLoader';
import CachedImage from '../components/ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { getHotelImageUrls, normalizeHotelImages } from '../utils/hotelImages';
import { logger } from '../utils/logger';
import { fetchHotelDetailsViaBackend } from '../services/sync/NextPatchBackendClient';
import { buildTourSearchParamsForHotel } from '../utils/hotelTourSearch';
import { i18n } from '../config/i18n';
import HotelToursSection from '../components/HotelToursSection';
import ScreenHeader from '../components/ui/ScreenHeader';
import PrimaryButton from '../components/ui/PrimaryButton';
import StickyTourBar from '../components/ui/StickyTourBar';
import TourPriceLabel from '../components/ui/TourPriceLabel';
import { radius, shadows, spacing } from '../config/designSystem';
import { FavoritesService } from '../services/FavoritesService';
import AuthRequiredCard from '../components/ux/AuthRequiredCard';
import { navigateRoot } from '../utils/navHelpers';
import type { Hotel as AppHotel } from '../types';

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
  const { theme, isDark, user } = useAppContext();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { hotelId, hotelPreview, tourContext, focusTours } = route.params || {};
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

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
  const [isFavorite, setIsFavorite] = useState(false);
  const [showAuthCard, setShowAuthCard] = useState(false);

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

  useEffect(() => {
    if (!hotelId || !user || isGuest) {
      setIsFavorite(false);
      return;
    }
    void FavoritesService.getInstance()
      .isHotelFavorite(hotelId)
      .then(setIsFavorite)
      .catch(() => setIsFavorite(false));
  }, [hotelId, user, isGuest]);

  const handleFavoritePress = async () => {
    if (!hotel) return;
    if (!user || isGuest) {
      setShowAuthCard(true);
      return;
    }
    try {
      const appHotel: AppHotel = {
        id: String(hotel.id),
        name: String(hotel.name || ''),
        description: '',
        location: hotel.region?.name || '',
        country: hotel.country?.name || '',
        category: String(hotel.category || ''),
        rating: Number(hotel.rating) || 0,
        reviews: 0,
        price: Number((hotel as { price?: number }).price || (hotel as { minPrice?: number }).minPrice) || 0,
        currency: 'RUB',
        image: (hotel as { picturelink?: string }).picturelink || '',
        gallery: (hotel as { picturelink?: string }).picturelink
          ? [(hotel as { picturelink?: string }).picturelink as string]
          : [],
        amenities: [],
        stars: Number(hotel.category) || 0,
        mealTypes: [],
        available: true,
      };
      const result = await FavoritesService.getInstance().toggleHotelFavorite(appHotel);
      if (result.success) {
        setIsFavorite(result.isFavorite);
      } else if (result.error) {
        Alert.alert(i18n.t('common.error'), result.error);
      }
    } catch (e) {
      logger.error('[ApiHotelDetails] favorite:', e);
      Alert.alert(i18n.t('common.error'), i18n.t('favorites.updateFailed'));
    }
  };

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
      let hotelData: Hotel | null = null;
      const remote = await fetchHotelDetailsViaBackend(Number(hotelId));
      if (remote.success && remote.data) {
        hotelData = remote.data;
      } else {
        hotelData = await tourvisorApi.getHotelDetails(hotelId);
      }
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
      <Ionicons key={i} name="star" size={16} color={theme.accent || theme.primary} />
    ));
  };

  const getHotelPrice = (h: DisplayHotel): number =>
    (h as { price?: number; priceFrom?: number }).price ??
    (h as { price?: number; priceFrom?: number }).priceFrom ??
    0;

  const openToursForHotel = async () => {
    if (!hotel) return;
    try {
      const ctx = (tourContext || {}) as Partial<TourSearchParams>;
      const params = await buildTourSearchParamsForHotel(hotel, ctx);
      if (!params) {
        Alert.alert(i18n.t('common.error'), 'Не удалось открыть туры для этого отеля.');
        return;
      }
      navigation.navigate('ApiTourResults', {
        searchParams: params,
        useCache: false,
        runSearch: true,
      });
    } catch (e) {
      logger.debug('[ApiHotelDetails] open tours:', (e as Error)?.message);
      Alert.alert(i18n.t('common.error'), (e as Error)?.message || 'Ошибка поиска туров');
    }
  };

  const handleBooking = () => {
    void openToursForHotel();
  };

  const galleryUrls = (() => {
    if (!hotel) return [] as string[];
    const urls = getHotelImageUrls(hotel as never);
    const limited = urls.length > 0 ? urls.slice(0, 5) : [DEFAULT_HOTEL_IMAGE];
    return limited;
  })();

  const heroHeight = Math.max(220, Math.min(300, Math.round(screenWidth * 0.62)));

  const renderImageCarousel = () => {
    if (galleryUrls.length === 0) {
      return (
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.secondaryBackground, height: heroHeight }]}>
          <Ionicons name="image-outline" size={48} color={theme.secondaryText} />
          <Text style={[styles.placeholderText, { color: theme.secondaryText }]}>
            Фото недоступны
          </Text>
        </View>
      );
    }

    // Концепт 14: крупное фото слева + сетка справа
    if (galleryUrls.length >= 3) {
      const side = galleryUrls.slice(1, 5);
      return (
        <View style={[styles.mosaic, { height: heroHeight }]}>
          <CachedImage
            source={galleryUrls[0]}
            style={styles.mosaicMain}
            recyclingKey={`hotel-detail-${hotelId}-0`}
          />
          <View style={styles.mosaicSide}>
            {side.map((url, i) => (
              <CachedImage
                key={`${url}-${i}`}
                source={url}
                style={styles.mosaicTile}
                recyclingKey={`hotel-detail-${hotelId}-${i + 1}`}
              />
            ))}
          </View>
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
              style={[styles.hotelImage, { width: screenWidth, height: heroHeight }]}
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
        <Text style={[styles.hotelName, { color: theme.deep || theme.text }]}>
          {hotel.name}
        </Text>

        <View style={styles.hotelMeta}>
          <View style={styles.metaItem}>
            <View style={{ flexDirection: 'row' }}>
              {renderStars(hotel.category)}
            </View>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="location" size={16} color={theme.secondaryText} />
            <Text style={[styles.metaText, { color: theme.secondaryText }]}>
              {hotel.region.name}
              {hotel.country?.name ? `, ${hotel.country.name}` : ''}
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

        <View style={[styles.priceRow, { backgroundColor: theme.secondaryBackground }]}>
          <View style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
            <Text style={[styles.priceLabel, { color: theme.secondaryText }]}>Цены на туры</Text>
            {getHotelPrice(hotel) > 0 ? (
              <TourPriceLabel amount={getHotelPrice(hotel)} caption="цена за тур" large />
            ) : (
              <Text style={[styles.priceHint, { color: theme.deep || theme.text }]}>
                Актуальные цены — в блоке туров ниже
              </Text>
            )}
          </View>
          <PrimaryButton
            title="Смотреть туры"
            onPress={() => void openToursForHotel()}
            variant="cta"
            small
            style={{ minWidth: 132 }}
          />
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
              <View key={index} style={[styles.tagContainer, { backgroundColor: theme.secondaryBackground }]}>
                <Text style={[styles.tagText, { color: theme.primary }]}>{tag.name}</Text>
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

  const stickyPrice = hotel ? getHotelPrice(hotel) : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      <ScreenHeader
        title={hotel.name}
        subtitle={hotel.region?.name}
        onBack={() => navigation.goBack()}
        noSafeTop
        right={
          <TouchableOpacity
            onPress={() => void handleFavoritePress()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorite ? '#FF6B6B' : theme.deep || theme.text}
            />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {renderImageCarousel()}
        {renderHotelInfo()}
        {focusTours ? (
          <HotelToursSection
            hotel={hotel}
            tourContext={tourContext}
            theme={theme}
            navigation={navigation}
            enabled={!!hotel?.id}
            hotelImage={galleryUrls[0]}
          />
        ) : null}
        {renderLocationInfo()}
        {renderServices()}
        {renderInfrastructure()}

        {!focusTours ? (
          <HotelToursSection
            hotel={hotel}
            tourContext={tourContext}
            theme={theme}
            navigation={navigation}
            enabled={!!hotel?.id}
            hotelImage={galleryUrls[0]}
          />
        ) : null}

        <View style={[styles.bookingSection, shadows.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.bookingSectionText, { color: theme.secondaryText }]}>
            Нужны другие даты или вылет — откройте полный поиск по этому отелю.
          </Text>
          <PrimaryButton
            title="Изменить даты поиска"
            onPress={handleBooking}
            variant="primary"
            iconLeft={<Ionicons name="options-outline" size={18} color="#fff" />}
          />
        </View>
      </ScrollView>

      <StickyTourBar
        price={stickyPrice}
        priceCaption="цена за тур"
        buttonTitle="Смотреть туры"
        onPress={() => void openToursForHotel()}
      />
      <AuthRequiredCard
        visible={showAuthCard}
        title={i18n.t('favorites.authRequired')}
        message={i18n.t('auth.favoritesRequired')}
        onLater={() => setShowAuthCard(false)}
        onLogin={() => {
          setShowAuthCard(false);
          navigateRoot(navigation, 'Login');
        }}
        onRegister={() => {
          setShowAuthCard(false);
          navigateRoot(navigation, 'Register');
        }}
      />
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
    borderRadius: radius.lg,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  mosaic: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#E8EEF5',
  },
  mosaicMain: {
    flex: 1.45,
    height: '100%',
  },
  mosaicSide: {
    flex: 1,
    gap: 4,
  },
  mosaicTile: {
    flex: 1,
    width: '100%',
  },
  imageContainer: {
    position: 'relative',
  },
  hotelImage: {
    height: 280,
  },
  imagePlaceholder: {
    width: '100%',
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
    margin: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
    ...shadows.card,
  },
  hotelName: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: -0.3,
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
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginHorizontal: -4,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  priceHint: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
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
    fontWeight: '600',
  },
  bookingSection: {
    margin: spacing.md,
    marginBottom: 24,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  bookingSectionText: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
});