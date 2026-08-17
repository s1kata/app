const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function parseIsoDate(iso?: string | null): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const part = String(iso).trim().split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** ISO YYYY-MM-DD → «12 июля 2026» */
export function formatDateRuLong(iso?: string | null): string {
  const d = parseIsoDate(iso);
  if (!d) return iso ? String(iso).trim().split('T')[0] : '';
  return `${d.day} ${MONTHS_GENITIVE[d.month - 1]} ${d.year}`;
}

/** ISO YYYY-MM-DD → «20 августа» (карточки на Home) */
export function formatDateRuShort(iso?: string | null): string {
  const d = parseIsoDate(iso);
  if (!d) return iso ? String(iso).trim().split('T')[0] : '';
  return `${d.day} ${MONTHS_GENITIVE[d.month - 1]}`;
}
