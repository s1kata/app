/**
 * Утилита для предварительного кэширования деталей тура из результатов поиска.
 * Позволяет показывать данные при ошибке API (500 и др.) без повторного запроса.
 */

import { TourHotel, Tour, TourOutput } from '../types/tourvisor';
import { cacheService, CacheType } from '../services/CacheService';

/**
 * Собирает TourOutput из TourHotel и Tour (данные из результатов поиска).
 * Используется как fallback при ошибке getTourDetails API.
 */
export function buildTourOutputFromSearchResult(hotel: TourHotel, tour: Tour): TourOutput {
  const hotelCompact = {
    id: hotel.id,
    name: hotel.name,
    category: hotel.category,
    rating: hotel.rating,
    country: hotel.country,
    region: hotel.region,
    subRegion: hotel.subRegion,
    type: 0,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    picturelink: hotel.picturelink,
    images: [],
  };

  return {
    ...tour,
    departure: { id: 0, name: '', nameGenitive: '' },
    hotel: hotelCompact,
    hotelDescription: hotel.hotelDescription || '',
    picture: hotel.picturelink || '',
  };
}

/**
 * Кэширует один тур из результатов поиска (при тапе на карточку).
 * Гарантирует наличие данных в кэше до перехода на экран деталей.
 */
export async function cacheTourFromSearchResult(
  hotel: TourHotel,
  tour: Tour,
  currency: string = 'RUB'
): Promise<void> {
  const tourOutput = buildTourOutputFromSearchResult(hotel, tour);
  const cacheKey = `tour_${tour.id}_${currency.toUpperCase()}`;
  await cacheService.set(CacheType.TOUR_DETAILS, cacheKey, tourOutput);
}

/**
 * Предварительно кэширует детали туров из списка TourHotel.
 * Вызывать после загрузки результатов поиска — при переходе на экран деталей
 * данные уже будут в кэше, и при ошибке API можно показать их вместо ошибки.
 */
export async function preCacheTourDetailsFromSearchResults(
  hotels: TourHotel[],
  currency: string
): Promise<void> {
  if (!hotels || hotels.length === 0) return;

  const currencyUpper = (currency || 'RUB').toUpperCase();

  for (const hotel of hotels) {
    if (!hotel.tours || hotel.tours.length === 0) continue;

    for (const tour of hotel.tours) {
      try {
        const tourOutput = buildTourOutputFromSearchResult(hotel, tour);
        const cacheKey = `tour_${tour.id}_${currencyUpper}`;
        await cacheService.set(CacheType.TOUR_DETAILS, cacheKey, tourOutput);
      } catch (e) {
        // Игнорируем ошибки при предварительном кэшировании
      }
    }
  }
}
