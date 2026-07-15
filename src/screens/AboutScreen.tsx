import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import AppLogo from '../components/AppLogo';
import { PrimaryButton } from '../components/ui';
import { radius, shadows, spacing, typography, surfaces } from '../config/designSystem';
import {
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL,
  SUPPORT_WEBSITE_URL,
  openSupportChat,
} from '../config/support';

export default function AboutScreen({ navigation }: any) {
  const { theme, isDark } = useAppContext();
  const appVersion = Constants.expoConfig?.version || '1.0.1';

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(i18n.t('common.error'), i18n.t('about.linkError'));
    }
  };

  const contacts: Array<{
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    onPress: () => void;
  }> = [
    {
      id: 'email',
      icon: 'mail-outline',
      label: i18n.t('about.email'),
      value: SUPPORT_EMAIL,
      onPress: () => openLink(SUPPORT_MAILTO),
    },
    {
      id: 'phone',
      icon: 'call-outline',
      label: i18n.t('about.phone'),
      value: SUPPORT_PHONE_DISPLAY,
      onPress: () => openLink(SUPPORT_PHONE_TEL),
    },
    {
      id: 'website',
      icon: 'globe-outline',
      label: i18n.t('about.website'),
      value: SUPPORT_WEBSITE_URL.replace(/^https?:\/\//, ''),
      onPress: () => openLink(SUPPORT_WEBSITE_URL),
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {i18n.t('about.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '30' }]}>
          <View style={[styles.logoWrap, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
            <AppLogo size={72} bordered borderColor={theme.primary} backgroundColor={theme.surface} />
          </View>
          <Text style={[styles.heroAppName, { color: theme.text }]}>TravelHub</Text>
          <Text style={[styles.heroTagline, { color: theme.secondaryText }]}>{i18n.t('about.tagline')}</Text>
          <Text style={[styles.heroVersion, { color: theme.tertiaryText }]}>v{appVersion}</Text>
        </View>

        {/* Description */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.paragraph, { color: theme.text }]}>{i18n.t('about.description')}</Text>
        </View>

        {/* Contacts */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{i18n.t('about.contactsTitle')}</Text>
          {contacts.map((c, index) => (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.contactRow,
                { borderBottomColor: theme.border, borderBottomWidth: index === contacts.length - 1 ? 0 : StyleSheet.hairlineWidth },
              ]}
              onPress={c.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.contactIcon, { backgroundColor: theme.primary + '15' }]}>
                <Ionicons name={c.icon} size={20} color={theme.primary} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactLabel, { color: theme.secondaryText }]}>{c.label}</Text>
                <Text style={[styles.contactValue, { color: theme.text }]}>{c.value}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.tertiaryText} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Support */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{i18n.t('about.supportTitle')}</Text>
          <Text style={[styles.paragraph, { color: theme.secondaryText }]}>{i18n.t('about.supportDesc')}</Text>
          <PrimaryButton
            title={i18n.t('about.openChat')}
            onPress={() => openSupportChat(Linking.openURL)}
            iconLeft={<Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.surface} />}
            style={styles.chatButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  hero: {
    borderRadius: surfaces.cardRadius,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  heroAppName: {
    ...typography.h1,
    marginBottom: 2,
  },
  heroTagline: {
    ...typography.caption,
    marginBottom: 6,
  },
  heroVersion: {
    ...typography.small,
  },
  card: {
    borderRadius: surfaces.cardRadius,
    borderWidth: 1,
    padding: surfaces.cardPadding,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  paragraph: {
    ...typography.body,
    marginBottom: 0,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    ...typography.small,
    marginBottom: 2,
  },
  contactValue: {
    ...typography.bodyBold,
  },
  chatButton: {
    marginTop: spacing.md,
  },
});
