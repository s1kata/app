import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardTypeOptions,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBottomSafeInset } from '../utils/safeAreaInsets';
import type { Theme } from '../config/theme';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { AuthService } from '../services/AuthService';
import { UserProfile } from '../types/firestore';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import {
  formatPhoneRu,
  normalizeDigits,
  validatePersonalDataForm,
  type PersonalFormErrors,
} from '../utils/validation';
import { platform } from '../utils/platform';
import { ScreenHeader } from '../components/ui';
import { radius, shadows, spacing, typography, touchTargets } from '../config/designSystem';
import { navigateRoot } from '../utils/navHelpers';
import {
  formatPickerLocalDay,
  parseFlexibleDateLocal,
  toDDMMYYYY,
} from '../utils/dateYmd';

// Локальный тип для формы (все поля обязательные)
interface FormData {
  name: string;
  email: string;
  phone: string;
  passportSeries: string;
  passportNumber: string;
  passportIssuedBy: string;
  passportIssuedDate: string;
  birthDate: string;
  birthPlace: string;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flexGrow: 1,
  },
  content: {
    padding: spacing.lg,
  },
  section: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(18, 18, 46, 0.08)',
    ...shadows.card,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.lg,
  },
  sectionSubtitle: {
    ...typography.caption,
    fontWeight: '400',
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    ...typography.captionBold,
    marginBottom: spacing.xxs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    minHeight: touchTargets.input,
  },
  passportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    minHeight: touchTargets.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    ...typography.button,
  },
  saveButton: {
    flex: 1,
    borderRadius: radius.lg,
    minHeight: touchTargets.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    ...typography.button,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  noteText: {
    flex: 1,
    ...typography.caption,
    lineHeight: 20,
  },
  dateFieldRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTargets.input,
  },
  dateFieldValue: {
    fontSize: 16,
    flex: 1,
    marginRight: spacing.xs,
  },
  fieldError: {
    ...typography.small,
    color: '#E74C3C',
    marginTop: 4,
  },
  inputError: {
    borderColor: '#E74C3C',
  },
  iosPickerSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.sm,
  },
  iosPickerToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iosPickerDone: {
    ...typography.bodyBold,
  },
  iosPickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18,18,46,0.35)',
  },
});

