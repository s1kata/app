import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
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

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const faqData: FAQItem[] = [
  {
    id: '1',
    category: 'Бронирование',
    question: 'Как забронировать тур?',
    answer: 'Для бронирования тура необходимо войти в аккаунт. Выберите понравившийся тур, нажмите "Забронировать" и заполните форму с вашими данными. После подтверждения вы получите уведомление о статусе бронирования.',
  },
  {
    id: '2',
    category: 'Бронирование',
    question: 'Можно ли забронировать тур без регистрации?',
    answer: 'Нет, для бронирования туров необходимо войти в систему или зарегистрироваться. Это необходимо для обеспечения безопасности ваших данных и бронирований.',
  },
  {
    id: '3',
    category: 'Оплата',
    question: 'Какие способы оплаты доступны?',
    answer: 'Оплата туров производится через защищённый сервер travelhub63.ru и банк Тинькофф. Карточные данные вводятся только на странице банка, не в приложении.',
  },
  {
    id: '4',
    category: 'Оплата',
    question: 'Когда нужно оплачивать тур?',
    answer: 'Оплата тура производится после подтверждения бронирования. Вам будет отправлено уведомление с инструкциями по оплате. Обычно оплата требуется в течение 24-48 часов после подтверждения.',
  },
  {
    id: '5',
    category: 'Отмена и возврат',
    question: 'Можно ли отменить бронирование?',
    answer: 'Да, вы можете отменить бронирование в разделе "Мои бронирования". Условия возврата средств зависят от политики туроператора и времени до вылета. Подробности уточняйте у службы поддержки.',
  },
  {
    id: '6',
    category: 'Отмена и возврат',
    question: 'Как вернуть деньги за отмененный тур?',
    answer: 'Возврат средств производится на ту же карту, с которой была произведена оплата. Срок возврата составляет от 5 до 14 рабочих дней в зависимости от банка.',
  },
  {
    id: '7',
    category: 'Документы',
    question: 'Какие документы нужны для бронирования?',
    answer: 'Для бронирования международных туров необходимы паспортные данные: серия и номер паспорта, кем выдан, дата выдачи. Эти данные можно заполнить в разделе "Личные данные" в профиле.',
  },
  {
    id: '8',
    category: 'Документы',
    question: 'Нужен ли загранпаспорт для бронирования?',
    answer: 'Для бронирования тура загранпаспорт не обязателен, но он понадобится для выезда за границу. Убедитесь, что срок действия паспорта не истекает в течение 6 месяцев после возвращения из поездки.',
  },
  {
    id: '9',
    category: 'Уведомления',
    question: 'Как получать уведомления о снижении цен?',
    answer: 'Вы можете добавить понравившийся тур в избранное. Мы будем отслеживать изменения цен и отправлять вам уведомления при снижении цены более чем на 5%.',
  },
  {
    id: '10',
    category: 'Уведомления',
    question: 'Как настроить уведомления?',
    answer: 'Уведомления можно настроить в разделе "Настройки" в профиле. Вы можете включить или отключить различные типы уведомлений: горячие предложения, напоминания о поездках, акции и скидки.',
  },
  {
    id: '11',
    category: 'Техническая поддержка',
    question: 'Как связаться со службой поддержки?',
    answer: `Вы можете связаться с нами по email: ${SUPPORT_EMAIL} или по телефону: ${SUPPORT_PHONE_DISPLAY}. Мы работаем ежедневно с 9:00 до 21:00 по московскому времени.`,
  },
  {
    id: '12',
    category: 'Техническая поддержка',
    question: 'Что делать, если приложение не работает?',
    answer: 'Попробуйте перезапустить приложение или обновить его до последней версии. Если проблема сохраняется, обратитесь в службу поддержки, указав версию приложения и описание проблемы.',
  },
];

export default function HelperChatScreen({ navigation }: any) {
  const { theme, isDark } = useAppContext();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const categories = Array.from(new Set(faqData.map(item => item.category)));

  const filteredFAQ = selectedCategory
    ? faqData.filter(item => item.category === selectedCategory)
    : faqData;

  const toggleItem = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.card}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Помощь и поддержка</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        <TouchableOpacity
          style={[
            styles.categoryButton,
            {
              backgroundColor: selectedCategory === null ? theme.primary : theme.secondaryBackground,
            },
          ]}
          onPress={() => setSelectedCategory(null)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.categoryButtonText,
              { color: selectedCategory === null ? '#FFFFFF' : theme.text },
            ]}
          >
            Все
          </Text>
        </TouchableOpacity>
        {categories.map(category => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryButton,
              {
                backgroundColor:
                  selectedCategory === category ? theme.primary : theme.secondaryBackground,
              },
            ]}
            onPress={() => setSelectedCategory(category)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.categoryButtonText,
                { color: selectedCategory === category ? '#FFFFFF' : theme.text },
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* FAQ List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredFAQ.map(item => {
          const isExpanded = expandedItems.has(item.id);
          return (
            <View
              key={item.id}
              style={[styles.faqItem, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <TouchableOpacity
                style={styles.faqHeader}
                onPress={() => toggleItem(item.id)}
                activeOpacity={0.7}
              >
                <View style={styles.faqHeaderLeft}>
                  <Ionicons
                    name="help-circle-outline"
                    size={20}
                    color={theme.primary}
                    style={styles.faqIcon}
                  />
                  <Text style={[styles.faqQuestion, { color: theme.text }]} numberOfLines={2}>
                    {item.question}
                  </Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.secondaryText}
                />
              </TouchableOpacity>
              {isExpanded && (
                <View style={styles.faqAnswer}>
                  <Text style={[styles.faqAnswerText, { color: theme.secondaryText }]}>
                    {item.answer}
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Contact Section */}
        <View style={[styles.contactSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="chatbubbles-outline" size={32} color={theme.primary} />
          <Text style={[styles.contactTitle, { color: theme.text }]}>Нужна дополнительная помощь?</Text>
          <Text style={[styles.contactText, { color: theme.secondaryText }]}>
            Свяжитесь с нашей службой поддержки
          </Text>
          <View style={styles.contactButtons}>
            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                Linking.openURL(SUPPORT_MAILTO).catch(() => {
                  Alert.alert('Ошибка', 'Не удалось открыть почтовый клиент.');
                });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="mail-outline" size={20} color="#FFFFFF" />
              <Text style={styles.contactButtonText}>{SUPPORT_EMAIL}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactButton, { backgroundColor: theme.secondary }]}
              onPress={() => {
                Linking.openURL(SUPPORT_PHONE_TEL).catch(() => {
                  Alert.alert('Ошибка', 'Не удалось начать звонок.');
                });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="call-outline" size={20} color="#FFFFFF" />
              <Text style={styles.contactButtonText}>{SUPPORT_PHONE_DISPLAY}</Text>
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 40,
  },
  headerSpacer: {
    width: 40,
  },
  categoriesContainer: {
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  categoriesContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  scrollView: {
    flexGrow: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  faqItem: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  faqHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  faqIcon: {
    marginRight: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  faqAnswer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  faqAnswerText: {
    fontSize: 14,
    lineHeight: 20,
  },
  contactSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },
  contactText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
