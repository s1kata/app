import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import { spacing, radius, typography } from '../../config/designSystem';

interface BookingWizardProgressProps {
  currentStep: number;
  totalSteps?: number;
  labels?: string[];
  /** «1 из 5 · Откуда» — как на travelhub63.ru */
  showCurrentLabelInHeader?: boolean;
}

export default function BookingWizardProgress({
  currentStep,
  totalSteps = 3,
  labels,
  showCurrentLabelInHeader = false,
}: BookingWizardProgressProps) {
  const { theme } = useAppContext();
  const stepLabels = labels ?? [
    i18n.t('ux.wizardStepAuth'),
    i18n.t('ux.wizardStepPassport'),
    i18n.t('ux.wizardStepConfirm'),
  ];
  const effectiveTotal = labels ? totalSteps : 3;

  const safeStep = Math.min(Math.max(1, currentStep), effectiveTotal);
  const currentLabel = stepLabels[safeStep - 1] ?? '';

  const headerText = showCurrentLabelInHeader
    ? i18n
        .t('ux.wizardStepOfLabel')
        .replace('{current}', String(safeStep))
        .replace('{total}', String(effectiveTotal))
        .replace('{label}', currentLabel)
    : i18n
        .t('ux.wizardStepOf')
        .replace('{current}', String(safeStep))
        .replace('{total}', String(effectiveTotal));

  return (
    <View style={styles.wrap}>
      <Text style={[styles.header, { color: theme.secondaryText }]}>{headerText}</Text>
      <View style={styles.row}>
        {stepLabels.slice(0, effectiveTotal).map((label, index) => {
          const stepNum = index + 1;
          const active = stepNum === safeStep;
          const done = stepNum < safeStep;
          return (
            <View key={`${label}-${index}`} style={styles.stepCol}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: active || done ? theme.primary : theme.border,
                  },
                ]}
              />
              <Text
                style={[
                  styles.label,
                  {
                    color: active ? theme.text : theme.secondaryText,
                    fontWeight: active ? '700' : '400',
                  },
                ]}
                numberOfLines={2}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: theme.primary,
              width: effectiveTotal <= 1 ? '0%' : `${((safeStep - 1) / (effectiveTotal - 1)) * 100}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  header: { ...typography.caption, marginBottom: spacing.sm, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  stepCol: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 6 },
  label: { ...typography.caption, textAlign: 'center', fontSize: 10 },
  track: { height: 4, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },
});
