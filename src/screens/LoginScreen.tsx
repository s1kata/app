import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { platform } from '../utils/platform';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { validateEmail, validatePassword } from '../utils/validation';
import { logger } from '../utils/logger';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import { runAuthDiagnostics } from '../utils/authDiagnostics';
import PercentageLoader from '../components/PercentageLoader';
import { adaptive } from '../utils/adaptive';
import { radius, shadows } from '../config/designSystem';

interface LoginScreenProps {
  navigation: any;
}

export default function LoginScreen({ navigation, route }: any) {
  const { login, loginAsGuest, theme, isDark } = useAppContext();
  const [email, setEmail] = useState(route?.params?.prefilledIdentifier || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Скрываем нативный сплэш при монтировании (защита от белого экрана)
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Диагностика входа в dev-сборке (сеть, Firebase, опционально тестовый login)
  useEffect(() => {
    if (!__DEV__) return;
    void runAuthDiagnostics();
  }, []);

  // Скрываем кнопку гостевого входа, если переход из профиля
  const hideGuestLogin = route?.params?.hideGuestLogin || false;

  const stopProgressSimulation = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  const startProgressSimulation = () => {
    setLoaderProgress(0);
    let p = 0;
    progressInterval.current = setInterval(() => {
      p = Math.min(p + 4 + Math.random() * 6, 85);
      setLoaderProgress(p);
    }, 150);
  };

  const handleGuestLogin = async () => {
    try {
      setLoading(true);
      await loginAsGuest();
      // После гостевого входа переходим на главный экран (не на профиль)
      navigation.replace('MainTabs');
    } catch (error) {
      Alert.alert(i18n.t('common.error'), i18n.t('login.errorGuest'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(i18n.t('common.error'), i18n.t('login.errorFillAll'));
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert(i18n.t('common.error'), i18n.t('login.errorInvalidEmail'));
      return;
    }

    if (!validatePassword(password)) {
      Alert.alert(i18n.t('common.error'), i18n.t('login.errorPasswordLength'));
      return;
    }

    setLoading(true);
    setShowLoader(true);
    startProgressSimulation();
    logger.debug('LoginScreen: Starting login process');

    try {
      await login(email, password);
      stopProgressSimulation();
      setLoaderProgress(100);
      logIosTestStep(IosTestStep.AUTH, { method: 'email' });
      logger.info('LoginScreen: login successful');
    } catch (error: any) {
      stopProgressSimulation();
      setShowLoader(false);
      setLoading(false);
      logger.error('LoginScreen: Login error:', error);

      const errorMessage = error?.message || i18n.t('login.errorGeneric');

      Alert.alert(i18n.t('login.errorTitle'), errorMessage);
    }
  };

  const handleLoaderComplete = () => {
    setShowLoader(false);
    setLoading(false);
    const returnTo = route?.params?.returnTo as { name: string; params?: { tour?: unknown; searchParams?: unknown } } | undefined;
    if (returnTo?.name && returnTo.params) {
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            state: {
              routes: [
                { name: 'Home', state: { routes: [{ name: 'HomeMain' }, { name: returnTo.name, params: returnTo.params }], index: 1 } },
                { name: 'Bookings' },
                { name: 'Documents' },
                { name: 'Settings' },
              ],
              index: 0,
            },
          },
        ],
      });
    } else {
      navigation.replace('MainTabs');
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <KeyboardAvoidingView
        behavior={platform.isIOS ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.background }]} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.content}>
          {/* Logo Section */}
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <View
                style={[styles.logoCircle, { shadowColor: theme.primary, backgroundColor: theme.primary }]}
              >
                <Ionicons name="airplane" size={40} color={theme.surface} />
              </View>
            </View>
            <Text style={[styles.title, { color: theme.text }]}>TravelHub</Text>
            <Text style={[styles.subtitle, { color: theme.secondaryText }]}>{i18n.t('auth.welcome')}</Text>
          </View>

          {/* Form Section */}
          <View style={styles.form}>
            <View style={[styles.inputContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="mail-outline" size={20} color={theme.secondaryText} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder={i18n.t('auth.emailOrPhone')}
                placeholderTextColor={theme.secondaryText}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={[styles.inputContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.secondaryText} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder={i18n.t('auth.password')}
                placeholderTextColor={theme.secondaryText}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { shadowColor: theme.primary }, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <View style={[styles.buttonGradient, { backgroundColor: theme.primary }]}>
                {loading ? (
                  <ActivityIndicator color={theme.surface} />
                ) : (
                  <>
                    <Text style={[styles.buttonText, { color: theme.surface }]}>{i18n.t('auth.login')}</Text>
                    <Ionicons name="arrow-forward" size={20} color={theme.surface} />
                  </>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotPasswordButton}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={[styles.forgotPasswordText, { color: theme.primary }]}>
                {i18n.t('auth.forgotPassword')}
              </Text>
            </TouchableOpacity>

            {!hideGuestLogin && (
              <>
                <View style={styles.divider}>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                  <Text style={[styles.dividerText, { color: theme.secondaryText }]}>{i18n.t('login.or')}</Text>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                </View>

                <TouchableOpacity
                  style={[styles.secondaryButton, { borderColor: theme.primary, backgroundColor: theme.secondaryBackground }]}
                  onPress={handleGuestLogin}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-outline" size={20} color={theme.primary} />
                  <Text style={[styles.secondaryButtonText, { color: theme.primary }]}>{i18n.t('login.guestLogin')}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={[styles.linkText, { color: theme.secondaryText }]}>
                {i18n.t('auth.noAccount')} <Text style={[styles.linkTextBold, { color: theme.primary }]}>{i18n.t('auth.register')}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <PercentageLoader
        visible={showLoader}
        progress={loaderProgress}
        onComplete={handleLoaderComplete}
      />
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
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: adaptive.getHorizontalPadding(),
    justifyContent: 'center',
    paddingTop: 60,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoCircle: {
    width: adaptive.image.small,
    height: adaptive.image.small,
    borderRadius: adaptive.image.small / 2,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.card,
  },
  title: {
    fontSize: adaptive.fontSize.display(),
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: adaptive.fontSize.body(),
    textAlign: 'center',
    fontWeight: '400',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: adaptive.borderRadius.large,
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: adaptive.spacing.medium,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  inputIcon: {
    marginRight: adaptive.spacing.small,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: adaptive.fontSize.body(),
  },
  primaryButton: {
    borderRadius: adaptive.borderRadius.large,
    marginTop: 8,
    overflow: 'hidden',
    ...shadows.button,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: adaptive.fontSize.subtitle(),
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  forgotPasswordButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 8,
  },
  forgotPasswordText: {
    fontSize: adaptive.fontSize.body(),
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: adaptive.spacing.medium,
    fontSize: adaptive.fontSize.caption(),
    fontWeight: '500',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: adaptive.borderRadius.large,
    borderWidth: 2,
    paddingVertical: 16,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: adaptive.fontSize.body(),
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    fontSize: adaptive.fontSize.body(),
  },
  linkTextBold: {
    fontWeight: '600',
  },
});

