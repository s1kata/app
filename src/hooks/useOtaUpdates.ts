import { useEffect, useRef } from 'react';
import * as Updates from 'expo-updates';
import { logger } from '../utils/logger';

/**
 * Проверяет EAS Update при старте release-сборки (TestFlight / App Store / production APK).
 * Dev и Expo Go пропускаются — Updates.isEnabled === false.
 */
export function useOtaUpdates() {
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current || __DEV__) return;
    checked.current = true;

    if (!Updates.isEnabled) {
      logger.debug('[OTA] expo-updates disabled in this build');
      return;
    }

    void (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) {
          logger.debug('[OTA] app is up to date');
          return;
        }

        logger.info('[OTA] downloading update…');
        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew) {
          return;
        }

        logger.info('[OTA] update ready, reloading');
        await Updates.reloadAsync();
      } catch (error) {
        logger.warn('[OTA] check failed:', (error as Error)?.message || error);
      }
    })();
  }, []);
}
