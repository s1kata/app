import React, { useRef, useState } from 'react';
import { View, Platform, Alert, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './src/components/ErrorBoundary';
import { AppProvider } from './src/contexts/AppContext';
import AppNavigator from './src/navigation/AppNavigator';
import LocationPermissionModal from './src/components/LocationPermissionModal';
import NetworkStatusBanner from './src/components/NetworkStatusBanner';
import PaymentStatusBanner from './src/components/PaymentStatusBanner';
import PaymentSuccessHost from './src/components/ux/PaymentSuccessHost';
import AgeGateModal from './src/components/ux/AgeGateModal';
import ConsentModal from './src/components/ux/ConsentModal';
import { notificationService } from './src/services/NotificationService';
import { messageService } from './src/services/MessageService';
import { launchGateService } from './src/services/LaunchGateService';
import { setAuthNavigationRef } from './src/auth/authNavigation';
import { locationService, LocationData } from './src/services/LocationService';
import { useAppInit } from './src/hooks/useAppInit';
import { useOtaUpdates } from './src/hooks/useOtaUpdates';
import { usePaymentDeepLinks } from './src/hooks/usePaymentDeepLinks';
import { logger } from './src/utils/logger';
import { logNavigationStateChange } from './src/utils/navigationLogger';
import { useLifecycleLog } from './src/hooks/useLifecycleLog';
import * as WebBrowser from 'expo-web-browser';
import { i18n } from './src/config/i18n';
import { LEGAL_SITE_URL } from './src/config/legalContent';
import { TERMS_URL } from './src/config/support';

export default function App() {
  useLifecycleLog('App');
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const { hasCheckedPermission, markPermissionChecked } = useAppInit();
  useOtaUpdates();
  const appMountedRef = useRef(true);
  const [gatesReady, setGatesReady] = useState(false);
  const [ageGateAccepted, setAgeGateAccepted] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showAgeGate, setShowAgeGate] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

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

      // Геолокация — опциональна. Не блокируем приложение, не показываем модалку
      // повторно, если пользователь уже отказался.
      if (!hasAsked && permissionStatus !== 'granted') {
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
    if (!gatesReady || !ageGateAccepted || !consentAccepted) {
      return () => {
        appMountedRef.current = false;
      };
    }
    void checkLocationPermission();
    return () => {
      appMountedRef.current = false;
    };
  }, [checkLocationPermission, gatesReady, ageGateAccepted, consentAccepted]);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const state = await launchGateService.getGateState();
      if (!active) return;
      setAgeGateAccepted(state.ageGateAccepted);
      setConsentAccepted(state.consentAccepted);
      setShowAgeGate(!state.ageGateAccepted);
      setShowConsent(state.ageGateAccepted && !state.consentAccepted);
      setGatesReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

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

  const handleLocationSkip = () => {
    // Пользователь решил не делиться местоположением — продолжаем работу приложения.
    setShowLocationModal(false);
  };

  const handleAgeGateConfirm = async () => {
    await launchGateService.acceptAgeGate();
    setAgeGateAccepted(true);
    setShowAgeGate(false);
    if (!consentAccepted) {
      setShowConsent(true);
    }
  };

  const handleAgeGateDecline = () => {
    Alert.alert(i18n.t('ageGate.declineTitle'), i18n.t('ageGate.declineBody'));
  };

  const handleConsentAccept = async () => {
    await launchGateService.acceptConsent();
    setConsentAccepted(true);
    setShowConsent(false);
  };

  const openExternal = React.useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      logger.warn('Failed to open link:', error);
    }
  }, []);
  const onNavigationReady = () => {
    if (navigationRef.current) {
      notificationService.setNavigationRef(navigationRef);
      messageService.setNavigationRef(navigationRef);
      setAuthNavigationRef(navigationRef);
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
              <PaymentSuccessHost />
              <NetworkStatusBanner />
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
              <AgeGateModal
                visible={showAgeGate}
                onConfirm={handleAgeGateConfirm}
                onDecline={handleAgeGateDecline}
              />
              <ConsentModal
                visible={showConsent}
                onAccept={handleConsentAccept}
                onOpenPrivacy={() => openExternal(`${LEGAL_SITE_URL.replace(/\/+$/, '')}/privacy.html`)}
                onOpenTerms={() => openExternal(TERMS_URL)}
              />
              {hasCheckedPermission && ageGateAccepted && consentAccepted && (
                <LocationPermissionModal
                  visible={showLocationModal}
                  onConfirm={handleLocationConfirm}
                  onLocationIncorrect={handleLocationIncorrect}
                  onSkip={handleLocationSkip}
                />
              )}
            </AppProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
