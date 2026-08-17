/**
 * Логин — концепт 02: бренд TravelHub, поля, коралловый CTA.
 */
import React, { useState, useRef, useEffect } from 'react';
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
import { StatusBar } from 'expo-status-bar';
import { platform } from '../utils/platform';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { validateEmail, validatePassword } from '../utils/validation';
import { logger } from '../utils/logger';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import PercentageLoader from '../components/PercentageLoader';
import { BRAND, radius, spacing, typography, touchTargets } from '../config/designSystem';
import { PrimaryButton, TextField } from '../components/ui';
import AppLogo from '../components/AppLogo';
import { navigateRoot } from '../utils/navHelpers';

export default function LoginScreen({ navigation, route }: any) {
  const { login, loginAsGuest, theme, isDark, language } = useAppContext();
  void language;
  const [email, setEmail] = useState(route?.params?.prefilledIdentifier || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideGuestLogin = route?.params?.hideGuestLogin || false;

  useEffect(() => {
    if (route?.params?.initialTab === 'register') {
      navigation.replace('Register', { returnTo: route?.params?.returnTo });
    }
  }, [navigation, route?.params?.initialTab, route?.params?.returnTo]);

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
      navigation.replace('MainTabs');
    } catch {
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
    try {
      await login(email, password);
      stopProgressSimulation();
      setLoaderProgress(100);
      logIosTestStep(IosTestStep.AUTH, { method: 'email' });
    } catch (error: any) {
      stopProgressSimulation();
      setShowLoader(false);
      setLoading(false);
      logger.error('LoginScreen: Login error:', error);
      Alert.alert(i18n.t('login.errorTitle'), error?.message || i18n.t('login.errorGeneric'));
    }
  };

  const handleLoaderComplete = () => {
    setShowLoader(false);
    setLoading(false);
    navigation.replace('MainTabs');
  };

  const titleColor = theme.deep || theme.text;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={platform.isIOS ? 'padding' : 'height'} style={{ flex: 1 }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandBlock}>
            <AppLogo size={48} shape="rounded" />
            <Text style={[styles.wordmark, { color: BRAND.blue }]}>TravelHub</Text>
          </View>

          <Text style={[styles.title, { color: titleColor }]}>{i18n.t('auth.login')}</Text>

          <TextField
            placeholder={i18n.t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            iconLeft={<Ionicons name="mail-outline" size={20} color={theme.secondaryText} />}
            containerStyle={styles.field}
          />
          <TextField
            placeholder={i18n.t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            iconLeft={<Ionicons name="lock-closed-outline" size={20} color={theme.secondaryText} />}
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

          <PrimaryButton
            title={i18n.t('auth.login')}
            onPress={handleLogin}
            loading={loading}
            variant="cta"
            style={styles.cta}
          />

          <TouchableOpacity
            onPress={() => navigateRoot(navigation, 'ForgotPassword')}
            style={styles.linkWrap}
          >
            <Text style={[styles.link, { color: theme.primary }]}>{i18n.t('auth.forgotPassword')}</Text>
          </TouchableOpacity>

          <View style={styles.orRow}>
            <View style={[styles.orLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.orText, { color: theme.secondaryText }]}>{i18n.t('login.or')}</Text>
            <View style={[styles.orLine, { backgroundColor: theme.border }]} />
          </View>

          {!hideGuestLogin ? (
            <TouchableOpacity onPress={handleGuestLogin} style={styles.linkWrap}>
              <Text style={[styles.link, { color: theme.primary }]}>{i18n.t('login.guestLogin')}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={() => navigateRoot(navigation, 'Register', { returnTo: route?.params?.returnTo })}
            style={styles.linkWrap}
          >
            <Text style={[styles.link, { color: theme.primary }]}>{i18n.t('profile.register')}</Text>
          </TouchableOpacity>
        </ScrollView>

        <PercentageLoader visible={showLoader} progress={loaderProgress} onComplete={handleLoaderComplete} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
    justifyContent: 'center',
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  wordmark: { ...typography.hero },
  title: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.xl,
    letterSpacing: -0.5,
  },
  field: { marginBottom: spacing.md },
  cta: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    minHeight: touchTargets.button,
  },
  linkWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  link: { ...typography.captionBold },
  orRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xs },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { marginHorizontal: spacing.sm, ...typography.caption },
});
