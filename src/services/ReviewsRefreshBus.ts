import type { ReviewDto } from './ReviewsApiClient';

export type ReviewsRefreshEvent = {
  tourId?: string | null;
  review?: ReviewDto;
  /** Обновить все списки отзывов (главная, туры, экран Reviews) */
  global?: boolean;
};

type Handler = (event: ReviewsRefreshEvent) => void;

const handlers = new Set<Handler>();

/** Сигнал для мгновенного обновления списков отзывов без полной перезагрузки экрана. */
export const reviewsRefreshBus = {
  emit(event: ReviewsRefreshEvent): void {
    handlers.forEach((handler) => handler(event));
  },
  subscribe(handler: Handler): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  },
};
