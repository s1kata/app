/**
 * Sanity цен туров: Tourvisor/кэш иногда отдаёт мусор вроде 7 619 ₽
 * за Таиланд 6 ночей (при соседнем туре ~220 000 ₽).
 * Не показываем такие суммы как «от … за тур».
 */

/** Страны с реально дешёвыми пакетами (без дальнего чартера). */
const LOW_COST_COUNTRY_IDS = new Set([
  46, // Абхазия
  47, // Россия
  53, // Армения
  54, // Грузия
  55, // Азербайджан
  56, // Узбекистан
  57, // Беларусь
  60, // Кыргызстан
  78, // Казахстан
]);

/** Минимально правдоподобная цена пакета в RUB (2 взр., с перелётом). */
export function packagePriceFloorRub(countryId?: number | null, nights?: number | null): number {
  const n = Number(nights) || 0;
  const cid = Number(countryId) || 0;
  if (cid > 0 && LOW_COST_COUNTRY_IDS.has(cid)) {
    return n >= 5 ? 8_000 : 4_000;
  }
  // Дальние направления: ниже ~25–40к почти всегда битые данные
  if (n >= 7) return 45_000;
  if (n >= 4) return 30_000;
  return 20_000;
}

export function priceToRub(price: number, currency?: string | null): number {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const c = String(currency || 'RUB').toUpperCase();
  if (c === 'RUB' || c === 'RUR') return Math.round(p);
  if (c === 'USD') return Math.round(p * 90);
  if (c === 'EUR') return Math.round(p * 100);
  return Math.round(p);
}

export function isPlausiblePackagePrice(
  price: number,
  opts?: {
    currency?: string | null;
    countryId?: number | null;
    nights?: number | null;
  },
): boolean {
  const rub = priceToRub(price, opts?.currency);
  if (rub <= 0) return false;
  return rub >= packagePriceFloorRub(opts?.countryId, opts?.nights);
}

/**
 * Убирает явные выбросы внутри одного отеля/выборки.
 * Пример: [7619, 221363] → [221363]
 */
export function filterPlausiblePrices(
  prices: number[],
  opts?: {
    currency?: string | null;
    countryId?: number | null;
    nights?: number | null;
  },
): number[] {
  const cleaned = (prices || [])
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p) && p > 0);

  if (!cleaned.length) return [];

  const floor = packagePriceFloorRub(opts?.countryId, opts?.nights);
  const inRub = cleaned.map((p) => ({
    raw: p,
    rub: priceToRub(p, opts?.currency),
  }));

  let kept = inRub.filter((x) => x.rub >= floor);
  if (!kept.length) return [];

  if (kept.length >= 2) {
    const sorted = [...kept].sort((a, b) => a.rub - b.rub);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1].rub + sorted[mid].rub) / 2
        : sorted[mid].rub;
    const relativeFloor = Math.max(floor, median * 0.35);
    const relative = kept.filter((x) => x.rub >= relativeFloor);
    if (relative.length) kept = relative;
  }

  return kept.map((x) => x.raw);
}

/** Мин. правдоподобная цена или 0, если все отброшены. */
export function saneMinPrice(
  prices: number[],
  opts?: {
    currency?: string | null;
    countryId?: number | null;
    nights?: number | null;
  },
): number {
  const ok = filterPlausiblePrices(prices, opts);
  if (!ok.length) return 0;
  return Math.min(...ok);
}

type PriceyTour = {
  price?: number;
  currency?: string | null;
  nights?: number | null;
  countryId?: number | null;
  country?: { id?: number } | null;
};

export function saneMinTourPrice<T extends PriceyTour>(
  tours: T[],
  fallbackCountryId?: number | null,
): number {
  if (!Array.isArray(tours) || !tours.length) return 0;
  const countryId =
    fallbackCountryId ??
    tours.find((t) => t.countryId || t.country?.id)?.countryId ??
    tours.find((t) => t.country?.id)?.country?.id ??
    null;
  const nights = tours.find((t) => Number(t.nights) > 0)?.nights ?? null;
  const currency = tours.find((t) => t.currency)?.currency ?? 'RUB';
  return saneMinPrice(
    tours.map((t) => Number(t.price) || 0),
    { currency, countryId, nights },
  );
}

/** Тур с минимальной правдоподобной ценой (для карточки / перехода). */
export function pickSaneCheapestTour<T extends PriceyTour>(
  tours: T[],
  fallbackCountryId?: number | null,
): T | null {
  if (!Array.isArray(tours) || !tours.length) return null;
  const countryId =
    fallbackCountryId ??
    tours.find((t) => t.countryId || t.country?.id)?.countryId ??
    tours.find((t) => t.country?.id)?.country?.id ??
    null;

  const scored = tours
    .map((t) => ({
      tour: t,
      price: Number(t.price) || 0,
      ok: isPlausiblePackagePrice(Number(t.price) || 0, {
        currency: t.currency,
        countryId: t.countryId ?? t.country?.id ?? countryId,
        nights: t.nights,
      }),
    }))
    .filter((x) => x.price > 0 && x.ok)
    .sort((a, b) => a.price - b.price);

  return scored[0]?.tour ?? null;
}

export function isPlausibleHotItem(item: {
  price?: number;
  currency?: string | null;
  nights?: number | null;
  country?: { id?: number } | null;
}): boolean {
  return isPlausiblePackagePrice(Number(item.price) || 0, {
    currency: item.currency,
    countryId: item.country?.id,
    nights: item.nights,
  });
}
