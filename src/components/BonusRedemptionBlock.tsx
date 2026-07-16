import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { i18n } from '../config/i18n';
import { BONUS_RULES, type BonusQuote, clampBonusesStep } from '../config/bonusRules';

interface BonusRedemptionBlockProps {
  theme: {
    card: string;
    border: string;
    text: string;
    secondaryText: string;
    tertiaryText: string;
    primary: string;
    secondaryBackground: string;
    success: string;
    warning: string;
  };
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  bonusesToSpend: number;
  onBonusesChange: (v: number) => void;
  quote: BonusQuote | null;
  formatPrice: (amount: number) => string;
  loading?: boolean;
}

export function BonusRedemptionBlock({
  theme,
  enabled,
  onEnabledChange,
  bonusesToSpend,
  onBonusesChange,
  quote,
  formatPrice,
  loading,
}: BonusRedemptionBlockProps) {
  const max = quote?.maxBonuses ?? 0;
  const min = quote?.minBonuses ?? 0;
  const step = quote?.rules?.sliderStep ?? BONUS_RULES.sliderStep;
  const available = quote?.availableBalance ?? 0;
  const canUse = max > 0 && !loading;

  const adjust = (delta: number) => {
    const next = clampBonusesStep(bonusesToSpend + delta, max, step);
    onBonusesChange(next);
  };

  const setMax = () => {
    if (max <= 0) return;
    onBonusesChange(max);
  };

  const belowMin = enabled && bonusesToSpend > 0 && bonusesToSpend < min;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{i18n.t('bonus.redeemTitle')}</Text>
      <Text style={[styles.subtitle, { color: theme.secondaryText }]}>{i18n.t('bonus.redeemSubtitle')}</Text>

      <Text style={[styles.available, { color: theme.secondaryText }]}>
        {i18n.t('bonus.available')}: {available}
      </Text>

      {!canUse ? (
        <Text style={[styles.noBonuses, { color: theme.tertiaryText }]}>{i18n.t('bonus.noBonuses')}</Text>
      ) : (
        <>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: theme.text }]}>{i18n.t('bonus.useBonuses')}</Text>
            <Switch
              value={enabled}
              onValueChange={onEnabledChange}
              trackColor={{ false: theme.border, true: theme.primary + '80' }}
              thumbColor={enabled ? theme.primary : theme.secondaryBackground}
            />
          </View>

          {enabled && (
            <>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepBtn, { borderColor: theme.border }]}
                  onPress={() => adjust(-step)}
                  disabled={bonusesToSpend <= 0}
                >
                  <Ionicons name="remove" size={20} color={theme.primary} />
                </TouchableOpacity>
                <View style={styles.stepValue}>
                  <Text style={[styles.spendLabel, { color: theme.secondaryText }]}>{i18n.t('bonus.spend')}</Text>
                  <Text style={[styles.spendAmount, { color: theme.text }]}>{bonusesToSpend}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.stepBtn, { borderColor: theme.border }]}
                  onPress={() => adjust(step)}
                  disabled={bonusesToSpend >= max}
                >
                  <Ionicons name="add" size={20} color={theme.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.maxBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary }]}
                  onPress={setMax}
                >
                  <Text style={[styles.maxBtnText, { color: theme.primary }]}>{i18n.t('bonus.max')}</Text>
                </TouchableOpacity>
              </View>

              {belowMin && (
                <Text style={[styles.hint, { color: theme.warning }]}>
                  {i18n.t('bonus.minHint').replace('{min}', String(min))}
                </Text>
              )}

              {quote && bonusesToSpend > 0 && !belowMin && (
                <View style={[styles.summary, { backgroundColor: theme.secondaryBackground }]}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.secondaryText }]}>
                      {i18n.t('bonus.discount')}
                    </Text>
                    <Text style={[styles.summaryDiscount, { color: theme.success }]}>
                      −{formatPrice(quote.discountRub)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.text, fontWeight: '600' }]}>
                      {i18n.t('bonus.toPay')}
                    </Text>
                    <Text style={[styles.summaryPay, { color: theme.primary }]}>
                      {formatPrice(quote.payableRub)}
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 10 },
  available: { fontSize: 14, marginBottom: 12 },
  noBonuses: { fontSize: 14, fontStyle: 'italic' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  switchLabel: { fontSize: 16, fontWeight: '500' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { flex: 1, alignItems: 'center' },
  spendLabel: { fontSize: 12 },
  spendAmount: { fontSize: 20, fontWeight: '700' },
  maxBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  maxBtnText: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 13, marginBottom: 8 },
  summary: { borderRadius: 12, padding: 12, marginTop: 8 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: { fontSize: 14 },
  summaryDiscount: { fontSize: 16, fontWeight: '600' },
  summaryPay: { fontSize: 18, fontWeight: '700' },
});
