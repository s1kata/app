/**
 * Обёртка экрана: SafeAreaView + StatusBar.
 * Единая точка настройки отступов и статус-бара для всех устройств.
 */

import React from 'react';
import { ViewStyle, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAppContext } from '../contexts/AppContext';

type Edge = 'top' | 'bottom' | 'left' | 'right';

export interface ScreenContainerProps {
  children: React.ReactNode;
  /** Какие границы учитывать (по умолчанию ['top'] для экранов с заголовком) */
  edges?: Edge[];
  style?: ViewStyle;
  /** Фон контейнера (по умолчанию theme.background) */
  backgroundColor?: string;
}

export default function ScreenContainer({
  children,
  edges = ['top', 'bottom'],
  style,
  backgroundColor,
}: ScreenContainerProps) {
  const { theme, isDark } = useAppContext();
  const bg = backgroundColor ?? theme.background;

  return (
    <>
      <StatusBar
        style={isDark ? 'light' : 'dark'}
        backgroundColor={bg}
      />
      <SafeAreaView
        style={[styles.container, { backgroundColor: bg }, style]}
        edges={edges}
      >
        {children}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
