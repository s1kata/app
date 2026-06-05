import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import {
  subscribePaymentStatusBanner,
  hidePaymentStatusBar,
  type PaymentBannerPayload,
  type PaymentBannerVariant,
} from '../utils/paymentStatusBanner';

const VARIANT_ICON: Record<PaymentBannerVariant, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'close-circle',
  warning: 'alert-circle',
  info: 'information-circle',
};

export default function PaymentStatusBanner() {
  const { theme } = useAppContext();
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<PaymentBannerPayload | null>(null);

  useEffect(() => subscribePaymentStatusBanner(setBanner), []);

  if (!banner) return null;

  const color =
    banner.variant === 'success'
      ? theme.success
      : banner.variant === 'error'
        ? theme.error
        : banner.variant === 'warning'
          ? theme.warning
          : theme.primary;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + (Platform.OS === 'android' ? 4 : 0) }]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.card,
            borderColor: color,
            ...(Platform.OS === 'android'
              ? { elevation: 6 }
              : {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 6,
                }),
          },
        ]}
      >
        <Ionicons name={VARIANT_ICON[banner.variant]} size={22} color={color} />
        <Text style={[styles.text, { color: theme.text }]} numberOfLines={3}>
          {banner.message}
        </Text>
        <TouchableOpacity onPress={hidePaymentStatusBar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={20} color={theme.secondaryText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
});
