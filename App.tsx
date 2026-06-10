import React, { useRef, useState } from 'react';
import { View, Platform, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './src/components/ErrorBoundary';
import { AppProvider } from './src/contexts/AppContext';
import AppNavigator from './src/navigation/AppNavigator';
import LocationPermissionModal from './src/components/LocationPermissionModal';
import PaymentStatusBanner from './src/components/PaymentStatusBanner';
import { notificationService } from './src/services/NotificationService';
import { messageService } from './src/services/MessageService';
import { locationService, LocationData } from './src/services/LocationService';
import { useAppInit } from './src/hooks/useAppInit';
import { usePaymentDeepLinks } from './src/hooks/usePaymentDeepLinks';
import { logger } from './src/utils/logger';
import { logNavigationStateChange } from './src/utils/navigationLogger';
import { useLifecycleLog } from './src/hooks/useLifecycleLog';
import * as WebBrowser from 'expo-web-browser';
import { useAppContext } from './src/contexts/AppContext';
import { i18n } from './src/config/i18n';
import { networkService } from './src/services/NetworkService';

function VpnBlockerOverlay() {
  const { theme, networkPolicy } = useAppContext();
  if (!networkPolicy.isBlocked) return null;

  return (
    <View pointerEvents="auto" style={styles.blockerRoot}>
      <View style={[styles.banner, { backgroundColor: '#D97706' }]}>
        <Text style={styles.bannerText}>{i18n.t('network.vpnBlockedBody')}</Text>
      </View>
      <View style={styles.backdrop}>
        <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{i18n.t('network.vpnBlockedTitle')}</Text>
          <Text style={[styles.modalBody, { color: theme.secondaryText }]}>
            {i18n.t('network.vpnBlockedBody')}
          </Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.primary }]}
            activeOpacity={0.8}
            onPress={() => {
              void networkService.checkConnection();
            }}
          >
            <Text style={styles.ctaText}>{i18n.t('network.retryCheck')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  useLifecycleLog('App');
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const { hasCheckedPermission, markPermissionChecked } = useAppInit();
  const appMountedRef = useRef(true);

  usePaymentDeepLinks(navigationRef);

  React.useEffect(() => {
    if (__DEV__) {
      logger.info('App mounted', { platform: Platform.OS, version: Platform.Version });
    }
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  const checkLocationPermission = React.useCallback(async () => {
    try {
      const hasAsked = await locationService.hasAskedPermission();
      const permissionStatus = await locationService.checkPermission();
      if (!appMountedRef.current) return;
      if (!hasAsked || permissionStatus === 'denied') {
        setShowLocationModal(true);
      }
      markPermissionChecked();
    } catch (error) {
      logger.error('Error checking location permission:', error);
      if (appMountedRef.current) {
        markPermissionChecked();
      }
    }
  }, [markPermissionChecked]);

  React.useEffect(() => {
    appMountedRef.current = true;
    void checkLocationPermission();
    return () => {
      appMountedRef.current = false;
    };
  }, [checkLocationPermission]);

  const handleLocationConfirm = async (location: LocationData) => {
    logger.log('Location confirmed:', location);
    setShowLocationModal(false);
    if (location.timezone) {
      logger.log('Timezone set:', location.timezone);
    }
  };

  const handleLocationIncorrect = async () => {
    try {
      const newLocation = await locationService.getCurrentLocation();
      if (newLocation) {
        setShowLocationModal(false);
      }
    } catch (error) {
      logger.error('Error getting new location:', error);
    }
  };

  const onNavigationReady = () => {
    if (navigationRef.current) {
      notificationService.setNavigationRef(navigationRef);
      messageService.setNavigationRef(navigationRef);
    }
  };

  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 5 * 60 * 1000 },
        },
      }),
  );

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AppProvider>
              <PaymentStatusBanner />
              <View style={{ flex: 1 }}>
                <NavigationContainer
                  ref={navigationRef}
                  onReady={() => {
                    onNavigationReady();
                    logger.navigation('NavigationContainer ready');
                  }}
                  onStateChange={(state) => logNavigationStateChange(state)}
                >
                  <AppNavigator />
                </NavigationContainer>
              </View>
              <VpnBlockerOverlay />
              {hasCheckedPermission && (
                <LocationPermissionModal
                  visible={showLocationModal}
                  onConfirm={handleLocationConfirm}
                  onLocationIncorrect={handleLocationIncorrect}
                />
              )}
            </AppProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  blockerRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  banner: {
    marginTop: 8,
    marginHorizontal: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  bannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 14,
    marginBottom: 14,
  },
  cta: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
