import React, { useState, useEffect, useRef } from 'react';
import { ImageCropAdjustModal, AspectRatioType } from './ImageCropAdjustModal';
import { uploadMediaOrDataUrl } from '../../services/mediaUploadService';
import {
  Play,
  Pause,
  Video,
  Camera,
  RotateCcw,
  Check,
  X,
  Sparkles,
  Volume2,
  VolumeX,
  Maximize2
} from 'lucide-react';

export interface MediaUploadResult {
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string;
  aspectRatio?: string;
}

interface MediaUploadAdjustModalProps {
  file: File;
  onComplete: (result: MediaUploadResult) => void;
  onCancel: () => void;
  defaultAspect?: AspectRatioType;
  title?: string;
}

export const MediaUploadAdjustModal: React.FC<MediaUploadAdjustModalProps> = ({
  file,
  onComplete,
  onCancel,
  defaultAspect = '16:9',
  title = 'Media Adjustment & Preview'
}) => {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [isVideo, setIsVideo] = useState<boolean>(false);

  // Video Player States
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [capturedThumbnail, setCapturedThumbnail] = useState<string>('');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // 1. Safe Object URL lifecycle with automatic revocation on cleanup
  useEffect(() => {
    if (!file) return;

    const mime = file.type.toLowerCase();
    const isVid =
      mime.startsWith('video/') ||
      file.name.endsWith('.mp4') ||
      file.name.endsWith('.mov') ||
      file.name.endsWith('.webm');
    setIsVideo(isVid);

    const url = URL.createObjectURL(file);
    setObjectUrl(url);

    return () => {
      // Memory cleanup
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Video Time Update Listener
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      // Auto capture initial frame as default poster thumbnail
      captureFrameAsThumbnail();
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Capture video frame to HTML Canvas as high-resolution JPEG poster thumbnail
  const captureFrameAsThumbnail = () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    try {
      const v = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = Math.min(v.videoWidth || 1280, 1200);
      canvas.height = Math.round((canvas.width * (v.videoHeight || 720)) / (v.videoWidth || 1280));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
        setCapturedThumbnail(dataUrl);
      }
    } catch (err) {
      console.warn('Frame capture notice:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleApplyVideo = async () => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const resultDataUrl = (e.target?.result as string) || objectUrl;
      const uploadedVideoUrl = await uploadMediaOrDataUrl(resultDataUrl, file.name);
      let uploadedThumb = '';
      if (capturedThumbnail) {
        uploadedThumb = await uploadMediaOrDataUrl(capturedThumbnail, 'thumb.jpg');
      }
      onComplete({
        mediaType: 'video',
        mediaUrl: uploadedVideoUrl,
        thumbnailUrl: uploadedThumb || uploadedVideoUrl
      });
    };
    reader.onerror = () => {
      onComplete({
        mediaType: 'video',
        mediaUrl: objectUrl,
        thumbnailUrl: capturedThumbnail || objectUrl
      });
    };

    if (file.size < 25 * 1024 * 1024) {
      reader.readAsDataURL(file);
    } else {
      onComplete({
        mediaType: 'video',
        mediaUrl: objectUrl,
        thumbnailUrl: capturedThumbnail
      });
    }
  };

  if (!objectUrl) return null;

  // IF IMAGE: Delegate directly to Instagram-Grade Crop & Adjust Modal
  if (!isVideo) {
    return (
      <ImageCropAdjustModal
        imageSrc={objectUrl}
        defaultAspect={defaultAspect}
        title={title || 'Crop & Adjust Photo'}
        onCropComplete={(croppedDataUrl) => {
          onComplete({
            mediaType: 'image',
            mediaUrl: croppedDataUrl,
            aspectRatio: defaultAspect
          });
        }}
        onCancel={onCancel}
      />
    );
  }

  // IF VIDEO: Show High-Resolution Video Preview Player with Frame Seeker & Thumbnail Grabber
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-xl animate-fade-in select-none">
      {/* Hidden canvas for thumbnail rendering */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col text-white max-h-[95vh]">
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">{title || 'Video Preview & Frame Seeker'}</h3>
              <p className="text-[11px] text-slate-400 font-medium">
                {file.name} • {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Canvas & Player */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[260px] sm:min-h-[320px]">
          <video
            ref={videoRef}
            src={objectUrl}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            className="max-h-[50vh] w-auto max-w-full object-contain mx-auto"
          />

          {/* Center Play/Pause Overlay indicator */}
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/20 hover:bg-black/30 transition-all group"
          >
            <div className="w-14 h-14 rounded-full bg-white/25 backdrop-blur-md text-white flex items-center justify-center shadow-xl border border-white/40 transform group-hover:scale-110 transition-transform">
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current ml-1" />
              )}
            </div>
          </button>

          {/* Mute button on top right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="absolute top-3 right-3 p-2 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md text-white/90 border border-white/20 transition-all"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Video Controls & Time Scrubber */}
        <div className="p-4 bg-slate-900 border-t border-white/10 space-y-3">
          {/* Progress bar scrubber */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Poster Frame Selector */}
          <div className="p-3 bg-slate-950/80 rounded-2xl border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {capturedThumbnail ? (
                <img
                  src={capturedThumbnail}
                  alt="Captured Frame"
                  className="w-16 h-10 object-cover rounded-lg border border-white/20 shrink-0"
                />
              ) : (
                <div className="w-16 h-10 bg-slate-800 rounded-lg border border-white/10 flex items-center justify-center text-slate-500 shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <span className="text-xs font-bold text-white block">Video Cover Poster</span>
                <span className="text-[11px] text-slate-400 block truncate">
                  Captured at {formatDuration(currentTime)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={captureFrameAsThumbnail}
              disabled={isCapturing}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Capture Current Frame</span>
            </button>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleApplyVideo}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-black shadow-lg transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Use Video &amp; Poster</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
