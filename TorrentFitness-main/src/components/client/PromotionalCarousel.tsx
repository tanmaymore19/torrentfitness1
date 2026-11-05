import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, setDoc, query, limit } from 'firebase/firestore';
import { PromoBanner } from '../../types';
import { getCachedData, setCachedData, optimizeImageUrl } from '../../services/cacheService';
import { ChevronLeft, ChevronRight, ArrowRight, Play, Sparkles, ImageOff } from 'lucide-react';

interface PromotionalCarouselProps {
  onNavigateTab: (tab: 'home' | 'workouts' | 'qr' | 'pt' | 'analysis' | 'events' | 'plans' | 'profile') => void;
}

// Curated initial seed banners with high-definition fitness imagery
export const DEFAULT_PROMO_BANNERS: Omit<PromoBanner, 'id'>[] = [
  {
    title: 'New Year Revolution: 40% OFF',
    subtitle: 'Annual Platinum All-Access pass with unlimited steam & group classes.',
    tag: 'MEGA OFFER',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
    linkType: 'plans',
    buttonText: 'View Discount Plans',
    badgeColor: 'from-amber-500 to-orange-500',
    active: true,
    order: 1,
    createdAt: new Date().toISOString()
  },
  {
    title: 'Transform with Elite Personal Trainers',
    subtitle: '1-on-1 personalized biomechanics, custom macros & weekly check-ins.',
    tag: 'CERTIFIED COACHES',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=1200&q=80',
    linkType: 'pt',
    buttonText: 'Find Your Coach',
    badgeColor: 'from-indigo-500 to-purple-500',
    active: true,
    order: 2,
    createdAt: new Date().toISOString()
  },
  {
    title: 'Master Your Form & Exercise Library',
    subtitle: 'Explore 50+ muscle-specific workouts with rep tempos and form guides.',
    tag: 'WORKOUT HUB',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80',
    linkType: 'workouts',
    buttonText: 'Browse Exercises',
    badgeColor: 'from-sky-500 to-blue-600',
    active: true,
    order: 3,
    createdAt: new Date().toISOString()
  },
  {
    title: 'Torrent 30-Day Summer Shred',
    subtitle: 'Compete with gym members, log attendance streaks and win cash prizes.',
    tag: 'CHALLENGE',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=1200&q=80',
    linkType: 'events',
    buttonText: 'Join Challenge',
    badgeColor: 'from-emerald-500 to-teal-500',
    active: true,
    order: 4,
    createdAt: new Date().toISOString()
  }
];

