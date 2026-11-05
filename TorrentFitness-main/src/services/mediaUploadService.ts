/**
 * Torrent Fitness Media Upload Service
 * Bridges client media attachments with server-side local storage or falls back to optimized data URLs.
 */

export async function uploadMediaOrDataUrl(dataUrl: string, fileName = 'media.jpg'): Promise<string> {
  if (!dataUrl) return '';

  // Already a clean static or remote URL
  if (
    dataUrl.startsWith('http://') ||
    dataUrl.startsWith('https://') ||
    dataUrl.startsWith('/uploads/') ||
    dataUrl.startsWith('/assets/') ||
    dataUrl.startsWith('/')
  ) {
    return dataUrl;
  }

  // Attempt server upload for clean static file hosting
  try {
    const res = await fetch('/api/upload-media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dataUrl,
        filename: fileName
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.url) {
        return data.url;
      }
    }
  } catch (err) {
    console.warn('Server media upload fallback notice:', err);
  }

  // Fallback: return dataUrl (which will have been compressed to safe size)
  return dataUrl;
}
