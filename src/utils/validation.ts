// Утилиты для валидации и санитизации данных (ГОСТ/РФ для личных и паспортных полей)

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
 */
export const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  if (email.length > 254) {
    return false;
  }

  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailRegex.test(email.trim());
};

export function getEmailValidationMessage(email: string): string | null {
  const raw = String(email || '').trim();
  if (!raw) return 'Укажите email';
  if (!validateEmail(raw)) return 'Некорректный email';
  return null;
}

/**
 * Валидация пароля: минимум 8 символов и хотя бы одна цифра.
 */
export const validatePassword = (password: string, minLength: number = 8): boolean => {
  if (!password || typeof password !== 'string') {
    return false;
  }
  if (password.length < minLength) {
    return false;
  }
  return /\d/.test(password);
};

/** Сообщение об ошибке пароля для UI */
export function getPasswordValidationMessage(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Пароль слишком слабый. Минимум 8 символов.';
  }
  if (!/\d/.test(password)) {
    return 'Пароль должен содержать хотя бы одну цифру.';
  }
  return null;
}

const JUNK_WORDS = [
  'хуй',
  'хуя',
  'пизд',
  'епта',
  'ёпта',
  'блять',
  'блядь',
  'сука',
  'ебан',
  'ёбан',
  'нахуй',
  'нахер',
  'говно',
  'shit',
  'fuck',
  'test',
  'тест',
  'asdf',
  'qwer',
  'ад',
  'лох',
  'лохня',
];

function hasExcessiveRepeats(value: string, maxRepeat = 3): boolean {
  return new RegExp(`(.)\\1{${maxRepeat},}`, 'iu').test(value.replace(/\s+/g, ''));
}

function looksLikeJunkText(value: string): boolean {
  const lower = value.toLowerCase().replace(/ё/g, 'е');
  const tokens = lower.split(/[^a-zа-я0-9]+/i).filter(Boolean);
  for (const w of JUNK_WORDS) {
    // короткие слова — только целиком (чтобы «Адлер» не резало)
    if (w.length <= 3) {
      if (tokens.includes(w)) return true;
    } else if (lower.includes(w)) {
      return true;
    }
  }
  const letters = (lower.match(/[a-zа-я]/gi) || []).length;
  if (value.trim().length >= 4 && letters < Math.ceil(value.trim().length * 0.4)) return true;
  return false;
}

/**
 * Валидация ФИО по практике РФ (кириллица/латиница, дефис, пробел, апостроф).
 */
export const validateName = (name: string, minLength: number = 2): boolean => {
  return getNameValidationMessage(name, minLength) === null;
};

export function getNameValidationMessage(name: string, minLength: number = 2): string | null {
  if (!name || typeof name !== 'string') return 'Укажите ФИО';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < minLength) return 'ФИО слишком короткое';
  if (trimmed.length > 100) return 'ФИО слишком длинное';
  // Только буквы, пробел, дефис, апостроф
  if (!/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ'’\- ]+$/u.test(trimmed)) {
    return 'ФИО: только буквы, пробел и дефис';
  }
  if (hasExcessiveRepeats(trimmed, 2)) {
    return 'ФИО выглядит некорректно (повторяющиеся символы)';
  }
  if (looksLikeJunkText(trimmed)) {
    return 'Укажите настоящее ФИО';
  }
  // Хотя бы 2 буквы подряд в слове
  if (!/[A-Za-zА-Яа-яЁё]{2,}/u.test(trimmed)) {
    return 'Укажите настоящее ФИО';
  }
  return null;
}

/**
 * Нормализация телефона для проверки: только цифры, 8 в начале заменяется на 7 (РФ).
 */
export function normalizePhoneForValidation(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return '7' + digits.slice(1);
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return '7' + digits;
  }
  return digits;
}

/** Маска телефона РФ: +7 (XXX) XXX-XX-XX */
export function formatPhoneRu(phone: string): string {
  let digits = normalizePhoneForValidation(phone).slice(0, 11);
  if (!digits) return '';
  if (!digits.startsWith('7')) digits = '7' + digits.replace(/^7/, '');
  digits = digits.slice(0, 11);
  const rest = digits.slice(1);
  let out = '+7';
  if (rest.length === 0) return out;
  out += ' (' + rest.slice(0, 3);
  if (rest.length < 3) return out;
  out += ')';
  if (rest.length === 3) return out;
  out += ' ' + rest.slice(3, 6);
  if (rest.length <= 6) return out;
  out += '-' + rest.slice(6, 8);
  if (rest.length <= 8) return out;
  out += '-' + rest.slice(8, 10);
  return out;
}

/**
 * Валидация телефона РФ (строго): 11 цифр, начинается с 7, вторая цифра 9 (мобильный)
 * или допускаем городские 3–5 после кода (но для туров обычно мобильный).
 */
