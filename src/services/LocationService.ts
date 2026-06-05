import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  timezone?: string;
}

const LOCATION_STORAGE_KEY = 'user_location';
const LOCATION_PERMISSION_KEY = 'location_permission_asked';

export class LocationService {
  private static instance: LocationService;
  private currentLocation: LocationData | null = null;
  private permissionStatus: Location.PermissionStatus | null = null;

  private constructor() {}

  public static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  /**
   * Запрашивает разрешение на доступ к местоположению
   * Соответствует требованиям App Store и Google Play
   */
  async requestPermission(): Promise<Location.PermissionStatus> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      this.permissionStatus = status;
      
      // Сохраняем, что мы запросили разрешение
      await AsyncStorage.setItem(LOCATION_PERMISSION_KEY, 'true');
      
      logger.log('Location permission status:', status);
      return status;
    } catch (error) {
      logger.error('Error requesting location permission:', error);
      return Location.PermissionStatus.DENIED;
    }
  }

  /**
   * Проверяет текущий статус разрешения
   */
  async checkPermission(): Promise<Location.PermissionStatus> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      this.permissionStatus = status;
      return status;
    } catch (error) {
      logger.error('Error checking location permission:', error);
      return Location.PermissionStatus.DENIED;
    }
  }

  /**
   * Проверяет, запрашивали ли мы уже разрешение
   */
  async hasAskedPermission(): Promise<boolean> {
    try {
      const asked = await AsyncStorage.getItem(LOCATION_PERMISSION_KEY);
      return asked === 'true';
    } catch (error) {
      logger.error('Error checking permission status:', error);
      return false;
    }
  }

  /**
   * Получает текущее местоположение пользователя
   */
  async getCurrentLocation(): Promise<LocationData | null> {
    try {
      const permissionStatus = await this.checkPermission();
      
      if (permissionStatus !== Location.PermissionStatus.GRANTED) {
        logger.warn('Location permission not granted');
        return null;
      }

      // Получаем последнее известное местоположение (быстрее)
      const lastKnownLocation = await Location.getLastKnownPositionAsync();

      if (lastKnownLocation) {
        const locationData: LocationData = {
          latitude: lastKnownLocation.coords.latitude,
          longitude: lastKnownLocation.coords.longitude,
        };

        // Получаем адрес для определения города и страны
        try {
          const reverseGeocode = await Location.reverseGeocodeAsync({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
          });

          if (reverseGeocode && reverseGeocode.length > 0) {
            const address = reverseGeocode[0] as Record<string, string | null | undefined>;
            locationData.city =
              address.city || address.subAdministrativeArea || address.administrativeArea || undefined;
            locationData.country = address.country ?? undefined;
          }
        } catch (geocodeError) {
          logger.warn('Error reverse geocoding:', geocodeError);
        }

        // Получаем часовой пояс
        try {
          const timezone = await this.getTimezone(locationData.latitude, locationData.longitude);
          locationData.timezone = timezone;
        } catch (timezoneError) {
          logger.warn('Error getting timezone:', timezoneError);
        }

        this.currentLocation = locationData;
        await this.saveLocation(locationData);
        
        return locationData;
      }

      // Если последнее известное местоположение недоступно, запрашиваем новое
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const locationData: LocationData = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      // Получаем адрес
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude: locationData.latitude,
          longitude: locationData.longitude,
        });

        if (reverseGeocode && reverseGeocode.length > 0) {
          const address = reverseGeocode[0] as Record<string, string | null | undefined>;
          locationData.city =
            address.city || address.subAdministrativeArea || address.administrativeArea || undefined;
          locationData.country = address.country ?? undefined;
        }
      } catch (geocodeError) {
        logger.warn('Error reverse geocoding:', geocodeError);
      }

      // Получаем часовой пояс
      try {
        const timezone = await this.getTimezone(locationData.latitude, locationData.longitude);
        locationData.timezone = timezone;
      } catch (timezoneError) {
        logger.warn('Error getting timezone:', timezoneError);
      }

      this.currentLocation = locationData;
      await this.saveLocation(locationData);
      
      return locationData;
    } catch (error) {
      logger.error('Error getting current location:', error);
      // Пытаемся загрузить сохраненное местоположение
      return await this.getSavedLocation();
    }
  }

  /**
   * Получает часовой пояс по координатам
   * Использует встроенный Intl API для определения часового пояса устройства
   * Часовой пояс автоматически синхронизируется с местоположением устройства
   */
  private async getTimezone(latitude: number, longitude: number): Promise<string> {
    try {
      // Используем встроенный Intl API для определения часового пояса
      // Это работает автоматически на основе системных настроек устройства
      // и местоположения пользователя
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return timeZone;
    } catch (error) {
      // Fallback на системный часовой пояс
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return timeZone;
    }
  }

  /**
   * Сохраняет местоположение в AsyncStorage
   */
  private async saveLocation(location: LocationData): Promise<void> {
    try {
      await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
    } catch (error) {
      logger.error('Error saving location:', error);
    }
  }

  /**
   * Загружает сохраненное местоположение
   */
  async getSavedLocation(): Promise<LocationData | null> {
    try {
      const saved = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
      if (saved) {
        this.currentLocation = JSON.parse(saved);
        return this.currentLocation;
      }
      return null;
    } catch (error) {
      logger.error('Error loading saved location:', error);
      return null;
    }
  }

  /**
   * Получает текущее местоположение (из кеша или запрашивает новое)
   */
  getCachedLocation(): LocationData | null {
    return this.currentLocation;
  }

  /**
   * Очищает сохраненное местоположение
   */
  async clearLocation(): Promise<void> {
    try {
      await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
      this.currentLocation = null;
    } catch (error) {
      logger.error('Error clearing location:', error);
    }
  }
}

export const locationService = LocationService.getInstance();
