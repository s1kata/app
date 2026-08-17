/**
 * Единый заголовок экрана — концепт TravelHub.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../../contexts/AppContext';
import { spacing, typography, radius } from '../../config/designSystem';

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: ViewStyle;
  /** Без safe-area сверху (если уже в SafeAreaView) */
  noSafeTop?: boolean;
  /** Только заголовок, без слотов под кнопки (вкладка «Поиск») */
  plain?: boolean;
};

export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  style,
  noSafeTop,
  plain,
}: Props) {
  const { theme } = useAppContext();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: noSafeTop ? spacing.sm : Math.max(insets.top, spacing.sm),
          backgroundColor: theme.background,
          borderBottomColor: theme.border,
        },
        style,
      ]}
    >
      {plain && !onBack && !right ? (
        <View style={styles.plainRow}>
          <Text style={[typography.h3, { color: theme.deep }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[typography.small, { color: theme.secondaryText, marginTop: 2 }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.row}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              style={[styles.back, { backgroundColor: theme.card, borderColor: theme.border }]}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Назад"
            >
              <Ionicons name="chevron-back" size={22} color={theme.deep} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backSpacer} />
          )}
          <View style={styles.titles}>
            <Text style={[typography.h3, { color: theme.deep }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[typography.small, { color: theme.secondaryText, marginTop: 2 }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.right}>{right || <View style={styles.backSpacer} />}</View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpacer: { width: 40, height: 40 },
  titles: { flex: 1, minWidth: 0 },
  right: { minWidth: 40, alignItems: 'flex-end' },
  plainRow: {
    minHeight: 48,
    justifyContent: 'center',
  },
});
