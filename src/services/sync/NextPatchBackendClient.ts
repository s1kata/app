/**
 * Клиент next-patch API: recommendations, price-watches, push-tokens, hotel-images, hot tours.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getValidAccessToken } from '../AuthApiClient';
import { getCrmApiBaseUrl, getSiteBaseUrl } from '../../config/apiEndpoints';
import type { RecommendationItem } from '../RecommendationService';
import type {
  Hotel,
  HotelCompact,
  HotelSearchParams,
  HotToursParams,
  TourHot,
  TourSearchParams,
  TourSearchOutput,
  TourSearchStatus,
  TourSearchContinueOutput,
  TourHotel,
  TourOutput,
  TourFlightsOutput,
} from '../../types/tourvisor';
import { logger } from '../../utils/logger';
import { isPlausiblePackagePrice } from '../../utils/tourPriceSanity';

function getBaseUrl(): string {
  return getCrmApiBaseUrl();
}

async function getBearer(): Promise<string | null> {
  try {
    return await getValidAccessToken();
  } catch {
    return null;
  }
}

async function apiFetch<T>(
  paths: readonly string[],
  init: RequestInit,
): Promise<{ success: boolean; data?: T; error?: string }> {
  const base = getBaseUrl();
  if (!base) return { success: false, error: 'no_backend' };
  const bearer = await getBearer();
  if (!bearer) return { success: false, error: 'unauthorized' };

  let lastError = 'Request failed';
  for (const path of paths) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          Authorization: `Bearer ${bearer}`,
        },
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 404 || res.status === 405) {
        lastError = data?.error || `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) return { success: false, error: data?.error || `HTTP ${res.status}` };
      return { success: !!data.success, data: data.data as T, error: data.error };
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : 'Network error';
    }
  }
  return { success: false, error: lastError };
}

const REC_PATHS = ['/api/user/recommendations.php', '/api/user/recommendations'] as const;
const WATCH_PATHS = ['/api/user/price-watches.php', '/api/user/price-watches'] as const;
const PUSH_PATHS = ['/api/user/push-tokens.php', '/api/user/push-tokens'] as const;
const IMAGE_PATHS = ['/api/cache/hotel-images.php', '/api/cache/hotel-images'] as const;

export async function fetchRecommendationsViaBackend(limit = 8): Promise<{
  success: boolean;
  data?: RecommendationItem[];
  error?: string;
}> {
  const r = await apiFetch<{ items: RecommendationItem[] }>(
    REC_PATHS.map((p) => `${p}?limit=${limit}`),
    { method: 'GET' },
  );
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data?.items || [] };
}

export async function rememberSearchViaBackend(payload: {
  countryId: number;
  departureId?: number;
  countryName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await apiFetch(REC_PATHS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remember-search', ...payload }),
  });
  return { success: r.success, error: r.error };
}

export async function upsertPriceWatchViaBackend(payload: {
  itemId: string;
  baselinePrice: number;
  currency?: string;
  hotelName?: string;
  countryName?: string;
  minDropPercent?: number;
  payload?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const r = await apiFetch(WATCH_PATHS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { success: r.success, error: r.error };
}

export async function deletePriceWatchViaBackend(itemId: string): Promise<{ success: boolean; error?: string }> {
  const params = new URLSearchParams({ itemId });
  const r = await apiFetch(
    WATCH_PATHS.map((p) => `${p}?${params.toString()}`),
    { method: 'DELETE' },
  );
  return { success: r.success, error: r.error };
}

export async function registerPushTokenViaBackend(token: string): Promise<{ success: boolean; error?: string }> {
  const r = await apiFetch(PUSH_PATHS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown',
      appVersion: Constants.expoConfig?.version || undefined,
    }),
  });
  return { success: r.success, error: r.error };
}

export async function fetchHotelImagesViaBackend(
  ids: number[],
  enrich = false,
): Promise<{ success: boolean; data?: Record<string, string>; error?: string }> {
  if (!ids.length) return { success: true, data: {} };
  const unique = [...new Set(ids.filter((n) => n > 0))].slice(0, 100);
  const qs = `ids=${unique.join(',')}${enrich ? '&enrich=1' : ''}`;
  const base = getBaseUrl();
  if (!base) return { success: false, error: 'no_backend' };

  // GET кэша фото — публичный (без обязательного Bearer)
  let lastError = 'Request failed';
  for (const path of IMAGE_PATHS) {
    try {
      const headers: Record<string, string> = {};
      const bearer = await getBearer();
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      const res = await fetch(`${base}${path}?${qs}`, { method: 'GET', headers });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = data?.error || `HTTP ${res.status}`;
        continue;
      }
      return { success: !!data.success, data: (data.data?.images || {}) as Record<string, string>, error: data.error };
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : 'Network error';
    }
  }
  return { success: false, error: lastError };
}

export async function upsertHotelImagesViaBackend(
  items: Array<{ hotelId: number; pictureUrl: string }>,
): Promise<void> {
  if (!items.length) return;
  const r = await apiFetch(IMAGE_PATHS, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!r.success) {
    logger.debug('[NextPatchBackend] upsertHotelImages failed:', r.error);
  }
}

const HOTEL_SEARCH_PATHS = ['/api/hotels/search.php', '/api/hotels/search'] as const;
const HOTEL_DETAILS_PATHS = ['/api/hotels/details.php', '/api/hotels/details'] as const;
const HOT_TOURS_PATHS = ['/api/tours/hots.php', '/api/tours/hots'] as const;

export type BackendHotelSearchResult = {
  hotels: HotelCompact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  allPages?: boolean;
  enriched?: boolean;
};

async function publicJsonFetch<T>(
  paths: readonly string[],
  init: RequestInit,
): Promise<{ success: boolean; data?: T; error?: string; status?: number }> {
  const base = getBaseUrl();
  if (!base) return { success: false, error: 'no_backend' };

  let lastError = 'Request failed';
  let lastStatus = 0;
  for (const path of paths) {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(init.headers as Record<string, string>),
      };
      const bearer = await getBearer();
      if (bearer) headers.Authorization = `Bearer ${bearer}`;

      const res = await fetch(`${base}${path}`, { ...init, headers });
      lastStatus = res.status;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 404 || res.status === 405) {
        lastError = data?.error || `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) {
        return { success: false, error: data?.error || `HTTP ${res.status}`, status: res.status };
      }
      return { success: !!data.success, data: data.data as T, error: data.error, status: res.status };
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : 'Network error';
    }
  }
  return { success: false, error: lastError, status: lastStatus };
}

/** Поиск отелей через сервер (Tourvisor token только на бэкенде). */
export async function searchHotelsViaBackend(
  params: HotelSearchParams & { allPages?: boolean; enrich?: boolean },
): Promise<{ success: boolean; data?: BackendHotelSearchResult; error?: string }> {
  if (!params.countryId) {
    return { success: false, error: 'countryId required' };
  }
  const body = {
    countryId: params.countryId,
    regionId: params.regionId,
    category: params.category,
    rating: params.rating,
    types: params.types,
    page: params.page || 1,
    limit: params.limit || 100,
    allPages: !!params.allPages,
    enrich: params.enrich !== false,
  };
  return publicJsonFetch<BackendHotelSearchResult>(HOTEL_SEARCH_PATHS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Детали отеля через сервер. */
export async function fetchHotelDetailsViaBackend(
  hotelId: number,
): Promise<{ success: boolean; data?: Hotel; error?: string; status?: number }> {
  if (!hotelId) return { success: false, error: 'hotelId required' };
  const qs = `id=${hotelId}`;
  return publicJsonFetch<Hotel>(
    HOTEL_DETAILS_PATHS.map((p) => `${p}?${qs}`),
    { method: 'GET' },
  );
}

const DEFAULT_HOT_COUNTRY_IDS = [4, 1, 9, 8, 2];

type PromoHotelRow = {
  id?: number;
  name?: string;
  category?: number;
  rating?: number;
  country?: TourHot['country'];
  region?: TourHot['hotel']['region'];
  subRegion?: TourHot['hotel']['subRegion'];
  type?: number;
  latitude?: number;
  longitude?: number;
  picturelink?: string;
  hotelDescriptionLink?: string;
  currency?: string;
  price?: number;
  tours?: Array<{
    id?: string;
    price?: number;
    priceOld?: number;
    oldPrice?: number;
    date?: string;
    nights?: number;
    currency?: string;
    meal?: TourHot['meal'];
    operator?: TourHot['operator'];
  }>;
};

function mapPromoHotelsToTourHots(
  hotels: PromoHotelRow[],
  departureId: number,
  currency: string,
): TourHot[] {
  const departure = {
    id: departureId,
    name: departureId === 1 ? 'Москва' : '',
    nameGenitive: departureId === 1 ? 'Москвы' : '',
  };
  const out: TourHot[] = [];
  for (const hotel of hotels) {
    const hid = Number(hotel.id) || 0;
    if (!hid) continue;
    const pic =
      (hotel.picturelink && String(hotel.picturelink).trim()) ||
      `https://static.tourvisor.ru/hotel_pics/main400/${hid}.jpg`;
    const hotelPayload: TourHot['hotel'] = {
      id: hid,
      name: String(hotel.name || ''),
      category: Number(hotel.category) || 0,
      rating: Number(hotel.rating) || 0,
      country: hotel.country as TourHot['hotel']['country'],
      region: hotel.region as TourHot['hotel']['region'],
      subRegion: hotel.subRegion,
      type: Number(hotel.type) || 0,
      latitude: Number(hotel.latitude) || 0,
      longitude: Number(hotel.longitude) || 0,
      picturelink: pic,
      hotelDescriptionLink: String(hotel.hotelDescriptionLink || ''),
    };
    const tours = Array.isArray(hotel.tours) ? hotel.tours : [];
    if (!tours.length) {
      const price = Number(hotel.price) || 0;
      if (price <= 0) continue;
      out.push({
        country: hotel.country as TourHot['country'],
        departure,
        hotel: hotelPayload,
        meal: undefined as unknown as TourHot['meal'],
        operator: undefined as unknown as TourHot['operator'],
        currency: String(hotel.currency || currency),
        date: '',
        nights: 0,
        price,
        priceOld: 0,
      });
      continue;
    }
    for (const tour of tours) {
      const price = Number(tour.price) || Number(hotel.price) || 0;
      if (price <= 0) continue;
      out.push({
        country: hotel.country as TourHot['country'],
        departure,
        hotel: hotelPayload,
        meal: tour.meal as TourHot['meal'],
        operator: tour.operator as TourHot['operator'],
        currency: String(tour.currency || hotel.currency || currency),
        date: String(tour.date || ''),
        nights: Number(tour.nights) || 0,
        price,
        priceOld: Number(tour.priceOld || tour.oldPrice) || 0,
        tourId: tour.id ? String(tour.id) : undefined,
      });
    }
  }
  out.sort((a, b) => (a.price || 0) - (b.price || 0));
  return out.filter((row) =>
    isPlausiblePackagePrice(Number(row.price) || 0, {
      currency: row.currency,
      countryId: row.country?.id ?? row.hotel?.country?.id,
      nights: row.nights,
    }),
  );
}

/** Акции с сайта, если Tourvisor /tours/hots недоступен (403). */
async function fetchHotToursFromPromoProxy(params: HotToursParams): Promise<TourHot[]> {
  const base = getSiteBaseUrl();
  if (!base || !params.departureId) return [];
  const countryIds =
    Array.isArray(params.countryIds) && params.countryIds.length
      ? params.countryIds.map(Number).filter((n) => n > 0)
      : DEFAULT_HOT_COUNTRY_IDS;
  const limit = Math.max(1, Math.min(200, Number(params.limit) || 40));
  const perCountry = Math.max(8, Math.ceil(limit / Math.min(3, countryIds.length)) + 4);
  const hotels: PromoHotelRow[] = [];
  const seen = new Set<number>();

  for (const countryId of countryIds.slice(0, 5)) {
    try {
      const qs = new URLSearchParams({
        type: 'promo-search',
        countryId: String(countryId),
        departureId: String(params.departureId),
        limit: String(perCountry),
        cacheOnly: '1',
        adults: '2',
      });
      const res = await fetch(`${base}/backend/api/tourvisor-proxy.php?${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const rows = Array.isArray(json?.data) ? (json.data as PromoHotelRow[]) : [];
      for (const row of rows) {
        const hid = Number(row?.id) || 0;
        if (hid && seen.has(hid)) continue;
        if (hid) seen.add(hid);
        hotels.push(row);
      }
      if (hotels.length >= limit) break;
    } catch (e) {
      logger.debug('[NextPatchBackend] promo hots fallback:', (e as Error)?.message);
    }
  }

  return mapPromoHotelsToTourHots(hotels, params.departureId, params.currency || 'RUB').slice(
    0,
    limit,
  );
}

/** Горящие туры через сервер (Tourvisor token только на бэкенде). */
export async function fetchHotToursViaBackend(
  params: HotToursParams,
): Promise<{ success: boolean; data?: TourHot[]; error?: string; status?: number }> {
  if (!params.departureId) {
    return { success: false, error: 'departureId required' };
  }
  const body = {
    departureId: params.departureId,
    currency: params.currency || 'RUB',
    onlyCharter: !!params.onlyCharter,
    limit: params.limit || 40,
    countryIds: params.countryIds,
    regionIds: params.regionIds,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    meal: params.meal,
    hotelCategory: params.hotelCategory,
    noVisa: params.noVisa,
    operatorIds: params.operatorIds,
  };
  const r = await publicJsonFetch<{ tours: TourHot[] }>(HOT_TOURS_PATHS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const backendTours = r.success ? r.data?.tours || [] : [];
  if (backendTours.length > 0) {
    return { success: true, data: backendTours, status: r.status };
  }

  // /tours/hots часто 403 (модуль не подключён) — витрина акций с сайта
  try {
    const promo = await fetchHotToursFromPromoProxy(params);
    if (promo.length > 0) {
      logger.debug('[NextPatchBackend] hots via promo-search:', promo.length);
      return { success: true, data: promo, status: r.status };
    }
  } catch (e) {
    logger.debug('[NextPatchBackend] promo hots error:', (e as Error)?.message);
  }

  if (!r.success) {
    return { success: false, error: r.error, status: r.status };
  }
  return { success: true, data: [], status: r.status };
}

const TOUR_SEARCH_PATHS = ['/api/tours/search.php', '/api/tours/search'] as const;
const TOUR_STATUS_PATHS = ['/api/tours/search-status.php', '/api/tours/search-status'] as const;
const TOUR_RESULTS_PATHS = ['/api/tours/search-results.php', '/api/tours/search-results'] as const;
const TOUR_CONTINUE_PATHS = ['/api/tours/search-continue.php', '/api/tours/search-continue'] as const;
const TOUR_DETAILS_PATHS = ['/api/tours/details.php', '/api/tours/details'] as const;
const TOUR_FLIGHTS_PATHS = ['/api/tours/flights.php', '/api/tours/flights'] as const;
const TOUR_DATES_PATHS = ['/api/tours/dates.php', '/api/tours/dates'] as const;

/** Старт поиска туров через доменный API. */
export async function startTourSearchViaBackend(
  params: TourSearchParams,
): Promise<{ success: boolean; data?: TourSearchOutput; error?: string; status?: number }> {
  return publicJsonFetch<TourSearchOutput>(TOUR_SEARCH_PATHS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function fetchTourSearchStatusViaBackend(
  searchId: number,
  operatorStatus = false,
): Promise<{ success: boolean; data?: TourSearchStatus; error?: string; status?: number }> {
  const qs = `id=${searchId}&operatorStatus=${operatorStatus ? '1' : '0'}`;
  return publicJsonFetch<TourSearchStatus>(
    TOUR_STATUS_PATHS.map((p) => `${p}?${qs}`),
    { method: 'GET' },
  );
}

export async function fetchTourSearchResultsViaBackend(
  searchId: number,
  limit = 25,
  skipOperatorFilter = false,
): Promise<{ success: boolean; data?: TourHotel[]; error?: string; status?: number }> {
  const qs = `id=${searchId}&limit=${limit}${skipOperatorFilter ? '&skipOperatorFilter=1' : ''}`;
  const r = await publicJsonFetch<{ hotels: TourHotel[] }>(
    TOUR_RESULTS_PATHS.map((p) => `${p}?${qs}`),
    { method: 'GET' },
  );
  if (!r.success) return { success: false, error: r.error, status: r.status };
  return { success: true, data: r.data?.hotels || [], status: r.status };
}

export async function continueTourSearchViaBackend(
  searchId: number,
): Promise<{ success: boolean; data?: TourSearchContinueOutput; error?: string; status?: number }> {
  const qs = `id=${searchId}`;
  return publicJsonFetch<TourSearchContinueOutput>(
    TOUR_CONTINUE_PATHS.map((p) => `${p}?${qs}`),
    { method: 'GET' },
  );
}

export async function fetchTourDetailsViaBackend(
  tourId: string,
  currency: string,
): Promise<{ success: boolean; data?: TourOutput; error?: string; status?: number }> {
  const qs = `id=${encodeURIComponent(tourId)}&currency=${encodeURIComponent(currency || 'RUB')}`;
  return publicJsonFetch<TourOutput>(
    TOUR_DETAILS_PATHS.map((p) => `${p}?${qs}`),
    { method: 'GET' },
  );
}

export async function fetchTourFlightsViaBackend(
  tourId: string,
  currency: string,
): Promise<{ success: boolean; data?: TourFlightsOutput; error?: string; status?: number }> {
  const qs = `id=${encodeURIComponent(tourId)}&currency=${encodeURIComponent(currency || 'RUB')}`;
  return publicJsonFetch<TourFlightsOutput>(
    TOUR_FLIGHTS_PATHS.map((p) => `${p}?${qs}`),
    { method: 'GET' },
  );
}

export async function fetchTourDatesViaBackend(
  departureId: number,
  countryId: number,
  arrivalId?: number,
  onlyCharter?: boolean,
): Promise<{ success: boolean; data?: string[]; error?: string; status?: number }> {
  const q = new URLSearchParams({
    departureId: String(departureId),
    countryId: String(countryId),
  });
  if (arrivalId != null) q.set('arrivalId', String(arrivalId));
  if (onlyCharter != null) q.set('onlyCharter', onlyCharter ? '1' : '0');
  const r = await publicJsonFetch<{ dates: string[] }>(
    TOUR_DATES_PATHS.map((p) => `${p}?${q.toString()}`),
    { method: 'GET' },
  );
  if (!r.success) return { success: false, error: r.error, status: r.status };
  return { success: true, data: r.data?.dates || [], status: r.status };
}
