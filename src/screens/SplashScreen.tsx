/**
 * Splash Screen: премиальный минимализм, парящие формы, плавные анимации.
 * Цвета: глубокий синий #0A1A2F, акцент #FF6B35. Работает до готовности контекста.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Image,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NativeSplash from 'expo-splash-screen';
import { useAppContext } from '../contexts/AppContext';
import { BRAND } from '../config/designSystem';
import { logger } from '../utils/logger';
import { useLifecycleLog } from '../hooks/useLifecycleLog';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';

// Фиксированная палитра сплэша (не зависим от темы при первом кадре)
const SPLASH_BG = BRAND.blue;           // синий фон — travel-стиль
const SPLASH_TEXT = BRAND.white;
const SPLASH_SUB = 'rgba(255,255,255,0.85)';
const SPLASH_ACCENT = BRAND.orange;     // оранжевый акцент на синем фоне
const SHAPE_COLOR = 'rgba(255,255,255,0.12)';

export default function SplashScreen({ navigation }: { navigation: any }) {
  const { isAuthenticated, authReady } = useAppContext();
  useLifecycleLog('SplashScreen', { label: 'auth', deps: [authReady, isAuthenticated] });
  const mountTime = useRef(Date.now()).current;
  const hasNavigated = useRef(false);

  const { width: W, height: H } = useWindowDimensions();
  const styles = useMemo(() => getStyles(W, H), [W, H]);

  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(20)).current;
  const subOpacity = useRef(new Animated.Value(0)).current;
  const shape1Op = useRef(new Animated.Value(0)).current;
  const shape2Op = useRef(new Animated.Value(0)).current;
  const shape3Op = useRef(new Animated.Value(0)).current;
  const waveOp = useRef(new Animated.Value(0)).current;
  const shape1Y = useRef(new Animated.Value(0)).current;
  const shape2Y = useRef(new Animated.Value(0)).current;
  const shape3Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    let navTimer: ReturnType<typeof setTimeout> | undefined;
    let hideSplashTimer: ReturnType<typeof setTimeout> | undefined;

    const easing = Easing.out(Easing.cubic);

    // 1) Декоративные круги и волна — появление
    Animated.stagger(100, [
      Animated.timing(shape1Op, { toValue: 0.4, duration: 500, easing, useNativeDriver: true }),
      Animated.timing(shape2Op, { toValue: 0.3, duration: 500, easing, useNativeDriver: true }),
      Animated.timing(shape3Op, { toValue: 0.25, duration: 500, easing, useNativeDriver: true }),
      Animated.timing(waveOp, { toValue: 0.2, duration: 550, easing, useNativeDriver: true }),
    ]).start();

    // 2) Параллакс кругов (старт через 400 мс)
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(shape1Y, { toValue: -6, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(shape2Y, { toValue: -4, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(shape3Y, { toValue: -5, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(shape1Y, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(shape2Y, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(shape3Y, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    Animated.sequence([Animated.delay(400)]).start(() => {
      if (alive) floatLoop.start();
    });

    // 3) Лого: масштаб и появление
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 450, delay: 200, easing, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, delay: 200, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();

    // 4) Заголовок: появление снизу
    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 400, delay: 500, easing, useNativeDriver: true }),
      Animated.timing(titleY, { toValue: 0, duration: 400, delay: 500, easing, useNativeDriver: true }),
    ]).start();

    // 5) Подзаголовок
    Animated.timing(subOpacity, { toValue: 1, duration: 350, delay: 750, easing, useNativeDriver: true }).start();

    const doNavigate = () => {
      if (!alive || hasNavigated.current) return;
      hasNavigated.current = true;
      const target = isAuthenticated ? 'MainTabs' : 'Login';
      logIosTestStep(IosTestStep.LAUNCH, { authReady, isAuthenticated, target });
      logger.info('[Splash] navigate', { target, isAuthenticated });
      if (isAuthenticated) {
        navigation.replace('MainTabs');
      } else {
        navigation.replace('Login');
      }
      hideSplashTimer = setTimeout(() => NativeSplash.hideAsync().catch(() => {}), 200);
    };

    // Не навигируем, пока authReady (Firebase восстановит сессию из AsyncStorage)
    if (authReady) {
      const minDelay = 1500;
      const elapsed = Date.now() - mountTime;
      const waitMs = Math.max(0, minDelay - elapsed);
      navTimer = setTimeout(doNavigate, waitMs);
    }

    return () => {
      alive = false;
      floatLoop.stop();
      if (navTimer) clearTimeout(navTimer);
      if (hideSplashTimer) clearTimeout(hideSplashTimer);
    };
  }, [isAuthenticated, authReady, navigation, mountTime]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: SPLASH_BG }]}>
      <StatusBar style="light" />
      {/* Декоративные круги (горы/острова) */}
      <Animated.View
        style={[
          styles.shape,
          styles.shape1,
          { backgroundColor: SHAPE_COLOR, opacity: shape1Op, transform: [{ translateY: shape1Y }] },
        ]}
      />
      <Animated.View
        style={[
          styles.shape,
          styles.shape2,
          { backgroundColor: SHAPE_COLOR, opacity: shape2Op, transform: [{ translateY: shape2Y }] },
        ]}
      />
      <Animated.View
        style={[
          styles.shape,
          styles.shape3,
          { backgroundColor: SHAPE_COLOR, opacity: shape3Op, transform: [{ translateY: shape3Y }] },
        ]}
      />
      {/* Волна внизу */}
      <Animated.View
        style={[
          styles.wave,
          { borderColor: SHAPE_COLOR, opacity: waveOp },
        ]}
      />
      {/* Лого */}
      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <View style={[styles.logoCircle, { borderColor: SPLASH_ACCENT }]}>
          <Image
            source={require('../../assets/icons/1024x1024.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>
      </Animated.View>
      {/* Заголовок */}
      <Animated.View
        style={[
          styles.titleWrap,
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleY }],
          },
        ]}
      >
        <Text style={[styles.title, { color: SPLASH_TEXT }]}>TravelHub</Text>
      </Animated.View>
      <Animated.View style={[styles.subtitleWrap, { opacity: subOpacity }]}>
        <Text style={[styles.subtitle, { color: SPLASH_SUB }]}>Откройте мир путешествий</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const getStyles = (W: number, H: number) => {
  const CENTER_Y = H / 2;
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  shape: {
    position: 'absolute',
    borderRadius: 999,
  },
  shape1: {
    width: 140,
    height: 140,
    left: W * 0.1,
    bottom: H * 0.2,
  },
  shape2: {
    width: 100,
    height: 100,
    right: W * 0.15,
    bottom: H * 0.25,
  },
  shape3: {
    width: 70,
    height: 70,
    left: W * 0.45,
    bottom: H * 0.15,
  },
  wave: {
    position: 'absolute',
    width: W * 1.4,
    height: W * 0.7,
    borderRadius: (W * 1.4) / 2,
    borderWidth: 2,
    bottom: -W * 0.35,
    left: -W * 0.2,
  },
  logoWrap: {
    position: 'absolute',
    top: CENTER_Y - 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  titleWrap: {
    position: 'absolute',
    top: CENTER_Y - 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitleWrap: {
    position: 'absolute',
    top: CENTER_Y + 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  });
};
