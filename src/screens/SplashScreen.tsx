/**
 * Splash Screen: VIP/Luxury стиль с тёмным градиентом и золотыми акцентами.
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
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '../contexts/AppContext';
import { logger } from '../utils/logger';
import { useLifecycleLog } from '../hooks/useLifecycleLog';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';

const VIP_BG_START = '#0a0a0f';
const VIP_BG_END = '#1a1a2e';
const VIP_GOLD = '#d4af37';
const VIP_GOLD_LIGHT = '#f4e4bc';
const SHAPE_FILL = 'rgba(255,255,255,0.03)';
const SHAPE_BORDER = 'rgba(212,175,55,0.10)';
const SUBTITLE_COLOR = 'rgba(244,228,188,0.72)';
const PARTICLE_COUNT = 4;

export default function SplashScreen({ navigation }: { navigation: any }) {
  const { isAuthenticated } = useAppContext();
  useLifecycleLog('SplashScreen', { label: 'auth', deps: [isAuthenticated] });
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
  const glowPulse = useRef(new Animated.Value(0.35)).current;

  const particleOpacity = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0)),
    [],
  );
  const particleY = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0)),
    [],
  );

  useEffect(() => {
    let alive = true;
    let navTimer: ReturnType<typeof setTimeout> | undefined;
    let hideSplashTimer: ReturnType<typeof setTimeout> | undefined;
    let hardHideTimer: ReturnType<typeof setTimeout> | undefined;

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

    // 6) Пульсация glow
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 0.62, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.32, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    glowLoop.start();

    // 7) Частицы на фоне
    const particleLoops = particleOpacity.map((op, i) => {
      const y = particleY[i];
      return Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(op, {
              toValue: 0.7,
              duration: 700 + i * 120,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(y, {
              toValue: -10 - i * 1.5,
              duration: 2200 + i * 220,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(op, {
              toValue: 0.2,
              duration: 900 + i * 100,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(y, {
              toValue: 0,
              duration: 2200 + i * 180,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
    });
    particleLoops.forEach((loop, i) => {
      setTimeout(() => {
        if (alive) loop.start();
      }, 120 * i);
    });

    const doNavigate = () => {
      if (!alive || hasNavigated.current) return;
      hasNavigated.current = true;
      const target = isAuthenticated ? 'MainTabs' : 'Login';
      logIosTestStep(IosTestStep.LAUNCH, { isAuthenticated, target });
      logger.info('[Splash] navigate', { target, isAuthenticated });
      // Fail-safe: сначала снимаем native splash, затем навигация.
      NativeSplash.hideAsync().catch(() => {});
      if (isAuthenticated) {
        navigation.replace('MainTabs');
      } else {
        navigation.replace('Login');
      }
      hideSplashTimer = setTimeout(() => NativeSplash.hideAsync().catch(() => {}), 200);
    };

    // Навигация после минимальной задержки без ожидания authReady.
    const minDelay = 1500;
    const elapsed = Date.now() - mountTime;
    const waitMs = Math.max(0, minDelay - elapsed);
    navTimer = setTimeout(doNavigate, waitMs);
    // Жёсткий таймер против "чёрного экрана", если навигация задержалась.
    hardHideTimer = setTimeout(() => {
      NativeSplash.hideAsync().catch(() => {});
    }, 1200);

    return () => {
      alive = false;
      floatLoop.stop();
      glowLoop.stop();
      particleLoops.forEach((loop) => loop.stop());
      if (navTimer) clearTimeout(navTimer);
      if (hideSplashTimer) clearTimeout(hideSplashTimer);
      if (hardHideTimer) clearTimeout(hardHideTimer);
    };
  }, [isAuthenticated, navigation, mountTime, glowPulse, particleOpacity, particleY, shape1Op, shape2Op, shape3Op, waveOp, logoOpacity, logoScale, titleOpacity, titleY, subOpacity, shape1Y, shape2Y, shape3Y]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[VIP_BG_START, VIP_BG_END]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {particleOpacity.map((op, i) => (
        <Animated.View
          key={`particle-${i}`}
          style={[
            styles.particle,
            {
              left: W * (0.12 + (i * 0.14)),
              top: H * (0.22 + ((i % 2) * 0.24)),
              opacity: op,
              transform: [{ translateY: particleY[i] }],
            },
          ]}
        />
      ))}

      {/* Декоративные круги (горы/острова) */}
      <Animated.View
        style={[
          styles.shape,
          styles.shape1,
          { opacity: shape1Op, transform: [{ translateY: shape1Y }] },
        ]}
      />
      <Animated.View
        style={[
          styles.shape,
          styles.shape2,
          { opacity: shape2Op, transform: [{ translateY: shape2Y }] },
        ]}
      />
      <Animated.View
        style={[
          styles.shape,
          styles.shape3,
          { opacity: shape3Op, transform: [{ translateY: shape3Y }] },
        ]}
      />
      {/* Волна внизу */}
      <Animated.View
        style={[
          styles.wave,
          { opacity: waveOp },
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
        <Animated.View style={[styles.logoGlow, { opacity: glowPulse }]} />
        <View style={styles.logoCircle}>
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
        <Text style={styles.title}>TravelHub</Text>
      </Animated.View>
      <Animated.View style={[styles.subtitleWrap, { opacity: subOpacity }]}>
        <Text style={styles.subtitle}>PREMIUM TRAVEL SERVICE</Text>
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
    backgroundColor: SHAPE_FILL,
    borderWidth: 1,
    borderColor: SHAPE_BORDER,
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
    width: 56,
    height: 56,
    left: W * 0.47,
    bottom: H * 0.16,
  },
  wave: {
    position: 'absolute',
    width: W * 1.4,
    height: W * 0.7,
    borderRadius: (W * 1.4) / 2,
    borderWidth: 2,
    borderColor: SHAPE_BORDER,
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
    borderColor: VIP_GOLD,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  logoGlow: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(212,175,55,0.15)',
    shadowColor: VIP_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 22,
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
    fontSize: 31,
    fontWeight: '300',
    letterSpacing: 3.2,
    color: VIP_GOLD_LIGHT,
  },
  subtitleWrap: {
    position: 'absolute',
    top: CENTER_Y + 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: SUBTITLE_COLOR,
  },
  particle: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 2,
    backgroundColor: VIP_GOLD_LIGHT,
    shadowColor: VIP_GOLD_LIGHT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  });
};
