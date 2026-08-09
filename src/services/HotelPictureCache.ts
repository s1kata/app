/**
 * Локальный кэш фото отелей.
 * GET /hotels (справочник) не отдаёт picturelink — фото появляются в результатах
 * поиска туров и в GET /hotels/{id} (платный модуль). Кэшируем всё, что видим.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHotelImageUrl } from '../utils/hotelImages';
import { logger } from '../utils/logger';
import {
  fetchHotelImagesViaBackend,
  upsertHotelImagesViaBackend,
} from './sync/NextPatchBackendClient';

const STORAGE_KEY = 'hotel_picture_cache_v1';
const MAX_ENTRIES = 4000;

type CacheMap = Record<string, string>;

let memory: CacheMap | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

async function ensureLoaded(): Promise<CacheMap> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    memory = raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    memory = {};
  }
  return memory;
}

function schedulePersist() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    void (async () => {
      try {
        if (!memory) return;
        const entries = Object.entries(memory);
        if (entries.length > MAX_ENTRIES) {
          memory = Object.fromEntries(entries.slice(entries.length - MAX_ENTRIES));
        }
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
      } catch (e) {
        logger.debug('[HotelPictureCache] persist failed', (e as Error)?.message);
      }
    })();
  }, 400);
}

export const hotelPictureCache = {
  async get(hotelId: string | number): Promise<string | null> {
    const map = await ensureLoaded();
    return map[String(hotelId)] || null;
  },

  async getMany(ids: Array<string | number>): Promise<Record<number, string>> {
    const map = await ensureLoaded();
    const out: Record<number, string> = {};
    const missing: number[] = [];
    for (const id of ids) {
      const url = map[String(id)];
      if (url) out[Number(id)] = url;
      else missing.push(Number(id));
    }
    if (missing.length) {
      try {
        const remote = await fetchHotelImagesViaBackend(missing, false);
        if (remote.success && remote.data) {
          for (const [k, v] of Object.entries(remote.data)) {
            const nid = Number(k);
            if (!v || !nid) continue;
            out[nid] = v;
            map[String(nid)] = v;
          }
          schedulePersist();
        }
      } catch (e) {
        logger.debug('[HotelPictureCache] remote getMany', (e as Error)?.message);
      }
    }
    return out;
  },

  async set(hotelId: string | number, url: string): Promise<void> {
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;
    const map = await ensureLoaded();
    const key = String(hotelId);
    if (map[key] === url) return;
    map[key] = url;
    schedulePersist();
    void upsertHotelImagesViaBackend([{ hotelId: Number(hotelId), pictureUrl: url }]);
  },

  /** Сохранить фото из объектов туров / отелей Tourvisor. */
  async ingestFromTours(tours: Array<{ hotel?: { id?: number; picturelink?: string }; picture?: string }>): Promise<void> {
    if (!tours?.length) return;
    const map = await ensureLoaded();
    let changed = false;
    for (const t of tours) {
      const hotelId = t.hotel?.id;
      if (hotelId == null) continue;
      const url =
        getHotelImageUrl(t.hotel as never) ||
        (typeof t.picture === 'string' && t.picture.startsWith('http') ? t.picture : null) ||
        (typeof t.hotel?.picturelink === 'string' ? t.hotel.picturelink : null);
      if (!url) continue;
      const normalized = url.startsWith('//') ? `https:${url}` : url;
      const key = String(hotelId);
      if (map[key] !== normalized) {
        map[key] = normalized;
        changed = true;
      }
    }
    if (changed) schedulePersist();
  },

  async ingestHotel(hotel: { id?: number; picturelink?: string } | null | undefined): Promise<void> {
    if (!hotel?.id) return;
    const url = getHotelImageUrl(hotel as never);
    if (url) await this.set(hotel.id, url);
  },
};
