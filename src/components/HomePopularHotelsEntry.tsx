/**
 * Карусель на главной: отели / горящие / идеи / VIP — не один фейковый слайд.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, shadows, spacing, typography } from '../config/designSystem';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { getTravelIdeas } from '../config/travelIdeas';
import { navigateTab } from '../utils/navHelpers';

type Props = {
  navigation: any;
};

type Slide = {
  id: string;
  title: string;
  sub: string;
  cta: string;
  image: string;
  onPress: () => void;
};

export default function HomePopularHotelsEntry({ navigation }: Props) {
  const { language, theme } = useAppContext();
  void language;
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - spacing.lg * 2, 420);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const ideas = getTravelIdeas();
  const seaIdea = ideas.find((i) => i.id === 'sea_ai') || ideas[0];

  const slides: Slide[] = [
    {
      id: 'hotels',
      title: i18n.t('home.hotelsBannerTitle'),
      sub: i18n.t('home.hotelsBannerSub'),
      cta: i18n.t('home.hotelsBannerCta'),
      image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=70',
      onPress: () => navigation.navigate('PopularHotels'),
    },
    {
      id: 'hot',
      title: i18n.t('home.hotToursTitle'),
      sub: i18n.t('home.hotDealsTitle'),
      cta: i18n.t('home.hotDealsAll'),
      image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=70',
      onPress: () => navigation.navigate('ApiHotTours'),
    },
    {
      id: 'idea',
      title: seaIdea ? i18n.t(seaIdea.titleKey) : i18n.t('home.travelIdeas'),
      sub: seaIdea ? i18n.t(seaIdea.subtitleKey) : '',
      cta: i18n.t('home.hotelsBannerCta'),
      image: seaIdea?.image || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=70',
      onPress: () => {
        if (!seaIdea) {
          navigateTab(navigation, 'Search');
          return;
        }
        navigation.navigate('ApiTourResults', {
          searchId: -1,
          searchParams: {
            adults: 2,
            childs: [],
            currency: 'RUB',
            onlyCharter: false,
            nightsFrom: 7,
            nightsTo: 11,
            ...seaIdea.searchPrefill,
          },
          useCache: true,
          runSearch: true,
          collectionTitle: i18n.t(seaIdea.titleKey),
          ideaId: seaIdea.id,
        });
      },
    },
    {
      id: 'search',
      title: i18n.t('home.searchWant'),
      sub: i18n.t('search.title'),
      cta: i18n.t('search.title'),
      image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=70',
      onPress: () => navigateTab(navigation, 'Search'),
    },
  ];

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / (cardWidth + spacing.sm));
      if (i !== index && i >= 0 && i < slides.length) setIndex(i);
    },
    [cardWidth, index, slides.length],
  );

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled={false}
        snapToInterval={cardWidth + spacing.sm}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 0 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={item.onPress}
            style={[styles.card, shadows.cardRaised, { width: cardWidth, marginRight: spacing.sm }]}
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <ImageBackground source={{ uri: item.image }} style={styles.bg} imageStyle={styles.bgImg}>
              <LinearGradient
                colors={['rgba(18,18,46,0.28)', 'rgba(18,18,46,0.78)']}
                style={styles.grad}
              >
                <Text style={styles.title}>{item.title}</Text>
                {item.sub ? <Text style={styles.sub}>{item.sub}</Text> : null}
                <View style={styles.actions}>
                  <View style={styles.cta}>
                    <Text style={styles.ctaText}>{item.cta}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </View>
                </View>
              </LinearGradient>
            </ImageBackground>
          </TouchableOpacity>
        )}
      />
      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View
            key={s.id}
            style={[
              styles.dot,
              i === index && styles.dotActive,
              i === index && { backgroundColor: theme.primary },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  card: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    height: 168,
  },
  bg: { flex: 1 },
  bgImg: { borderRadius: radius.xxl },
  grad: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: '#fff',
    marginBottom: 4,
  },
  sub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    marginBottom: 12,
  },
  actions: { flexDirection: 'row' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(18,18,46,0.2)',
  },
  dotActive: {
    width: 16,
    borderRadius: 3,
  },
});