export const PromotionalCarousel: React.FC<PromotionalCarouselProps> = ({ onNavigateTab }) => {
  const [banners, setBanners] = useState<PromoBanner[]>(() =>
    getCachedData<PromoBanner[]>(
      'promo_banners',
      DEFAULT_PROMO_BANNERS.map((b, i) => ({ id: `default_${i}`, ...b }))
    )
  );
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Touch Swipe Gesture Tracking
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  // Load banners in real time from Firestore (bounded by limit(10)) and cache results
  useEffect(() => {
    const qBanners = query(collection(db, 'promoBanners'), limit(10));
    const unsub = onSnapshot(
      qBanners,
      async (snap) => {
        if (snap.empty) {
          // Seed default banners in background so it's never empty
          try {
            await Promise.all(
              DEFAULT_PROMO_BANNERS.map((b, i) => {
                const id = `banner_seed_${i + 1}`;
                return setDoc(doc(db, 'promoBanners', id), { id, ...b });
              })
            );
          } catch (e) {
            console.warn('Seed banners note:', e);
          }
        } else {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as PromoBanner))
            .filter((b) => b.active !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
          setBanners(list);
          setCachedData('promo_banners', list);
        }
      },
      (err) => console.warn('PromoBanners listener note:', err)
    );

    return () => unsub();
  }, []);

  // Use local fallback if banners not yet retrieved or all inactive
  const activeBanners: PromoBanner[] =
    banners.length > 0
      ? banners
      : DEFAULT_PROMO_BANNERS.map((b, i) => ({ id: `default_${i}`, ...b }));

  // Keep index bounded
  useEffect(() => {
    if (currentIndex >= activeBanners.length) {
      setCurrentIndex(0);
    }
  }, [activeBanners.length, currentIndex]);

  // Auto-advance carousel
  useEffect(() => {
    if (activeBanners.length <= 1 || isPaused) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeBanners.length, isPaused]);

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const handleSlideClick = (banner: PromoBanner) => {
    if (banner.linkType) {
      if (['home', 'workouts', 'qr', 'pt', 'analysis', 'events', 'plans', 'profile'].includes(banner.linkType)) {
        onNavigateTab(banner.linkType as any);
      } else {
        onNavigateTab('plans');
      }
    } else {
      onNavigateTab('plans');
    }
  };

  // Touch Swipe Handlers for smooth mobile swiping
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartXRef.current = e.targetTouches[0].clientX;
    touchEndXRef.current = null;
    isDraggingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    touchEndXRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    setIsPaused(false);
    isDraggingRef.current = false;
    if (touchStartXRef.current === null || touchEndXRef.current === null) return;

    const diff = touchStartXRef.current - touchEndXRef.current;
    const minSwipeDistance = 45; // 45px swipe threshold

    if (diff > minSwipeDistance) {
      // Swiped Left -> Next
      handleNext();
    } else if (diff < -minSwipeDistance) {
      // Swiped Right -> Prev
      handlePrev();
    }

    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  const handleImageError = (bannerId: string) => {
    setFailedImages((prev) => ({ ...prev, [bannerId]: true }));
  };

  if (activeBanners.length === 0) return null;

  return (
    <div
      className="relative w-full rounded-3xl overflow-hidden shadow-[0_16px_36px_-10px_rgba(15,23,42,0.14)] border border-white/80 group select-none transition-all duration-300 bg-slate-950"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Multi-Slide Horizontal Track Container */}
      <div
        className="flex w-full transition-transform duration-500 ease-out will-change-transform"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {activeBanners.map((banner, index) => {
          const isFailed = failedImages[banner.id];
          const isVideo = banner.mediaType === 'video';

          return (
            <div
              key={banner.id || index}
              onClick={() => handleSlideClick(banner)}
              className="relative w-full shrink-0 h-56 sm:h-64 cursor-pointer overflow-hidden bg-slate-950"
            >
              {/* Media Render: Video vs Image vs Gradient Fallback */}
              {isVideo && !isFailed ? (
                <video
                  src={banner.mediaUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  onError={() => handleImageError(banner.id)}
                  className="w-full h-full object-cover transform scale-105 transition-transform duration-700"
                />
              ) : !isFailed && banner.mediaUrl ? (
                <img
                  src={optimizeImageUrl(banner.mediaUrl, 900, 75)}
                  alt={banner.title}
                  decoding="async"
                  onError={() => handleImageError(banner.id)}
                  className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-105"
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              ) : (
                /* Fallback Branded Graphic when image fails or is empty */
                <div className="w-full h-full bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 flex items-center justify-center p-6 text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(99,102,241,0.25),transparent)] pointer-events-none" />
                  <div className="space-y-2 relative z-10 opacity-75">
                    <Sparkles className="w-10 h-10 text-indigo-400 mx-auto animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-300 block">
                      Torrent Fitness Club
                    </span>
                  </div>
                </div>
              )}

              {/* Ambient High-Contrast Gradients for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/45 to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/25 to-transparent pointer-events-none" />

              {/* Top Badges: Tag & Slide Counter */}
              <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between z-10 pointer-events-none">
                <div className="flex items-center gap-2">
                  {banner.tag && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase text-white shadow-sm backdrop-blur-md bg-gradient-to-r ${
                        banner.badgeColor || 'from-indigo-600 to-purple-600'
                      } border border-white/30`}
                    >
                      {banner.tag}
                    </span>
                  )}
                  {isVideo && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white/90 bg-black/60 backdrop-blur-md border border-white/20 flex items-center gap-1">
                      <Play className="w-2.5 h-2.5 fill-current" /> Video
                    </span>
                  )}
                </div>

                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-white/90 border border-white/20">
                  {index + 1} / {activeBanners.length}
                </span>
              </div>

              {/* Slide Text Content & Call To Action */}
              <div className="absolute bottom-4 inset-x-3.5 sm:inset-x-5 z-10 space-y-1.5 pointer-events-auto">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug drop-shadow-md">
                  {banner.title}
                </h3>

                {banner.subtitle && (
                  <p className="text-xs text-white/90 line-clamp-2 leading-relaxed max-w-sm drop-shadow-sm font-medium">
                    {banner.subtitle}
                  </p>
                )}

                <div className="pt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSlideClick(banner);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-900 bg-white/95 hover:bg-white shadow-[0_4px_14px_rgba(0,0,0,0.25)] border border-white/80 transition-all transform active:scale-95 hover:translate-x-0.5"
                  >
                    <span>{banner.buttonText || 'Explore Now'}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-600" />
                  </button>

                  {/* Swipe / Tap hint */}
                  <span className="text-[10px] font-medium text-white/60 hidden sm:inline">
                    Swipe or tap to explore
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Prev / Next navigation arrows */}
      {activeBanners.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous Banner"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-lg border border-white/30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleNext}
            aria-label="Next Banner"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-lg border border-white/30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Bullet Dot Indicators */}
      {activeBanners.length > 1 && (
        <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-1.5 z-20 pointer-events-auto">
          {activeBanners.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex
                  ? 'w-7 bg-white shadow-sm'
                  : 'w-1.5 bg-white/45 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
