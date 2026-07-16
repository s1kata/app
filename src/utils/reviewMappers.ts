import type { ReviewDto } from '../services/ReviewsApiClient';

export type ReviewListItem = {
  id: string;
  userName: string;
  rating: number;
  date: string;
  text: string;
  helpful: number;
  verified: boolean;
  isOwn?: boolean;
  hotelName?: string | null;
  countryName?: string | null;
  tourId?: string | null;
};

export function mapReviewDto(r: ReviewDto): ReviewListItem {
  return {
    id: r.id,
    userName: r.userName || 'Пользователь',
    rating: r.rating || 5,
    date: r.date || new Date().toISOString(),
    text: r.text || '',
    helpful: r.helpful || 0,
    verified: r.verified ?? true,
    isOwn: r.isOwn,
    hotelName: r.hotelName,
    countryName: r.countryName,
    tourId: r.tourId,
  };
}
