/**
 * Подписи цены тура — чтобы не путали с ценой «за отель / ночь».
 */
export function formatTourPriceFrom(amount: number, currencySymbol = '₽'): string {
  if (!amount || amount <= 0) return '';
  return `от ${Number(amount).toLocaleString('ru-RU')} ${currencySymbol}`;
}

/** Короткая подпись под ценой */
export const TOUR_PRICE_CAPTION = 'цена за тур';

/** Ещё короче для плотных карточек */
export const TOUR_PRICE_CAPTION_SHORT = 'за тур';
