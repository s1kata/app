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
import { StatusBar } from 'expo-status-bar';
import { platform } from '../utils/platform';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { useAppContext } from '../contexts/AppContext';
import AppLogo from '../components/AppLogo';
import { PrimaryButton, TextField, ScreenHeader } from '../components/ui';
import { radius, shadows, spacing, typography } from '../config/designSystem';

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
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={platform.isIOS ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScreenHeader title="Забыли пароль?" onBack={() => navigation.goBack()} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.brandBlock}>
              <AppLogo size={72} shape="rounded" bordered borderColor={theme.primary} backgroundColor={theme.surface} />
              <Text style={[styles.wordmark, { color: theme.deep }]}>TravelHub</Text>
            </View>

            <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.title, { color: theme.text }]}>Восстановление доступа</Text>
              <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
                Введите ваш email, и мы отправим вам код для сброса пароля
              </Text>

              <TextField
                label="Email"
                placeholder="example@email.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!loading}
                iconLeft={<Ionicons name="mail-outline" size={20} color={theme.secondaryText} />}
              />

              <PrimaryButton
                title="Отправить код"
                onPress={handleSendResetLink}
                loading={loading}
                variant="cta"
                iconLeft={<Ionicons name="mail-outline" size={20} color={theme.surface} />}
                style={styles.button}
              />

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => navigation.navigate('Login')}
                hitSlop={8}
              >
                <Text style={[styles.linkText, { color: theme.secondaryText }]}>
                  Вспомнили пароль?{' '}
                  <Text style={[styles.linkTextBold, { color: theme.primary }]}>Войти</Text>
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.infoBox, { backgroundColor: theme.secondaryBackground }]}>
              <View style={[styles.infoIcon, { backgroundColor: theme.primary + '22' }]}>
                <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
              </View>
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
    paddingBottom: spacing.xxxl,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  wordmark: {
    ...typography.h2,
    marginTop: spacing.md,
  },
  formCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadows.cardRaised,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  button: {
    marginTop: spacing.xs,
  },
  linkButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    ...typography.caption,
  },
  linkTextBold: {
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.xl,
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    ...typography.small,
    lineHeight: 20,
  },
});
