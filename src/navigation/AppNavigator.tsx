import React from 'react';
import type { ComponentType } from 'react';
import { View, StyleSheet, Dimensions, PixelRatio, TouchableOpacity, Text } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import type { NavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { platform } from '../utils/platform';
import { adaptive } from '../utils/adaptive';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const PIXEL_RATIO = PixelRatio.get();

// Минимальный отступ для Android с жестовой/кнопочной навигацией
const getLegacyBottomInset = () => {
  if (platform.isIOS) {
    const aspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
    if (aspectRatio > 2.1) return 34;
    if (aspectRatio > 2) return 20;
  }
  return 0;
};

// Табы для навигации
const TAB_ROUTES = ['Home', 'Bookings', 'Profile'];

// Список экранов, на которых нужно скрыть таб бар
function stackRouteAt(state: NavigationState | undefined): { name: string } | undefined {
  if (!state?.routes?.length) return undefined;
  const i = typeof state.index === 'number' ? state.index : 0;
  return state.routes[i] as { name: string } | undefined;
}

const SCREENS_TO_HIDE_TAB_BAR = [
  'TourBooking',
  'ApiTourDetails',
  'ApiTourResults',
  'ApiHotTours',
  'ApiTourSearch',
  'CountryDetail',
  'CountryInfo',
  'Countries',
  'Reviews',
];

// Кастомный TabBar с шариком прямо на иконке активной вкладки
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme, themeMode, fontScale } = useAppContext();
  const insets = useSafeAreaInsets();
  // На Android учитываем нижнюю безопасную зону (жесты/кнопки навигации)
  const safeBottom = platform.isAndroid
    ? Math.max(insets.bottom, 16)
    : Math.max(insets.bottom, getLegacyBottomInset());
  
  // Проверяем, нужно ли скрыть таб бар на основе активного экрана в стеке
  const shouldHideTabBar = React.useMemo(() => {
    const activeTabRoute = state.routes[state.index];
    const nested = activeTabRoute.state as NavigationState | undefined;
    if (!nested?.routes?.length) return false;

    const activeStackRoute = stackRouteAt(nested);
    if (!activeStackRoute) return false;
    
    const screenName = activeStackRoute.name;
    return SCREENS_TO_HIDE_TAB_BAR.includes(screenName);
  }, [state]);
  
  const tabBarHeight = React.useMemo(() => {
    const baseHeight = 48;
    const scaledHeight = baseHeight * Math.min(fontScale, 1.2);
    return Math.round(scaledHeight) + safeBottom + 6;
  }, [fontScale, safeBottom]);

  if (shouldHideTabBar) {
    return null;
  }

  return (
    <View>
      {/* Маркер избранного над навигационным баром */}
      <TouchableOpacity
        style={[
          customTabBarStyles.favoritesMarker, 
          { 
            backgroundColor: theme.card,
            borderColor: theme.border,
            bottom: tabBarHeight + 28,
          }
        ]}
        onPress={() => {
          const currentRoute = state.routes[state.index];
          if (currentRoute.name === 'Home') {
            const homeState = currentRoute.state as NavigationState | undefined;
            if (stackRouteAt(homeState)?.name === 'Favorites') {
              return;
            }
            navigation.navigate('Home', { screen: 'Favorites' });
          } else {
            navigation.navigate('Home');
            requestAnimationFrame(() => {
              navigation.navigate('Home', { screen: 'Favorites' });
            });
          }
        }}
        activeOpacity={0.8}
        accessibilityLabel={i18n.t('profile.favorites')}
        accessibilityRole="button"
      >
        <Ionicons name="heart" size={20} color={theme.primary} />
        <Text style={[customTabBarStyles.favoritesLabel, { color: theme.secondaryText }]}>
          {i18n.t('profile.favorites')}
        </Text>
      </TouchableOpacity>

      <View style={[customTabBarStyles.container, { backgroundColor: theme.card, paddingBottom: safeBottom + 8 }]}>
        <View style={[customTabBarStyles.topLine, { backgroundColor: `${theme.primary}26` }]} />

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const rawLabel =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
              ? options.title
              : route.name;
        const labelText =
          typeof rawLabel === 'string' || typeof rawLabel === 'number'
            ? String(rawLabel)
            : route.name;
        const tabOptions = options as { tabBarTestID?: string };

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            if (route.name === 'Home') {
              navigation.navigate(route.name, { screen: 'HomeMain' });
            } else {
              navigation.navigate(route.name);
            }
          } else if (isFocused) {
            if (route.name === 'Home') {
              const homeState = state.routes[state.index].state as NavigationState | undefined;
              if (stackRouteAt(homeState)?.name !== 'HomeMain') {
                navigation.navigate(route.name, { screen: 'HomeMain' });
              }
            }
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
        if (route.name === 'Home') {
          iconName = isFocused ? 'home' : 'home-outline';
        } else if (route.name === 'Bookings') {
          iconName = isFocused ? 'calendar' : 'calendar-outline';
        } else if (route.name === 'Profile') {
          iconName = isFocused ? 'person' : 'person-outline';
        }

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={tabOptions.tabBarTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={customTabBarStyles.tabButton}
          >
            <View style={[customTabBarStyles.iconWrapper, { width: BALL_SIZE, height: BALL_SIZE }]}>
              {/* Шарик — прямо за иконкой, идеально центрирован */}
              {isFocused && (
                <View
                  style={[
                    customTabBarStyles.iconBall,
                    {
                      backgroundColor: `${theme.primary}25`,
                      shadowColor: theme.primary,
                    },
                  ]}
                />
              )}
              <View style={customTabBarStyles.iconContainer}>
                <Ionicons
                  name={iconName}
                  size={Math.round(24 * Math.min(fontScale, 1.2))}
                  color={isFocused ? theme.primary : theme.inactive}
                  style={customTabBarStyles.icon}
                />
              </View>
            </View>
            <Text
              style={[
                customTabBarStyles.label,
                { 
                  color: isFocused ? theme.primary : theme.inactive,
                  fontSize: Math.round(14 * Math.min(fontScale, 1.3)),
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
            >
              {labelText}
            </Text>
          </TouchableOpacity>
        );
      })}
      </View>
    </View>
  );
}

