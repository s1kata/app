// firebase.ts — Firebase Auth удалён; auth через travelhub63.ru (auth-mobile.php).
// Firestore опционален: если в extra заданы FIREBASE_* — кэш/данные могут работать.
// Без ключей db/auth/storage = null (приложение использует SQL API и локальный кэш).

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import Constants from 'expo-constants';
import { logger } from '../utils/logger';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

/** @deprecated Auth через сайт. Всегда null. */
const auth: null = null;

try {
  const extra = Constants.expoConfig?.extra || {};
  const config = {
    apiKey: extra.firebaseApiKey as string | undefined,
    authDomain: extra.firebaseAuthDomain as string | undefined,
    projectId: extra.firebaseProjectId as string | undefined,
    storageBucket: extra.firebaseStorageBucket as string | undefined,
    messagingSenderId: extra.firebaseMessagingSenderId as string | undefined,
    appId: extra.firebaseAppId as string | undefined,
  };
  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length === 0) {
    app = initializeApp(config);
    db = getFirestore(app);
    try {
      storage = getStorage(app);
    } catch (e) {
      logger.error('Firebase Storage init failed:', e);
    }
    if (__DEV__) {
      logger.debug('[Firebase] Firestore-only mode, projectId:', config.projectId);
    }
  }
} catch (error) {
  if (__DEV__) {
    logger.warn('[Firebase] Firestore не инициализирован (опционально):', error);
  }
}

export { app, db, auth, storage };
