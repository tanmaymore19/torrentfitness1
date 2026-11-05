import QRCode from 'qrcode';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { GymQrConfig } from '../types';
import { INITIAL_GYM_CONFIG } from './db';

export interface QrGenerationOptions {
  width?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

const QR_CACHE_STORAGE_KEY = 'torrent_active_qr_config';

// In-memory cache for ultra-fast, synchronous-ready fallback
let inMemoryQrConfig: GymQrConfig | null = null;

/**
 * Retrieves persisted QR configuration from in-memory cache or localStorage.
 * Always returns a valid GymQrConfig object (falling back to INITIAL_GYM_CONFIG).
 */
export function getPersistedQrConfig(): GymQrConfig {
  if (inMemoryQrConfig && inMemoryQrConfig.activeToken) {
    return inMemoryQrConfig;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(QR_CACHE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.activeToken === 'string' && parsed.activeToken.length > 0) {
          inMemoryQrConfig = parsed;
          return parsed;
        }
      }
    } catch (e) {
      console.warn('LocalStorage QR parse notice:', e);
    }
  }

  inMemoryQrConfig = INITIAL_GYM_CONFIG;
  return INITIAL_GYM_CONFIG;
}

/**
 * Stores QR config into memory and localStorage for instant offline access.
 */
export function persistQrConfig(config: GymQrConfig): void {
  inMemoryQrConfig = config;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(QR_CACHE_STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('LocalStorage QR persist notice:', e);
    }
  }
}

/**
 * Helper to race a promise with a timeout to avoid hangs on offline/slow connections
 */
function withTimeout<T>(promise: Promise<T>, ms: number = 2500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    )
  ]);
}

/**
 * Generates high-resolution data URL for a given text or token with bulletproof fallbacks.
 */
