/**
 * «Куда хотите поехать» — хаб направлений (не просто Search tab).
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { dictionaryService } from '../services/DictionaryService';
import { getTravelIdeas, nearDepartureWindow } from '../config/travelIdeas';
import { pickHomeDestinationCountries } from '../config/homeDestinations';
import { savePreferredDepartureId } from '../services/IdeaCollectionService';
import type { Country } from '../types/tourvisor';
import { radius, spacing, typography, shadows } from '../config/designSystem';
import CachedImage from './ui/CachedImage';
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { navigateTab } from '../utils/navHelpers';

type Props = {
  visible: boolean;
  navigation: any;
  onClose: () => void;
  departureId?: number;
};


export default function DestinationPickerSheet({
  visible,
  navigation,
  onClose,
  departureId = 1,
}: Props) {
  const { theme, currency } = useAppContext();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: windowHeight } = useWindowDimensions();
  const ideaW = Math.round(Math.min(140, Math.max(112, screenWidth * 0.3)));
  const ideaH = Math.round(ideaW * 0.72);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const ideas = getTravelIdeas();
  const windowDates = nearDepartureWindow();

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await dictionaryService.getCountries(departureId);
        if (cancelled) return;
        setCountries(pickHomeDestinationCountries(list));
      } catch {
        if (!cancelled) setCountries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, departureId]);

  const openCountry = (country: Country) => {
    void savePreferredDepartureId(departureId);
    onClose();
    navigation.navigate('ApiTourResults', {
      searchId: -1,
      searchParams: {
        departureId,
        countryId: country.id,
        adults: 2,
        childs: [],
        currency: currency || 'RUB',
        onlyCharter: false,
        ...windowDates,
      },
      useCache: false,
      runSearch: true,
      collectionTitle: country.name,
    });
  };

  const openIdea = (ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;
    const depId = idea.searchPrefill.departureId || departureId;
    void savePreferredDepartureId(depId);
    onClose();
    navigation.navigate('ApiTourResults', {
      searchId: -1,
      searchParams: {
        adults: 2,
        childs: [],
        currency: currency || 'RUB',
        onlyCharter: false,
        ...windowDates,
        ...idea.searchPrefill,
        departureId: depId,
      },
      useCache: false,
      runSearch: true,
      collectionTitle: i18n.t(idea.titleKey),
      ideaId: idea.id,
    });
  };

  const openWizard = () => {
    onClose();
    navigateTab(navigation, 'Search');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              paddingBottom: Math.max(insets.bottom, 12),
              maxHeight: windowHeight * 0.88,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{i18n.t('home.searchWant')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
            <Text style={[styles.section, { color: theme.secondaryText }]}>
              {i18n.t('home.travelIdeas')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ideaRow}>
              {ideas.map((idea) => (
                <TouchableOpacity
                  key={idea.id}
                  style={[styles.ideaCard, shadows.card, { width: ideaW }]}
                  onPress={() => openIdea(idea.id)}
                  activeOpacity={0.9}
                >
                  <View style={[styles.ideaImgWrap, { width: ideaW, height: ideaH, borderRadius: radius.lg }]}>
                    <CachedImage
                      source={{ uri: idea.image }}
                      fallbackUri={DEFAULT_HOTEL_IMAGE}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(18,18,46,0.55)']}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                  <Text style={[styles.ideaTitle, { color: theme.text }]} numberOfLines={2}>
                    {i18n.t(idea.titleKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.section, { color: theme.secondaryText }]}>
              {i18n.t('search.selectCountry')}
            </Text>
            {loading ? (
              <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
            ) : countries.length === 0 ? (
              <Text style={{ color: theme.secondaryText, textAlign: 'center', paddingVertical: 16 }}>
                Нет направлений для этого города вылета
              </Text>
            ) : (
              countries.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.countryRow, { borderBottomColor: theme.border }]}
                  onPress={() => openCountry(c)}
                >
                  <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{c.name}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity
              style={[styles.wizardBtn, { backgroundColor: theme.secondaryBackground }]}
              onPress={openWizard}
            >
              <Ionicons name="options-outline" size={18} color={theme.primary} />
              <Text style={{ color: theme.primary, fontWeight: '700', marginLeft: 8 }}>
                {i18n.t('search.title')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18,18,46,0.45)',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    width: '100%',
    zIndex: 2,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { ...typography.h3, fontWeight: '700' },
  section: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ideaRow: { gap: 10, paddingBottom: 4 },
  ideaCard: {},
  ideaImgWrap: {
    overflow: 'hidden',
    marginBottom: 6,
    backgroundColor: '#1a1a2e',
  },
  ideaTitle: { fontSize: 13, fontWeight: '700' },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
});
