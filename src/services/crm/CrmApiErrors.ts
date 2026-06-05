/**
 * Классификация ошибок CRM/API для UI и стратегии retry.
 */

export type CrmErrorKind = 'network' | 'server' | 'validation' | 'auth' | 'unknown';

export class CrmApiError extends Error {
  readonly kind: CrmErrorKind;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(message: string, kind: CrmErrorKind, retryable: boolean, statusCode?: number) {
    super(message);
    this.name = 'CrmApiError';
    this.kind = kind;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

export function classifyCrmErrorMessage(errorText: string | undefined, httpStatus?: number): CrmApiError {
  const msg = (errorText || 'Неизвестная ошибка').trim();
  const status = httpStatus ?? 0;

  if (/network|fetch|failed to connect|timeout|abort|internet|offline/i.test(msg) || status === 0) {
    return new CrmApiError(msg, 'network', true);
  }
  if (status === 401 || status === 403 || /учётные данные|credentials|unauthorized/i.test(msg)) {
    return new CrmApiError(msg, 'auth', false, status);
  }
  if (status >= 400 && status < 500) {
    return new CrmApiError(msg, 'validation', false, status);
  }
  if (status >= 500 || /502|503|504|500/.test(msg)) {
    return new CrmApiError(msg, 'server', true, status);
  }
  return new CrmApiError(msg, 'unknown', true);
}
