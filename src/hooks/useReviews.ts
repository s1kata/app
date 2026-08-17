import { useCallback, useState, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listReviews, type ReviewDto, type ReviewScope } from '../services/ReviewsApiClient';
import { reviewsRefreshBus } from '../services/ReviewsRefreshBus';
import { logger } from '../utils/logger';

function normalizeTourId(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

function mergeReview(prev: ReviewDto[], incoming: ReviewDto, limit?: number): ReviewDto[] {
  const next = [incoming, ...prev.filter((r) => r.id !== incoming.id)];
  return limit != null ? next.slice(0, limit) : next;
}

function eventMatchesScope(
  event: { tourId?: string | null; global?: boolean },
  tourId?: string,
  scope: ReviewScope = 'all',
): boolean {
  if (event.global) {
    return true;
  }

  const normalizedEvent = normalizeTourId(event.tourId);
  const normalizedTour = normalizeTourId(tourId);

  if (normalizedTour) {
    return normalizedEvent === normalizedTour;
  }
  if (scope === 'general') {
    return normalizedEvent === null;
  }
  return true;
}

export function useReviews(options: {
  tourId?: string;
  hotelId?: string;
  scope?: ReviewScope;
  withAuth?: boolean;
  limit?: number;
  /** Ждать готовности auth перед первым запросом (isOwn, helpful). GET без токена тоже работает. */
  authReady?: boolean;
}) {
  const tourId = options.tourId != null && options.tourId !== '' ? String(options.tourId) : undefined;
  const hotelId =
    options.hotelId != null && options.hotelId !== '' ? String(options.hotelId) : undefined;
  const { scope = 'all', withAuth = false, limit, authReady = true } = options;
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!authReady) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      let items: ReviewDto[] = [];
      if (tourId || hotelId) {
        // Два запроса: старый API берёт только tourId; hotelId ловит отзывы при смене id тура
        const [byTour, byHotel] = await Promise.all([
          tourId
            ? listReviews({ tourId, withAuth, scope: 'tour' }).catch(() => [] as ReviewDto[])
            : Promise.resolve([] as ReviewDto[]),
          hotelId
            ? listReviews({ hotelId, withAuth, scope: 'tour' }).catch(() => [] as ReviewDto[])
            : Promise.resolve([] as ReviewDto[]),
        ]);
        const seen = new Set<string>();
        items = [...byTour, ...byHotel].filter((r) => {
          if (!r?.id || seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } else {
        items = await listReviews({ scope, withAuth });
      }
      if (requestId !== requestIdRef.current) {
        return;
      }
      setReviews(limit != null ? items.slice(0, limit) : items);
    } catch (e) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      const message = (e as Error)?.message || 'Не удалось загрузить отзывы';
      logger.debug('[useReviews] load failed:', message);
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [tourId, hotelId, scope, withAuth, limit, authReady]);

  const prependReview = useCallback(
    (review: ReviewDto) => {
      setReviews((prev) => mergeReview(prev, review, limit));
      setError(null);
      setLoading(false);
    },
    [limit],
  );

  // Первая загрузка при mount (не только focus — иначе главная часто остаётся пустой)
  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // После возврата из фона — снова с API
  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        void reload();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [reload]);

  useEffect(() => {
    return reviewsRefreshBus.subscribe((event) => {
      if (!eventMatchesScope(event, tourId, scope)) {
        return;
      }
      if (event.review) {
        prependReview(event.review);
      }
      void reload();
    });
  }, [tourId, scope, prependReview, reload]);

  return { reviews, loading, error, reload, prependReview };
}
