import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import PrimaryButton from '../ui/PrimaryButton';
import { spacing, radius, typography } from '../../config/designSystem';

interface PaymentPrepareModalProps {
  visible: boolean;
  onCancel: () => void;
  onContinue: () => void;
}

export function PaymentPrepareModal({ visible, onCancel, onContinue }: PaymentPrepareModalProps) {
  const { theme } = useAppContext();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={[styles.full, { backgroundColor: theme.background }]}>
        <View style={styles.fullContent}>
          <View style={[styles.iconCircle, { backgroundColor: theme.primary + '18' }]}>
            <Ionicons name="shield-checkmark-outline" size={56} color={theme.primary} />
          </View>
          <Text style={[styles.fullTitle, { color: theme.text }]}>{i18n.t('ux.paymentPrepareTitle')}</Text>
          <Text style={[styles.fullBody, { color: theme.secondaryText }]}>{i18n.t('ux.paymentPrepareBody')}</Text>
          <Text style={[styles.fullHint, { color: theme.tertiaryText }]}>{i18n.t('ux.paymentPrepareHint')}</Text>
          <PrimaryButton
            title={i18n.t('ux.paymentGoToBank')}
            onPress={onContinue}
            variant="cta"
            style={styles.fullBtn}
          />
          <PrimaryButton title={i18n.t('common.cancel')} onPress={onCancel} outline style={styles.fullBtn} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface PaymentSuccessModalProps {
  visible: boolean;
  onDone: () => void;
}

export function PaymentSuccessModal({ visible, onDone }: PaymentSuccessModalProps) {
  const { theme } = useAppContext();

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDone}>
      <SafeAreaView style={[styles.full, { backgroundColor: theme.background }]}>
        <View style={styles.fullContent}>
          <View style={[styles.iconCircle, { backgroundColor: theme.success + '22' }]}>
            <Ionicons name="checkmark-circle" size={72} color={theme.success} />
          </View>
          <Text style={[styles.fullTitle, { color: theme.text }]}>{i18n.t('ux.paymentSuccessTitle')}</Text>
          <Text style={[styles.fullBody, { color: theme.secondaryText }]}>{i18n.t('ux.paymentSuccessBody')}</Text>
          <PrimaryButton title={i18n.t('ux.paymentSuccessDone')} onPress={onDone} variant="cta" style={styles.fullBtn} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface PaymentRecoveryModalProps {
  visible: boolean;
  onDone: () => void;
}

export function PaymentRecoveryModal({ visible, onDone }: PaymentRecoveryModalProps) {
  const { theme } = useAppContext();

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDone}>
      <SafeAreaView style={[styles.full, { backgroundColor: theme.background }]}>
        <View style={styles.fullContent}>
          <View style={[styles.iconCircle, { backgroundColor: theme.warning + '22' }]}>
            <Ionicons name="help-circle-outline" size={68} color={theme.warning} />
          </View>
          <Text style={[styles.fullTitle, { color: theme.text }]}>{i18n.t('ux.paymentRecoveryTitle')}</Text>
          <Text style={[styles.fullBody, { color: theme.secondaryText }]}>{i18n.t('ux.paymentRecoveryBody')}</Text>
          <PrimaryButton title={i18n.t('ux.paymentRecoveryCta')} onPress={onDone} variant="cta" style={styles.fullBtn} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  fullContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  fullTitle: { ...typography.h1, textAlign: 'center', marginBottom: spacing.md },
  fullBody: { ...typography.body, textAlign: 'center', lineHeight: 24, marginBottom: spacing.md },
  fullHint: { ...typography.caption, textAlign: 'center', marginBottom: spacing.xl },
  fullBtn: { alignSelf: 'stretch', marginBottom: spacing.sm },
});
