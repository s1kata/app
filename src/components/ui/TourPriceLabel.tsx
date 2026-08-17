/**
 * Подпись цены тура — чтобы не путали с «за отель / ночь».
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppContext } from '../../contexts/AppContext';
import { typography } from '../../config/designSystem';

type Props = {
  amount: number;
  currencySymbol?: string;
  /** Показать «от» перед суммой */
  fromPrefix?: boolean;
  caption?: string;
  large?: boolean;
  accent?: boolean;
  style?: ViewStyle;
};

export default function TourPriceLabel({
  amount,
  currencySymbol = '₽',
  fromPrefix = true,
  caption = 'за тур',
  large = false,
  accent = false,
  style,
}: Props) {
  const { theme } = useAppContext();
  if (!amount || amount <= 0) {
    return (
      <Text style={[styles.cap, { color: theme.secondaryText }, style]}>цена по запросу</Text>
    );
  }
  const main = `${fromPrefix ? 'от ' : ''}${Number(amount).toLocaleString('ru-RU')} ${currencySymbol}`;
  return (
    <View style={style}>
      <Text
        style={[
          large ? typography.h2 : typography.bodyBold,
          { color: accent ? theme.accent : theme.deep || theme.text, letterSpacing: -0.3 },
        ]}
        numberOfLines={1}
      >
        {main}
      </Text>
      {caption ? (
        <Text style={[styles.cap, { color: theme.secondaryText }]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cap: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
