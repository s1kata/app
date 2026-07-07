import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../contexts/AppContext';
import { spacing, typography } from '../../config/designSystem';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const { theme } = useAppContext();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.header, { borderBottomColor: theme.border }]}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          {icon ? <Ionicons name={icon} size={22} color={theme.primary} style={styles.headerIcon} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.secondaryText }]}>{subtitle}</Text>
            ) : null}
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={theme.secondaryText}
        />
      </TouchableOpacity>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerIcon: { marginRight: spacing.sm },
  title: { ...typography.captionBold, fontWeight: '700' },
  subtitle: { ...typography.caption, marginTop: 2 },
  body: { paddingTop: spacing.md },
});
