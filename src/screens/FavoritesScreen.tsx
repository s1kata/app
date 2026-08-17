import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TourOutput } from '../types/tourvisor';
import type { Hotel } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { FavoritesService, FavoriteTourAvailability } from '../services/FavoritesService';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import AuthRequiredCard from '../components/ux/AuthRequiredCard';
import { useTabBarMetrics } from '../utils/tabBarMetrics';
import { priceTrackingService } from '../services/PriceTrackingService';
import { BRAND, radius, shadows, spacing, typography } from '../config/designSystem';
import { ScreenHeader, TourPriceLabel } from '../components/ui';
import CachedImage from '../components/ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { navigateRoot, navigateTab, safeGoBack } from '../utils/navHelpers';
import { formatNightsRu } from '../utils/pluralRu';
import { parseFlexibleDateLocal } from '../utils/dateYmd';

type FavSegment = 'hotels' | 'tours';

export default function FavoritesScreen({ navigation }: any) {
  const { theme, isDark, apiReady, user, isAuthenticated, currency, fontScale, language } = useAppContext();
  const insets = useSafeAreaInsets();
  const { contentBottomPadding } = useTabBarMetrics(insets, fontScale);
  const bottomPad = contentBottomPadding({ includeFab: false });
  const [segment, setSegment] = useState<FavSegment>('hotels');
  const [favoriteTours, setFavoriteTours] = useState<TourOutput[]>([]);
  const [favoriteHotels, setFavoriteHotels] = useState<Hotel[]>([]);
  const [availability, setAvailability] = useState<Record<string, FavoriteTourAvailability>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [showAuthCard, setShowAuthCard] = useState(false);

  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  const refreshAvailability = useCallback(async (tours: TourOutput[]) => {
    if (!tours.length) {
      setAvailability({});
      return;
    }
    setCheckingAvailability(true);
    try {
      const map = await FavoritesService.getInstance().checkFavoriteToursAvailability(tours);
      setAvailability(map);
    } catch {
      // оставляем прежнюю карту — не блокируем список из‑за сетевой ошибки
    } finally {
      setCheckingAvailability(false);
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    try {
      setLoading(true);
      await priceTrackingService.initialize();
      await FavoritesService.getInstance().syncFromServer();
      const [tours, hotels] = await Promise.all([
        FavoritesService.getInstance().getFavoriteTours(),
        FavoritesService.getInstance().getFavoriteHotels(),
      ]);
      setFavoriteTours(tours || []);
      setFavoriteHotels(hotels || []);
      // Не прятать отели за «Туры»: сохраняем текущий сегмент, если в нём есть записи
      setSegment((prev) => {
        const t = tours?.length || 0;
        const h = hotels?.length || 0;
        if (prev === 'hotels' && h > 0) return 'hotels';
        if (prev === 'tours' && t > 0) return 'tours';
        if (h > 0 && t === 0) return 'hotels';
        if (t > 0 && h === 0) return 'tours';
        if (h > 0) return 'hotels';
        if (t > 0) return 'tours';
        return prev;
      });
      void refreshAvailability(tours || []);
    } catch {
      setFavoriteTours([]);
      setFavoriteHotels([]);
      setAvailability({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshAvailability]);

  useEffect(() => {
    if (!isAuthenticated || !user || isGuest) {
      setShowAuthCard(true);
      return;
    }
    setShowAuthCard(false);

    if (apiReady) {
      loadFavorites();
    }
  }, [apiReady, isAuthenticated, user, isGuest, loadFavorites]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFavorites();
  };

  const handleRemoveFavorite = async (tourId: string | number) => {
    const id = String(tourId);
    const result = await FavoritesService.getInstance().removeTourFromFavorites(id);
    if (result.success) {
      setFavoriteTours((prev) => prev.filter((t) => String(t.id) !== id));
      setAvailability((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleRemoveHotelFavorite = async (hotelId: string | number) => {
    const id = String(hotelId);
    const result = await FavoritesService.getInstance().removeHotelFromFavorites(id);
    if (result.success) {
      setFavoriteHotels((prev) => prev.filter((h) => String(h.id) !== id));
    }
  };

  const handleTourPress = (tour: TourOutput) => {
    const status = availability[String(tour.id)];
    if (status === 'unavailable') {
      Alert.alert(i18n.t('favorites.tourUnavailable'), i18n.t('favorites.tourUnavailableHint'));
      return;
    }

    navigation.navigate('ApiTourDetails', {
      tourId: tour.id,
      searchParams: {
        currency: tour.currency || 'RUB',
        adults: Math.max(1, Number(tour.adults) || 1),
        childs:
          Number(tour.childs) > 0
            ? Array.from({ length: Math.min(10, Number(tour.childs)) }, () => 0)
            : [],
        nightsFrom: tour.nights,
        nightsTo: tour.nights,
        dateFrom: tour.date,
        dateTo: tour.date,
      },
      currency: tour.currency || 'RUB',
    });
  };

  const handleHotelPress = (hotel: Hotel) => {
    navigation.navigate('ApiHotelDetails', {
      hotelId: Number(hotel.id) || hotel.id,
      hotelPreview: {
        id: Number(hotel.id) || hotel.id,
        name: hotel.name,
        picturelink: hotel.image,
        rating: hotel.rating,
        category: hotel.stars || hotel.category,
        country: hotel.country ? { name: hotel.country } : undefined,
        region: hotel.location ? { name: hotel.location } : undefined,
        minPrice: hotel.price,
        price: hotel.price,
      },
      focusTours: true,
    });
  };

  // Для зачёркнутой базовой цены — без префикса «от»
  const formatPrice = (price: number, fromCurrency: string) => {
    const converted = settingsService.convertPrice(price, fromCurrency as Currency, currency);
    const symbol = settingsService.getCurrencySymbol(currency);
    return `${converted ? converted.toLocaleString('ru-RU') : '—'} ${symbol}`;
  };

  const formatDate = (dateStr: string) => {
    const date = parseFlexibleDateLocal(dateStr) || new Date(dateStr);
    if (!Number.isFinite(date.getTime())) return dateStr || '—';
    return date.toLocaleDateString(language === 'en' ? 'en-GB' : 'ru-RU', {
      day: '2-digit',
      month: 'short',
    });
  };

  const activeCount = segment === 'tours' ? favoriteTours.length : favoriteHotels.length;
  const pluralRu = (n: number, one: string, few: string, many: string) => {
    const abs = Math.abs(n) % 100;
    const dig = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (dig === 1) return one;
    if (dig >= 2 && dig <= 4) return few;
    return many;
  };
  const pluralEn = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const subtitleParts: string[] = [];
  if (favoriteTours.length + favoriteHotels.length > 0) {
    if (segment === 'tours' && favoriteTours.length > 0) {
      const n = favoriteTours.length;
      const unit =
        language === 'en'
          ? pluralEn(n, i18n.t('favorites.tourOne'), i18n.t('favorites.tourMany'))
          : pluralRu(n, i18n.t('favorites.tourOne'), i18n.t('favorites.tourFew'), i18n.t('favorites.tourMany'));
      subtitleParts.push(`${n} ${unit}`);
      if (checkingAvailability) subtitleParts.push(i18n.t('favorites.checking'));
    } else if (segment === 'hotels' && favoriteHotels.length > 0) {
      const n = favoriteHotels.length;
      const unit =
        language === 'en'
          ? pluralEn(n, i18n.t('favorites.hotelOne'), i18n.t('favorites.hotelMany'))
          : pluralRu(n, i18n.t('favorites.hotelOne'), i18n.t('favorites.hotelFew'), i18n.t('favorites.hotelMany'));
      subtitleParts.push(`${n} ${unit}`);
    }
  }

  if (loading && favoriteTours.length === 0 && favoriteHotels.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
        <ScreenHeader
          title={i18n.t('profile.favorites')}
          onBack={navigation.canGoBack?.() ? () => safeGoBack(navigation) : undefined}
          noSafeTop
        />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const renderSegment = () => (
    <View style={[styles.segmentTrack, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}>
      {([
        { key: 'hotels' as const, label: i18n.t('favorites.hotels') },
        { key: 'tours' as const, label: i18n.t('favorites.tours') },
      ]).map((tab) => {
        const active = segment === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.segmentBtn, active && { backgroundColor: BRAND.blue }]}
            onPress={() => setSegment(tab.key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.segmentText, { color: active ? '#fff' : theme.secondaryText }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderEmpty = (kind: FavSegment) => (
    <View style={[styles.emptyContainer, { paddingBottom: bottomPad }]}>
      <View style={[styles.emptyIconContainer, { backgroundColor: theme.secondaryBackground }]}>
        <Ionicons name="heart-outline" size={64} color={theme.inactive} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {kind === 'tours' ? i18n.t('favorites.noFavorites') : i18n.t('favorites.noHotels')}
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
        {kind === 'tours' ? i18n.t('favorites.addFirst') : i18n.t('favorites.noHotelsHint')}
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => navigateTab(navigation, 'Search')}
        activeOpacity={0.8}
      >
        <View style={[styles.emptyButtonGradient, { backgroundColor: BRAND.orange }]}>
          <Text style={styles.emptyButtonText}>{i18n.t('bookings.findTours')}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <ScreenHeader
        title={i18n.t('profile.favorites')}
        subtitle={subtitleParts.length ? subtitleParts.join(' · ') : undefined}
        onBack={navigation.canGoBack?.() ? () => safeGoBack(navigation) : undefined}
        noSafeTop
      />

      {renderSegment()}

      {activeCount === 0 ? (
        renderEmpty(segment)
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />}
        >
          <View style={styles.toursContainer}>
            {segment === 'tours'
              ? favoriteTours.map((tour, index) => {
                  const imageUrl = tour.picture || (tour.hotel as { picturelink?: string }).picturelink;
                  const isUnavailable = availability[String(tour.id)] === 'unavailable';
                  const tracked = priceTrackingService.isTracked(String(tour.id))
                    ? priceTrackingService.getTrackedTours().find((t) => t.tourId === String(tour.id))
                    : undefined;
                  const baseline = tracked?.originalPrice ?? tracked?.currentPrice;
                  const dropPct =
                    baseline && tour.price > 0 && tour.price < baseline
                      ? Math.round((1 - tour.price / baseline) * 100)
                      : 0;
                  const showDrop = dropPct >= 5;
                  const displayAmount = settingsService.convertPrice(
                    tour.price,
                    (tour.currency || 'RUB') as Currency,
                    currency,
                  );
                  const currencySymbol = settingsService.getCurrencySymbol(currency);

                  return (
                    <TouchableOpacity
                      key={`${tour.id}-${index}`}
                      style={[
                        styles.tourCard,
                        { backgroundColor: theme.card, borderColor: theme.border },
                        isUnavailable && styles.tourCardUnavailable,
                      ]}
                      onPress={() => handleTourPress(tour)}
                      activeOpacity={isUnavailable ? 1 : 0.9}
                      accessibilityState={{ disabled: isUnavailable }}
                    >
                      <View style={styles.imageContainer}>
                        {imageUrl ? (
                          <CachedImage
                            source={{ uri: imageUrl }}
                            style={[styles.tourImage, isUnavailable && styles.imageDimmed]}
                            contentFit="cover"
                            fallbackUri={DEFAULT_HOTEL_IMAGE}
                          />
                        ) : (
                          <View
                            style={[
                              styles.tourImage,
                              styles.imagePlaceholder,
                              { backgroundColor: theme.secondaryBackground },
                            ]}
                          >
                            <Ionicons name="image-outline" size={32} color={theme.inactive} />
                          </View>
                        )}
                        <View style={[styles.imageGradient, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
                        {isUnavailable && (
                          <View style={styles.unavailableOverlay}>
                            <View style={[styles.unavailableBadge, { backgroundColor: theme.accent }]}>
                              <Ionicons name="close-circle" size={18} color="#fff" />
                              <Text style={styles.unavailableBadgeText}>{i18n.t('favorites.tourUnavailable')}</Text>
                            </View>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[styles.favoriteButton, { backgroundColor: 'rgba(255,255,255,0.94)' }]}
                          onPress={() => handleRemoveFavorite(tour.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="heart" size={20} color={BRAND.orange} />
                        </TouchableOpacity>
                        {showDrop && !isUnavailable ? (
                          <View style={[styles.discountBadge, { backgroundColor: theme.success }]}>
                            <Text style={styles.discountText}>−{dropPct}%</Text>
                          </View>
                        ) : tracked && !isUnavailable ? (
                          <View style={[styles.discountBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                            <Text style={styles.discountText}>{i18n.t('favorites.watching')}</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.tourInfo}>
                        <Text
                          style={[styles.hotelName, { color: isUnavailable ? theme.secondaryText : theme.text }]}
                          numberOfLines={2}
                        >
                          {tour.hotel?.name ?? tour.name}
                        </Text>
                        {isUnavailable ? (
                          <Text style={[styles.unavailableHint, { color: theme.secondaryText }]}>
                            {i18n.t('favorites.tourUnavailableHint')}
                          </Text>
                        ) : (
                          <>
                            <View style={styles.locationRow}>
                              <Ionicons name="location" size={14} color={theme.secondaryText} />
                              <Text style={[styles.locationText, { color: theme.secondaryText }]} numberOfLines={1}>
                                {tour.hotel?.region?.name ?? ''}
                                {tour.hotel?.subRegion ? `, ${tour.hotel.subRegion.name}` : ''}
                              </Text>
                            </View>
                            <View style={styles.metaRow}>
                              <View style={styles.metaItem}>
                                <Ionicons name="calendar-outline" size={14} color={theme.secondaryText} />
                                <Text style={[styles.metaText, { color: theme.secondaryText }]}>
                                  {formatDate(tour.date)} • {formatNightsRu(tour.nights)}
                                </Text>
                              </View>
                              {(tour.hotel?.rating ?? 0) > 0 && (
                                <View style={styles.rating}>
                                  <Ionicons name="star" size={14} color={BRAND.blue} />
                                  <Text style={[styles.ratingText, { color: BRAND.blue }]}>{tour.hotel?.rating}</Text>
                                </View>
                              )}
                            </View>
                            <View style={[styles.priceRow, { borderTopColor: theme.border }]}>
                              <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.sm }}>
                                {showDrop && baseline ? (
                                  <Text style={[styles.oldPrice, { color: theme.secondaryText }]}>
                                    {formatPrice(baseline, tour.currency)}
                                  </Text>
                                ) : null}
                                <TourPriceLabel
                                  amount={displayAmount}
                                  currencySymbol={currencySymbol}
                                  fromPrefix={!showDrop}
                                  caption="за тур"
                                  accent={showDrop}
                                />
                                {showDrop ? (
                                  <Text style={{ fontSize: 12, color: theme.success, fontWeight: '600', marginTop: 2 }}>
                                    {i18n.t('favorites.priceDrop')} −{dropPct}%
                                  </Text>
                                ) : null}
                              </View>
                              {tour.hotel?.country?.name ? (
                                <View style={[styles.countryBadge, { backgroundColor: BRAND.blueSubtle }]}>
                                  <Text style={[styles.countryText, { color: BRAND.blue }]}>
                                    {tour.hotel.country.name}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              : favoriteHotels.map((hotel) => {
                  const stars = Number(hotel.stars) || Math.round(Number(hotel.rating) || 0);
                  const place = [hotel.country, hotel.location].filter(Boolean).join(', ');
                  return (
                    <TouchableOpacity
                      key={String(hotel.id)}
                      style={[styles.tourCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                      onPress={() => handleHotelPress(hotel)}
                      activeOpacity={0.9}
                    >
                      <View style={styles.imageContainer}>
                        {hotel.image ? (
                          <CachedImage
                            source={{ uri: hotel.image }}
                            style={styles.tourImage}
                            contentFit="cover"
                            fallbackUri={DEFAULT_HOTEL_IMAGE}
                          />
                        ) : (
                          <View
                            style={[
                              styles.tourImage,
                              styles.imagePlaceholder,
                              { backgroundColor: theme.secondaryBackground },
                            ]}
                          >
                            <Ionicons name="image-outline" size={32} color={theme.inactive} />
                          </View>
                        )}
                        <View style={[styles.imageGradient, { backgroundColor: 'rgba(0,0,0,0.22)' }]} />
                        <TouchableOpacity
                          style={[styles.favoriteButton, { backgroundColor: 'rgba(255,255,255,0.94)' }]}
                          onPress={() => handleRemoveHotelFavorite(String(hotel.id))}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="heart" size={20} color={BRAND.orange} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.tourInfo}>
                        <Text style={[styles.hotelName, { color: theme.text }]} numberOfLines={2}>
                          {hotel.name}
                        </Text>
                        {stars > 0 ? (
                          <View style={styles.starsRow}>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Ionicons
                                key={i}
                                name="star"
                                size={12}
                                color={i < stars ? BRAND.blue : theme.border}
                              />
                            ))}
                            {hotel.rating > 0 ? (
                              <Text style={[styles.ratingText, { color: BRAND.blue, marginLeft: 6 }]}>
                                {Number(hotel.rating).toFixed(1)}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                        {place ? (
                          <Text style={[styles.locationText, { color: theme.secondaryText, marginTop: 4 }]} numberOfLines={1}>
                            {place}
                          </Text>
                        ) : null}
                        <View style={[styles.priceRow, { borderTopColor: theme.border, marginTop: spacing.sm }]}>
                          <TourPriceLabel
                            amount={settingsService.convertPrice(
                              Number(hotel.price) || 0,
                              ((hotel.currency || 'RUB') as Currency),
                              currency,
                            )}
                            currencySymbol={settingsService.getCurrencySymbol(currency)}
                            caption="за тур"
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
          </View>
        </ScrollView>
      )}
      <AuthRequiredCard
        visible={showAuthCard}
        title={i18n.t('ux.authRequiredTitle')}
        message={i18n.t('favorites.authRequiredDesc')}
        onLater={() => {
          setShowAuthCard(false);
          navigation.goBack();
        }}
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
  container: { flex: 1 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  segmentTrack: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: 4,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  segmentText: {
    ...typography.captionBold,
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxxl },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  emptyTitle: { ...typography.h2, marginBottom: spacing.xs, textAlign: 'center' },
  emptySubtitle: { ...typography.body, textAlign: 'center', marginBottom: spacing.xxl, lineHeight: 24 },
  emptyButton: { borderRadius: radius.lg, overflow: 'hidden' },
  emptyButtonGradient: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  emptyButtonText: { color: '#FFFFFF', ...typography.button },
  toursContainer: { paddingHorizontal: spacing.lg, gap: spacing.md },
  tourCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    ...shadows.cardRaised,
  },
  tourCardUnavailable: {
    opacity: 0.85,
  },
  imageContainer: { height: 188, position: 'relative' },
  tourImage: { width: '100%', height: '100%' },
  imageDimmed: { opacity: 0.55 },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  imageGradient: { ...StyleSheet.absoluteFillObject },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  unavailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  unavailableBadgeText: { color: '#FFFFFF', ...typography.captionBold },
  unavailableHint: { ...typography.caption, lineHeight: 18, marginTop: spacing.xxs },
  discountBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: BRAND.orange,
    zIndex: 2,
  },
  discountText: { color: '#FFFFFF', ...typography.captionBold },
  favoriteButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  tourInfo: { padding: spacing.md },
  hotelName: { ...typography.h3, marginBottom: spacing.xs, color: BRAND.navy },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  locationText: { ...typography.caption, marginLeft: spacing.xxs, flex: 1 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaText: { ...typography.small, marginLeft: spacing.xxs },
  rating: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { ...typography.smallBold, marginLeft: spacing.xxs, color: BRAND.blue },
  starsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  oldPrice: { ...typography.small, marginBottom: 2, textDecorationLine: 'line-through' },
  countryBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.full },
  countryText: { ...typography.smallBold },
});
