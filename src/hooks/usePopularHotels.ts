/**
 * Загрузка отелей с ценами через поиск туров (не каталог /hotels).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HotelCompact, Tour, TourHotel, TourSearchParams } from '../types/tourvisor';
import { searchTours } from './useTourSearch';
import { resolvePreferredDepartureId } from '../utils/hotelTourSearch';
import {
  POPULAR_HOTEL_COUNTRIES,
  resolvePopularHotelCountry,
  type PopularHotelCountry,
} from '../config/popularHotelsCountries';
import { logger } from '../utils/logger';
import { isPlausiblePackagePrice, saneMinPrice } from '../utils/tourPriceSanity';

export type PopularHotelCard = HotelCompact & {
  minPrice: number;
};

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pickPrice(...vals: unknown[]): number {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return 0;
}

function hotelMinPrice(h: TourHotel): number {
  const tours = Array.isArray(h.tours) ? h.tours : [];
  const priced = tours
    .map((t) => {
      const anyT = t as Tour & { totalPrice?: number; priceRub?: number; cost?: number };
      return {
        price: pickPrice(anyT.totalPrice, anyT.price, anyT.priceRub, anyT.cost),
        currency: (t as Tour).currency || 'RUB',
        nights: (t as Tour).nights,
      };
    })
    .filter((x) => x.price > 0);

  if (priced.length) {
    return saneMinPrice(
      priced.map((x) => x.price),
      {
        currency: priced[0].currency,
        countryId: h.country?.id,
        nights: priced.find((x) => Number(x.nights) > 0)?.nights,
      },
    );
  }

  const anyH = h as TourHotel & { priceFrom?: number };
  const fallback = pickPrice(anyH.price, anyH.priceFrom);
  if (
    fallback > 0 &&
    isPlausiblePackagePrice(fallback, { currency: 'RUB', countryId: h.country?.id })
  ) {
    return fallback;
  }
  return 0;
}

function hotelPhoto(h: TourHotel): string {
  const anyH = h as TourHotel & { pictures?: string[]; images?: string[] };
  if (h.picturelink) return String(h.picturelink);
  if (Array.isArray(anyH.pictures) && anyH.pictures[0]) return String(anyH.pictures[0]);
  if (Array.isArray(anyH.images) && anyH.images[0]) return String(anyH.images[0]);
  return '';
}

export function groupPricedHotels(raw: TourHotel[]): PopularHotelCard[] {
  const map = new Map<number, PopularHotelCard>();
  for (const h of raw || []) {
    const id = Number(h.id) || 0;
    if (!id) continue;
    const minPrice = hotelMinPrice(h);
    if (minPrice <= 0) continue;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, {
        ...(h as unknown as HotelCompact),
        id,
        name: h.name || 'Отель',
        category: Number(h.category) || 0,
        rating: Number(h.rating) || 0,
        picturelink: hotelPhoto(h) || undefined,
        price: minPrice,
        priceFrom: minPrice,
        minPrice,
      });
    } else if (minPrice < existing.minPrice) {
      existing.minPrice = minPrice;
      existing.price = minPrice;
      existing.priceFrom = minPrice;
      if (!existing.picturelink) existing.picturelink = hotelPhoto(h) || undefined;
    }
  }
  return Array.from(map.values());
}

export type PopularHotelsSort = 'price' | 'rating' | 'stars';

export function sortPopularHotels(
  list: PopularHotelCard[],
  sort: PopularHotelsSort,
  minStars: number,
): PopularHotelCard[] {
  let out = list.slice();
  if (minStars > 0) {
    out = out.filter((h) => (Number(h.category) || 0) >= minStars);
  }
  out.sort((a, b) => {
    if (sort === 'rating') return (Number(b.rating) || 0) - (Number(a.rating) || 0);
    if (sort === 'stars') return (Number(b.category) || 0) - (Number(a.category) || 0);
    return (a.minPrice || 0) - (b.minPrice || 0);
  });
  return out;
}

export function usePopularHotels(country: PopularHotelCountry, minStars: number) {
  const [hotels, setHotels] = useState<PopularHotelCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tourContext, setTourContext] = useState<Partial<TourSearchParams>>({});
  const genRef = useRef(0);

  const reload = useCallback(async () => {
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    try {
      const resolved = resolvePopularHotelCountry(country);
      const departureId = await resolvePreferredDepartureId(null);
      const params: TourSearchParams = {
        departureId,
        countryId: resolved.countryId,
        dateFrom: isoPlusDays(3),
        dateTo: isoPlusDays(17),
        nightsFrom: 6,
        nightsTo: 14,
        adults: 2,
        childs: [],
        currency: 'RUB',
        onlyCharter: false,
        ...(resolved.regionIds ? { regionIds: resolved.regionIds } : {}),
        ...(minStars > 0 ? { hotelCategory: minStars } : {}),
        skipOperatorFilter: true,
      };
      if (gen !== genRef.current) return;
      setTourContext({
        departureId,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        nightsFrom: params.nightsFrom,
        nightsTo: params.nightsTo,
        adults: 2,
        currency: 'RUB',
      });
      const raw = await searchTours(params, 100);
      if (gen !== genRef.current) return;
      setHotels(groupPricedHotels(raw || []));
    } catch (e) {
      logger.warn('[usePopularHotels]', (e as Error)?.message || e);
      if (gen === genRef.current) {
        setHotels([]);
        setError((e as Error)?.message || 'Не удалось загрузить отели');
      }
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [country, minStars]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    hotels,
    loading,
    error,
    tourContext,
    reload,
    countries: POPULAR_HOTEL_COUNTRIES,
  };
}
