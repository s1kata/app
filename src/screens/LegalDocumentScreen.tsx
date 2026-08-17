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
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAppContext } from '../contexts/AppContext';
import {
  LEGAL_LAST_UPDATED,
  PRIVACY_POLICY_TEXT,
  TERMS_OF_SERVICE_TEXT,
} from '../config/legalContent';
import { ScreenHeader } from '../components/ui';
import { radius, shadows, spacing, typography } from '../config/designSystem';

interface LegalDocumentScreenProps {
  navigation: any;
  route: {
    params: {
      type: 'privacy' | 'terms';
    };
  };
}

type SectionType = 'title' | 'subtitle' | 'subtitleSmall' | 'text' | 'list';

function parseContent(text: string): Array<{ type: SectionType; content: string }> {
  const lines = text.split('\n');
  const sections: Array<{ type: SectionType; content: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed === '---') continue;

    if (trimmed.startsWith('### ')) {
      sections.push({ type: 'subtitleSmall', content: trimmed.replace(/^###\s+/, '') });
    } else if (trimmed.startsWith('## ')) {
      sections.push({ type: 'subtitle', content: trimmed.replace(/^##\s+/, '') });
    } else if (trimmed.startsWith('# ')) {
      sections.push({ type: 'title', content: trimmed.replace(/^#\s+/, '') });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      sections.push({ type: 'list', content: trimmed.replace(/^[-•]\s+/, '').replace(/\*\*/g, '') });
    } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      sections.push({ type: 'text', content: trimmed.replace(/\*\*/g, '').trim() });
    } else if (trimmed.length > 0) {
      sections.push({ type: 'text', content: trimmed.replace(/\*\*/g, '') });
    }
  }
  return sections;
}

export default function LegalDocumentScreen({ navigation, route }: LegalDocumentScreenProps) {
  const { theme } = useAppContext();
  const { type } = route.params;

  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? 'Политика конфиденциальности' : 'Условия использования';
  const content = isPrivacy ? PRIVACY_POLICY_TEXT : TERMS_OF_SERVICE_TEXT;
  const parsedContent = parseContent(content);

  const lastUpdated = LEGAL_LAST_UPDATED;
  const HeaderIcon = isPrivacy ? 'shield-checkmark' : 'document-text';
  const extra = Constants.expoConfig?.extra as { websiteBaseUrl?: string; paymentPageUrl?: string } | undefined;
  const siteBase = (extra?.websiteBaseUrl || extra?.paymentPageUrl || 'https://travelhub63.ru').replace(/\/$/, '');
  const webUrl = isPrivacy ? `${siteBase}/privacy.html` : `${siteBase}/terms.html`;

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Hero block */}
        <View style={[styles.hero, { backgroundColor: theme.primary + '22', borderColor: theme.primary + '30' }]}>
          <View style={[styles.heroIconWrap, { backgroundColor: theme.primary + '25' }]}>
            <Ionicons name={HeaderIcon as any} size={36} color={theme.primary} />
          </View>
          <Text style={[styles.heroAppName, { color: theme.secondaryText }]}>TravelHub</Text>
          <Text style={[styles.heroDocTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.heroUpdated, { color: theme.secondaryText }]}>
            Обновлено: {lastUpdated}
          </Text>
        </View>

        {/* Content card */}
        <View style={[styles.contentCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {parsedContent.map((section, index) => {
            if (section.type === 'title') {
              return (
                <Text key={index} style={[styles.docTitle, { color: theme.text }]}>
                  {section.content}
                </Text>
              );
            }
            if (section.type === 'subtitle') {
              return (
                <View key={index} style={styles.sectionRow}>
                  <View style={[styles.sectionAccent, { backgroundColor: theme.primary }]} />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.content}</Text>
                </View>
              );
            }
            if (section.type === 'subtitleSmall') {
              return (
                <Text key={index} style={[styles.sectionSmall, { color: theme.text }]}>
                  {section.content}
                </Text>
              );
            }
            if (section.type === 'list') {
              return (
                <View key={index} style={styles.listRow}>
                  <Text style={[styles.listBullet, { color: theme.primary }]}>•</Text>
                  <Text style={[styles.listText, { color: theme.text }]}>{section.content}</Text>
                </View>
              );
            }
            return (
              <Text key={index} style={[styles.paragraph, { color: theme.text }]}>
                {section.content}
              </Text>
            );
          })}
        </View>

        {/* Open in browser */}
        <TouchableOpacity
          style={[styles.webLinkCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() =>
            Linking.openURL(webUrl).catch(() => {
              Alert.alert('Ошибка', 'Не удалось открыть ссылку. Проверьте подключение к интернету.');
            })
          }
          activeOpacity={0.8}
        >
          <Ionicons name="globe-outline" size={22} color={theme.primary} />
          <Text style={[styles.webLinkLabel, { color: theme.secondaryText }]}>
            Документ также доступен на сайте
          </Text>
          <Text style={[styles.webLinkAction, { color: theme.primary }]}>Открыть в браузере</Text>
          <Ionicons name="open-outline" size={18} color={theme.primary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flexGrow: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroAppName: {
    ...typography.smallBold,
    letterSpacing: 0.5,
    marginBottom: spacing.xxs,
  },
  heroDocTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.xxs,
  },
  heroUpdated: {
    ...typography.small,
  },
  contentCard: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  docTitle: {
    ...typography.h2,
    marginBottom: spacing.md,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionAccent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    flex: 1,
  },
  sectionSmall: {
    ...typography.bodyBold,
    marginTop: spacing.sm,
    marginBottom: spacing.xxs,
  },
  paragraph: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    marginBottom: spacing.xxs,
    paddingLeft: spacing.xxs,
  },
  listBullet: {
    ...typography.bodyBold,
    marginRight: spacing.xs,
    lineHeight: 24,
  },
  listText: {
    ...typography.body,
    flex: 1,
  },
  webLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    minHeight: 56,
    ...shadows.card,
  },
  webLinkLabel: {
    ...typography.caption,
    flex: 1,
  },
  webLinkAction: {
    ...typography.captionBold,
  },
});
