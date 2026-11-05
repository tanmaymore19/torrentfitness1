import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, AlertCircle } from 'lucide-react';

import { MediaUploadAdjustModal } from './MediaUploadAdjustModal';

interface PhotoUploaderProps {
  onPhotoSelected: (base64OrUrl: string) => void;
  defaultPhoto?: string;
  label?: string;
  required?: boolean;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  onPhotoSelected,
  defaultPhoto = '',
  label = 'Profile Photo',
  required = true
}) => {
  const [preview, setPreview] = useState<string>(defaultPhoto);
  const [error, setError] = useState<string>('');
  const [rawImageToCrop, setRawImageToCrop] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultPhoto) {
      setPreview(defaultPhoto);
    }
  }, [defaultPhoto]);

  const sampleAvatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80'
  ];

  const [selectedFileForAdjust, setSelectedFileForAdjust] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mime = file.type.toLowerCase();
    const isImage =
      mime.startsWith('image/') ||
      file.name.endsWith('.jpg') ||
      file.name.endsWith('.jpeg') ||
      file.name.endsWith('.png') ||
      file.name.endsWith('.webp');

    if (!isImage) {
      setError('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError('Image must be under 20MB.');
      return;
    }

    setError('');
    setSelectedFileForAdjust(file);

    // Reset file input value so re-selecting the same file triggers change
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAdjustComplete = (result: { mediaUrl: string }) => {
    setPreview(result.mediaUrl);
    setSelectedFileForAdjust(null);
    onPhotoSelected(result.mediaUrl);
  };

  const handleSelectSample = (url: string) => {
    setPreview(url);
    setError('');
    onPhotoSelected(url);
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
        {label} {required && <span className="text-orange-500 font-black">*</span>}
      </label>

      <div className="flex items-center gap-4 p-3.5 vision-card rounded-2xl">
        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-white/90 border-2 border-white shadow-[0_6px_14px_rgba(15,23,42,0.08),inset_0_1px_2px_rgba(255,255,255,1)] shrink-0 flex items-center justify-center ring-2 ring-indigo-500/25">
          {preview ? (
            <img src={preview} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <Camera className="w-6 h-6 text-indigo-500" strokeWidth={2} />
          )}
        </div>

        <div className="flex-1 space-y-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold vision-btn-aurora rounded-xl transition-all shadow-md"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={2} />
            Upload Device Photo
          </button>
          <p className="text-[11px] text-slate-500 font-semibold">Or pick a quick fitness avatar:</p>
          <div className="flex items-center gap-1.5">
            {sampleAvatars.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectSample(url)}
                className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-all hover:scale-105 shadow-sm ${
                  preview === url ? 'ring-2 ring-indigo-500 border-white scale-105' : 'border-white/80 opacity-75 hover:opacity-100'
                }`}
              >
                <img src={url} alt={`Avatar ${i}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-rose-600 flex items-center gap-1 font-semibold">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      {selectedFileForAdjust && (
        <MediaUploadAdjustModal
          file={selectedFileForAdjust}
          defaultAspect="1:1"
          title="Crop Profile Photo"
          onComplete={handleAdjustComplete}
          onCancel={() => setSelectedFileForAdjust(null)}
        />
      )}
    </div>
  );
};
