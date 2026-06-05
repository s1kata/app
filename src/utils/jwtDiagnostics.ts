/**
 * Разбор JWT без проверки подписи — только для диагностики (exp, и т.д.).
 */

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.trim().split('.');
    if (parts.length < 2) return null;
    const segment = parts[1];
    const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4);
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob !== 'function') return null;
    const json = atob(b64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type JwtDiagnostics = {
  /** Unix ms истечения из claim exp, если есть */
  expiresAtMs: number | null;
  /** Уже истёк */
  isExpired: boolean;
  /** Сколько мс до истечения (отрицательное = просрочен) */
  msUntilExpiry: number | null;
  /** Человекочитаемо */
  summary: string;
};

/**
 * Для логов при 403 от Tourvisor: часто причина — истёкший токен или IP не в whitelist.
 */
export function getJwtDiagnostics(token: string | null | undefined): JwtDiagnostics {
  if (!token || !token.trim()) {
    return {
      expiresAtMs: null,
      isExpired: true,
      msUntilExpiry: null,
      summary: 'токен пустой',
    };
  }
  const payload = decodePayload(token);
  const exp = payload?.exp;
  const expMs = typeof exp === 'number' ? exp * 1000 : null;
  const now = Date.now();
  if (expMs == null) {
    return {
      expiresAtMs: null,
      isExpired: false,
      msUntilExpiry: null,
      summary: 'в payload нет exp — проверьте токен в кабинете Tourvisor',
    };
  }
  const msUntil = expMs - now;
  const isExpired = msUntil < 0;
  const summary = isExpired
    ? `JWT истёк ${new Date(expMs).toISOString()} (${Math.round(-msUntil / 86400000)} дн. назад) — выпустите новый в кабинете`
    : `JWT действителен до ${new Date(expMs).toISOString()} (ещё ~${Math.round(msUntil / 3600000)} ч)`;
  return {
    expiresAtMs: expMs,
    isExpired,
    msUntilExpiry: msUntil,
    summary,
  };
}
