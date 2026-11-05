import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { Announcement, AttendanceRecord } from '../../types';
import { INITIAL_ANNOUNCEMENTS } from '../../services/db';
import { getCachedData, setCachedData } from '../../services/cacheService';
import { closeAttendanceSession, isSessionExpired } from '../../services/attendanceService';
import { Header } from '../common/Header';
import { verifyAndActivateOnlinePayment } from '../../services/paymentService';
import { PromotionalCarousel } from './PromotionalCarousel';
import { GymPhotoGallery } from './GymPhotoGallery';
import { QRScannerModal } from '../common/QRScannerModal';
import { ViewSkeleton } from '../common/ViewSkeleton';

// Lazy-load secondary client screens so only the active screen executes its bundle & Firestore queries
const MembershipPlansView = lazy(() =>
  import('./MembershipPlansView').then((m) => ({ default: m.MembershipPlansView }))
);
const QrAttendanceView = lazy(() =>
  import('./QrAttendanceView').then((m) => ({ default: m.QrAttendanceView }))
);
const WorkoutLibraryView = lazy(() =>
  import('./WorkoutLibraryView').then((m) => ({ default: m.WorkoutLibraryView }))
);
const FitnessAnalysisView = lazy(() =>
  import('./FitnessAnalysisView').then((m) => ({ default: m.FitnessAnalysisView }))
);
const PtSectionView = lazy(() =>
  import('./PtSectionView').then((m) => ({ default: m.PtSectionView }))
);
const EventsChallengesView = lazy(() =>
  import('./EventsChallengesView').then((m) => ({ default: m.EventsChallengesView }))
);
const ClientProfileView = lazy(() =>
  import('./ClientProfileView').then((m) => ({ default: m.ClientProfileView }))
);
const ClientDietView = lazy(() =>
  import('./ClientDietView').then((m) => ({ default: m.ClientDietView }))
);

import {
  Home,
  Dumbbell,
  QrCode,
  UserCheck,
  Activity,
  Apple,
  Calendar,
  Bell,
  ChevronRight,
  Flame,
  Clock,
  CreditCard,
  Music,
  AlertTriangle,
  ShieldAlert,
  Phone,
  MapPin,
  Sparkles
} from 'lucide-react';

interface ClientAppProps {}

