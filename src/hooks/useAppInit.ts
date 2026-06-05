import { useCallback, useEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { db } from '../config/firebase';
import { firestoreSyncService } from '../services/FirestoreSyncService';
import { networkService } from '../services/NetworkService';
import { crmOutboundQueue } from '../services/crm/CrmOutboundQueue';
import { notificationService } from '../services/NotificationService';
import { messageService } from '../services/MessageService';
import { logger } from '../utils/logger';
import { useLifecycleLog } from './useLifecycleLog';

const NOTIFY_DELAY_MS = 2000;
const SPLASH_FALLBACK_MS = 5000;

/**
 * Разносит тяжёлую инициализацию приложения из App.tsx: сеть, CRM-очередь, фоновая синхронизация, уведомления.
 */
export function useAppInit() {
  useLifecycleLog('useAppInit');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    logger.info('[AppInit] starting services', { network: true, crm: true, firestore: !!db });

    const timer = setTimeout(() => {
      notificationService
        .initialize()
        .then(() => notificationService.scheduleDailyHotToursNotification())
        .catch((e) => logger.warn('notification init:', e));
      messageService.initialize().catch((e) => logger.warn('message init:', e));
    }, NOTIFY_DELAY_MS);

    const splashFallback = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, SPLASH_FALLBACK_MS);

    if (db) {
      firestoreSyncService.start();
    }
    networkService.start();
    void crmOutboundQueue.start();

    return () => {
      clearTimeout(timer);
      clearTimeout(splashFallback);
      notificationService.cleanup();
      if (db) {
        firestoreSyncService.stop();
      }
      networkService.stop();
    };
  }, []);

  const [hasCheckedPermission, setHasCheckedPermission] = useState(false);

  useEffect(() => {
    if (!hasCheckedPermission) return;
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 100);
    return () => clearTimeout(t);
  }, [hasCheckedPermission]);

  const markPermissionChecked = useCallback(() => {
    setHasCheckedPermission(true);
  }, []);

  return { hasCheckedPermission, markPermissionChecked };
}
