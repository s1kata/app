import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ImageBackground, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NativeSplash from 'expo-splash-screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../contexts/AppContext';
import { logger } from '../utils/logger';
import { useLifecycleLog } from '../hooks/useLifecycleLog';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import { i18n } from '../config/i18n';
import { isPaymentRelinkInProgress } from '../services/PaymentRelinkState';
import { BRAND, spacing, typography } from '../config/designSystem';

/** Full-bleed sunset resort (концепт 01) — Unsplash, без локального ассета */
const SPLASH_BG =
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1400&q=80';

export default function SplashScreen({ navigation }: { navigation: any }) {
  const { authReady, loginAsGuest, user } = useAppContext();
  const insets = useSafeAreaInsets();
  useLifecycleLog('SplashScreen', { label: 'auth', deps: [authReady] });

  const mountTime = useRef(Date.now()).current;
  const hasNavigated = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;
  const logoScale = useRef(new Animated.Value(0.86)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const lineScale = useRef(new Animated.Value(0.2)).current;
  const yearOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    let hideSplashTimer: ReturnType<typeof setTimeout> | undefined;
    let navTimer: ReturnType<typeof setTimeout> | undefined;

    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 48,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(titleOpacity, {
      toValue: 1,
      duration: 320,
      delay: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.timing(lineScale, {
      toValue: 1,
      duration: 420,
      delay: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.timing(subtitleOpacity, {
      toValue: 1,
      duration: 300,
      delay: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.timing(yearOpacity, {
      toValue: 1,
      duration: 360,
      delay: 640,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const doNavigate = async () => {
      if (!alive || hasNavigated.current) return;
      if (!authReady) {
        navTimer = setTimeout(() => {
          void doNavigate();
        }, 100);
        return;
      }
      if (isPaymentRelinkInProgress()) {
        logger.info('[Splash] payment relink lock active, postpone navigation');
        navTimer = setTimeout(() => {
          void doNavigate();
        }, 250);
        return;
      }
      hasNavigated.current = true;
      const currentUser = userRef.current;
      const startedAsGuest = !currentUser;
      try {
        if (!currentUser) {
          await loginAsGuest();
        }
      } catch (e) {
        logger.warn('[Splash] auto guest failed, continuing to MainTabs:', e);
      }
      const target = 'MainTabs';
      logIosTestStep(IosTestStep.LAUNCH, {
        isAuthenticated: true,
        target,
        guestAuto: startedAsGuest,
      });
      logger.info('[Splash] navigate', { target, startedAsGuest, authReady });
      NativeSplash.hideAsync().catch(() => {});
      navigation.replace(target);
      hideSplashTimer = setTimeout(() => NativeSplash.hideAsync().catch(() => {}), 150);
    };

    const minDelay = 1300;
    const waitMs = Math.max(0, minDelay - (Date.now() - mountTime));
    navTimer = setTimeout(() => {
      void doNavigate();
    }, waitMs);
    const hardHideTimer = setTimeout(() => NativeSplash.hideAsync().catch(() => {}), 1000);

    return () => {
      alive = false;
      if (navTimer) clearTimeout(navTimer);
      if (hideSplashTimer) clearTimeout(hideSplashTimer);
      if (hardHideTimer) clearTimeout(hardHideTimer);
    };
  }, [
    authReady,
    loginAsGuest,
    navigation,
    mountTime,
    logoOpacity,
    logoScale,
    titleOpacity,
    subtitleOpacity,
    lineScale,
    yearOpacity,
  ]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ImageBackground source={{ uri: SPLASH_BG }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.scrim} />
      <Animated.View
        style={[
          styles.brandWrap,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <Animated.Text style={[styles.title, { opacity: titleOpacity }]}>TravelHub</Animated.Text>
        <Animated.View
          style={[
            styles.accentLine,
            { transform: [{ scaleX: lineScale }] },
          ]}
        />
        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
          {i18n.t('splash.subtitle')}
        </Animated.Text>
      </Animated.View>
      <Animated.Text
        style={[
          styles.year,
          { opacity: yearOpacity, bottom: Math.max(insets.bottom, spacing.lg) + spacing.sm },
        ]}
      >
        Туры и отели
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND.navy,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 18, 46, 0.52)',
  },
  brandWrap: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 2,
  },
  title: {
    color: BRAND.white,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -0.9,
  },
  accentLine: {
    marginTop: spacing.sm,
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: BRAND.blue,
  },
  subtitle: {
    marginTop: spacing.md,
    color: 'rgba(255,255,255,0.92)',
    ...typography.caption,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  year: {
    position: 'absolute',
    alignSelf: 'center',
    color: BRAND.orange,
    ...typography.captionBold,
    letterSpacing: 1.2,
    zIndex: 2,
  },
});
