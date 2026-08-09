/**
 * Клиент next-patch API: recommendations, price-watches, push-tokens, hotel-images, hot tours.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getValidAccessToken } from '../AuthApiClient';
import { getCrmApiBaseUrl } from '../../config/apiEndpoints';
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
  if (!r.success) {
    return { success: false, error: r.error, status: r.status };
  }
  return { success: true, data: r.data?.tours || [], status: r.status };
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
): Promise<{ success: boolean; data?: TourHotel[]; error?: string; status?: number }> {
  const qs = `id=${searchId}&limit=${limit}`;
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
