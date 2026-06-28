import type { TourSearchParams } from '../types/tourvisor';

export type ApiTourResultsRouteParams = {
  searchId?: number;
  searchParams?: TourSearchParams;
  useCache?: boolean;
  runSearch?: boolean;
};

export type ApiTourDetailsRouteParams = {
  tourId: string;
  searchParams?: TourSearchParams;
};
