/** Русское склонение числительных: 1 ночь, 2 ночи, 5 ночей */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatNightsRu(nights: number): string {
  const n = Math.trunc(Number(nights) || 0);
  if (n <= 0) return '';
  return `${n} ${pluralRu(n, 'ночь', 'ночи', 'ночей')}`;
}

/** «6–8 ночей» — слово по верхней границе диапазона */
export function formatNightsRangeRu(from: number, to?: number): string {
  const a = Math.trunc(Number(from) || 0);
  const b = to != null ? Math.trunc(Number(to) || 0) : a;
  if (a <= 0 && b <= 0) return '';
  if (!b || b === a) return formatNightsRu(a || b);
  return `${a}–${b} ${pluralRu(b, 'ночь', 'ночи', 'ночей')}`;
}

export function formatAdultsRu(count: number): string {
  const n = Math.trunc(Number(count) || 0);
  if (n <= 0) return '';
  return `${n} ${pluralRu(n, 'взрослый', 'взрослых', 'взрослых')}`;
}

export function formatChildrenRu(count: number): string {
  const n = Math.trunc(Number(count) || 0);
  if (n <= 0) return '';
  return `${n} ${pluralRu(n, 'ребёнок', 'ребёнка', 'детей')}`;
}
