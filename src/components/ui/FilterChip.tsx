/**
 * Чип-фильтр (страны, звёзды, сегменты).
 */
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppContext } from '../../contexts/AppContext';
import { radius, spacing } from '../../config/designSystem';

type Props = {
  label: string;
  active?: boolean;
  onPress: () => void;
  style?: ViewStyle;
};

export default function FilterChip({ label, active, onPress, style }: Props) {
  const { theme } = useAppContext();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.primary : theme.card,
          borderColor: active ? theme.primary : theme.border,
        },
        style,
      ]}
    >
      <Text style={{ color: active ? '#fff' : theme.secondaryText, fontWeight: '700', fontSize: 13 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
});
