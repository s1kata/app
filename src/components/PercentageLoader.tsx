import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useAppContext } from '../contexts/AppContext';

interface PercentageLoaderProps {
  visible: boolean;
  onComplete?: () => void;
  /** Внешний прогресс 0-100. При 100 вызывается onComplete */
  progress?: number;
}

export default function PercentageLoader({
  visible,
  onComplete,
  progress: externalProgress,
}: PercentageLoaderProps) {
  const { theme } = useAppContext();
  const { width } = useWindowDimensions();
  const BAR_WIDTH = width * 0.6;
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const [displayPercent, setDisplayPercent] = React.useState(0);

  useEffect(() => {
    if (!visible) return;

    opacity.setValue(0);
    scale.setValue(0.9);
    animatedProgress.setValue(0);
    setDisplayPercent(0);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
    ]).start();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const toValue = typeof externalProgress === 'number' ? Math.min(100, externalProgress) : 100;
    const listener = animatedProgress.addListener(({ value }) => {
      setDisplayPercent(Math.round(value));
    });

    const duration = typeof externalProgress === 'number' ? 180 : 1200;

    Animated.timing(animatedProgress, {
      toValue,
      duration,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start(({ finished }) => {
      if (finished && toValue >= 100 && onComplete) {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.05,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start(() => onComplete());
      }
    });

    return () => {
      animatedProgress.removeListener(listener);
    };
  }, [visible, externalProgress]);

  if (!visible) return null;

  const barWidth = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [0, BAR_WIDTH],
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => {}}>
      <Animated.View
        style={[
          styles.overlay,
          {
            backgroundColor: `${theme.background}EE`,
            opacity,
          },
        ]}
      >
        <Animated.View style={[styles.content, { transform: [{ scale }] }]}>
          <Text style={[styles.percentText, { color: theme.primary }]}>{displayPercent}%</Text>
          <View
            style={[
              styles.barContainer,
              { width: BAR_WIDTH, backgroundColor: theme.secondaryBackground },
            ]}
          >
            <Animated.View
              style={[
                styles.barFill,
                {
                  width: barWidth,
                  backgroundColor: theme.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.label, { color: theme.text }]}>Загрузка...</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 40,
    minWidth: 260,
  },
  percentText: {
    fontSize: 48,
    fontWeight: '800',
    marginBottom: 20,
  },
  barContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  label: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
});
