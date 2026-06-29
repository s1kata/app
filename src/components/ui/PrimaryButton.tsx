/**
 * Основная кнопка дизайн-системы TravelHub.
 *
 * variant="primary"  → синяя #0066CC (навигация, второстепенные действия)
 * variant="cta"      → оранжевая #FF6B00 (главные CTA: «Найти», «Забронировать», «Оставить заявку»)
 * outline / danger   → контурные варианты
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { useAppContext } from '../../contexts/AppContext';
import { spacing, radius, typography, touchTargets, shadows } from '../../config/designSystem';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Компактный вариант */
  small?: boolean;
  /** Цветовой вариант кнопки */
  variant?: 'primary' | 'cta';
  /** Outline (контурная) кнопка */
  outline?: boolean;
  /** Danger-вариант (деструктивные действия) */
  danger?: boolean;
  iconLeft?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  small = false,
  variant = 'primary',
  outline = false,
  danger = false,
  iconLeft,
  style,
  textStyle,
}: PrimaryButtonProps) {
  const { theme } = useAppContext();

  const height = small ? touchTargets.buttonSmall : touchTargets.button;

  // Определяем цвет фона
  const getBg = () => {
    if (danger) return theme.error;
    if (variant === 'cta') return theme.accent;   // оранжевый
    return theme.primary;                          // синий
  };

  const bg = getBg();
  const shadowStyle = variant === 'cta' ? shadows.buttonCta : shadows.button;

  const containerStyle: ViewStyle = outline
    ? {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: danger ? theme.error : bg,
        height,
        paddingHorizontal: small ? spacing.md : spacing.xl,
        borderRadius: radius.lg,
      }
    : {
        backgroundColor: disabled ? theme.disabled : bg,
        height,
        paddingHorizontal: small ? spacing.md : spacing.xl,
        borderRadius: radius.lg,
        ...(disabled ? {} : shadowStyle),
      };

  const labelColor = outline
    ? (danger ? theme.error : bg)
    : '#FFFFFF';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      style={[styles.btn, containerStyle, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={outline ? bg : '#fff'} />
      ) : (
        <View style={styles.inner}>
          {iconLeft ? <View style={styles.iconWrap}>{iconLeft}</View> : null}
          <Text
            style={[
              small ? typography.buttonSmall : typography.button,
              { color: labelColor },
              textStyle,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginRight: spacing.xs,
  },
});
