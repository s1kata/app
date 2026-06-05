// Утилиты для валидации и санитизации данных

/** Максимальные длины полей при отправке в Firestore */
export const MAX_LENGTHS = {
  name: 100,
  email: 254,
  phone: 20,
  text: 2000,
  description: 5000,
  specialRequests: 1000,
} as const;

/**
 * Санитизация строки: escape-символы, ограничение длины
 */
export function sanitizeString(
  value: unknown,
  maxLength: number = 1000
): string {
  if (value == null || value === undefined) return '';
  const str = String(value).trim();
  if (str.length === 0) return '';
  const escaped = str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  return escaped.slice(0, maxLength);
}

/**
 * Санитизация объекта перед отправкой в Firestore
 */
export function sanitizeForFirestore<T extends Record<string, unknown>>(
  data: T,
  schema: Partial<Record<keyof T, number>>
): T {
  const result = { ...data };
  for (const key of Object.keys(result) as (keyof T)[]) {
    const val = result[key];
    if (typeof val === 'string') {
      result[key] = sanitizeString(val, schema[key] ?? MAX_LENGTHS.text) as T[keyof T];
    } else if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      result[key] = sanitizeForFirestore(val as Record<string, unknown>, {}) as T[keyof T];
    }
  }
  return result;
}

/**
 * Валидация email адреса
 * Использует стандартную RFC 5322 валидацию (упрощенная версия)
 * @param email - Email адрес для проверки
 * @returns true если email валиден
 */
export const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Базовая проверка длины
  if (email.length > 254) {
    return false;
  }

  // RFC 5322 упрощенная регулярка (более строгая чем базовая, но не слишком ограничивающая)
  // Разрешает большинство валидных email адресов
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  return emailRegex.test(email);
};

/**
 * Валидация пароля
 * @param password - Пароль для проверки
 * @param minLength - Минимальная длина (по умолчанию 6)
 * @returns true если пароль валиден
 */
export const validatePassword = (password: string, minLength: number = 6): boolean => {
  if (!password || typeof password !== 'string') {
    return false;
  }
  return password.length >= minLength;
};

/**
 * Валидация имени пользователя
 * @param name - Имя для проверки
 * @param minLength - Минимальная длина (по умолчанию 2)
 * @returns true если имя валидно
 */
export const validateName = (name: string, minLength: number = 2): boolean => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  const trimmed = name.trim();
  return trimmed.length >= minLength && trimmed.length <= 100;
};

/**
 * Нормализация телефона для проверки: только цифры, 8 в начале заменяется на 7 (РФ).
 */
export function normalizePhoneForValidation(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return '7' + digits.slice(1);
  }
  return digits;
}

/**
 * Валидация телефона: принимает +7..., 8..., 7..., с пробелами и дефисами.
 * @param phone - Номер телефона для проверки
 * @returns true если номер валиден (10–15 цифр, для РФ — 11 цифр начиная с 7)
 */
export const validatePhone = (phone: string): boolean => {
  if (!phone || typeof phone !== 'string') return false;
  const digits = normalizePhoneForValidation(phone);
  if (digits.length < 10 || digits.length > 15) return false;
  if (digits.length === 11 && digits.startsWith('7')) return true;
  if (digits.length === 10 && digits.startsWith('9')) return true;
  if (digits.length >= 10 && digits.length <= 15) return true;
  return false;
};

export interface PassportValidationInput {
  series?: string;
  number?: string;
  issuedBy?: string;
  issueDate?: string;
  birthDate?: string;
}

export function normalizeDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function isValidDateDDMMYYYY(value: string): boolean {
  const raw = String(value || '').trim();
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return false;
  const [dd, mm, yyyy] = raw.split('.').map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== yyyy ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return false;
  }
  return true;
}

export function validatePassportData(input: PassportValidationInput): string | null {
  const hasAnyPassportData = Boolean(
    String(input.series || '').trim() ||
      String(input.number || '').trim() ||
      String(input.issuedBy || '').trim() ||
      String(input.issueDate || '').trim() ||
      String(input.birthDate || '').trim()
  );
  if (!hasAnyPassportData) {
    return null;
  }

  const series = normalizeDigits(String(input.series || '').trim());
  if (series.length !== 4) return 'Серия паспорта: 4 цифры';

  const number = normalizeDigits(String(input.number || '').trim());
  if (number.length !== 6) return 'Номер паспорта: 6 цифр';

  if (String(input.issuedBy || '').trim().length < 3) {
    return 'Укажите кем выдан паспорт';
  }

  if (!isValidDateDDMMYYYY(String(input.issueDate || '').trim())) {
    return 'Дата выдачи паспорта: формат ДД.ММ.ГГГГ';
  }

  if (!isValidDateDDMMYYYY(String(input.birthDate || '').trim())) {
    return 'Дата рождения: формат ДД.ММ.ГГГГ';
  }

  return null;
}
