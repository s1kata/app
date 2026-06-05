import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { pointsService } from '../services/PointsService';
import { bonusService } from '../services/BonusService';
import { bookingService } from '../services/BookingService';
import { UserProfile } from '../types/firestore';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import { radius, shadows } from '../config/designSystem';

export default function ProfileScreen({ navigation }: any) {
  const { logout, user, theme, isDark } = useAppContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [points, setPoints] = useState(0);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [tripCount, setTripCount] = useState(0);
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
          setPoints(0);
          setBonusBalance(0);
          setTripCount(0);
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
        setPoints(0);
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
          const confirmed = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed');
          setTripCount(confirmed.length);
        } catch {
          setTripCount(0);
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
        setPoints(0);
        setBonusBalance(0);
        setTripCount(0);
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
      id: 'bookings',
      title: i18n.t('profile.myBookings'),
      icon: 'calendar-outline',
      onPress: () => navigation.navigate('MainTabs', { screen: 'Bookings' }),
    },
    { id: 'settings', title: i18n.t('settings.title'), icon: 'settings-outline', onPress: () => navigation.getParent()?.navigate('MainTabs', { screen: 'Settings' }) },
    { id: 'help', title: i18n.t('profile.help'), icon: 'help-circle-outline', onPress: () => navigation.navigate('HelperChat') },
  ];

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView style={[styles.scrollView, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { backgroundColor: theme.card }]}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: theme.secondaryBackground, borderColor: theme.primary }]}>
            <Ionicons name="person" size={48} color={theme.primary} />
          </View>
        </View>

        <Text style={[styles.name, { color: theme.text }]}>
          {profile?.fullName === i18n.t('profile.guest') || profile?.fullName === 'Guest' || profile?.fullName === 'Гость'
            ? i18n.t('profile.guest')
            : profile?.fullName || i18n.t('profile.user')}
        </Text>
        <Text style={[styles.email, { color: theme.secondaryText }]}>{profile?.email || profile?.phone}</Text>

        {profile && (
          <View style={[styles.statsContainer, { backgroundColor: theme.secondaryBackground }]}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('PurchaseHistory')}
              activeOpacity={0.7}
            >
              <Text style={[styles.statValue, { color: theme.primary }]}>{purchaseCount}</Text>
              <Text style={[styles.statLabel, { color: theme.secondaryText }]}>{i18n.t('profile.purchases')}</Text>
            </TouchableOpacity>

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

      <View style={[styles.section, { backgroundColor: theme.card, borderRadius: 16, overflow: 'hidden' }]}>
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

      <View style={[styles.section, { backgroundColor: theme.card, borderRadius: 16 }]}>
        {/* Кнопка входа для гостей или выхода для авторизованных */}
        {isGuest ? (
          <TouchableOpacity 
            style={[styles.loginButton, { borderColor: theme.primary }]} 
            onPress={() => setShowLoginModal(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.loginButtonGradient, { backgroundColor: theme.primary }]}>
              <Ionicons name="log-in-outline" size={24} color={theme.surface} />
              <Text style={[styles.loginButtonText, { color: theme.surface }]}>{i18n.t('auth.login')}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.logoutButton, { borderColor: theme.error }]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color={theme.error} />
            <Text style={[styles.logoutButtonText, { color: theme.error }]}>{i18n.t('auth.logout')}</Text>
          </TouchableOpacity>
        )}
      </View>

        <View style={[styles.footer, { backgroundColor: theme.background }]}>
          <Text style={[styles.footerText, { color: theme.tertiaryText }]}>TravelHub v1.0.0</Text>
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
              <TouchableOpacity
                style={[styles.modalButton, { shadowColor: theme.primary }]}
                onPress={() => {
                  setShowLoginModal(false);
                  navigation.navigate('Login', { hideGuestLogin: true });
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.modalButtonGradient, { backgroundColor: theme.primary }]}>
                  <Ionicons name="log-in-outline" size={22} color={theme.surface} />
                  <Text style={[styles.modalButtonText, { color: theme.surface }]}>{i18n.t('auth.login')}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButtonSecondary, { borderColor: theme.primary }]}
                onPress={() => {
                  setShowLoginModal(false);
                  navigation.navigate('Register');
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add-outline" size={22} color={theme.primary} />
                <Text style={[styles.modalButtonSecondaryText, { color: theme.primary }]}>{i18n.t('profile.register')}</Text>
              </TouchableOpacity>
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
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
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
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
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
  loginButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  loginButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
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
  modalButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.button,
  },
  modalButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  modalButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: 'transparent',
    gap: 10,
  },
  modalButtonSecondaryText: {
    fontSize: 17,
    fontWeight: '700',
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