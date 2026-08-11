/**
 * Поиск туров по отелю для хаба отеля (25 + подгрузка).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Tour, TourHotel, TourSearchParams } from '../types/tourvisor';
import { searchTours } from '../hooks/useTourSearch';
import { tourvisorApi } from '../services/TourvisorApiService';
import { buildTourSearchParamsForHotel } from '../utils/hotelTourSearch';
import { logger } from '../utils/logger';
import { cacheTourFromSearchResult } from '../utils/tourDetailsCache';

export const HOTEL_TOURS_PAGE = 25;

export type HotelTourOffer = {
  key: string;
  tour: Tour;
  hotel: TourHotel;
};

function flattenOffers(hotels: TourHotel[], hotelId: number): HotelTourOffer[] {
  const want = Number(hotelId);
  const out: HotelTourOffer[] = [];
  const seen = new Set<string>();
  for (const h of hotels) {
    if (want > 0 && Number(h.id) !== want) continue;
    const tours = Array.isArray(h.tours) ? h.tours : [];
    for (const t of tours) {
      const id = String(t.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ key: id, tour: t, hotel: h });
    }
  }
  out.sort((a, b) => (Number(a.tour.price) || 0) - (Number(b.tour.price) || 0));
  return out;
}

function minPriceOf(offers: HotelTourOffer[]): number {
  let min = 0;
  for (const o of offers) {
    const p = Number(o.tour.price) || 0;
    if (p > 0 && (min === 0 || p < min)) min = p;
  }
  return min;
}

export function useHotelTours(
  hotel: { id: number; country?: { id: number }; category?: number; region?: { id: number } } | null,
  tourContext: Partial<TourSearchParams> | undefined,
  enabled: boolean,
) {
  const [allOffers, setAllOffers] = useState<HotelTourOffer[]>([]);
  const [visibleCount, setVisibleCount] = useState(HOTEL_TOURS_PAGE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchId, setSearchId] = useState<number | null>(null);
  const [params, setParams] = useState<TourSearchParams | null>(null);
  const genRef = useRef(0);

  const reload = useCallback(async () => {
    if (!hotel?.id || !enabled) return;
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    setVisibleCount(HOTEL_TOURS_PAGE);
    try {
      const p = await buildTourSearchParamsForHotel(hotel, tourContext || {});
      if (!p) {
        if (gen === genRef.current) {
          setError('Не удалось собрать параметры поиска');
          setAllOffers([]);
        }
        return;
      }
      if (gen !== genRef.current) return;
      setParams(p);

      // Стартуем search сами, чтобы сохранить searchId для continue
      const { searchId: sid } = await tourvisorApi.startTourSearch(p);
      await tourvisorApi.pollTourSearchUntilReady(sid);
      let hotels = await tourvisorApi.getTourSearchResults(sid, HOTEL_TOURS_PAGE, {
        skipOperatorFilter: true,
      });
      if (Array.isArray(p.hotelIds) && p.hotelIds.length) {
        const want = new Set(p.hotelIds.map(Number));
        hotels = hotels.filter((h) => want.has(Number(h.id)));
      }
      // fallback через кэш-пайплайн если пусто
      if (!hotels.length) {
        hotels = await searchTours(p, HOTEL_TOURS_PAGE, true);
      }
      if (gen !== genRef.current) return;
      const offers = flattenOffers(hotels, hotel.id);
      setSearchId(sid);
      setAllOffers(offers);
      if (!offers.length) setError(null);
    } catch (e) {
      logger.debug('[useHotelTours]', (e as Error)?.message);
      if (gen === genRef.current) {
        setError((e as Error)?.message || 'Ошибка поиска туров');
        setAllOffers([]);
      }
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [hotel, tourContext, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visibleOffers = allOffers.slice(0, visibleCount);
  const minPrice = minPriceOf(allOffers);
  const canShowMoreLocal = visibleCount < allOffers.length;

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    if (canShowMoreLocal) {
      setVisibleCount((c) => c + HOTEL_TOURS_PAGE);
      return;
    }
    if (!searchId || !hotel?.id) return;
    setLoadingMore(true);
    try {
      await tourvisorApi.continueTourSearch(searchId);
      await tourvisorApi.pollTourSearchUntilReady(searchId);
      const nextLimit = Math.min(200, Math.max(allOffers.length, visibleCount) + HOTEL_TOURS_PAGE);
      let hotels = await tourvisorApi.getTourSearchResults(searchId, nextLimit, {
        skipOperatorFilter: true,
      });
      hotels = hotels.filter((h) => Number(h.id) === Number(hotel.id));
      const offers = flattenOffers(hotels, hotel.id);
      setAllOffers(offers);
      setVisibleCount((c) => Math.min(offers.length, c + HOTEL_TOURS_PAGE));
    } catch (e) {
      logger.debug('[useHotelTours] loadMore:', (e as Error)?.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, canShowMoreLocal, searchId, hotel, allOffers.length, visibleCount]);

  const openOffer = useCallback(
    async (offer: HotelTourOffer, navigation: { navigate: (s: string, p?: object) => void }) => {
      const currency = offer.tour.currency || params?.currency || 'RUB';
      await cacheTourFromSearchResult(offer.hotel, offer.tour, currency).catch(() => {});
      navigation.navigate('ApiTourDetails', {
        tourId: String(offer.tour.id),
        currency,
      });
    },
    [params],
  );

  const hasMore = canShowMoreLocal || !!searchId;

  return {
    loading,
    loadingMore,
    error,
    offers: visibleOffers,
    totalFound: allOffers.length,
    minPrice,
    hasMore: hasMore && (canShowMoreLocal || allOffers.length >= visibleCount),
    reload,
    loadMore,
    openOffer,
    params,
  };
}
