import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TourOutput } from '../types/tourvisor';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import ProfileIcon from '../components/ProfileIcon';
import { FavoritesService, FavoriteTourAvailability } from '../services/FavoritesService';
import { settingsService } from '../services/SettingsService';
import type { Currency } from '../services/SettingsService';
import AuthRequiredCard from '../components/ux/AuthRequiredCard';
import { useTabBarMetrics } from '../utils/tabBarMetrics';
import { priceTrackingService } from '../services/PriceTrackingService';

export default function FavoritesScreen({ navigation }: any) {
  const { theme, isDark, apiReady, user, isAuthenticated, currency, fontScale } = useAppContext();
  const insets = useSafeAreaInsets();
  // FAB скрыт на этом экране — клиренс только под таб-бар
  const { contentBottomPadding } = useTabBarMetrics(insets, fontScale);
  const bottomPad = contentBottomPadding({ includeFab: false });
  const [favoriteTours, setFavoriteTours] = useState<TourOutput[]>([]);
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
      const tours = await FavoritesService.getInstance().getFavoriteTours();
      setFavoriteTours(tours || []);
      void refreshAvailability(tours || []);
    } catch (error: any) {
      setFavoriteTours([]);
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

  const handleRemoveFavorite = async (tourId: string) => {
    const result = await FavoritesService.getInstance().removeTourFromFavorites(tourId);
    if (result.success) {
      setFavoriteTours((prev) => prev.filter((t) => t.id !== tourId));
      setAvailability((prev) => {
        const next = { ...prev };
        delete next[String(tourId)];
        return next;
      });
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
      searchParams: { currency: tour.currency || 'RUB' },
      currency: tour.currency || 'RUB',
    });
  };

  const formatPrice = (price: number, fromCurrency: string) =>
    settingsService.formatTourPrice(price, fromCurrency as Currency, currency);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
    });
  };

  if (loading && favoriteTours.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
        <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Избранное</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.card} />
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Избранное</Text>
          {favoriteTours.length > 0 && (
            <Text style={[styles.headerSubtitle, { color: theme.secondaryText }]}>
              {favoriteTours.length} туров
              {checkingAvailability ? ' · проверка…' : ''}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <ProfileIcon navigation={navigation} size={44} showName={true} />
        </View>
      </View>

      {favoriteTours.length === 0 ? (
        <View style={[styles.emptyContainer, { paddingBottom: bottomPad }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: theme.secondaryBackground }]}>
            <Ionicons name="heart-outline" size={64} color={theme.inactive} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Нет избранных туров</Text>
          <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
            Добавьте туры в избранное, чтобы вернуться к ним позже
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Home')} activeOpacity={0.8}>
            <View style={[styles.emptyButtonGradient, { backgroundColor: theme.primary }]}>
              <Text style={styles.emptyButtonText}>{i18n.t('bookings.findTours')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />}
        >
          <View style={styles.toursContainer}>
            {favoriteTours.map((tour, index) => {
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
                  disabled={false}
                  accessibilityState={{ disabled: isUnavailable }}
                >
                  <View style={styles.imageContainer}>
                    {imageUrl ? (
                      <Image
                        source={{ uri: imageUrl }}
                        style={[styles.tourImage, isUnavailable && styles.imageDimmed]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.tourImage, styles.imagePlaceholder, { backgroundColor: theme.secondaryBackground }]}>
                        <Ionicons name="image-outline" size={32} color={theme.inactive} />
                      </View>
                    )}
                    <View style={[styles.imageGradient, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
                    {isUnavailable && (
                      <View style={styles.unavailableOverlay}>
                        <View style={styles.unavailableBadge}>
                          <Ionicons name="close-circle" size={18} color="#fff" />
                          <Text style={styles.unavailableBadgeText}>{i18n.t('favorites.tourUnavailable')}</Text>
                        </View>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.favoriteButton, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
                      onPress={() => handleRemoveFavorite(tour.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="heart" size={20} color="#fff" />
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
                          <Text style={[styles.locationText, { color: theme.secondaryText }]}>
                            {tour.hotel?.region?.name ?? ''}
                            {tour.hotel?.subRegion ? `, ${tour.hotel.subRegion.name}` : ''}
                          </Text>
                        </View>
                        <View style={styles.metaRow}>
                          <View style={styles.metaItem}>
                            <Ionicons name="calendar-outline" size={14} color={theme.secondaryText} />
                            <Text style={[styles.metaText, { color: theme.secondaryText }]}>
                              {formatDate(tour.date)} • {tour.nights}{' '}
                              {tour.nights === 1
                                ? i18n.t('search.night')
                                : tour.nights < 5
                                  ? i18n.t('search.nights2')
                                  : i18n.t('search.nights')}
                            </Text>
                          </View>
                          {(tour.hotel?.rating ?? 0) > 0 && (
                            <View style={styles.rating}>
                              <Ionicons name="star" size={14} color="#FFD700" />
                              <Text style={[styles.ratingText, { color: theme.text }]}>{tour.hotel?.rating}</Text>
                            </View>
                          )}
                        </View>
                        <View style={[styles.priceRow, { borderTopColor: theme.border }]}>
                          <View>
                            {showDrop && baseline ? (
                              <Text style={[styles.oldPrice, { color: theme.secondaryText }]}>
                                {formatPrice(baseline, tour.currency)}
                              </Text>
                            ) : tour.fuelCharge > 0 ? (
                              <Text style={[styles.oldPrice, { color: theme.secondaryText }]}>
                                + топливный сбор {formatPrice(tour.fuelCharge, tour.currency)}
                              </Text>
                            ) : null}
                            <Text style={[styles.price, { color: showDrop ? theme.success : theme.text }]}>
                              {formatPrice(tour.price, tour.currency)}
                            </Text>
                            {showDrop ? (
                              <Text style={{ fontSize: 12, color: theme.success, fontWeight: '600', marginTop: 2 }}>
                                {i18n.t('favorites.priceDrop')} −{dropPct}%
                              </Text>
                            ) : null}
                          </View>
                          <View style={[styles.countryBadge, { backgroundColor: theme.primary + '20' }]}>
                            <Text style={[styles.countryText, { color: theme.primary }]}>
                              {tour.hotel?.country?.name ?? ''}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}
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
          navigation.navigate('Login');
        }}
        onRegister={() => {
          setShowAuthCard(false);
          navigation.navigate('Register');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: { flex: 1 },
  headerRight: { marginLeft: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, marginTop: 4 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  emptyButton: { borderRadius: 16, overflow: 'hidden' },
  emptyButtonGradient: { paddingHorizontal: 32, paddingVertical: 16 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  toursContainer: { padding: 20, gap: 16 },
  tourCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  tourCardUnavailable: {
    opacity: 0.85,
  },
  imageContainer: { height: 200, position: 'relative' },
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
    gap: 6,
    backgroundColor: 'rgba(180,40,40,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  unavailableBadgeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  unavailableHint: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  discountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  discountText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  tourInfo: { padding: 16 },
  hotelName: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  locationText: { fontSize: 14, marginLeft: 6 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 13, marginLeft: 6 },
  rating: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  oldPrice: { fontSize: 12, marginBottom: 2 },
  price: { fontSize: 22, fontWeight: '700' },
  countryBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  countryText: { fontSize: 12, fontWeight: '600' },
});
