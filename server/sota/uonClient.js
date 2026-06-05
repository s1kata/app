/**
 * Минимальный клиент U-ON (api.u-on.ru/{key}/...). Секрет на сервере: UON_API_KEY (устаревшее имя SOTA_API_KEY читается как fallback).
 */
const BASE = 'https://api.u-on.ru';

function getKey() {
  const k = (process.env.UON_API_KEY || process.env.SOTA_API_KEY || '').trim();
  if (!k) return null;
  return k;
}

async function uonRequest(endpoint, options = {}) {
  const key = getKey();
  if (!key) {
    return { success: false, error: 'UON_API_KEY is not configured' };
  }
  const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const url = `${BASE}/${key}/${path}`;
  const method = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...options.headers,
  };
  try {
    const res = await fetch(url, { ...options, method, headers });
    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const msg =
        (data && typeof data === 'object' && (data.message || data.error)) ||
        `HTTP ${res.status}`;
      return { success: false, error: String(msg) };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message || 'Network error' };
  }
}

module.exports = { uonRequest, getKey };
