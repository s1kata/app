/**
 * Полноэкранный загрузчик поиска туров (как на сайте Travel Hub).
 * Показывает процент, сообщение и подпись во время поиска.
 * На этапе «Почти готово» (85%+) внизу каждые 2 секунды сменяются фразы.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, useWindowDimensions } from 'react-native';
import { i18n } from '../config/i18n';

/** Ключи фраз для этапа «Почти готово» — показываются внизу по очереди каждые 2 сек */
const ALMOST_READY_PHRASE_KEYS = [
  'search.hotelFindingBest',
  'search.findingOffers',
  'search.hotelPickingHotels',
  'search.hotelSelectingForYou',
  'search.hotelCheckingPrices',
  'search.bestOptions',
  'search.checkingHotels',
] as const;

const ROTATE_INTERVAL_MS = 2000;

export interface TourSearchLoaderProps {
  visible: boolean;
  percent: number;
  message: string;
  subMessage?: string;
}

const messagesByPercent = (p: number): string => {
  if (p >= 100) return i18n.t('search.done');
  if (p >= 85) return i18n.t('search.almostReady');
  if (p >= 50) return i18n.t('search.bestOptions');
  if (p >= 25) return i18n.t('search.checkingHotels');
  if (p >= 1) return i18n.t('search.searchingTours');
  return i18n.t('search.preparing');
};

export default function TourSearchLoader({
  visible,
  percent,
  message,
  subMessage = i18n.t('search.findingOffers'),
}: TourSearchLoaderProps) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [rotatingPhraseIndex, setRotatingPhraseIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // На этапе «Почти готово» (85%+) крутим фразы внизу каждые 2 секунды
  useEffect(() => {
    if (!visible || percent < 85 || percent >= 100) return;
    const id = setInterval(() => {
      setRotatingPhraseIndex((prev) => (prev + 1) % ALMOST_READY_PHRASE_KEYS.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [visible, percent]);

  if (!visible) return null;

  const displayMessage = message || messagesByPercent(percent);
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  const isAlmostReady = percent >= 85 && percent < 100;
  const displaySubMessage = isAlmostReady
    ? i18n.t(ALMOST_READY_PHRASE_KEYS[rotatingPhraseIndex % ALMOST_READY_PHRASE_KEYS.length])
    : subMessage;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.box,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.ringContainer}>
            <Text style={styles.percentText}>{pct}%</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
            </View>
          </View>
          <Text style={[styles.msg, percent >= 100 && styles.msgDone]}>{displayMessage}</Text>
          <Text style={styles.subMsg}>{displaySubMessage}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: 'rgba(30, 41, 59, 0.98)',
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 32,
    maxWidth: 340,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 163, 255, 0.2)',
  },
  ringContainer: {
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  percentText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(59, 163, 255, 0.15)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#3ba3ff',
  },
  msg: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 6,
    textAlign: 'center',
  },
  msgDone: {
    color: '#34d399',
    fontWeight: '600',
  },
  subMsg: {
    fontSize: 13,
    color: '#64748b',
  },
});
