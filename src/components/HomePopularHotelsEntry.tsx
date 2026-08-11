/**
 * Быстрый вход на главной в витрину «Популярные отели».
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND, radius, shadows, spacing } from '../config/designSystem';

type Props = {
  navigation: any;
};

export default function HomePopularHotelsEntry({ navigation }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => navigation.navigate('PopularHotels')}
      style={[styles.wrap, shadows.card]}
    >
      <LinearGradient
        colors={['#10102E', '#1A4B8C', '#0066CC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.grad}
      >
        <View style={styles.iconBox}>
          <Ionicons name="bed" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eyebrow}>НОВОЕ · ОТЕЛИ С ЦЕНАМИ</Text>
          <Text style={styles.title}>Сначала отель — сразу туры</Text>
          <Text style={styles.sub} numberOfLines={2}>
            Только отели с турами. Тап — и цены уже на экране.
          </Text>
        </View>
        <View style={[styles.cta, { backgroundColor: BRAND.orange }]}>
          <Text style={styles.ctaText}>Открыть</Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  grad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  sub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    flexShrink: 0,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
