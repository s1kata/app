/**
 * Утилита для предварительного кэширования деталей тура из результатов поиска.
 * Позволяет показывать данные при ошибке API (500 и др.) без повторного запроса.
 */

import { TourHotel, Tour, TourOutput, TourHot } from '../types/tourvisor';
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

/** TourHot (витрина) → TourHotel + Tour для списка и кэша деталей. */
export function tourHotToHotelAndTour(item: TourHot): { hotel: TourHotel; tour: Tour } | null {
  const hid = Number(item.hotel?.id) || 0;
  if (!hid) return null;
  const tourId =
    (item.tourId && String(item.tourId)) ||
    `${hid}_${item.date || ''}_${item.price || 0}`;
  const meal =
    item.meal ||
    ({ id: 0, name: '', fullName: '', russianName: '', fullRussianName: '' } as Tour['meal']);
  const operator =
    item.operator ||
    ({ id: 0, name: '', fullName: '', russianName: '' } as Tour['operator']);
  const tour: Tour = {
    id: tourId,
    name: 'Горящий тур',
    adults: 2,
    childs: 0,
    currency: item.currency || 'RUB',
    date: item.date || '',
    flightNights: 0,
    flightPlace: 0,
    fuelCharge: 0,
    hotelPlace: 0,
    isCharter: true,
    isPromo: true,
    meal,
    nights: Number(item.nights) || 0,
    operator,
    placement: 'DBL',
    price: Number(item.price) || 0,
    roomType: '',
  };
  const hotel: TourHotel = {
    id: hid,
    name: String(item.hotel?.name || ''),
    category: Number(item.hotel?.category) || 0,
    rating: Number(item.hotel?.rating) || 0,
    country: (item.country || item.hotel?.country) as TourHotel['country'],
    region: item.hotel?.region as TourHotel['region'],
    subRegion: item.hotel?.subRegion,
    currency: item.currency || 'RUB',
    price: Number(item.price) || 0,
    latitude: Number(item.hotel?.latitude) || 0,
    longitude: Number(item.hotel?.longitude) || 0,
    picturelink: String(item.hotel?.picturelink || ''),
    hotelDescription: '',
    hotelDescriptionLink: String(item.hotel?.hotelDescriptionLink || ''),
    hasDescription: !!item.hotel?.hotelDescriptionLink,
    hasPictures: !!item.hotel?.picturelink,
    seaDistance: 0,
    tours: [tour],
  };
  return { hotel, tour };
}

/** Группирует горящие в список отелей (как результаты поиска). */
export function tourHotsToTourHotels(items: TourHot[]): TourHotel[] {
  const map = new Map<number, TourHotel>();
  for (const item of items) {
    const pair = tourHotToHotelAndTour(item);
    if (!pair) continue;
    const existing = map.get(pair.hotel.id);
    if (!existing) {
      map.set(pair.hotel.id, pair.hotel);
      continue;
    }
    if (!existing.tours.some((t) => t.id === pair.tour.id)) {
      existing.tours.push(pair.tour);
    }
    if (pair.tour.price > 0 && (existing.price <= 0 || pair.tour.price < existing.price)) {
      existing.price = pair.tour.price;
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.price || 0) - (b.price || 0));
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

export async function cacheTourFromHot(item: TourHot, currency = 'RUB'): Promise<string | null> {
  const pair = tourHotToHotelAndTour(item);
  if (!pair) return null;
  const tourOutput = buildTourOutputFromSearchResult(pair.hotel, pair.tour);
  if (item.departure) {
    tourOutput.departure = item.departure;
  }
  const cur = (currency || item.currency || 'RUB').toUpperCase();
  await cacheService.set(CacheType.TOUR_DETAILS, `tour_${pair.tour.id}_${cur}`, tourOutput);
  return pair.tour.id;
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
