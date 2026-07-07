/**
 * API синхронизации пользовательских данных (bookings meta, favorites).
 */
import { getValidAccessToken } from '../AuthApiClient';
import { getCrmApiBaseUrl } from '../../config/apiEndpoints';
import type { BookingMetaDto } from './bookingMapper';
import { logger } from '../../utils/logger';

const BOOKINGS_META_PATHS = ['/api/user/bookings-meta.php', '/api/user/bookings-meta'] as const;
const FAVORITES_PATHS = ['/api/user/favorites.php', '/api/user/favorites'] as const;

export interface FavoriteDto {
  itemType: 'tour' | 'hotel';
  itemId: string;
  payload: Record<string, unknown>;
  updatedAt?: string;
  createdAt?: string;
}

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

async function fetchWithPaths<T>(
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

export async function fetchBookingsMetaViaBackend(): Promise<{
  success: boolean;
  data?: BookingMetaDto[];
  error?: string;
}> {
  return fetchWithPaths<BookingMetaDto[]>(BOOKINGS_META_PATHS, { method: 'GET' });
}

export async function upsertBookingMetaViaBackend(
  meta: BookingMetaDto,
): Promise<{ success: boolean; data?: BookingMetaDto; error?: string }> {
  return fetchWithPaths<BookingMetaDto>(BOOKINGS_META_PATHS, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
}

export async function fetchFavoritesViaBackend(): Promise<{
  success: boolean;
  data?: FavoriteDto[];
  error?: string;
}> {
  return fetchWithPaths<FavoriteDto[]>(FAVORITES_PATHS, { method: 'GET' });
}

export async function pushFavoriteViaBackend(
  itemType: 'tour' | 'hotel',
  itemId: string,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const r = await fetchWithPaths<FavoriteDto>(FAVORITES_PATHS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemType, itemId, payload }),
  });
  return { success: r.success, error: r.error };
}

export async function deleteFavoriteViaBackend(
  itemType: 'tour' | 'hotel',
  itemId: string,
): Promise<{ success: boolean; error?: string }> {
  const params = new URLSearchParams({ itemType, itemId });
  const r = await fetchWithPaths<{ deleted: boolean }>(
    FAVORITES_PATHS.map((p) => `${p}?${params.toString()}`),
    { method: 'DELETE' },
  );
  if (!r.success) {
    logger.debug('[UserDataBackend] deleteFavorite failed:', r.error);
  }
  return { success: r.success, error: r.error };
}
