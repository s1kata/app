import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useAppContext } from '../contexts/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { i18n } from '../config/i18n';

const SWITCHER_PADDING = 4;

export const ThemeSwitcher: React.FC = () => {
  const { theme, themeMode, setThemeMode } = useAppContext();
  const [animation] = useState(new Animated.Value(0));
  const [isAnimating, setIsAnimating] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const animateSwitch = (toValue: number) => {
    setIsAnimating(true);
    Animated.spring(animation, {
      toValue,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start(() => setIsAnimating(false));
  };

  const handleThemeSwitch = async (newMode: 'light' | 'dark' | 'auto') => {
    if (isAnimating) return;
    const modeIndex = ['light', 'dark', 'auto'].indexOf(newMode);
    animateSwitch(modeIndex);
    await setThemeMode(newMode);
  };

  useEffect(() => {
    const currentIndex = ['light', 'dark', 'auto'].indexOf(themeMode);
    animation.setValue(currentIndex);
  }, [themeMode]);

  const getIndicatorWidth = () =>
    containerWidth === 0 ? 0 : (containerWidth - SWITCHER_PADDING * 2) / 3;

  const translateX = animation.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [
      SWITCHER_PADDING,
      SWITCHER_PADDING + getIndicatorWidth(),
      SWITCHER_PADDING + getIndicatorWidth() * 2,
    ],
  });

  const modes = [
    { key: 'light' as const, icon: 'sunny-outline', label: i18n.t('theme.light') },
    { key: 'dark' as const, icon: 'moon-outline', label: i18n.t('theme.dark') },
    { key: 'auto' as const, icon: 'contrast-outline', label: i18n.t('theme.auto') },
  ];

  const switcherBg = theme.secondaryBackground;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {i18n.t('theme.appTheme')}
      </Text>

      <View
        style={[styles.switcherContainer, { backgroundColor: switcherBg }]}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        {containerWidth > 0 && (
          <Animated.View
            style={[
              styles.indicator,
              {
                width: getIndicatorWidth(),
                backgroundColor: theme.primary,
                shadowColor: theme.primary,
                transform: [{ translateX }],
              },
            ]}
          />
        )}

        {modes.map(({ key, icon, label }) => {
          const isActive = themeMode === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => handleThemeSwitch(key)}
              disabled={isAnimating}
              style={styles.button}
              activeOpacity={0.7}
            >
              <Ionicons
                name={icon as any}
                size={20}
                color={isActive ? '#FFFFFF' : theme.secondaryText}
              />
              <Text
                style={[
                  styles.buttonText,
                  { color: isActive ? '#FFFFFF' : theme.secondaryText },
                  isActive && { fontWeight: '700' },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.descriptionContainer, { backgroundColor: switcherBg }]}>
        <Text style={[styles.descriptionText, { color: theme.secondaryText }]}>
          {themeMode === 'light' && i18n.t('theme.lightDesc')}
          {themeMode === 'dark' && i18n.t('theme.darkDesc')}
          {themeMode === 'auto' && i18n.t('theme.autoDesc')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  switcherContainer: {
    position: 'relative',
    borderRadius: 24,
    padding: SWITCHER_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    height: 44,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
    top: SWITCHER_PADDING - 2,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 20,
    zIndex: 1,
    gap: 2,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
  descriptionContainer: {
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
  },
  descriptionText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '400',
  },
});
