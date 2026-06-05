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
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY } from '../config/support';

interface LegalDocumentScreenProps {
  navigation: any;
  route: {
    params: {
      type: 'privacy' | 'terms';
    };
  };
}

const PRIVACY_POLICY_TEXT = `# Политика конфиденциальности TravelHub

**Последнее обновление:** 2 мая 2026

## 1. Введение

TravelHub ("мы", "наш", "приложение") уважает вашу конфиденциальность и обязуется защищать ваши личные данные. Эта политика объясняет, как мы собираем, используем и защищаем вашу информацию при использовании нашего мобильного приложения.

## 2. Собираемая информация

### 2.1 Информация, которую вы предоставляете:
- Имя и контактная информация (email, телефон)
- Паспортные данные (для бронирования туров)
- Предпочтения и настройки приложения

### 2.2 Автоматически собираемая информация:
- Данные об использовании приложения
- Информация об устройстве (тип устройства, операционная система)
- Логи и данные об ошибках (для улучшения работы приложения)
- Местоположение (только с вашего разрешения)

**Важно:** Оплата туров и отелей осуществляется через сервисы TravelHub: приложение передаёт данные о платеже на наш защищённый сервер, после чего платёжная форма открывается во внешнем браузере. Обработку платежей выполняют лицензированные платёжные системы (Яндекс.Касса, Альфа-Банк, Сбербанк, Split и др.). Реквизиты карты в приложение не вводятся и не хранятся.

## 3. Как мы используем вашу информацию

Мы используем собранную информацию для:
- Предоставления и улучшения наших услуг
- Передачи данных партнёрам (Tourvisor API) для поиска и бронирования туров
- Связи с вами по поводу ваших бронирований
- Отправки уведомлений о специальных предложениях (с вашего согласия)
- Улучшения пользовательского опыта
- Обеспечения безопасности и предотвращения мошенничества

## 4. Хранение данных

Ваши данные хранятся на защищённых серверах Firebase (Google Cloud Platform) и обрабатываются в соответствии с применимым законодательством. Мы храним ваши данные только в течение времени, необходимого для предоставления услуг.

## 5. Передача данных третьим лицам

Мы можем передавать ваши данные следующим категориям получателей:
- **Провайдеры туристических данных** (Tourvisor API) — для поиска и отображения туров и отелей
- **Платёжные системы** (Яндекс.Касса, Альфа-Банк, Сбербанк, Split и др.) — для проведения оплаты по вашему запросу (данные передаются только при оформлении платежа)
- **Провайдеры облачных услуг** (Firebase/Google) — для хранения данных
- **Правовые органы** — при требовании по закону

Мы не продаём ваши личные данные третьим лицам.

## 6. Ваши права

Вы имеете право:
- Получить доступ к вашим личным данным
- Исправить неточные данные
- Удалить ваши данные
- Отозвать согласие на обработку данных
- Ограничить обработку ваших данных
- Получить копию ваших данных в структурированном формате

Для осуществления этих прав свяжитесь с нами: **${SUPPORT_EMAIL}**, тел. **${SUPPORT_PHONE_DISPLAY}**

## 7. Безопасность

Мы применяем современные меры безопасности:
- Шифрование данных при передаче (HTTPS/TLS)
- Шифрование данных на серверах
- Ограниченный доступ к данным только для авторизованного персонала
- Регулярные проверки безопасности

## 8. Cookies и отслеживание

Наше приложение может использовать технологии отслеживания для анализа использования, улучшения функциональности и персонализации контента. Вы можете отключить отслеживание в настройках приложения.

## 9. Дети

Приложение не предназначено для лиц младше 18 лет. Мы сознательно не собираем данные от детей младше 18 лет.

## 10. Изменения в политике

Мы можем периодически обновлять эту политику. О существенных изменениях мы уведомим вас через приложение или по email.

## 11. Контакты

По вопросам политики конфиденциальности: **${SUPPORT_EMAIL}**, тел. **${SUPPORT_PHONE_DISPLAY}**

## 12. Согласие

Используя приложение, вы соглашаетесь с этой политикой конфиденциальности.

**Примечание:** Политика соответствует требованиям GDPR (ЕС), CCPA (Калифорния) и другим применимым законам о защите данных.`;

