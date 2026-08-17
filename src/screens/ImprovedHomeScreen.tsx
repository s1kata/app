/**
 * Главная по концепту TravelHub OTA:
 * logo+greeting+bell/heart → поиск → баннер отелей → горящие туры → идеи.
 * Бэкенд-хуки сохранены через дочерние секции.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  InteractionManager,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenContainer from '../config/ScreenContainer';
import AppLogo from '../components/AppLogo';
import { AuthService } from '../services/AuthService';
import { useAppContext } from '../contexts/AppContext';
import { useTabBarMetrics } from '../utils/tabBarMetrics';
import HomeHotToursSection from '../components/HomeHotToursSection';
import HomePopularHotelsEntry from '../components/HomePopularHotelsEntry';
import HomeReviewsSection from '../components/HomeReviewsSection';
import HomeQuickNav from '../components/HomeQuickNav';
import GuestModeBanner from '../components/ux/GuestModeBanner';
import { getTravelIdeas } from '../config/travelIdeas';
import {
  buildIdeaSearchParams,
  prefetchPopularIdeaCollections,
  resolvePreferredDepartureId,
} from '../services/IdeaCollectionService';
import CachedImage from '../components/ui/CachedImage';
import { radius, shadows, spacing, typography } from '../config/designSystem';
import { logger } from '../utils/logger';
import { navigateRoot, navigateTab } from '../utils/navHelpers';
import { i18n } from '../config/i18n';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';

export default function ImprovedHomeScreen({ navigation }: any) {
  const { isAuthenticated, user, theme, fontScale, language, currency } = useAppContext();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const hPad = screenWidth < 360 ? spacing.sm + 2 : spacing.md;
  const ideaCardW = Math.round(Math.min(196, Math.max(148, screenWidth * 0.44)));
  const ideaCardH = Math.round(ideaCardW * 0.78);
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const [userName, setUserName] = useState('');
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const tabPad = useTabBarMetrics(insets, fontScale);
  const bottomPad = tabPad.contentBottomPadding({ includeFab: false, extra: 24 });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadUserData = useCallback(async () => {
    if (!isAuthenticated || !user?.uid) {
      if (mounted.current) setUserName('');
      return;
    }
    try {
      if (user.uid.startsWith('guest_') || user.isAnonymous) {
        if (mounted.current) setUserName('');
        return;
      }
      const authProfile = await AuthService.getCurrentUser();
      if (!mounted.current) return;
      setUserName(
        authProfile?.fullName ||
          user.displayName ||
          user.email?.split('@')[0] ||
          '',
      );
    } catch (e) {
      logger.debug('home profile', (e as Error)?.message);
      if (mounted.current) {
        setUserName(user.displayName || user.email?.split('@')[0] || '');
      }
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    void loadUserData();
    const unsub = navigation.addListener('focus', () => void loadUserData());
    return unsub;
  }, [navigation, loadUserData]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void prefetchPopularIdeaCollections(currency || 'RUB');
    });
    return () => task.cancel();
  }, [currency]);

  const openTravelIdea = useCallback(
    async (ideaId: string) => {
      const idea = getTravelIdeas().find((i) => i.id === ideaId);
      if (!idea) return;
      try {
        const departureId = await resolvePreferredDepartureId();
        const searchParams = buildIdeaSearchParams(idea, departureId, currency || 'RUB');
        navigation.navigate('ApiTourResults', {
          searchParams,
          runSearch: true,
          useCache: false,
          collectionTitle: i18n.t(idea.titleKey),
          ideaId: idea.id,
        });
      } catch (e) {
        logger.debug('[Home] open idea', (e as Error)?.message);
        navigation.navigate('ApiTourResults', {
          searchParams: buildIdeaSearchParams(idea, 1, 'RUB'),
          runSearch: true,
          collectionTitle: i18n.t(idea.titleKey),
          ideaId: idea.id,
        });
      }
    },
    [navigation, currency],
  );

  const quickNavItems = [
    {
      id: 'search',
      labelKey: 'home.navSearch',
      icon: 'search-outline' as const,
      accent: true,
      onPress: () => navigateTab(navigation, 'Search'),
    },
    {
      id: 'hot',
      labelKey: 'home.navHot',
      icon: 'flame-outline' as const,
      onPress: () => navigation.navigate('ApiHotTours'),
    },
    {
      id: 'bookings',
      labelKey: 'home.navBookings',
      icon: 'calendar-outline' as const,
      onPress: () => navigateTab(navigation, 'Bookings'),
    },
    {
      id: 'favorites',
      labelKey: 'home.navFavorites',
      icon: 'heart-outline' as const,
      onPress: () => navigateTab(navigation, 'Favorites'),
    },
  ];

  const onRefresh = async () => {
    setHomeRefreshing(true);
    setHomeRefreshKey((k) => k + 1);
    await loadUserData();
    setTimeout(() => setHomeRefreshing(false), 600);
  };

  const firstName = userName.trim().split(/\s+/)[0];
  const greeting = firstName
    ? `${i18n.t('home.goodDay')}, ${firstName}`
    : i18n.t('home.goodDay');

  return (
    <ScreenContainer edges={['top']} backgroundColor={theme.background}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        refreshControl={
          <RefreshControl refreshing={homeRefreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Header — logo + greeting + bell/heart */}
        <View style={[styles.header, { paddingHorizontal: hPad }]}>
          <AppLogo size={40} shape="rounded" bordered borderColor={theme.primary} backgroundColor={theme.surface} />
          <View style={styles.headerText}>
            <Text
              style={[styles.hello, { color: theme.deep }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {greeting}
            </Text>
            <Text style={[styles.helloSub, { color: theme.secondaryText }]} numberOfLines={1}>
              {i18n.t('home.whereToday')}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => navigateTab(navigation, 'Profile', 'Settings')}
              hitSlop={8}
              accessibilityLabel={i18n.t('home.notificationsA11y')}
            >
              <Ionicons name="notifications-outline" size={20} color={theme.deep} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => navigateTab(navigation, 'Favorites')}
              hitSlop={8}
              accessibilityLabel={i18n.t('home.favoritesA11y')}
            >
              <Ionicons name="heart-outline" size={20} color={theme.deep} />
            </TouchableOpacity>
          </View>
        </View>

        {isGuest ? (
          <View style={{ paddingHorizontal: hPad, marginBottom: spacing.md }}>
            <GuestModeBanner onCreateProfile={() => navigateRoot(navigation, 'Register')} />
          </View>
        ) : null}

        {/* Быстрая навигация — без дублирующего поиска */}
        <View style={{ paddingHorizontal: hPad, marginBottom: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: theme.deep, marginBottom: spacing.sm }]}>
            {i18n.t('home.categories')}
          </Text>
          <HomeQuickNav items={quickNavItems} />
        </View>

        {/* Hotels hero */}
        <View style={{ paddingHorizontal: hPad, marginBottom: spacing.lg }}>
          <HomePopularHotelsEntry navigation={navigation} />
        </View>

        {/* Hot tours */}
        <View style={{ paddingHorizontal: hPad, marginBottom: spacing.lg }}>
          <HomeHotToursSection navigation={navigation} refreshKey={homeRefreshKey} />
        </View>

        {/* Travel ideas = scenarios (mix moods + season) */}
        <View style={{ paddingHorizontal: hPad, marginBottom: spacing.lg }}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.deep }]}>{i18n.t('home.travelIdeas')}</Text>
            <TouchableOpacity
              onPress={() => {
                void (async () => {
                  const departureId = await resolvePreferredDepartureId();
                  navigation.navigate('Countries', { departureId });
                })();
              }}
              hitSlop={10}
            >
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
                {i18n.t('home.seeAllArrow')}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            contentContainerStyle={{ gap: 12, paddingRight: 4 }}
          >
            {getTravelIdeas().map((idea) => {
              const title = i18n.t(idea.titleKey);
              const subtitle = i18n.t(idea.subtitleKey);
              return (
              <TouchableOpacity
                key={idea.id}
                activeOpacity={0.9}
                onPress={() => void openTravelIdea(idea.id)}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${subtitle}`}
                style={[
                  styles.ideaCard,
                  shadows.cardRaised,
                  { width: ideaCardW, height: ideaCardH },
                ]}
              >
                <CachedImage
                  source={{ uri: idea.image }}
                  fallbackUri={DEFAULT_HOTEL_IMAGE}
                  style={styles.ideaImg}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(18,18,46,0.15)', 'rgba(18,18,46,0.78)']}
                  locations={[0.2, 0.55, 1]}
                  style={styles.ideaOverlay}
                  pointerEvents="none"
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text style={[styles.ideaName, { fontSize: screenWidth < 360 ? 14 : 16 }]} numberOfLines={2}>
                    {title}
                  </Text>
                  <Text style={styles.ideaSub} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Customer reviews */}
        <HomeReviewsSection navigation={navigation} />
      </Animated.ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 12,
    flexWrap: 'nowrap',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  hello: { ...typography.h3 },
  helloSub: { fontSize: 13, marginTop: 2, fontWeight: '500' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPill: {
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    gap: 10,
  },
  searchMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  searchPlaceholder: { flex: 1, fontSize: 15, fontWeight: '500', minWidth: 0 },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.h3 },
  ideaCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  ideaImg: { width: '100%', height: '100%' },
  ideaOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 12,
  },
  ideaName: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ideaSub: { color: 'rgba(255,255,255,0.9)', fontWeight: '600', fontSize: 12, marginTop: 2 },
});
