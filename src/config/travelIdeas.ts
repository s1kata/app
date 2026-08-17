/**
 * Полка «Идеи для путешествий» на главной — сценарии, не список стран.
 * Даты считаем «на сейчас»: ближайшие 1–3 недели (у Tourvisor дальше часто пусто).
 */
import type { TourSearchParams } from '../types/tourvisor';

export type TravelIdeaId =
  | 'sea_ai'
  | 'with_kids'
  | 'budget_80'
  | 'no_visa'
  | 'season_break'
  | 'vip_5';

export type TravelIdea = {
  id: TravelIdeaId;
  titleKey: string;
  subtitleKey: string;
  image: string;
  searchPrefill: Partial<TourSearchParams>;
};

/** Качественные travel-фото (не стоковые «игрушки/чемоданы»). */
const IMG = {
  sea: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=900&q=80',
  kids: 'https://images.unsplash.com/photo-1602002418082-a4443e081dd1?auto=format&fit=crop&w=900&q=80',
  budget: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=900&q=80',
  novisa: 'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?auto=format&fit=crop&w=900&q=80',
  season: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
  vip: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=80',
} as const;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Окно вылета: через ~5 дней … ещё +10 дней гибкости.
 * (dateFrom/dateTo в Tourvisor — диапазон дат вылета, не длина тура)
 */
export function nearDepartureWindow(now = new Date()): {
  dateFrom: string;
  dateTo: string;
  nightsFrom: number;
  nightsTo: number;
} {
  const from = addDays(now, 5);
  const to = addDays(from, 10);
  return {
    dateFrom: ymd(from),
    dateTo: ymd(to),
    nightsFrom: 7,
    nightsTo: 11,
  };
}

/**
 * Сезонный слот в пределах ~6 недель (не «май через 9 месяцев»).
 * Лето/осень → бархатный; зима → тёплое море; весна → майские если близко.
 */
export function nearSeasonWindow(now = new Date()): {
  dateFrom: string;
  dateTo: string;
  nightsFrom: number;
  nightsTo: number;
  titleKey: string;
  subtitleKey: string;
} {
  const month = now.getMonth(); // 0–11
  const near = nearDepartureWindow(now);

  // Апр–май: майские, если до них ≤ 45 дней
  if (month === 3 || month === 4) {
    const y = now.getFullYear();
    const mayFrom = new Date(y, 4, 1);
    const mayTo = new Date(y, 4, 10);
    if (mayTo.getTime() >= now.getTime() && mayFrom.getTime() - now.getTime() < 45 * 86400000) {
      return {
        dateFrom: ymd(mayFrom < now ? addDays(now, 3) : mayFrom),
        dateTo: ymd(mayTo),
        nightsFrom: 5,
        nightsTo: 9,
        titleKey: 'ideas.seasonMayTitle',
        subtitleKey: 'ideas.seasonMaySub',
      };
    }
  }

  // Ноя–фев: тёплое море скоро
  if (month >= 10 || month <= 1) {
    return {
      ...near,
      nightsFrom: 6,
      nightsTo: 10,
      titleKey: 'ideas.seasonWinterTitle',
      subtitleKey: 'ideas.seasonWinterSub',
    };
  }

  // Авг–окт (и остальное тёплое): бархатный / скоро вылет
  if (month >= 7 && month <= 9) {
    const from = addDays(now, 7);
    const to = addDays(from, 12);
    return {
      dateFrom: ymd(from),
      dateTo: ymd(to),
      nightsFrom: 7,
      nightsTo: 11,
      titleKey: 'ideas.seasonVelvetTitle',
      subtitleKey: 'ideas.seasonVelvetSub',
    };
  }

  return {
    ...near,
    titleKey: 'ideas.seasonSoonTitle',
    subtitleKey: 'ideas.seasonSoonSub',
  };
}

/** Собирать идеи на момент открытия (даты не «застывают» при старте приложения). */
export function getTravelIdeas(now = new Date()): TravelIdea[] {
  const win = nearDepartureWindow(now);
  const season = nearSeasonWindow(now);

  return [
    {
      id: 'sea_ai',
      titleKey: 'ideas.seaAiTitle',
      subtitleKey: 'ideas.seaAiSub',
      image: IMG.sea,
      searchPrefill: {
        countryId: 4,
        adults: 2,
        childs: [],
        nightsFrom: win.nightsFrom,
        nightsTo: win.nightsTo,
        dateFrom: win.dateFrom,
        dateTo: win.dateTo,
        onlyCharter: false,
      },
    },
    {
      id: 'with_kids',
      titleKey: 'ideas.kidsTitle',
      subtitleKey: 'ideas.kidsSub',
      image: IMG.kids,
      searchPrefill: {
        countryId: 4,
        adults: 2,
        childs: [7],
        nightsFrom: 7,
        nightsTo: 10,
        dateFrom: win.dateFrom,
        dateTo: win.dateTo,
        onlyCharter: false,
      },
    },
    {
      id: 'budget_80',
      titleKey: 'ideas.budgetTitle',
      subtitleKey: 'ideas.budgetSub',
      image: IMG.budget,
      searchPrefill: {
        countryId: 1,
        adults: 2,
        childs: [],
        priceTo: 80000,
        nightsFrom: 6,
        nightsTo: 9,
        dateFrom: win.dateFrom,
        dateTo: win.dateTo,
        onlyCharter: false,
      },
    },
    {
      id: 'no_visa',
      titleKey: 'ideas.noVisaTitle',
      subtitleKey: 'ideas.noVisaSub',
      image: IMG.novisa,
      searchPrefill: {
        countryId: 1,
        adults: 2,
        childs: [],
        nightsFrom: win.nightsFrom,
        nightsTo: win.nightsTo,
        dateFrom: win.dateFrom,
        dateTo: win.dateTo,
        onlyCharter: false,
      },
    },
    {
      id: 'season_break',
      titleKey: season.titleKey,
      subtitleKey: season.subtitleKey,
      image: IMG.season,
      searchPrefill: {
        countryId: 4,
        adults: 2,
        childs: [],
        nightsFrom: season.nightsFrom,
        nightsTo: season.nightsTo,
        dateFrom: season.dateFrom,
        dateTo: season.dateTo,
        onlyCharter: false,
      },
    },
    {
      id: 'vip_5',
      titleKey: 'ideas.vipTitle',
      subtitleKey: 'ideas.vipSub',
      image: IMG.vip,
      searchPrefill: {
        countryId: 9,
        adults: 2,
        childs: [],
        hotelCategory: 5,
        nightsFrom: 5,
        nightsTo: 9,
        dateFrom: win.dateFrom,
        dateTo: win.dateTo,
        onlyCharter: false,
      },
    },
  ];
}

/** @deprecated используйте getTravelIdeas() */
export const TRAVEL_IDEAS = getTravelIdeas();
