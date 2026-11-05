import React from 'react';

interface GymLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'custom';
  className?: string;
  containerClassName?: string;
  showGlow?: boolean;
  alt?: string;
}

const SIZE_MAP: Record<string, string> = {
  xs: 'w-8 h-8 min-w-[32px] min-h-[32px]',
  sm: 'w-10 h-10 min-w-[40px] min-h-[40px]',
  md: 'w-12 h-12 min-w-[48px] min-h-[48px]',
  lg: 'w-14 h-14 min-w-[56px] min-h-[56px]',
  xl: 'w-24 h-24 min-w-[96px] min-h-[96px]',
  '2xl': 'w-32 h-32 min-w-[128px] min-h-[128px]',
  custom: '',
};

export const GymLogo: React.FC<GymLogoProps> = ({
  size = 'md',
  className = '',
  containerClassName = '',
  showGlow = false,
  alt = 'Torrent Fitness Official Logo',
}) => {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div
      className={`relative shrink-0 flex items-center justify-center select-none overflow-hidden rounded-full aspect-square ${sizeClass} ${containerClassName}`}
      style={{ aspectRatio: '1 / 1' }}
    >
      {showGlow && (
        <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-md pointer-events-none scale-110" />
      )}
      <img
        src="/gym-logo-v2.png?v=20261025_2"
        alt={alt}
        className={`w-full h-full object-contain block select-none pointer-events-none rounded-full ${className}`}
        style={{ aspectRatio: '1 / 1', objectFit: 'contain' }}
        loading="eager"
        decoding="sync"
        onError={(e) => {
          const target = e.currentTarget;
          if (!target.src.includes('WhatsApp_Image')) {
            target.src = '/assets/aistudio/WhatsApp_Image_2026-10-25_at_3.56.48_PM_95897f92.jpeg';
          }
        }}
      />
    </div>
  );
};

export default GymLogo;
