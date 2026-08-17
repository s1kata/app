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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { radius, shadows, spacing, typography, surfaces, BRAND } from '../config/designSystem';
import { RELEASE_HIDE_PURCHASE_HISTORY } from '../config/releaseUiFlags';
import { PrimaryButton, ScreenHeader } from '../components/ui';
import AppLogo from '../components/AppLogo';
import { useTabBarMetrics } from '../utils/tabBarMetrics';
import { navigateRoot, navigateTab, getRootNavigation } from '../utils/navHelpers';

export default function ProfileScreen({ navigation }: any) {
  const { logout, loginAsGuest, user, theme, isDark, fontScale, language } = useAppContext();
  void language;
  const insets = useSafeAreaInsets();
  const { contentBottomPadding } = useTabBarMetrics(insets, fontScale);
  const bottomPad = contentBottomPadding({ includeFab: false });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const titleColor = theme.deep || theme.text;

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
        const isGuestUser = user.uid.startsWith('guest_') || user.isAnonymous === true;
        if (isGuestUser) {
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
          setPurchaseCount(bookings.length);
        } catch {
          setPurchaseCount(0);
        }
      }
    } catch (error) {
      logger.error('Error loading profile:', error);
      if (user && user.uid) {
        const isGuestUser = user.uid.startsWith('guest_') || user.isAnonymous === true;
        const basicProfile: UserProfile = {
          id: user.uid,
          email: user.email || '',
          fullName: isGuestUser ? i18n.t('profile.guest') : (user.displayName || user.email?.split('@')[0] || i18n.t('profile.user')),
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
            await loginAsGuest();
            getRootNavigation(navigation).reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          },
        },
      ]
    );
  };

  const accountItems = [
    {
      id: 'bookings',
      title: i18n.t('profile.myBookings'),
      icon: 'clipboard-outline',
      onPress: () => navigateTab(navigation, 'Bookings'),
    },
    ...(!isGuest
      ? [{
          id: 'personal',
          title: i18n.t('profile.personalData'),
          icon: 'person-outline',
          onPress: () => navigation.navigate('PersonalData'),
        }]
      : []),
    {
      id: 'bonus',
      title: i18n.t('profile.bonuses'),
      icon: 'gift-outline',
      onPress: () => navigation.navigate('Bonus'),
    },
    ...(!RELEASE_HIDE_PURCHASE_HISTORY && !isGuest
      ? [{
          id: 'purchases',
          title: i18n.t('profile.purchaseHistory'),
          icon: 'bag-handle-outline',
          onPress: () => navigation.navigate('PurchaseHistory'),
        }]
      : []),
    {
      id: 'favorites',
      title: i18n.t('profile.favorites'),
      icon: 'heart-outline',
      onPress: () => navigateTab(navigation, 'Favorites'),
    },
    { id: 'settings', title: i18n.t('settings.title'), icon: 'settings-outline', onPress: () => navigation.navigate('Settings') },
  ];

  const supportItems = [
    {
      id: 'supportChat',
      title: i18n.t('profile.supportChat'),
      icon: 'headset-outline',
      onPress: () => navigation.navigate('HelperChat'),
    },
    {
      id: 'about',
      title: i18n.t('profile.aboutUs'),
      icon: 'information-circle-outline',
      onPress: () => navigation.navigate('About'),
    },
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

  const renderMenuGroup = (
    title: string,
    items: Array<{ id: string; title: string; icon: string; onPress: () => void }>,
  ) => (
    <View style={styles.menuGroup}>
      <Text style={[styles.groupLabel, { color: theme.tertiaryText }]}>{title}</Text>
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {items.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.menuItem,
              {
                borderBottomColor: theme.border,
                borderBottomWidth: index === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
              },
            ]}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconSquare, { backgroundColor: theme.primary }]}>
                <Ionicons name={item.icon as any} size={18} color="#FFFFFF" />
              </View>
              <Text style={[styles.menuItemText, { color: theme.text }]}>{item.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.tertiaryText} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const appVersion = Constants.expoConfig?.version || '1.0.3';

  const displayName = isGuest
    ? i18n.t('profile.guestModeLabel')
    : profile?.fullName || i18n.t('profile.user');
  const contactLine = isGuest
    ? i18n.t('ux.guestBannerBody')
    : (profile?.phone || profile?.email || '');
  const initials = !isGuest
    ? displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || '')
        .join('') || 'TH'
    : '';

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScreenHeader title={i18n.t('nav.profile')} noSafeTop />
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
      >
        <TouchableOpacity
          style={[styles.avatarCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          activeOpacity={0.85}
          onPress={() => {
            if (isGuest) setShowLoginModal(true);
            else navigation.navigate('PersonalData');
          }}
        >
          {isGuest ? (
            <View style={[styles.avatar, { backgroundColor: theme.secondaryBackground, borderColor: theme.primary }]}>
              <AppLogo size={54} bordered borderColor={theme.primary} backgroundColor={theme.surface} />
            </View>
          ) : (
            <View style={[styles.avatarInitials, { backgroundColor: theme.primary }]}>
              <Text style={styles.initialsText}>{initials}</Text>
            </View>
          )}

          <View style={styles.avatarMeta}>
            <Text style={[styles.name, { color: titleColor }]} numberOfLines={1}>
              {displayName}
            </Text>
            {!!contactLine && (
              <Text style={[styles.email, { color: theme.secondaryText }]} numberOfLines={2}>
                {contactLine}
              </Text>
            )}
            {!isGuest ? (
              <View style={[styles.bonusBadge, { backgroundColor: theme.secondaryBackground }]}>
                <Ionicons name="star" size={12} color={BRAND.orange} />
                <Text style={[styles.bonusBadgeText, { color: theme.secondaryText }]}>
                  {bonusBalance} {i18n.t('profile.bonusCount')}
                  {purchaseCount > 0 ? ` · ${purchaseCount} ${i18n.t('profile.purchases').toLowerCase()}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.tertiaryText} />
        </TouchableOpacity>

        {renderMenuGroup(i18n.t('profile.sectionAccount'), accountItems)}
        {renderMenuGroup(i18n.t('profile.sectionSupport'), supportItems)}

        <TouchableOpacity
          style={styles.promoBanner}
          activeOpacity={0.9}
          onPress={() => navigateTab(navigation, 'Search')}
        >
          <View style={styles.promoCopy}>
            <Text style={styles.promoTitle}>{i18n.t('profile.promoTitle')}</Text>
            <Text style={styles.promoSubtitle}>{i18n.t('profile.promoSubtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.actions}>
          {isGuest ? (
            <PrimaryButton
              title={i18n.t('auth.login')}
              onPress={() => setShowLoginModal(true)}
              variant="cta"
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

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.tertiaryText }]}>TravelHub v{appVersion}</Text>
        </View>
      </ScrollView>

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
                  navigateRoot(navigation, 'Login', { hideGuestLogin: true });
                }}
                iconLeft={<Ionicons name="log-in-outline" size={20} color={theme.surface} />}
              />

              <PrimaryButton
                title={i18n.t('profile.register')}
                onPress={() => {
                  setShowLoginModal(false);
                  navigateRoot(navigation, 'Register');
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  brandMark: {
    ...typography.h3,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  avatarCard: {
    marginHorizontal: spacing.lg,
    borderRadius: surfaces.sectionRadius,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.cardRaised,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatarInitials: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  avatarMeta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.h3,
    marginBottom: 2,
  },
  email: {
    ...typography.caption,
    marginBottom: 8,
  },
  bonusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  bonusBadgeText: {
    ...typography.small,
  },
  menuGroup: {
    marginTop: spacing.lg,
  },
  groupLabel: {
    ...typography.smallBold,
    letterSpacing: 1.1,
    paddingHorizontal: spacing.lg + spacing.xs,
    marginBottom: spacing.xs,
  },
  section: {
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: surfaces.sectionRadius,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconSquare: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    ...typography.body,
    marginLeft: spacing.md,
    flexShrink: 1,
  },
  promoBanner: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    borderRadius: surfaces.sectionRadius,
    backgroundColor: BRAND.orange,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  promoCopy: {
    flex: 1,
  },
  promoTitle: {
    color: '#FFFFFF',
    ...typography.h3,
    marginBottom: 4,
  },
  promoSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    ...typography.caption,
  },
  actions: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
  },
  actionButton: {
    width: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 18, 46, 0.45)',
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
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    ...typography.h3,
  },
  modalButtons: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  footerText: {
    ...typography.small,
  },
});
