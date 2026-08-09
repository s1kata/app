/**
 * Догрузка фото отелей: серверный кэш / details, затем legacy Tourvisor proxy.
 */
import { useState, useEffect, useRef } from 'react';
import { HotelCompact } from '../types/tourvisor';
import { tourvisorApi } from '../services/TourvisorApiService';
import { getHotelImageUrl, getHotelImageUrls } from '../utils/hotelImages';
import { hotelPictureCache } from '../services/HotelPictureCache';
import {
  fetchHotelDetailsViaBackend,
  fetchHotelImagesViaBackend,
} from '../services/sync/NextPatchBackendClient';

const BATCH = 20;

export function useHotelListDetailImages(hotels: HotelCompact[], active: boolean) {
  const [hotelImages, setHotelImages] = useState<Record<number, string>>({});
  const mountedRef = useRef(true);
  const loadedUpToRef = useRef(0);
  const hotelsRef = useRef(hotels);
  hotelsRef.current = hotels;

  const hotelIdsKey = hotels.map((h) => h.id).join(',');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || hotelIdsKey.length === 0) {
      setHotelImages({});
      loadedUpToRef.current = 0;
      return;
    }

    const list = hotelsRef.current;
    let cancelled = false;
    loadedUpToRef.current = 0;

    const bootstrap = async () => {
      const fromCache = await hotelPictureCache.getMany(list.map((h) => h.id));
      const seeded: Record<number, string> = { ...fromCache };
      for (const h of list) {
        if (seeded[h.id]) continue;
        const inline = getHotelImageUrl(h as never);
        if (inline) {
          seeded[h.id] = inline;
          void hotelPictureCache.set(h.id, inline);
        }
      }

      // Server image cache for missing
      const missing = list.map((h) => h.id).filter((id) => !seeded[id]);
      if (missing.length) {
        try {
          const remote = await fetchHotelImagesViaBackend(missing, true);
          if (remote.success && remote.data) {
            for (const [k, v] of Object.entries(remote.data)) {
              const id = Number(k);
              if (!id || !v) continue;
              seeded[id] = v;
              void hotelPictureCache.set(id, v);
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (!cancelled && mountedRef.current && Object.keys(seeded).length > 0) {
        setHotelImages(seeded);
      }
      setTimeout(runBatch, 0);
    };

    const runBatch = () => {
      if (cancelled || !mountedRef.current) return;
      const start = loadedUpToRef.current;
      if (start >= list.length) return;

      const end = Math.min(start + BATCH, list.length);
      const batch = list.slice(start, end);
      loadedUpToRef.current = end;

      void (async () => {
        const stillNeed: HotelCompact[] = [];
        for (const h of batch) {
          const cached = await hotelPictureCache.get(h.id);
          const inline = getHotelImageUrl(h as never);
          if (cached || inline) {
            const url = cached || inline!;
            if (!cancelled && mountedRef.current) {
              setHotelImages((prev) => (prev[h.id] ? prev : { ...prev, [h.id]: url }));
            }
          } else {
            stillNeed.push(h);
          }
        }

        if (stillNeed.length === 0) {
          if (end < list.length) setTimeout(runBatch, 0);
          return;
        }

        const newImages: Record<number, string> = {};
        await Promise.allSettled(
          stillNeed.map(async (h) => {
            // Server details first
            try {
              const remote = await fetchHotelDetailsViaBackend(h.id);
              if (remote.success && remote.data) {
                const url = getHotelImageUrl(remote.data as never) || getHotelImageUrls(remote.data as never)[0];
                if (url) {
                  newImages[h.id] = url;
                  void hotelPictureCache.set(h.id, url);
                  return;
                }
              }
            } catch {
              /* fall through */
            }
            try {
              const details = await tourvisorApi.getHotelDetails(h.id);
              const url = getHotelImageUrl(details as never) || getHotelImageUrls(details as never)[0];
              if (url) {
                newImages[h.id] = url;
                void hotelPictureCache.set(h.id, url);
              }
            } catch {
              /* ignore */
            }
          }),
        );

        if (!cancelled && mountedRef.current && Object.keys(newImages).length > 0) {
          setHotelImages((prev) => ({ ...prev, ...newImages }));
        }
        setTimeout(runBatch, stillNeed.length > 0 ? 120 : 0);
      })();
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [hotelIdsKey, active]);

  return hotelImages;
}
