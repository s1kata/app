import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { bonusService } from '../services/BonusService';
import { bookingService } from '../services/BookingService';
import { UserProfile } from '../types/firestore';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import { radius, shadows, spacing, typography, surfaces } from '../config/designSystem';
import { RELEASE_HIDE_PURCHASE_HISTORY } from '../config/releaseUiFlags';
import { PrimaryButton } from '../components/ui';
import AppLogo from '../components/AppLogo';

export default function ProfileScreen({ navigation }: any) {
  const { logout, user, theme, isDark } = useAppContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // Проверяем, является ли пользователь гостем
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  useEffect(() => {
    loadProfile();
    const unsubscribe = navigation.addListener('focus', () => {
      loadProfile();
    });
    return unsubscribe;
  }, [navigation]);

  const loadProfile = async () => {
    try {
      if (user && user.uid) {
        // Проверяем, не является ли пользователь гостем
        const isGuest = user.uid.startsWith('guest_') || user.isAnonymous === true;
        if (isGuest) {
          const guestProfile: UserProfile = {
            id: user.uid,
            email: '',
            fullName: i18n.t('profile.guest'),
            phone: '',
            passwordHash: '',
            createdAt: new Date().toISOString(),
            isActive: true,
            lastLoginAt: new Date().toISOString(),
          };
          setProfile(guestProfile);
          setBonusBalance(0);
          setPurchaseCount(0);
          return;
        }

        const authProfile = await AuthService.getCurrentUser();
        const basicProfile: UserProfile = authProfile
          ? {
              id: authProfile.id,
              email: authProfile.email,
              fullName: authProfile.fullName || user.displayName || user.email?.split('@')[0] || i18n.t('profile.user'),
              phone: authProfile.phone || '',
              passwordHash: '',
              passport: authProfile.passport,
              createdAt: authProfile.createdAt || new Date().toISOString(),
              updatedAt: authProfile.updatedAt,
              isActive: authProfile.isActive,
              lastLoginAt: new Date().toISOString(),
            }
          : {
              id: user.uid,
              email: user.email || '',
              fullName: user.displayName || user.email?.split('@')[0] || i18n.t('profile.user'),
              phone: user.phoneNumber || '',
              passwordHash: '',
              createdAt: new Date().toISOString(),
              isActive: true,
              lastLoginAt: new Date().toISOString(),
            };
        setProfile(basicProfile);
        setBonusBalance(0);
        setPurchaseCount(0);
        try {
          const balance = await bonusService.getBalance(user.email || undefined, (user as any).phoneNumber || (user as any).phone);
          setBonusBalance(balance);
        } catch {
          setBonusBalance(0);
        }
        try {
          const bookings = await bookingService.getUserBookings(user.uid);
          setPurchaseCount(bookings.filter((b) => b.paymentStatus === 'paid').length);
        } catch {
          setPurchaseCount(0);
        }
      }
    } catch (error) {
      logger.error('Error loading profile:', error);
      // Не показываем Alert для ошибок permissions, просто используем базовый профиль
      if (user && user.uid) {
        const isGuest = user.uid.startsWith('guest_') || user.isAnonymous === true;
        const basicProfile: UserProfile = {
          id: user.uid,
          email: user.email || '',
          fullName: isGuest ? i18n.t('profile.guest') : (user.displayName || user.email?.split('@')[0] || i18n.t('profile.user')),
          phone: '',
          passwordHash: '',
          createdAt: new Date().toISOString(),
          isActive: true,
          lastLoginAt: new Date().toISOString(),
        };
        setProfile(basicProfile);
        setBonusBalance(0);
        setPurchaseCount(0);
      }
    }
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
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    );
  };

  const menuItems = [
    { id: 'personal', title: i18n.t('profile.personalData'), icon: 'id-card-outline', onPress: () => navigation.navigate('PersonalData') },
    {
      id: 'favorites',
      title: i18n.t('profile.favorites'),
      icon: 'heart-outline',
      onPress: () => navigation.navigate('Home', { screen: 'Favorites' }),
    },
    {
      id: 'bookings',
      title: i18n.t('profile.myBookings'),
      icon: 'calendar-outline',
      onPress: () => navigation.navigate('MainTabs', { screen: 'Bookings' }),
    },
    ...(!RELEASE_HIDE_PURCHASE_HISTORY && !isGuest
      ? [{
          id: 'purchases',
          title: i18n.t('profile.purchaseHistory'),
          icon: 'receipt-outline',
          onPress: () => navigation.navigate('PurchaseHistory'),
        }]
      : []),
    { id: 'settings', title: i18n.t('settings.title'), icon: 'settings-outline', onPress: () => navigation.navigate('Settings') },
    { id: 'help', title: i18n.t('profile.help'), icon: 'help-circle-outline', onPress: () => navigation.navigate('HelperChat') },
    {
      id: 'privacy',
      title: i18n.t('settings.privacyPolicy'),
      icon: 'shield-checkmark-outline',
      onPress: () => navigation.navigate('LegalDocument', { type: 'privacy' }),
    },
    {
      id: 'terms',
      title: i18n.t('settings.termsOfUse'),
      icon: 'document-text-outline',
      onPress: () => navigation.navigate('LegalDocument', { type: 'terms' }),
    },
  ];

  const appVersion = Constants.expoConfig?.version || '1.0.1';

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView style={[styles.scrollView, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: theme.secondaryBackground, borderColor: theme.primary }]}>
            <AppLogo size={86} bordered borderColor={theme.primary} backgroundColor={theme.surface} />
          </View>
        </View>

        <Text style={[styles.name, { color: theme.text }]}>
          {isGuest
            ? i18n.t('profile.guestModeLabel')
            : profile?.fullName || i18n.t('profile.user')}
        </Text>
        {isGuest ? (
          <Text style={[styles.email, { color: theme.secondaryText }]}>{i18n.t('ux.guestBannerBody')}</Text>
        ) : (
          <Text style={[styles.email, { color: theme.secondaryText }]}>{profile?.email || profile?.phone}</Text>
        )}

        {profile && (
          <View style={[styles.statsContainer, { backgroundColor: theme.secondaryBackground }]}>
            {!RELEASE_HIDE_PURCHASE_HISTORY ? (
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => navigation.navigate('PurchaseHistory')}
                activeOpacity={0.7}
              >
                <Text style={[styles.statValue, { color: theme.primary }]}>{purchaseCount}</Text>
                <Text style={[styles.statLabel, { color: theme.secondaryText }]}>{i18n.t('profile.purchases')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.primary }]}>{purchaseCount}</Text>
                <Text style={[styles.statLabel, { color: theme.secondaryText }]}>{i18n.t('profile.purchases')}</Text>
              </View>
            )}

            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />

            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Bonus')}
              activeOpacity={0.7}
            >
              <Text style={[styles.statValue, { color: theme.primary }]}>{bonusBalance}</Text>
              <Text style={[styles.statLabel, { color: theme.secondaryText }]}>{i18n.t('profile.bonuses')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderRadius: surfaces.sectionRadius, overflow: 'hidden', borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('nav.profile')}</Text>

        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.menuItem, { borderBottomColor: theme.border }]}
            onPress={item.onPress}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name={item.icon as any} size={24} color={theme.text} />
              </View>
              <Text style={[styles.menuItemText, { color: theme.text }]}>{item.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderRadius: surfaces.sectionRadius, borderColor: theme.border }]}>
        {isGuest ? (
          <PrimaryButton
            title={i18n.t('auth.login')}
            onPress={() => setShowLoginModal(true)}
            iconLeft={<Ionicons name="log-in-outline" size={20} color={theme.surface} />}
            style={styles.actionButton}
          />
        ) : (
          <PrimaryButton
            title={i18n.t('auth.logout')}
            onPress={handleLogout}
            outline
            danger
            iconLeft={<Ionicons name="log-out-outline" size={20} color={theme.error} />}
            style={styles.actionButton}
          />
        )}
      </View>

        <View style={[styles.footer, { backgroundColor: theme.background }]}>
          <Text style={[styles.footerText, { color: theme.tertiaryText }]}>TravelHub v{appVersion}</Text>
        </View>
      </ScrollView>


      {/* Модальное окно выбора входа/регистрации */}
      <Modal
        visible={showLoginModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{i18n.t('profile.loginToAccount')}</Text>
              <TouchableOpacity 
                onPress={() => setShowLoginModal(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalButtons}>
              <PrimaryButton
                title={i18n.t('auth.login')}
                onPress={() => {
                  setShowLoginModal(false);
                  navigation.navigate('Login', { hideGuestLogin: true });
                }}
                iconLeft={<Ionicons name="log-in-outline" size={20} color={theme.surface} />}
              />

              <PrimaryButton
                title={i18n.t('profile.register')}
                onPress={() => {
                  setShowLoginModal(false);
                  navigation.navigate('Register');
                }}
                outline
                iconLeft={<Ionicons name="person-add-outline" size={20} color={theme.primary} />}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: surfaces.sectionRadius,
    borderWidth: 1,
    ...shadows.cardRaised,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    overflow: 'hidden',
  },
  name: {
    ...typography.h1,
    marginBottom: 4,
  },
  email: {
    ...typography.caption,
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: surfaces.cardRadius,
    padding: surfaces.cardPadding,
    marginHorizontal: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...typography.h2,
    marginBottom: 4,
  },
  statLabel: {
    ...typography.small,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  section: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemText: {
    fontSize: 16,
    marginLeft: 16,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  menuButtonText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  actionButton: {
    marginBottom: 8,
    width: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: radius.xl,
    width: '85%',
    maxWidth: 400,
    padding: 0,
    ...shadows.cardRaised,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalButtons: {
    padding: 20,
    gap: 12,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 12,
  },
  iconContainer: {
    position: 'relative',
  },
});