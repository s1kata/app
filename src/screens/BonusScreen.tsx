import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { bonusService } from '../services/BonusService';
import { BonusTransaction } from '../types';
import { logger } from '../utils/logger';

function formatDate(s: string): string {
  if (!s) return '—';
  const d = s.replace(' ', 'T');
  const date = new Date(d);
  if (isNaN(date.getTime())) return s;
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BonusScreen({ navigation }: any) {
  const { user, theme } = useAppContext();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<BonusTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [activating, setActivating] = useState(false);

  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;
  const email = (user as any)?.email || undefined;
  const phone = (user as any)?.phoneNumber || (user as any)?.phone || undefined;

  const load = useCallback(async () => {
    if (isGuest || (!email && !phone)) {
      setBalance(0);
      setTransactions([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await bonusService.getBonusBalanceAndHistory({ email, phone });
      if (res.success && res.data) {
        setBalance(res.data.balance);
        setTransactions(
          [...(res.data.transactions || [])].sort((a, b) =>
            (b.datetime || '').localeCompare(a.datetime || '')
          )
        );
      } else {
        setError(res.error || i18n.t('bonus.unavailable'));
      }
    } catch (e: any) {
      logger.error('[BonusScreen] load error', e);
      setError(i18n.t('bonus.unavailable'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isGuest, email, phone]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleActivate = async () => {
    const num = cardNumber.trim();
    if (!num) {
      Alert.alert(i18n.t('common.error'), i18n.t('bonus.cardNumber'));
      return;
    }
    setActivating(true);
    try {
      const res = await bonusService.activateBonusCard({ bc_number: num, email, phone });
      if (res.success) {
        Alert.alert(i18n.t('common.success') || 'OK', i18n.t('bonus.activateSuccess'));
        setCardNumber('');
        await load();
      } else {
        Alert.alert(i18n.t('common.error'), res.error || i18n.t('bonus.activateError'));
      }
    } catch (e: any) {
      Alert.alert(i18n.t('common.error'), e?.message || i18n.t('bonus.activateError'));
    } finally {
      setActivating(false);
    }
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.secondaryText }]}>{i18n.t('bonus.history')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={theme.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('bonus.title')}</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />
        }
      >
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.secondaryText }]}>{i18n.t('bonus.balance')}</Text>
          <Text style={[styles.balance, { color: theme.primary }]}>{balance}</Text>
          <Text style={[styles.hint, { color: theme.tertiaryText }]}>{i18n.t('bonus.fromCrm')}</Text>
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: `${theme.error}18`, borderColor: theme.error }]}>
            <Ionicons name="warning-outline" size={20} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        )}

        {!isGuest && (
          <View style={[styles.activateCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 10 }]}>
              {i18n.t('bonus.activateTitle')}
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.secondaryBackground },
              ]}
              placeholder={i18n.t('bonus.cardNumber')}
              placeholderTextColor={theme.tertiaryText}
              value={cardNumber}
              onChangeText={setCardNumber}
              autoCapitalize="characters"
              editable={!activating}
            />
            <TouchableOpacity
              style={[styles.activateBtn, { backgroundColor: theme.primary, opacity: activating ? 0.7 : 1 }]}
              onPress={handleActivate}
              disabled={activating}
            >
              {activating ? (
                <ActivityIndicator size="small" color={theme.surface} />
              ) : (
                <Text style={[styles.activateBtnText, { color: theme.surface }]}>{i18n.t('bonus.activate')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: theme.text }]}>{i18n.t('bonus.history')}</Text>
        {transactions.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="gift-outline" size={48} color={theme.tertiaryText} />
            <Text style={[styles.emptyText, { color: theme.secondaryText }]}>{i18n.t('bonus.noHistory')}</Text>
          </View>
        ) : (
          transactions.map((t) => {
            const isIncrease = t.increase === 1;
            const amount = t.amount ?? 0;
            return (
              <View
                key={`${t.id}-${t.datetime}`}
                style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View style={[styles.rowIcon, { backgroundColor: isIncrease ? `${theme.success}20` : `${theme.warning}20` }]}>
                  <Ionicons
                    name={isIncrease ? 'add-circle' : 'remove-circle'}
                    size={24}
                    color={isIncrease ? theme.success : theme.warning}
                  />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowType, { color: theme.text }]}>
                    {isIncrease ? i18n.t('bonus.accrual') : i18n.t('bonus.deduction')}
                  </Text>
                  <Text style={[styles.rowDate, { color: theme.secondaryText }]}>{formatDate(t.datetime)}</Text>
                  {t.reason ? (
                    <Text style={[styles.rowReason, { color: theme.tertiaryText }]} numberOfLines={2}>
                      {t.reason}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.rowAmount, { color: isIncrease ? theme.success : theme.warning }]}>
                  {isIncrease ? '+' : '-'}{amount}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  scroll: { flexGrow: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  cardLabel: { fontSize: 14, marginBottom: 4 },
  balance: { fontSize: 32, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 14 },
  activateCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  activateBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  activateBtnText: { fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  empty: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rowBody: { flex: 1 },
  rowType: { fontSize: 15, fontWeight: '600' },
  rowDate: { fontSize: 12, marginTop: 2 },
  rowReason: { fontSize: 12, marginTop: 4 },
  rowAmount: { fontSize: 16, fontWeight: '700' },
});