/** Вне компонента экрана: иначе при каждом setState создаётся новый тип и TextInput размонтируется (клавиатура закрывается). */
function PersonalDataInputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  editable = true,
  theme,
  error,
  maxLength,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: KeyboardTypeOptions;
  editable?: boolean;
  theme: Theme;
  error?: string;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.secondaryBackground,
            color: theme.text,
            borderColor: error ? '#E74C3C' : theme.border,
          },
          error ? styles.inputError : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.tertiaryText}
        keyboardType={keyboardType}
        editable={editable}
        blurOnSubmit={false}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function PersonalDataDateField({
  label,
  value,
  onChange,
  placeholder,
  editable = true,
  theme,
  isDark = false,
  maximumDate,
  minimumDate,
  error,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  editable?: boolean;
  theme: Theme;
  isDark?: boolean;
  maximumDate?: Date;
  minimumDate?: Date;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseFlexibleDateLocal(value);
  const [draft, setDraft] = useState<Date>(() => parsed || new Date(1990, 0, 1, 12, 0, 0, 0));

  useEffect(() => {
    if (open) {
      setDraft(parseFlexibleDateLocal(value) || new Date(1990, 0, 1, 12, 0, 0, 0));
    }
  }, [open, value]);

  const commit = (date: Date) => {
    // Только календарный день в локальной TZ — иначе iOS даёт ±1 день
    onChange(formatPickerLocalDay(date));
  };

  const onAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setOpen(false);
    if (event.type === 'set' && selected) {
      commit(selected);
    }
  };

  const onIosChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) {
      setDraft(
        new Date(
          selected.getFullYear(),
          selected.getMonth(),
          selected.getDate(),
          12,
          0,
          0,
          0,
        ),
      );
    }
  };

  return (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: theme.secondaryText }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.dateFieldRow,
          {
            backgroundColor: theme.secondaryBackground,
            borderColor: error ? '#E74C3C' : theme.border,
            opacity: editable ? 1 : 0.85,
          },
        ]}
        activeOpacity={editable ? 0.7 : 1}
        disabled={!editable}
        onPress={() => setOpen(true)}
      >
        <Text
          style={[
            styles.dateFieldValue,
            { color: value ? theme.text : theme.tertiaryText },
          ]}
        >
          {toDDMMYYYY(value) || placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={theme.primary} />
      </TouchableOpacity>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}

      {open && platform.isAndroid ? (
        <DateTimePicker
          value={draft}
          mode="date"
          display="calendar"
          onChange={onAndroidChange}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
        />
      ) : null}

      {platform.isIOS ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={styles.iosPickerBackdrop}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
            <View style={[styles.iosPickerSheet, { backgroundColor: theme.card }]}>
              <View style={[styles.iosPickerToolbar, { borderBottomColor: theme.border }]}>
                <TouchableOpacity
                  onPress={() => {
                    commit(draft);
                    setOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.iosPickerDone, { color: theme.primary }]}>
                    {i18n.t('common.ok')}
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                onChange={onIosChange}
                maximumDate={maximumDate}
                minimumDate={minimumDate}
                themeVariant={isDark ? 'dark' : 'light'}
                locale="ru_RU"
                style={{ height: 216 }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export default function PersonalDataScreen({ navigation }: any) {
  const { theme, isDark, user } = useAppContext();
  const insets = useSafeAreaInsets();
  const scrollBottomPad = getBottomSafeInset(insets, 16) + 24;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<PersonalFormErrors>({});

  // Форма - используем локальный тип FormData
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    passportSeries: '',
    passportNumber: '',
    passportIssuedBy: '',
    passportIssuedDate: '',
    birthDate: '',
    birthPlace: '',
  });

  const clearFieldError = (key: keyof PersonalFormErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key] && !prev.form) return prev;
      const next = { ...prev };
      delete next[key];
      delete next.form;
      return next;
    });
  };

  const personalDataMounted = useRef(true);

  useEffect(() => {
    personalDataMounted.current = true;
    loadProfile();
    return () => {
      personalDataMounted.current = false;
    };
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      if (!user?.uid || user.isAnonymous || user.uid.startsWith('guest_')) {
        Alert.alert('Ошибка', 'Для доступа к личным данным необходимо войти в систему.', [
          {
            text: 'OK',
            onPress: () => {
              if (navigation.canGoBack?.()) {
                navigation.goBack();
              } else {
                navigateRoot(navigation, 'Login');
              }
            },
          },
        ]);
        return;
      }

      const userData = await AuthService.getCurrentUser(true);
      if (!personalDataMounted.current) return;

      if (userData) {
        setProfile(userData);
        setFormData({
          name: userData.fullName || '',
          email: userData.email || '',
          phone: userData.phone ? formatPhoneRu(userData.phone) : '',
          passportSeries: userData.passport?.series || '',
          passportNumber: userData.passport?.number || '',
          passportIssuedBy: userData.passport?.issuedBy || '',
          passportIssuedDate: toDDMMYYYY(userData.passport?.issueDate || ''),
          birthDate: toDDMMYYYY(userData.passport?.birthDate || ''),
          birthPlace: userData.passport?.birthPlace || '',
        });
      }
    } catch (error: unknown) {
      logger.error('Error loading profile:', error);
      if (!personalDataMounted.current) return;
      Alert.alert('Ошибка', `Не удалось загрузить данные: ${(error as Error)?.message || 'Неизвестная ошибка'}`);
    } finally {
      if (personalDataMounted.current) setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (!user?.uid || user.isAnonymous || user.uid.startsWith('guest_')) {
        Alert.alert('Ошибка', 'Для сохранения данных необходимо войти в систему.');
        return;
      }

      const errors = validatePersonalDataForm({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        passportSeries: formData.passportSeries,
        passportNumber: formData.passportNumber,
        passportIssuedBy: formData.passportIssuedBy,
        passportIssuedDate: formData.passportIssuedDate,
        birthDate: formData.birthDate,
        birthPlace: formData.birthPlace,
        // Для бронирований паспорт нужен целиком — требуем при любом сохранении профиля
        requirePassport: true,
      });

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        Alert.alert(
          'Проверьте данные',
          errors.form ||
            Object.values(errors)[0] ||
            'Заполните поля по требованиям (как в паспорте РФ).'
        );
        return;
      }
      setFieldErrors({});

      const series = normalizeDigits(formData.passportSeries.trim());
      const number = normalizeDigits(formData.passportNumber.trim());
      const passportData = {
        series,
        number,
        issuedBy: formData.passportIssuedBy.trim().replace(/\s+/g, ' '),
        issueDate: toDDMMYYYY(formData.passportIssuedDate.trim()),
        birthDate: toDDMMYYYY(formData.birthDate.trim()),
        birthPlace: formData.birthPlace.trim().replace(/\s+/g, ' '),
      };

      const ok = await AuthService.updateProfile(user.uid, {
        fullName: formData.name.trim().replace(/\s+/g, ' '),
        phone: formatPhoneRu(formData.phone),
        email:
          formData.email.trim() && formData.email.trim() !== (profile?.email ?? '')
            ? formData.email.trim()
            : undefined,
        passport: passportData,
      });

      if (!ok) {
        Alert.alert('Ошибка', 'Не удалось сохранить данные на сервере.');
        return;
      }

      Alert.alert('Успех', 'Данные сохранены');
      setEditing(false);
      await loadProfile();
    } catch (error: unknown) {
      logger.error('Error saving profile:', error);
      Alert.alert('Ошибка', `Не удалось сохранить данные: ${(error as Error)?.message || 'Неизвестная ошибка'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setFormData({
        name: profile.fullName || '',
        email: profile.email || '',
        phone: profile.phone ? formatPhoneRu(profile.phone) : '',
        passportSeries: profile.passport?.series || '',
        passportNumber: profile.passport?.number || '',
        passportIssuedBy: profile.passport?.issuedBy || '',
        passportIssuedDate: toDDMMYYYY(profile.passport?.issueDate || ''),
        birthDate: toDDMMYYYY(profile.passport?.birthDate || ''),
        birthPlace: profile.passport?.birthPlace || '',
      });
    }
    setFieldErrors({});
    setEditing(false);
  };

  const handleEdit = () => {
    setEditing(true);
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar
          style={isDark ? 'light' : 'dark'}
          backgroundColor={theme.background}
        />
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        style={isDark ? 'light' : 'dark'}
        backgroundColor={theme.background}
      />

      <ScreenHeader
        title={i18n.t('personal.title')}
        onBack={() => navigation.goBack()}
        right={
          !editing ? (
            <TouchableOpacity onPress={handleEdit} hitSlop={10} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="create-outline" size={22} color={theme.primary} />
            </TouchableOpacity>
          ) : undefined
        }
      />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: scrollBottomPad }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.content, { backgroundColor: theme.background }]}>
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('personal.basicInfo')}</Text>
            
            <PersonalDataInputField
              label={i18n.t('personal.nameRequired')}
              value={formData.name}
              onChangeText={(text) => {
                clearFieldError('name');
                // Только буквы/пробел/дефис/апостроф
                const cleaned = text.replace(/[^A-Za-zА-Яа-яЁёІіЇїЄєҐґ'’\- ]+/gu, '');
                setFormData((prev) => ({ ...prev, name: cleaned }));
              }}
              placeholder={i18n.t('personal.placeholderName')}
              editable={editing}
              theme={theme}
              error={fieldErrors.name}
              maxLength={100}
              autoCapitalize="words"
            />

            <PersonalDataInputField
              label="Email"
              value={formData.email}
              onChangeText={(text) => {
                clearFieldError('email');
                setFormData((prev) => ({ ...prev, email: text.replace(/\s+/g, '') }));
              }}
              placeholder="email@example.com"
              keyboardType="email-address"
              editable={editing}
              theme={theme}
              error={fieldErrors.email}
              maxLength={254}
              autoCapitalize="none"
            />

            <PersonalDataInputField
              label={i18n.t('personal.phone')}
              value={formData.phone}
              onChangeText={(text) => {
                clearFieldError('phone');
                setFormData((prev) => ({ ...prev, phone: formatPhoneRu(text) }));
              }}
              placeholder="+7 (999) 123-45-67"
              keyboardType="phone-pad"
              editable={editing}
              theme={theme}
              error={fieldErrors.phone}
              maxLength={18}
              autoCapitalize="none"
            />
          </View>

          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {i18n.t('personal.passportData')}
              <Text style={[styles.sectionSubtitle, { color: theme.secondaryText }]}>
                {' '}({i18n.t('personal.passportNote')})
              </Text>
            </Text>

            <View style={styles.passportRow}>
              <View style={[styles.halfInput, { marginRight: 8 }]}>
                <PersonalDataInputField
                  label={i18n.t('personal.series')}
                  value={formData.passportSeries}
                  onChangeText={(text) => {
                    clearFieldError('passportSeries');
                    setFormData((prev) => ({
                      ...prev,
                      passportSeries: normalizeDigits(text).slice(0, 4),
                    }));
                  }}
                  placeholder="1234"
                  keyboardType="numeric"
                  editable={editing}
                  theme={theme}
                  error={fieldErrors.passportSeries}
                  maxLength={4}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.halfInput}>
                <PersonalDataInputField
                  label={i18n.t('personal.number')}
                  value={formData.passportNumber}
                  onChangeText={(text) => {
                    clearFieldError('passportNumber');
                    setFormData((prev) => ({
                      ...prev,
                      passportNumber: normalizeDigits(text).slice(0, 7),
                    }));
                  }}
                  placeholder="567890"
                  keyboardType="numeric"
                  editable={editing}
                  theme={theme}
                  error={fieldErrors.passportNumber}
                  maxLength={7}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <PersonalDataInputField
              label={i18n.t('personal.issuedBy')}
              value={formData.passportIssuedBy}
              onChangeText={(text) => {
                clearFieldError('passportIssuedBy');
                setFormData((prev) => ({ ...prev, passportIssuedBy: text }));
              }}
              placeholder={i18n.t('personal.placeholderIssuedBy')}
              editable={editing}
              theme={theme}
              error={fieldErrors.passportIssuedBy}
              maxLength={200}
            />

            <PersonalDataDateField
              label={i18n.t('personal.issuedDate')}
              value={formData.passportIssuedDate}
              onChange={(text) => {
                clearFieldError('passportIssuedDate');
                setFormData((prev) => ({ ...prev, passportIssuedDate: text }));
              }}
              placeholder={i18n.t('personal.placeholderDate')}
              editable={editing}
              theme={theme}
              isDark={isDark}
              maximumDate={new Date()}
              minimumDate={parseFlexibleDateLocal(formData.birthDate) || new Date(1950, 0, 1, 12)}
              error={fieldErrors.passportIssuedDate}
            />

            <PersonalDataDateField
              label={i18n.t('personal.birthDate')}
              value={formData.birthDate}
              onChange={(text) => {
                clearFieldError('birthDate');
                setFormData((prev) => ({ ...prev, birthDate: text }));
              }}
              placeholder={i18n.t('personal.placeholderDate')}
              editable={editing}
              theme={theme}
              isDark={isDark}
              maximumDate={new Date()}
              minimumDate={new Date(1920, 0, 1, 12)}
              error={fieldErrors.birthDate}
            />

            <PersonalDataInputField
              label={i18n.t('personal.birthPlace')}
              value={formData.birthPlace}
              onChangeText={(text) => {
                clearFieldError('birthPlace');
                setFormData((prev) => ({ ...prev, birthPlace: text }));
              }}
              placeholder={i18n.t('personal.placeholderBirthPlace')}
              editable={editing}
              theme={theme}
              error={fieldErrors.birthPlace}
              maxLength={120}
            />
            {fieldErrors.form ? (
              <Text style={[styles.fieldError, { marginBottom: spacing.sm }]}>{fieldErrors.form}</Text>
            ) : null}
          </View>

          {editing && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={handleCancel}
                disabled={saving}
              >
                <Text style={[styles.cancelButtonText, { color: theme.secondaryText }]}>
                  {i18n.t('common.cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.primary }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={theme.surface} />
                ) : (
                  <Text style={[styles.saveButtonText, { color: theme.surface }]}>{i18n.t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.note, { backgroundColor: theme.primary + '22' }]}>
            <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
            <Text style={[styles.noteText, { color: theme.text }]}>
              Все данные хранятся в безопасности и используются только для оформления бронирований.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}