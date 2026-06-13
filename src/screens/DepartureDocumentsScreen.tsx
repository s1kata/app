import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';

// TODO: Закомментировано до получения тестовых данных от заказчика (Никита). Вернуть после настройки API.
// Полная реализация (загрузка ваучеров/билетов из U-ON) временно отключена — см. git history DepartureDocumentsScreen.

export default function DepartureDocumentsScreen({ navigation }: any) {
  const { theme } = useAppContext();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('documents.departureTitle')}</Text>
      </View>
      <View style={styles.centerContent}>
        <View style={[styles.emptyIconContainer, { backgroundColor: theme.secondaryBackground }]}>
          <Ionicons name="document-outline" size={64} color={theme.inactive} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('documents.temporarilyUnavailable')}</Text>
        <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
          {i18n.t('documents.temporarilyUnavailableDesc')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: { marginRight: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, flex: 1 },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
});
