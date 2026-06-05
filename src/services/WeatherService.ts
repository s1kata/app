import { LocationData } from './LocationService';
import { logger } from '../utils/logger';

export interface WeatherData {
  temperature: number;
  description: string;
  icon: string;
  humidity?: number;
  windSpeed?: number;
  feelsLike?: number;
  city?: string;
}

// Open-Meteo API (бесплатный, без ключа)
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export class WeatherService {
  private static instance: WeatherService;
  private cache: Map<string, { data: WeatherData; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 минут

  private constructor() {}

  public static getInstance(): WeatherService {
    if (!WeatherService.instance) {
      WeatherService.instance = new WeatherService();
    }
    return WeatherService.instance;
  }

  /**
   * Получает погоду по координатам (Open-Meteo).
   */
  async getWeatherByCoordinates(latitude: number, longitude: number): Promise<WeatherData | null> {
    try {
      const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;

      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        logger.log('Returning cached weather data');
        return cached.data;
      }

      const url = `${OPEN_METEO_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&timezone=auto`;
      const response = await fetch(url);

      if (!response.ok) {
        logger.warn('Open-Meteo API error:', response.status);
        return null;
      }

      const data = await response.json();
      const current = data?.current;
      if (
        !current ||
        typeof current.weather_code !== 'number' ||
        typeof current.temperature_2m !== 'number'
      ) {
        logger.warn('Open-Meteo API: unexpected or incomplete payload');
        return null;
      }
      const weatherInfo = this.getWeatherInfoFromCode(current.weather_code);

      const weatherData: WeatherData = {
        temperature: Math.round(current.temperature_2m),
        description: weatherInfo.description,
        icon: weatherInfo.icon,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m ? Math.round(current.wind_speed_10m * 3.6) : undefined,
        feelsLike: Math.round(current.temperature_2m),
      };

      this.cache.set(cacheKey, {
        data: weatherData,
        timestamp: Date.now(),
      });

      return weatherData;
    } catch (error) {
      logger.error('Error fetching weather:', error);
      return null;
    }
  }

  /**
   * Конвертирует код погоды WMO (Open-Meteo) в описание и иконку.
   */
  private getWeatherInfoFromCode(code: number): { description: string; icon: string } {
    if (code === 0) return { description: 'ясно', icon: '01d' };
    if (code === 1 || code === 2 || code === 3) return { description: 'переменная облачность', icon: '02d' };
    if (code === 45 || code === 48) return { description: 'туман', icon: '50d' };
    if (code >= 51 && code <= 67) return { description: 'дождь', icon: '10d' };
    if (code >= 71 && code <= 77) return { description: 'снег', icon: '13d' };
    if (code >= 80 && code <= 82) return { description: 'ливень', icon: '09d' };
    if (code >= 85 && code <= 86) return { description: 'снегопад', icon: '13d' };
    if (code >= 95 && code <= 99) return { description: 'гроза', icon: '11d' };
    return { description: 'облачно', icon: '03d' };
  }

  /**
   * Получает погоду по местоположению
   */
  async getWeatherByLocation(location: LocationData): Promise<WeatherData | null> {
    if (!location) {
      return null;
    }
    return await this.getWeatherByCoordinates(location.latitude, location.longitude);
  }


  /**
   * Очищает кеш погоды
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const weatherService = WeatherService.getInstance();
