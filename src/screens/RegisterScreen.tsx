import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { platform } from '../utils/platform';
import { StatusBar } from 'expo-status-bar';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { validateEmail, validatePassword, validateName, getPasswordValidationMessage } from '../utils/validation';
import { logger } from '../utils/logger';
import { PrimaryButton } from '../components/ui';

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
        >
          <View style={styles.content}>
            <Text style={[styles.title, { color: theme.primary }]}>{i18n.t('auth.registration')}</Text>
            <Text style={[styles.subtitle, { color: theme.secondaryText }]}>{i18n.t('auth.createAccount')}</Text>

            <View style={styles.form}>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
                placeholder={i18n.t('auth.name')}
                placeholderTextColor={theme.secondaryText}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />

            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder={i18n.t('auth.emailOrPhone')}
              placeholderTextColor={theme.secondaryText}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder={i18n.t('auth.password')}
              placeholderTextColor={theme.secondaryText}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder={i18n.t('auth.confirmPassword')}
              placeholderTextColor={theme.secondaryText}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
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
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={[styles.linkText, { color: theme.secondaryText }]}>
                  {i18n.t('auth.haveAccount')} <Text style={[styles.linkTextBold, { color: theme.primary }]}>{i18n.t('auth.login')}</Text>
                </Text>
              </TouchableOpacity>
            </View>
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
    paddingBottom: 36,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 28,
  },
  form: {
    width: '100%',
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  button: {
    marginTop: 8,
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
  },
  linkTextBold: {
    fontWeight: '600',
  },
});

