import React, { useState, useCallback } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { uploadMediaOrDataUrl } from '../../services/mediaUploadService';

export type AspectRatioType = '1:1' | '16:9' | '4:5' | 'auto' | 'free';

interface ImageCropAdjustModalProps {
  imageSrc: string;
  onCropComplete: (croppedDataUrl: string) => void;
  onCancel: () => void;
  defaultAspect?: AspectRatioType;
  title?: string;
  cropShape?: 'rect' | 'round';
}

const getAspectRatioNumber = (type: AspectRatioType): number | undefined => {
  switch (type) {
    case '1:1':
      return 1;
    case '16:9':
      return 16 / 9;
    case '4:5':
      return 4 / 5;
    case 'free':
    case 'auto':
    default:
      return 1;
  }
};

/**
 * High-precision canvas drawing function that handles cropping smoothly
 * without letterbox bars or blurriness. Sized to optimal 1200px max dimension.
 */
const renderCroppedToCanvas = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  pixelCrop: Area,
  maxDimension = 1200
): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let outWidth = Math.max(1, Math.round(pixelCrop.width));
  let outHeight = Math.max(1, Math.round(pixelCrop.height));

  if (outWidth > maxDimension || outHeight > maxDimension) {
    if (outWidth >= outHeight) {
      outHeight = Math.round((outHeight * maxDimension) / outWidth);
      outWidth = maxDimension;
    } else {
      outWidth = Math.round((outWidth * maxDimension) / outHeight);
      outHeight = maxDimension;
    }
  }

  canvas.width = outWidth;
  canvas.height = outHeight;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, outWidth, outHeight);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outWidth,
    outHeight
  );
};

export const ImageCropAdjustModal: React.FC<ImageCropAdjustModalProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
  defaultAspect = '1:1',
  title = 'Crop & Frame',
  cropShape = 'rect'
}) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  const aspectValue = getAspectRatioNumber(defaultAspect);

  const onCropChange = (newCrop: Point) => {
    setCrop(newCrop);
  };

  const onZoomChange = (newZoom: number) => {
    setZoom(newZoom);
  };

  const onCropCompleteHandler = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels || isProcessing) return;
    setIsProcessing(true);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageSrc;

      await new Promise<void>((resolve, reject) => {
        if (img.complete) resolve();
        else {
          img.onload = () => resolve();
          img.onerror = reject;
        }
      });

      const canvas = document.createElement('canvas');
      renderCroppedToCanvas(canvas, img, croppedAreaPixels, 1200);

      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const uploadedUrl = await uploadMediaOrDataUrl(croppedDataUrl, 'banner_crop.jpg');
      onCropComplete(uploadedUrl);
    } catch (err) {
      console.error('Error generating cropped image:', err);
      // Fallback to original image if canvas rendering fails
      onCropComplete(imageSrc);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-2xl text-white select-none animate-fade-in">
      {/* 1. Top Minimal Bar: Exactly 2 Action Buttons (Cancel top-left, Done top-right) */}
      <header className="h-14 px-4 sm:px-6 flex items-center justify-between border-b border-white/10 shrink-0 bg-black/40">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="text-sm font-semibold text-slate-300 hover:text-white px-2 py-1.5 transition-colors disabled:opacity-40"
        >
          Cancel
        </button>

        <div className="text-center">
          <h2 className="text-sm font-black text-white tracking-tight">{title}</h2>
          <span className="text-[10px] text-slate-400 font-mono">
            {defaultAspect === '16:9' ? '16:9 Banner' : defaultAspect === '4:5' ? '4:5 Portrait' : '1:1 Square'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isProcessing}
          className="text-sm font-black text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-40"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>Done</span>
          )}
        </button>
      </header>

      {/* 2. Centered Cropping Viewport: Drag to reposition, pinch or slider to zoom, subtle 3x3 grid */}
      <main className="relative flex-1 w-full overflow-hidden bg-black flex items-center justify-center">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspectValue}
          cropShape={cropShape}
          showGrid={isInteracting}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropCompleteHandler}
          onInteractionStart={() => setIsInteracting(true)}
          onInteractionEnd={() => setIsInteracting(false)}
          classes={{
            containerClassName: 'relative w-full h-full',
            cropAreaClassName:
              'border border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.72)] transition-opacity duration-150'
          }}
        />

        {/* Subtle helper hint that disappears once user interacts */}
        {!isInteracting && zoom === 1 && crop.x === 0 && crop.y === 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[11px] text-slate-300 font-medium tracking-wide animate-pulse">
            Pinch or drag to reposition
          </div>
        )}
      </main>

      {/* 3. Bottom Minimal Zoom Slider */}
      <footer className="h-20 px-6 sm:px-12 flex items-center justify-center border-t border-white/10 shrink-0 bg-black/40">
        <div className="w-full max-w-sm flex items-center gap-3">
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.max(1, Number((prev - 0.15).toFixed(2))))}
            className="p-1 text-slate-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-indigo-500 h-1 bg-white/20 rounded-lg cursor-pointer"
            aria-label="Zoom slider"
          />

          <button
            type="button"
            onClick={() => setZoom((prev) => Math.min(3, Number((prev + 0.15).toFixed(2))))}
            className="p-1 text-slate-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ImageCropAdjustModal;
