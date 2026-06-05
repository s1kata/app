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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Theme } from '../config/theme';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { UserProfile } from '../types/firestore';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import { normalizeDigits, validatePassportData } from '../utils/validation';

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  editButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: 'normal',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
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
    marginBottom: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
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
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: KeyboardTypeOptions;
  editable?: boolean;
  theme: Theme;
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
            borderColor: theme.border,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.tertiaryText}
        keyboardType={keyboardType}
        editable={editable}
        blurOnSubmit={false}
      />
    </View>
  );
}

export default function PersonalDataScreen({ navigation }: any) {
  const { theme, isDark } = useAppContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

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
        Alert.alert('Ошибка', 'Для доступа к личным данным необходимо войти в систему.');
        return;
      }

      const userData = await AuthService.getCurrentUser();
      if (!personalDataMounted.current) return;

      if (userData) {
        setProfile(userData);
        setFormData({
          name: userData.fullName || '',
          email: userData.email || '',
          phone: userData.phone || '',
          passportSeries: userData.passport?.series || '',
          passportNumber: userData.passport?.number || '',
          passportIssuedBy: userData.passport?.issuedBy || '',
          passportIssuedDate: userData.passport?.issueDate || '',
          birthDate: userData.passport?.birthDate || '',
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
      if (!auth || !db) {
        Alert.alert('Ошибка', 'Сервис недоступен. Проверьте подключение.');
        return;
      }
      // Проверяем авторизацию через Firebase Auth
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.uid) {
        Alert.alert('Ошибка', 'Пользователь не авторизован. Пожалуйста, войдите в систему.');
        return;
      }

      // Проверяем, что это не гость
      if (currentUser.isAnonymous || currentUser.uid.startsWith('guest_')) {
        Alert.alert('Ошибка', 'Для сохранения данных необходимо войти в систему.');
        return;
      }

      if (!formData.name.trim()) {
        Alert.alert('Ошибка', 'Имя обязательно для заполнения');
        return;
      }

      const passportValidationError = validatePassportData({
        series: formData.passportSeries,
        number: formData.passportNumber,
        issuedBy: formData.passportIssuedBy,
        issueDate: formData.passportIssuedDate,
        birthDate: formData.birthDate,
      });
      if (passportValidationError) {
        Alert.alert('Ошибка', passportValidationError);
        return;
      }

      // Подготавливаем данные для сохранения в Firestore
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      const passportData = formData.passportSeries.trim() || formData.passportNumber.trim() || formData.passportIssuedBy.trim() ? {
        series: normalizeDigits(formData.passportSeries.trim()),
        number: normalizeDigits(formData.passportNumber.trim()),
        issuedBy: formData.passportIssuedBy.trim(),
        issueDate: formData.passportIssuedDate.trim(),
        birthDate: formData.birthDate.trim() || undefined,
        birthPlace: formData.birthPlace.trim() || undefined,
      } : undefined;

      if (userDocSnap.exists()) {
        // Обновляем существующий документ в Firestore
        const updateData: any = {
          fullName: formData.name.trim(),
          phone: formData.phone.trim() || null,
          passport: passportData || null,
          updatedAt: new Date().toISOString(),
        };
        
        // Обновляем email только если он изменился
        if (
          formData.email.trim() &&
          formData.email.trim() !== (profile?.email ?? currentUser.email ?? '')
        ) {
          updateData.email = formData.email.trim();
        }
        
        await updateDoc(userDocRef, updateData);
        
        // Обновляем displayName в Firebase Auth
        if (auth.currentUser) {
          await updateAuthProfile(auth.currentUser, {
            displayName: formData.name.trim(),
          });
        }
      } else {
        // Создаем новый документ в Firestore
        const newProfile: UserProfile = {
          id: currentUser.uid,
          email: formData.email.trim() || currentUser.email || '',
          fullName: formData.name.trim(),
          phone: formData.phone.trim() || undefined,
          passwordHash: '', // Для пользователей Firebase Auth может быть пустым
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isActive: true,
          passport: passportData,
        };
        await setDoc(userDocRef, newProfile);
      }
      
      // Обновляем displayName в Firebase Auth (для существующих и новых профилей)
      if (currentUser) {
        try {
          await updateAuthProfile(currentUser, {
            displayName: formData.name.trim(),
          });
        } catch (authError) {
          logger.warn('Не удалось обновить displayName в Firebase Auth:', authError);
          // Продолжаем выполнение, так как данные в Firestore уже сохранены
        }
      }
      
      Alert.alert('Успех', 'Данные сохранены в Firestore');
      setEditing(false);
      loadProfile();
      
    } catch (error: any) {
      logger.error('Error saving profile:', error);
      
      // Более детальная обработка ошибок
      if (error.code === 'permission-denied' || error.message?.includes('permission')) {
        Alert.alert(
          'Ошибка доступа', 
          'Недостаточно прав для сохранения данных. Пожалуйста, убедитесь, что вы авторизованы.'
        );
      } else if (error.code === 'unavailable') {
        Alert.alert('Ошибка сети', 'Нет подключения к интернету. Проверьте соединение и попробуйте снова.');
      } else {
        Alert.alert('Ошибка', `Не удалось сохранить данные: ${error.message || 'Неизвестная ошибка'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setFormData({
        name: profile.fullName || '',
        email: profile.email || '',
        phone: profile.phone || '',
        passportSeries: profile.passport?.series || '',
        passportNumber: profile.passport?.number || '',
        passportIssuedBy: profile.passport?.issuedBy || '',
        passportIssuedDate: profile.passport?.issueDate || '',
        birthDate: profile.passport?.birthDate || '',
        birthPlace: profile.passport?.birthPlace || '',
      });
    }
    setEditing(false);
  };

  const handleEdit = () => {
    setEditing(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar
          style={isDark ? 'light' : 'dark'}
          backgroundColor={theme.background}
        />
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        style={isDark ? 'light' : 'dark'}
        backgroundColor={theme.background}
      />
      
      <ScrollView
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>{i18n.t('personal.title')}</Text>
          {!editing ? (
            <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
              <Ionicons name="create-outline" size={24} color={theme.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <View style={[styles.content, { backgroundColor: theme.background }]}>
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('personal.basicInfo')}</Text>
            
            <PersonalDataInputField
              label={i18n.t('personal.nameRequired')}
              value={formData.name}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
              placeholder={i18n.t('personal.placeholderName')}
              editable={editing}
              theme={theme}
            />

            <PersonalDataInputField
              label="Email"
              value={formData.email}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
              placeholder="email@example.com"
              keyboardType="email-address"
              editable={editing}
              theme={theme}
            />

            <PersonalDataInputField
              label={i18n.t('personal.phone')}
              value={formData.phone}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: text }))}
              placeholder="+7 (999) 123-45-67"
              keyboardType="phone-pad"
              editable={editing}
              theme={theme}
            />
          </View>

          <View style={[styles.section, { backgroundColor: theme.card }]}>
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
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, passportSeries: text }))}
                  placeholder="1234"
                  keyboardType="numeric"
                  editable={editing}
                  theme={theme}
                />
              </View>
              <View style={styles.halfInput}>
                <PersonalDataInputField
                  label={i18n.t('personal.number')}
                  value={formData.passportNumber}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, passportNumber: text }))}
                  placeholder="567890"
                  keyboardType="numeric"
                  editable={editing}
                  theme={theme}
                />
              </View>
            </View>

            <PersonalDataInputField
              label={i18n.t('personal.issuedBy')}
              value={formData.passportIssuedBy}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, passportIssuedBy: text }))}
              placeholder={i18n.t('personal.placeholderIssuedBy')}
              editable={editing}
              theme={theme}
            />

            <PersonalDataInputField
              label={i18n.t('personal.issuedDate')}
              value={formData.passportIssuedDate}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, passportIssuedDate: text }))}
              placeholder={i18n.t('personal.placeholderDate')}
              keyboardType="numeric"
              editable={editing}
              theme={theme}
            />

            <PersonalDataInputField
              label={i18n.t('personal.birthDate')}
              value={formData.birthDate}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, birthDate: text }))}
              placeholder={i18n.t('personal.placeholderDate')}
              keyboardType="numeric"
              editable={editing}
              theme={theme}
            />

            <PersonalDataInputField
              label={i18n.t('personal.birthPlace')}
              value={formData.birthPlace}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, birthPlace: text }))}
              placeholder={i18n.t('personal.placeholderBirthPlace')}
              editable={editing}
              theme={theme}
            />
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