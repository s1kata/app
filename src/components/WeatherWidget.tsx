import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { weatherService, WeatherData } from '../services/WeatherService';
import { locationService, LocationData } from '../services/LocationService';
import { logger } from '../utils/logger';
import { useAppContext } from '../contexts/AppContext';

interface WeatherWidgetProps {
  location?: LocationData | null;
  onRefresh?: () => void;
}

export default function WeatherWidget({ location, onRefresh }: WeatherWidgetProps) {
  const { theme, isDark } = useAppContext();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWeather();
  }, [location]);

  const loadWeather = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let locationToUse = location;
      
      // Если местоположение не передано, пытаемся получить из сервиса
      if (!locationToUse) {
        locationToUse = locationService.getCachedLocation() || await locationService.getSavedLocation();
      }

      if (!locationToUse) {
        setError('Местоположение не определено');
        setIsLoading(false);
        return;
      }

      const weatherData = await weatherService.getWeatherByLocation(locationToUse);
      
      if (weatherData) {
        setWeather(weatherData);
      } else {
        setError('Не удалось загрузить погоду');
      }
    } catch (err) {
      logger.error('Error loading weather:', err);
      setError('Ошибка загрузки погоды');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadWeather();
    if (onRefresh) {
      onRefresh();
    }
  };

  const getWeatherIcon = (iconCode: string): string => {
    // Иконки для кодов Open-Meteo/WMO (бесплатный API, без токена)
    if (iconCode.includes('01')) return 'sunny'; // ясно
    if (iconCode.includes('02')) return 'partly-sunny'; // переменная облачность
    if (iconCode.includes('03') || iconCode.includes('04')) return 'cloudy'; // облачно
    if (iconCode.includes('09') || iconCode.includes('10')) return 'rainy'; // дождь
    if (iconCode.includes('11')) return 'thunderstorm'; // гроза
    if (iconCode.includes('13')) return 'snow'; // снег
    if (iconCode.includes('50')) return 'cloudy-outline'; // туман
    return 'partly-sunny';
  };

  if (isLoading && !weather) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#0066CC" />
        </View>
      </View>
    );
  }

  if (error && !weather) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.errorContainer}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={16} color="#64748B" />
          <Text style={styles.errorText}>{error}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!weather) {
    return null;
  }

  const weatherBg = isDark ? theme.primary : theme.surface;
  const primaryTextColor = isDark ? '#FFFFFF' : theme.text;
  const secondaryTextColor = isDark ? 'rgba(255, 255, 255, 0.9)' : theme.secondaryText;
  const iconColor = isDark ? '#FFFFFF' : theme.primary;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handleRefresh}
      activeOpacity={0.8}
    >
      <View style={[styles.gradient, { backgroundColor: weatherBg }]}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons
              name={getWeatherIcon(weather.icon) as any}
              size={32}
              color={iconColor}
            />
          </View>
          
          <View style={styles.infoContainer}>
            <Text style={[styles.temperature, { color: primaryTextColor }]}>{weather.temperature}°</Text>
            <Text style={[styles.description, { color: secondaryTextColor }]} numberOfLines={1}>
              {weather.description}
            </Text>
            {weather.city && (
              <Text style={[styles.city, { color: secondaryTextColor }]} numberOfLines={1}>
                {weather.city}
              </Text>
            )}
          </View>

          {isLoading && (
            <View style={styles.refreshContainer}>
              <ActivityIndicator size="small" color={iconColor} />
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 132,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0066CC',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
    marginTop: 8,
  },
  gradient: {
    padding: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 8,
  },
  infoContainer: {
    flex: 1,
  },
  temperature: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  description: {
    fontSize: 12,
    opacity: 0.9,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  city: {
    fontSize: 10,
    opacity: 0.8,
    marginTop: 2,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#64748B',
  },
  refreshContainer: {
    marginLeft: 8,
  },
});
