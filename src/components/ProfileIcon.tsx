import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { AuthService } from '../services/AuthService';
import { logger } from '../utils/logger';

interface ProfileIconProps {
  navigation: any;
  size?: number;
  showName?: boolean;
}

export default function ProfileIcon({ navigation, size = 40, showName = false }: ProfileIconProps) {
  const { user, isAuthenticated, theme } = useAppContext();
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      if (showName) {
        loadUserName();
      }
    } else {
      setUserName('');
    }
  }, [isAuthenticated, user, showName]);

  const loadUserName = async () => {
    if (!user?.uid) return;
    
    try {
      const isGuest = user.uid.startsWith('guest_') || user.isAnonymous === true;
      if (isGuest) {
        setUserName('Гость');
        return;
      }

      const profile = await AuthService.getCurrentUser();
      if (profile?.fullName) {
        setUserName(profile.fullName);
        return;
      }
      if (profile?.email) {
        setUserName(profile.email.split('@')[0]);
        return;
      }

      // Fallback: данные из сессии приложения
      if (user.email) {
        setUserName(user.email.split('@')[0]);
      } else {
        setUserName('Пользователь');
      }
    } catch (error) {
      // Если Firestore недоступен (нет сети/таймаут), показываем безопасный fallback,
      // не превращая падение сети в “критический” лог.
      const fallbackName = user.email?.split('@')[0] || 'Пользователь';
      logger.warn('ProfileIcon: failed to load user full name, fallback used.');
      setUserName(fallbackName);
    }
  };


  const handlePress = () => {
    // Навигация к Profile через главный стек навигатора
    if (navigation.getParent) {
      const parent = navigation.getParent();
      if (parent) {
        parent.navigate('Profile', { screen: 'ProfileMain' });
      } else {
        navigation.navigate('Profile', { screen: 'ProfileMain' });
      }
    } else {
      navigation.navigate('Profile', { screen: 'ProfileMain' });
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.container, showName && styles.containerWithName]}
      activeOpacity={0.7}
    >
      {showName && userName && (
        <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
          {userName}
        </Text>
      )}
      <View style={[styles.avatarContainer, { width: size, height: size, borderRadius: size / 2, borderColor: theme.primary, backgroundColor: theme.secondaryBackground }]}>
        <View style={[styles.defaultAvatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.primary + '12' }]}>
          <Ionicons name="person" size={size * 0.6} color={theme.primary} />
        </View>
        {/* Индикатор онлайн статуса */}
        {isAuthenticated && (
          <View style={[styles.statusIndicator, { 
            width: size * 0.25, 
            height: size * 0.25, 
            borderRadius: size * 0.125,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            bottom: 0,
            right: 0,
          }]} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  containerWithName: {
    flexDirection: 'row-reverse',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    maxWidth: 120,
  },
  avatarContainer: {
    overflow: 'hidden',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  defaultAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIndicator: {
    position: 'absolute',
    backgroundColor: '#4CAF50',
  },
});
