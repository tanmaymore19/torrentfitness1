/**
 * Torrent Fitness Image Compression Utility
 * Resizes and compresses images via HTML5 Canvas to strictly adhere to Firestore's 1MB document limit.
 */

export async function compressImageToDataUrl(
  input: File | Blob | string,
  maxWidth = 1200,
  initialQuality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    let sourceUrl = '';
    let isCreatedUrl = false;

    if (typeof input === 'string') {
      sourceUrl = input;
    } else {
      sourceUrl = URL.createObjectURL(input);
      isCreatedUrl = true;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const cleanup = () => {
      if (isCreatedUrl && sourceUrl) {
        try {
          URL.revokeObjectURL(sourceUrl);
        } catch {}
      }
    };

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          cleanup();
          resolve(typeof input === 'string' ? input : '');
          return;
        }

        // Scale down to maxWidth preserving aspect ratio
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          cleanup();
          resolve(typeof input === 'string' ? input : '');
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let quality = initialQuality;
        let result = canvas.toDataURL('image/jpeg', quality);

        // Firestore document limit is 1,048,576 bytes; keep compressed banner images strictly < 450KB.
        const MAX_DOC_DATA_URL_LENGTH = 445000;
        if (result.length > MAX_DOC_DATA_URL_LENGTH) {
          quality = 0.65;
          result = canvas.toDataURL('image/jpeg', quality);
        }

        if (result.length > MAX_DOC_DATA_URL_LENGTH) {
          quality = 0.52;
          result = canvas.toDataURL('image/jpeg', quality);
        }

        if (result.length > MAX_DOC_DATA_URL_LENGTH) {
          // Downscale dimensions progressively so string payload stays strictly < 450KB
          for (const targetMaxW of [960, 760, 600]) {
            const targetW = Math.min(width, targetMaxW);
            const targetH = Math.max(1, Math.round((height * targetW) / width));
            const smallCanvas = document.createElement('canvas');
            smallCanvas.width = targetW;
            smallCanvas.height = targetH;
            const sCtx = smallCanvas.getContext('2d');
            if (sCtx) {
              sCtx.imageSmoothingEnabled = true;
              sCtx.imageSmoothingQuality = 'high';
              sCtx.drawImage(canvas, 0, 0, targetW, targetH);
              for (const q of [0.68, 0.56, 0.45]) {
                result = smallCanvas.toDataURL('image/jpeg', q);
                if (result.length <= MAX_DOC_DATA_URL_LENGTH) break;
              }
            }
            if (result.length <= MAX_DOC_DATA_URL_LENGTH) break;
          }
        }

        cleanup();
        resolve(result);
      } catch (err) {
        cleanup();
        console.error('Canvas compression error:', err);
        if (typeof input === 'string') {
          resolve(input);
        } else {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(err);
          reader.readAsDataURL(input);
        }
      }
    };

    img.onerror = (err) => {
      cleanup();
      console.warn('Image load error during compression, reading as data URL:', err);
      if (typeof input === 'string') {
        resolve(input);
      } else {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(err);
        reader.readAsDataURL(input);
      }
    };

    img.src = sourceUrl;
  });
}
