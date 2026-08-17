/**
 * Стабильные обложки стран + общий fallback (не оставлять серую плитку).
 */
import { DEFAULT_HOTEL_IMAGE } from '../constants/images';
import { COUNTRIES_LIST } from '../data/countriesData';

const BY_NAME: Record<string, string> = {
  Турция:
    'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1200&q=75',
  Египет:
    'https://images.unsplash.com/photo-1568322445389-f64ac2515020?auto=format&fit=crop&w=1200&q=75',
  ОАЭ: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=75',
  Таиланд:
    'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1200&q=75',
  Мальдивы:
    'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=75',
  Россия:
    'https://images.unsplash.com/photo-1513326738677-b964603b136d?auto=format&fit=crop&w=1200&q=75',
  Греция:
    'https://images.unsplash.com/photo-1531572753322-ad063cecc140?auto=format&fit=crop&w=1200&q=75',
  Испания:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Sagrada_Familia_01.jpg/1280px-Sagrada_Familia_01.jpg',
  Италия:
    'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=1200&q=75',
  Франция:
    'https://images.unsplash.com/photo-1502602898536-47ad22581b52?auto=format&fit=crop&w=1200&q=75',
  'Шри-Ланка':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Unawatuna_beach%2C_Sri_Lanka.jpg/1280px-Unawatuna_beach%2C_Sri_Lanka.jpg',
  Китай:
    'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1200&q=75',
  Куба: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Classic_car_in_Havana.jpg/1280px-Classic_car_in_Havana.jpg',
  Доминикана:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Punta_Cana_beach.jpg/1280px-Punta_Cana_beach.jpg',
  Вьетнам:
    'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=75',
  Абхазия:
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=75',
  Сочи: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=75',
};

export const COUNTRY_IMAGE_FALLBACK = DEFAULT_HOTEL_IMAGE;

export function getCountryCoverImage(countryName: string): string {
  const exact = BY_NAME[countryName];
  if (exact) return exact;

  const fromData = COUNTRIES_LIST.find(
    (c) =>
      c.name === countryName ||
      c.name.toLowerCase().includes(countryName.toLowerCase()) ||
      countryName.toLowerCase().includes(c.name.toLowerCase()),
  );
  if (fromData?.images?.[0]) return fromData.images[0];

  const partial = Object.keys(BY_NAME).find(
    (k) =>
      k.toLowerCase().includes(countryName.toLowerCase()) ||
      countryName.toLowerCase().includes(k.toLowerCase()),
  );
  if (partial) return BY_NAME[partial];

  return COUNTRY_IMAGE_FALLBACK;
}
