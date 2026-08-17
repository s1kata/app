import type { TourSearchParams } from '../types/tourvisor';

export type ApiTourResultsRouteParams = {
  searchId?: number;
  searchParams?: TourSearchParams;
  useCache?: boolean;
  runSearch?: boolean;
  /** Заголовок подборки (идеи) вместо «Результаты поиска» */
  collectionTitle?: string;
  ideaId?: string;
};

export type ApiTourDetailsRouteParams = {
  tourId: string;
  searchParams?: TourSearchParams;
  currency?: string;
};
