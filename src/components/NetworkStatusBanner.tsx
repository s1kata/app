import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { getNetworkIssueMessage, getNetworkRestoredMessage } from '../utils/networkMessages';

export default function NetworkStatusBanner() {
  const { theme, networkConnection, networkRecoveredFlash } = useAppContext();
  const insets = useSafeAreaInsets();
  const top = insets.top + (Platform.OS === 'android' ? 4 : 0);

  if (networkRecoveredFlash) {
    return (
      <View pointerEvents="none" style={[styles.wrap, { top }]}>
        <View
          style={[
            styles.bar,
            {
              backgroundColor: theme.card,
              borderColor: theme.success,
              ...(Platform.OS === 'android'
                ? { elevation: 6 }
                : {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 6,
                  }),
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={22} color={theme.success} />
          <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
            {getNetworkRestoredMessage()}
          </Text>
        </View>
      </View>
    );
  }

  const showIssue =
    networkConnection.status === 'offline' || networkConnection.status === 'degraded';

  if (!showIssue) return null;

  const color = networkConnection.status === 'offline' ? theme.warning : theme.primary;
  const icon =
    networkConnection.status === 'offline' ? ('cloud-offline-outline' as const) : ('globe-outline' as const);

  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
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
                  shadowOpacity: 0.12,
                  shadowRadius: 6,
                }),
          },
        ]}
      >
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[styles.text, { color: theme.text }]} numberOfLines={3}>
          {getNetworkIssueMessage(networkConnection.issue)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9998,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