export const validatePhone = (phone: string): boolean => {
  return getPhoneValidationMessage(phone) === null;
};

export function getPhoneValidationMessage(phone: string): string | null {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return 'Укажите телефон';
  }
  const digits = normalizePhoneForValidation(phone);
  if (digits.length !== 11 || !digits.startsWith('7')) {
    return 'Телефон: формат +7 (XXX) XXX-XX-XX';
  }
  // Для мобильных РФ код оператора начинается с 9
  if (digits[1] !== '9') {
    return 'Укажите российский мобильный номер (+7 9XX…)';
  }
  // отсечь 11111111111 / 70000000000
  if (/^(\d)\1{10}$/.test(digits) || /^7(\d)\1{9}$/.test(digits)) {
    return 'Некорректный номер телефона';
  }
  if (/^79{10}$/.test(digits) || /^70{10}$/.test(digits) || /^71{10}$/.test(digits)) {
    return 'Некорректный номер телефона';
  }
  return null;
}

export interface PassportValidationInput {
  series?: string;
  number?: string;
  issuedBy?: string;
  issueDate?: string;
  birthDate?: string;
  birthPlace?: string;
}

export function normalizeDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function parseDateDDMMYYYY(value: string): Date | null {
  const raw = normalizeDateInputToDDMMYYYY(value);
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return null;
  const [dd, mm, yyyy] = raw.split('.').map(Number);
  const date = new Date(yyyy, mm - 1, dd);
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

/** ДД.ММ.ГГГГ или ISO YYYY-MM-DD → ДД.ММ.ГГГГ */
export function normalizeDateInputToDDMMYYYY(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return raw;
}

export function isValidDateDDMMYYYY(value: string): boolean {
  return parseDateDDMMYYYY(value) != null;
}

function yearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) years -= 1;
  return years;
}

export function getIssuedByValidationMessage(issuedBy: string): string | null {
  const raw = String(issuedBy || '').trim().replace(/\s+/g, ' ');
  if (!raw) return 'Укажите, кем выдан паспорт';
  if (raw.length < 8) return '«Кем выдан»: слишком коротко (минимум 8 символов)';
  if (raw.length > 200) return '«Кем выдан»: слишком длинно';
  if (!/[A-Za-zА-Яа-яЁё]{3,}/u.test(raw)) {
    return '«Кем выдан»: укажите название органа';
  }
  if (hasExcessiveRepeats(raw, 3) || looksLikeJunkText(raw)) {
    return '«Кем выдан»: укажите корректные данные';
  }
  return null;
}

export function getBirthPlaceValidationMessage(place: string): string | null {
  const raw = String(place || '').trim().replace(/\s+/g, ' ');
  if (!raw) return 'Укажите место рождения';
  if (raw.length < 2) return 'Место рождения слишком короткое';
  if (raw.length > 120) return 'Место рождения слишком длинное';
  if (!/^[A-Za-zА-Яа-яЁё0-9.,\-\/\s]+$/u.test(raw)) {
    return 'Место рождения: недопустимые символы';
  }
  if (!/[A-Za-zА-Яа-яЁё]{2,}/u.test(raw)) {
    return 'Укажите корректное место рождения';
  }
  if (hasExcessiveRepeats(raw, 3) || looksLikeJunkText(raw)) {
    return 'Укажите корректное место рождения';
  }
  return null;
}

/**
 * Паспорт РФ (внутренний): серия 4 цифры, номер 6 цифр.
 * Дополнительно: загранпаспорт — серия 2, номер 7 (принимаем оба формата).
 */
export function validatePassportData(input: PassportValidationInput): string | null {
  const hasAnyPassportData = Boolean(
    String(input.series || '').trim() ||
      String(input.number || '').trim() ||
      String(input.issuedBy || '').trim() ||
      String(input.issueDate || '').trim() ||
      String(input.birthDate || '').trim() ||
      String(input.birthPlace || '').trim()
  );
  if (!hasAnyPassportData) {
    return null;
  }

  const series = normalizeDigits(String(input.series || '').trim());
  const number = normalizeDigits(String(input.number || '').trim());

  const isInternal = series.length === 4 && number.length === 6;
  const isForeign = series.length === 2 && number.length === 7;
  if (!isInternal && !isForeign) {
    return 'Паспорт: серия 4 + номер 6 (РФ) или серия 2 + номер 7 (загран)';
  }
  if (/^(\d)\1+$/.test(series) && /^(\d)\1+$/.test(number)) {
    return 'Серия и номер паспорта выглядят некорректно';
  }

  const issuedByError = getIssuedByValidationMessage(String(input.issuedBy || ''));
  if (issuedByError) return issuedByError;

  const birthDateRaw = normalizeDateInputToDDMMYYYY(String(input.birthDate || '').trim());
  const issueDateRaw = normalizeDateInputToDDMMYYYY(String(input.issueDate || '').trim());
  const birthDate = parseDateDDMMYYYY(birthDateRaw);
  const issueDate = parseDateDDMMYYYY(issueDateRaw);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (!birthDate) return 'Дата рождения: формат ДД.ММ.ГГГГ';
  if (birthDate > today) return 'Дата рождения не может быть в будущем';
  const age = yearsBetween(birthDate, today);
  if (age > 120) return 'Проверьте дату рождения';

  if (!issueDate) return 'Дата выдачи паспорта: формат ДД.ММ.ГГГГ';
  if (issueDate > today) return 'Дата выдачи не может быть в будущем';
  if (issueDate < birthDate) return 'Дата выдачи не может быть раньше даты рождения';

  // Для внутреннего паспорта обычно с 14 лет; для заграна — с рождения.
  if (isInternal && yearsBetween(birthDate, issueDate) < 14) {
    return 'Внутренний паспорт выдаётся с 14 лет — проверьте даты';
  }

  if (input.birthPlace != null && String(input.birthPlace).trim()) {
    const placeError = getBirthPlaceValidationMessage(String(input.birthPlace));
    if (placeError) return placeError;
  } else if (hasAnyPassportData) {
    // если заполняют паспорт — место рождения тоже требуем
    return 'Укажите место рождения';
  }

  return null;
}

