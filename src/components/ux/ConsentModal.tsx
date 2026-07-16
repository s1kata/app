import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import { PrimaryButton } from '../ui';
import { spacing, radius, shadows, typography } from '../../config/designSystem';

type ConsentModalProps = {
  visible: boolean;
  onAccept: () => void;
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
};

export default function ConsentModal({
  visible,
  onAccept,
  onOpenPrivacy,
  onOpenTerms,
}: ConsentModalProps) {
  const { theme } = useAppContext();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.card }]}>
          <View style={styles.header}>
            <Ionicons name="document-text-outline" size={48} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>{i18n.t('consent.title')}</Text>
            <Text style={[styles.body, { color: theme.secondaryText }]}>{i18n.t('consent.body')}</Text>
          </View>
          <View style={styles.links}>
            <TouchableOpacity onPress={onOpenPrivacy} activeOpacity={0.7} disabled={!onOpenPrivacy}>
              <Text style={[styles.linkText, { color: theme.primary }]}>{i18n.t('consent.privacy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onOpenTerms} activeOpacity={0.7} disabled={!onOpenTerms}>
              <Text style={[styles.linkText, { color: theme.primary }]}>{i18n.t('consent.terms')}</Text>
            </TouchableOpacity>
          </View>
          <PrimaryButton title={i18n.t('consent.accept')} onPress={onAccept} variant="cta" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadows.cardRaised,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    textAlign: 'center',
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  linkText: {
    ...typography.small,
    textDecorationLine: 'underline',
  },
});
