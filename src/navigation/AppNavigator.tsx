import React from 'react';
import type { ComponentType } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, useWindowDimensions } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import type { NavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getTabBarBottomInset,
  getTabBarHeight,
} from '../utils/safeAreaInsets';
import { setTabBarMetrics } from '../utils/tabBarMetrics';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';

// Табы для навигации
const TAB_ROUTES = ['Home', 'Search', 'Favorites', 'Bookings', 'Profile'];

// Список экранов, на которых нужно скрыть таб бар
function getDeepestRouteName(state: NavigationState | undefined): string | undefined {
  if (!state?.routes?.length) return undefined;
  let current: NavigationState | undefined = state;
  let name: string | undefined;
  while (current?.routes?.length) {
    const i = typeof current.index === 'number' ? current.index : 0;
    const route = current.routes[i] as { name: string; state?: NavigationState };
    name = route.name;
    current = route.state;
  }
  return name;
}

function stackRouteAt(state: NavigationState | undefined): { name: string } | undefined {
  const name = getDeepestRouteName(state);
  return name ? { name } : undefined;
}

const SCREENS_TO_HIDE_TAB_BAR = [
  'TourBooking',
  'ApiTourDetails',
  'ApiTourResults',
  'ApiHotTours',
  'ToursMap',
  // ApiTourSearch — корень вкладки Search, таббар должен оставаться
  'CountryDetail',
  'CountryInfo',
  'Countries',
  'Reviews',
  'ApiHotelSearch',
  'ApiHotelDetails',
  'PopularHotels',
  'HotelBooking',
  'Settings',
  'PersonalData',
  'About',
  'HelperChat',
  'LegalDocument',
  'Bonus',
  'PurchaseHistory',
];

const TAB_BAR_H_MARGIN = 14;
const TAB_BAR_FLOAT_GAP = 8;

// Кастомный TabBar — 5 вкладок, floating white bar (концепт OTA)
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme, fontScale, language } = useAppContext();
  void language;
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const safeBottom = getTabBarBottomInset(insets);
  const floatBottom = Math.max(safeBottom, 8) + TAB_BAR_FLOAT_GAP;

  const shouldHideTabBar = React.useMemo(() => {
    const activeTabRoute = state.routes[state.index];
    const nested = activeTabRoute.state as NavigationState | undefined;
    const screenName = getDeepestRouteName(nested);
    if (!screenName) return false;
    return SCREENS_TO_HIDE_TAB_BAR.includes(screenName);
  }, [state]);

  React.useEffect(() => {
    setTabBarMetrics({ fabHeight: 0 });
  }, []);

  if (shouldHideTabBar) {
    return null;
  }

  const activeColor = theme.primary || '#5DA9A4';
  const inactiveColor = theme.inactive || '#9AA3B2';

  return (
    <View
      pointerEvents="box-none"
      style={[customTabBarStyles.outer, { bottom: floatBottom, paddingHorizontal: TAB_BAR_H_MARGIN }]}
      onLayout={(e) => {
        const barH = Math.ceil(e.nativeEvent.layout.height);
        if (barH > 0) {
          // Полный clearance: высота бара + отступ от низа экрана
          setTabBarMetrics({ tabBarHeight: barH + floatBottom, fabHeight: 0 });
        }
      }}
    >
      <View
        style={[
          customTabBarStyles.bar,
          {
            backgroundColor: theme.card || '#FFFFFF',
            borderColor: theme.border || 'rgba(18,18,46,0.06)',
          },
        ]}
      >
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
              } else if (route.name === 'Search') {
                navigation.navigate(route.name, { screen: 'ApiTourSearch' });
              } else if (route.name === 'Favorites') {
                navigation.navigate(route.name, { screen: 'FavoritesMain' });
              } else {
                navigation.navigate(route.name);
              }
            } else if (isFocused && route.name === 'Home') {
              const homeState = state.routes[state.index].state as NavigationState | undefined;
              if (stackRouteAt(homeState)?.name !== 'HomeMain') {
                navigation.navigate(route.name, { screen: 'HomeMain' });
              }
            }
          };

          let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
          if (route.name === 'Home') iconName = isFocused ? 'home' : 'home-outline';
          else if (route.name === 'Search') iconName = isFocused ? 'search' : 'search-outline';
          else if (route.name === 'Favorites') iconName = isFocused ? 'heart' : 'heart-outline';
          else if (route.name === 'Bookings') iconName = isFocused ? 'briefcase' : 'briefcase-outline';
          else if (route.name === 'Profile') iconName = isFocused ? 'person' : 'person-outline';

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={tabOptions.tabBarTestID}
              onPress={onPress}
              style={customTabBarStyles.tabButton}
              activeOpacity={0.75}
            >
              <Ionicons
                name={iconName}
                size={Math.round(22 * Math.min(fontScale, 1.2))}
                color={isFocused ? activeColor : inactiveColor}
              />
              <Text
                style={[
                  customTabBarStyles.label,
                  {
                    color: isFocused ? activeColor : inactiveColor,
                    fontWeight: isFocused ? '700' : '500',
                    fontSize: Math.round(screenWidth < 360 ? 9 : 10) * Math.min(fontScale, 1.15),
                  },
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {labelText}
              </Text>
              <View
                style={[
                  customTabBarStyles.activeDot,
                  { backgroundColor: isFocused ? activeColor : 'transparent' },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
      {/* estimated height kept in sync via getTabBarHeight(insets, fontScale) */}
      {getTabBarHeight(insets, fontScale) < 0 ? null : null}
    </View>
  );
}

const customTabBarStyles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 6,
    shadowColor: '#12122E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 14,
  },
  label: {
    fontSize: 10,
    marginTop: 3,
    letterSpacing: 0.05,
    flexShrink: 1,
    textAlign: 'center',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 2,
    minWidth: 0,
  },
  activeDot: {
    width: 14,
    height: 3,
    borderRadius: 2,
    marginTop: 4,
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
import ApiHotelSearchScreen from '../screens/ApiHotelSearchScreen';
import ApiHotelDetailsScreen from '../screens/ApiHotelDetailsScreen';
import PopularHotelsScreen from '../screens/PopularHotelsScreen';
import HotelBookingFormScreen from '../screens/HotelBookingFormScreen';
import TourvisorCountriesScreen from '../screens/TourvisorCountriesScreen';
import SplashScreen from '../screens/SplashScreen';
import LegalDocumentScreen from '../screens/LegalDocumentScreen';
import ReviewsScreen from '../screens/ReviewsScreen';
import TourBookingScreen from '../screens/TourBookingScreen';
import HelperChatScreen from '../screens/HelperChatScreen';
import BonusScreen from '../screens/BonusScreen';
import PurchaseHistoryScreen from '../screens/PurchaseHistoryScreen';
import AboutScreen from '../screens/AboutScreen';
import ToursMapScreen from '../screens/ToursMapScreen';

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
      <Stack.Screen name="ApiHotTours" component={ApiHotToursScreen} />
      <Stack.Screen name="ToursMap" component={ToursMapScreen as ComponentType<any>} />
      <Stack.Screen name="ApiTourSearch" component={ApiTourSearchScreen as ComponentType<any>} />
      <Stack.Screen name="ApiTourResults" component={ApiTourResultsScreen as ComponentType<any>} />
      <Stack.Screen name="ApiTourDetails" component={ApiTourDetailsScreen} />
      <Stack.Screen name="TourBooking" component={TourBookingScreen as ComponentType<any>} />
      <Stack.Screen name="ApiHotelSearch" component={ApiHotelSearchScreen as ComponentType<any>} />
      <Stack.Screen name="PopularHotels" component={PopularHotelsScreen as ComponentType<any>} />
      <Stack.Screen name="ApiHotelDetails" component={ApiHotelDetailsScreen as ComponentType<any>} />
      <Stack.Screen name="HotelBooking" component={HotelBookingFormScreen as ComponentType<any>} />
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
      <Stack.Screen name="ApiTourDetails" component={ApiTourDetailsScreen} />
      <Stack.Screen name="TourBooking" component={TourBookingScreen as ComponentType<any>} />
      <Stack.Screen name="Reviews" component={ReviewsScreen} />
    </Stack.Navigator>
  );
}

function SearchStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="ApiTourSearch" component={ApiTourSearchScreen as ComponentType<any>} />
      <Stack.Screen name="ApiTourResults" component={ApiTourResultsScreen as ComponentType<any>} />
      <Stack.Screen name="ApiTourDetails" component={ApiTourDetailsScreen} />
      <Stack.Screen name="TourBooking" component={TourBookingScreen as ComponentType<any>} />
      <Stack.Screen name="ApiHotTours" component={ApiHotToursScreen} />
      <Stack.Screen name="ToursMap" component={ToursMapScreen as ComponentType<any>} />
      <Stack.Screen name="ApiHotelSearch" component={ApiHotelSearchScreen as ComponentType<any>} />
      <Stack.Screen name="PopularHotels" component={PopularHotelsScreen as ComponentType<any>} />
      <Stack.Screen name="ApiHotelDetails" component={ApiHotelDetailsScreen as ComponentType<any>} />
      <Stack.Screen name="HotelBooking" component={HotelBookingFormScreen as ComponentType<any>} />
      <Stack.Screen name="Countries" component={TourvisorCountriesScreen} />
      <Stack.Screen name="CountryDetail" component={CountryDetailScreen as ComponentType<any>} />
      <Stack.Screen name="CountryInfo" component={CountryInfoScreen as ComponentType<any>} />
      <Stack.Screen name="Reviews" component={ReviewsScreen} />
    </Stack.Navigator>
  );
}

function FavoritesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <Stack.Screen name="FavoritesMain" component={FavoritesScreen} />
      <Stack.Screen name="ApiTourDetails" component={ApiTourDetailsScreen} />
      <Stack.Screen name="TourBooking" component={TourBookingScreen as ComponentType<any>} />
      <Stack.Screen name="ApiHotelDetails" component={ApiHotelDetailsScreen as ComponentType<any>} />
      <Stack.Screen name="HotelBooking" component={HotelBookingFormScreen as ComponentType<any>} />
      <Stack.Screen name="Reviews" component={ReviewsScreen} />
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
      <Stack.Screen name="About" component={AboutScreen} />
    </Stack.Navigator>
  );
}

// Основной таб навигатор — 5 вкладок как на концепте
function MainTabNavigator() {
  const { language } = useAppContext();
  void language;
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
        options={{ title: i18n.t('nav.home') }}
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
        name="Search"
        component={SearchStack}
        options={{ title: i18n.t('nav.search') }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesStack}
        options={{ title: i18n.t('nav.favorites') }}
      />
      <Tab.Screen
        name="Bookings"
        component={BookingsStack}
        options={{ title: i18n.t('nav.bookings') }}
      />
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
