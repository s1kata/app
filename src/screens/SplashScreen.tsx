import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NativeSplash from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '../contexts/AppContext';
import { logger } from '../utils/logger';
import { useLifecycleLog } from '../hooks/useLifecycleLog';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import AppLogo from '../components/AppLogo';
import { i18n } from '../config/i18n';
import { isPaymentRelinkInProgress } from '../services/PaymentRelinkState';

export default function SplashScreen({ navigation }: { navigation: any }) {
  const { isAuthenticated, theme, isDark } = useAppContext();
  useLifecycleLog('SplashScreen', { label: 'auth', deps: [isAuthenticated] });

  const mountTime = useRef(Date.now()).current;
  const hasNavigated = useRef(false);
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0.25)).current;

  const gradientColors = useMemo<readonly [string, string]>(() => {
    const [g1, g2] = theme.gradient.primary;
    return isDark ? [theme.background, g1] : [theme.background, g2];
  }, [isDark, theme]);

  useEffect(() => {
    let alive = true;
    let hideSplashTimer: ReturnType<typeof setTimeout> | undefined;
    let navTimer: ReturnType<typeof setTimeout> | undefined;
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(titleOpacity, {
      toValue: 1,
      duration: 300,
      delay: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.timing(subtitleOpacity, {
      toValue: 1,
      duration: 280,
      delay: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.55,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.2,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    glowLoop.start();

    const doNavigate = () => {
      if (!alive || hasNavigated.current) return;
      if (isPaymentRelinkInProgress()) {
        logger.info('[Splash] payment relink lock active, postpone navigation');
        navTimer = setTimeout(doNavigate, 250);
        return;
      }
      hasNavigated.current = true;
      const target = isAuthenticated ? 'MainTabs' : 'Login';
      logIosTestStep(IosTestStep.LAUNCH, { isAuthenticated, target });
      logger.info('[Splash] navigate', { target, isAuthenticated });
      NativeSplash.hideAsync().catch(() => {});
      navigation.replace(target);
      hideSplashTimer = setTimeout(() => NativeSplash.hideAsync().catch(() => {}), 150);
    };

    const minDelay = 1300;
    const waitMs = Math.max(0, minDelay - (Date.now() - mountTime));
    navTimer = setTimeout(doNavigate, waitMs);
    const hardHideTimer = setTimeout(() => NativeSplash.hideAsync().catch(() => {}), 1000);

    return () => {
      alive = false;
      glowLoop.stop();
      if (navTimer) clearTimeout(navTimer);
      if (hideSplashTimer) clearTimeout(hideSplashTimer);
      if (hardHideTimer) clearTimeout(hardHideTimer);
    };
  }, [
    isAuthenticated,
    navigation,
    mountTime,
    logoOpacity,
    logoScale,
    titleOpacity,
    subtitleOpacity,
    glowOpacity,
  ]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.glow, { opacity: glowOpacity, backgroundColor: theme.primary }]} />
      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <AppLogo size={100} shape="rounded" bordered borderColor={theme.primary} backgroundColor={theme.surface} />
      </Animated.View>
      <Animated.Text style={[styles.title, { color: theme.text, opacity: titleOpacity }]}>
        TravelHub
      </Animated.Text>
      <Animated.Text style={[styles.subtitle, { color: theme.secondaryText, opacity: subtitleOpacity }]}>
        {i18n.t('splash.subtitle')}
      </Animated.Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: '38%',
    shadowColor: '#0066CC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 14,
  },
  logoWrap: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
