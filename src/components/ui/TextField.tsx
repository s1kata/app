/**
 * Поле ввода в стиле дизайн-системы TravelHub.
 * Фон #F5F5F5, скругление 12px, иконка слева, высота 52px.
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { useAppContext } from '../../contexts/AppContext';
import { spacing, radius, typography, touchTargets } from '../../config/designSystem';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  /** Иконка слева (ReactNode) */
  iconLeft?: React.ReactNode;
  /** Иконка справа (ReactNode) */
  iconRight?: React.ReactNode;
  /** Callback при нажатии на всё поле (для picker-like полей) */
  onFieldPress?: () => void;
}

export default function TextField({
  label,
  error,
  containerStyle,
  style,
  iconLeft,
  iconRight,
  onFieldPress,
  ...rest
}: TextFieldProps) {
  const { theme } = useAppContext();

  const inputBg = theme.secondaryBackground;

  const inner = (
    <View
      style={[
        styles.inputRow,
        {
          backgroundColor: inputBg,
          borderColor: error ? theme.error : 'transparent',
          minHeight: touchTargets.input,
        },
      ]}
    >
      {iconLeft ? <View style={styles.iconLeft}>{iconLeft}</View> : null}
      <TextInput
        placeholderTextColor={theme.tertiaryText}
        style={[
          styles.input,
          typography.body,
          {
            color: theme.text,
            flex: 1,
          },
          style,
        ]}
        {...rest}
      />
      {iconRight ? <View style={styles.iconRight}>{iconRight}</View> : null}
    </View>
  );

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text style={[typography.captionBold, { color: theme.secondaryText, marginBottom: spacing.xs }]}>
          {label}
        </Text>
      ) : null}

      {onFieldPress ? (
        <TouchableOpacity onPress={onFieldPress} activeOpacity={0.7}>
          {inner}
        </TouchableOpacity>
      ) : (
        inner
      )}

      {error ? (
        <Text style={[typography.small, { color: theme.error, marginTop: spacing.xxs }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    paddingVertical: spacing.sm,
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
});
