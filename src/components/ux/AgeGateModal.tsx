import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import { PrimaryButton } from '../ui';
import { spacing, radius, shadows, typography } from '../../config/designSystem';

type AgeGateModalProps = {
  visible: boolean;
  onConfirm: () => void;
  onDecline: () => void;
};

export default function AgeGateModal({ visible, onConfirm, onDecline }: AgeGateModalProps) {
  const { theme } = useAppContext();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.card }]}>
          <View style={styles.header}>
            <Ionicons name="warning-outline" size={48} color={theme.accent} />
            <Text style={[styles.title, { color: theme.text }]}>{i18n.t('ageGate.title')}</Text>
            <Text style={[styles.body, { color: theme.secondaryText }]}>{i18n.t('ageGate.body')}</Text>
          </View>
          <View style={styles.buttons}>
            <PrimaryButton
              title={i18n.t('ageGate.confirm')}
              onPress={onConfirm}
              variant="cta"
            />
            <PrimaryButton
              title={i18n.t('ageGate.decline')}
              onPress={onDecline}
              outline
              style={styles.declineButton}
            />
          </View>
          <TouchableOpacity onPress={onDecline} activeOpacity={0.7} style={styles.footerHint}>
            <Text style={[styles.footerText, { color: theme.tertiaryText }]}>
              {i18n.t('ageGate.footer')}
            </Text>
          </TouchableOpacity>
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
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    textAlign: 'center',
  },
  buttons: {
    gap: spacing.sm,
  },
  declineButton: {
    borderWidth: 1,
  },
  footerHint: {
    marginTop: spacing.md,
  },
  footerText: {
    ...typography.small,
    textAlign: 'center',
  },
});
