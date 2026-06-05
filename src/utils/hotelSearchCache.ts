/**
 * Ключ кэша и фильтр отелей для поиска.
 */

import { HotelSearchParams, HotelCompact } from '../types/tourvisor';

export function getHotelSearchCacheKey(params: HotelSearchParams): string {
  const sortedTypes = params.types ? [...params.types].sort().join(',') : '';
  const keyParts = [
    params.countryId ? `cnt${params.countryId}` : '',
    params.regionId ? `reg${params.regionId}` : '',
    params.category ? `cat${params.category}` : '',
    params.rating ? `rat${params.rating}` : '',
    sortedTypes ? `types${sortedTypes}` : '',
    params.page ? `page${params.page}` : 'page1',
    params.limit ? `lim${params.limit}` : 'lim20',
  ].filter(Boolean);
  return `hotel_search_${keyParts.join('_')}`;
}

/** Ключ кэша для полного списка отелей (без page/limit) — один список на набор фильтров */
export function getHotelSearchCacheKeyAll(params: HotelSearchParams): string {
  const sortedTypes = params.types ? [...params.types].sort().join(',') : '';
  const keyParts = [
    params.countryId ? `cnt${params.countryId}` : '',
    params.regionId ? `reg${params.regionId}` : '',
    params.category ? `cat${params.category}` : '',
    params.rating ? `rat${params.rating}` : '',
    sortedTypes ? `types${sortedTypes}` : '',
  ].filter(Boolean);
  return `hotel_search_all_${keyParts.join('_')}`;
}

export function filterHotelsByParams(hotels: HotelCompact[], params: HotelSearchParams): HotelCompact[] {
  return hotels.filter(hotel => {
    if (params.countryId && hotel.country.id !== params.countryId) return false;
    if (params.regionId && hotel.region.id !== params.regionId) return false;
    if (params.category && hotel.category < params.category) return false;
    if (params.rating && hotel.rating < params.rating) return false;
    if (params.types && params.types.length > 0 && !params.types.includes(hotel.type)) return false;
    return true;
  });
}
