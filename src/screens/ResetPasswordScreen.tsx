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
import { getPasswordValidationMessage } from '../utils/validation';
import { radius, shadows, spacing, typography, touchTargets } from '../config/designSystem';

interface ResetPasswordScreenProps {
  navigation: any;
  route: any;
}

export default function ResetPasswordScreen({ navigation, route: _route }: ResetPasswordScreenProps) {
  const { theme, isDark } = useAppContext();
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validatePassword = (password: string): boolean => !getPasswordValidationMessage(password);

  const handleResetPassword = async () => {
    if (!resetToken) {
      Alert.alert('Ошибка', 'Пожалуйста, введите код из email');
      return;
    }

    if (!newPassword) {
      Alert.alert('Ошибка', 'Пожалуйста, введите новый пароль');
      return;
    }

    if (!validatePassword(newPassword)) {
      Alert.alert('Ошибка', getPasswordValidationMessage(newPassword) || 'Пароль слишком слабый');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const result = await AuthService.resetPassword(resetToken.toUpperCase(), newPassword);

      if (result.success) {
        Alert.alert(
          'Успех',
          'Пароль успешно изменен! Теперь вы можете войти с новым паролем.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
      } else {
        Alert.alert('Ошибка', result.error || 'Не удалось сбросить пароль');
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Произошла ошибка при сбросе пароля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      edges={['bottom']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <KeyboardAvoidingView
        behavior={platform.isIOS ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ScreenHeader title="Новый пароль" onBack={() => navigation.goBack()} />
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
              <Text style={[styles.title, { color: theme.text }]}>Создать новый пароль</Text>
              <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
                Введите код из email и новый пароль
              </Text>

              <TextField
                label="Код из email"
                placeholder="XXXXXX"
                value={resetToken}
                onChangeText={(text) => setResetToken(text.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                editable={!loading}
                style={styles.codeInput}
                iconLeft={<Ionicons name="key-outline" size={20} color={theme.secondaryText} />}
              />

              <TextField
                label="Новый пароль"
                placeholder="Минимум 8 символов и цифра"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
                iconLeft={<Ionicons name="lock-closed-outline" size={20} color={theme.secondaryText} />}
                iconRight={
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={10}
                    style={styles.eyeHit}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={22}
                      color={theme.secondaryText}
                    />
                  </TouchableOpacity>
                }
              />

              <TextField
                label="Подтвердите пароль"
                placeholder="Введите пароль еще раз"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                editable={!loading}
                iconLeft={<Ionicons name="shield-checkmark-outline" size={20} color={theme.secondaryText} />}
                iconRight={
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    hitSlop={10}
                    style={styles.eyeHit}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={22}
                      color={theme.secondaryText}
                    />
                  </TouchableOpacity>
                }
              />

              <PrimaryButton
                title="Сбросить пароль"
                onPress={handleResetPassword}
                loading={loading}
                variant="cta"
                iconLeft={<Ionicons name="checkmark-circle-outline" size={20} color={theme.surface} />}
                style={styles.button}
              />

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => navigation.navigate('ForgotPassword')}
                hitSlop={8}
              >
                <Text style={[styles.linkText, { color: theme.secondaryText }]}>
                  Не получили код?{' '}
                  <Text style={[styles.linkTextBold, { color: theme.primary }]}>Отправить снова</Text>
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.infoBox, { backgroundColor: theme.secondaryBackground }]}>
              <View style={[styles.infoIcon, { backgroundColor: theme.primary + '22' }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
              </View>
              <Text style={[styles.infoText, { color: theme.secondaryText }]}>
                Пароль должен содержать минимум 8 символов и хотя бы одну цифру.
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
  codeInput: {
    textAlign: 'center',
    letterSpacing: 6,
    fontWeight: '700',
  },
  eyeHit: {
    minWidth: touchTargets.iconButton,
    minHeight: touchTargets.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    marginTop: spacing.sm,
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
