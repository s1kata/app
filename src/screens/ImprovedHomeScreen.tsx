import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Dimensions,
  useWindowDimensions,
  Animated,
  Modal,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../config/ScreenContainer';
import { spacing, radius, shadows } from '../config/designSystem';
import AppLogo from '../components/AppLogo';
import { AuthService } from '../services/AuthService';
import { i18n } from '../config/i18n';
import { RELEASE_HIDE_NEXT_PATCH_UI } from '../config/releaseUiFlags';
import { useAppContext } from '../contexts/AppContext';
import { adaptive, BREAKPOINTS } from '../utils/adaptive';
import { platform } from '../utils/platform';
import ApiTourHotelSearch from '../components/ApiTourHotelSearch';
import WeatherWidget from '../components/WeatherWidget';
import { locationService, LocationData } from '../services/LocationService';
import { logger } from '../utils/logger';

export default function ImprovedHomeScreen({ navigation }: any) {
  const { isAuthenticated, user, theme, themeMode, updateCounter } = useAppContext();
  const [userName, setUserName] = useState('');
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeScale = useRef(new Animated.Value(0.8)).current;
  const handRotation = useRef(new Animated.Value(0)).current;
  const hasShownWelcome = useRef(false);
  const homeScreenMountedRef = useRef(true);

  useEffect(() => {
    homeScreenMountedRef.current = true;
    return () => {
      homeScreenMountedRef.current = false;
    };
  }, []);

  // Адаптивные размеры (useWindowDimensions для реакции на поворот экрана)
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const isMediumScreen = adaptive.isMedium();
  
  // Анимации для интерактивности
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  
  const heroScale = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [1, 0.95],
    extrapolate: 'clamp',
  });

  // Для адаптации нижней панели (теперь используется Tab Navigator)
  const hasNotch = platform.isIOS && SCREEN_HEIGHT / SCREEN_WIDTH > 2;

  const loadUserLocation = useCallback(async () => {
    try {
      const location = locationService.getCachedLocation() || await locationService.getSavedLocation();
      if (location && homeScreenMountedRef.current) {
        setUserLocation(location);
      }
    } catch (error) {
      // Игнорируем ошибки загрузки местоположения
    }
  }, []);

  const loadUserData = useCallback(async () => {
    if (isAuthenticated && user && user.uid) {
      try {
        // Проверяем, не является ли пользователь гостем
        const isGuest = user.uid.startsWith('guest_') || user.isAnonymous === true;
        if (isGuest) {
          if (homeScreenMountedRef.current) setUserName(i18n.t('profile.guest'));
          return;
        }

        const authProfile = await AuthService.getCurrentUser();
        if (homeScreenMountedRef.current) {
          setUserName(
            authProfile?.fullName ||
              user.displayName ||
              user.email?.split('@')[0] ||
              i18n.t('profile.user'),
          );
        }
      } catch (error) {
        logger.error('Error loading user data:', error);
        // Если не удалось загрузить профиль, используем displayName или email
        if (homeScreenMountedRef.current) {
          setUserName(user.displayName || user.email?.split('@')[0] || i18n.t('profile.user'));
        }
      }
    } else {
      if (homeScreenMountedRef.current) setUserName('');
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    loadUserData();
    loadUserLocation();
    const unsubscribe = navigation.addListener('focus', () => {
      loadUserData();
      loadUserLocation();
    });
    return unsubscribe;
  }, [navigation, isAuthenticated, user, loadUserData, loadUserLocation]);

  // Показываем приветственное окно при первом входе на главную страницу
  useEffect(() => {
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    let waveAnimation: Animated.CompositeAnimation | null = null;

    if (isAuthenticated && userName && !hasShownWelcome.current) {
      openTimer = setTimeout(() => {
        if (!homeScreenMountedRef.current) return;
        hasShownWelcome.current = true;
        setShowWelcomeModal(true);
        Animated.parallel([
          Animated.timing(welcomeOpacity, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.spring(welcomeScale, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
        ]).start();

        const createWaveAnimation = () =>
          Animated.sequence([
            Animated.timing(handRotation, {
              toValue: 1,
              duration: 200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(handRotation, {
              toValue: 0,
              duration: 200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]);

        waveAnimation = Animated.loop(createWaveAnimation(), { iterations: 6 });
        waveAnimation.start();

        dismissTimer = setTimeout(() => {
          if (!homeScreenMountedRef.current) return;
          Animated.parallel([
            Animated.timing(welcomeOpacity, {
              toValue: 0,
              duration: 300,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(welcomeScale, {
              toValue: 0.8,
              duration: 300,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
          ]).start(() => {
            if (!homeScreenMountedRef.current) return;
            setShowWelcomeModal(false);
            welcomeOpacity.setValue(0);
            welcomeScale.setValue(0.8);
            handRotation.setValue(0);
          });
        }, 3000);
      }, 300);
    }

    return () => {
      if (openTimer) clearTimeout(openTimer);
      if (dismissTimer) clearTimeout(dismissTimer);
      waveAnimation?.stop?.();
    };
  }, [isAuthenticated, userName]);

  // Сбрасываем флаг при разлогинивании
  useEffect(() => {
    if (!isAuthenticated) {
      hasShownWelcome.current = false;
    }
  }, [isAuthenticated]);


  const formatPrice = (price: number) => {
    return `${price.toLocaleString('ru-RU')} ₽`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
    });
  };


  const cardWidth = adaptive.isCompact() ? adaptive.screenWidth - 48 : isMediumScreen ? adaptive.screenWidth - 56 : adaptive.screenWidth - 64;
  const dynamicStyles = getStyles(SCREEN_WIDTH, isMediumScreen);

  // Высота навигационного бара для правильного отступа
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 65 + (platform.isAndroid ? Math.max(insets.bottom, 16) : (platform.isIOS && SCREEN_HEIGHT / SCREEN_WIDTH > 2 ? 34 : 0));

  return (
    <ScreenContainer key={updateCounter}>
      <Animated.ScrollView 
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + 20 }}
      >
        {/* Header - улучшенный дизайн */}
        <View style={[dynamicStyles.headerContainer, { 
          backgroundColor: theme.card,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }]}>
          <View style={dynamicStyles.headerContent}>
            <View style={dynamicStyles.headerLeft}>
              {!isAuthenticated && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Login')}
                  style={dynamicStyles.authButton}
                  activeOpacity={0.8}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 16,
                      gap: 8,
                      backgroundColor: theme.primary,
                    }}
                  >
                    <Ionicons name="log-in" size={20} color={theme.surface} />
                    <Text style={{
                      color: theme.surface,
                      fontSize: 16,
                      fontWeight: '700',
                    }}>{i18n.t('auth.login')}</Text>
                  </View>
                </TouchableOpacity>
              )}
              {isAuthenticated && (
                <View style={dynamicStyles.brandMark}>
                  <AppLogo size={44} bordered borderColor={theme.primary} backgroundColor={theme.surface} />
                </View>
              )}
            </View>
            <View style={dynamicStyles.headerRight}>
              <WeatherWidget location={userLocation} onRefresh={loadUserLocation} />
            </View>
          </View>
        </View>

        {/* API Tour & Hotel Search */}
        <View style={{ paddingHorizontal: adaptive.getHorizontalPadding(), marginBottom: 24, width: '100%' }}>
          <ApiTourHotelSearch
            navigation={navigation}
            enableHotelSearch={false}
            onOpenHotTours={() => navigation.navigate('ApiHotTours')}
          />
        </View>


        {/* Интересные факты о путешествиях */}
        <View style={dynamicStyles.section}>
          <View style={dynamicStyles.sectionHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="bulb" size={24} color={theme.primary} />
                <Text style={[dynamicStyles.sectionTitle, { color: theme.text, fontSize: 24, fontWeight: '700' }]}>
                  {i18n.t('home.interestingFacts')}
                </Text>
              </View>
              <Text style={[dynamicStyles.sectionSubtitle, { color: theme.secondaryText, marginTop: 4 }]}>
                {i18n.t('home.learnAboutTravel')}
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 4 }}
          >
            {[
              { id: '1', icon: 'airplane', color: theme.primary, titleKey: 'facts.longestFlight', factKey: 'facts.longestFlightDesc' },
              { id: '2', icon: 'earth', color: theme.success, titleKey: 'facts.mostVisited', factKey: 'facts.mostVisitedDesc' },
              { id: '3', icon: 'bed', color: theme.warning, titleKey: 'facts.mostExpensiveHotel', factKey: 'facts.mostExpensiveHotelDesc' },
              { id: '4', icon: 'sunny', color: theme.error, titleKey: 'facts.hottestResort', factKey: 'facts.hottestResortDesc' },
              { id: '5', icon: 'water', color: theme.secondary, titleKey: 'facts.deepestOcean', factKey: 'facts.deepestOceanDesc' },
              { id: '6', icon: 'snow', color: theme.accent, titleKey: 'facts.coldestResort', factKey: 'facts.coldestResortDesc' },
            ].map((fact) => (
              <View
                key={fact.id}
                style={[
                  {
                    width: SCREEN_WIDTH - 64,
                    backgroundColor: theme.card,
                    borderRadius: radius.lg,
                    padding: 20,
                    marginRight: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                  },
                  shadows.card,
                ]}
              >
                <View style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: fact.color + '15',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 16,
                }}>
                  <Ionicons name={fact.icon as any} size={28} color={fact.color} />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 8 }}>
                  {i18n.t(fact.titleKey)}
                </Text>
                <Text style={{ fontSize: 14, color: theme.secondaryText, lineHeight: 20 }}>
                  {i18n.t(fact.factKey)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Отзывы клиентов */}
        <View style={dynamicStyles.section}>
          <View style={dynamicStyles.sectionHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="chatbubbles" size={24} color={theme.primary} />
                <Text style={[dynamicStyles.sectionTitle, { color: theme.text, fontSize: 24, fontWeight: '700' }]}>
                  {i18n.t('home.customerReviews')}
                </Text>
              </View>
              <Text style={[dynamicStyles.sectionSubtitle, { color: theme.secondaryText, marginTop: 4 }]}>
                {i18n.t('home.whatClientsSay')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Reviews')}>
              <View style={dynamicStyles.seeAllWrap}>
                <Text style={[dynamicStyles.seeAll, { color: theme.primary, fontSize: 16, fontWeight: '600' }]}>
                  {i18n.t('home.seeAll')}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.primary} />
              </View>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 4 }}
          >
            {[
              { id: '1', userName: 'Анна П.', rating: 5, textKey: 'reviews.review1', tourKey: 'reviews.tour1' },
              { id: '2', userName: 'Иван С.', rating: 5, textKey: 'reviews.review2', tourKey: 'reviews.tour2' },
              { id: '3', userName: 'Мария И.', rating: 5, textKey: 'reviews.review3', tourKey: 'reviews.tour3' },
            ].map((review) => (
              <View
                key={review.id}
                style={[
                  {
                    width: SCREEN_WIDTH - 64,
                    backgroundColor: theme.card,
                    borderRadius: radius.lg,
                    padding: 20,
                    marginRight: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                  },
                  shadows.card,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: theme.primary,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 12,
                  }}>
                    <Text style={{ color: theme.surface, fontSize: 20, fontWeight: '700' }}>
                      {review.userName.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                      {review.userName}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Ionicons key={i} name="star" size={14} color="#FFD700" />
                      ))}
                    </View>
                  </View>
                </View>
                <Text style={{ fontSize: 14, color: theme.text, lineHeight: 20, marginBottom: 12 }}>
                  "{i18n.t(review.textKey)}"
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                }}>
                  <Ionicons name="airplane" size={14} color={theme.secondaryText} />
                  <Text style={{ fontSize: 12, color: theme.secondaryText, marginLeft: 6 }}>
                    {i18n.t(review.tourKey)}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Советы по путешествиям */}
        <View style={dynamicStyles.section}>
          <View style={dynamicStyles.sectionHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="book" size={24} color={theme.primary} />
                <Text style={[dynamicStyles.sectionTitle, { color: theme.text, fontSize: 24, fontWeight: '700' }]}>
                  {i18n.t('home.travelerTips')}
                </Text>
              </View>
              <Text style={[dynamicStyles.sectionSubtitle, { color: theme.secondaryText, marginTop: 4 }]}>
                {/* Персональные рекомендации скрыты до следующего патча: оставляем нейтральный подзаголовок. */}
                {i18n.t('home.travelTipsSubtitle')}
              </Text>
            </View>
          </View>
          <View style={{ gap: 12 }}>
            {[
              { id: '1', icon: 'document-text', color: theme.primary, titleKey: 'tips.documents', tipKey: 'tips.documentsDesc' },
              { id: '2', icon: 'shield-checkmark', color: theme.success, titleKey: 'tips.insurance', tipKey: 'tips.insuranceDesc' },
              { id: '3', icon: 'cash', color: theme.warning, titleKey: 'tips.currency', tipKey: 'tips.currencyDesc' },
              { id: '4', icon: 'time', color: theme.error, titleKey: 'tips.time', tipKey: 'tips.timeDesc' },
            ].map((tip) => (
              <View
                key={tip.id}
                style={[{
                  backgroundColor: theme.card,
                  borderRadius: 16,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 12,
                  elevation: 2,
                  borderWidth: 1,
                  borderColor: theme.border,
                }]}
              >
                <View style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: tip.color + '18',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}>
                  <Ionicons name={tip.icon as any} size={24} color={tip.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 6 }}>
                    {i18n.t(tip.titleKey)}
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.secondaryText, lineHeight: 20 }}>
                    {i18n.t(tip.tipKey)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

      </Animated.ScrollView>

      {/* Приветственное модальное окно */}
      <Modal
        visible={showWelcomeModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => {}}
      >
        <View style={dynamicStyles.welcomeModalOverlay}>
          <Animated.View
            style={[
              dynamicStyles.welcomeModalContent,
              {
                opacity: welcomeOpacity,
                transform: [{ scale: welcomeScale }],
                backgroundColor: theme.card,
                shadowColor: theme.shadow,
              },
            ]}
          >
            <View style={dynamicStyles.welcomeContent}>
              {/* Декоративные элементы */}
              <View style={dynamicStyles.welcomeDecorations}>
                <View style={[dynamicStyles.welcomeDot, { backgroundColor: theme.primary }]} />
                <View style={[dynamicStyles.welcomeDot, { backgroundColor: theme.accent }]} />
                <View style={[dynamicStyles.welcomeDot, { backgroundColor: theme.secondary }]} />
              </View>
              
              {/* Иконка с анимацией */}
              <Animated.View 
                style={[
                  dynamicStyles.welcomeIconContainer,
                  {
                    backgroundColor: theme.primary + '15',
                    transform: [{
                      rotate: handRotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-15deg', '15deg'],
                      }),
                    }],
                  },
                ]}
              >
                <View style={dynamicStyles.welcomeIconGradient}>
                  <AppLogo size={78} bordered borderColor={theme.primary} backgroundColor={theme.surface} />
                </View>
              </Animated.View>
              
              {/* Текст приветствия */}
              <View style={dynamicStyles.welcomeTextContainer}>
                <Text style={[dynamicStyles.welcomeGreeting, { color: theme.text }]}>
                  {i18n.t('home.greeting')},{' '}
                  {userName === i18n.t('profile.guest') || userName === 'Guest' || userName === 'Гость'
                    ? i18n.t('profile.guest')
                    : userName}
                  !
                </Text>
                <Text style={[dynamicStyles.welcomeTitle, { color: theme.text }]}>
                  {i18n.t('welcome.readyAdventures')}
                </Text>
                <Text style={[dynamicStyles.welcomeSubtext, { color: theme.secondaryText }]}>
                  {i18n.t('welcome.discoverTours')}
                </Text>
              </View>
              
              {/* Декоративная линия */}
              <View style={[dynamicStyles.welcomeLine, { backgroundColor: theme.primary + '30' }]} />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const getStyles = (SCREEN_WIDTH: number, isMediumScreen: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: adaptive.spacing.medium,
    paddingHorizontal: adaptive.getHorizontalPadding(),
    paddingBottom: adaptive.spacing.large,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  brandMark: {
    alignSelf: 'flex-start',
  },
  headerRight: {
    marginLeft: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greeting: {
    fontSize: SCREEN_WIDTH < 375 ? 24 : 28,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  greetingSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    marginTop: 2,
  },
  authButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#0066CC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  authButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  heroSection: {
    height: 280,
    marginHorizontal: 20,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 24,
    marginTop: 8,
    position: 'relative',
    ...shadows.card,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: adaptive.getHorizontalPadding(),
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
    gap: 6,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.95)',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontWeight: '400',
  },
  searchSection: {
    paddingHorizontal: 0,
    marginTop: 0,
    marginBottom: 24,
  },
  countriesScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  countryCard: {
    width: 160,
    height: 220,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginRight: 16,
    ...shadows.card,
  },
  countryImage: {
    width: '100%',
    height: '100%',
  },
  countryGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  countryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    zIndex: 10,
  },
  countryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    // Цвет применяется динамически через theme
  },
  countryInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  countryFlag: {
    fontSize: 32,
    marginBottom: 6,
  },
  countryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  countryRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countryRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  hotelsScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  hotelCard: {
    width: 300,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
    marginRight: 16,
    // backgroundColor применяется динамически через theme
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  hotelImage: {
    width: '100%',
    height: 160,
  },
  hotelInfo: {
    padding: 12,
  },
  hotelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  hotelName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  hotelStars: {
    flexDirection: 'row',
  },
  hotelLocation: {
    fontSize: 12,
    marginBottom: 8,
  },
  hotelPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  hotelPrice: {
    fontSize: 18,
    fontWeight: '700',
  },
  hotelPricePeriod: {
    fontSize: 12,
    marginLeft: 4,
  },
  searchCard: {
    padding: SCREEN_WIDTH < 375 ? 20 : 24,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  searchTitle: {
    fontSize: SCREEN_WIDTH < 375 ? 22 : 26,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  searchSubtitle: {
    fontSize: SCREEN_WIDTH < 375 ? 14 : 16,
    marginBottom: 24,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SCREEN_WIDTH < 375 ? 14 : 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: SCREEN_WIDTH < 375 ? 16 : 18,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: adaptive.getHorizontalPadding(),
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: SCREEN_WIDTH < 375 ? 22 : 26,
    fontWeight: '700',
    // Цвет применяется динамически через theme
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    marginTop: 2,
  },
  seeAll: {
    fontSize: 15,
    fontWeight: '600',
    // Цвет применяется динамически через theme
  },
  seeAllWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  promoBanner: {
    borderRadius: radius.xl,
    padding: SCREEN_WIDTH < 375 ? 24 : 28,
    overflow: 'hidden',
    ...shadows.cardRaised,
  },
  promoContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promoTextContainer: {
    flex: 1,
  },
  promoBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
    gap: 6,
  },
  promoBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  promoTitle: {
    fontSize: SCREEN_WIDTH < 375 ? 26 : 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  promoDescription: {
    fontSize: SCREEN_WIDTH < 375 ? 15 : 17,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '400',
  },
  promoIconContainer: {
    opacity: 0.2,
  },
  tourImageContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  tourImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tourBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  tourRating: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tourDiscountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tourDiscountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tourInfo: {
    padding: SCREEN_WIDTH < 375 ? 16 : 20,
  },
  tourHeader: {
    marginBottom: 12,
  },
  tourTitleContainer: {
    marginBottom: 8,
  },
  tourTitle: {
    fontSize: SCREEN_WIDTH < 375 ? 18 : 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tourLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tourLocationText: {
    fontSize: 14,
  },
  tourFeatures: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  tourFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tourFeatureText: {
    fontSize: 13,
  },
  tourFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  tourPriceContainer: {
    flex: 1,
  },
  tourPrice: {
    fontSize: SCREEN_WIDTH < 375 ? 22 : 26,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tourPriceOld: {
    fontSize: 14,
    textDecorationLine: 'line-through',
  },
  addToCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_WIDTH < 375 ? 16 : 20,
    paddingVertical: SCREEN_WIDTH < 375 ? 12 : 14,
    borderRadius: 12,
    gap: 6,
  },
  addToCartText: {
    color: '#fff',
    fontSize: SCREEN_WIDTH < 375 ? 14 : 16,
    fontWeight: '600',
  },
  categoriesScroll: {
    paddingHorizontal: adaptive.getHorizontalPadding(),
    gap: 16,
  },
  categoryCard: {
    width: 200,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  categoryGradient: {
    padding: 20,
    minHeight: 180,
  },
  categoryContent: {
    alignItems: 'flex-start',
  },
  categoryIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  categoryDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
    fontWeight: '400',
  },
  categoryCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  countriesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  countriesButtonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countriesIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  countriesTextContainer: {
    flex: 1,
  },
  countriesTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  countriesSubtitle: {
    fontSize: 13,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  featureCard: {
    width: (SCREEN_WIDTH - 60) / 2,
    margin: 6,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  featureText: {
    fontSize: 12,
    lineHeight: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 28,
    borderRadius: radius.xl,
    ...shadows.cardRaised,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  statDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  toursScroll: {
    paddingHorizontal: adaptive.getHorizontalPadding(),
    gap: 16,
  },
  tourCard: {
    width: 280,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginRight: 16,
    ...shadows.card,
  },
  tourCardImage: {
    width: '100%',
    height: 180,
  },
  tourCardGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  tourCardBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
    zIndex: 10,
  },
  tourCardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tourCardDiscount: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 10,
  },
  tourCardDiscountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tourCardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  tourCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tourCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  tourCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tourCardRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  tourCardDuration: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  tourCardPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  tourCardOldPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
    textDecorationLine: 'line-through',
  },
  tourCardPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  earlyBookingCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  earlyBookingGradient: {
    padding: 24,
  },
  earlyBookingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  earlyBookingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  earlyBookingText: {
    flex: 1,
  },
  earlyBookingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  earlyBookingSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  earlyBookingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor применяется динамически через theme
    paddingHorizontal: adaptive.getHorizontalPadding(),
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
  },
  earlyBookingButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#10B981',
  },
  topDestinationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  topDestinationCard: {
    width: (SCREEN_WIDTH - 52) / 2,
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    margin: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  topDestinationImage: {
    width: '100%',
    height: '100%',
  },
  topDestinationGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  topDestinationBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
    zIndex: 10,
  },
  topDestinationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    // Цвет применяется динамически через theme
  },
  topDestinationInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  topDestinationFlag: {
    fontSize: 32,
    marginBottom: 6,
  },
  topDestinationName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topDestinationStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topDestinationStatsText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  welcomeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeModalContent: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 400,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.cardRaised,
  },
  welcomeContent: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  welcomeDecorations: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'row',
    gap: 6,
  },
  welcomeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.6,
  },
  welcomeIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  welcomeIconGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeTextContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeGreeting: {
    fontSize: SCREEN_WIDTH < 375 ? 24 : 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  welcomeTitle: {
    fontSize: SCREEN_WIDTH < 375 ? 20 : 24,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  welcomeSubtext: {
    fontSize: SCREEN_WIDTH < 375 ? 14 : 16,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
  },
  welcomeLine: {
    width: 60,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
});
