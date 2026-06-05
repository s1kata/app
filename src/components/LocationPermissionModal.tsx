import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { locationService, LocationData } from '../services/LocationService';
import { logger } from '../utils/logger';
import { useAppContext } from '../contexts/AppContext';

// Dimensions используется только для локальных размеров (без module-scope деструктуризации)

interface LocationPermissionModalProps {
  visible: boolean;
  onConfirm: (location: LocationData) => void;
  onLocationIncorrect: () => void;
}

export default function LocationPermissionModal({
  visible,
  onConfirm,
  onLocationIncorrect,
}: LocationPermissionModalProps) {
  const { theme } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState<LocationData | null>(null);
  const [locationText, setLocationText] = useState<string>('');

  useEffect(() => {
    if (visible) {
      requestLocation();
    }
  }, [visible]);

  const requestLocation = async () => {
    try {
      setIsLoading(true);
      
      // Проверяем разрешение
      const permissionStatus = await locationService.checkPermission();
      
      if (permissionStatus !== Location.PermissionStatus.GRANTED) {
        // Запрашиваем разрешение
        const newStatus = await locationService.requestPermission();
        
        if (newStatus !== Location.PermissionStatus.GRANTED) {
          Alert.alert(
            'Доступ к местоположению',
            'Для работы приложения необходим доступ к вашему местоположению. Пожалуйста, разрешите доступ в настройках устройства.',
            [
              {
                text: 'Понятно',
                onPress: () => {
                  setIsLoading(false);
                },
              },
            ]
          );
          return;
        }
      }

      // Получаем местоположение
      const location = await locationService.getCurrentLocation();
      
      if (location) {
        setDetectedLocation(location);
        
        // Формируем текст для отображения
        let text = '';
        if (location.city) {
          text = location.city;
          if (location.country) {
            text += `, ${location.country}`;
          }
        } else if (location.country) {
          text = location.country;
        } else {
          text = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
        }
        
        setLocationText(text);
      } else {
        Alert.alert(
          'Ошибка',
          'Не удалось определить ваше местоположение. Пожалуйста, проверьте настройки GPS.',
          [
            {
              text: 'Понятно',
              onPress: () => {
                setIsLoading(false);
              },
            },
          ]
        );
      }
    } catch (error) {
      logger.error('Error requesting location:', error);
      Alert.alert(
        'Ошибка',
        'Произошла ошибка при определении местоположения.',
        [
          {
            text: 'Понятно',
            onPress: () => {
              setIsLoading(false);
            },
          },
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = () => {
    if (detectedLocation) {
      onConfirm(detectedLocation);
    }
  };

  const handleIncorrect = () => {
    onLocationIncorrect();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.card }]}>
          <View style={styles.header}>
            <Ionicons name="location" size={48} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>Определение местоположения</Text>
            <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
              Мы используем ваше местоположение для показа актуальной погоды и персонализации поиска туров
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={[styles.loadingText, { color: theme.secondaryText }]}>Определение местоположения...</Text>
            </View>
          ) : detectedLocation ? (
            <View style={styles.locationContainer}>
              <Ionicons name="checkmark-circle" size={64} color={theme.success} />
              <Text style={[styles.locationLabel, { color: theme.secondaryText }]}>Ваше местоположение:</Text>
              <Text style={[styles.locationText, { color: theme.text }]}>{locationText}</Text>
              
              <Text style={[styles.questionText, { color: theme.text }]}>
                Это ваше текущее местоположение?
              </Text>

              <View style={styles.buttonsContainer}>
                <TouchableOpacity
                  style={[styles.incorrectButton, { backgroundColor: theme.secondaryBackground }]}
                  onPress={handleIncorrect}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.incorrectButtonText, { color: theme.secondaryText }]}>Нет, неверно</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.confirmButton, { shadowColor: theme.primary }]}
                  onPress={handleConfirm}
                  activeOpacity={0.8}
                >
                  <View style={[styles.confirmButtonGradient, { backgroundColor: theme.primary }]}>
                    <Text style={[styles.confirmButtonText, { color: theme.surface }]}>Да, верно</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={48} color={theme.error} />
              <Text style={[styles.errorText, { color: theme.error }]}>
                Не удалось определить местоположение
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  locationContainer: {
    alignItems: 'center',
  },
  locationLabel: {
    fontSize: 14,
    marginTop: 16,
  },
  locationText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  questionText: {
    fontSize: 16,
    marginTop: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
  },
  confirmButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  confirmButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  incorrectButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incorrectButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});
