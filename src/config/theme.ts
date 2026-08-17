// src/config/theme.ts
import { ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Theme {
  primary: string;
  secondary: string;
  deep: string;
  accent: string;
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

/** Светлая тема — OTA-концепт TravelHub (navy / teal / coral) */
const lightTheme: Theme = {
  primary: '#5DA9A4',
  secondary: '#7BC4BF',
  deep: '#12122E',
  accent: '#FF6B6B',
  background: '#FFFFFF',
  secondaryBackground: '#F6F8FB',
  surface: '#FFFFFF',
  text: '#12122E',
  secondaryText: '#64748B',
  tertiaryText: '#94A3B8',
  success: '#27AE60',
  error: '#E74C3C',
  warning: '#F39C12',
  border: 'rgba(18, 18, 46, 0.08)',
  lightGray: '#EEF2F7',
  shadow: '#12122E',
  inactive: '#B8C0CC',
  disabled: 'rgba(184, 192, 204, 0.5)',
  card: '#FFFFFF',
  notification: '#FF6B6B',
  gradient: {
    primary: ['#12122E', '#1A4B8C', '#5DA9A4'],
    secondary: ['#5DA9A4', '#7BC4BF'],
    accent: ['#FF6B6B', '#FF8A80'],
  },
};

/** Тёмная тема — тот же вайб; deep = цвет заголовков (светлый на тёмном фоне) */
const darkTheme: Theme = {
  primary: '#7BC4BF',
  secondary: '#5DA9A4',
  deep: '#F1F5F9',
  accent: '#FF6B6B',
  background: '#0F1218',
  secondaryBackground: '#161B24',
  surface: '#1A2130',
  text: '#F8FAFC',
  secondaryText: '#A8B3C4',
  tertiaryText: '#7B8798',
  success: '#2ECC71',
  error: '#E74C3C',
  warning: '#F39C12',
  border: 'rgba(123, 196, 191, 0.16)',
  lightGray: '#232B3A',
  shadow: '#000000',
  inactive: '#556070',
  disabled: 'rgba(85, 96, 112, 0.5)',
  card: '#1A2130',
  notification: '#FF6B6B',
  gradient: {
    primary: ['#0B0B1A', '#1A3A5C', '#5DA9A4'],
    secondary: ['#5DA9A4', '#7BC4BF'],
    accent: ['#FF6B6B', '#FF8A80'],
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
