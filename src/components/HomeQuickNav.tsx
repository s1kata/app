/**
 * Быстрая навигация по приложению на главной (вместо дублирующего поиска).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { radius, shadows, spacing, typography } from '../config/designSystem';

type NavItem = {
  id: string;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accent?: boolean;
};

type Props = {
  items: NavItem[];
};

export default function HomeQuickNav({ items }: Props) {
  const { theme } = useAppContext();

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.tile,
            shadows.card,
            {
              backgroundColor: item.accent ? theme.primary : theme.card,
              borderColor: item.accent ? theme.primary : theme.border,
            },
          ]}
          onPress={item.onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={i18n.t(item.labelKey)}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: item.accent ? 'rgba(255,255,255,0.2)' : `${theme.primary}14`,
              },
            ]}
          >
            <Ionicons
              name={item.icon}
              size={22}
              color={item.accent ? '#fff' : theme.primary}
            />
          </View>
          <Text
            style={[
              styles.label,
              { color: item.accent ? '#fff' : theme.deep || theme.text },
            ]}
            numberOfLines={2}
          >
            {i18n.t(item.labelKey)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    // Avoid width% + gap overflow on narrow iPhones; flexBasis shares row with gap.
    flexGrow: 1,
    flexBasis: '46%',
    maxWidth: '48%',
    minHeight: 88,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    ...typography.bodyBold,
    fontSize: 14,
    lineHeight: 18,
  },
});