export type PersonalFormErrors = Partial<{
  name: string;
  email: string;
  phone: string;
  passportSeries: string;
  passportNumber: string;
  passportIssuedBy: string;
  passportIssuedDate: string;
  birthDate: string;
  birthPlace: string;
  form: string;
}>;

/** Полная проверка формы «Личные данные» перед сохранением */
export function validatePersonalDataForm(input: {
  name: string;
  email: string;
  phone: string;
  passportSeries: string;
  passportNumber: string;
  passportIssuedBy: string;
  passportIssuedDate: string;
  birthDate: string;
  birthPlace: string;
  /** Если true — паспорт обязателен целиком */
  requirePassport?: boolean;
}): PersonalFormErrors {
  const errors: PersonalFormErrors = {};

  const nameError = getNameValidationMessage(input.name);
  if (nameError) errors.name = nameError;

  const emailError = getEmailValidationMessage(input.email);
  if (emailError) errors.email = emailError;

  const phoneError = getPhoneValidationMessage(input.phone);
  if (phoneError) errors.phone = phoneError;

  const hasPassportPart = Boolean(
    input.passportSeries.trim() ||
      input.passportNumber.trim() ||
      input.passportIssuedBy.trim() ||
      input.passportIssuedDate.trim() ||
      input.birthDate.trim() ||
      input.birthPlace.trim()
  );

  if (input.requirePassport || hasPassportPart) {
    const series = normalizeDigits(input.passportSeries);
    const number = normalizeDigits(input.passportNumber);
    const isInternal = series.length === 4 && number.length === 6;
    const isForeign = series.length === 2 && number.length === 7;

    if (!(isInternal || isForeign)) {
      if (series.length !== 4 && series.length !== 2) {
        errors.passportSeries = 'Серия: 4 цифры (РФ) или 2 (загран)';
      }
      if (number.length !== 6 && number.length !== 7) {
        errors.passportNumber = 'Номер: 6 цифр (РФ) или 7 (загран)';
      }
      if (!errors.passportSeries && !errors.passportNumber) {
        errors.passportSeries = 'Проверьте серию и номер паспорта';
      }
    }

    const issuedByError = getIssuedByValidationMessage(input.passportIssuedBy);
    if (issuedByError) errors.passportIssuedBy = issuedByError;

    const birthPlaceError = getBirthPlaceValidationMessage(input.birthPlace);
    if (birthPlaceError) errors.birthPlace = birthPlaceError;

    const passportError = validatePassportData({
      series: input.passportSeries,
      number: input.passportNumber,
      issuedBy: input.passportIssuedBy,
      issueDate: input.passportIssuedDate,
      birthDate: input.birthDate,
      birthPlace: input.birthPlace,
    });
    if (passportError) {
      // Разложим общее сообщение, если полевые ещё пустые
      if (/серия|номер/i.test(passportError) && !errors.passportSeries && !errors.passportNumber) {
        errors.form = passportError;
      } else if (/выдан/i.test(passportError) && !errors.passportIssuedBy) {
        errors.passportIssuedBy = passportError;
      } else if (/рожден/i.test(passportError) && /место/i.test(passportError) && !errors.birthPlace) {
        errors.birthPlace = passportError;
      } else if (/рожден/i.test(passportError) && !errors.birthDate) {
        errors.birthDate = passportError;
      } else if (/выдач/i.test(passportError) && !errors.passportIssuedDate) {
        errors.passportIssuedDate = passportError;
      } else if (!errors.form) {
        errors.form = passportError;
      }
    }
  }

  return errors;
}