export const ClientApp: React.FC<ClientAppProps> = () => {
  const { currentUser, clientProfile } = useAuth();
  const isFemaleClient =
    currentUser?.role === 'client' &&
    (clientProfile?.gender || currentUser?.gender || '').trim().toLowerCase() === 'female';

  // Navigation state
  const [activeTab, setActiveTab] = useState<'home' | 'workouts' | 'diet' | 'qr' | 'pt' | 'analysis' | 'events' | 'plans' | 'profile'>('home');
  const [workoutInitialSubTab, setWorkoutInitialSubTab] = useState<'library' | 'myWorkout' | 'aerobics'>('library');

  // Scanner modal state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<AttendanceRecord | null>(null);
  const [attendanceSuccessToast, setAttendanceSuccessToast] = useState<string | null>(null);

  // PayU hosted callback return alert
  const [payuAlert, setPayuAlert] = useState<{ status: 'success' | 'error'; message: string } | null>(() => {
    try {
      if (typeof window !== 'undefined' && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const pStatus = params.get('payu_status');
        const pValid = params.get('payu_valid');
        if (pStatus) {
          window.history.replaceState({}, document.title, window.location.pathname);
          if (pStatus === 'success' && pValid === 'true') {
            return { status: 'success', message: 'PayU Payment Authorized! Your membership is active.' };
          } else {
            return { status: 'error', message: 'PayU payment was declined or cancelled. No charges were billed.' };
          }
        }
      }
    } catch {}
    return null;
  });

  // Automatically synchronize PayU callback return with database membership record
  useEffect(() => {
    try {
      const pendingStr = sessionStorage.getItem('tf_pending_payu_checkout');
      if (pendingStr && payuAlert?.status === 'success') {
        const p = JSON.parse(pendingStr);
        sessionStorage.removeItem('tf_pending_payu_checkout');
        verifyAndActivateOnlinePayment({
          clientId: p.clientId || currentUser?.uid || '',
          clientName: p.clientName || currentUser?.displayName || 'Member',
          clientPhone: p.clientPhone || '',
          clientEmail: p.clientEmail || '',
          purpose: p.purpose || 'membership',
          itemTitle: p.itemTitle || 'Fitness Membership',
          planId: p.planId || 'custom',
          planName: p.planName || p.itemTitle || 'Fitness Membership',
          durationMonths: p.durationMonths || 1,
          startDate: p.startDate,
          endDate: p.endDate,
          originalPrice: p.originalPrice || Number(p.amount) || 1,
          couponCode: p.couponCode || '',
          discountAmount: p.discountAmount || 0,
          discountPercent: p.discountPercent || 0,
          paidAmount: Number(p.amount) || 1,
          currency: 'INR',
          gatewayId: 'gw_payu_main',
          gatewayProvider: 'payu',
          gatewayName: 'PayU Hosted Gateway',
          paymentMethod: 'Official PayU Hosted Redirect',
          razorpayPaymentId: p.txnid,
          razorpayOrderId: p.txnid,
          ptIncluded: Boolean(p.ptIncluded),
          ptTrainerId: p.ptTrainerId || '',
          ptTrainerName: p.ptTrainerName || '',
          metadata: {
            ...(p.metadata || {}),
            gatewayProvider: 'payu',
            paymentEngine: 'payu_hosted_redirect'
          }
        }).catch((err) => console.warn('PayU post-redirect activation error:', err));
      }
    } catch (e) {
      console.warn('Could not read cached PayU transaction:', e);
    }
  }, [payuAlert, currentUser]);

  // Relative timestamp calculator for notifications and announcement feeds
  const getRelativeTime = (dateString?: string) => {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (isNaN(diffSec) || diffSec < 0) return 'Just now';
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Announcements hydrated from cache immediately
  const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
    getCachedData<Announcement[]>('announcements_client', INITIAL_ANNOUNCEMENTS)
  );
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);

  // Read Announcements Persistence (localStorage keyed by client ID)
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`tf_read_announcements_${currentUser?.uid || 'guest'}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Dismissed Urgent Banner IDs (allows dismissing the pinned banner while keeping in general feed)
  const [dismissedUrgentIds, setDismissedUrgentIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`tf_dismissed_urgent_${currentUser?.uid || 'guest'}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Strict Reverse-Chronological Ordering: Most recently published appears first
  const sortedAnnouncements = React.useMemo(() => {
    return [...announcements].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [announcements]);

  // Exact Unread Counter for Notification Bell
  const unreadAnnouncementsCount = React.useMemo(() => {
    return sortedAnnouncements.filter((a) => !readAnnouncementIds.includes(a.id)).length;
  }, [sortedAnnouncements, readAnnouncementIds]);

  // Active Pinned Urgent / Emergency Announcement
  const activeUrgentAnnouncement = React.useMemo(() => {
    return sortedAnnouncements.find(
      (a) => (a.priority === 'urgent' || (a as any).isUrgent) && !dismissedUrgentIds.includes(a.id)
    );
  }, [sortedAnnouncements, dismissedUrgentIds]);

  // Mark all announcements as seen/read (resets badge to 0 immediately)
  const markAllAnnouncementsRead = () => {
    const allIds = sortedAnnouncements.map((a) => a.id);
    setReadAnnouncementIds((prev) => {
      const combined = Array.from(new Set([...prev, ...allIds]));
      try {
        localStorage.setItem(
          `tf_read_announcements_${currentUser?.uid || 'guest'}`,
          JSON.stringify(combined)
        );
      } catch {}
      return combined;
    });
  };

  const handleDismissUrgent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedUrgentIds((prev) => {
      const updated = Array.from(new Set([...prev, id]));
      try {
        localStorage.setItem(
          `tf_dismissed_urgent_${currentUser?.uid || 'guest'}`,
          JSON.stringify(updated)
        );
      } catch {}
      return updated;
    });
  };

  const handleOpenAnnouncements = () => {
    setShowAnnouncementsModal(true);
    markAllAnnouncementsRead();
  };

  // Smart Membership Expiration Calculation
  const membershipAlertState = React.useMemo(() => {
    const endDateStr = clientProfile?.membershipEndDate || clientProfile?.membershipExpiryDate;
    const status = String(clientProfile?.membershipStatus || 'inactive').toLowerCase();

    if (!endDateStr || status !== 'active') {
      return {
        type: 'expired' as const,
        daysRemaining: 0
      };
    }

    const end = new Date(`${endDateStr}T23:59:59`);
    if (isNaN(end.getTime())) {
      return {
        type: 'expired' as const,
        daysRemaining: 0
      };
    }

    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return {
        type: 'expired' as const,
        daysRemaining: diffDays
      };
    }

    if (diffDays >= 1 && diffDays <= 5) {
      return {
        type: 'expiring_soon' as const,
        daysRemaining: diffDays
      };
    }

    // > 5 days remaining: completely clean home screen, no popup or warning
    return {
      type: 'active_clean' as const,
      daysRemaining: diffDays
    };
  }, [clientProfile?.membershipEndDate, clientProfile?.membershipExpiryDate, clientProfile?.membershipStatus]);

  useEffect(() => {
    // 1. Load recent Announcements (bounded by limit(15))
    const annQuery = query(collection(db, 'announcements'), limit(15));
    const unsubAnn = onSnapshot(
      annQuery,
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Announcement))
            .filter((a) => a.targetRole === 'all' || a.targetRole === 'clients');
          setAnnouncements(list);
          setCachedData('announcements_client', list);
        }
      },
      (err) => console.warn('Announcements listener note:', err)
    );

    // 2. Active Session Listener (bounded by limit(10) for current user)
    let unsubSession = () => {};
    if (currentUser?.uid) {
      const attQuery = query(
        collection(db, 'attendance'),
        where('clientId', '==', currentUser.uid),
        limit(10)
      );
      unsubSession = onSnapshot(
        attQuery,
        async (snap) => {
          const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
          const currentActive = records.find((r) => r.sessionStatus === 'active');
          if (currentActive) {
            if (isSessionExpired(currentActive)) {
              await closeAttendanceSession(currentActive);
              setActiveSession(null);
            } else {
              setActiveSession(currentActive);
            }
          } else {
            setActiveSession(null);
          }
        },
        (err) => console.warn('Active session listener note:', err)
      );
    }

    return () => {
      unsubAnn();
      unsubSession();
    };
  }, [currentUser?.uid]);

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden relative bg-[#EEF2F6] text-slate-800 selection:bg-indigo-500/20 selection:text-indigo-800">
      {/* Subtle Ambient Light Orbs */}
      <div className="ambient-orb w-80 h-80 bg-indigo-300/20 -top-10 -right-10 pointer-events-none" />
      <div className="ambient-orb w-72 h-72 bg-sky-300/15 bottom-24 -left-10 pointer-events-none" />

      {/* Top Application Header with Dynamic Unread Counter Badge (Strictly Pinned at Top) */}
      <Header
        onOpenNotifications={handleOpenAnnouncements}
        onOpenProfile={() => setActiveTab('profile')}
        isProfileActive={activeTab === 'profile'}
        activeAnnouncementCount={unreadAnnouncementsCount}
      />

      {/* Tier 2: Exclusive Scrollable Middle Content (Strictly between Header and Nav) */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-4 pb-36 relative z-10">
        {payuAlert && (
          <div
            className={`mb-3 p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 shadow-sm animate-fade-in ${
              payuAlert.status === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-rose-50 border-rose-300 text-rose-800'
            }`}
          >
            <span>{payuAlert.message}</span>
            <button
              type="button"
              onClick={() => setPayuAlert(null)}
              className="text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded-lg text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Sleek Pop-up Card for Attendance Marked */}
        {attendanceSuccessToast && (
          <div className="mb-3.5 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-emerald-500/10 border border-emerald-400/50 text-emerald-950 text-xs font-black shadow-md flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">💪</span>
              <div>
                <p className="font-black text-emerald-950 text-xs">{attendanceSuccessToast}</p>
                <p className="text-[10px] text-emerald-800 font-semibold mt-0.5">Live turnstile verified • Punched in history</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttendanceSuccessToast(null)}
              className="text-emerald-800 hover:text-black p-1 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab 1: HOME */}
        {activeTab === 'home' && (
          <div className="space-y-4 animate-fade-in">
            {/* SMART MEMBERSHIP NOTIFICATION LOGIC:
                - Active (> 5 days remaining): Render nothing (keep home screen completely clean)
                - Expiring Soon (1 to 5 days remaining): Sleek non-intrusive warning card at very top
                - Expired (<= 0 days remaining / date passed): Expiration notice prompting instant renewal */}
            {membershipAlertState.type === 'expiring_soon' && (
              <div
                onClick={() => setActiveTab('plans')}
                className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50/95 via-white/95 to-orange-50/90 border border-amber-300/90 shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:border-amber-400 active:scale-[0.99] transition-all"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-amber-950 leading-snug">
                      ⚠️ Your membership expires in {membershipAlertState.daysRemaining}{' '}
                      {membershipAlertState.daysRemaining === 1 ? 'day' : 'days'}. Tap here to renew and keep your gym access active.
                    </p>
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mt-0.5 block">
                      Valid Until: {clientProfile?.membershipEndDate} • Tap to Renew
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" />
              </div>
            )}

            {membershipAlertState.type === 'expired' && (
              <div
                onClick={() => setActiveTab('plans')}
                className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-50/95 via-white/95 to-amber-50/90 border border-rose-300/90 shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:border-rose-400 active:scale-[0.99] transition-all"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-rose-950 leading-snug">
                      {clientProfile?.offlineRequestStatus === 'pending'
                        ? '⏳ Offline Cash Request Pending Verification — Admin desk approval will activate your QR turnstile access.'
                        : '🔒 Membership Expired or Inactive — Tap here for instant renewal to regain QR turnstile access.'}
                    </p>
                    <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider mt-0.5 block">
                      {clientProfile?.membershipEndDate
                        ? `Expired on ${clientProfile.membershipEndDate} • Tap to Renew Now`
                        : 'No Active Plan • Tap to Activate Membership'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-rose-700 shrink-0" />
              </div>
            )}

            {/* User Greeting & Fast Membership Action */}
            <div className="flex items-center justify-between px-1">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  Hey, {clientProfile?.displayName || currentUser?.displayName}!
                </span>
                <h2 className="text-lg font-black tracking-tight text-slate-800">
                  Ready to Crush It Today?
                </h2>
              </div>
              <button
                onClick={() => setActiveTab('plans')}
                title="View Membership Plans"
                className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border transition-all ${
                  membershipAlertState.type === 'active_clean' || membershipAlertState.type === 'expiring_soon'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                }`}
              >
                {membershipAlertState.type === 'active_clean' || membershipAlertState.type === 'expiring_soon'
                  ? 'Active Member'
                  : 'Renew / Activate'}
              </button>
            </div>

            {/* Pinned Urgent / Emergency Announcement Alert Card (Apple VisionOS Alert Style) */}
            {activeUrgentAnnouncement && (
              <div
                onClick={() => {
                  handleOpenAnnouncements();
                }}
                className="p-4 rounded-3xl bg-gradient-to-r from-rose-500/15 via-red-500/10 to-amber-500/15 border-2 border-rose-500/60 shadow-lg shadow-rose-500/10 cursor-pointer relative overflow-hidden transition-all hover:border-rose-500 group animate-scale-up"
              >
                {/* Glowing Ambience */}
                <div className="absolute -top-10 -right-10 w-28 h-28 bg-rose-500/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-start justify-between gap-3 relative z-10">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-600 to-red-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-600/30">
                      <span className="text-lg">🚨</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-2xs">
                          CRITICAL ALERT
                        </span>
                        <span className="text-[10px] font-bold text-rose-700">
                          {getRelativeTime(activeUrgentAnnouncement.createdAt)}
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-slate-900 mt-1 leading-snug line-clamp-1">
                        {activeUrgentAnnouncement.title}
                      </h3>
                      <p className="text-xs text-slate-700 font-medium mt-1 line-clamp-2 leading-relaxed">
                        {activeUrgentAnnouncement.content}
                      </p>
                      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-black text-rose-600 group-hover:text-rose-700 transition-colors">
                        <span>Tap to Read Notice</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDismissUrgent(activeUrgentAnnouncement.id, e)}
                    title="Dismiss alert card"
                    className="p-1.5 text-slate-400 hover:text-slate-700 bg-white/80 hover:bg-white rounded-full transition-all shrink-0 cursor-pointer shadow-xs active:scale-95"
                  >
                    <span className="text-xs font-bold leading-none block px-1">✕</span>
                  </button>
                </div>
              </div>
            )}

            {/* Interactive E-Commerce Promotional Media Banner / Carousel */}
            <PromotionalCarousel onNavigateTab={(tab) => setActiveTab(tab)} />

            {/* Live Workout Session in Progress Banner on Home */}
            {activeSession && (
              <div className="p-4 bg-gradient-to-r from-emerald-950/80 via-teal-950/80 to-[#111827] border border-emerald-500/30 rounded-3xl text-white shadow-xl space-y-2.5 animate-scale-up relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Workout Session Active
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-semibold font-mono">
                    Entered: {activeSession.entryTime}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-slate-300 font-medium">
                    Need to leave early? Finish workout and log your attendance now.
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab('qr')}
                      className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors border border-white/10"
                    >
                      Timer
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await closeAttendanceSession(activeSession);
                        setActiveSession(null);
                      }}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center gap-1 active:scale-95"
                    >
                      <span>Close Session</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Gym Entry Hero Banner */}
            <div
              onClick={() => {
                if (activeSession && !isSessionExpired(activeSession)) {
                  setActiveTab('qr');
                } else {
                  setIsScannerOpen(true);
                }
              }}
              className="vision-card rounded-3xl p-4 border border-white/80 flex items-center justify-between cursor-pointer transition-all group active:scale-[0.99] shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform border ${
                    activeSession && !isSessionExpired(activeSession)
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-gradient-to-tr from-indigo-500 to-sky-400 text-white border-white/40 shadow-md'
                  }`}
                >
                  {activeSession && !isSessionExpired(activeSession) ? (
                    <Clock className="w-6 h-6" strokeWidth={1.75} />
                  ) : (
                    <QrCode className="w-6 h-6" strokeWidth={1.75} />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 tracking-tight">
                    {activeSession && !isSessionExpired(activeSession)
                      ? 'Workout Session In Progress'
                      : 'Scan Gym QR to Check In'}
                  </h3>
                  <p className="text-xs text-slate-600 font-medium">
                    {activeSession && !isSessionExpired(activeSession)
                      ? 'Scanning locked until session expires or closes. Tap for timer.'
                      : 'Contactless attendance & 2h workout session'}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full vision-inset text-indigo-600 flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </div>
            </div>

            {/* Latest Gym Announcements (Strict Reverse-Chronological Order) */}
            {sortedAnnouncements.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-indigo-600" strokeWidth={2} />
                    Latest Gym Announcements
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenAnnouncements}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>View All ({sortedAnnouncements.length})</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-2">
                  {sortedAnnouncements.slice(0, 2).map((ann) => {
                    const isUrgent = ann.priority === 'urgent' || (ann as any).isUrgent;
                    const isRead = readAnnouncementIds.includes(ann.id);

                    return (
                      <div
                        key={ann.id}
                        onClick={handleOpenAnnouncements}
                        className={`p-3.5 vision-card rounded-2xl border transition-all cursor-pointer hover:border-indigo-300 shadow-xs relative overflow-hidden ${
                          isUrgent
                            ? 'border-rose-300/90 bg-gradient-to-r from-rose-50/70 to-white'
                            : 'border-white/90 bg-white/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                                isUrgent
                                  ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                                  : ann.priority === 'high'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {isUrgent ? '🚨 URGENT' : ann.priority.toUpperCase()}
                            </span>
                            {!isRead && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Unread notice" />
                            )}
                            <h4 className="text-xs font-black text-slate-900 tracking-tight truncate max-w-[220px]">
                              {ann.title}
                            </h4>
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                            {getRelativeTime(ann.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {ann.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Female-Exclusive Aerobics Batches & Membership Card */}
            {isFemaleClient && (
              <div
                onClick={() => {
                  setWorkoutInitialSubTab('aerobics');
                  setActiveTab('workouts');
                }}
                className="p-4 rounded-3xl bg-gradient-to-r from-rose-50/95 via-white/95 to-fuchsia-50/90 border border-rose-200/80 flex items-center justify-between cursor-pointer transition-all group active:scale-[0.99] shadow-sm hover:border-rose-300"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-pink-500 text-white flex items-center justify-center group-hover:scale-105 transition-transform border border-white/60 shadow-md shadow-rose-500/20">
                    <Music className="w-6 h-6" strokeWidth={1.75} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 block">
                        Women&apos;s Exclusive Studio
                      </span>
                      {clientProfile?.aerobicsStatus === 'active' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-600 text-white">
                          AEROBICS ACTIVE
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      Aerobics Batches &amp; Membership
                    </h3>
                    <p className="text-xs text-slate-600 font-medium">
                      Morning &amp; Evening slots, capacity &amp; instant batch enrollment
                    </p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-rose-100/80 text-rose-700 flex items-center justify-center transition-colors">
                  <ChevronRight className="w-4 h-4" strokeWidth={2} />
                </div>
              </div>
            )}

            {/* Quick Action Hub */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => {
                  setWorkoutInitialSubTab('library');
                  setActiveTab('workouts');
                }}
                className="p-4 vision-card rounded-2xl border border-white/80 cursor-pointer hover:border-indigo-400/50 transition-all space-y-2 group shadow-sm"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Dumbbell className="w-5 h-5 -rotate-45" strokeWidth={1.75} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 tracking-tight">Workout Library</h4>
                  <p className="text-[11px] text-slate-600 font-medium">All muscle groups & form</p>
                </div>
              </div>

              <div
                onClick={() => setActiveTab('analysis')}
                className="p-4 vision-card rounded-2xl border border-white/80 cursor-pointer hover:border-indigo-400/50 transition-all space-y-2 group shadow-sm relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                    <Sparkles className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    AI Powered
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 tracking-tight">Fitness Analysis with AI</h4>
                  <p className="text-[11px] text-slate-600 font-medium">AI Visual Physique & Posture Scan</p>
                </div>
              </div>

              <div
                onClick={() => setActiveTab('pt')}
                className="p-4 vision-card rounded-2xl border border-white/80 cursor-pointer hover:border-indigo-400/50 transition-all space-y-2 group shadow-sm"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <UserCheck className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 tracking-tight">Personal Trainer (PT)</h4>
                  <p className="text-[11px] text-slate-600 font-medium">Custom diet & coach slots</p>
                </div>
              </div>

              <div
                onClick={() => setActiveTab('events')}
                className="p-4 vision-card rounded-2xl border border-white/80 cursor-pointer hover:border-indigo-400/50 transition-all space-y-2 group shadow-sm"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Calendar className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 tracking-tight">Events & Challenges</h4>
                  <p className="text-[11px] text-slate-600 font-medium">Competitions & streaks</p>
                </div>
              </div>

              {/* Card 5: Diet & Nutrition */}
              <div
                onClick={() => setActiveTab('diet')}
                className="col-span-2 p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 rounded-2xl border border-emerald-400/40 cursor-pointer hover:border-emerald-500 transition-all flex items-center justify-between group shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                    <Apple className="w-5 h-5" strokeWidth={1.9} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-black text-slate-900 tracking-tight">Diet &amp; Nutrition</h4>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Macro Plan
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium">Daily calories, water goal &amp; coach meals</p>
                  </div>
                </div>
                <div className="w-7 h-7 rounded-lg bg-white/80 text-emerald-700 flex items-center justify-center">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Official Gym Facility & Floor Photos Gallery (Real-Time Admin Sync) */}
            <GymPhotoGallery />
          </div>
        )}

        {/* On-Demand Lazy Loaded Inner Screens with Smooth Skeleton Transitions */}
        {activeTab !== 'home' && (
          <Suspense fallback={<ViewSkeleton cards={3} />}>
            {/* Tab 2: WORKOUTS */}
            {activeTab === 'workouts' && (
              <WorkoutLibraryView initialSubTab={workoutInitialSubTab} />
            )}

            {/* Tab 3: QR ATTENDANCE */}
            {activeTab === 'qr' && (
              <QrAttendanceView onOpenScanner={() => setIsScannerOpen(true)} />
            )}

            {/* Tab 4: PERSONAL TRAINER */}
            {activeTab === 'pt' && <PtSectionView />}

            {/* Tab: DIET & NUTRITION */}
            {activeTab === 'diet' && <ClientDietView onBack={() => setActiveTab('home')} />}

            {/* Tab 5: FITNESS ANALYSIS */}
            {activeTab === 'analysis' && (
              <FitnessAnalysisView
                onNavigateToPt={() => setActiveTab('pt')}
                onNavigateToPlans={() => setActiveTab('plans')}
              />
            )}

            {/* Tab 6: EVENTS & CHALLENGES */}
            {activeTab === 'events' && <EventsChallengesView />}

            {/* Tab 7: MEMBERSHIP PLANS */}
            {activeTab === 'plans' && (
              <MembershipPlansView onSuccessPurchase={() => setActiveTab('home')} />
            )}

            {/* Tab 8: PROFILE */}
            {activeTab === 'profile' && (
              <ClientProfileView onBack={() => setActiveTab('home')} />
            )}
          </Suspense>
        )}
      </main>

      {/* Tier 3: Fixed Bottom Navigation Dock: Anchored outside scroll view */}
      <nav className="shrink-0 z-40 w-full bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.06)] pb-[max(env(safe-area-inset-bottom,16px),10px)] pt-2">
        <div className="w-full h-16 grid grid-cols-5 items-center px-1">
          {/* 1. Home */}
          <button
            onClick={() => setActiveTab('home')}
            className={`w-full h-full flex flex-col items-center justify-center transition-colors ${
              activeTab === 'home' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-semibold'
            }`}
          >
            <Home className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[10px] mt-0.5 tracking-tight">Home</span>
          </button>

          {/* 2. Workouts */}
          <button
            onClick={() => setActiveTab('workouts')}
            className={`w-full h-full flex flex-col items-center justify-center transition-colors ${
              activeTab === 'workouts' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-semibold'
            }`}
          >
            <Dumbbell className="w-5 h-5 -rotate-45" strokeWidth={1.75} />
            <span className="text-[10px] mt-0.5 tracking-tight">Workouts</span>
          </button>

          {/* 3. Center Highlighted QR Scanner Button (Mathematically Centered) */}
          <div className="w-full h-full flex flex-col items-center justify-center relative">
            <button
              onClick={() => {
                if (activeSession && !isSessionExpired(activeSession)) {
                  setActiveTab('qr');
                } else {
                  setIsScannerOpen(true);
                }
              }}
              title={activeSession && !isSessionExpired(activeSession) ? 'Active Workout Session In Progress' : 'Scan Gym QR'}
              className={`w-13 h-13 -mt-6 rounded-full text-white flex items-center justify-center shadow-xl ring-4 ring-[#F8FAFC] active:scale-95 transition-all ${
                activeSession && !isSessionExpired(activeSession)
                  ? 'bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-emerald-500/40'
                  : 'vision-btn-aurora shadow-[0_8px_20px_rgba(99,102,241,0.35)]'
              }`}
            >
              {activeSession && !isSessionExpired(activeSession) ? (
                <Clock className="w-6 h-6" strokeWidth={1.75} />
              ) : (
                <QrCode className="w-6 h-6" strokeWidth={1.75} />
              )}
            </button>
            <span className={`text-[10px] mt-1 font-semibold ${activeTab === 'qr' ? 'text-indigo-600 font-bold' : 'text-slate-500'}`}>
              Scan QR
            </span>
          </div>

          {/* 4. My PT */}
          <button
            onClick={() => setActiveTab('pt')}
            className={`w-full h-full flex flex-col items-center justify-center transition-colors ${
              activeTab === 'pt' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-semibold'
            }`}
          >
            <UserCheck className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[10px] mt-0.5 tracking-tight">My PT</span>
          </button>

          {/* 5. Plans */}
          <button
            onClick={() => setActiveTab('plans')}
            className={`w-full h-full flex flex-col items-center justify-center transition-colors ${
              activeTab === 'plans' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-semibold'
            }`}
          >
            <CreditCard className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[10px] mt-0.5 tracking-tight">Plans</span>
          </button>
        </div>
      </nav>

      {/* QR Scanner Modal Triggered strictly from User Tap */}
      {currentUser && isScannerOpen && (
        <QRScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          clientId={currentUser.uid}
          clientName={currentUser.displayName}
          clientPhotoUrl={currentUser.photoUrl}
          onScanSuccess={(record) => {
            setAttendanceSuccessToast(
              `✅ Attendance Marked Successfully! Welcome, ${currentUser.displayName || 'Member'} 💪`
            );
            setActiveTab('qr');
            setTimeout(() => setAttendanceSuccessToast(null), 5500);
          }}
        />
      )}

      {/* Announcements Modal (Full Reverse-Chronological Feed) */}
      {showAnnouncementsModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAnnouncementsModal(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-fade-in"
        >
          <div className="w-full max-w-md vision-surface rounded-3xl p-5 shadow-2xl border border-white/90 text-slate-800 max-h-[85vh] flex flex-col space-y-3 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Bell className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">
                    Gym Announcements &amp; Broadcasts
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Reverse-chronological feed • All notices marked as read
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnnouncementsModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
                title="Close announcements"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 pr-0.5 max-h-[60vh] no-scrollbar">
              {sortedAnnouncements.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <Bell className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-600">No active announcements</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Check back later for gym events &amp; updates.</p>
                </div>
              ) : (
                sortedAnnouncements.map((ann) => {
                  const isUrgent = ann.priority === 'urgent' || (ann as any).isUrgent;
                  return (
                    <div
                      key={ann.id}
                      className={`p-4 rounded-2xl border transition-all text-xs space-y-1.5 shadow-2xs ${
                        isUrgent
                          ? 'bg-gradient-to-r from-rose-50/80 via-white to-red-50/50 border-rose-300 shadow-rose-500/5'
                          : 'bg-white/90 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                              isUrgent
                                ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                                : ann.priority === 'high'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}
                          >
                            {isUrgent ? '🚨 URGENT NOTICE' : ann.priority.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Audience: {ann.targetRole}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold font-mono">
                          {getRelativeTime(ann.createdAt)}
                        </span>
                      </div>

                      <h4 className="text-sm font-black text-slate-900 tracking-tight leading-snug">
                        {ann.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line font-medium">
                        {ann.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>{sortedAnnouncements.length} total notices broadcasted</span>
              <button
                type="button"
                onClick={() => setShowAnnouncementsModal(false)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

