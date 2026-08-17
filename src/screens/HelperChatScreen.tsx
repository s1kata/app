import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import {
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL,
} from '../config/support';
import { ScreenHeader } from '../components/ui';
import { radius, shadows, spacing, touchTargets, typography } from '../config/designSystem';
import { i18n } from '../config/i18n';
import {
  fetchSupportChatGreeting,
  sendSupportChatMessage,
} from '../services/SupportChatService';

type ChatRole = 'user' | 'bot';

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const DEFAULT_MENU = [
  'Подобрать тур',
  'Горящие туры',
  'Бронирование',
  'Оплата',
  'Документы и виза',
  'Отмена и возврат',
  'Статус заявки',
  'Контакты',
  'Связаться с менеджером',
];

const faqData: FAQItem[] = [
  {
    id: '1',
    question: 'Как подобрать и забронировать тур?',
    answer:
      'Нажмите «Подобрать тур» — бот спросит куда, даты, туристов и бюджет кнопками, затем передаст менеджеру. Или найдите тур сами: Поиск / Горящие → «Забронировать».',
  },
  {
    id: '2',
    question: 'Как оплатить?',
    answer:
      'Онлайн картой через Т-Кассу на защищённой странице банка или в офисе. Рассрочка — если доступна у туроператора. Статус смотрите в «Бронирования».',
  },
  {
    id: '3',
    question: 'Отмена и возврат',
    answer:
      'Условия зависят от туроператора и срока до вылета. Нажмите «Отмена и возврат» или «Связаться с менеджером» — подскажем варианты.',
  },
  {
    id: '4',
    question: 'Документы и виза',
    answer:
      'Обычно нужны загранпаспорта всех туристов. По визе и страховке — кнопка «Документы и виза» в чате.',
  },
  {
    id: '5',
    question: 'Связаться с менеджером',
    answer: `Телефон: ${SUPPORT_PHONE_DISPLAY}, email: ${SUPPORT_EMAIL}. Офис: Самара, Московское шоссе, 81Б. Или кнопка «Связаться с менеджером» — примерно 9:00–21:00 (МСК).`,
  },
];

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function HelperChatScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { theme, isDark } = useAppContext();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>(DEFAULT_MENU);
  const [handoff, setHandoff] = useState(false);
  const [sending, setSending] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<Set<string>>(new Set());

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const appendBot = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId('bot'), role: 'bot', text }]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSending(true);
      try {
        const res = await fetchSupportChatGreeting();
        if (cancelled) return;
        if (res.success && res.reply) {
          appendBot(res.reply);
          setQuickReplies(
            res.quickReplies?.length ? res.quickReplies : DEFAULT_MENU,
          );
          setHandoff(!!res.handoff);
        } else {
          appendBot(i18n.t('chat.greetingLocal'));
          setQuickReplies(DEFAULT_MENU);
        }
      } catch {
        if (!cancelled) {
          appendBot(i18n.t('chat.greetingLocal'));
          setQuickReplies(DEFAULT_MENU);
        }
      } finally {
        if (!cancelled) setSending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appendBot]);

  useEffect(() => {
    scrollToEnd();
  }, [messages, quickReplies, handoff, faqOpen, scrollToEnd]);

  const sendText = useCallback(
    async (raw: string) => {
      const text = String(raw || '').trim();
      if (!text || sending) return;

      setQuickReplies([]);
      setMessages((prev) => [...prev, { id: nextId('user'), role: 'user', text }]);
      setSending(true);

      try {
        const res = await sendSupportChatMessage(text);
        if (res.success && res.reply) {
          appendBot(res.reply);
          setQuickReplies(
            res.quickReplies?.length ? res.quickReplies : DEFAULT_MENU,
          );
          setHandoff(!!res.handoff);
        } else {
          appendBot(i18n.t('chat.error'));
          setQuickReplies(res.quickReplies?.length ? res.quickReplies : DEFAULT_MENU);
          if (res.handoff) setHandoff(true);
        }
      } catch {
        appendBot(i18n.t('chat.error'));
        setQuickReplies(DEFAULT_MENU);
      } finally {
        setSending(false);
      }
    },
    [appendBot, sending],
  );

  const openUrl = useCallback(async (url: string, failMessage: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(i18n.t('common.error'), failMessage);
    }
  }, []);

  const toggleFaqItem = (id: string) => {
    setExpandedFaq((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chips = quickReplies.length > 0 ? quickReplies : DEFAULT_MENU;

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <ScreenHeader title={i18n.t('chat.title')} onBack={() => navigation.goBack()} />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <View
              key={msg.id}
              style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}
            >
              <View
                style={[
                  styles.bubble,
                  isUser
                    ? { backgroundColor: theme.primary }
                    : {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        borderWidth: 1,
                        ...shadows.card,
                      },
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    { color: isUser ? '#FFFFFF' : theme.text },
                  ]}
                >
                  {msg.text}
                </Text>
              </View>
            </View>
          );
        })}

        {sending && (
          <View style={[styles.bubbleRow, styles.bubbleRowBot]}>
            <View
              style={[
                styles.bubble,
                styles.typingBubble,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          </View>
        )}

        {!sending && (
          <View style={styles.chipsWrap}>
            {chips.map((label) => (
              <TouchableOpacity
                key={label}
                style={[
                  styles.chip,
                  { borderColor: theme.primary, backgroundColor: theme.primary + '14' },
                ]}
                onPress={() => sendText(label)}
                activeOpacity={0.75}
                disabled={sending}
              >
                <Text style={[styles.chipText, { color: theme.primary }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {handoff && (
          <View
            style={[
              styles.handoffCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.handoffTitle, { color: theme.text }]}>
              {i18n.t('chat.manager')}
            </Text>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: theme.secondary || theme.primary }]}
              onPress={() => openUrl(SUPPORT_PHONE_TEL, i18n.t('chat.error'))}
              activeOpacity={0.8}
            >
              <Ionicons name="call-outline" size={18} color="#FFFFFF" />
              <Text style={styles.contactBtnText}>{SUPPORT_PHONE_DISPLAY}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: theme.accent || theme.primary }]}
              onPress={() => openUrl(SUPPORT_MAILTO, i18n.t('chat.error'))}
              activeOpacity={0.8}
            >
              <Ionicons name="mail-outline" size={18} color="#FFFFFF" />
              <Text style={styles.contactBtnText}>{SUPPORT_EMAIL}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.faqToggle}
          onPress={() => setFaqOpen((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={[styles.faqToggleText, { color: theme.primary }]}>
            {i18n.t('chat.faq')}
          </Text>
          <Ionicons
            name={faqOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.primary}
          />
        </TouchableOpacity>

        {faqOpen &&
          faqData.map((item) => {
            const open = expandedFaq.has(item.id);
            return (
              <View
                key={item.id}
                style={[
                  styles.faqItem,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.faqHeader}
                  onPress={() => toggleFaqItem(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.faqQuestion, { color: theme.text }]} numberOfLines={2}>
                    {item.question}
                  </Text>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.secondaryText}
                  />
                </TouchableOpacity>
                {open && (
                  <Text style={[styles.faqAnswer, { color: theme.secondaryText }]}>
                    {item.answer}
                  </Text>
                )}
              </View>
            );
          })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  bubbleRow: {
    marginBottom: spacing.sm,
    maxWidth: '86%',
  },
  bubbleRowUser: {
    alignSelf: 'flex-end',
  },
  bubbleRowBot: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleText: {
    ...typography.body,
  },
  typingBubble: {
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minWidth: 52,
    alignItems: 'center',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
    marginTop: spacing.xxs,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipText: {
    ...typography.captionBold,
  },
  handoffCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  handoffTitle: {
    ...typography.h3,
    marginBottom: spacing.xxs,
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    minHeight: touchTargets.buttonSmall,
  },
  contactBtnText: {
    color: '#FFFFFF',
    ...typography.bodyBold,
  },
  faqToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  faqToggleText: {
    ...typography.captionBold,
  },
  faqItem: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    minHeight: touchTargets.buttonSmall,
  },
  faqQuestion: {
    flex: 1,
    ...typography.captionBold,
  },
  faqAnswer: {
    ...typography.caption,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
