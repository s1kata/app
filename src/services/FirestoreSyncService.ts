/**
 * Фоновая синхронизация Firestore → локальный кэш каждые 24 часа.
 * Популярные запросы предзагружаются в AsyncStorage/CacheService для офлайн-доступа.
 */

import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFromSharedCache } from './TourvisorFirestoreCache';
import { saveTourSearchToLocalCaches } from '../hooks/useTourSearch';
import { getPopularTourSearchParams } from '../config/popularQueries';
import { logger } from '../utils/logger';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 часа
const LAST_SYNC_KEY = 'firestore_sync_last_run';

class FirestoreSyncService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;

  start(): void {
    if (this.intervalId) return;
    this.appStateSubscription = AppState.addEventListener('change', this._onAppStateChange);
    // Первый запуск при старте (если прошло 24ч)
    this._scheduleSync();
    this.intervalId = setInterval(this._runSyncIfNeeded, Math.min(SYNC_INTERVAL_MS, 60 * 60 * 1000)); // проверка раз в час
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }

  private _onAppStateChange = (state: AppStateStatus): void => {
    if (state === 'active') {
      this._runSyncIfNeeded();
    }
  };

  private _scheduleSync(): void {
    this._runSyncIfNeeded();
  }

  private _runSyncIfNeeded = async (): Promise<void> => {
    try {
      const last = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const lastMs = last ? parseInt(last, 10) : 0;
      if (Date.now() - lastMs < SYNC_INTERVAL_MS) return;
      await this._runSync();
    } catch {
      /* ignore */
    }
  };

  private _runSync = async (): Promise<void> => {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      const paramsList = getPopularTourSearchParams();
      let synced = 0;
      for (const params of paramsList) {
        try {
          const data = await getFromSharedCache(params, 25);
          if (data && data.length > 0) {
            await saveTourSearchToLocalCaches(params, data, 25);
            synced++;
          }
        } catch {
          /* skip */
        }
      }
      if (__DEV__ && synced > 0) {
        logger.log(`[FirestoreSync] synced ${synced}/${paramsList.length} popular searches`);
      }
    } catch (e) {
      logger.debug('[FirestoreSync] error:', (e as Error)?.message);
    }
  }
}

export const firestoreSyncService = new FirestoreSyncService();
