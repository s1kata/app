import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import PrimaryButton from '../ui/PrimaryButton';
import { spacing, radius, typography } from '../../config/designSystem';

export interface AuthRequiredCardProps {
  visible: boolean;
  title?: string;
  message?: string;
  onLater?: () => void;
  onLogin?: () => void;
  onRegister?: () => void;
  showRegister?: boolean;
}

export default function AuthRequiredCard({
  visible,
  title,
  message,
  onLater,
  onLogin,
  onRegister,
  showRegister = true,
}: AuthRequiredCardProps) {
  const { theme } = useAppContext();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onLater}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
              <Ionicons name="person-circle-outline" size={48} color={theme.primary} />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>
              {title || i18n.t('ux.authRequiredTitle')}
            </Text>
            <Text style={[styles.message, { color: theme.secondaryText }]}>
              {message || i18n.t('ux.authRequiredMessage')}
            </Text>
            <PrimaryButton
              title={i18n.t('ux.createProfile')}
              onPress={() => (onRegister ? onRegister() : onLogin?.())}
              variant="cta"
              style={styles.primaryBtn}
            />
            {showRegister && onLogin && onRegister ? (
              <PrimaryButton
                title={i18n.t('auth.login')}
                onPress={onLogin}
                outline
                style={styles.secondaryBtn}
              />
            ) : null}
            <TouchableOpacity onPress={onLater} style={styles.laterBtn} activeOpacity={0.7}>
              <Text style={[styles.laterText, { color: theme.secondaryText }]}>{i18n.t('ux.later')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  safe: { flex: 1, justifyContent: 'center' },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  primaryBtn: { alignSelf: 'stretch', marginBottom: spacing.sm },
  secondaryBtn: { alignSelf: 'stretch', marginBottom: spacing.xs },
  laterBtn: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  laterText: { ...typography.body, fontSize: 16 },
});
