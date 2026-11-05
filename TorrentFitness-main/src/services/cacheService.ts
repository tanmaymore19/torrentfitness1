// High-performance client-side memory + localStorage cache & media optimization utility

const MEMORY_CACHE = new Map<string, { data: any; timestamp: number }>();
const CACHE_PREFIX = 'tf_cache_v2_';
const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutes default TTL

export function getCachedData<T>(key: string, fallback: T, maxAgeMs: number = DEFAULT_TTL_MS): T {
  const fullKey = CACHE_PREFIX + key;

  // 1. Fast in-memory check (0ms)
  const memEntry = MEMORY_CACHE.get(fullKey);
  if (memEntry && Date.now() - memEntry.timestamp <= maxAgeMs) {
    return memEntry.data as T;
  }

  // 2. Fallback to localStorage
  try {
    const raw = localStorage.getItem(fullKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: T; timestamp: number };
      if (parsed && parsed.data !== undefined) {
        MEMORY_CACHE.set(fullKey, parsed);
        return parsed.data;
      }
    }
  } catch (e) {
    // Ignore storage read errors
  }

  return fallback;
}

export function setCachedData<T>(key: string, data: T): void {
  const fullKey = CACHE_PREFIX + key;
  const entry = { data, timestamp: Date.now() };
  MEMORY_CACHE.set(fullKey, entry);

  try {
    localStorage.setItem(fullKey, JSON.stringify(entry));
  } catch (e) {
    // Ignore storage quota warnings
  }
}

export function clearCachedData(key?: string): void {
  if (key) {
    const fullKey = CACHE_PREFIX + key;
    MEMORY_CACHE.delete(fullKey);
    try {
      localStorage.removeItem(fullKey);
    } catch {}
    return;
  }
  MEMORY_CACHE.clear();
}

/**
 * Races any promise (e.g. Firestore network read) against a strict timeout in ms.
 * Prevents the UI or splash screen from ever hanging on slow/offline connections.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 2200,
  fallbackValue?: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      if (fallbackValue !== undefined) {
        resolve(fallbackValue);
      } else {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Optimizes external image URLs (such as Unsplash) to enforce lightweight thumbnail/banner
 * dimensions and WebP/AVIF auto-compression.
 */
export function optimizeImageUrl(
  url: string | undefined,
  width: number = 600,
  quality: number = 72
): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('data:')) return trimmed;

  if (trimmed.includes('images.unsplash.com')) {
    try {
      const parsed = new URL(trimmed);
      parsed.searchParams.set('auto', 'format');
      parsed.searchParams.set('fit', 'crop');
      parsed.searchParams.set('w', String(width));
      parsed.searchParams.set('q', String(quality));
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}
