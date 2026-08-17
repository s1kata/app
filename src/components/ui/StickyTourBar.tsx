/**
 * Нижняя sticky-панель: цена за тур + CTA (концепт отеля / тура).
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../../contexts/AppContext';
import { settingsService } from '../../services/SettingsService';
import type { Currency } from '../../services/SettingsService';
import { radius, shadows, spacing, typography } from '../../config/designSystem';
import PrimaryButton from './PrimaryButton';

type Props = {
  price: number;
  /** ISO currency code for display symbol (defaults to app setting). */
  currency?: Currency;
  priceCaption?: string;
  buttonTitle: string;
  onPress: () => void;
  loading?: boolean;
  style?: ViewStyle;
};

export default function StickyTourBar({
  price,
  currency: currencyProp,
  priceCaption = 'цена за тур',
  buttonTitle,
  onPress,
  loading,
  style,
}: Props) {
  const { theme, currency: appCurrency } = useAppContext();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const compact = screenWidth < 360;
  const currency = currencyProp || appCurrency;
  const symbol = settingsService.getCurrencySymbol(currency);

  return (
    <View
      style={[
        styles.bar,
        shadows.cardRaised,
        {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
        style,
      ]}
    >
      <View style={styles.priceCol}>
        <Text
          style={[typography.h3, { color: theme.deep || theme.text, fontSize: compact ? 16 : undefined }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {price > 0 ? `от ${price.toLocaleString('ru-RU')} ${symbol}` : 'Туры с ценой'}
        </Text>
        <Text style={[styles.cap, { color: theme.secondaryText }]} numberOfLines={1}>
          {price > 0 ? priceCaption : 'откройте предложения'}
        </Text>
      </View>
      <PrimaryButton
        title={buttonTitle}
        onPress={onPress}
        variant="cta"
        loading={loading}
        style={[styles.btn, compact && styles.btnCompact]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  priceCol: { flex: 1, minWidth: 0 },
  cap: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  btn: { minWidth: 136, maxWidth: '52%', flexShrink: 1, borderRadius: radius.lg },
  btnCompact: { minWidth: 112, paddingHorizontal: spacing.md },
});