const TERMS_OF_SERVICE_TEXT = `# Условия использования TravelHub

**Последнее обновление:** 2 мая 2026

## 1. Принятие условий

Используя приложение TravelHub ("Приложение"), вы соглашаетесь соблюдать настоящие Условия использования ("Условия"). Если вы не согласны с ними, пожалуйста, не используйте Приложение.

## 2. Описание сервиса

TravelHub — мобильное приложение-агрегатор для поиска, бронирования и управления туристическими услугами (туры и отели). Приложение выступает посредником между пользователями и поставщиками туристических услуг.

## 3. Регистрация и учётная запись

### 3.1 Требования к учётной записи:
- Вы должны быть не моложе 18 лет для создания учётной записи
- Вы обязаны предоставить точную и актуальную информацию
- Вы несёте ответственность за безопасность своей учётной записи

### 3.2 Запрещено:
- Создавать несколько учётных записей
- Передавать свою учётную запись третьим лицам
- Использовать учётную запись в незаконных целях

## 4. Бронирование и оплата

### 4.1 Бронирование:
- Бронирование туров и отелей создаётся в сервисе TravelHub (данные хранятся в защищённом облаке). Данные о турах и отелях поступают от партнёра Tourvisor (поиск и каталог).
- Все бронирования подлежат подтверждению. TravelHub выступает оператором сервиса бронирования и оплаты.

### 4.2 Оплата:
- **Важно:** Оплата производится через сервисы TravelHub: приложение отправляет запрос на создание платежа на наш сервер, после чего вы переходите к оплате во внешнем браузере через одну из платёжных систем (Яндекс.Касса, Альфа-Банк, Сбербанк, Split). Реквизиты карты в приложении не вводятся и не хранятся.
- Цены могут изменяться без предварительного уведомления.
- Возврат средств регулируется правилами выбранной платёжной системы и нашей политикой возвратов.

### 4.3 Отмена и возврат:
- Условия отмены и возврата определяются поставщиком услуг
- TravelHub не несёт ответственности за политику отмены поставщиков
- Вопросы по возврату средств следует направлять поставщику услуг

## 5. Ограничение ответственности

### 5.1 Мы не гарантируем:
- Точность информации о турах и отелях (информация предоставляется поставщиками)
- Доступность услуг в любое время
- Отсутствие ошибок или сбоев в работе приложения
- Доступность услуг у поставщиков

### 5.2 Мы не несём ответственности за:
- Действия поставщиков туристических услуг
- Изменения в расписании или отмену туров поставщиками
- Ущерб в результате использования приложения
- Потерю данных или несанкционированный доступ
- Качество предоставляемых туристических услуг
- Действия платёжных систем при проведении платежа (в рамках их правил)

## 6. Интеллектуальная собственность

Все материалы в Приложении, включая дизайн, текст, графику, логотипы и программное обеспечение, являются собственностью TravelHub или наших лицензиаров и защищены законами об интеллектуальной собственности.

## 7. Запрещённое использование

Запрещается:
- Использовать Приложение в незаконных целях
- Взламывать или пытаться взломать Приложение
- Распространять вирусы или вредоносное ПО
- Копировать или воспроизводить материалы Приложения без разрешения
- Использовать автоматизированные системы для доступа к Приложению

## 8. Прекращение использования

Мы оставляем за собой право:
- Приостановить или прекратить доступ к Приложению в любое время
- Удалить учётные записи, нарушающие эти Условия
- Изменить или прекратить работу Приложения без предварительного уведомления

## 9. Изменения в Условиях

Мы можем периодически обновлять эти Условия. Продолжение использования Приложения после изменений означает ваше согласие с новыми условиями.

## 10. Применимое право

Настоящие Условия регулируются законодательством Российской Федерации. Споры подлежат разрешению в судах Российской Федерации.

## 11. Контакты

По вопросам, связанным с этими Условиями: **${SUPPORT_EMAIL}**, тел. **${SUPPORT_PHONE_DISPLAY}**

## 12. Разное

### 12.1 Полнота соглашения:
Эти Условия составляют полное соглашение между вами и TravelHub относительно использования Приложения.

### 12.2 Разделимость:
Если какое-либо положение признано недействительным, остальные положения остаются в силе.

### 12.3 Отказ от прав:
Наша неспособность обеспечить соблюдение какого-либо права не означает отказ от этого права.

Используя TravelHub, вы подтверждаете, что прочитали, поняли и согласны с этими Условиями использования.`;

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

  const lastUpdated = '2 мая 2026';
  const HeaderIcon = isPrivacy ? 'shield-checkmark' : 'document-text';
  const extra = Constants.expoConfig?.extra as { websiteBaseUrl?: string; paymentPageUrl?: string } | undefined;
  const siteBase = (extra?.websiteBaseUrl || extra?.paymentPageUrl || 'https://travelhub63.ru').replace(/\/$/, '');
  const webUrl = isPrivacy ? `${siteBase}/privacy.html` : `${siteBase}/terms.html`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

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
    flexGrow: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  hero: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroAppName: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroDocTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  heroUpdated: {
    fontSize: 12,
  },
  contentCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    marginBottom: 16,
  },
  docTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 28,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionAccent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  sectionSmall: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 10,
  },
  listRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 4,
  },
  listBullet: {
    fontSize: 16,
    marginRight: 8,
    fontWeight: '600',
    lineHeight: 24,
  },
  listText: {
    fontSize: 15,
    lineHeight: 24,
    flex: 1,
  },
  webLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  webLinkLabel: {
    fontSize: 14,
    flex: 1,
  },
  webLinkAction: {
    fontSize: 14,
    fontWeight: '600',
  },
});
