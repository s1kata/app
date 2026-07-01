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
import { getPasswordValidationMessage } from '../utils/validation';
import { radius, shadows } from '../config/designSystem';

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
      edges={['top', 'bottom']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
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
            <Text style={[styles.title, { color: theme.text }]}>Создать новый пароль</Text>
            <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
              Введите код из email и новый пароль
            </Text>
            <View style={styles.form}>
            {/* Код из email */}
            <Text style={[styles.label, { color: theme.text }]}>Код из email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  color: theme.text,
                },
                styles.codeInput,
              ]}
              placeholder="XXXXXX"
              placeholderTextColor={theme.secondaryText}
              value={resetToken}
              onChangeText={(text) => setResetToken(text.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              editable={!loading}
            />

            {/* Новый пароль */}
            <Text style={[styles.label, { color: theme.text }]}>Новый пароль</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Минимум 8 символов и цифра"
                placeholderTextColor={theme.secondaryText}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={24}
                  color={theme.secondaryText}
                />
              </TouchableOpacity>
            </View>

            {/* Подтверждение пароля */}
            <Text style={[styles.label, { color: theme.text }]}>Подтвердите пароль</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="Введите пароль еще раз"
                placeholderTextColor={theme.secondaryText}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={24}
                  color={theme.secondaryText}
                />
              </TouchableOpacity>
            </View>

            {/* Кнопка сброса */}
            <PrimaryButton
              title="Сбросить пароль"
              onPress={handleResetPassword}
              loading={loading}
              variant="cta"
              iconLeft={<Ionicons name="checkmark-circle-outline" size={20} color={theme.surface} />}
              style={styles.button}
            />

            {/* Ссылка на повторную отправку кода */}
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={[styles.linkText, { color: theme.secondaryText }]}>
                Не получили код?{' '}
                <Text style={[styles.linkTextBold, { color: theme.primary }]}>Отправить снова</Text>
              </Text>
            </TouchableOpacity>
          </View>
          </View>

          {/* Информация */}
          <View style={[styles.infoBox, { backgroundColor: theme.secondaryBackground }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
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
    marginBottom: 20,
    borderWidth: 1,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: 'bold',
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    padding: 4,
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
  infoBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    marginLeft: 12,
    lineHeight: 20,
  },
});


