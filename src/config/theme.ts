// src/config/theme.ts
import { ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Theme {
  primary: string;      // Основной синий #0066CC
  secondary: string;    // Светлый синий #3399FF
  deep: string;         // Тёмный синий #004999
  accent: string;       // CTA-оранжевый #FF6B00 (кнопки, скидки)
  background: string;
  secondaryBackground: string;
  surface: string;
  text: string;
  secondaryText: string;
  tertiaryText: string;
  success: string;
  error: string;
  warning: string;
  border: string;
  lightGray: string;
  shadow: string;
  inactive: string;
  disabled: string;
  card: string;
  notification: string;
  gradient: {
    primary: string[];
    secondary: string[];
    accent: string[];
  };
}

// Светлая тема: clean travel-стиль (Booking.com / Aviasales)
const lightTheme: Theme = {
  primary: '#0066CC',
  secondary: '#3399FF',
  deep: '#004999',
  accent: '#FF6B00',          // только CTA-кнопки и бейджи скидок
  background: '#F5F7FA',
  secondaryBackground: '#F0F7FF',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  secondaryText: '#666666',
  tertiaryText: '#999999',
  success: '#27AE60',
  error: '#E74C3C',
  warning: '#F39C12',
  border: 'rgba(0, 102, 204, 0.12)',
  lightGray: '#EEF2F7',
  shadow: '#000000',
  inactive: '#BBBBBB',
  disabled: 'rgba(187, 187, 187, 0.5)',
  card: '#FFFFFF',
  notification: '#E74C3C',
  gradient: {
    primary: ['#0066CC', '#3399FF'],
    secondary: ['#3399FF', '#0066CC'],
    accent: ['#FF6B00', '#FF8C33'],
  },
};

// Тёмная тема: тёмный фон, синий + оранжевый акцент
const darkTheme: Theme = {
  primary: '#4DA6FF',
  secondary: '#66B8FF',
  deep: '#0066CC',
  accent: '#FF6B00',
  background: '#1A1A1A',
  secondaryBackground: '#1E2A38',
  surface: '#2C2C2C',
  text: '#FFFFFF',
  secondaryText: '#AAAAAA',
  tertiaryText: '#777777',
  success: '#2ECC71',
  error: '#E74C3C',
  warning: '#F39C12',
  border: 'rgba(77, 166, 255, 0.15)',
  lightGray: '#2A3544',
  shadow: '#000000',
  inactive: '#555555',
  disabled: 'rgba(85, 85, 85, 0.5)',
  card: '#252F3E',
  notification: '#E74C3C',
  gradient: {
    primary: ['#004999', '#0066CC'],
    secondary: ['#0066CC', '#3399FF'],
    accent: ['#FF6B00', '#FF8C33'],
  },
};

class ThemeManager {
  private static instance: ThemeManager;
  private currentMode: ThemeMode = 'light';
  private systemColorScheme: ColorSchemeName = 'light';

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  async setMode(mode: ThemeMode) {
    this.currentMode = mode;
    await AsyncStorage.setItem('themeMode', mode);
  }

  async getMode(): Promise<ThemeMode> {
    try {
      const saved = await AsyncStorage.getItem('themeMode');
      if (saved) {
        this.currentMode = saved as ThemeMode;
      }
      return this.currentMode;
    } catch {
      return 'light';
    }
  }

  setSystemColorScheme(scheme: ColorSchemeName) {
    this.systemColorScheme = scheme;
  }

  getTheme(): Theme {
    let effectiveMode: 'light' | 'dark' = 'light';
    if (this.currentMode === 'auto') {
      effectiveMode = this.systemColorScheme === 'dark' ? 'dark' : 'light';
    } else {
      effectiveMode = this.currentMode;
    }
    return effectiveMode === 'dark' ? darkTheme : lightTheme;
  }

  isDark(): boolean {
    if (this.currentMode === 'auto') {
      return this.systemColorScheme === 'dark';
    }
    return this.currentMode === 'dark';
  }
}

export const themeManager = ThemeManager.getInstance();
export { lightTheme, darkTheme };
