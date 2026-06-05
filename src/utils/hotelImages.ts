import { logger } from './logger';

/**
 * Нормализация фото отелей из ответа API.
 * Tourvisor и другие источники могут возвращать изображения в разных полях:
 * picturelink, picture, image, images[], photo, mainImage, thumb, thumbnail, pictureUrl и т.д.
 */

const LOG_IMAGE_DEBUG = __DEV__;

type HotelLike = Record<string, unknown> & {
  picturelink?: string;
  picture?: string;
  image?: string;
  images?: string[];
  photo?: string;
  mainImage?: string;
  thumb?: string;
  thumbnail?: string;
  pictureUrl?: string;
};

const IMAGE_KEYS: (keyof HotelLike)[] = [
  'picturelink',
  'picture',
  'image',
  'photo',
  'mainImage',
  'thumb',
  'thumbnail',
  'pictureUrl',
];

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map(s => s.trim());
  }
  return [];
}

/** Элемент images[] может быть строкой или объектом { url?, link?, src?, picture? } */
function imageItemToUrl(item: unknown): string | null {
  if (typeof item === 'string' && item.trim().length > 0) {
    const s = item.trim();
    return s.startsWith('//') ? `https:${s}` : s;
  }
  if (item != null && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    for (const key of ['url', 'link', 'src', 'picture', 'image']) {
      const v = asString(o[key]);
      if (v) return v.startsWith('//') ? `https:${v}` : v;
    }
  }
  return null;
}

/** Извлекает массив URL из поля images (строки или объекты с url/link) */
function extractImagesArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const url = imageItemToUrl(item);
    if (url && (url.startsWith('http://') || url.startsWith('https://')) && !seen.has(url)) {
      result.push(url);
      seen.add(url);
    }
  }
  return result;
}

/** Поля с возможной ссылкой на фото, в т.ч. во вложенном common */
const IMAGE_KEYS_NESTED = ['picturelink', 'picture', 'image', 'photo', 'mainImage', 'thumb', 'thumbnail', 'pictureUrl', 'site'];

function getImageUrlFromObject(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  for (const key of IMAGE_KEYS_NESTED) {
    const raw = asString(obj[key]);
    if (!raw) continue;
    // Поддержка протокол-независимых URL из Tourvisor: //static.tourvisor.ru/...
    const url = raw.startsWith('//') ? `https:${raw}` : raw;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
  }
  const arr = obj.images;
  if (Array.isArray(arr) && arr.length > 0) {
    const firstUrl = imageItemToUrl(arr[0]);
    if (firstUrl) return firstUrl;
  }
  const common = obj.common as Record<string, unknown> | undefined;
  if (common && typeof common === 'object' && Array.isArray(common.images) && common.images.length > 0) {
    const firstUrl = imageItemToUrl(common.images[0]);
    if (firstUrl) return firstUrl;
  }
  return null;
}

/**
 * Собирает одну главную ссылку на фото отеля из любых полей API (включая вложенный common).
 */
export function getHotelImageUrl(hotel: HotelLike | null | undefined): string | null {
  if (!hotel) return null;

  const raw = hotel as Record<string, unknown>;
  const fromTop = getImageUrlFromObject(raw);
  if (fromTop) return fromTop;

  const common = raw.common as Record<string, unknown> | undefined;
  if (common && typeof common === 'object') {
    const fromCommon = getImageUrlFromObject(common);
    if (fromCommon) return fromCommon;
  }

  return null;
}

/**
 * Собирает все доступные ссылки на фото отеля (главное первым), включая common.
 */
export function getHotelImageUrls(hotel: HotelLike | null | undefined): string[] {
  if (!hotel) return [];

  const raw = hotel as Record<string, unknown>;
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (url: string | null) => {
    if (!url) return;
    const normalized = url.startsWith('//') ? `https:${url}` : url;
    if (
      (normalized.startsWith('http://') || normalized.startsWith('https://')) &&
      !seen.has(normalized)
    ) {
      result.push(normalized);
      seen.add(normalized);
    }
  };

  add(getHotelImageUrl(hotel));
  const fromImagesArray = extractImagesArray(raw.images);
  for (const u of fromImagesArray) add(u);
  for (const u of asStringArray(hotel.images)) add(u);
  for (const key of IMAGE_KEYS) {
    add(asString(raw[key]));
  }
  const common = raw.common as Record<string, unknown> | undefined;
  if (common && typeof common === 'object') {
    for (const key of IMAGE_KEYS_NESTED) {
      add(asString(common[key]));
    }
    for (const u of extractImagesArray(common.images)) add(u);
  }

  return result;
}

let _loggedNoImageSample = false;

/**
 * Нормализует объект отеля из API: заполняет picturelink и images из любых полей ответа.
 * Результат можно положить обратно в hotel для единообразного отображения.
 */
export function normalizeHotelImages<T extends HotelLike>(hotel: T): T & { picturelink?: string; images?: string[] } {
  const urls = getHotelImageUrls(hotel);
  const picturelink = urls[0] ?? undefined;
  const images = urls.length > 0 ? urls : undefined;

  if (LOG_IMAGE_DEBUG && urls.length === 0 && !_loggedNoImageSample) {
    _loggedNoImageSample = true;
    const raw = hotel as Record<string, unknown>;
    const keys = Object.keys(raw).sort().join(', ');
    logger.debug('[TravelHub HOTEL] Отель без фото (образец). Ключи:', keys);
  }

  return {
    ...hotel,
    picturelink,
    images,
  } as T & { picturelink?: string; images?: string[] };
}
