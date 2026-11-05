import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { PromoBanner } from '../../types';
import { DEFAULT_PROMO_BANNERS, PromotionalCarousel } from '../client/PromotionalCarousel';
import { GlobalDeleteConfirmModal } from '../common/GlobalDeleteConfirmModal';
import { MediaUploadAdjustModal, MediaUploadResult } from '../common/MediaUploadAdjustModal';
import {
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Video,
  Upload,
  Sparkles,
  Check,
  X,
  Layers,
  Play,
  Smartphone,
  Camera
} from 'lucide-react';
import { uploadMediaOrDataUrl } from '../../services/mediaUploadService';
import { GymPhoto, DEFAULT_GYM_PHOTOS } from '../client/GymPhotoGallery';

const PRESET_BANNERS = [
  {
    title: 'Torrent 30-Day Summer Shred',
    subtitle: 'Compete with gym members, log attendance streaks and win cash prizes.',
    tag: 'CHALLENGE',
    mediaType: 'image' as const,
    mediaUrl: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=1200&q=80',
    linkType: 'events' as const,
    buttonText: 'Join Challenge',
    badgeColor: 'from-emerald-500 to-teal-500'
  },
  {
    title: 'Summer Shred Bootcamp: 30% Off',
    subtitle: 'High energy fat-loss classes with coach led accountability.',
    tag: 'OFFER',
    mediaType: 'image' as const,
    mediaUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80',
    linkType: 'plans' as const,
    buttonText: 'View Plans',
    badgeColor: 'from-amber-500 to-orange-500'
  },
  {
    title: 'Transform with Elite Personal Trainers',
    subtitle: 'Certified trainers with custom nutritional macro plans.',
    tag: 'COACHING',
    mediaType: 'image' as const,
    mediaUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=1200&q=80',
    linkType: 'pt' as const,
    buttonText: 'Book PT Coach',
    badgeColor: 'from-indigo-500 to-purple-500'
  },
  {
    title: 'Gym Floor HIIT Sprint Highlight',
    subtitle: 'Experience our turf track & heart-rate paced cardio zone.',
    tag: 'VIDEO CLIP',
    mediaType: 'video' as const,
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    linkType: 'workouts' as const,
    buttonText: 'Watch & Train',
    badgeColor: 'from-rose-500 to-pink-500'
  }
];

const QUICK_TAGS = ['CHALLENGE', 'OFFER', 'MEGA OFFER', 'WORKOUT HUB', 'COACHING', 'NEW EVENT'];
const GYM_PHOTO_CATEGORIES = ['Free Weights', 'Cardio Zone', 'Women Studio', 'Recovery & Spa', 'Floor Arena'];

