import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { Camera, Eye, X, Sparkles, MapPin } from 'lucide-react';

export interface GymPhoto {
  id: string;
  title: string;
  category: string;
  photoUrl: string;
  caption?: string;
  order?: number;
  active?: boolean;
  createdAt?: string;
}

export const DEFAULT_GYM_PHOTOS: GymPhoto[] = [
  {
    id: 'photo_weights',
    title: 'Olympic Strength & Power Racks',
    category: 'Free Weights',
    photoUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
    caption: 'Competition Eleiko barbells, calibrated bumpers, and dedicated deadlift platforms.',
    order: 1,
    active: true
  },
  {
    id: 'photo_cardio',
    title: 'Cardio Sprint Track & Turf',
    category: 'Cardio Zone',
    photoUrl: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=1200&q=80',
    caption: 'Air assault bikes, curved motorless treadmills, and 30m sled sprint turf.',
    order: 2,
    active: true
  },
  {
    id: 'photo_studio',
    title: 'Aerobics & Dance Cardio Studio',
    category: 'Women Studio',
    photoUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80',
    caption: 'Dedicated women-exclusive studio with shock-absorbing sprung flooring.',
    order: 3,
    active: true
  },
  {
    id: 'photo_steam',
    title: 'Luxury Steam & Recovery Spa',
    category: 'Recovery',
    photoUrl: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=1200&q=80',
    caption: 'Eucalyptus aroma steam room and post-workout recovery lounge.',
    order: 4,
    active: true
  }
];

export const GymPhotoGallery: React.FC = () => {
  const [photos, setPhotos] = useState<GymPhoto[]>(DEFAULT_GYM_PHOTOS);
  const [selectedPhoto, setSelectedPhoto] = useState<GymPhoto | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Real-time Firestore sync with gymPhotos collection
  useEffect(() => {
    const qPhotos = query(collection(db, 'gymPhotos'), limit(20));
    const unsub = onSnapshot(
      qPhotos,
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as GymPhoto))
            .filter((p) => p.active !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
          if (list.length > 0) {
            setPhotos(list);
          }
        }
      },
      (err) => console.warn('Gym photos listener note:', err)
    );

    return () => unsub();
  }, []);

  const categories = ['All', ...Array.from(new Set(photos.map((p) => p.category).filter(Boolean)))];

  const filteredPhotos =
    selectedCategory === 'All'
      ? photos
      : photos.filter((p) => p.category === selectedCategory);

  return (
    <div className="space-y-3 pt-2">
      {/* Header bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
            Gym Facility &amp; Floor Photos
          </h3>
        </div>
        <span className="text-[10px] font-bold text-slate-500">
          {filteredPhotos.length} {filteredPhotos.length === 1 ? 'Photo' : 'Photos'}
        </span>
      </div>

      {/* Category Pills */}
      {categories.length > 2 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-tight whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white/80 text-slate-600 border border-slate-200 hover:bg-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Grid of Photos */}
      <div className="grid grid-cols-2 gap-2.5">
        {filteredPhotos.map((photo) => (
          <div
            key={photo.id}
            onClick={() => setSelectedPhoto(photo)}
            className="group relative rounded-2xl overflow-hidden aspect-[4/3] bg-slate-900 border border-white/80 shadow-xs cursor-pointer active:scale-[0.98] transition-transform"
          >
            <img
              src={photo.photoUrl}
              alt={photo.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
            <div className="absolute top-2 left-2">
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-white/90 text-slate-900 shadow-2xs backdrop-blur-xs">
                {photo.category}
              </span>
            </div>
            <div className="absolute bottom-2 left-2 right-2">
              <p className="text-[11px] font-black text-white truncate drop-shadow-sm">
                {photo.title}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Photo Fullscreen Viewer Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-lg w-full bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-slate-950/70 text-white hover:bg-slate-950 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative aspect-[16/10] bg-black">
              <img
                src={selectedPhoto.photoUrl}
                alt={selectedPhoto.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-4 space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                  {selectedPhoto.category}
                </span>
                <h4 className="text-sm font-black text-white">{selectedPhoto.title}</h4>
              </div>
              {selectedPhoto.caption && (
                <p className="text-xs text-slate-300 leading-relaxed pt-1">
                  {selectedPhoto.caption}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
