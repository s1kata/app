import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../contexts/AppContext';
import { i18n } from '../../config/i18n';
import PrimaryButton from '../ui/PrimaryButton';
import { spacing, radius, typography } from '../../config/designSystem';

interface GuestModeBannerProps {
  onCreateProfile: () => void;
  title?: string;
  message?: string;
  large?: boolean;
}

export default function GuestModeBanner({
  onCreateProfile,
  title,
  message,
  large = false,
}: GuestModeBannerProps) {
  const { theme } = useAppContext();

  return (
    <View
      style={[
        styles.banner,
        large && styles.bannerLarge,
        { backgroundColor: theme.warning + '22', borderColor: theme.warning },
      ]}
    >
      <Ionicons name="information-circle" size={large ? 28 : 22} color={theme.warning} style={styles.icon} />
      <View style={styles.textCol}>
        <Text style={[large ? styles.titleLarge : styles.title, { color: theme.text }]}>
          {title || i18n.t('ux.guestBannerTitle')}
        </Text>
        <Text style={[large ? styles.bodyLarge : styles.body, { color: theme.secondaryText }]}>
          {message || i18n.t('ux.guestBannerBody')}
        </Text>
        <PrimaryButton
          title={i18n.t('ux.createProfile')}
          onPress={onCreateProfile}
          variant="cta"
          small={!large}
          style={large ? styles.btnLarge : styles.btn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  icon: { marginRight: spacing.sm, marginTop: 2 },
  textCol: { flex: 1 },
  title: { ...typography.captionBold, fontWeight: '700', marginBottom: 4 },
  body: { ...typography.caption, lineHeight: 20, marginBottom: spacing.sm },
  btn: { alignSelf: 'flex-start' },
  btnLarge: { alignSelf: 'stretch', marginTop: spacing.xs },
  bannerLarge: {
    padding: spacing.lg,
    marginVertical: spacing.sm,
  },
  titleLarge: { ...typography.h3, fontWeight: '700', marginBottom: spacing.sm },
  bodyLarge: { ...typography.body, lineHeight: 22, marginBottom: spacing.md },
});