export const PromoBannerManager: React.FC = () => {
  const [activeMediaSection, setActiveMediaSection] = useState<'banners' | 'photos'>('banners');

  // Carousel Banners state
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<PromoBanner | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [bannerToDelete, setBannerToDelete] = useState<PromoBanner | null>(null);

  // Form states for Banners
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [tag, setTag] = useState('CHALLENGE');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [linkType, setLinkType] = useState<'plans' | 'workouts' | 'pt' | 'analysis' | 'events' | 'custom'>('events');
  const [linkTarget, setLinkTarget] = useState('');
  const [buttonText, setButtonText] = useState('Join Challenge');
  const [badgeColor, setBadgeColor] = useState('from-emerald-500 to-teal-500');
  const [active, setActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMediaFile, setSelectedMediaFile] = useState<File | null>(null);

  // Gym Facility Photos state
  const [gymPhotos, setGymPhotos] = useState<GymPhoto[]>([]);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<GymPhoto | null>(null);
  const [photoTitle, setPhotoTitle] = useState('');
  const [photoCategory, setPhotoCategory] = useState('Free Weights');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoActive, setPhotoActive] = useState(true);
  const [isPhotoSubmitting, setIsPhotoSubmitting] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<GymPhoto | null>(null);
  const [selectedGymPhotoFile, setSelectedGymPhotoFile] = useState<File | null>(null);

  const showNotice = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Subscribe to real-time banners
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'promoBanners'),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PromoBanner));
        list.sort((a, b) => (a.order || 0) - (b.order || 0));
        setBanners(list);
      },
      (err) => console.warn('PromoBannerManager listener note:', err)
    );

    return () => unsub();
  }, []);

  // Subscribe to real-time gym photos
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'gymPhotos'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as GymPhoto));
          list.sort((a, b) => (a.order || 0) - (b.order || 0));
          setGymPhotos(list);
        } else {
          setGymPhotos(DEFAULT_GYM_PHOTOS);
        }
      },
      (err) => console.warn('Gym photos listener note:', err)
    );

    return () => unsub();
  }, []);

  const resetForm = () => {
    setTitle('');
    setSubtitle('');
    setTag('CHALLENGE');
    setMediaType('image');
    setMediaUrl('');
    setLinkType('plans');
    setLinkTarget('');
    setButtonText('Explore Now');
    setBadgeColor('from-emerald-500 to-teal-500');
    setActive(true);
    setEditingBanner(null);
  };

  const resetPhotoForm = () => {
    setPhotoTitle('');
    setPhotoCategory('Free Weights');
    setPhotoUrl('');
    setPhotoCaption('');
    setPhotoActive(true);
    setEditingPhoto(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: PromoBanner) => {
    setEditingBanner(b);
    setTitle(b.title || '');
    setSubtitle(b.subtitle || '');
    setTag(b.tag || 'CHALLENGE');
    setMediaType(b.mediaType || 'image');
    setMediaUrl(b.mediaUrl || '');
    setLinkType(b.linkType || 'plans');
    setLinkTarget(b.linkTarget || '');
    setButtonText(b.buttonText || 'Explore Now');
    setBadgeColor(b.badgeColor || 'from-emerald-500 to-teal-500');
    setActive(b.active !== false);
    setIsModalOpen(true);
  };

  const handleOpenAddPhoto = () => {
    resetPhotoForm();
    setIsPhotoModalOpen(true);
  };

  const handleOpenEditPhoto = (p: GymPhoto) => {
    setEditingPhoto(p);
    setPhotoTitle(p.title || '');
    setPhotoCategory(p.category || 'Free Weights');
    setPhotoUrl(p.photoUrl || '');
    setPhotoCaption(p.caption || '');
    setPhotoActive(p.active !== false);
    setIsPhotoModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedMediaFile(file);
    e.target.value = '';
  };

  const handleGymPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedGymPhotoFile(file);
    e.target.value = '';
  };

  const handleApplyPreset = (preset: typeof PRESET_BANNERS[0]) => {
    setTitle(preset.title);
    setSubtitle(preset.subtitle);
    setTag(preset.tag);
    setMediaType(preset.mediaType);
    setMediaUrl(preset.mediaUrl);
    setLinkType(preset.linkType);
    setButtonText(preset.buttonText);
    setBadgeColor(preset.badgeColor);
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !mediaUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const bannerId = editingBanner ? editingBanner.id : `banner_${Date.now()}`;
      const order = editingBanner ? editingBanner.order : banners.length + 1;

      // Persist dataUrl to server storage or optimize compression
      let safeMediaUrl = mediaUrl.trim();
      if (safeMediaUrl.startsWith('data:')) {
        safeMediaUrl = await uploadMediaOrDataUrl(safeMediaUrl, `${bannerId}.jpg`);
      }

      const payload: PromoBanner = {
        id: bannerId,
        title: title.trim(),
        subtitle: subtitle.trim(),
        tag: tag.trim().toUpperCase(),
        mediaType,
        mediaUrl: safeMediaUrl,
        linkType,
        linkTarget: linkTarget.trim(),
        buttonText: buttonText.trim() || 'Explore Now',
        badgeColor,
        active,
        order,
        createdAt: editingBanner?.createdAt || new Date().toISOString()
      };

      await setDoc(doc(db, 'promoBanners', bannerId), payload);
      setIsModalOpen(false);
      resetForm();
      showNotice(editingBanner ? 'Banner updated & synced to Client Home!' : 'New banner published to Client Home!');
    } catch (err: any) {
      console.error('Failed to save banner:', err);
      showNotice(`Failed to save banner: ${err.message || 'Please check attachment size'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoTitle.trim() || !photoUrl.trim()) return;

    setIsPhotoSubmitting(true);
    try {
      const photoId = editingPhoto ? editingPhoto.id : `photo_${Date.now()}`;
      const order = editingPhoto ? (editingPhoto.order || 1) : gymPhotos.length + 1;

      let safeUrl = photoUrl.trim();
      if (safeUrl.startsWith('data:')) {
        safeUrl = await uploadMediaOrDataUrl(safeUrl, `${photoId}.jpg`);
      }

      const payload: GymPhoto = {
        id: photoId,
        title: photoTitle.trim(),
        category: photoCategory.trim(),
        photoUrl: safeUrl,
        caption: photoCaption.trim(),
        order,
        active: photoActive,
        createdAt: editingPhoto?.createdAt || new Date().toISOString()
      };

      await setDoc(doc(db, 'gymPhotos', photoId), payload);
      setIsPhotoModalOpen(false);
      resetPhotoForm();
      showNotice(editingPhoto ? 'Facility photo updated!' : 'New gym photo published to Client Home!');
    } catch (err: any) {
      console.error('Failed to save gym photo:', err);
      showNotice(`Failed to save photo: ${err.message || 'Please check attachment size'}`);
    } finally {
      setIsPhotoSubmitting(false);
    }
  };

  const handleDeletePhoto = (photo: GymPhoto) => {
    setPhotoToDelete(photo);
  };

  const confirmDeletePhoto = async () => {
    if (!photoToDelete) return;
    try {
      await deleteDoc(doc(db, 'gymPhotos', photoToDelete.id));
      showNotice(`Photo "${photoToDelete.title}" removed.`);
    } catch (err: any) {
      showNotice('Error deleting photo: ' + err.message);
    } finally {
      setPhotoToDelete(null);
    }
  };

  const handleTogglePhotoActive = async (photo: GymPhoto) => {
    try {
      const next = photo.active === false ? true : false;
      await updateDoc(doc(db, 'gymPhotos', photo.id), { active: next });
      showNotice(next ? `"${photo.title}" is now visible on Client Home.` : `"${photo.title}" is now hidden.`);
    } catch (err: any) {
      showNotice('Error toggling photo visibility: ' + err.message);
    }
  };

  const handleDeleteBanner = (banner: PromoBanner) => {
    setBannerToDelete(banner);
  };

  const confirmDeleteBanner = async () => {
    if (!bannerToDelete) return;
    await deleteDoc(doc(db, 'promoBanners', bannerToDelete.id));
    showNotice(`Banner "${bannerToDelete.title}" removed from carousel.`);
    setBannerToDelete(null);
  };

  const handleToggleActive = async (banner: PromoBanner) => {
    try {
      const nextState = banner.active === false ? true : false;
      await updateDoc(doc(db, 'promoBanners', banner.id), {
        active: nextState
      });
      showNotice(nextState ? `"${banner.title}" is now Active on Client Home.` : `"${banner.title}" is now Hidden.`);
    } catch (err: any) {
      console.error('Failed to update status:', err);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= banners.length) return;

    const currentBanner = banners[index];
    const targetBanner = banners[targetIndex];

    try {
      await updateDoc(doc(db, 'promoBanners', currentBanner.id), {
        order: targetIndex + 1
      });
      await updateDoc(doc(db, 'promoBanners', targetBanner.id), {
        order: index + 1
      });
      showNotice('Slide order updated.');
    } catch (err: any) {
      console.warn('Reorder failed:', err);
    }
  };

  const handleResetToDefaults = async () => {
    try {
      for (let i = 0; i < DEFAULT_PROMO_BANNERS.length; i++) {
        const b = DEFAULT_PROMO_BANNERS[i];
        const id = `banner_seed_${i + 1}`;
        await setDoc(doc(db, 'promoBanners', id), { id, ...b, order: i + 1 });
      }
      showNotice('Default promotional banners restored & synced!');
    } catch (e: any) {
      console.error('Error re-seeding:', e);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      {/* Header Banner */}
      <div className="vision-surface rounded-3xl p-6 border border-white/90 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
            <ImageIcon className="w-4 h-4 text-indigo-600" />
            <span>Domain 06 • Client Home Media &amp; Photos Control</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tracking-tight">
            {activeMediaSection === 'banners' ? 'Home Promotional Media Carousel' : 'Gym Facility &amp; Floor Photos'}
          </h2>
          <p className="text-xs text-slate-600 max-w-2xl mt-1 leading-relaxed">
            {activeMediaSection === 'banners'
              ? 'Upload promotional banners, announcement images, or short video clips for the client home carousel with tags, links, and instant real-time sync.'
              : 'Upload and organize official photos of Torrent Fitness facility zones (Strength, Cardio, Aerobics Studio, Recovery) that sync directly to the Client App.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeMediaSection === 'banners' ? (
            <>
              <button
                type="button"
                onClick={() => setShowLivePreview(!showLivePreview)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-2xs ${
                  showLivePreview
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'vision-card text-slate-700 border-white/90'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{showLivePreview ? 'Hide Client Preview' : 'Show Client Preview'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetToDefaults}
                className="px-3.5 py-2 vision-card text-xs font-bold text-slate-700 hover:text-indigo-600 rounded-xl border border-white/90 transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Load Presets</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-4 py-2 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Upload / Create Banner</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleOpenAddPhoto}
              className="px-4 py-2 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Upload Gym Photo</span>
            </button>
          )}
        </div>
      </div>

      {/* Media Type Switcher: Carousel Banners vs Facility Photos */}
      <div className="grid grid-cols-2 gap-2 p-1.5 vision-surface rounded-2xl border border-white/85 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveMediaSection('banners')}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            activeMediaSection === 'banners'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Home Screen Banners ({banners.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMediaSection('photos')}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            activeMediaSection === 'photos'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>Gym Facility &amp; Floor Photos ({gymPhotos.length})</span>
        </button>
      </div>

      {statusMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center justify-between shadow-2xs animate-fade-in">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            {statusMessage}
          </span>
          <button onClick={() => setStatusMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. BANNERS VIEW */}
      {activeMediaSection === 'banners' && (
        <div className="space-y-6 animate-fade-in">

      {/* Live Client Home Carousel Preview */}
      {showLivePreview && (
        <div className="vision-surface rounded-3xl p-5 border border-white/90 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Live Client Home Screen Carousel Preview (Real-Time Sync)
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Showing {banners.filter(b => b.active !== false).length} active slides
            </span>
          </div>
          <div className="max-w-md mx-auto">
            <PromotionalCarousel onNavigateTab={() => {}} />
          </div>
        </div>
      )}

      {/* Banner Statistics & Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="vision-card p-4 rounded-2xl border border-white/90">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Slides</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{banners.length}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Configured in database</span>
        </div>
        <div className="vision-card p-4 rounded-2xl border border-white/90">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Active Live</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {banners.filter(b => b.active !== false).length}
          </span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Visible on Client Home</span>
        </div>
        <div className="vision-card p-4 rounded-2xl border border-white/90">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Video Slides</span>
          <span className="text-2xl font-black text-indigo-600 mt-1 block">
            {banners.filter(b => b.mediaType === 'video').length}
          </span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">HTML5 video media</span>
        </div>
        <div className="vision-card p-4 rounded-2xl border border-white/90">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Hidden / Inactive</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {banners.filter(b => b.active === false).length}
          </span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Paused from client view</span>
        </div>
      </div>

      {/* Banner List */}
      <div className="vision-surface rounded-3xl p-5 border border-white/90 shadow-md space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-black text-slate-900">Carousel Slide Ordering, Visibility & Media Controls</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Slide #1 appears first on Client Home
          </span>
        </div>

        {banners.length === 0 ? (
          <div className="p-8 vision-inset rounded-2xl text-center space-y-3">
            <ImageIcon className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No promotional banners yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Click "Upload / Create Banner" or "Load Presets" to populate the client home screen carousel.
            </p>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-sm"
            >
              Add First Banner
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {banners.map((b, index) => (
              <div
                key={b.id}
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  b.active !== false
                    ? 'vision-card border-white/90'
                    : 'bg-slate-100/75 border-dashed border-slate-300 opacity-75'
                }`}
              >
                {/* Left: Thumbnail & Details */}
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Media Thumbnail */}
                  <div className="relative w-24 h-16 sm:w-28 sm:h-18 rounded-xl overflow-hidden bg-slate-900 border border-white/80 shadow-sm shrink-0">
                    {b.mediaType === 'video' ? (
                      <div className="relative w-full h-full">
                        <video src={b.mediaUrl} className="w-full h-full object-cover" muted />
                        <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                          <Play className="w-4 h-4 fill-current" />
                        </span>
                      </div>
                    ) : (
                      <img
                        src={b.mediaUrl}
                        alt={b.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    )}
                    <span className="absolute bottom-1 right-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-black/75 text-white">
                      #{index + 1}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-white bg-gradient-to-r ${b.badgeColor || 'from-indigo-600 to-purple-600'}`}>
                        {b.tag || 'PROMO'}
                      </span>
                      <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate max-w-xs">
                        {b.title}
                      </h4>
                      {b.mediaType === 'video' && (
                        <span className="text-[10px] font-bold text-indigo-600">
                          · Video Clip
                        </span>
                      )}
                    </div>

                    {b.subtitle && (
                      <p className="text-xs text-slate-600 truncate max-w-md font-medium">
                        {b.subtitle}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>CTA: <strong className="text-slate-800">{b.buttonText || 'View Plans'}</strong></span>
                      <span>·</span>
                      <span>Target: <strong className="text-indigo-600 capitalize">{b.linkType || 'plans'}</strong></span>
                      <span>·</span>
                      <span>Status: <strong className={b.active !== false ? 'text-emerald-600' : 'text-amber-600'}>{b.active !== false ? 'Active (Shown)' : 'Inactive (Hidden)'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions (Reorder, Toggle, Edit, Delete) */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  {/* Reorder Up */}
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMoveOrder(index, 'up')}
                    title="Move slide up"
                    className="p-2 rounded-xl bg-white border border-slate-200/90 text-slate-600 hover:text-indigo-600 disabled:opacity-30 disabled:pointer-events-none shadow-2xs"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>

                  {/* Reorder Down */}
                  <button
                    type="button"
                    disabled={index === banners.length - 1}
                    onClick={() => handleMoveOrder(index, 'down')}
                    title="Move slide down"
                    className="p-2 rounded-xl bg-white border border-slate-200/90 text-slate-600 hover:text-indigo-600 disabled:opacity-30 disabled:pointer-events-none shadow-2xs"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>

                  {/* Explicit Show / Hide Toggle Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(b)}
                    title={b.active !== false ? 'Click to Hide from Client Home' : 'Click to Show on Client Home'}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-2xs ${
                      b.active !== false
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-200/80 text-slate-600 border-slate-300 hover:bg-slate-300/80'
                    }`}
                  >
                    {b.active !== false ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hidden</span>
                      </>
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(b)}
                    title="Edit banner details"
                    className="p-2 rounded-xl bg-white border border-slate-200/90 text-indigo-600 hover:bg-indigo-50 shadow-2xs"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDeleteBanner(b)}
                    title="Delete banner"
                    className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 shadow-2xs"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      )}

      {/* 2. PHOTOS VIEW */}
      {activeMediaSection === 'photos' && (
        <div className="space-y-5 animate-fade-in">
          {/* Facility Photos Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="vision-card p-4 rounded-2xl border border-white/90">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Photos</span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">{gymPhotos.length}</span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Floor and amenity gallery</span>
            </div>
            <div className="vision-card p-4 rounded-2xl border border-white/90">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Active Live</span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block">
                {gymPhotos.filter(p => p.active !== false).length}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Visible to clients</span>
            </div>
            <div className="vision-card p-4 rounded-2xl border border-white/90">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Categories</span>
              <span className="text-2xl font-black text-indigo-600 mt-1 block">
                {new Set(gymPhotos.map(p => p.category)).size}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Zones &amp; studios</span>
            </div>
            <div className="vision-card p-4 rounded-2xl border border-white/90">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Hidden</span>
              <span className="text-2xl font-black text-amber-600 mt-1 block">
                {gymPhotos.filter(p => p.active === false).length}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Draft / unlisted</span>
            </div>
          </div>

          {/* Photos Grid & Management */}
          <div className="vision-surface rounded-3xl p-5 border border-white/90 shadow-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">Gym Facility &amp; Floor Photos Gallery</h3>
              </div>
              <button
                type="button"
                onClick={handleOpenAddPhoto}
                className="px-3.5 py-1.5 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Upload Facility Photo</span>
              </button>
            </div>

            {gymPhotos.length === 0 ? (
              <div className="p-8 vision-inset rounded-2xl text-center space-y-3">
                <Camera className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No facility photos yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Upload photos of your weight room, cardio turf, studios, and recovery facilities to show them on the Client Home tab.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAddPhoto}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
                >
                  Upload First Photo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {gymPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="p-3 bg-white/95 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-slate-900 border border-slate-100">
                        <img
                          src={photo.photoUrl}
                          alt={photo.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-black/70 text-white backdrop-blur-xs">
                            {photo.category}
                          </span>
                        </div>
                        {photo.active === false && (
                          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                              Hidden from Clients
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-black text-slate-900 truncate">{photo.title}</h4>
                        {photo.caption && (
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{photo.caption}</p>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => handleTogglePhotoActive(photo)}
                        className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors ${
                          photo.active !== false
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title={photo.active !== false ? 'Currently Visible (Tap to Hide)' : 'Currently Hidden (Tap to Show)'}
                      >
                        {photo.active !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span className="text-[10px]">{photo.active !== false ? 'Live' : 'Hidden'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditPhoto(photo)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors"
                          title="Edit Photo Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
                          title="Delete Photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg vision-surface rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/90 text-slate-800 max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900">
                  {editingBanner ? 'Edit Promotional Banner' : 'Upload / Create Promotional Banner'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Presets Picker */}
            {!editingBanner && (
              <div className="p-3 bg-slate-50/90 border border-slate-200/80 rounded-2xl space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Quick High-Definition Templates
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_BANNERS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="p-2 bg-white border border-slate-200/90 rounded-xl text-left hover:border-indigo-500 transition-all text-xs shadow-2xs"
                    >
                      <span className="font-bold text-slate-900 block truncate">{preset.title}</span>
                      <span className="text-[10px] text-indigo-600 font-semibold block truncate">{preset.tag} · {preset.mediaType}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveBanner} className="space-y-3.5">
              {/* Title & Tag */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Banner Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Torrent 30-Day Summer Shred"
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 font-bold border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Badge Tag *</label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="e.g. CHALLENGE"
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-black uppercase shadow-2xs"
                  />
                </div>
              </div>

              {/* Quick Tag Selector Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 mr-1">Quick Tags:</span>
                {QUICK_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${
                      tag.toUpperCase() === t
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Subtitle */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Subtitle Description</label>
                <textarea
                  rows={2}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="e.g. Compete with gym members, log attendance streaks and win cash prizes."
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-800 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
              </div>

              {/* Media Type & Upload */}
              <div className="space-y-2 p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">Banner Image or Video Upload *</label>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setMediaType('image')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                        mediaType === 'image' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Image
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaType('video')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                        mediaType === 'video' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Video Clip
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder={
                      mediaType === 'video'
                        ? 'Paste video mp4 URL or click Upload ->'
                        : 'Paste banner image URL or click Upload ->'
                    }
                    className="flex-1 px-3 py-2 text-xs bg-white rounded-xl text-slate-800 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono shadow-2xs"
                  />

                  {/* File upload trigger */}
                  <label className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-bold text-white cursor-pointer flex items-center gap-1.5 shrink-0 shadow-sm transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload File</span>
                    <input
                      type="file"
                      accept={mediaType === 'video' ? 'video/mp4,video/webm' : 'image/*'}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Live Preview Box with Replace & Delete Photo Actions */}
                {mediaUrl && (
                  <div className="space-y-2 mt-2">
                    <div className="relative w-full h-40 rounded-2xl overflow-hidden bg-slate-900 border border-white/80 shadow-inner">
                      {mediaType === 'video' ? (
                        <video src={mediaUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent pointer-events-none" />
                      <div className="absolute top-2.5 left-3 pointer-events-none">
                        <span className={`text-[9px] font-black uppercase tracking-wider text-white px-2.5 py-0.5 rounded-full bg-gradient-to-r ${badgeColor}`}>
                          {tag || 'CHALLENGE'}
                        </span>
                      </div>
                      <div className="absolute bottom-2.5 left-3 right-3 text-white pointer-events-none">
                        <h4 className="text-sm font-black truncate">{title || 'Banner Preview Title'}</h4>
                        {subtitle && <p className="text-[11px] text-white/85 truncate">{subtitle}</p>}
                      </div>
                    </div>

                    {/* Photo Management Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <label className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Replace Attached {mediaType === 'video' ? 'Video' : 'Photo'}</span>
                        <input
                          type="file"
                          accept={mediaType === 'video' ? 'video/mp4,video/webm' : 'image/*'}
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setMediaUrl('');
                          showNotice('Attached media removed. You can upload a new photo or paste a URL.');
                        }}
                        className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors"
                        title="Remove attached photo from this banner"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete / Clear Photo</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Link Target & Button Label */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Target Action / Destination</label>
                  <select
                    value={linkType}
                    onChange={(e) => setLinkType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold shadow-2xs"
                  >
                    <option value="events">Events & Challenges</option>
                    <option value="plans">Membership Plans & Pricing</option>
                    <option value="workouts">Workout Exercise Library</option>
                    <option value="pt">Personal Trainer (My PT)</option>
                    <option value="analysis">Fitness Analysis & BMI</option>
                    <option value="custom">Custom Offer / External Link</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Call-to-Action Button Text</label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    placeholder="e.g. Join Challenge / View Plans"
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold shadow-2xs"
                  />
                </div>
              </div>

              {linkType === 'custom' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Custom Link or Offer Code</label>
                  <input
                    type="text"
                    value={linkTarget}
                    onChange={(e) => setLinkTarget(e.target.value)}
                    placeholder="e.g. https://... or promo offer target"
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-800 border border-slate-200/90 font-mono shadow-2xs"
                  />
                </div>
              )}

              {/* Badge Gradient Color & Active Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tag Badge Accent Color</label>
                  <select
                    value={badgeColor}
                    onChange={(e) => setBadgeColor(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-800 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold shadow-2xs"
                  >
                    <option value="from-emerald-500 to-teal-500">Emerald Jade (Challenge / Fitness)</option>
                    <option value="from-amber-500 to-orange-500">Amber Sunset (Offer / Deal)</option>
                    <option value="from-indigo-500 to-purple-500">Violet Aurora (Coaching / PT)</option>
                    <option value="from-sky-500 to-blue-600">Sky Aqua (Workouts)</option>
                    <option value="from-rose-500 to-pink-500">Coral Rose (Highlight)</option>
                  </select>
                </div>

                <div className="pt-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="banner-active"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <label htmlFor="banner-active" className="text-xs font-bold text-slate-800 cursor-pointer">
                    Active (Visible on Client Home)
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-between gap-2.5 border-t border-slate-200/80">
                {editingBanner ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBannerToDelete(editingBanner);
                      setIsModalOpen(false);
                    }}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-2xs"
                    title="Permanently remove this banner from carousel"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Banner</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : editingBanner ? 'Save Banner Changes' : 'Publish Banner'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Delete Confirmation Modal for Banner */}
      <GlobalDeleteConfirmModal
        isOpen={!!bannerToDelete}
        title="Delete Promotional Banner"
        itemName={bannerToDelete ? `${bannerToDelete.title} (${bannerToDelete.tag || 'PROMO'})` : ''}
        itemType="Carousel Banner"
        description="Are you sure you want to permanently delete this promotional slide from the Client Home Screen Carousel?"
        warningNote="The banner will be removed from the live client carousel immediately."
        confirmLabel="Yes, Delete Banner"
        onClose={() => setBannerToDelete(null)}
        onConfirm={confirmDeleteBanner}
      />

      {/* Facility Photo Add/Edit Modal */}
      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg vision-surface rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/90 text-slate-800 max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900">
                  {editingPhoto ? 'Edit Gym Facility Photo' : 'Upload Gym Facility Photo'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePhoto} className="space-y-3.5">
              {/* Photo Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Photo Title / Zone *</label>
                  <input
                    type="text"
                    required
                    value={photoTitle}
                    onChange={(e) => setPhotoTitle(e.target.value)}
                    placeholder="e.g. Olympic Free Weights Zone"
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 font-bold border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Facility Category *</label>
                  <select
                    value={photoCategory}
                    onChange={(e) => setPhotoCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold shadow-2xs"
                  >
                    <option value="Free Weights">Free Weights</option>
                    <option value="Strength & Resistance">Strength & Resistance</option>
                    <option value="Cardio Turf">Cardio Turf</option>
                    <option value="CrossFit & Functional">CrossFit & Functional</option>
                    <option value="Aerobics Studio">Aerobics Studio</option>
                    <option value="Recovery & Steam">Recovery & Steam</option>
                    <option value="Locker & Lounge">Locker & Lounge</option>
                    <option value="Gym Exterior & Reception">Gym Exterior & Reception</option>
                  </select>
                </div>
              </div>

              {/* Photo Upload & URL */}
              <div className="space-y-2 p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                <label className="text-xs font-bold text-slate-800">Photo Source (Image Upload or URL) *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="Paste image URL or click Upload ->"
                    className="flex-1 px-3 py-2 text-xs bg-white rounded-xl text-slate-800 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono shadow-2xs"
                  />
                  <label className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-bold text-white cursor-pointer flex items-center gap-1.5 shrink-0 shadow-sm transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleGymPhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Photo Preview */}
                {photoUrl && (
                  <div className="mt-2 space-y-2">
                    <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shadow-inner">
                      <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-black/75 text-white">
                          {photoCategory}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Replace Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleGymPhotoUpload}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setPhotoUrl('')}
                        className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear Photo</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Caption */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Caption / Description</label>
                <textarea
                  rows={2}
                  value={photoCaption}
                  onChange={(e) => setPhotoCaption(e.target.value)}
                  placeholder="e.g. Equipped with competition-grade dumbbells up to 60kg and power racks."
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-800 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="photo-active"
                  checked={photoActive}
                  onChange={(e) => setPhotoActive(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <label htmlFor="photo-active" className="text-xs font-bold text-slate-800 cursor-pointer">
                  Visible to Clients (Show in Client Home photo gallery)
                </label>
              </div>

              {/* Submit / Cancel Actions */}
              <div className="pt-3 flex items-center justify-between gap-2.5 border-t border-slate-200/80">
                {editingPhoto ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoToDelete(editingPhoto);
                      setIsPhotoModalOpen(false);
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Photo</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPhotoModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPhotoSubmitting || !photoUrl.trim() || !photoTitle.trim()}
                    className="px-5 py-2 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                  >
                    {isPhotoSubmitting ? 'Saving...' : editingPhoto ? 'Save Photo Changes' : 'Publish Photo'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Delete Confirmation Modal for Gym Photo */}
      <GlobalDeleteConfirmModal
        isOpen={!!photoToDelete}
        title="Delete Facility Photo"
        itemName={photoToDelete ? `${photoToDelete.title} (${photoToDelete.category})` : ''}
        itemType="Facility Photo"
        description="Are you sure you want to permanently delete this gym facility photo? It will be removed immediately from client view."
        warningNote="This action cannot be undone."
        confirmLabel="Yes, Delete Photo"
        onClose={() => setPhotoToDelete(null)}
        onConfirm={confirmDeletePhoto}
      />

      {/* Media Upload Adjuster Modal for Banners */}
      {selectedMediaFile && (
        <MediaUploadAdjustModal
          file={selectedMediaFile}
          defaultAspect="16:9"
          title="Adjust Carousel Media (Image Crop or Video Seeker)"
          onComplete={(res: MediaUploadResult) => {
            setMediaType(res.mediaType);
            setMediaUrl(res.mediaUrl);
            setSelectedMediaFile(null);
          }}
          onCancel={() => setSelectedMediaFile(null)}
        />
      )}

      {/* Media Upload Adjuster Modal for Gym Facility Photos */}
      {selectedGymPhotoFile && (
        <MediaUploadAdjustModal
          file={selectedGymPhotoFile}
          defaultAspect="16:9"
          title="Adjust Gym Facility Photo (Crop & Enhance)"
          onComplete={(res: MediaUploadResult) => {
            setPhotoUrl(res.mediaUrl);
            setSelectedGymPhotoFile(null);
          }}
          onCancel={() => setSelectedGymPhotoFile(null)}
        />
      )}
    </div>
  );
};
