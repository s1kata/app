import { Platform, type ModalProps } from 'react-native';

/**
 * Пропсы для прозрачных bottom-sheet модалок — стабильно на iOS и Android.
 * Использование: <Modal visible {...transparentModalProps}>
 */
export const transparentModalProps: Pick<
  ModalProps,
  'transparent' | 'presentationStyle' | 'statusBarTranslucent'
> = {
  transparent: true,
  ...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {}),
  ...(Platform.OS === 'android' ? { statusBarTranslucent: true } : {}),
};

/** behavior для KeyboardAvoidingView */
export function getKeyboardAvoidingBehavior(): 'padding' | 'height' {
  return Platform.OS === 'ios' ? 'padding' : 'height';
}
