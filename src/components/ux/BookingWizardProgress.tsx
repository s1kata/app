import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import { spacing, radius, typography } from '../../config/designSystem';

interface BookingWizardProgressProps {
  currentStep: 1 | 2 | 3;
  labels?: [string, string, string];
}

export default function BookingWizardProgress({ currentStep, labels }: BookingWizardProgressProps) {
  const { theme } = useAppContext();
  const steps = labels || [
    i18n.t('ux.wizardStepAuth'),
    i18n.t('ux.wizardStepPassport'),
    i18n.t('ux.wizardStepConfirm'),
  ];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.header, { color: theme.secondaryText }]}>
        {i18n.t('ux.wizardStepOf').replace('{current}', String(currentStep)).replace('{total}', '3')}
      </Text>
      <View style={styles.row}>
        {steps.map((label, index) => {
          const stepNum = (index + 1) as 1 | 2 | 3;
          const active = stepNum === currentStep;
          const done = stepNum < currentStep;
          return (
            <View key={label} style={styles.stepCol}>
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
              width: `${((currentStep - 1) / 2) * 100}%`,
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
  stepCol: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 6 },
  label: { ...typography.caption, textAlign: 'center', fontSize: 11 },
  track: { height: 4, borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },
});
