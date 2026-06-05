/**
 * Звёздность отеля в списках (1–5). API иногда отдаёт в category не звёзды, а большое число —
 * без ограничения рендерятся тысячи иконок.
 */
export function hotelCategoryStarCount(category: unknown): number {
  const n = Math.round(Number(category));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(5, n);
}
