/**
 * Кэш справочников Tourvisor в Firestore.
 * Справочники почти статичны: TTL 30 дней. Firestore первым — при отсутствии данных идём в API.
 * Коллекция: dictionaryCache. Документы: departures, countries, countries_dep1, и т.д.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import type { Departure, Country, Meal } from '../types/tourvisor';

const COLLECTION = 'dictionaryCache';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней — справочники почти статичны

function isAvailable(): boolean {
  return !!db;
}

function getDocId(type: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return type;
  const parts = Object.entries(params)
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? `${type}_${parts.join('_')}` : type;
}

export async function getDeparturesFromFirestore(departureCountryId?: number): Promise<Departure[] | null> {
  if (!isAvailable()) return null;
  const tryDoc = async (docId: string) => {
    if (!db) return null;
    const snap = await getDoc(doc(db, COLLECTION, docId));
    if (!snap.exists()) return null;
    const d = snap.data();
    const exp = typeof d?.expiresAt === 'number' ? d.expiresAt : d?.expiresAt?.toMillis?.() ?? 0;
    if (exp > 0 && Date.now() > exp) return null;
    const data = d?.data;
    if (!Array.isArray(data) || data.length === 0) return null;
    return data as Departure[];
  };
  try {
    const docId = getDocId('departures', { departureCountryId });
    let result = await tryDoc(docId);
    if (!result && departureCountryId != null) result = await tryDoc('departures');
    return result;
  } catch {
    return null;
  }
}

export async function setDeparturesToFirestore(data: Departure[], departureCountryId?: number): Promise<void> {
  if (!isAvailable() || !data?.length || !db) return;
  try {
    const docId = getDocId('departures', { departureCountryId });
    await setDoc(doc(db, COLLECTION, docId), {
      data,
      expiresAt: Date.now() + TTL_MS,
      createdAt: Date.now(),
      public: true,
    });
  } catch { /* ignore */ }
}

export async function getCountriesFromFirestore(departureId?: number, onlyCharter?: boolean): Promise<Country[] | null> {
  if (!isAvailable()) return null;
  const tryDoc = async (docId: string) => {
    if (!db) return null;
    const snap = await getDoc(doc(db, COLLECTION, docId));
    if (!snap.exists()) return null;
    const d = snap.data();
    const exp = typeof d?.expiresAt === 'number' ? d.expiresAt : d?.expiresAt?.toMillis?.() ?? 0;
    if (exp > 0 && Date.now() > exp) return null;
    const data = d?.data;
    if (!Array.isArray(data) || data.length === 0) return null;
    return data as Country[];
  };
  try {
    const docId = getDocId('countries', { departureId, onlyCharter });
    const result = await tryDoc(docId);
    // При запросе по городу вылета не подставляем полный список — иначе фильтрация не работает (должен вызваться API).
    if (!result && departureId == null && onlyCharter == null) {
      return await tryDoc('countries');
    }
    return result;
  } catch {
    return null;
  }
}

export async function setCountriesToFirestore(data: Country[], departureId?: number, onlyCharter?: boolean): Promise<void> {
  if (!isAvailable() || !data?.length || !db) return;
  try {
    const docId = getDocId('countries', { departureId, onlyCharter });
    await setDoc(doc(db, COLLECTION, docId), {
      data,
      expiresAt: Date.now() + TTL_MS,
      createdAt: Date.now(),
      public: true,
    });
  } catch { /* ignore */ }
}

/** Типы питания (meals). Документ: dictionaryCache/meals. */
export async function getMealsFromFirestore(): Promise<Meal[] | null> {
  if (!isAvailable() || !db) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, 'meals'));
    if (!snap.exists()) return null;
    const d = snap.data();
    const exp = typeof d?.expiresAt === 'number' ? d.expiresAt : d?.expiresAt?.toMillis?.() ?? 0;
    if (exp > 0 && Date.now() > exp) return null;
    const data = d?.data;
    if (!Array.isArray(data) || data.length === 0) return null;
    return data as Meal[];
  } catch {
    return null;
  }
}

export async function setMealsToFirestore(data: Meal[]): Promise<void> {
  if (!isAvailable() || !data?.length || !db) return;
  try {
    await setDoc(doc(db, COLLECTION, 'meals'), {
      data,
      expiresAt: Date.now() + TTL_MS,
      createdAt: Date.now(),
      public: true,
    });
  } catch { /* ignore */ }
}

/** Прямое чтение departures и countries из Firestore (для поисковой формы). Коллекция dictionaryCache. */
export async function getDeparturesAndCountriesFromFirestore(): Promise<{ departures: Departure[]; countries: Country[] }> {
  const out = { departures: [] as Departure[], countries: [] as Country[] };
  if (!db) return out;
  try {
    const [depSnap, cntSnap] = await Promise.all([
      getDoc(doc(db, COLLECTION, 'departures')),
      getDoc(doc(db, COLLECTION, 'countries')),
    ]);
    const parse = (d: { data?: unknown; expiresAt?: number | { toMillis?: () => number } } | undefined) => {
      if (!d?.data || !Array.isArray(d.data)) return [];
      const exp = typeof d.expiresAt === 'number' ? d.expiresAt : (d.expiresAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      if (exp > 0 && Date.now() > exp) return [];
      return d.data;
    };
    out.departures = (depSnap.exists() ? parse(depSnap.data()) : []) as Departure[];
    out.countries = (cntSnap.exists() ? parse(cntSnap.data()) : []) as Country[];
  } catch (e) {
    logger.warn('[DictionaryFirestoreCache] getDeparturesAndCountries error:', (e as Error)?.message);
  }
  return out;
}