const BALL_SIZE = 44;

// Базовые стили таба
const customTabBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // paddingBottom задаётся динамически в компоненте для учёта safe area
    paddingTop: 4, // Уменьшили padding сверху
    paddingHorizontal: adaptive.getHorizontalPadding(),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'visible',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBall: {
    position: 'absolute',
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  label: {
    fontSize: 9, // Уменьшили размер шрифта для компактности
    fontWeight: '600',
    marginTop: 4, // Увеличили отступ сверху для лучшего позиционирования относительно глайдера
    letterSpacing: 0.1, // Уменьшили межбуквенное расстояние
    flexShrink: 1, // Позволяет тексту сжиматься
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    paddingHorizontal: 4, // Добавили горизонтальный padding для раздвигания иконок
    minWidth: 0, // Позволяет кнопкам сжиматься
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  icon: {},
  topLine: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: [{ translateX: -SCREEN_WIDTH * 0.3 }],
    width: SCREEN_WIDTH * 0.6,
    height: 3,
    backgroundColor: 'rgba(0, 102, 204, 0.15)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  favoritesMarker: {
    position: 'absolute',
    left: 16,
    width: 72,
    minHeight: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 2,
    zIndex: 1000,
  },
  favoritesLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});

// Импорт экранов
import ImprovedHomeScreen from '../screens/ImprovedHomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import BookingsScreen from '../screens/BookingsScreen';
import CountryInfoScreen from '../screens/CountryInfoScreen';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import ProfileSettings from '../screens/ProfileSettings';
import PersonalDataScreen from '../screens/PersonalDataScreen';
import CountryDetailScreen from '../screens/CountryDetailScreen';

