import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { bonusService } from '../services/BonusService';
import { BonusTransaction } from '../types';
import { BonusRulesCard } from '../components/BonusRulesCard';
import { logger } from '../utils/logger';
import { PrimaryButton, ScreenHeader, TextField } from '../components/ui';
import { radius, shadows, spacing, typography } from '../config/designSystem';

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
  const [availableBalance, setAvailableBalance] = useState(0);
  const [expiringWithin7Days, setExpiringWithin7Days] = useState(0);
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
      setAvailableBalance(0);
      setExpiringWithin7Days(0);
      setTransactions([]);
      setLoading(false);
      return;
    }
    setError(null);
    const LOAD_TIMEOUT_MS = 20_000;
    try {
      const res = await Promise.race([
        bonusService.getBonusBalanceAndHistory({ email, phone }),
        new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: i18n.t('bonus.unavailable') }), LOAD_TIMEOUT_MS)
        ),
      ]);
      if (res.success && res.data) {
        setBalance(res.data.balance);
        setAvailableBalance(res.data.availableBalance ?? res.data.balance);
        setExpiringWithin7Days(res.data.expiringWithin7Days ?? 0);
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
        <ScreenHeader title={i18n.t('bonus.title')} onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.secondaryText }]}>{i18n.t('bonus.history')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScreenHeader title={i18n.t('bonus.title')} onBack={() => navigation.goBack()} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />
        }
      >
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.secondaryText }]}>{i18n.t('bonus.balance')}</Text>
          <Text style={[styles.balance, { color: theme.primary }]}>{availableBalance}</Text>
          {balance !== availableBalance && (
            <Text style={[styles.hint, { color: theme.tertiaryText }]}>
              {i18n.t('bonus.balance')}: {balance} ({i18n.t('bonus.available').toLowerCase()}: {availableBalance})
            </Text>
          )}
          {(expiringWithin7Days ?? 0) > 0 && (
            <Text style={[styles.hint, { color: theme.warning }]}>
              {i18n.t('bonus.expiringSoon')}: {expiringWithin7Days}
            </Text>
          )}
        </View>

        <BonusRulesCard
          theme={theme}
          availableBalance={availableBalance}
          expiringWithin7Days={expiringWithin7Days}
        />

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
            <TextField
              label={i18n.t('bonus.cardNumber')}
              placeholder={i18n.t('bonus.cardNumber')}
              value={cardNumber}
              onChangeText={setCardNumber}
              autoCapitalize="characters"
              editable={!activating}
              iconLeft={<Ionicons name="card-outline" size={20} color={theme.secondaryText} />}
            />
            <PrimaryButton
              title={i18n.t('bonus.activate')}
              onPress={handleActivate}
              loading={activating}
              variant="cta"
            />
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
                  {t.amount_till_date && t.increase === 1 ? (
                    <Text style={[styles.rowReason, { color: theme.tertiaryText }]}>
                      {i18n.t('bonus.expiresOn')} {formatDate(t.amount_till_date)}
                    </Text>
                  ) : null}
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
  scroll: { flexGrow: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  loadingText: { ...typography.caption },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  cardLabel: { ...typography.caption, marginBottom: spacing.xxs },
  balance: { ...typography.hero, fontSize: 32 },
  hint: { ...typography.small, marginTop: spacing.xs, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  errorText: { flex: 1, ...typography.caption },
  activateCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
  empty: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  emptyText: { ...typography.caption },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.xs,
    minHeight: 64,
    ...shadows.card,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  rowBody: { flex: 1 },
  rowType: { ...typography.bodyBold },
  rowDate: { ...typography.small, marginTop: 2 },
  rowReason: { ...typography.small, marginTop: spacing.xxs },
  rowAmount: { ...typography.bodyBold },
});
