/**
 * Базовая проверка отзыва на запрещённые слова (RU + EN).
 * Дублирует серверную логику для быстрой обратной связи в UI.
 */
const STOP_WORDS = [
  'бля', 'блять', 'бляд', 'хуй', 'хуе', 'хуи', 'пизд', 'пидор', 'пидар', 'ебан', 'ебат', 'ебл',
  'сука', 'суки', 'мудак', 'мудил', 'дебил', 'идиот', 'урод', 'шлюх',
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard',
  'bitch', 'asshole', 'cunt', 'dick', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard',
] as const;

function normalizeForProfanityCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsProfanity(text: string): boolean {
  const normalized = normalizeForProfanityCheck(text);
  if (!normalized) return false;
  const tokens = normalized.split(' ');
  for (const token of tokens) {
    for (const stop of STOP_WORDS) {
      if (token.includes(stop) || stop.includes(token)) {
        return true;
      }
    }
  }
  for (const stop of STOP_WORDS) {
    if (normalized.includes(stop)) {
      return true;
    }
  }
  return false;
}

export function validateReviewText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'Пожалуйста, напишите отзыв';
  }
  if (containsProfanity(trimmed)) {
    return 'Отзыв содержит недопустимые слова. Пожалуйста, отредактируйте текст.';
  }
  return null;
}