// API-based screens
import ApiTourSearchScreen from '../screens/ApiTourSearchScreen';
import ApiTourResultsScreen from '../screens/ApiTourResultsScreen';
import ApiTourDetailsScreen from '../screens/ApiTourDetailsScreen';
import ApiHotToursScreen from '../screens/ApiHotToursScreen';
import TourvisorCountriesScreen from '../screens/TourvisorCountriesScreen';
import SplashScreen from '../screens/SplashScreen';
import LegalDocumentScreen from '../screens/LegalDocumentScreen';
import ReviewsScreen from '../screens/ReviewsScreen';
import TourBookingScreen from '../screens/TourBookingScreen';
import HelperChatScreen from '../screens/HelperChatScreen';
import BonusScreen from '../screens/BonusScreen';
import PurchaseHistoryScreen from '../screens/PurchaseHistoryScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Стек для главной вкладки
function HomeStack() {
  return (
    <Stack.Navigator 
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen
        name="HomeMain" 
        component={ImprovedHomeScreen}
        options={{
          // При возврате на этот экран всегда показываем его, не запоминаем предыдущий
        }}
      />
      {/* Релиз: только туры (отели вне навигатора — см. releaseUiFlags) */}
      <Stack.Screen name="ApiHotTours" component={ApiHotToursScreen} />
      <Stack.Screen name="ApiTourSearch" component={ApiTourSearchScreen as ComponentType<any>} />
      <Stack.Screen name="ApiTourResults" component={ApiTourResultsScreen as ComponentType<any>} />
      <Stack.Screen name="ApiTourDetails" component={ApiTourDetailsScreen} />
      <Stack.Screen name="TourBooking" component={TourBookingScreen as ComponentType<any>} />
      <Stack.Screen name="CountryInfo" component={CountryInfoScreen as ComponentType<any>} />
      <Stack.Screen name="Countries" component={TourvisorCountriesScreen} />
      <Stack.Screen name="CountryDetail" component={CountryDetailScreen as ComponentType<any>} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="Reviews" component={ReviewsScreen} />
    </Stack.Navigator>
  );
}


// Стек для бронирований
function BookingsStack() {
  return (
    <Stack.Navigator 
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
      initialRouteName="BookingsMain"
    >
      <Stack.Screen name="BookingsMain" component={BookingsScreen} />
      {/* Дополнительные экраны для деталей бронирований, если понадобятся */}
    </Stack.Navigator>
  );
}

// Стек профиля (нижний таб + ProfileIcon)
function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={ProfileSettings} />
      <Stack.Screen name="LegalDocument" component={LegalDocumentScreen as ComponentType<any>} />
      <Stack.Screen name="Bookings" component={BookingsScreen} />
      <Stack.Screen name="PersonalData" component={PersonalDataScreen} />
      <Stack.Screen name="Bonus" component={BonusScreen} />
      <Stack.Screen name="PurchaseHistory" component={PurchaseHistoryScreen} />
      <Stack.Screen name="HelperChat" component={HelperChatScreen} />
    </Stack.Navigator>
  );
}

// Основной таб навигатор
function MainTabNavigator() {
  useAppContext(); // ре-рендер при смене языка
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          title: i18n.t('nav.home'),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const current = state.routes[state.index];
            if (current?.name === 'Home') {
              e.preventDefault();
              navigation.navigate('Home', { screen: 'HomeMain' });
            }
          },
        })}
      />
      <Tab.Screen
        name="Bookings"
        component={BookingsStack}
        options={{ title: i18n.t('nav.bookings') }}
      />
      {/* TODO: вкладка Documents скрыта до настройки API документов (Никита)
      <Tab.Screen
        name="Documents"
        component={DocumentsStack}
        options={{ title: i18n.t('nav.documents') }}
      />
      */}
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: i18n.t('nav.profile') }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const current = state.routes[state.index];
            if (current?.name === 'Profile') {
              e.preventDefault();
              navigation.navigate('Profile', { screen: 'ProfileMain' });
            }
          },
        })}
      />
    </Tab.Navigator>
  );
}

// Основной стек навигатор для аутентификации
export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
    </Stack.Navigator>
  );
}
