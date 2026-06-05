/**
 * Догрузка URL главного фото отелей через GET /hotels/{id}, если в списке нет картинки.
 * Пачки с цепочкой setTimeout — следующая порция после завершения предыдущей.
 */

import { useState, useEffect, useRef } from 'react';
import { HotelCompact } from '../types/tourvisor';
import { tourvisorApi } from '../services/TourvisorApiService';
import { getHotelImageUrl, getHotelImageUrls } from '../utils/hotelImages';

const BATCH = 28;

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
    setHotelImages({});

    const runBatch = () => {
      if (cancelled || !mountedRef.current) return;
      const start = loadedUpToRef.current;
      if (start >= list.length) return;

      const end = Math.min(start + BATCH, list.length);
      const batch = list.slice(start, end);
      const needDetails = batch.filter((h) => !getHotelImageUrl(h as never));

      if (needDetails.length === 0) {
        loadedUpToRef.current = end;
        if (end < list.length) {
          setTimeout(runBatch, 0);
        }
        return;
      }

      loadedUpToRef.current = end;

      Promise.allSettled(needDetails.map((h) => tourvisorApi.getHotelDetails(h.id))).then((results) => {
        if (cancelled || !mountedRef.current) return;
        const newImages: Record<number, string> = {};
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value) {
            const v = r.value as never;
            const url =
              getHotelImageUrl(v) || (getHotelImageUrls(v)[0] ?? null);
            if (url) newImages[needDetails[i].id] = url;
          }
        });
        if (Object.keys(newImages).length > 0) {
          setHotelImages((prev) => ({ ...prev, ...newImages }));
        }
        setTimeout(runBatch, 0);
      });
    };

    setTimeout(runBatch, 0);

    return () => {
      cancelled = true;
    };
  }, [hotelIdsKey, active]);

  return hotelImages;
}
