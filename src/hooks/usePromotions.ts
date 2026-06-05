import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import type { Promotion } from '../types/promotion';

const CACHE_KEY = 'promotions_cache_v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function parseDayEndMs(endDate?: string): number | null {
  if (!endDate) return null;
  const t = Date.parse(endDate);
  if (!Number.isFinite(t)) return null;
  return t + 86400000;
}

function isActiveInDateRange(p: Promotion, now: number): boolean {
  const start = p.startDate ? Date.parse(p.startDate) : null;
  const endExclusive = parseDayEndMs(p.endDate);
  if (start != null && Number.isFinite(start) && now < start) return false;
  if (endExclusive != null && now >= endExclusive) return false;
  return true;
}

export function usePromotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    const dead = () => isCancelled?.() === true;

    if (!db) {
      if (!dead()) {
        setPromotions([]);
        setLoading(false);
      }
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (dead()) return;
      if (raw) {
        const parsed = JSON.parse(raw) as { at?: number; items?: Promotion[] };
        if (
          typeof parsed.at === 'number' &&
          Date.now() - parsed.at < CACHE_TTL_MS &&
          Array.isArray(parsed.items)
        ) {
          const now = Date.now();
          const filtered = parsed.items.filter(
            (p) => p.active !== false && isActiveInDateRange(p, now)
          );
          if (dead()) return;
          setPromotions(filtered.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)));
          setLoading(false);
          return;
        }
      }
    } catch {
      /* ignore cache */
    }

    try {
      const q = query(collection(db, 'promotions'), where('active', '==', true));
      const snap = await getDocs(q);
      if (dead()) return;
      const now = Date.now();
      const items: Promotion[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        items.push({
          id: docSnap.id,
          title: String(data.title ?? ''),
          description: String(data.description ?? ''),
          imageUrl: data.imageUrl != null ? String(data.imageUrl) : undefined,
          type: data.type != null ? String(data.type) : undefined,
          link: data.link != null ? String(data.link) : undefined,
          startDate: data.startDate != null ? String(data.startDate) : undefined,
          endDate: data.endDate != null ? String(data.endDate) : undefined,
          priority: typeof data.priority === 'number' ? data.priority : 0,
          active: data.active === true,
        });
      });
      const filtered = items
        .filter((p) => isActiveInDateRange(p, now))
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      if (dead()) return;
      setPromotions(filtered);
      try {
        await AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ at: Date.now(), items: filtered })
        );
      } catch {
        /* ignore */
      }
    } catch (e) {
      logger.warn('[usePromotions]', (e as Error)?.message);
      if (!dead()) setPromotions([]);
    } finally {
      if (!dead()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { promotions, loading, refresh: load };
}
