/**
 * Регистрация — концепт 03: бренд TravelHub, teal-иконки, коралловый CTA.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { platform } from '../utils/platform';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { validateEmail, validatePassword, validateName, getPasswordValidationMessage } from '../utils/validation';
import { logger } from '../utils/logger';
import { PrimaryButton, TextField } from '../components/ui';
import AppLogo from '../components/AppLogo';
import { BRAND, radius, spacing, typography, touchTargets } from '../config/designSystem';
import { navigateRoot } from '../utils/navHelpers';

interface RegisterScreenProps {
  navigation: any;
  route?: { params?: { returnTo?: { name: string; params?: object } } };
}

export default function RegisterScreen({ navigation, route }: RegisterScreenProps) {
  const { register, theme, isDark } = useAppContext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Ошибка', 'Пожалуйста, заполните все поля');
      return;
    }

    if (!validateName(name)) {
      Alert.alert('Ошибка', 'Имя должно содержать минимум 2 символа');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Ошибка', 'Пожалуйста, введите корректный email адрес');
      return;
    }

    if (!validatePassword(password)) {
      Alert.alert('Ошибка', getPasswordValidationMessage(password) || 'Пароль слишком слабый');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      logger.debug('RegisterScreen: Starting registration process');
      await register(email, password, name);
      logger.debug('RegisterScreen: Registration successful');
      const returnTo = route?.params?.returnTo;
      if (returnTo?.name && returnTo.params) {
        navigation.reset({
          index: 0,
          routes: [{
            name: 'MainTabs',
            state: {
              routes: [
                { name: 'Home', state: { routes: [{ name: 'HomeMain' }, { name: returnTo.name, params: returnTo.params }], index: 1 } },
                { name: 'Bookings' },
                { name: 'Settings' },
              ],
              index: 0,
            },
          }],
        });
      } else {
        navigation.replace('MainTabs');
      }
    } catch (error: any) {
      logger.error('RegisterScreen: Registration error:', error);
      Alert.alert('Ошибка', error.message || 'Не удалось зарегистрироваться');
    } finally {
      setLoading(false);
    }
  };

  const titleColor = theme.deep || theme.text;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={platform.isIOS ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.brandRow}>
              <AppLogo size={48} shape="rounded" />
              <Text style={[styles.wordmark, { color: BRAND.blue }]}>TravelHub</Text>
            </View>

            <Text style={[styles.title, { color: titleColor }]}>Регистрация</Text>

            <TextField
              placeholder={i18n.t('auth.name')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              iconLeft={<Ionicons name="person-outline" size={20} color={theme.primary} />}
              containerStyle={styles.field}
            />

            <TextField
              placeholder={i18n.t('auth.emailOrPhone')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              iconLeft={<Ionicons name="mail-outline" size={20} color={theme.primary} />}
              containerStyle={styles.field}
            />

            <TextField
              placeholder={i18n.t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              iconLeft={<Ionicons name="lock-closed-outline" size={20} color={theme.primary} />}
              iconRight={
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color={theme.secondaryText}
                  />
                </TouchableOpacity>
              }
              containerStyle={styles.field}
            />

            <TextField
              placeholder={i18n.t('auth.confirmPassword')}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              iconLeft={<Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />}
              containerStyle={styles.field}
            />

            <PrimaryButton
              title={i18n.t('auth.register')}
              onPress={handleRegister}
              loading={loading}
              variant="cta"
              style={styles.button}
            />

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigateRoot(navigation, 'Login')}
              hitSlop={8}
            >
              <Text style={[styles.linkText, { color: titleColor }]}>
                {i18n.t('auth.haveAccount')}{' '}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.primary} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  wordmark: {
    ...typography.hero,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.xl,
    letterSpacing: -0.4,
  },
  field: {
    marginBottom: spacing.md,
  },
  button: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    minHeight: touchTargets.button,
  },
  linkButton: {
    marginTop: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: touchTargets.iconButton,
  },
  linkText: {
    ...typography.captionBold,
  },
});
