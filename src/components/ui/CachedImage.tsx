/**
 * Изображение с кэшированием (expo-image), плейсхолдером и индикатором загрузки.
 */

import React from 'react';
import {
  View,
  StyleSheet,
  ImageStyle,
  ActivityIndicator,
  StyleProp,
} from 'react-native';
import { Image } from 'expo-image';

type CachedImageProps = {
  source: string | { uri: string };
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none';
  placeholder?: React.ReactNode;
  transition?: number;
  /** Для списков: стабильный ключ кэша ячейки (expo-image) */
  recyclingKey?: string;
};

export default function CachedImage({
  source,
  style,
  contentFit = 'cover',
  placeholder,
  transition = 250,
  recyclingKey,
}: CachedImageProps) {
  const uri = typeof source === 'string' ? source : source?.uri || '';
  const [loading, setLoading] = React.useState(!!uri);

  React.useEffect(() => {
    setLoading(!!uri);
  }, [uri]);

  return (
    <View style={[styles.wrapper, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={transition}
          cachePolicy="memory-disk"
          recyclingKey={recyclingKey ?? uri}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      ) : null}
      {loading && uri ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none">
          {placeholder || <ActivityIndicator size="small" color="#9CA3AF" />}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    backgroundColor: '#E8EAED',
  },
  overlay: {
    backgroundColor: 'rgba(232, 234, 237, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
