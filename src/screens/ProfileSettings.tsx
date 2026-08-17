import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useAppContext } from '../contexts/AppContext';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { notificationService } from '../services/NotificationService';
import { i18n } from '../config/i18n';
import { RELEASE_HIDE_NEXT_PATCH_UI } from '../config/releaseUiFlags';
import { logger } from '../utils/logger';
import { Ionicons, MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { BRAND, radius, shadows, spacing, typography } from '../config/designSystem';
import { ScreenHeader } from '../components/ui';
import { safeGoBack, getRootNavigation } from '../utils/navHelpers';

const ProfileSettings: React.FC =({ navigation }: any) => {
  const {
    theme,
    themeMode,
    isDark,
    currency,
    language,
    updateCounter,
    setThemeMode,
    setCurrency,
    setLanguage,
    refreshTheme,
    logout,
    loginAsGuest,
    user,
  } = useAppContext();

  const [notificationSettings, setNotificationSettings] = useState({
    enabled: true,
    hotDeals: true,
    bookingReminders: true,
    promotions: true,
    dailyHotTours: true,
    favoritePriceAlerts: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    maxNotificationsPerDay: 5,
    geolocationEnabled: false,
  });

  // Модальные окна
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const settingsScreenMounted = useRef(true);

  // Загрузка настроек уведомлений
  useEffect(() => {
    settingsScreenMounted.current = true;
    let cancelled = false;
    const run = async () => {
      try {
        const settings = await notificationService.getSettings();
        if (cancelled || !settingsScreenMounted.current) return;
        // В сервисе поля `quietHoursStart/End` и некоторые лимиты могут быть опциональными.
        // Для состояния экрана используем безопасные дефолты, чтобы избежать `undefined`.
        setNotificationSettings({
          ...settings,
          dailyHotTours: settings.dailyHotTours ?? true,
          favoritePriceAlerts: settings.favoritePriceAlerts ?? true,
          quietHoursStart: settings.quietHoursStart ?? '22:00',
          quietHoursEnd: settings.quietHoursEnd ?? '08:00',
          maxNotificationsPerDay: settings.maxNotificationsPerDay ?? 5,
          geolocationEnabled: settings.geolocationEnabled ?? false,
        });
      } catch (error) {
        if (__DEV__) {
          logger.error('Error loading notification settings:', error);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      settingsScreenMounted.current = false;
    };
  }, []);

  const loadNotificationSettings = async () => {
    try {
      const settings = await notificationService.getSettings();
      if (!settingsScreenMounted.current) return;
      // В сервисе поля `quietHoursStart/End` и некоторые лимиты могут быть опциональными.
      // Для состояния экрана используем безопасные дефолты, чтобы избежать `undefined`.
      setNotificationSettings({
        ...settings,
        dailyHotTours: settings.dailyHotTours ?? true,
        quietHoursStart: settings.quietHoursStart ?? '22:00',
        quietHoursEnd: settings.quietHoursEnd ?? '08:00',
        maxNotificationsPerDay: settings.maxNotificationsPerDay ?? 5,
        geolocationEnabled: settings.geolocationEnabled ?? false,
      });
    } catch (error) {
      // Ошибка логируется, но не показывается пользователю
      if (__DEV__) {
        logger.error('Error loading notification settings:', error);
      }
    }
  };

  const updateNotificationSetting = async (key: keyof typeof notificationSettings, value: boolean) => {
    const updatedSettings = { ...notificationSettings, [key]: value };
    setNotificationSettings(updatedSettings);
    await notificationService.updateSettings({ [key]: value });
  };

  // Для отладки
  useEffect(() => {
    if (__DEV__) {
      logger.debug('ProfileSettings themeMode:', themeMode);
    }
  }, [themeMode, theme]);

  const handleCurrencyChange = async (newCurrency: 'RUB' | 'USD' | 'EUR') => {
    await setCurrency(newCurrency);
    setCurrencyModalVisible(false);
    Alert.alert(i18n.t('settings.currencyChanged'), `${i18n.t('settings.currencyNow')} ${newCurrency}`);
  };

  const handleLanguageChange = async (newLanguage: 'ru' | 'en') => {
    await setLanguage(newLanguage);
    setLanguageModalVisible(false);
    Alert.alert(i18n.t('settings.languageChanged'), newLanguage === 'ru' ? i18n.t('lang.ru') : i18n.t('lang.en'));
  };

  const handleLogout = () => {
    Alert.alert(
      i18n.t('auth.logout'),
      i18n.t('settings.logoutConfirm'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('auth.logout'),
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              await loginAsGuest();
              getRootNavigation(navigation).reset({ index: 0, routes: [{ name: 'MainTabs' }] });
            } catch (e) {
              Alert.alert(i18n.t('common.error'), i18n.t('common.error'));
            }
          },
        },
      ]
    );
  };

  const enterGuestBrowseMode = async () => {
    await logout();
    await loginAsGuest();
    getRootNavigation(navigation).reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      i18n.t('settings.deleteAccount'),
      i18n.t('settings.deleteAccountConfirm'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('settings.deleteButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
              if (isGuest) {
                await enterGuestBrowseMode();
                return;
              }
              const { AuthService } = await import('../services/AuthService');
              const result = await AuthService.deleteAccount(user!.uid);
              if (result.success) {
                await enterGuestBrowseMode();
                Alert.alert(i18n.t('settings.accountDeletedTitle'), i18n.t('settings.accountDeletedBody'));
              } else {
                Alert.alert(i18n.t('common.error'), result.error || i18n.t('common.deleteFailed'));
              }
            } catch (e: any) {
              Alert.alert(i18n.t('common.error'), e?.message || i18n.t('common.deleteFailed'));
            }
          },
        },
      ]
    );
  };


  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]} key={updateCounter}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ScreenHeader title={i18n.t('settings.title')} onBack={() => safeGoBack(navigation)} noSafeTop />
        <Text style={[styles.brandMark, { color: theme.deep || theme.text }]}>TravelHub</Text>

        {/* Секция: Внешний вид */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('settings.appearance')}</Text>
          
          {/* Переключатель тем */}
          <View style={styles.themeSwitcherContainer}>
            <ThemeSwitcher />
          </View>

          {/* Выбор языка */}
          <TouchableOpacity
            style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => setLanguageModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="language" size={20} color={theme.primary} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>{i18n.t('settings.languageInterface')}</Text>
                <Text style={[styles.settingValue, { color: theme.secondaryText }]}>
                  {language === 'ru' ? i18n.t('lang.ru') : i18n.t('lang.en')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Секция: Валюта и цены */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('settings.currencyAndPrices')}</Text>
          
          <TouchableOpacity
            style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => setCurrencyModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                <FontAwesome name="money" size={18} color={theme.primary} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>{i18n.t('settings.currency')}</Text>
                <Text style={[styles.settingValue, { color: theme.secondaryText }]}>
                  {currency === 'RUB' ? i18n.t('settings.rub') : currency === 'USD' ? i18n.t('settings.usd') : i18n.t('settings.eur')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('settings.notifications')}</Text>

          <View style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="notifications" size={20} color={theme.primary} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>
                  {i18n.t('settings.dailyHotTours')}
                </Text>
                <Text style={[styles.settingValue, { color: theme.secondaryText }]}>
                  {i18n.t('settings.dailyHotToursDesc')}
                </Text>
              </View>
            </View>
            <Switch
              value={notificationSettings.dailyHotTours}
              onValueChange={(value) => updateNotificationSetting('dailyHotTours', value)}
              trackColor={{ false: theme.secondaryBackground, true: theme.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.secondaryBackground}
            />
          </View>
        </View>

        {!RELEASE_HIDE_NEXT_PATCH_UI && (
          <View style={styles.section}>
            <View style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                  <Ionicons name="pricetag" size={20} color={theme.primary} />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingTitle, { color: theme.text }]}>
                    {i18n.t('settings.favoritePriceAlerts')}
                  </Text>
                  <Text style={[styles.settingValue, { color: theme.secondaryText }]}>
                    {i18n.t('settings.favoritePriceAlertsDesc')}
                  </Text>
                </View>
              </View>
              <Switch
                value={notificationSettings.favoritePriceAlerts}
                onValueChange={(value) => updateNotificationSetting('favoritePriceAlerts', value)}
                trackColor={{ false: theme.secondaryBackground, true: theme.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={theme.secondaryBackground}
              />
            </View>

            <View style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                  <Ionicons name="calendar" size={20} color={theme.primary} />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingTitle, { color: theme.text }]}>{i18n.t('settings.tripReminders')}</Text>
                  <Text style={[styles.settingValue, { color: theme.secondaryText }]}>
                    {i18n.t('settings.tripRemindersDesc')}
                  </Text>
                </View>
              </View>
              <Switch
                value={notificationSettings.bookingReminders}
                onValueChange={(value) => updateNotificationSetting('bookingReminders', value)}
                trackColor={{ false: theme.secondaryBackground, true: theme.success }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={theme.secondaryBackground}
              />
            </View>

            <View style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                  <Ionicons name="megaphone" size={20} color={theme.primary} />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={[styles.settingTitle, { color: theme.text }]}>{i18n.t('settings.promotions')}</Text>
                  <Text style={[styles.settingValue, { color: theme.secondaryText }]}>
                    {i18n.t('settings.promotionsDesc')}
                  </Text>
                </View>
              </View>
              <Switch
                value={notificationSettings.promotions}
                onValueChange={(value) => updateNotificationSetting('promotions', value)}
                trackColor={{ false: theme.secondaryBackground, true: theme.warning }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={theme.secondaryBackground}
              />
            </View>
          </View>
        )}

        {/* Секция: О приложении */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('settings.aboutApp')}</Text>
          
          <TouchableOpacity
            style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="information-circle" size={20} color={theme.primary} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>{i18n.t('settings.appVersion')}</Text>
                <Text style={[styles.settingValue, { color: theme.secondaryText }]}>
                  {Constants.expoConfig?.version || '1.0.3'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
          </TouchableOpacity>

          {/* Privacy Policy */}
          <TouchableOpacity
            style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => {
              // Открыть Privacy Policy внутри приложения
              navigation.navigate('LegalDocument', { type: 'privacy' });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="shield-checkmark" size={20} color={theme.primary} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>{i18n.t('settings.privacyPolicy')}</Text>
                <Text style={[styles.settingValue, { color: theme.secondaryText }]}>{i18n.t('settings.read')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
          </TouchableOpacity>

          {/* Terms of Service */}
          <TouchableOpacity
            style={[styles.settingCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => {
              // Открыть Terms of Service внутри приложения
              navigation.navigate('LegalDocument', { type: 'terms' });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconGradient, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="document-text" size={20} color={theme.primary} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>{i18n.t('settings.termsOfUse')}</Text>
                <Text style={[styles.settingValue, { color: theme.secondaryText }]}>{i18n.t('settings.read')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Секция: Аккаунт */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('settings.account')}</Text>
          
          {/* Выйти — coral как на концепте */}
          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: 'transparent',
                borderColor: BRAND.orange,
                borderWidth: 1.5,
              },
            ]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconGradient, { backgroundColor: BRAND.orange + '18' }]}>
                <Ionicons name="log-out" size={20} color={BRAND.orange} />
              </View>
              <Text style={[styles.settingTitle, { color: BRAND.orange }]}>{i18n.t('settings.logout')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={BRAND.orange} />
          </TouchableOpacity>

          {/* Удалить аккаунт — заливка красная */}
          <TouchableOpacity
            style={[
              styles.settingCard,
              {
                backgroundColor: theme.error,
                borderColor: theme.error,
              },
            ]}
            onPress={handleDeleteAccount}
            activeOpacity={0.8}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconGradient, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <MaterialIcons name="delete" size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.settingTitle, { color: '#FFFFFF' }]}>{i18n.t('settings.deleteAccount')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Копирайт */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.secondaryText }]}>TravelHub © 2024</Text>
        </View>
      </ScrollView>


      {/* Модальное окно выбора валюты */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={currencyModalVisible}
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{i18n.t('settings.chooseCurrency')}</Text>
              <TouchableOpacity
                onPress={() => setCurrencyModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={theme.secondaryText} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalOptions}>
              {[
                { code: 'RUB' as const, symbol: '₽', color: '#C0392B', name: i18n.t('settings.rubName') },
                { code: 'USD' as const, symbol: '$', color: '#27AE60', name: i18n.t('settings.usdName') },
                { code: 'EUR' as const, symbol: '€', color: '#2980B9', name: i18n.t('settings.eurName') },
              ].map((curr) => (
                <TouchableOpacity
                  key={curr.code}
                  style={[
                    styles.modalOption,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    currency === curr.code && styles.modalOptionActive
                  ]}
                  onPress={() => handleCurrencyChange(curr.code)}
                  activeOpacity={0.7}
                >
                  {currency === curr.code && (
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.primary }]} />
                  )}
                  <View style={[
                    styles.modalIconCircle,
                    { backgroundColor: currency === curr.code ? '#FFFFFF' : `${curr.color}15` }
                  ]}>
                    <Text style={[
                      styles.currencySymbol,
                      { color: curr.color }
                    ]}>
                      {curr.symbol}
                    </Text>
                  </View>
                  <View style={styles.modalTextContainer}>
                    <Text style={[
                      styles.modalOptionText,
                      { color: theme.text },
                      currency === curr.code && styles.modalOptionTextActive
                    ]}>
                      {curr.code} ({curr.symbol})
                    </Text>
                    <Text style={[
                      styles.modalOptionDescription,
                      { color: theme.secondaryText },
                      currency === curr.code && styles.modalOptionDescriptionActive
                    ]}>
                      {curr.name}
                    </Text>
                  </View>
                  {currency === curr.code && (
                    <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Модальное окно выбора языка */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={languageModalVisible}
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{i18n.t('settings.chooseLanguage')}</Text>
              <TouchableOpacity
                onPress={() => setLanguageModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={theme.secondaryText} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalOptions}>
              {[
                { code: 'ru' as const, name: i18n.t('lang.ru'), icon: 'language-outline' as const },
                { code: 'en' as const, name: i18n.t('lang.en'), icon: 'globe-outline' as const },
              ].map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.modalOption,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    language === lang.code && styles.modalOptionActive
                  ]}
                  onPress={() => handleLanguageChange(lang.code)}
                  activeOpacity={0.7}
                >
                  {language === lang.code && (
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.primary }]} />
                  )}
                  <View style={[
                    styles.modalIconCircle,
                    { backgroundColor: language === lang.code ? '#FFFFFF' : theme.primary + '15' }
                  ]}>
                    <Ionicons
                      name={lang.icon}
                      size={20}
                      color={language === lang.code ? theme.primary : theme.primary}
                    />
                  </View>
                  <View style={styles.modalTextContainer}>
                    <Text style={[
                      styles.modalOptionText,
                      { color: theme.text },
                      language === lang.code && styles.modalOptionTextActive
                    ]}>
                      {lang.name}
                    </Text>
                  </View>
                  {language === lang.code && (
                    <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  brandMark: {
    ...typography.captionBold,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: -spacing.sm,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },

  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  sectionTitle: {
    ...typography.smallBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xxs,
  },

  themeSwitcherContainer: {
    marginBottom: spacing.sm,
  },

  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
    borderWidth: 1,
    ...shadows.card,
    minHeight: 56,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  settingTextContainer: { flex: 1 },
  settingTitle: {
    ...typography.bodyBold,
    marginBottom: 2,
  },
  settingValue: {
    ...typography.small,
  },

  dangerCard: {
    borderWidth: 1,
  },
  dangerText: {},

  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    marginTop: spacing.md,
  },
  footerText: {
    ...typography.small,
    opacity: 0.5,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 18, 46, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    ...typography.h3,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOptions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 56,
  },
  modalOptionActive: {
    ...shadows.button,
  },
  modalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '700',
  },
  modalTextContainer: { flex: 1 },
  modalOptionText: {
    ...typography.bodyBold,
    marginBottom: 2,
  },
  modalOptionTextActive: { color: '#FFFFFF' },
  modalOptionDescription: { ...typography.small },
  modalOptionDescriptionActive: {
    color: '#FFFFFF',
    opacity: 0.9,
  },
  flagEmoji: { fontSize: 26 },
});

export default ProfileSettings;
