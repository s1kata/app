import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../contexts/AppContext';
import DateRangeCalendar from '../DateRangeCalendar';
import { formatDateRuLong } from '../../utils/formatDateRu';
import { i18n } from '../../config/i18n';
import { spacing, radius, typography } from '../../config/designSystem';

interface SingleDatePickerFieldProps {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  error?: string;
  required?: boolean;
}

export default function SingleDatePickerField({
  label,
  value,
  onChange,
  error,
  required,
}: SingleDatePickerFieldProps) {
  const { theme } = useAppContext();
  const [open, setOpen] = useState(false);

  const display = formatDateRuLong(value) || i18n.t('ux.pickDate');

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.text }]}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TouchableOpacity
        style={[
          styles.field,
          {
            backgroundColor: theme.secondaryBackground,
            borderColor: error ? theme.error : theme.border,
          },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="calendar-outline" size={22} color={theme.primary} />
        <Text style={[styles.value, { color: value ? theme.text : theme.tertiaryText }]}>{display}</Text>
        <Ionicons name="chevron-down" size={20} color={theme.secondaryText} />
      </TouchableOpacity>
      {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <DateRangeCalendar
          singleDateMode
          initialDateFrom={value || undefined}
          initialDateTo={value || undefined}
          minDate={new Date()}
          onDateRangeSelect={(from) => {
            onChange(from);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.captionBold, marginBottom: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    minHeight: 52,
  },
  value: { ...typography.body, flex: 1 },
  error: { ...typography.caption, marginTop: 4 },
});
