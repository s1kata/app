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
import { StatusBar } from 'expo-status-bar';
import { platform } from '../utils/platform';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { useAppContext } from '../contexts/AppContext';
import AppLogo from '../components/AppLogo';
import { PrimaryButton } from '../components/ui';
import { radius, shadows } from '../config/designSystem';

interface ForgotPasswordScreenProps {
  navigation: any;
}

export default function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const { theme, isDark } = useAppContext();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSendResetLink = async () => {
    if (!email) {
      Alert.alert('Ошибка', 'Пожалуйста, введите email');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Ошибка', 'Пожалуйста, введите корректный email');
      return;
    }

    setLoading(true);
    try {
      const result = await AuthService.requestPasswordReset(email);

      if (result.success) {
        Alert.alert(
          'Проверьте email',
          'Мы отправили код для сброса пароля на ваш email. Код действителен в течение 1 часа.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('ResetPassword', { email }),
            },
          ]
        );
      } else {
        Alert.alert('Ошибка', result.error || 'Не удалось отправить код');
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Произошла ошибка при отправке кода');
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
          {/* Кнопка назад */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={theme.primary} />
          </TouchableOpacity>

          <View style={[styles.iconContainer, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}>
            <AppLogo size={72} bordered borderColor={theme.primary} backgroundColor={theme.surface} />
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>Забыли пароль?</Text>
            <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
              Введите ваш email, и мы отправим вам код для сброса пароля
            </Text>
            <View style={styles.form}>
            <Text style={[styles.label, { color: theme.text }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="example@email.com"
              placeholderTextColor={theme.secondaryText}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              editable={!loading}
            />

            <PrimaryButton
              title="Отправить код"
              onPress={handleSendResetLink}
              loading={loading}
              variant="cta"
              iconLeft={<Ionicons name="mail-outline" size={20} color={theme.surface} />}
              style={styles.button}
            />

            {/* Ссылка на вход */}
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={[styles.linkText, { color: theme.secondaryText }]}>
                Вспомнили пароль?{' '}
                <Text style={[styles.linkTextBold, { color: theme.primary }]}>Войти</Text>
              </Text>
            </TouchableOpacity>
          </View>
          </View>

          {/* Информация */}
          <View style={[styles.infoBox, { backgroundColor: theme.secondaryBackground }]}>
            <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
            <Text style={[styles.infoText, { color: theme.secondaryText }]}>
              Код действителен в течение 1 часа. Проверьте папку "Спам", если не видите письмо.
            </Text>
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
    paddingTop: 60,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 24,
    zIndex: 10,
    padding: 8,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    borderWidth: 1,
  },
  formCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    ...shadows.cardRaised,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  button: {
    marginTop: 2,
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
  infoBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginTop: 32,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    marginLeft: 12,
    lineHeight: 20,
  },
});


