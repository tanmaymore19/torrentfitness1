import { PromoBanner } from '../types';

export const BANNER_DB_NAME = 'torrent_banners_db';
export const BANNER_DB_VERSION = 1;
export const BANNER_STORE_NAME = 'banners';
export const BANNER_METADATA_STORAGE_KEY = 'torrent_home_banners_v1';

// Never auto-seed hardcoded demo banners when empty.
export const INITIAL_DEFAULT_BANNERS: PromoBanner[] = [];

export interface StoredBannerRecord extends PromoBanner {
  mediaDataUrl?: string;
  mediaBlob?: Blob;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

// In-memory ObjectURL cache to prevent memory leaks and keep playback URLs stable
const objectUrlRegistry = new Map<string, string>();

function openBannerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }
    const request = window.indexedDB.open(BANNER_DB_NAME, BANNER_DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(BANNER_STORE_NAME)) {
        db.createObjectStore(BANNER_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Loads all promotional banners from persistent IndexedDB with fallback to localStorage and default seeds.
 * Automatically resolves Blobs / Data URLs into stable playback URLs for images and videos.
 */
export async function getStoredBanners(): Promise<PromoBanner[]> {
  try {
    const db = await openBannerDb();
    const records: StoredBannerRecord[] = await new Promise((resolve) => {
      try {
        const tx = db.transaction(BANNER_STORE_NAME, 'readonly');
        const store = tx.objectStore(BANNER_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    if (records && records.length > 0) {
      // Resolve playback URLs and exclude soft-deleted or legacy auto-seeded default slides
      const resolved = records
        .filter((record: any) => (
          record &&
          record.isDeletedByAdmin !== true &&
          record.deleted !== true &&
          !String(record.id || '').startsWith('default_')
        ))
        .map((record) => {
          let finalMediaUrl = record.mediaUrl;
          if (record.mediaBlob instanceof Blob) {
            if (!objectUrlRegistry.has(record.id)) {
              objectUrlRegistry.set(record.id, URL.createObjectURL(record.mediaBlob));
            }
            finalMediaUrl = objectUrlRegistry.get(record.id)!;
          } else if (record.mediaDataUrl) {
            finalMediaUrl = record.mediaDataUrl;
          }
          return {
            ...record,
            mediaUrl: finalMediaUrl || record.mediaUrl
          };
        });

      resolved.sort((a: any, b: any) => (a.displayOrder ?? a.order ?? 9999) - (b.displayOrder ?? b.order ?? 9999));

      // Sync clean metadata to localStorage
      try {
        const metadata = resolved.map(({ mediaBlob, ...rest }) => rest);
        localStorage.setItem(BANNER_METADATA_STORAGE_KEY, JSON.stringify(metadata));
      } catch {}

      return resolved;
    }
  } catch (err) {
    console.warn('[BannerStorage] IndexedDB read note:', err);
  }

  // Fallback: check localStorage metadata
  try {
    const cached = localStorage.getItem(BANNER_METADATA_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const clean = parsed
          .filter((b: any) => b && b.isDeletedByAdmin !== true && b.deleted !== true && !String(b.id || '').startsWith('default_'))
          .sort((a: any, b: any) => (a.displayOrder ?? a.order ?? 9999) - (b.displayOrder ?? b.order ?? 9999));
        return clean;
      }
    }
  } catch {}

  // Never seed hardcoded or demo banners when empty.
  return [];
}

/**
 * Saves a banner (image or video) directly into persistent IndexedDB and syncs metadata to localStorage.
 * Handles File/Blob uploads without Firebase Cloud Storage limits or CORS blockers.
 */
export async function saveStoredBanner(
  bannerData: Partial<PromoBanner> & { id: string },
  file?: File | Blob
): Promise<PromoBanner> {
  const bannerId = bannerData.id || `banner_${Date.now()}`;
  const nowIso = new Date().toISOString();

  let mediaBlob: Blob | undefined = undefined;
  let mediaDataUrl: string | undefined = undefined;
  let finalMediaUrl = bannerData.mediaUrl || '';
  let mediaType = bannerData.mediaType || 'image';

  if (file) {
    mediaBlob = file;
    if (file.type.startsWith('video/')) {
      mediaType = 'video';
    } else {
      mediaType = 'image';
    }

    try {
      // Also generate DataURL for immediate fallback and instant offline display
      mediaDataUrl = await readFileAsDataUrl(file);
    } catch {}

    if (objectUrlRegistry.has(bannerId)) {
      try {
        URL.revokeObjectURL(objectUrlRegistry.get(bannerId)!);
      } catch {}
    }
    const blobUrl = URL.createObjectURL(file);
    objectUrlRegistry.set(bannerId, blobUrl);
    finalMediaUrl = blobUrl;
  }

  const record: StoredBannerRecord = {
    id: bannerId,
    title: bannerData.title || 'Special Promotion',
    subtitle: bannerData.subtitle || '',
    tag: bannerData.tag || 'TORRENT FITNESS',
    mediaType,
    mediaUrl: finalMediaUrl || bannerData.mediaUrl || '',
    linkType: bannerData.linkType || 'plans',
    buttonText: bannerData.buttonText || 'Learn More',
    badgeColor: bannerData.badgeColor || 'from-indigo-500 to-purple-500',
    active: bannerData.active !== false,
    order: typeof bannerData.order === 'number' ? bannerData.order : Date.now(),
    createdAt: bannerData.createdAt || nowIso,
    updatedAt: nowIso,
    mediaBlob,
    mediaDataUrl: mediaDataUrl || (bannerData as any).mediaDataUrl,
    fileName: file instanceof File ? file.name : undefined,
    mimeType: file?.type,
    fileSize: file?.size
  };

  // Write to IndexedDB
  try {
    const db = await openBannerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BANNER_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BANNER_STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[BannerStorage] IndexedDB write error:', err);
  }

  // Sync metadata to localStorage (strip binary blob to prevent storage quota issues)
  try {
    const existing = await getStoredBanners();
    const idx = existing.findIndex((b) => b.id === bannerId);
    const sanitizedRecord = { ...record };
    delete sanitizedRecord.mediaBlob;
    if (sanitizedRecord.mediaDataUrl && sanitizedRecord.mediaDataUrl.length > 2000000) {
      // Truncate heavy video dataURLs from localStorage; IndexedDB handles the binary
      delete sanitizedRecord.mediaDataUrl;
    }
    if (idx !== -1) {
      existing[idx] = sanitizedRecord;
    } else {
      existing.push(sanitizedRecord);
    }
    localStorage.setItem(BANNER_METADATA_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn('[BannerStorage] localStorage sync note:', e);
  }

  // Dispatch live update event so Home Screen Carousel updates immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tf:banners_updated', { detail: { id: bannerId } }));
  }

  return record;
}

/**
 * Permanently deletes a banner from IndexedDB and localStorage.
 */
export async function deleteStoredBanner(bannerId: string): Promise<void> {
  if (objectUrlRegistry.has(bannerId)) {
    try {
      URL.revokeObjectURL(objectUrlRegistry.get(bannerId)!);
      objectUrlRegistry.delete(bannerId);
    } catch {}
  }

  try {
    const db = await openBannerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BANNER_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BANNER_STORE_NAME);
      const req = store.delete(bannerId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[BannerStorage] IndexedDB delete error:', err);
  }

  try {
    const raw = localStorage.getItem(BANNER_METADATA_STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const filtered = list.filter((b: any) => b.id !== bannerId);
        localStorage.setItem(BANNER_METADATA_STORAGE_KEY, JSON.stringify(filtered));
      }
    }
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tf:banners_updated', { detail: { deletedId: bannerId } }));
  }
}

/**
 * Toggles a banner's active state in IndexedDB and localStorage.
 */
export async function toggleStoredBannerActive(bannerId: string, active: boolean): Promise<void> {
  try {
    const db = await openBannerDb();
    const record: StoredBannerRecord | null = await new Promise((resolve) => {
      const tx = db.transaction(BANNER_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BANNER_STORE_NAME);
      const getReq = store.get(bannerId);
      getReq.onsuccess = () => {
        if (getReq.result) {
          getReq.result.active = active;
          getReq.result.updatedAt = new Date().toISOString();
          store.put(getReq.result);
          resolve(getReq.result);
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => resolve(null);
    });

    if (record) {
      const raw = localStorage.getItem(BANNER_METADATA_STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const item = list.find((b: any) => b.id === bannerId);
          if (item) item.active = active;
          localStorage.setItem(BANNER_METADATA_STORAGE_KEY, JSON.stringify(list));
        }
      }
    }
  } catch (err) {
    console.error('[BannerStorage] Toggle error:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tf:banners_updated', { detail: { id: bannerId, active } }));
  }
}

/**
 * Updates a banner's display order in IndexedDB and localStorage.
 */
export async function updateStoredBannerOrder(bannerId: string, newOrder: number): Promise<void> {
  try {
    const db = await openBannerDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(BANNER_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BANNER_STORE_NAME);
      const getReq = store.get(bannerId);
      getReq.onsuccess = () => {
        if (getReq.result) {
          getReq.result.order = newOrder;
          getReq.result.updatedAt = new Date().toISOString();
          store.put(getReq.result);
        }
        resolve();
      };
      getReq.onerror = () => resolve();
    });

    const raw = localStorage.getItem(BANNER_METADATA_STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const item = list.find((b: any) => b.id === bannerId);
        if (item) item.order = newOrder;
        list.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        localStorage.setItem(BANNER_METADATA_STORAGE_KEY, JSON.stringify(list));
      }
    }
  } catch (err) {
    console.error('[BannerStorage] Order update error:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tf:banners_updated', { detail: { id: bannerId, order: newOrder } }));
  }
}

/**
 * Replaces local IndexedDB and localStorage banner caches strictly with the current
 * Cloud Firestore snapshot (including empty arrays when all banners are deleted).
 */
export async function replaceStoredBannersCache(banners: PromoBanner[]): Promise<void> {
  const cleanList = (Array.isArray(banners) ? banners : [])
    .filter((b: any) => b && b.isDeletedByAdmin !== true && b.deleted !== true)
    .sort((a: any, b: any) => (a.displayOrder ?? a.order ?? 9999) - (b.displayOrder ?? b.order ?? 9999));

  try {
    const db = await openBannerDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(BANNER_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BANNER_STORE_NAME);
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        cleanList.forEach((item) => {
          try {
            store.put({
              ...item,
              order: item.displayOrder ?? item.order ?? 0,
              displayOrder: item.displayOrder ?? item.order ?? 0
            });
          } catch {}
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[BannerStorage] Cache replace notice:', err);
  }

  try {
    localStorage.setItem(BANNER_METADATA_STORAGE_KEY, JSON.stringify(cleanList));
    localStorage.removeItem('tf_cache_v2_promo_banners');
  } catch {}
}
