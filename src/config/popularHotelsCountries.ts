/**
 * Страны для витрины «Популярные отели» (как на сайте popular_countries.php).
 */
export type PopularHotelCountry = {
  id: number;
  name: string;
  /** Реальный Tourvisor countryId (для виртуальных плиток) */
  tvCountryId?: number;
  regionIds?: number[];
};

export const POPULAR_HOTEL_COUNTRIES: PopularHotelCountry[] = [
  { id: 4, name: 'Турция' },
  { id: 1, name: 'Египет' },
  { id: 2, name: 'Таиланд' },
  { id: 9, name: 'ОАЭ' },
  { id: 47, name: 'Сочи' },
  { id: 46, name: 'Абхазия' },
  { id: 16, name: 'Вьетнам' },
  { id: 16104, name: 'Фукуок', tvCountryId: 16, regionIds: [104] },
  { id: 12, name: 'Шри-Ланка' },
  { id: 8, name: 'Мальдивы' },
];

export function resolvePopularHotelCountry(c: PopularHotelCountry): {
  countryId: number;
  regionIds?: number[];
} {
  return {
    countryId: c.tvCountryId && c.tvCountryId > 0 ? c.tvCountryId : c.id,
    regionIds: c.regionIds && c.regionIds.length ? c.regionIds : undefined,
  };
}
