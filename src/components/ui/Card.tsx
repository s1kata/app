/**
 * Базовая карточка с тенью и скруглением (дизайн-система TravelHub).
 */

import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { useAppContext } from '../../contexts/AppContext';
import { spacing, radius, shadows } from '../../config/designSystem';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Более выраженная тень */
  raised?: boolean;
  /** Без внутренних отступов */
  noPadding?: boolean;
}

export default function Card({ children, style, raised = false, noPadding = false }: CardProps) {
  const { theme } = useAppContext();

  const shadowStyle = raised ? shadows.cardRaised : shadows.card;
  return (
    <View
      style={[
        styles.card,
        shadowStyle,
        {
          backgroundColor: theme.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: theme.border,
          padding: noPadding ? 0 : spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
