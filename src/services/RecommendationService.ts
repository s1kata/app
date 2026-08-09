/**
 * Персональные рекомендации: сервер (preferred) + локальный fallback.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TourHot, TourOutput, TourSearchParams } from '../types/tourvisor';
import { FavoritesService } from './FavoritesService';
import { tourvisorApi } from './TourvisorApiService';
import { logger } from '../utils/logger';
import { hotelPictureCache } from './HotelPictureCache';
import {
  fetchRecommendationsViaBackend,
  rememberSearchViaBackend,
  fetchHotToursViaBackend,
} from './sync/NextPatchBackendClient';

const RECENT_SEARCH_KEY = 'recent_tour_searches_v1';
const REC_CACHE_KEY = 'personal_recommendations_v1';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_RECENT = 8;

export type RecentTourSearch = {
  countryId: number;
  departureId?: number;
  countryName?: string;
  at: string;
};

export type RecommendationItem = {
  key: string;
  title: string;
  subtitle: string;
  price: number;
  currency: string;
  image?: string;
  stars: number;
  tourId?: string;
  countryId?: number;
  countryName?: string;
  source: 'favorite' | 'hot';
};

type RecCache = { at: number; items: RecommendationItem[] };

function tourToItem(t: TourOutput): RecommendationItem {
  const image =
    t.picture ||
    (t.hotel as { picturelink?: string })?.picturelink ||
    undefined;
  return {
    key: `fav_${t.id}`,
    title: t.hotel?.name || t.name || 'Тур',
    subtitle: [t.hotel?.country?.name, t.hotel?.region?.name].filter(Boolean).join(' · '),
    price: t.price || 0,
    currency: t.currency || 'RUB',
    image,
    stars: Number((t.hotel as { stars?: number; category?: number })?.stars ?? t.hotel?.category ?? 0),
    tourId: String(t.id),
    countryId: t.hotel?.country?.id,
    countryName: t.hotel?.country?.name,
    source: 'favorite',
  };
}

function hotToItem(h: TourHot, idx: number): RecommendationItem {
  return {
    key: `hot_${h.hotel.id}_${h.date}_${idx}`,
    title: h.hotel?.name || 'Отель',
    subtitle: [h.country?.name, h.hotel?.region?.name].filter(Boolean).join(' · '),
    price: h.price || 0,
    currency: h.currency || 'RUB',
    image: h.hotel?.picturelink || undefined,
    stars: Number(h.hotel?.category || 0),
    countryId: h.country?.id,
    countryName: h.country?.name,
    source: 'hot',
  };
}

function uniqueItems(items: RecommendationItem[], limit: number): RecommendationItem[] {
  const seen = new Set<string>();
  const out: RecommendationItem[] = [];
  for (const it of items) {
    const dedupe = it.tourId || `${it.countryId}_${it.title}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

class RecommendationService {
  async rememberSearch(params: Partial<TourSearchParams> & { countryName?: string }): Promise<void> {
    try {
      if (!params.countryId) return;
      const raw = await AsyncStorage.getItem(RECENT_SEARCH_KEY);
      const list: RecentTourSearch[] = raw ? JSON.parse(raw) : [];
      const next: RecentTourSearch = {
        countryId: params.countryId,
        departureId: params.departureId ?? undefined,
        countryName: params.countryName,
        at: new Date().toISOString(),
      };
      const filtered = [next, ...list.filter((x) => x.countryId !== next.countryId)].slice(0, MAX_RECENT);
      await AsyncStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(filtered));
      await this.invalidateCache();
      void rememberSearchViaBackend({
        countryId: params.countryId,
        departureId: params.departureId,
        countryName: params.countryName,
      });
    } catch (e) {
      logger.debug('[RecommendationService] rememberSearch', (e as Error)?.message);
    }
  }

  async getRecentSearches(): Promise<RecentTourSearch[]> {
    try {
      const raw = await AsyncStorage.getItem(RECENT_SEARCH_KEY);
      return raw ? (JSON.parse(raw) as RecentTourSearch[]) : [];
    } catch {
      return [];
    }
  }

  private async loadCache(): Promise<RecommendationItem[] | null> {
    try {
      const raw = await AsyncStorage.getItem(REC_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RecCache;
      if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
      return Array.isArray(parsed.items) ? parsed.items : null;
    } catch {
      return null;
    }
  }

  private async saveCache(items: RecommendationItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(REC_CACHE_KEY, JSON.stringify({ at: Date.now(), items } satisfies RecCache));
    } catch {
      /* ignore */
    }
  }

  async getRecommendations(limit = 8): Promise<RecommendationItem[]> {
    const cached = await this.loadCache();
    if (cached?.length) return cached.slice(0, limit);

    // Server-first
    try {
      const remote = await fetchRecommendationsViaBackend(limit);
      if (remote.success && remote.data?.length) {
        await this.saveCache(remote.data);
        return remote.data.slice(0, limit);
      }
    } catch (e) {
      logger.debug('[RecommendationService] backend', (e as Error)?.message);
    }

    const collected: RecommendationItem[] = [];

    try {
      const favorites = await FavoritesService.getInstance().getFavoriteTours();
      if (favorites?.length) {
        void hotelPictureCache.ingestFromTours(favorites);
        collected.push(...favorites.map(tourToItem));
      }
    } catch (e) {
      logger.debug('[RecommendationService] favorites', (e as Error)?.message);
    }

    if (collected.length < limit) {
      try {
        const recent = await this.getRecentSearches();
        const departureId = recent.find((r) => r.departureId)?.departureId || 1;
        const countryIds = recent.map((r) => r.countryId).filter(Boolean).slice(0, 2);

        if (countryIds.length > 0) {
          let hot: Awaited<ReturnType<typeof tourvisorApi.getHotTours>> = [];
          try {
            const remote = await fetchHotToursViaBackend({
              departureId,
              currency: 'RUB',
              onlyCharter: false,
              limit: 30,
              countryIds,
            });
            if (remote.success && remote.data?.length) {
              hot = remote.data;
            }
          } catch {
            /* fall through */
          }
          if (!hot.length) {
            hot = await tourvisorApi.getHotTours({
              departureId,
              currency: 'RUB',
              onlyCharter: false,
              limit: 30,
              countryIds,
            });
          }
          if (Array.isArray(hot) && hot.length) {
            void hotelPictureCache.ingestFromTours(
              hot.map((h) => ({ hotel: h.hotel, picture: h.hotel?.picturelink })),
            );
            collected.push(...hot.map(hotToItem));
          }
        }
      } catch (e) {
        logger.debug('[RecommendationService] hot', (e as Error)?.message);
      }
    }

    const picked = uniqueItems(collected, limit);
    if (picked.length) await this.saveCache(picked);
    return picked;
  }

  async invalidateCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(REC_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const recommendationService = new RecommendationService();
