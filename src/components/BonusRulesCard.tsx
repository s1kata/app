import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { i18n } from '../config/i18n';

interface BonusRulesCardProps {
  theme: {
    card: string;
    border: string;
    text: string;
    secondaryText: string;
    primary: string;
  };
  availableBalance?: number;
  expiringWithin7Days?: number;
}

const RULE_KEYS = [
  'bonus.ruleRate',
  'bonus.ruleAccrual',
  'bonus.ruleExpiry',
  'bonus.ruleRedeem',
  'bonus.ruleLimits',
  'bonus.rulePayment',
] as const;

export function BonusRulesCard({ theme, availableBalance, expiringWithin7Days }: BonusRulesCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.titleRow}>
        <Ionicons name="information-circle-outline" size={22} color={theme.primary} />
        <Text style={[styles.title, { color: theme.text }]}>{i18n.t('bonus.howItWorks')}</Text>
      </View>

      {availableBalance != null && (
        <Text style={[styles.available, { color: theme.primary }]}>
          {i18n.t('bonus.available')}: {availableBalance}
        </Text>
      )}
      {(expiringWithin7Days ?? 0) > 0 && (
        <Text style={[styles.expiring, { color: theme.secondaryText }]}>
          {i18n.t('bonus.expiringSoon')}: {expiringWithin7Days}
        </Text>
      )}

      {RULE_KEYS.map((key) => (
        <View key={key} style={styles.ruleRow}>
          <Text style={[styles.bullet, { color: theme.primary }]}>•</Text>
          <Text style={[styles.ruleText, { color: theme.secondaryText }]}>{i18n.t(key)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  available: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  expiring: { fontSize: 13, marginBottom: 12 },
  ruleRow: { flexDirection: 'row', marginBottom: 8, paddingRight: 4 },
  bullet: { fontSize: 16, lineHeight: 22, marginRight: 8 },
  ruleText: { flex: 1, fontSize: 14, lineHeight: 20 },
  footer: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
});
