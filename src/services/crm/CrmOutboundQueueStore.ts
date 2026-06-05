import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CrmQueueTask } from '../../types/crmQueue';
import { logger } from '../../utils/logger';

const STORAGE_KEY = '@crm_outbound_queue_v1';

export async function loadQueueFromStorage(): Promise<CrmQueueTask[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CrmQueueTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    logger.warn('[CrmQueue] load failed:', (e as Error)?.message);
    return [];
  }
}

export async function saveQueueToStorage(tasks: CrmQueueTask[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    logger.error('[CrmQueue] save failed:', e);
  }
}
