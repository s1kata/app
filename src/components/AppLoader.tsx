import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppContext } from '../contexts/AppContext';

interface AppLoaderProps {
  /** Текст под спиннером */
  message?: string;
}

/**
 * Общий полноэкранный индикатор загрузки для списков отелей, туров, деталей и т.д.
 */
export default function AppLoader({ message = 'Загрузка...' }: AppLoaderProps) {
  const { theme } = useAppContext();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={[styles.text, { color: theme.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
});
