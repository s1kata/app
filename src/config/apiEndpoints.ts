import Constants from 'expo-constants';

const DEFAULT_SITE = 'https://travelhub63.ru';
const DEFAULT_AUTH_PATH = '/api/auth-mobile.php';

type ApiExtra = {
  siteBaseUrl?: string;
  authApiBaseUrl?: string;
  authApiPath?: string;
  crmApiBaseUrl?: string;
  bonusApiBaseUrl?: string;
  paymentApiBaseUrl?: string;
  healthCheckToken?: string;
  /** @deprecated use paymentApiBaseUrl */
  paymentPageUrl?: string;
  /** @deprecated use siteBaseUrl */
  websiteBaseUrl?: string;
  /** @deprecated use crmApiBaseUrl */
  sotaCrmBaseUrl?: string;
};

function extra(): ApiExtra {
  return (Constants.expoConfig?.extra || {}) as ApiExtra;
}

function stripTrailingSlash(url: string): string {
  return String(url || '').replace(/\/+$/, '');
}

function ensureLeadingSlash(path: string): string {
  const p = String(path || '').trim();
  if (!p) return DEFAULT_AUTH_PATH;
  return p.startsWith('/') ? p : `/${p}`;
}

export function getSiteBaseUrl(): string {
  const e = extra();
  return stripTrailingSlash(
    e.siteBaseUrl || e.websiteBaseUrl || e.paymentPageUrl || DEFAULT_SITE,
  );
}

export function getAuthApiBaseUrl(): string {
  const e = extra();
  return stripTrailingSlash(e.authApiBaseUrl || getSiteBaseUrl());
}

export function getAuthApiPath(): string {
  return ensureLeadingSlash(extra().authApiPath || DEFAULT_AUTH_PATH);
}

export function getAuthApiUrl(): string {
  return `${getAuthApiBaseUrl()}${getAuthApiPath()}`;
}

export function getCrmApiBaseUrl(): string {
  const e = extra();
  const fromExtra = e.crmApiBaseUrl || e.sotaCrmBaseUrl;
  if (fromExtra && String(fromExtra).trim()) {
    return stripTrailingSlash(String(fromExtra));
  }
  return getSiteBaseUrl();
}

export function getBonusApiBaseUrl(): string {
  const e = extra();
  const bonus = e.bonusApiBaseUrl;
  if (bonus && String(bonus).trim()) {
    return stripTrailingSlash(String(bonus));
  }
  return getCrmApiBaseUrl();
}

export function getPaymentApiBaseUrl(): string {
  const e = extra();
  return stripTrailingSlash(e.paymentApiBaseUrl || e.paymentPageUrl || getSiteBaseUrl());
}

/** @deprecated use getPaymentApiBaseUrl */
export function getBackendBaseUrl(): string {
  return getPaymentApiBaseUrl();
}
