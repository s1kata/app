import type { TourSearchParams } from '../types/tourvisor';
import { normalizeTourSearchParams } from './tourSearchCache';

export type TourSearchValidation = {
  ok: boolean;
  params?: TourSearchParams;
  error?: string;
};

/** Проверка параметров перед запросом в Tourvisor — без NaN и прошлых дат. */
export function validateTourSearchParams(raw: TourSearchParams | null | undefined): TourSearchValidation {
  if (!raw) {
    return { ok: false, error: 'Параметры поиска не заданы' };
  }

  const p = normalizeTourSearchParams(raw);

  if (!Number.isFinite(p.departureId) || (p.departureId ?? 0) <= 0) {
    return { ok: false, error: 'Выберите город вылета' };
  }
  if (!Number.isFinite(p.countryId) || (p.countryId ?? 0) <= 0) {
    return { ok: false, error: 'Выберите страну' };
  }
  if (!p.dateFrom || !p.dateTo) {
    return { ok: false, error: 'Выберите даты вылета' };
  }
  if (p.dateFrom > p.dateTo) {
    return { ok: false, error: 'Дата «до» раньше даты «от»' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(`${p.dateFrom}T12:00:00`);
  if (from < today) {
    return { ok: false, error: 'Дата вылета не может быть в прошлом' };
  }

  const nightsFrom = Number(p.nightsFrom);
  const nightsTo = Number(p.nightsTo);
  if (!Number.isFinite(nightsFrom) || !Number.isFinite(nightsTo) || nightsFrom < 1 || nightsTo < nightsFrom) {
    return { ok: false, error: 'Проверьте количество ночей' };
  }

  const adults = Number(p.adults);
  if (!Number.isFinite(adults) || adults < 1) {
    return { ok: false, error: 'Укажите число взрослых' };
  }

  return { ok: true, params: p };
}
