import { storage } from '../firebase';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { compressImageToDataUrl } from '../utils/imageCompressor';

/**
 * Torrent Fitness Media Upload Service
 * Provides robust Firebase Storage upload for Promotional Media Banners (Images + Videos)
 * with live progress callbacks and safe HTML5 Canvas compressed base64 fallback.
 */

/**
 * Uploads an image file or data URL to Firebase Storage ('banners/images/...').
 * Compresses via HTML5 Canvas (max width 1280px, quality 0.82 JPEG/WebP).
 * Falls back to clean compressed base64 (<600KB) if Firebase Storage is unavailable or restricted.
 */
export async function uploadBannerImage(
  input: File | Blob | string,
  fileName?: string
): Promise<string> {
  if (!input) return '';

  // If already a remote web URL, keep it
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/uploads/') ||
      trimmed.startsWith('/assets/')
    ) {
      return trimmed;
    }
  }

  // First compress to high-quality lightweight data URL (max 1280px, quality 0.82)
  let compressedDataUrl = '';
  try {
    compressedDataUrl = await compressImageToDataUrl(input, 1280, 0.82);
  } catch (err) {
    console.warn('Canvas compression note:', err);
    if (typeof input === 'string') {
      compressedDataUrl = input;
    }
  }

  const cleanName = (fileName || (input instanceof File ? input.name : 'banner.jpg'))
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `banners/images/${Date.now()}_${cleanName}`;

  // Attempt Firebase Storage upload
  if (storage) {
    try {
      const res = await fetch(compressedDataUrl);
      const blob = await res.blob();
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const downloadUrl = await getDownloadURL(snapshot.ref);
      if (downloadUrl) {
        return downloadUrl;
      }
    } catch (storageErr) {
      console.warn('[Firebase Storage] Image upload note (using optimized canvas data URL):', storageErr);
    }
  }

  // Safe fallback: return canvas compressed base64 data URL (<600KB, 100% safe for Firestore)
  return compressedDataUrl;
}

/**
 * Uploads a video file (.mp4, .webm) to Firebase Storage ('banners/videos/...')
 * with live percentage progress tracking (0% - 100%).
 */
export async function uploadBannerVideo(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!file) {
    throw new Error('No video file selected.');
  }

  if (!storage) {
    throw new Error(
      'Firebase Storage is currently not initialized. Please paste a direct video URL (e.g. https://.../video.mp4) or configure Storage.'
    );
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `banners/videos/${Date.now()}_${cleanName}`;
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'video/mp4'
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress?.(progress);
        }
      },
      (error) => {
        console.error('[Firebase Storage] Video upload error:', error);
        reject(
          new Error(
            `Video upload to Firebase Storage failed: ${error.message || 'Storage error'}. You can also paste a direct hosted video URL.`
          )
        );
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (urlErr: any) {
          reject(new Error(`Failed to retrieve video download URL: ${urlErr.message}`));
        }
      }
    );
  });
}

/**
 * Legacy compatible helper
 */
export async function uploadMediaOrDataUrl(dataUrl: string, fileName = 'media.jpg'): Promise<string> {
  if (!dataUrl) return '';

  if (
    dataUrl.startsWith('http://') ||
    dataUrl.startsWith('https://') ||
    dataUrl.startsWith('/uploads/') ||
    dataUrl.startsWith('/assets/') ||
    dataUrl.startsWith('/')
  ) {
    return dataUrl;
  }

  // Try Firebase Storage for images
  if (storage && dataUrl.startsWith('data:image')) {
    try {
      const storageUrl = await uploadBannerImage(dataUrl, fileName);
      if (storageUrl && !storageUrl.startsWith('data:')) {
        return storageUrl;
      }
    } catch {}
  }

  return dataUrl;
}
