/**
 * Изображение с кэшированием (expo-image), плейсхолдером и fallback при ошибке.
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
import { DEFAULT_HOTEL_IMAGE } from '../../constants/images';

type CachedImageProps = {
  source: string | { uri: string };
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none';
  placeholder?: React.ReactNode;
  transition?: number;
  /** Для списков: стабильный ключ кэша ячейки (expo-image) */
  recyclingKey?: string;
  /** Картинка при ошибке загрузки (по умолчанию DEFAULT_HOTEL_IMAGE) */
  fallbackUri?: string;
};

export default function CachedImage({
  source,
  style,
  contentFit = 'cover',
  placeholder,
  transition = 250,
  recyclingKey,
  fallbackUri = DEFAULT_HOTEL_IMAGE,
}: CachedImageProps) {
  const primary = typeof source === 'string' ? source : source?.uri || '';
  const [uri, setUri] = React.useState(primary);
  const [loading, setLoading] = React.useState(!!primary);
  const failedRef = React.useRef(false);

  React.useEffect(() => {
    failedRef.current = false;
    setUri(primary);
    setLoading(!!primary);
  }, [primary]);

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
          onError={() => {
            setLoading(false);
            if (!failedRef.current && fallbackUri && uri !== fallbackUri) {
              failedRef.current = true;
              setUri(fallbackUri);
              setLoading(true);
            }
          }}
        />
      ) : null}
      {loading && uri ? (
        <View
          style={[StyleSheet.absoluteFill, styles.overlay]}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {placeholder || (
            <ActivityIndicator
              size="small"
              color="#9CA3AF"
              accessible={false}
              importantForAccessibility="no"
            />
          )}
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
