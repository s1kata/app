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

/** ISO YYYY-MM-DD → «12 июля 2026» */
export function formatDateRuLong(iso?: string | null): string {
  if (!iso) return '';
  const part = String(iso).trim().split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
  if (!m) return part;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return part;
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year}`;
}
