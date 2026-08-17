/** Локальные даты YYYY-MM-DD без UTC-сдвигов. */

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  // Полдень — чтобы DateTimePicker / DST не уезжали на соседний день
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export function monthIndex(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

export function addMonths(base: Date, delta: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + delta, 1, 12, 0, 0, 0);
}

export function formatRuShort(ymd: string): string {
  try {
    return parseYmd(ymd).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  } catch {
    return ymd;
  }
}

export function formatMonthYear(d: Date): string {
  const raw = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** ДД.ММ.ГГГГ из локальных y/m/d (без toISOString). */
export function formatDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

export function parseDDMMYYYY(value: string): Date | null {
  const raw = String(value || '').trim();
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return null;
  const [dd, mm, yyyy] = raw.split('.').map(Number);
  const date = new Date(yyyy, mm - 1, dd, 12, 0, 0, 0);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== yyyy ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return null;
  }
  return date;
}

/**
 * Строка даты (ДД.ММ.ГГГГ или YYYY-MM-DD) → локальный Date в полдень.
 * Не использовать `new Date('YYYY-MM-DD')` — это UTC и даёт ±1 день.
 */
export function parseFlexibleDateLocal(value: string | null | undefined): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const dmy = parseDDMMYYYY(raw);
  if (dmy) return dmy;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
  }
  return null;
}

/** Нормализация для хранения в профиле: всегда ДД.ММ.ГГГГ. */
export function toDDMMYYYY(value: string | null | undefined): string {
  const d = parseFlexibleDateLocal(value);
  return d ? formatDDMMYYYY(d) : String(value || '').trim();
}

/**
 * Календарный день из DateTimePicker → ДД.ММ.ГГГГ.
 * Берём только локальные компоненты, час фиксируем в полдень.
 */
export function formatPickerLocalDay(selected: Date): string {
  const local = new Date(
    selected.getFullYear(),
    selected.getMonth(),
    selected.getDate(),
    12,
    0,
    0,
    0,
  );
  return formatDDMMYYYY(local);
}
