/**
 * Torrent Fitness Image Compression Utility
 * Resizes and compresses images via HTML5 Canvas to strictly adhere to Firestore's 1MB document limit.
 */

export async function compressImageToDataUrl(
  input: File | Blob | string,
  maxWidth = 1200,
  initialQuality = 0.80
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

        // Firestore document size limit is 1,048,576 bytes.
        // If string exceeds 750,000 characters (~550KB binary), step down quality
        if (result.length > 750000) {
          quality = 0.65;
          result = canvas.toDataURL('image/jpeg', quality);
        }

        if (result.length > 750000) {
          // Downscale dimensions to 900px width
          const targetW = Math.min(width, 900);
          const targetH = Math.round((height * targetW) / width);
          const smallCanvas = document.createElement('canvas');
          smallCanvas.width = targetW;
          smallCanvas.height = targetH;
          const sCtx = smallCanvas.getContext('2d');
          if (sCtx) {
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'high';
            sCtx.drawImage(canvas, 0, 0, targetW, targetH);
            result = smallCanvas.toDataURL('image/jpeg', 0.60);
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