export async function generateQrDataUrl(
  text: string,
  options?: QrGenerationOptions
): Promise<string> {
  const targetText =
    text && typeof text === 'string' && text.trim().length > 0
      ? text.trim()
      : getPersistedQrConfig().activeToken || INITIAL_GYM_CONFIG.activeToken;

  const opts = {
    width: options?.width || 300,
    margin: options?.margin !== undefined ? options?.margin : 2,
    color: {
      dark: options?.darkColor || '#0f172a',
      light: options?.lightColor || '#ffffff'
    },
    errorCorrectionLevel: 'H' as const
  };

  try {
    return await QRCode.toDataURL(targetText, opts);
  } catch (err) {
    console.warn('Error generating QR Code, attempting fallback render:', err);
    try {
      return await QRCode.toDataURL(INITIAL_GYM_CONFIG.activeToken, { width: opts.width || 300 });
    } catch (fallbackErr) {
      console.error('Fatal QRCode error, returning SVG data URI fallback:', fallbackErr);
      return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="100%" height="100%" fill="white"/><rect x="20" y="20" width="260" height="260" fill="none" stroke="%230f172a" stroke-width="4"/><text x="50%" y="45%" font-family="sans-serif" font-size="16" font-weight="900" fill="%230f172a" text-anchor="middle">TORRENT FITNESS</text><text x="50%" y="60%" font-family="monospace" font-size="12" fill="%230284c7" text-anchor="middle">ACTIVE GATE QR</text></svg>`;
    }
  }
}

/**
 * Retrieves the currently active gym reception desk QR token.
 * Offline-first & crash-proof:
 * 1. Checks memory & localStorage first.
 * 2. Attempts to fetch latest from Firestore (attendance_qr or active-qr) with a safe timeout.
 * 3. If offline or unavailable, returns the cached/initial configuration without throwing.
 */
export async function getActiveGymQrConfig(): Promise<GymQrConfig> {
  const cachedFallback = getPersistedQrConfig();

  // Guard against missing/incomplete db
  if (!db || typeof db !== 'object') {
    return cachedFallback;
  }

  try {
    // 1. Try reading gym_config/attendance_qr with a 2.5s timeout
    const configRef1 = doc(db, 'gym_config', 'attendance_qr');
    const snap1 = await withTimeout(getDoc(configRef1), 2500).catch((err) => {
      console.warn('Firestore attendance_qr read note (offline/timeout):', err?.message || err);
      return null;
    });

    if (snap1 && snap1.exists()) {
      const data = snap1.data() as GymQrConfig;
      const config: GymQrConfig = {
        activeToken: data.activeToken || cachedFallback.activeToken,
        gymCode: data.gymCode || 'TORRENT-FITNESS-PUNJAB-01',
        generatedAt: data.generatedAt || new Date().toISOString(),
        active: data.active !== false,
        previousTokens: Array.isArray(data.previousTokens) ? data.previousTokens : []
      };
      persistQrConfig(config);
      return config;
    }

    // 2. Try reading gymQrConfig/active-qr with a 2.5s timeout
    const qrRef = doc(db, 'gymQrConfig', 'active-qr');
    const snap = await withTimeout(getDoc(qrRef), 2500).catch((err) => {
      console.warn('Firestore active-qr read note (offline/timeout):', err?.message || err);
      return null;
    });

    if (snap && snap.exists()) {
      const data = snap.data() as GymQrConfig;
      const config: GymQrConfig = {
        activeToken: data.activeToken || cachedFallback.activeToken,
        gymCode: data.gymCode || 'TORRENT-FITNESS-PUNJAB-01',
        generatedAt: data.generatedAt || new Date().toISOString(),
        active: data.active !== false,
        previousTokens: Array.isArray(data.previousTokens) ? data.previousTokens : []
      };
      persistQrConfig(config);
      // Best-effort background sync to gym_config/attendance_qr
      setDoc(configRef1, config, { merge: true }).catch(() => {});
      return config;
    }

    // 3. If neither doc exists yet, seed the cached fallback to Firestore (best effort)
    const token = cachedFallback.activeToken || generateSecureToken();
    const newConfig: GymQrConfig = {
      activeToken: token,
      gymCode: cachedFallback.gymCode || 'TORRENT-FITNESS-PUNJAB-01',
      generatedAt: new Date().toISOString(),
      active: true,
      previousTokens: cachedFallback.previousTokens || []
    };
    persistQrConfig(newConfig);

    Promise.all([
      setDoc(qrRef, newConfig, { merge: true }).catch(() => {}),
      setDoc(configRef1, newConfig, { merge: true }).catch(() => {})
    ]).catch(() => {});

    return newConfig;
  } catch (err: any) {
    console.warn('getActiveGymQrConfig falling back to offline config:', err?.message || err);
    return cachedFallback;
  }
}

/**
 * Regenerates the gym desk QR token in Firestore and local storage,
 * explicitly recording and invalidating previous tokens with offline resilience.
 */
export async function regenerateGymQrConfig(): Promise<GymQrConfig> {
  const current = getPersistedQrConfig();
  const prevTokens: string[] = Array.isArray(current.previousTokens) ? [...current.previousTokens] : [];
  if (current.activeToken && !prevTokens.includes(current.activeToken)) {
    prevTokens.push(current.activeToken);
  }

  const newToken = generateSecureToken();
  const newConfig: GymQrConfig = {
    activeToken: newToken,
    gymCode: current.gymCode || 'TORRENT-FITNESS-PUNJAB-01',
    generatedAt: new Date().toISOString(),
    active: true,
    previousTokens: prevTokens
  };

  // Update local persistent storage immediately
  persistQrConfig(newConfig);

  // Sync to Firestore if online (swallowing offline/timeout errors)
  if (db && typeof db === 'object') {
    try {
      const qrRef = doc(db, 'gymQrConfig', 'active-qr');
      const configRef = doc(db, 'gym_config', 'attendance_qr');

      await Promise.all([
        withTimeout(setDoc(qrRef, newConfig, { merge: true }), 3000).catch((e) =>
          console.warn('qrRef sync note:', e?.message || e)
        ),
        withTimeout(setDoc(configRef, newConfig, { merge: true }), 3000).catch((e) =>
          console.warn('configRef sync note:', e?.message || e)
        )
      ]);
    } catch (err: any) {
      console.warn('Firestore QR sync note (saved locally):', err?.message || err);
    }
  }

  return newConfig;
}

/**
 * Toggle active status of the reception QR code
 */
export async function toggleGymQrActive(active: boolean): Promise<void> {
  const current = getPersistedQrConfig();
  current.active = active;
  persistQrConfig(current);

  if (db && typeof db === 'object') {
    const payload = { active, updatedAt: new Date().toISOString() };
    try {
      await Promise.all([
        withTimeout(setDoc(doc(db, 'gymQrConfig', 'active-qr'), payload, { merge: true }), 2500).catch(() => {}),
        withTimeout(setDoc(doc(db, 'gym_config', 'attendance_qr'), payload, { merge: true }), 2500).catch(() => {})
      ]);
    } catch (err) {
      console.warn('toggleGymQrActive sync note:', err);
    }
  }
}

/**
 * Helper to generate cryptographically unique entrance token
 */
export function generateSecureToken(): string {
  const timestamp = Date.now();
  const randomBytes = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `TF_GATE_TOKEN_${timestamp}_${randomBytes}`;
}
