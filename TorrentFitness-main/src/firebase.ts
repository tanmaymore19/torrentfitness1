import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';
import fallbackConfig from '../firebase-applet-config.json';
import { withTimeout } from './services/cacheService';

// Fallback production credentials to ensure Android APK Native WebView NEVER disconnects from live Firestore
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA8vg4dubU09NZUvI7wR_CUWz2bC6Dv9w0',
  authDomain: 'active-osprey-pcjpc.firebaseapp.com',
  projectId: 'active-osprey-pcjpc',
  storageBucket: 'active-osprey-pcjpc.firebasestorage.app',
  messagingSenderId: '477304986235',
  appId: '1:477304986235:web:3f0a3f775ae6b45ba860de',
  firestoreDatabaseId: 'ai-studio-torrentfitness-3a8f4657-6c04-44f3-85e5-0b93052d79db'
};

const env = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : {};
const rawApiKey = (env.VITE_FIREBASE_API_KEY || (fallbackConfig as any)?.apiKey || DEFAULT_FIREBASE_CONFIG.apiKey).trim();
const rawAuthDomain = (env.VITE_FIREBASE_AUTH_DOMAIN || (fallbackConfig as any)?.authDomain || DEFAULT_FIREBASE_CONFIG.authDomain).trim();
const rawProjectId = (env.VITE_FIREBASE_PROJECT_ID || (fallbackConfig as any)?.projectId || DEFAULT_FIREBASE_CONFIG.projectId).trim();
const rawStorageBucket = (env.VITE_FIREBASE_STORAGE_BUCKET || (fallbackConfig as any)?.storageBucket || DEFAULT_FIREBASE_CONFIG.storageBucket).trim();
const rawMessagingSenderId = (env.VITE_FIREBASE_MESSAGING_SENDER_ID || (fallbackConfig as any)?.messagingSenderId || DEFAULT_FIREBASE_CONFIG.messagingSenderId).trim();
const rawAppId = (env.VITE_FIREBASE_APP_ID || (fallbackConfig as any)?.appId || DEFAULT_FIREBASE_CONFIG.appId).trim();
const rawDatabaseId = (env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || (fallbackConfig as any)?.firestoreDatabaseId || DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId).trim();

export const firebaseConfig = {
  apiKey: rawApiKey,
  authDomain: rawAuthDomain,
  projectId: rawProjectId,
  storageBucket: rawStorageBucket,
  messagingSenderId: rawMessagingSenderId,
  appId: rawAppId,
  firestoreDatabaseId: rawDatabaseId || undefined,
};

// Defensive App initialization
let appInstance: any = null;
try {
  if (getApps().length > 0) {
    appInstance = getApp();
  } else {
    appInstance = initializeApp(firebaseConfig);
  }
} catch (err) {
  console.error('[Firebase] initializeApp error caught gracefully:', err);
  if (getApps().length > 0) {
    appInstance = getApp();
  } else {
    appInstance = initializeApp(DEFAULT_FIREBASE_CONFIG);
  }
}

export const app = appInstance;

// Defensive Firestore initialization: binds to live named database ID with fallback to default
let firestoreInstance: Firestore;
try {
  if (firebaseConfig.firestoreDatabaseId) {
    firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    firestoreInstance = getFirestore(app);
  }
} catch (err) {
  console.warn('[Firebase] Named database init failed, falling back to default database:', err);
  try {
    firestoreInstance = getFirestore(app);
  } catch (fatalErr) {
    console.error('[Firebase] Fatal getFirestore failure:', fatalErr);
    firestoreInstance = {} as Firestore;
  }
}

export const db = firestoreInstance;

// Defensive Auth initialization
let authInstance: any = null;
try {
  authInstance = getAuth(app);
} catch (err) {
  console.warn('[Firebase] getAuth init error:', err);
  authInstance = null;
}

export const auth = authInstance;

// Explicitly enforce browser local persistence across page reloads & browser restarts
if (typeof window !== 'undefined' && auth) {
  try {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('[Firebase Auth] Persistence notice:', err);
    });
  } catch (err) {
    console.warn('[Firebase Auth] setPersistence error caught:', err);
  }
}

// Connection test strictly bounded by a 2s timeout
export async function testFirestoreConnection(): Promise<boolean> {
  if (!db || typeof db !== 'object') {
    return false;
  }
  try {
    await withTimeout(getDocFromServer(doc(db, 'test', 'connection')), 2000);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}
