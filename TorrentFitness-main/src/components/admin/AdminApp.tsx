import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePdfDownload } from '../../context/PdfDownloadContext';
import { copyToClipboard } from '../../utils/clipboard';
import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  limit,
  onSnapshot
} from 'firebase/firestore';
import {
  UserAccount,
  ClientProfile,
  TrainerProfile,
  MembershipPlan,
  MembershipRecord,
  PtRequest,
  AttendanceRecord,
  WorkoutPlan,
  GymEvent,
  GymChallenge,
  Announcement,
  PromotionalOffer,
  GymQrConfig,
  GymSettings,
  AerobicsBatch,
  PaymentTransaction
} from '../../types';
import {
  DEFAULT_MEMBERSHIP_PLANS,
  INITIAL_AEROBICS_BATCHES,
  INITIAL_TRAINERS,
  INITIAL_WORKOUTS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_EVENTS,
  INITIAL_CHALLENGES,
  INITIAL_OFFERS,
  INITIAL_GYM_CONFIG,
  INITIAL_SETTINGS
} from '../../services/db';
import { getCachedData, setCachedData } from '../../services/cacheService';
import { TrainerIdentityBadge } from '../common/Badge';
import { GymDeskQrDisplay } from '../common/GymDeskQrDisplay';
import { BirthdayAlertBanner } from '../common/BirthdayAlertBanner';
import { ClientDetailModal } from './ClientDetailModal';
import { DeleteAccountModal, DeleteAccountTarget } from './DeleteAccountModal';
import { GlobalDeleteConfirmModal } from '../common/GlobalDeleteConfirmModal';
import { ViewSkeleton } from '../common/ViewSkeleton';
import { GymLogo } from '../common/GymLogo';
import { playChatNotificationChime } from '../../services/chatService';

// Lazy-load heavy domain sub-managers on demand
const BillingPaymentsHub = lazy(() =>
  import('./BillingPaymentsHub').then((m) => ({ default: m.BillingPaymentsHub }))
);
const UnifiedMembershipManager = lazy(() =>
  import('./UnifiedMembershipManager').then((m) => ({ default: m.UnifiedMembershipManager }))
);
const PromoBannerManager = lazy(() =>
  import('./PromoBannerManager').then((m) => ({ default: m.PromoBannerManager }))
);
const WorkoutLibraryManager = lazy(() =>
  import('./WorkoutLibraryManager').then((m) => ({ default: m.WorkoutLibraryManager }))
);
const AerobicsAdminManager = lazy(() =>
  import('./AerobicsAdminManager').then((m) => ({ default: m.AerobicsAdminManager }))
);
const ClientAttendanceAnalytics = lazy(() =>
  import('./ClientAttendanceAnalytics').then((m) => ({ default: m.ClientAttendanceAnalytics }))
);
import {
  exportClientRecordsToPdf,
  exportAllMembersAttendancePdf,
  exportMultipleAttendancePdf
} from '../../services/pdfExportService';
import {
  Users,
  UserCheck,
  CreditCard,
  Target,
  QrCode,
  Dumbbell,
  Activity,
  Apple,
  Trophy,
  Calendar,
  Bell,
  Tag,
  Image,
  Shield,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Download,
  LogOut,
  Search,
  Key,
  Eye,
  EyeOff,
  Copy,
  User,
  X,
  FileText,
  ArrowLeft,
  ChevronRight,
  Filter,
  Clock,
  Wallet,
  Banknote,
  Upload,
  Layers,
  Calculator,
  Music,
  TrendingUp
} from 'lucide-react';
import { formatHeight, parseHeight } from '../../utils/heightUtils';

export type DomainId =
  | 'domain_01'
  | 'domain_02'
  | 'domain_03'
  | 'domain_04'
  | 'domain_05'
  | 'domain_06';

export interface DomainSubFeature {
  id: string;
  numberLabel: string;
  label: string;
  shortLabel: string;
  description: string;
  metricBadge: string;
  icon: any;
}

export interface CoreDomainConfig {
  id: DomainId;
  domainNumber: string;
  title: string;
  subtitle: string;
  tag: string;
  color: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  icon: any;
  metricValue: number | string;
  metricUnit: string;
  metricDetail: string;
  hasAlert?: boolean;
  description: string;
  primaryCta: string;
  subFeatures: DomainSubFeature[];
}

export const AdminApp: React.FC = () => {
  const { logout, updateAdminPassword } = useAuth();
  const { requestPdfDownload } = usePdfDownload();

  // Hierarchical Router State:
  // Level 1: selectedDomain === null && activeSubFeature === null (Main 6-Domain Grid)
  // Level 2: selectedDomain !== null && activeSubFeature === null (Domain Module Overview)
  // Level 3: selectedDomain !== null && activeSubFeature !== null (Specific Sub-Feature Tool)
  const [selectedDomain, setSelectedDomain] = useState<DomainId | null>(null);
  const [activeSubFeature, setActiveSubFeature] = useState<string | null>(null);

  // Cached + Real-time Firestore Data States (instant 0ms initial render)
  const [allUsers, setAllUsers] = useState<UserAccount[]>(() =>
    getCachedData<UserAccount[]>('admin_users', [])
  );
  const [clients, setClients] = useState<ClientProfile[]>(() =>
    getCachedData<ClientProfile[]>('admin_clients', [])
  );
  const [trainers, setTrainers] = useState<TrainerProfile[]>(() =>
    getCachedData<TrainerProfile[]>('admin_trainers', INITIAL_TRAINERS)
  );
  const [plans, setPlans] = useState<MembershipPlan[]>(() =>
    getCachedData<MembershipPlan[]>('membership_plans', DEFAULT_MEMBERSHIP_PLANS)
  );
  const [memberships, setMemberships] = useState<MembershipRecord[]>(() =>
    getCachedData<MembershipRecord[]>('admin_memberships', [])
  );
  const [ptRequests, setPtRequests] = useState<PtRequest[]>(() =>
    getCachedData<PtRequest[]>('admin_pt_requests', [])
  );
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() =>
    getCachedData<AttendanceRecord[]>('admin_attendance', [])
  );
  const [workouts, setWorkouts] = useState<WorkoutPlan[]>(() =>
    getCachedData<WorkoutPlan[]>('workouts_library', INITIAL_WORKOUTS)
  );
  const [challenges, setChallenges] = useState<GymChallenge[]>(() =>
    getCachedData<GymChallenge[]>('gym_challenges', INITIAL_CHALLENGES)
  );
  const [events, setEvents] = useState<GymEvent[]>(() =>
    getCachedData<GymEvent[]>('gym_events', INITIAL_EVENTS)
  );
  const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
    getCachedData<Announcement[]>('announcements_client', INITIAL_ANNOUNCEMENTS)
  );
  const [offers, setOffers] = useState<PromotionalOffer[]>(() =>
    getCachedData<PromotionalOffer[]>('admin_offers', INITIAL_OFFERS)
  );
  const [qrConfig, setQrConfig] = useState<GymQrConfig | null>(() =>
    getCachedData<GymQrConfig | null>('admin_qr_config', INITIAL_GYM_CONFIG)
  );
  const [gymSettings, setGymSettings] = useState<GymSettings | null>(() =>
    getCachedData<GymSettings | null>('admin_gym_settings', INITIAL_SETTINGS)
  );
  const [aerobicsBatches, setAerobicsBatches] = useState<AerobicsBatch[]>(() =>
    getCachedData<AerobicsBatch[]>('admin_aerobics_batches', INITIAL_AEROBICS_BATCHES)
  );
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>(() =>
    getCachedData<PaymentTransaction[]>('admin_payment_tx', [])
  );

  // Password management & Modals
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [selectedUserForPasswordChange, setSelectedUserForPasswordChange] = useState<{
    uid: string;
    displayName: string;
    role: string;
    currentPassword?: string;
  } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);

  // Master Admin Password Security Modal states
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [currentAdminPasswordInput, setCurrentAdminPasswordInput] = useState('');
  const [newAdminPasswordInput, setNewAdminPasswordInput] = useState('');
  const [confirmAdminPasswordInput, setConfirmAdminPasswordInput] = useState('');
  const [adminPasswordLoading, setAdminPasswordLoading] = useState(false);
  const [adminPasswordError, setAdminPasswordError] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const handleUpdateAdminPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPasswordError('');

    if (!currentAdminPasswordInput.trim()) {
      setAdminPasswordError('Current password is required.');
      return;
    }
    if (!newAdminPasswordInput.trim() || newAdminPasswordInput.length < 6) {
      setAdminPasswordError('New password must be at least 6 characters long.');
      return;
    }
    if (newAdminPasswordInput !== confirmAdminPasswordInput) {
      setAdminPasswordError('New Password and Confirm New Password do not match.');
      return;
    }
    if (newAdminPasswordInput === currentAdminPasswordInput) {
      setAdminPasswordError('New password must be different from current password.');
      return;
    }

    setAdminPasswordLoading(true);
    try {
      await updateAdminPassword(currentAdminPasswordInput, newAdminPasswordInput);
      showAdminNotice('Master Admin password updated successfully in database!', 'success');
      setShowAdminPasswordModal(false);
      setCurrentAdminPasswordInput('');
      setNewAdminPasswordInput('');
      setConfirmAdminPasswordInput('');
    } catch (err: any) {
      setAdminPasswordError(err.message || 'Failed to update admin password.');
    } finally {
      setAdminPasswordLoading(false);
    }
  };

  const [selectedUserForDetail, setSelectedUserForDetail] = useState<{
    user?: UserAccount;
    client?: ClientProfile;
    trainer?: TrainerProfile;
  } | null>(null);

  const [selectedClientForModal, setSelectedClientForModal] = useState<{
    client: ClientProfile;
    user: UserAccount | null;
    initialTab?: 'overview' | 'memberships';
  } | null>(null);

  const [deleteAccountTarget, setDeleteAccountTarget] = useState<DeleteAccountTarget | null>(null);
  const [adminToast, setAdminToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [globalDeletePending, setGlobalDeletePending] = useState<{
    title: string;
    itemName: string;
    itemType: string;
    description: string;
    warningNote?: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const showAdminNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setAdminToast({ type, text });
    setTimeout(() => setAdminToast(null), 4000);
  };

  // Domain 01 states
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilterTab, setClientFilterTab] = useState<'all' | 'active' | 'expired' | 'deleted'>('all');
  const [pdfExportScope, setPdfExportScope] = useState<'all' | 'active' | 'expired'>('all');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Domain 06 states (PT Allocation & 2-Tier Verification Queue)
  const [ptAssignClientId, setPtAssignClientId] = useState('');
  const [ptAssignTrainerId, setPtAssignTrainerId] = useState('');
  const [cashVerifyModalReq, setCashVerifyModalReq] = useState<PtRequest | null>(null);
  const [cashVerifyAmount, setCashVerifyAmount] = useState<number>(3500);
  const [cashVerifyDate, setCashVerifyDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [cashVerifyNotes, setCashVerifyNotes] = useState<string>('Cash received and verified at reception desk');
  const [cashVerifying, setCashVerifying] = useState<boolean>(false);
  const [ptAssigningReqId, setPtAssigningReqId] = useState<string | null>(null);
  const [ptFilterStatus, setPtFilterStatus] = useState<'all' | 'needs_action' | 'online_paid' | 'cash_pending' | 'active'>('all');

  // Domain 03 states (Manual Check-in & Attendance Inspector)
  const [manualCheckInClientId, setManualCheckInClientId] = useState('');
  const [selectedAttendanceClientId, setSelectedAttendanceClientId] = useState('');
  const [selectedAttendanceClientIds, setSelectedAttendanceClientIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('');
  const [isExportingBulkPdf, setIsExportingBulkPdf] = useState(false);

  // Domain 05 Sub-feature 4 states (Diet Prescriptions & Automated BMR/BMI Calculator)
  const [calcClientId, setCalcClientId] = useState('');
  const [calcWeight, setCalcWeight] = useState<number>(72);
  const [calcHeight, setCalcHeight] = useState<number>(175);
  const [calcAge, setCalcAge] = useState<number>(26);
  const [calcGender, setCalcGender] = useState<'male' | 'female'>('male');
  const [calcActivity, setCalcActivity] = useState<number>(1.55);
  const [calcGoal, setCalcGoal] = useState<'loss' | 'maintain' | 'gain'>('gain');
  const [dietMealPlanText, setDietMealPlanText] = useState('');
  const [dietNotesText, setDietNotesText] = useState('');
  const [dietSaving, setDietSaving] = useState(false);

  // Domain 06 states (Announcements, Events, Challenges)
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnContent, setNewAnnContent] = useState('');
  const [newAnnTarget, setNewAnnTarget] = useState<'all' | 'clients' | 'trainers'>('all');
  const [newAnnPriority, setNewAnnPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [editOpeningHours, setEditOpeningHours] = useState('');
  const [editGymAddress, setEditGymAddress] = useState('Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001');
  const [editGymPhone, setEditGymPhone] = useState('8208002585');

  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('2026-11-15');
  const [newEventTime, setNewEventTime] = useState('06:00 PM');
  const [newEventLocation, setNewEventLocation] = useState('Main Gym Floor');
  const [newEventReg, setNewEventReg] = useState(true);

  const [newChalTitle, setNewChalTitle] = useState('');
  const [newChalTarget, setNewChalTarget] = useState('100 Pull-ups in 30 Days');
  const [newChalDifficulty, setNewChalDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');

  // 1. Core Summary Listener (Clients, Recent Transactions & Real-time PT Requests)
  useEffect(() => {
    const unsubClients = onSnapshot(
      query(collection(db, 'clientProfiles'), limit(60)),
      (s) => {
        const list = s.docs.map((d) => ({ userId: d.id, ...d.data() } as ClientProfile));
        setClients(list);
        setCachedData('admin_clients', list);
      },
      (err) => console.warn('Admin clients listener note:', err)
    );

    const unsubPayTx = onSnapshot(
      query(collection(db, 'paymentTransactions'), limit(40)),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentTransaction));
        setPaymentTransactions(list);
        setCachedData('admin_payment_tx', list);
      },
      (err) => console.warn('Admin paymentTransactions listener note:', err)
    );

    let initialPtLoadDone = false;
    const unsubPt = onSnapshot(
      query(collection(db, 'ptRequests'), limit(50)),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as PtRequest));
        setPtRequests(list);
        setCachedData('admin_pt_requests', list);

        if (initialPtLoadDone) {
          s.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const req = change.doc.data() as PtRequest;
              if (req.status === 'pending' || req.status === 'needs_action' || req.paidStatus === 'paid') {
                playChatNotificationChime();
                showAdminNotice(
                  `🔔 New PT Booking Request received from ${req.clientName || 'Client'} (${req.planName || 'Personal Training'})!`,
                  'success'
                );
              }
            }
          });
        }
        initialPtLoadDone = true;
      },
      (err) => console.warn('Admin ptRequests listener note:', err)
    );

    return () => {
      unsubClients();
      unsubPayTx();
      unsubPt();
    };
  }, []);

  // 2. On-Demand Domain-Specific Listeners (Loaded ONLY when Admin navigates to that domain)
  useEffect(() => {
    if (!selectedDomain) return;

    const unsubs: Array<() => void> = [];

    if (selectedDomain === 'domain_01') {
      // Domain 01: Client Roster & Accounts
      unsubs.push(
        onSnapshot(
          query(collection(db, 'users'), limit(60)),
          (s) => {
            const list = s.docs.map((d) => ({ uid: d.id, ...d.data() } as UserAccount));
            setAllUsers(list);
            setCachedData('admin_users', list);
          },
          (err) => console.warn('Admin users listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'memberships'), limit(50)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as MembershipRecord));
            setMemberships(list);
            setCachedData('admin_memberships', list);
          },
          (err) => console.warn('Admin memberships listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'aerobicsBatches'), limit(20)),
          (s) => {
            if (!s.empty) {
              const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as AerobicsBatch));
              setAerobicsBatches(list);
              setCachedData('admin_aerobics_batches', list);
            }
          },
          (err) => console.warn('Admin aerobicsBatches listener note:', err)
        )
      );
    } else if (selectedDomain === 'domain_02') {
      // Domain 02: Billing, Plans & Financial Hub
      unsubs.push(
        onSnapshot(
          query(collection(db, 'membershipPlans'), limit(25)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as MembershipPlan));
            setPlans(list);
            setCachedData('membership_plans', list);
          },
          (err) => console.warn('Admin plans listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'memberships'), limit(50)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as MembershipRecord));
            setMemberships(list);
            setCachedData('admin_memberships', list);
          },
          (err) => console.warn('Admin memberships listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'offers'), limit(25)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as PromotionalOffer));
            setOffers(list);
            setCachedData('admin_offers', list);
          },
          (err) => console.warn('Admin offers listener note:', err)
        )
      );
    } else if (selectedDomain === 'domain_03') {
      // Domain 03: Attendance & Access Control - Real-time Dual Listener on attendance & attendance_logs
      const mergeAttendanceRecords = (newItems: AttendanceRecord[]) => {
        setAttendance((prev) => {
          const map = new Map<string, AttendanceRecord>();
          prev.forEach((item) => map.set(item.id, item));
          newItems.forEach((item) => {
            const existing = map.get(item.id);
            map.set(item.id, { ...existing, ...item });
          });
          const combined = Array.from(map.values());
          // Sort descending: newest check-in prepended instantly at the very top
          combined.sort((a, b) => {
            const timeA = new Date(a.timestamp || (a as any).date || a.createdAt || 0).getTime();
            const timeB = new Date(b.timestamp || (b as any).date || b.createdAt || 0).getTime();
            return timeB - timeA;
          });
          setCachedData('admin_attendance', combined);
          return combined;
        });
      };

      unsubs.push(
        onSnapshot(
          query(collection(db, 'attendance'), limit(50)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
            mergeAttendanceRecords(list);
          },
          (err) => console.warn('Admin attendance listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'attendance_logs'), limit(50)),
          (s) => {
            const list = s.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                clientId: data.clientId,
                clientName: data.clientName || data.memberName || 'Member',
                clientPhotoUrl: data.clientPhotoUrl || '',
                entryDate: data.date || data.entryDate,
                entryTime: data.time || data.checkInTime || data.entryTime,
                sessionStatus: data.sessionStatus || 'completed',
                timestamp: data.timestamp,
                createdAt: data.timestamp || data.createdAt,
                membershipPlan: data.membershipPlan || data.planName,
                badge: data.badge,
                isAerobicsMember: data.isAerobicsMember || data.isAerobics
              } as AttendanceRecord;
            });
            mergeAttendanceRecords(list);
          },
          (err) => console.warn('Admin attendance_logs listener note:', err)
        ),
        onSnapshot(
          doc(db, 'gymQrConfig', 'active-qr'),
          (s) => {
            if (s.exists()) {
              const cfg = s.data() as GymQrConfig;
              setQrConfig(cfg);
              setCachedData('admin_qr_config', cfg);
            }
          },
          (err) => console.warn('Admin qrConfig listener note:', err)
        )
      );
    } else if (selectedDomain === 'domain_04') {
      // Domain 04: Operations, Media & CMS Hub
      unsubs.push(
        onSnapshot(
          query(collection(db, 'announcements'), limit(25)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement));
            setAnnouncements(list);
            setCachedData('announcements_client', list);
          },
          (err) => console.warn('Admin announcements listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'events'), limit(25)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as GymEvent));
            setEvents(list);
            setCachedData('gym_events', list);
          },
          (err) => console.warn('Admin events listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'challenges'), limit(25)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as GymChallenge));
            setChallenges(list);
            setCachedData('gym_challenges', list);
          },
          (err) => console.warn('Admin challenges listener note:', err)
        ),
        onSnapshot(
          doc(db, 'gymSettings', 'active-config'),
          (s) => {
            if (s.exists()) {
              const data = s.data() as GymSettings;
              setGymSettings(data);
              setCachedData('admin_gym_settings', data);
              setEditOpeningHours(data.openingHours || '5:30 AM - 10:30 PM');
              setEditGymAddress(data.address || 'Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001');
              setEditGymPhone(data.contactPhone || '8208002585');
            }
          },
          (err) => console.warn('Admin gymSettings listener note:', err)
        )
      );
    } else if (selectedDomain === 'domain_05') {
      // Domain 05: Workouts, Aerobics & Diet Hub
      unsubs.push(
        onSnapshot(
          query(collection(db, 'workouts'), limit(30)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as WorkoutPlan));
            setWorkouts(list);
            setCachedData('workouts_library', list);
          },
          (err) => console.warn('Admin workouts listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'aerobicsBatches'), limit(20)),
          (s) => {
            if (!s.empty) {
              const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as AerobicsBatch));
              setAerobicsBatches(list);
              setCachedData('admin_aerobics_batches', list);
            }
          },
          (err) => console.warn('Admin aerobicsBatches listener note:', err)
        )
      );
    } else if (selectedDomain === 'domain_06') {
      // Domain 06: Trainers & Staff Hub
      unsubs.push(
        onSnapshot(
          query(collection(db, 'trainerProfiles'), limit(25)),
          (s) => {
            if (s.empty) {
              setTrainers(INITIAL_TRAINERS);
              return;
            }
            const loaded: TrainerProfile[] = s.docs.map((d) => {
              const raw = (d.data() || {}) as any;
              const seedMatch = INITIAL_TRAINERS.find((t) => t.trainerId === d.id);
              const resolvedStatus: TrainerProfile['status'] =
                raw.status === 'pending' ||
                raw.status === 'pending_verification' ||
                raw.isVerified === false
                  ? 'pending'
                  : raw.status === 'rejected'
                  ? 'rejected'
                  : raw.status || seedMatch?.status || 'active';

              const normalized: TrainerProfile = {
                trainerId: d.id,
                username: raw.username || d.id,
                displayName:
                  raw.displayName ||
                  raw.fullName ||
                  raw.name ||
                  seedMatch?.displayName ||
                  d.id,
                fullName:
                  raw.fullName ||
                  raw.displayName ||
                  seedMatch?.displayName ||
                  d.id,
                email: raw.email || '',
                phone: String(
                  d.id.includes('hitesh') || (raw.fullName || '').toLowerCase().includes('hitesh')
                    ? '8208002585'
                    : d.id.includes('bhavesh') || (raw.fullName || '').toLowerCase().includes('bhavesh')
                    ? '9607292842'
                    : raw.phone || raw.mobileNumber || '8208002585'
                ),
                photoUrl:
                  raw.photoUrl ||
                  seedMatch?.photoUrl ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                badge:
                  raw.badge ||
                  seedMatch?.badge ||
                  (d.id.includes('hitesh')
                    ? 'crown'
                    : d.id.includes('bhavesh')
                    ? 'shield'
                    : 'none'),
                dob: raw.dob || '1995-01-01',
                gender:
                  raw.gender ||
                  seedMatch?.gender ||
                  (d.id.includes('pooja') ? 'Female' : 'Male'),
                isOwner:
                  typeof raw.isOwner === 'boolean'
                    ? raw.isOwner
                    : Boolean(seedMatch?.isOwner || d.id.includes('hitesh')),
                isCoManager:
                  typeof raw.isCoManager === 'boolean'
                    ? raw.isCoManager
                    : Boolean(seedMatch?.isCoManager || d.id.includes('bhavesh')),
                isVerified: resolvedStatus === 'active',
                bio:
                  raw.bio ||
                  seedMatch?.bio ||
                  'Certified Trainer at Torrent Fitness',
                specializations:
                  raw.specializations ||
                  seedMatch?.specializations ||
                  'Strength & Conditioning',
                ptAvailable:
                  typeof raw.ptAvailable === 'boolean' ? raw.ptAvailable : true,
                status: resolvedStatus,
                rating: typeof raw.rating === 'number' ? raw.rating : 5.0,
                createdAt: raw.createdAt || new Date().toISOString()
              };

              return normalized;
            });
            setTrainers(loaded);
            setCachedData('admin_trainers', loaded);
          },
          (err) => console.warn('Admin trainers listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'ptRequests'), limit(30)),
          (s) => {
            const list = s.docs.map((d) => ({ id: d.id, ...d.data() } as PtRequest));
            setPtRequests(list);
            setCachedData('admin_pt_requests', list);
          },
          (err) => console.warn('Admin ptRequests listener note:', err)
        ),
        onSnapshot(
          query(collection(db, 'users'), limit(60)),
          (s) => {
            const list = s.docs.map((d) => ({ uid: d.id, ...d.data() } as UserAccount));
            setAllUsers(list);
            setCachedData('admin_users', list);
          },
          (err) => console.warn('Admin users listener note:', err)
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [selectedDomain]);

  const isQuickActionWorkspace =
    activeSubFeature === 'd2_revenue_dashboard' ||
    activeSubFeature === 'd2_offline_approvals' ||
    activeSubFeature === 'd1_roster';

  // Step-by-Step Back Navigation Handler:
  // Top Quick-Action Workspace -> Main Dashboard
  // Sub-feature -> Domain Module Overview -> Main 6-Domain Grid
  const handleStepBack = () => {
    if (isQuickActionWorkspace) {
      setSelectedDomain(null);
      setActiveSubFeature(null);
    } else if (activeSubFeature !== null) {
      setActiveSubFeature(null);
    } else if (selectedDomain !== null) {
      setSelectedDomain(null);
    }
  };

  // Navigate to a specific domain and optional sub-feature
  const handleNavigate = (domainId: DomainId, subFeatureId: string | null = null) => {
    setSelectedDomain(domainId);
    setActiveSubFeature(subFeatureId);
  };

  // Export Clients Master PDF
  const handleExportClientPdf = (scope: 'all' | 'active' | 'expired' = 'all') => {
    const scopeLabel =
      scope === 'active'
        ? 'Active Members Client Roster'
        : scope === 'expired'
        ? 'Expired Members Client Roster'
        : 'All Client Records Roster';

    requestPdfDownload({
      portalType: 'admin',
      documentName: scopeLabel,
      customTitle: 'Confirm PDF Download',
      customMessage: `Are you sure you want to download and export this ${scopeLabel} as a PDF?`,
      onConfirm: async () => {
        setIsExportingPdf(true);
        try {
          const targetClients =
            scope === 'active'
              ? clients.filter(c => c.membershipStatus === 'active' && !c.isSelfDeleted)
              : scope === 'expired'
              ? clients.filter(c => c.membershipStatus !== 'active' && !c.isSelfDeleted)
              : clients;

          await exportClientRecordsToPdf({
            clients: targetClients,
            users: allUsers,
            memberships,
            gymName: gymSettings?.gymName || 'Torrent Fitness'
          });
        } finally {
          setIsExportingPdf(false);
        }
      }
    });
  };

  // Admin Change Any User's Password
  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPasswordChange || !newPasswordInput.trim()) return;
    if (newPasswordInput.trim().length < 6) {
      showAdminNotice('Password must be at least 6 characters.', 'error');
      return;
    }
    setPasswordChangeLoading(true);
    try {
      const uid = selectedUserForPasswordChange.uid;
      const cleanPass = newPasswordInput.trim();

      await setDoc(doc(db, 'users', uid), { password: cleanPass }, { merge: true });
      if (selectedUserForPasswordChange.role === 'client') {
        try {
          await setDoc(doc(db, 'clientProfiles', uid), { password: cleanPass }, { merge: true });
        } catch (e) {}
      }
      if (selectedUserForPasswordChange.role === 'trainer') {
        try {
          await setDoc(doc(db, 'trainerProfiles', uid), { password: cleanPass }, { merge: true });
        } catch (e) {}
      }

      showAdminNotice(`Password for ${selectedUserForPasswordChange.displayName} (${uid}) updated to "${cleanPass}".`, 'success');
      setSelectedUserForPasswordChange(null);
      setNewPasswordInput('');
    } catch (err: any) {
      showAdminNotice('Error updating user password: ' + err.message, 'error');
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  // Trainer Approval & Role Updates
  const handleApproveTrainer = async (trainerId: string) => {
    try {
      await setDoc(
        doc(db, 'trainerProfiles', trainerId),
        { status: 'active', isVerified: true, verificationStatus: 'verified' },
        { merge: true }
      );
      await setDoc(
        doc(db, 'users', trainerId),
        { status: 'active', isVerified: true, verificationStatus: 'verified' },
        { merge: true }
      );
      showAdminNotice('Coach verified and activated!', 'success');
    } catch (err: any) {
      showAdminNotice('Approval error: ' + err.message, 'error');
    }
  };

  const handleRejectTrainer = async (trainerId: string) => {
    try {
      await setDoc(
        doc(db, 'trainerProfiles', trainerId),
        { status: 'rejected', isVerified: false, verificationStatus: 'rejected' },
        { merge: true }
      );
      await setDoc(
        doc(db, 'users', trainerId),
        { status: 'rejected', isVerified: false, verificationStatus: 'rejected' },
        { merge: true }
      );
      showAdminNotice('Trainer registration rejected.', 'success');
    } catch (err: any) {
      showAdminNotice('Rejection error: ' + err.message, 'error');
    }
  };

  const handleUpdateTrainerBadge = async (
    trainerId: string,
    roleSelection: 'owner' | 'manager' | 'trainer' | 'crown' | 'shield' | 'none'
  ) => {
    try {
      const normalizedBadge =
        roleSelection === 'owner' || roleSelection === 'crown'
          ? 'crown'
          : roleSelection === 'manager' || roleSelection === 'shield'
          ? 'shield'
          : 'none';
      await setDoc(
        doc(db, 'trainerProfiles', trainerId),
        {
          badge: normalizedBadge,
          isOwner: normalizedBadge === 'crown',
          isCoManager: normalizedBadge === 'shield'
        },
        { merge: true }
      );
      showAdminNotice('Staff privilege badge updated.', 'success');
    } catch (err: any) {
      showAdminNotice('Error updating role badge: ' + err.message, 'error');
    }
  };

  const handleToggleTrainerPtAvailability = async (trainer: TrainerProfile) => {
    try {
      await setDoc(
        doc(db, 'trainerProfiles', trainer.trainerId),
        {
          ptAvailable: !trainer.ptAvailable
        },
        { merge: true }
      );
    } catch (err: any) {
      showAdminNotice('Error updating availability: ' + err.message, 'error');
    }
  };

  // 1-on-1 PT Allocation Handler
  const handleAssignPtCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ptAssignClientId || !ptAssignTrainerId) return;
    const tr = trainers.find(t => t.trainerId === ptAssignTrainerId);
    if (!tr) return;

    try {
      await updateDoc(doc(db, 'clientProfiles', ptAssignClientId), {
        assignedTrainerId: tr.trainerId,
        assignedTrainerName: tr.displayName,
        ptStatus: 'active'
      });
      setPtAssignClientId('');
      showAdminNotice(`Assigned ${tr.displayName} as 1-on-1 PT coach!`, 'success');
    } catch (err: any) {
      showAdminNotice('Error assigning PT coach: ' + err.message, 'error');
    }
  };

  const handleRemovePtAssignment = (clientId: string) => {
    const cl = clients.find(c => c.userId === clientId);
    setGlobalDeletePending({
      title: 'Unassign 1-on-1 PT Coach',
      itemName: `${cl?.displayName || clientId} — PT Coach: ${cl?.assignedTrainerName || 'Assigned'}`,
      itemType: 'PT Assignment',
      description: 'Are you sure you want to remove this client’s 1-on-1 Personal Trainer assignment?',
      warningNote: 'The client will no longer see this coach as their assigned PT in the Client Portal.',
      confirmLabel: 'Yes, Unassign PT Coach',
      onConfirm: async () => {
        await updateDoc(doc(db, 'clientProfiles', clientId), {
          assignedTrainerId: '',
          assignedTrainerName: '',
          ptStatus: 'none'
        });
        showAdminNotice(`Removed PT assignment for ${cl?.displayName || clientId}.`, 'success');
      }
    });
  };

  const handleUpdatePtRequestStatus = async (req: PtRequest, status: 'accepted' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'ptRequests', req.id), { status, updatedAt: new Date().toISOString() });
      if (status === 'accepted') {
        await updateDoc(doc(db, 'clientProfiles', req.clientId), {
          assignedTrainerId: req.trainerId,
          assignedTrainerName: req.trainerName,
          ptStatus: 'active'
        });
      }
      showAdminNotice(`PT request ${status.toUpperCase()}!`, 'success');
    } catch (err: any) {
      showAdminNotice('Error updating PT request: ' + err.message, 'error');
    }
  };

  // Case A: 1-Click Online Payment Verification & Trainer Assignment
  const handleAssignTrainerOnlinePt = async (req: PtRequest) => {
    setPtAssigningReqId(req.id);
    try {
      await updateDoc(doc(db, 'ptRequests', req.id), {
        status: 'active',
        paidStatus: 'paid',
        paymentMode: req.paymentMode || 'online',
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await updateDoc(doc(db, 'clientProfiles', req.clientId), {
        assignedTrainerId: req.trainerId,
        assignedTrainerName: req.trainerName,
        ptStatus: 'active',
        ptStartDate: new Date().toISOString()
      });
      showAdminNotice(`Trainer ${req.trainerName} assigned & 1-on-1 PT activated for ${req.clientName || 'Client'}!`, 'success');
    } catch (err: any) {
      showAdminNotice('Error activating PT: ' + err.message, 'error');
    } finally {
      setPtAssigningReqId(null);
    }
  };

  // Case B: Offline Cash Verification Dialog Trigger
  const openCashVerifyModal = (req: PtRequest) => {
    setCashVerifyModalReq(req);
    setCashVerifyAmount(req.fee || 3500);
    setCashVerifyDate(new Date().toISOString().split('T')[0]);
    setCashVerifyNotes('Cash received and verified at reception desk');
  };

  // Case B: Confirm Cash & Assign Trainer
  const handleConfirmCashPtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashVerifyModalReq) return;
    setCashVerifying(true);
    try {
      const req = cashVerifyModalReq;
      const recAmount = Number(cashVerifyAmount) || req.fee || 3500;
      const recDate = cashVerifyDate || new Date().toISOString().split('T')[0];

      await updateDoc(doc(db, 'ptRequests', req.id), {
        status: 'active',
        paidStatus: 'paid',
        paymentMode: 'cash',
        cashReceivedAmount: recAmount,
        cashReceivedDate: recDate,
        cashNotes: cashVerifyNotes,
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await updateDoc(doc(db, 'clientProfiles', req.clientId), {
        assignedTrainerId: req.trainerId,
        assignedTrainerName: req.trainerName,
        ptStatus: 'active',
        ptStartDate: recDate
      });

      // Also update any matching pending offline payment transaction
      if (req.transactionId) {
        try {
          await updateDoc(doc(db, 'paymentTransactions', req.transactionId), {
            status: 'completed',
            paidStatus: 'paid',
            amountReceived: recAmount,
            paymentReceivedDate: recDate,
            approvedAt: new Date().toISOString(),
            approvedBy: 'Master Admin'
          });
        } catch {}
      }

      showAdminNotice(
        `Cash (₹${recAmount.toLocaleString('en-IN')}) verified & Coach ${req.trainerName} assigned to ${req.clientName}!`,
        'success'
      );
      setCashVerifyModalReq(null);
    } catch (err: any) {
      showAdminNotice('Error confirming cash PT: ' + err.message, 'error');
    } finally {
      setCashVerifying(false);
    }
  };

  // Helper: Check if a female member has an active Aerobics subscription
  const isAerobicsEnrolled = (clientId: string, rec?: AttendanceRecord): boolean => {
    if (rec?.isAerobicsMember) return true;
    const cl = clients.find(c => c.userId === clientId);
    const usr = allUsers.find(u => u.uid === clientId || u.username === clientId);
    const gender = (cl?.gender || usr?.gender || '').trim().toLowerCase();
    if (gender !== 'female') return false;
    if (cl?.aerobicsStatus === 'active') return true;
    return aerobicsBatches.some(
      b => b.active !== false && Array.isArray(b.enrolledClientIds) && b.enrolledClientIds.includes(clientId)
    );
  };

  // Domain 03: Manual Check-in & Force Check-out Handlers
  const handleManualDeskCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCheckInClientId) return;
    const cl = clients.find(c => c.userId === manualCheckInClientId);
    if (!cl) return;

    const now = new Date();
    const entryDate = now.toISOString().split('T')[0];
    const entryTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const recId = `att_manual_${Date.now()}`;
    const aeroActive = isAerobicsEnrolled(cl.userId);

    try {
      await setDoc(doc(db, 'attendance', recId), {
        id: recId,
        clientId: cl.userId,
        clientName: cl.displayName,
        entryDate,
        entryTime,
        sessionStatus: 'active',
        sessionDurationMinutes: 120,
        verificationMethod: 'Manual-Desk-Admin',
        ...(aeroActive ? { isAerobicsMember: true, aerobicsBatchName: cl.aerobicsBatchName || 'Aerobics Studio' } : {}),
        createdAt: now.toISOString()
      });
      setManualCheckInClientId('');
      showAdminNotice(`Manual check-in logged for ${cl.displayName}!`, 'success');
    } catch (err: any) {
      showAdminNotice('Error logging manual check-in: ' + err.message, 'error');
    }
  };

  const handleCheckoutActiveSession = async (rec: AttendanceRecord) => {
    const now = new Date();
    const exitTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    try {
      await updateDoc(doc(db, 'attendance', rec.id), {
        sessionStatus: 'completed',
        exitTime
      });
    } catch (err: any) {
      showAdminNotice('Error ending session: ' + err.message, 'error');
    }
  };

  // Domain 05 Sub-feature 4: Diet Prescription & BMR/BMI Save
  const handleSelectClientForDiet = (clientId: string) => {
    setCalcClientId(clientId);
    const cl = clients.find(c => c.userId === clientId);
    if (cl) {
      if (cl.weight) setCalcWeight(Number(cl.weight));
      if (cl.height) setCalcHeight(Number(cl.height));
      if (cl.age) setCalcAge(Number(cl.age));
      if (cl.gender === 'female') setCalcGender('female');
      else setCalcGender('male');
      setDietMealPlanText((cl as any).dietPlan || 'Meal 1 (8:00 AM): 4 Egg Whites + Oats\nMeal 2 (1:00 PM): Grilled Chicken / Paneer + Brown Rice\nPre-Workout (5:00 PM): Black Coffee + Banana\nDinner (8:30 PM): Lean Protein + Green Salad');
      setDietNotesText((cl as any).dietNotes || 'Drink 3.5L water daily. Prioritize 7-8 hours of sleep.');
    }
  };

  const handleSaveDietPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calcClientId) {
      showAdminNotice('Please select a client to assign this diet prescription.', 'error');
      return;
    }
    setDietSaving(true);
    try {
      const parsedH = parseHeight(calcHeight);
      const heightInches = parsedH.totalInches;
      const heightM = heightInches * 0.0254;
      const heightCm = Math.round(heightInches * 2.54);
      const bmiVal = Number((calcWeight / (heightM * heightM)).toFixed(1));
      const bmrVal = Math.round(
        calcGender === 'male'
          ? 10 * calcWeight + 6.25 * heightCm - 5 * calcAge + 5
          : 10 * calcWeight + 6.25 * heightCm - 5 * calcAge - 161
      );
      const tdeeVal = Math.round(bmrVal * calcActivity);
      const targetCalories =
        calcGoal === 'loss' ? tdeeVal - 450 : calcGoal === 'gain' ? tdeeVal + 350 : tdeeVal;

      await setDoc(
        doc(db, 'clientProfiles', calcClientId),
        {
          weight: calcWeight,
          height: calcHeight,
          age: calcAge,
          gender: calcGender,
          bmi: bmiVal,
          bmr: bmrVal,
          targetCalories,
          dietPlan: dietMealPlanText,
          dietNotes: dietNotesText,
          dietUpdatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      showAdminNotice('Diet Prescription & BMR/BMI Diagnostics synced to client profile!', 'success');
    } catch (err: any) {
      showAdminNotice('Error saving diet prescription: ' + err.message, 'error');
    } finally {
      setDietSaving(false);
    }
  };

  // Announcements, Events & Challenges Handlers
  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnTitle.trim() || !newAnnContent.trim()) return;
    try {
      const id = `ann_${Date.now()}`;
      await setDoc(doc(db, 'announcements', id), {
        id,
        title: newAnnTitle.trim(),
        content: newAnnContent.trim(),
        targetRole: newAnnTarget,
        priority: newAnnPriority,
        isUrgent: newAnnPriority === 'urgent',
        createdAt: new Date().toISOString()
      });
      setNewAnnTitle('');
      setNewAnnContent('');
      setNewAnnPriority('normal');
      showAdminNotice('Broadcast announcement published!', 'success');
    } catch (err: any) {
      showAdminNotice('Error publishing announcement: ' + err.message, 'error');
    }
  };

  const handleDeleteAnnouncement = (id: string) => {
    const ann = announcements.find(a => a.id === id);
    setGlobalDeletePending({
      title: 'Delete Broadcast Announcement',
      itemName: ann ? `${ann.title} (${ann.targetRole.toUpperCase()})` : id,
      itemType: 'Announcement',
      description: 'Are you sure you want to permanently delete this broadcast announcement?',
      warningNote: 'This notice will be immediately removed from the Client and Trainer portals.',
      confirmLabel: 'Yes, Delete Announcement',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'announcements', id));
        showAdminNotice('Announcement deleted.', 'success');
      }
    });
  };

  const handleSaveOpeningHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOpeningHours.trim()) return;
    try {
      await setDoc(
        doc(db, 'gymSettings', 'active-config'),
        {
          openingHours: editOpeningHours.trim(),
          address: editGymAddress.trim() || 'Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001',
          contactPhone: editGymPhone.trim() || '8208002585'
        },
        { merge: true }
      );
      showAdminNotice('Facility operating hours, gym address & official contact phone updated!', 'success');
    } catch (err: any) {
      showAdminNotice('Error updating gym settings: ' + err.message, 'error');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle) return;
    try {
      const id = `evt_${Date.now()}`;
      await setDoc(doc(db, 'events', id), {
        id,
        title: newEventTitle,
        description: 'Official Torrent Fitness workshop & community event.',
        eventDate: newEventDate,
        eventTime: newEventTime,
        location: newEventLocation || 'Torrent Arena Studio',
        registrationEnabled: newEventReg,
        registeredCount: 0,
        createdAt: new Date().toISOString()
      });
      setNewEventTitle('');
      showAdminNotice('Gym event scheduled and published!', 'success');
    } catch (err: any) {
      showAdminNotice('Error creating event: ' + err.message, 'error');
    }
  };

  const handleToggleEventRegistration = async (ev: GymEvent) => {
    try {
      await updateDoc(doc(db, 'events', ev.id), {
        registrationEnabled: !ev.registrationEnabled
      });
    } catch (err: any) {
      showAdminNotice('Error toggling event status: ' + err.message, 'error');
    }
  };

  const handleDeleteEvent = (id: string) => {
    const ev = events.find(e => e.id === id);
    setGlobalDeletePending({
      title: 'Delete Gym Event / Workshop',
      itemName: ev ? `${ev.title} (${ev.eventDate})` : id,
      itemType: 'Gym Event',
      description: 'Are you sure you want to permanently delete this scheduled event or workshop?',
      warningNote: 'Members will no longer be able to view or RSVP to this event.',
      confirmLabel: 'Yes, Delete Event',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'events', id));
        showAdminNotice('Gym event deleted.', 'success');
      }
    });
  };

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChalTitle) return;
    try {
      const id = `chal_${Date.now()}`;
      await setDoc(doc(db, 'challenges', id), {
        id,
        title: newChalTitle,
        description: `Complete ${newChalTarget} to earn the Torrent Fitness Finisher badge.`,
        target: newChalTarget,
        difficulty: newChalDifficulty,
        durationDays: 30,
        participantsCount: 1,
        active: true,
        createdAt: new Date().toISOString()
      });
      setNewChalTitle('');
      showAdminNotice('Gym challenge launched!', 'success');
    } catch (err: any) {
      showAdminNotice('Error creating challenge: ' + err.message, 'error');
    }
  };

  const handleDeleteChallenge = (id: string) => {
    const ch = challenges.find(c => c.id === id);
    setGlobalDeletePending({
      title: 'Delete Gym Challenge',
      itemName: ch ? `${ch.title} (${ch.target})` : id,
      itemType: 'Fitness Challenge',
      description: 'Are you sure you want to permanently delete this fitness challenge?',
      warningNote: 'The challenge and its active leaderboard card will be removed from the Client Portal.',
      confirmLabel: 'Yes, Delete Challenge',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'challenges', id));
        showAdminNotice('Challenge deleted.', 'success');
      }
    });
  };

  // ============================================================================
  // STRICT 6 CORE DOMAINS DEFINITION (100% RESPONSIBILITY SEPARATION)
  // ============================================================================
  // Combine trainerProfiles with any trainer accounts in users collection for 100% completeness
  const safeTrainers: TrainerProfile[] = React.useMemo(() => {
    const map = new Map<string, TrainerProfile>();
    (trainers || []).forEach((tr) => {
      if (!tr || !tr.trainerId) return;
      const trUser = allUsers.find((u) => u.uid === tr.trainerId || u.username === tr.trainerId);
      const isPending =
        tr.status === 'pending' ||
        tr.status === 'pending_verification' ||
        tr.isVerified === false ||
        trUser?.status === 'pending' ||
        trUser?.status === 'pending_verification';
      map.set(tr.trainerId, {
        ...tr,
        trainerId: String(tr.trainerId),
        displayName: String(
          tr.displayName || tr.fullName || trUser?.displayName || trUser?.fullName || tr.trainerId
        ),
        phone: String(
          tr.trainerId?.includes('hitesh')
            ? '8208002585'
            : tr.trainerId?.includes('bhavesh')
            ? '9607292842'
            : tr.phone || tr.mobileNumber || trUser?.phone || '8208002585'
        ),
        photoUrl:
          tr.photoUrl ||
          trUser?.photoUrl ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        badge: tr.badge || 'none',
        gender: tr.gender || trUser?.gender || 'Male',
        specializations: String(tr.specializations || 'Strength & Conditioning'),
        bio: String(tr.bio || 'Certified Trainer at Torrent Fitness'),
        ptAvailable: typeof tr.ptAvailable === 'boolean' ? tr.ptAvailable : true,
        status: isPending ? 'pending' : tr.status === 'rejected' ? 'rejected' : 'active',
        rating: typeof tr.rating === 'number' ? tr.rating : 5.0,
        createdAt: tr.createdAt || trUser?.createdAt || new Date().toISOString()
      });
    });

    // Also include any user with role === 'trainer' who might not yet be in trainerProfiles
    (allUsers || [])
      .filter((u) => u && u.role === 'trainer' && u.uid && !map.has(u.uid))
      .forEach((u) => {
        const isPending =
          u.status === 'pending' || u.status === 'pending_verification' || u.isVerified === false;
        map.set(u.uid, {
          trainerId: u.uid,
          username: u.username || u.uid,
          displayName: String(u.displayName || u.fullName || u.uid),
          fullName: String(u.fullName || u.displayName || u.uid),
          email: u.email || '',
          phone: String(
            u.uid.includes('hitesh')
              ? '8208002585'
              : u.uid.includes('bhavesh')
              ? '9607292842'
              : u.phone || u.mobileNumber || '8208002585'
          ),
          photoUrl:
            u.photoUrl ||
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
          badge: 'none',
          dob: u.dob || '1995-01-01',
          gender: u.gender || 'Male',
          bio: 'Certified Trainer at Torrent Fitness',
          specializations: 'Strength & Conditioning',
          ptAvailable: true,
          status: isPending ? 'pending' : u.status === 'rejected' ? 'rejected' : 'active',
          rating: 5.0,
          createdAt: u.createdAt || new Date().toISOString()
        });
      });

    return Array.from(map.values());
  }, [trainers, allUsers]);

  const activeClientsCount = React.useMemo(() => clients.filter(c => c.membershipStatus === 'active' && !c.isSelfDeleted).length, [clients]);
  const expiredClientsCount = React.useMemo(() => clients.filter(c => c.membershipStatus !== 'active' && !c.isSelfDeleted).length, [clients]);
  const selfDeletedClientsCount = React.useMemo(() => clients.filter(c => c.isSelfDeleted).length, [clients]);
  const activeTrainersCount = React.useMemo(() => safeTrainers.filter(t => t.status === 'active').length, [safeTrainers]);
  const pendingTrainersCount = React.useMemo(() => safeTrainers.filter(t => t.status === 'pending' || t.status === 'pending_verification').length, [safeTrainers]);
  const activeSessionsCount = React.useMemo(() => attendance.filter(a => a.sessionStatus === 'active').length, [attendance]);
  const todayCheckInsCount = React.useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return attendance.filter(a => a.entryDate === today).length;
  }, [attendance]);

  // Domain 02 & Top Quick-Action Bar Real-time Financial Metrics
  // Domain 02 & Top Quick-Action Bar Real-time Financial Metrics (Strictly Real Transactions Baseline)
  const settledPaymentsRevenue = React.useMemo(() => {
    let total = 0;
    paymentTransactions.forEach((tx) => {
      if (tx.status === 'success' && !tx.isTest) {
        total += tx.finalAmount ?? tx.amount ?? 0;
      }
    });
    return total;
  }, [paymentTransactions]);

  const currentMonthRevenue = React.useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    let monthTotal = 0;

    paymentTransactions.forEach((tx) => {
      if (tx.status === 'success' && !tx.isTest) {
        const dt = new Date(tx.createdAt || '');
        if (!isNaN(dt.getTime()) && dt.getFullYear() === curYear && dt.getMonth() === curMonth) {
          monthTotal += tx.finalAmount ?? tx.amount ?? 0;
        }
      }
    });

    return monthTotal;
  }, [paymentTransactions]);

  const pendingOfflineApprovalsCount = React.useMemo(() => paymentTransactions.filter(
    (t) =>
      (t.paymentMode === 'cash' || t.gatewayProvider === 'offline_cash') &&
      t.status === 'pending'
  ).length, [paymentTransactions]);

  const pendingPtRequestsCount = React.useMemo(() => ptRequests.filter(
    (r) =>
      r.status === 'pending' ||
      r.status === 'needs_action' ||
      (r.paymentMode === 'cash' && r.paidStatus !== 'paid')
  ).length, [ptRequests]);

  const totalLedgerRecordsCount = React.useMemo(() => {
    const seenMemIds = new Set<string>();
    paymentTransactions.forEach((tx) => {
      if (tx.membershipId) seenMemIds.add(tx.membershipId);
    });
    const extraMems = memberships.filter((m) => !seenMemIds.has(m.id)).length;
    return paymentTransactions.length + extraMems;
  }, [paymentTransactions, memberships]);

  const coreDomains: CoreDomainConfig[] = React.useMemo(() => [
    {
      id: 'domain_01',
      domainNumber: 'DOMAIN 01',
      title: 'Client Roster & Accounts',
      subtitle: 'User Management & Aerobics',
      tag: 'User Management',
      color: 'from-sky-500 to-indigo-600',
      accentBg: 'bg-sky-50',
      accentText: 'text-sky-700',
      accentBorder: 'border-sky-200',
      icon: Users,
      metricValue: clients.length,
      metricUnit: 'Member Accounts',
      metricDetail: `${activeClientsCount} Active • ${aerobicsBatches.filter(b => b.active !== false).length} Batches`,
      description: '',
      primaryCta: 'Open Client Accounts',
      subFeatures: [
        {
          id: 'd1_credentials',
          numberLabel: '1.1',
          label: 'Member Account Credentials & Passwords',
          shortLabel: 'Member Account Credentials & Passwords',
          description: '',
          metricBadge: `${clients.length} Accounts`,
          icon: Key
        },
        {
          id: 'd1_filters',
          numberLabel: '1.2',
          label: 'Client Status Filters & Export PDF',
          shortLabel: 'Client Status Filters & Export PDF',
          description: '',
          metricBadge: 'Filters & PDF',
          icon: Filter
        },
        {
          id: 'd1_aerobics_management',
          numberLabel: '1.3',
          label: 'Aerobics Batches & Pricing',
          shortLabel: 'Aerobics Batches & Pricing',
          description: '',
          metricBadge: 'Women Exclusive',
          icon: Music
        }
      ]
    },
    {
      id: 'domain_02',
      domainNumber: 'DOMAIN 02',
      title: 'Financials & Plans Hub',
      subtitle: 'Ledger, Plans, Coupons & Gateways',
      tag: 'Financials & Plans Hub',
      color: 'from-emerald-500 to-teal-600',
      accentBg: 'bg-emerald-50',
      accentText: 'text-emerald-700',
      accentBorder: 'border-emerald-200',
      icon: Wallet,
      metricValue: `${plans.filter(p => p.active !== false).length} Tiers`,
      metricUnit: 'Active Catalog',
      metricDetail: `${offers.filter(o => o.active).length} Coupons • ${totalLedgerRecordsCount} Records`,
      hasAlert: false,
      description: '',
      primaryCta: 'Open Financials & Plans Hub',
      subFeatures: [
        {
          id: 'd2_transaction_ledger',
          numberLabel: '2.1',
          label: 'Transaction Ledger & PDF Export Suite',
          shortLabel: 'Transaction Ledger & PDF Export Suite',
          description: '',
          metricBadge: `${totalLedgerRecordsCount} Records`,
          icon: FileText
        },
        {
          id: 'd2_plans_catalog',
          numberLabel: '2.2',
          label: 'Membership Plans Catalog',
          shortLabel: 'Membership Plans Catalog',
          description: '',
          metricBadge: `${plans.filter(p => p.active !== false).length} Active Tiers`,
          icon: CreditCard
        },
        {
          id: 'd2_promos_coupons',
          numberLabel: '2.3',
          label: 'Discount Rules & Promo Coupons',
          shortLabel: 'Discount Rules & Promo Coupons',
          description: '',
          metricBadge: `${offers.filter(o => o.active).length} Active Promos`,
          icon: Tag
        },
        {
          id: 'd2_payment_gateways',
          numberLabel: '2.4',
          label: 'Universal Payment Gateway Settings',
          shortLabel: 'Universal Payment Gateway Settings',
          description: '',
          metricBadge: 'API & Keys',
          icon: CreditCard
        },
        {
          id: 'd2_pt_plans',
          numberLabel: '2.5',
          label: 'Personal Training (PT) Plans & Pricing',
          shortLabel: 'PT Plans & Pricing',
          description: '',
          metricBadge: 'PT Packages',
          icon: UserCheck
        }
      ]
    },
    {
      id: 'domain_03',
      domainNumber: 'DOMAIN 03',
      title: 'Attendance & Access Control',
      subtitle: 'Turnstile & Security',
      tag: 'Turnstile & Security',
      color: 'from-purple-500 to-indigo-600',
      accentBg: 'bg-purple-50',
      accentText: 'text-purple-700',
      accentBorder: 'border-purple-200',
      icon: QrCode,
      metricValue: todayCheckInsCount,
      metricUnit: "Today's Check-ins",
      metricDetail: `${activeSessionsCount} Active Floor Sessions`,
      description: '',
      primaryCta: 'Open Attendance Hub',
      subFeatures: [
        {
          id: 'd3_qr_standee',
          numberLabel: '3.1',
          label: 'Live Reception QR Standee',
          shortLabel: 'Live Reception QR Standee',
          description: '',
          metricBadge: qrConfig?.active ? 'QR Live' : 'Standby',
          icon: QrCode
        },
        {
          id: 'd3_floor_sessions',
          numberLabel: '3.2',
          label: 'Active Floor Sessions (2h Lockout)',
          shortLabel: 'Active Floor Sessions (2h Lockout)',
          description: '',
          metricBadge: `${activeSessionsCount} On Floor`,
          icon: Clock
        },
        {
          id: 'd3_manual_logs',
          numberLabel: '3.3',
          label: 'Manual Check-in / Check-out Log',
          shortLabel: 'Manual Check-in / Check-out Log',
          description: '',
          metricBadge: `${attendance.length} Logs`,
          icon: CheckCircle
        },
        {
          id: 'd3_inspector',
          numberLabel: '3.4',
          label: 'Member Attendance Inspector & PDF',
          shortLabel: 'Member Attendance Inspector & PDF',
          description: '',
          metricBadge: 'Analytics & PDF',
          icon: Calendar
        }
      ]
    },
    {
      id: 'domain_04',
      domainNumber: 'DOMAIN 04',
      title: 'Operations, Media & CMS Hub',
      subtitle: 'CMS & Operations',
      tag: 'CMS & Operations',
      color: 'from-pink-500 to-rose-600',
      accentBg: 'bg-rose-50',
      accentText: 'text-rose-700',
      accentBorder: 'border-rose-200',
      icon: Image,
      metricValue: announcements.length + events.length + challenges.length,
      metricUnit: 'Live CMS Items',
      metricDetail: `${events.length} Events • ${challenges.length} Challenges`,
      description: '',
      primaryCta: 'Open CMS & Operations',
      subFeatures: [
        {
          id: 'd6_media_carousel',
          numberLabel: '4.1',
          label: 'Home Screen Media Carousel',
          shortLabel: 'Home Screen Media Carousel',
          description: '',
          metricBadge: 'Live Sync',
          icon: Image
        },
        {
          id: 'd6_announcements',
          numberLabel: '4.2',
          label: 'Broadcast Announcements',
          shortLabel: 'Broadcast Announcements',
          description: '',
          metricBadge: `${announcements.length} Notices`,
          icon: Bell
        },
        {
          id: 'd6_events_challenges',
          numberLabel: '4.3',
          label: 'Events, Challenges & Workshops',
          shortLabel: 'Events, Challenges & Workshops',
          description: '',
          metricBadge: `${events.length} Events`,
          icon: Trophy
        }
      ]
    },
    {
      id: 'domain_05',
      domainNumber: 'DOMAIN 05',
      title: 'Workouts & Fitness',
      subtitle: 'Exercise Library & Media',
      tag: 'Exercise Library & Media',
      color: 'from-amber-500 to-orange-600',
      accentBg: 'bg-amber-50',
      accentText: 'text-amber-700',
      accentBorder: 'border-amber-200',
      icon: Dumbbell,
      metricValue: workouts.length,
      metricUnit: 'Workout Routines',
      metricDetail: `${workouts.filter(w => w.visibleToClients !== false && w.visibility !== 'hidden').length} Public Routines`,
      description: '',
      primaryCta: 'Open Workouts Hub',
      subFeatures: [
        {
          id: 'd5_exercise_catalog',
          numberLabel: '5.1',
          label: 'Exercise Master Catalog',
          shortLabel: 'Exercise Master Catalog',
          description: '',
          metricBadge: `${workouts.length} Routines`,
          icon: Dumbbell
        },
        {
          id: 'd5_media_hub',
          numberLabel: '5.2',
          label: 'Exercise Media Hub',
          shortLabel: 'Exercise Media Hub',
          description: '',
          metricBadge: 'Photos / GIFs / MP4',
          icon: Upload
        },
        {
          id: 'd5_visibility_controller',
          numberLabel: '5.3',
          label: 'Client Visibility Controller',
          shortLabel: 'Client Visibility Controller',
          description: '',
          metricBadge: 'Access Control',
          icon: Eye
        },
        {
          id: 'd5_diet_bmr',
          numberLabel: '5.4',
          label: 'Diet & BMR/BMI Calculator',
          shortLabel: 'Diet & BMR/BMI Calculator',
          description: '',
          metricBadge: 'BMR / BMI',
          icon: Apple
        }
      ]
    },
    {
      id: 'domain_06',
      domainNumber: 'DOMAIN 06',
      title: 'Trainers & Staff Hub',
      subtitle: 'Workforce Management',
      tag: 'Workforce Management',
      color: 'from-cyan-500 to-blue-600',
      accentBg: 'bg-cyan-50',
      accentText: 'text-cyan-700',
      accentBorder: 'border-cyan-200',
      icon: UserCheck,
      metricValue: activeTrainersCount,
      metricUnit: 'Active Coaches',
      metricDetail:
        safeTrainers.length === 0
          ? '0 Registered Coaches'
          : pendingTrainersCount > 0
          ? `${pendingTrainersCount} Pending Verification`
          : 'All Coaches Verified',
      hasAlert: pendingTrainersCount > 0,
      description: '',
      primaryCta: 'Open Trainers & Staff Hub',
      subFeatures: [
        {
          id: 'd6_coaches',
          numberLabel: '6.1',
          label: 'Coach Management & Roles',
          shortLabel: 'Coach Management & Roles',
          description: '',
          metricBadge: `${safeTrainers.length} Staff`,
          icon: UserCheck
        },
        {
          id: 'd6_verification',
          numberLabel: '6.2',
          label: 'Verification Queue & Badges',
          shortLabel: 'Verification Queue & Badges',
          description: '',
          metricBadge: pendingTrainersCount > 0 ? `${pendingTrainersCount} Pending` : 'Verified',
          icon: Shield
        },
        {
          id: 'd6_pt_allocations',
          numberLabel: '6.3',
          label: '1-on-1 PT Allocations',
          shortLabel: '1-on-1 PT Allocations',
          description: '',
          metricBadge: `${clients.filter(c => c.ptStatus === 'active').length} Active PT`,
          icon: Target
        }
      ]
    }
  ], [
    clients,
    aerobicsBatches,
    activeClientsCount,
    safeTrainers,
    activeTrainersCount,
    pendingTrainersCount,
    attendance,
    activeSessionsCount,
    todayCheckInsCount,
    paymentTransactions,
    settledPaymentsRevenue,
    currentMonthRevenue,
    plans,
    offers,
    ptRequests,
    pendingPtRequestsCount,
    pendingOfflineApprovalsCount,
    totalLedgerRecordsCount,
    announcements,
    events,
    workouts
  ]);

  const currentDomainConfig = selectedDomain
    ? coreDomains.find(d => d.id === selectedDomain) || null
    : null;

  const currentSubFeatureConfig =
    currentDomainConfig && activeSubFeature
      ? currentDomainConfig.subFeatures.find(sf => sf.id === activeSubFeature) || null
      : null;

  const quickActionTitle =
    activeSubFeature === 'd2_revenue_dashboard'
      ? 'Master Billing & Monthly Revenue'
      : activeSubFeature === 'd2_offline_approvals'
      ? 'Offline Membership Approvals'
      : activeSubFeature === 'd1_roster'
      ? 'Registered Clients Roster'
      : activeSubFeature === 'd6_pt_allocations'
      ? '1-on-1 PT Allocations & Requests'
      : null;

  // Shared Client Card Renderer for Domain 01 (Strictly User Management — NO Attendance triggers)
  const renderDomain01ClientCard = (client: ClientProfile) => {
    const clientUser = allUsers.find(u => u.uid === client.userId || u.username === client.userId);
    const userPass = clientUser?.password || (client as any).password || 'password123';
    const userDob = clientUser?.dob || client.dob || 'Not set';
    const isPassShown = !!showPasswordMap[client.userId];
    const isSelfDel = client.isSelfDeleted || clientUser?.isSelfDeleted;

    return (
      <div
        key={client.userId}
        className={`p-4 rounded-2xl border shadow-xs space-y-3 transition-all ${
          isSelfDel
            ? 'bg-rose-50/70 border-rose-200'
            : 'bg-white/90 backdrop-blur-md border-slate-200/90 hover:border-indigo-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={client.photoUrl}
              alt={client.displayName}
              className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
            />
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <h3 className="text-sm font-black text-slate-900">{client.displayName}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  CLIENT
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    client.membershipStatus === 'active' && !isSelfDel
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {client.membershipStatus.toUpperCase()}
                </span>
                {isAerobicsEnrolled(client.userId) && (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-2xs">
                    ✨ AEROBICS
                  </span>
                )}
                {isSelfDel && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-300 animate-pulse">
                    SELF-DELETED
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-200/70 text-[11px] font-bold">
                  ID: {client.userId}
                </span>
                <span>DOB: <strong className="text-slate-800">{userDob}</strong></span>
                {client.age && <span>Age: <strong className="text-slate-800">{client.age} yrs</strong></span>}
                {client.gender && <span className="capitalize">Gender: <strong className="text-slate-800">{client.gender}</strong></span>}
              </div>
            </div>
          </div>

          {/* Password & Profile Controls (Strictly User & Assigned Membership View) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100/90 px-3 py-1.5 rounded-xl border border-slate-200/90 font-mono text-xs shadow-2xs">
              <Key className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-slate-500 text-[10px] uppercase font-bold">Pass:</span>
              <span className="text-amber-800 font-bold tracking-wider">
                {isPassShown ? userPass : '••••••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowPasswordMap(prev => ({ ...prev, [client.userId]: !prev[client.userId] }))}
                className="text-slate-500 hover:text-slate-800 p-1 rounded-md"
                title={isPassShown ? 'Hide Password' : 'Show Password'}
              >
                {isPassShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  copyToClipboard(userPass);
                  showAdminNotice(`Password copied for ${client.displayName}: "${userPass}"`, 'success');
                }}
                className="text-slate-500 hover:text-slate-800 p-1 rounded-md"
                title="Copy Password"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedUserForPasswordChange({
                  uid: client.userId,
                  displayName: client.displayName,
                  role: 'client',
                  currentPassword: userPass
                });
                setNewPasswordInput('');
              }}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Key className="w-3.5 h-3.5 text-amber-600" />
              <span>Change Pass</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setSelectedClientForModal({
                  client,
                  user: clientUser || null,
                  initialTab: 'overview'
                })
              }
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-600" />
              <span>Profile & Membership</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDeleteAccountTarget({
                  uid: client.userId,
                  displayName: client.displayName,
                  role: 'client',
                  email: clientUser?.email
                });
              }}
              className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200 rounded-xl shadow-2xs transition-all"
              title="Delete Client Account"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Client Body Metrics & Assigned Membership Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
          <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Body Metrics</span>
            <strong className="text-xs font-bold text-slate-800 block truncate mt-0.5">
              {client.height ? formatHeight(client.height) : '--'} • {client.weight ? `${client.weight} kg` : '--'}
            </strong>
          </div>
          <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Fitness Goal</span>
            <strong className="text-xs font-bold text-slate-800 block truncate mt-0.5">
              {client.fitnessGoal || 'General Fitness'}
            </strong>
          </div>
          <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Assigned Membership</span>
            <strong className="text-xs font-bold text-slate-800 block truncate mt-0.5">
              {client.membershipPlanName || 'Standard'}
            </strong>
            <span className="text-[10px] text-slate-500 font-medium block truncate">
              Exp: {client.membershipEndDate || 'No Expiry'}
            </span>
          </div>
          <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 block uppercase tracking-wider">Assigned PT Coach</span>
            <strong className="text-xs font-bold text-slate-800 block truncate mt-0.5">
              {client.assignedTrainerName || 'Unassigned'}
            </strong>
            <span className="text-[10px] text-indigo-600 font-bold block truncate uppercase">
              PT: {client.ptStatus || 'none'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-800 flex flex-col justify-between relative overflow-hidden selection:bg-indigo-500/20 selection:text-indigo-800">
      {/* Subtle Ambient Light Orbs */}
      <div className="ambient-orb w-[600px] h-[600px] bg-indigo-300/15 top-0 right-10" />
      <div className="ambient-orb w-[500px] h-[500px] bg-sky-300/15 bottom-20 left-10" />

      {/* Top Admin Header */}
      <header className="bg-white/80 backdrop-blur-2xl border-b border-white/90 px-4 py-3 sticky top-0 z-40 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.06)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div
            onClick={() => {
              setSelectedDomain(null);
              setActiveSubFeature(null);
            }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <GymLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold tracking-tight text-slate-900">
                  TORRENT <span className="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent font-black">FITNESS</span>
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  MASTER ADMIN
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1.5">
                <span className="font-black text-indigo-600 uppercase tracking-wider">BE MORE DO MORE</span>
                <span className="text-slate-300">•</span>
                <span>Enterprise Management</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {selectedDomain !== null && (
              <button
                type="button"
                onClick={handleStepBack}
                className="py-1.5 px-3.5 bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
                title={
                  isQuickActionWorkspace
                    ? 'Return to Main Dashboard'
                    : activeSubFeature
                    ? `Return to ${currentDomainConfig?.domainNumber} Overview`
                    : 'Return to Main Dashboard'
                }
              >
                <ArrowLeft className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {isQuickActionWorkspace
                    ? 'Back to Dashboard'
                    : activeSubFeature
                    ? `Back to ${currentDomainConfig?.domainNumber}`
                    : 'Back to Dashboard'}
                </span>
              </button>
            )}

            {/* Real-time PT Booking Requests Quick-Action Button */}
            <button
              type="button"
              onClick={() => handleNavigate('domain_06', 'd6_pt_allocations')}
              className={`relative py-1.5 px-3 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                pendingPtRequestsCount > 0
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 animate-pulse'
                  : 'bg-white hover:bg-slate-50 border-slate-200/90 text-slate-700'
              }`}
              title="Personal Training (PT) Requests & Coach Allocations"
            >
              <Bell className={`w-3.5 h-3.5 ${pendingPtRequestsCount > 0 ? 'text-amber-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">PT Requests</span>
              {pendingPtRequestsCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-xs">
                  {pendingPtRequestsCount}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-medium">0</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setAdminPasswordError('');
                setCurrentAdminPasswordInput('');
                setNewAdminPasswordInput('');
                setConfirmAdminPasswordInput('');
                setShowAdminPasswordModal(true);
              }}
              className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
              title="Set Master Admin Password"
            >
              <Key className="w-3.5 h-3.5 text-indigo-600" />
              <span>Set Admin Password</span>
            </button>

            <span className="text-xs text-slate-600 hidden md:inline">
              <strong className="text-slate-800">admintorrentfitness1</strong>
            </span>
            <button
              type="button"
              onClick={logout}
              className="py-1.5 px-3 bg-white hover:bg-rose-50 border border-slate-200/90 text-slate-700 hover:text-rose-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin Workspace */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-5 relative z-10">
        <main className="w-full vision-surface rounded-3xl border border-white/90 p-5 sm:p-6 overflow-y-auto shadow-2xl space-y-6">
          {adminToast && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-fade-in ${
                adminToast.type === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              }`}
            >
              <span>{adminToast.text}</span>
              <button
                type="button"
                onClick={() => setAdminToast(null)}
                className="text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Dynamic Today's Birthday Alert (Renders ONLY when >= 1 member has a birthday today) */}
          <BirthdayAlertBanner
            clients={clients}
            users={allUsers}
            viewerRole="admin"
            viewerName="Master Admin"
            viewerId="admin"
            onViewProfile={(member) => {
              const linkedUser =
                allUsers.find((u) => u.uid === member.userId || u.username === member.userId) ||
                null;
              setSelectedClientForModal({
                client: member,
                user: linkedUser,
                initialTab: 'overview'
              });
            }}
          />

          {/* ========================================================================= */}
          {/* HIERARCHICAL NAVIGATION BAR                                               */}
          {/* ========================================================================= */}
          {selectedDomain !== null && currentDomainConfig && (
            <div className="p-4 sm:p-5 bg-white/85 backdrop-blur-xl border border-slate-200/90 rounded-2xl shadow-xs flex flex-col gap-3.5 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleStepBack}
                    className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm active:scale-95 shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>
                      {isQuickActionWorkspace
                        ? '← Back to Dashboard'
                        : activeSubFeature
                        ? `← Back to ${currentDomainConfig.domainNumber}`
                        : '← Back to Dashboard'}
                    </span>
                  </button>

                  <div className="border-l border-slate-200 pl-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDomain(null);
                          setActiveSubFeature(null);
                        }}
                        className="text-slate-500 hover:text-indigo-600 transition-colors"
                      >
                        Dashboard
                      </button>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                      {isQuickActionWorkspace ? (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-black">
                          {quickActionTitle}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setActiveSubFeature(null)}
                            className={`transition-colors ${
                              activeSubFeature
                                ? 'text-slate-600 hover:text-indigo-600'
                                : 'text-indigo-700 font-black'
                            }`}
                          >
                            {currentDomainConfig.domainNumber}: {currentDomainConfig.title}
                          </button>
                          {currentSubFeatureConfig && (
                            <>
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-black">
                                {currentSubFeatureConfig.shortLabel}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <h2 className="text-sm sm:text-base font-black text-slate-900 mt-0.5 tracking-tight">
                      {isQuickActionWorkspace
                        ? quickActionTitle
                        : currentSubFeatureConfig
                        ? currentSubFeatureConfig.label
                        : `${currentDomainConfig.domainNumber} — ${currentDomainConfig.title}`}
                    </h2>
                  </div>
                </div>

                {!isQuickActionWorkspace && (
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-[11px] font-bold text-slate-500 hidden lg:inline">Switch Domain:</span>
                    <select
                      value={selectedDomain}
                      onChange={(e) => handleNavigate(e.target.value as DomainId, null)}
                      className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200/90 rounded-xl text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                    >
                      {coreDomains.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.domainNumber}: {d.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Domain-Scoped Controls Bar (Hidden in Top Quick-Action Workspaces to prevent any overlap) */}
              {!isQuickActionWorkspace && (
                <div className="pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubFeature(null)}
                    className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 border ${
                      activeSubFeature === null
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 border-slate-200/90'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Overview</span>
                  </button>
                  {currentDomainConfig.subFeatures.map((sf) => {
                    const SfIcon = sf.icon;
                    const isActive = activeSubFeature === sf.id;
                    return (
                      <button
                        key={sf.id}
                        type="button"
                        onClick={() => setActiveSubFeature(sf.id)}
                        className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 border ${
                          isActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20'
                            : 'bg-white text-slate-700 hover:text-indigo-700 hover:border-indigo-300 border-slate-200/90 shadow-2xs'
                        }`}
                      >
                        <SfIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{sf.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* LEVEL 1: TOP QUICK-ACTION BAR + MAIN 6-DOMAIN COMMAND GRID                */}
          {/* ========================================================================= */}
          {selectedDomain === null && (
            <div className="space-y-6 animate-fade-in">
              {/* TOP QUICK-ACTION BAR: 4 Compact Horizontal Rectangle KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
                {/* Card 1: Master Billing & Monthly Revenue */}
                <button
                  type="button"
                  onClick={() => handleNavigate('domain_02', 'd2_revenue_dashboard')}
                  className="group text-left bg-white/90 hover:bg-white backdrop-blur-xl rounded-2xl p-4 sm:p-5 border border-white/95 hover:border-emerald-300 shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md shrink-0 group-hover:scale-105 transition-transform">
                      <Wallet className="w-6 h-6" strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
                          Billing & Revenue
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black text-slate-900 tracking-tight">
                          ₹{currentMonthRevenue.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 block mt-0.5">
                        {activeClientsCount} Subscriptions
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-emerald-50 text-slate-400 group-hover:text-emerald-600 flex items-center justify-center transition-colors shrink-0">
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>

                {/* Card 2: Offline Membership Approvals */}
                <button
                  type="button"
                  onClick={() => handleNavigate('domain_02', 'd2_offline_approvals')}
                  className="group text-left bg-white/90 hover:bg-white backdrop-blur-xl rounded-2xl p-4 sm:p-5 border border-white/95 hover:border-amber-300 shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0 group-hover:scale-105 transition-transform">
                      <UserCheck className="w-6 h-6" strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block truncate">
                        Offline Approvals
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black text-slate-900 tracking-tight">
                          {pendingOfflineApprovalsCount} Pending
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-bold block mt-0.5 ${
                          pendingOfflineApprovalsCount > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {pendingOfflineApprovalsCount > 0
                          ? 'Verify Cash →'
                          : 'Desk Queue Cleared'}
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-amber-50 text-slate-400 group-hover:text-amber-600 flex items-center justify-center transition-colors shrink-0">
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>

                {/* Card 3: PT Booking Requests */}
                <button
                  type="button"
                  onClick={() => handleNavigate('domain_06', 'd6_pt_allocations')}
                  className="group text-left bg-white/90 hover:bg-white backdrop-blur-xl rounded-2xl p-4 sm:p-5 border border-white/95 hover:border-purple-300 shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0 group-hover:scale-105 transition-transform relative">
                      <Target className="w-6 h-6" strokeWidth={1.9} />
                      {pendingPtRequestsCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 border-2 border-white rounded-full animate-ping" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block truncate">
                        PT Booking Requests
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black text-slate-900 tracking-tight">
                          {pendingPtRequestsCount} Pending
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-bold block mt-0.5 ${
                          pendingPtRequestsCount > 0 ? 'text-rose-600 font-black' : 'text-purple-700'
                        }`}
                      >
                        {pendingPtRequestsCount > 0
                          ? 'Assign Coach & Verify →'
                          : `${ptRequests.filter((r) => r.status === 'active').length} Active PT`}
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-purple-50 text-slate-400 group-hover:text-purple-600 flex items-center justify-center transition-colors shrink-0">
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>

                {/* Card 4: Registered Clients Roster */}
                <button
                  type="button"
                  onClick={() => handleNavigate('domain_01', 'd1_roster')}
                  className="group text-left bg-white/90 hover:bg-white backdrop-blur-xl rounded-2xl p-4 sm:p-5 border border-white/95 hover:border-indigo-300 shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0 group-hover:scale-105 transition-transform">
                      <Users className="w-6 h-6" strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block truncate">
                        Clients Roster
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-black text-slate-900 tracking-tight">
                          {clients.length} Members
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-indigo-700 block mt-0.5">
                        {activeClientsCount} Active / {expiredClientsCount} Expired
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-indigo-50 text-slate-400 group-hover:text-indigo-600 flex items-center justify-center transition-colors shrink-0">
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              </div>

              {/* 6 Core Domains Grid (Clean, Decluttered VisionOS Glassmorphic Cards) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {coreDomains.map((domain) => {
                  const Icon = domain.icon;
                  return (
                    <div
                      key={domain.id}
                      onClick={() => handleNavigate(domain.id, null)}
                      className="group bg-white/85 backdrop-blur-xl rounded-3xl p-6 border border-white/90 shadow-lg hover:shadow-xl hover:border-indigo-200 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-5"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-slate-900 text-white shadow-2xs">
                            {domain.domainNumber}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${domain.accentBg} ${domain.accentText} ${domain.accentBorder}`}>
                            {domain.tag}
                          </span>
                        </div>

                        <div className="flex items-center gap-3.5">
                          <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${domain.color} text-white flex items-center justify-center shadow-md shrink-0 group-hover:scale-105 transition-transform`}>
                            <Icon className="w-5 h-5" strokeWidth={1.9} />
                          </div>
                          <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight tracking-tight">
                            {domain.title}
                          </h3>
                        </div>

                        {/* Metric Summary Box */}
                        <div className="p-3.5 bg-slate-50/95 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 shadow-2xs tabular-nums">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
                              {domain.metricUnit}
                            </span>
                            <span className="text-xl font-black text-slate-900 tracking-tight mt-0.5 block">
                              {domain.metricValue}
                            </span>
                          </div>
                          <span
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                              domain.hasAlert
                                ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                                : 'bg-white text-slate-700 border-slate-200/90'
                            }`}
                          >
                            {domain.metricDetail}
                          </span>
                        </div>
                      </div>

                      {/* Concise Sub-Feature Pills */}
                      <div className="space-y-2 pt-3 border-t border-slate-200/80">
                        <div className="flex flex-col gap-1.5">
                          {domain.subFeatures.map((sf) => {
                            const SubIcon = sf.icon;
                            return (
                              <button
                                key={sf.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNavigate(domain.id, sf.id);
                                }}
                                className="w-full text-left text-xs px-3 py-2 rounded-xl font-bold bg-slate-50/90 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200/80 hover:border-indigo-200 flex items-center justify-between gap-2 transition-all active:scale-[0.99]"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <SubIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  <span className="truncate">{sf.shortLabel}</span>
                                </div>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* LEVEL 2: DOMAIN MODULE OVERVIEW (selectedDomain !== null && activeSubFeature === null) */}
          {/* ========================================================================= */}
          {selectedDomain !== null && activeSubFeature === null && currentDomainConfig && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-5 bg-gradient-to-r from-slate-50 to-white rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                <div>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${currentDomainConfig.accentBg} ${currentDomainConfig.accentText} ${currentDomainConfig.accentBorder}`}>
                    {currentDomainConfig.domainNumber} • {currentDomainConfig.tag}
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1.5">
                    {currentDomainConfig.title}
                  </h3>
                </div>
                <div className="px-4 py-2.5 bg-white rounded-2xl border border-slate-200/90 text-right shrink-0 shadow-2xs tabular-nums">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    {currentDomainConfig.metricUnit}
                  </span>
                  <span className="text-2xl font-black text-slate-900">
                    {currentDomainConfig.metricValue}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentDomainConfig.subFeatures.map((sf) => {
                  const SfIcon = sf.icon;
                  return (
                    <div
                      key={sf.id}
                      onClick={() => setActiveSubFeature(sf.id)}
                      className="p-5 bg-white/90 hover:bg-white rounded-3xl border border-slate-200/90 hover:border-indigo-300 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${currentDomainConfig.color} text-white flex items-center justify-center shadow-sm shrink-0 group-hover:scale-105 transition-transform`}>
                          <SfIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                            {sf.shortLabel}
                          </h4>
                          <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {sf.metricBadge}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TOP QUICK-ACTION 3: REGISTERED CLIENTS ROSTER (d1_roster)                 */}
          {/* ========================================================================= */}
          {selectedDomain === 'domain_01' && activeSubFeature === 'd1_roster' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-black text-slate-900">
                    Registered Clients Roster ({clients.length})
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {activeClientsCount} Active / {expiredClientsCount} Expired
                  </span>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search client by name, ID, goal..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-2xs"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {clients
                  .filter(c => {
                    const q = searchQuery.toLowerCase();
                    return (
                      c.displayName.toLowerCase().includes(q) ||
                      c.userId.toLowerCase().includes(q) ||
                      (c.fitnessGoal && c.fitnessGoal.toLowerCase().includes(q))
                    );
                  })
                  .map(client => renderDomain01ClientCard(client))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* DOMAIN 01 SUB-FEATURE 1: MEMBER ACCOUNT CREDENTIALS & PASSWORDS           */}
          {/* ========================================================================= */}
          {selectedDomain === 'domain_01' && activeSubFeature === 'd1_credentials' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Key className="w-4 h-4 text-amber-600" />
                  <h3 className="text-base font-black text-slate-900">
                    Member Account Credentials &amp; Passwords ({clients.length})
                  </h3>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by member name or login ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-2xs"
                  />
                </div>
              </div>

              <div className="bg-white/95 rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200/90 bg-slate-50/95 text-slate-700 uppercase text-[10px] font-black tracking-wider">
                        <th className="py-3 px-4">Member</th>
                        <th className="py-3 px-4">Login Username / ID</th>
                        <th className="py-3 px-4">Account Status</th>
                        <th className="py-3 px-4">Plaintext Password</th>
                        <th className="py-3 px-4 text-right">Credential Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80">
                      {clients
                        .filter((c) => {
                          const q = searchQuery.toLowerCase();
                          return (
                            c.displayName.toLowerCase().includes(q) ||
                            c.userId.toLowerCase().includes(q)
                          );
                        })
                        .map((client) => {
                          const clientUser = allUsers.find(
                            (u) => u.uid === client.userId || u.username === client.userId
                          );
                          const userPass =
                            clientUser?.password || (client as any).password || 'password123';
                          const isPassShown = !!showPasswordMap[client.userId];
                          const isSelfDel = client.isSelfDeleted || clientUser?.isSelfDeleted;

                          return (
                            <tr key={client.userId} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <img
                                    src={client.photoUrl}
                                    alt={client.displayName}
                                    className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                                  />
                                  <span className="font-black text-slate-900">
                                    {client.displayName}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 text-[11px] font-bold">
                                  {client.userId}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                    isSelfDel
                                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                                      : client.membershipStatus === 'active'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {isSelfDel ? 'SELF-DELETED' : client.membershipStatus.toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="inline-flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200 font-mono text-xs">
                                  <span className="text-amber-800 font-bold tracking-wider">
                                    {isPassShown ? userPass : '••••••••'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowPasswordMap((prev) => ({
                                        ...prev,
                                        [client.userId]: !prev[client.userId]
                                      }))
                                    }
                                    className="text-slate-500 hover:text-slate-800 p-0.5"
                                    title={isPassShown ? 'Hide Password' : 'Show Password'}
                                  >
                                    {isPassShown ? (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      copyToClipboard(userPass);
                                      showAdminNotice(
                                        `Password copied for ${client.displayName}`,
                                        'success'
                                      );
                                    }}
                                    className="text-slate-500 hover:text-slate-800 p-0.5"
                                    title="Copy Password"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedUserForPasswordChange({
                                        uid: client.userId,
                                        displayName: client.displayName,
                                        role: 'client',
                                        currentPassword: userPass
                                      });
                                      setNewPasswordInput('');
                                    }}
                                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1"
                                  >
                                    <Key className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Reset Password</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteAccountTarget({
                                        uid: client.userId,
                                        displayName: client.displayName,
                                        role: 'client',
                                        email: clientUser?.email
                                      })
                                    }
                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl transition-all"
                                    title="Delete Client Account"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* DOMAIN 01 SUB-FEATURE 2: CLIENT STATUS FILTERS & EXPORT PDF               */}
          {/* ========================================================================= */}
          {selectedDomain === 'domain_01' &&
            (activeSubFeature === 'd1_filters' || activeSubFeature === 'd1_export_pdf') && (
              <div className="space-y-4 animate-fade-in">
                {/* Unified Status Filter KPIs + Master PDF Export Toolbar */}
                <div className="p-4 sm:p-5 bg-white/95 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { key: 'all', label: `All Clients (${clients.length})` },
                      { key: 'active', label: `Active (${activeClientsCount})` },
                      { key: 'expired', label: `Expired (${expiredClientsCount})` },
                      { key: 'deleted', label: `Self-Deleted (${selfDeletedClientsCount})` }
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => {
                          setClientFilterTab(tab.key as any);
                          if (tab.key === 'all' || tab.key === 'active' || tab.key === 'expired') {
                            setPdfExportScope(tab.key);
                          }
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                          clientFilterTab === tab.key
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative w-full sm:w-56">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Filter current view..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-slate-800"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isExportingPdf || clients.length === 0}
                      onClick={() =>
                        handleExportClientPdf(
                          clientFilterTab === 'active'
                            ? 'active'
                            : clientFilterTab === 'expired'
                            ? 'expired'
                            : 'all'
                        )
                      }
                      className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {isExportingPdf
                          ? 'Exporting PDF...'
                          : `Export PDF (${
                              clientFilterTab === 'deleted' ? 'ALL' : clientFilterTab.toUpperCase()
                            })`}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {clients
                    .filter((c) => {
                      if (
                        clientFilterTab === 'active' &&
                        (c.membershipStatus !== 'active' || c.isSelfDeleted)
                      )
                        return false;
                      if (
                        clientFilterTab === 'expired' &&
                        (c.membershipStatus === 'active' || c.isSelfDeleted)
                      )
                        return false;
                      if (clientFilterTab === 'deleted' && !c.isSelfDeleted) return false;
                      const q = searchQuery.toLowerCase();
                      return (
                        c.displayName.toLowerCase().includes(q) ||
                        c.userId.toLowerCase().includes(q)
                      );
                    })
                    .map((client) => renderDomain01ClientCard(client))}
                </div>
              </div>
            )}

          {/* ========================================================================= */}
          {/* DOMAIN 01 SUB-FEATURE 3: AEROBICS BATCHES & PRICING (RELOCATED)           */}
          {/* ========================================================================= */}
          {selectedDomain === 'domain_01' &&
            (activeSubFeature === 'd1_aerobics_management' || activeSubFeature === 'd5_aerobics_management') && (
              <Suspense fallback={<ViewSkeleton cards={3} />}>
                <AerobicsAdminManager />
              </Suspense>
            )}

          {/* ========================================================================= */}
          {/* DOMAIN 02 SUB-FEATURES: BILLING, PLANS & FINANCIAL HUB                    */}
          {/* ========================================================================= */}
          {selectedDomain === 'domain_02' && activeSubFeature !== null && (
            <Suspense fallback={<ViewSkeleton cards={3} />}>
              <BillingPaymentsHub
                clients={clients}
                plans={plans}
                memberships={memberships}
                offers={offers}
                activeSubFeature={activeSubFeature}
                onChangeSubFeature={(subId) => setActiveSubFeature(subId)}
                onSelectClientForDetail={(client) => {
                  const clientUser = allUsers.find((u) => u.uid === client.userId) || null;
                  setSelectedClientForModal({ client, user: clientUser, initialTab: 'overview' });
                }}
              />
            </Suspense>
          )}

          {/* ========================================================================= */}
          {/* DOMAIN 06 SUB-FEATURES: TRAINERS & STAFF HUB (MOVED FROM OLD DOMAIN 02)   */}
          {/* ========================================================================= */}
          {selectedDomain === 'domain_06' && activeSubFeature === 'd6_coaches' && (
            <div className="space-y-4 animate-fade-in">
              {/* Quick Verification Banner if Pending Coaches exist */}
              {pendingTrainersCount > 0 && (
                <div className="p-4 bg-amber-50/95 rounded-2xl border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">
                        {pendingTrainersCount} Trainer Registration{pendingTrainersCount > 1 ? 's' : ''} Pending Verification
                      </h4>
                      <p className="text-xs text-amber-800">
                        Newly signed-up trainers are waiting for approval before accessing client tools.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubFeature('d6_verification')}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-xs shrink-0"
                  >
                    Open Verification Queue ({pendingTrainersCount}) →
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center flex-wrap gap-2">
                    <h3 className="text-base font-black text-slate-900">
                      Coach Management &amp; Privilege Roles ({safeTrainers.length})
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                        pendingTrainersCount > 0
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      }`}
                    >
                      {safeTrainers.length === 0
                        ? '0 Registered Coaches'
                        : pendingTrainersCount > 0
                        ? `${pendingTrainersCount} Pending Verification`
                        : 'All Coaches Verified'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Manage gym owners, managers, and coaches, update privilege badges, and override staff credentials.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search coach by name, ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200/90 rounded-xl focus:outline-none text-slate-800 shadow-2xs"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {safeTrainers
                  .filter((tr) => {
                    const q = (searchQuery || '').toLowerCase();
                    const nameStr = String(tr.displayName || '').toLowerCase();
                    const idStr = String(tr.trainerId || '').toLowerCase();
                    const specStr = String(tr.specializations || '').toLowerCase();
                    return nameStr.includes(q) || idStr.includes(q) || specStr.includes(q);
                  })
                  .map((tr) => {
                    const trUser = allUsers.find(
                      (u) => u.uid === tr.trainerId || u.username === tr.trainerId
                    );
                    const userPass =
                      trUser?.password || (tr as any).password || 'password123';
                    const userDob = trUser?.dob || tr.dob || 'Not set';
                    const isPassShown = !!showPasswordMap[tr.trainerId];
                    const statusLabel = String(tr.status || 'active').toUpperCase();
                    const isPending =
                      tr.status === 'pending' || tr.status === 'pending_verification';
                    const roleSelectVal =
                      tr.badge === 'crown' || tr.badge === 'owner'
                        ? 'owner'
                        : tr.badge === 'shield' || tr.badge === 'manager'
                        ? 'manager'
                        : 'trainer';
                    const genderNorm = String(tr.gender || trUser?.gender || 'Male').toLowerCase();

                    return (
                      <div
                        key={tr.trainerId}
                        className="p-4 bg-white/90 rounded-2xl border border-slate-200/90 shadow-xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={tr.photoUrl}
                              alt={tr.displayName}
                              className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
                            />
                            <div>
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="text-sm font-black text-slate-900">
                                  {tr.displayName}
                                </span>
                                <TrainerIdentityBadge badge={tr.badge} />
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    tr.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                      : 'bg-amber-50 text-amber-700 border-amber-300'
                                  }`}
                                >
                                  {statusLabel}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    genderNorm === 'female'
                                      ? 'bg-rose-50 text-rose-700 border-rose-300'
                                      : 'bg-sky-50 text-sky-700 border-sky-200'
                                  }`}
                                >
                                  {genderNorm === 'female'
                                    ? 'FEMALE TRAINER • AEROBICS'
                                    : String(tr.gender || trUser?.gender || 'Male').toUpperCase()}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                                <span className="font-mono text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-200/70 text-[11px] font-bold">
                                  ID: {tr.trainerId}
                                </span>
                                <span>
                                  DOB: <strong className="text-slate-800">{userDob}</strong>
                                </span>
                                {tr.phone && (
                                  <span>
                                    Phone: <strong className="text-slate-800">{tr.phone}</strong>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => handleApproveTrainer(tr.trainerId)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Approve Coach</span>
                              </button>
                            )}

                            {/* Privilege Role Selector */}
                            <select
                              value={roleSelectVal}
                              onChange={(e) =>
                                handleUpdateTrainerBadge(tr.trainerId, e.target.value as any)
                              }
                              className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                              title="Assign Staff Privilege Role"
                            >
                              <option value="owner">👑 Gym Owner</option>
                              <option value="manager">🛡️ Co-Manager</option>
                              <option value="trainer">🏋️ Verified Trainer</option>
                            </select>

                            {/* Password Pill */}
                            <div className="flex items-center gap-1.5 bg-slate-100/90 px-3 py-1.5 rounded-xl border border-slate-200/90 font-mono text-xs shadow-2xs">
                              <Key className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="text-amber-800 font-bold tracking-wider">
                                {isPassShown ? userPass : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setShowPasswordMap((prev) => ({
                                    ...prev,
                                    [tr.trainerId]: !prev[tr.trainerId]
                                  }))
                                }
                                className="text-slate-500 hover:text-slate-800 p-0.5"
                              >
                                {isPassShown ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForPasswordChange({
                                  uid: tr.trainerId,
                                  displayName: tr.displayName,
                                  role: 'trainer',
                                  currentPassword: userPass
                                });
                                setNewPasswordInput('');
                              }}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all"
                            >
                              Change Pass
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedUserForDetail({ user: trUser, trainer: tr })}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all"
                            >
                              Profile
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setDeleteAccountTarget({
                                  uid: tr.trainerId,
                                  displayName: tr.displayName,
                                  role: 'trainer',
                                  email: trUser?.email || tr.email
                                })
                              }
                              className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
                          <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80">
                            <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                              Specializations
                            </span>
                            <strong className="text-xs font-bold text-slate-800 block truncate mt-0.5">
                              {tr.specializations || 'Strength & Conditioning'}
                            </strong>
                          </div>
                          <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80">
                            <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                              Bio Overview
                            </span>
                            <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                              {tr.bio || 'Torrent Fitness Coach'}
                            </p>
                          </div>
                          <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                                PT Availability
                              </span>
                              <strong className="text-xs font-bold text-slate-800 block mt-0.5">
                                {tr.ptAvailable ? 'Accepting Clients' : 'Fully Booked'}
                              </strong>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleTrainerPtAvailability(tr)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-slate-200 rounded-lg text-[10px] font-bold"
                            >
                              Toggle
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {selectedDomain === 'domain_06' && activeSubFeature === 'd6_verification' && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Staff Verification Queue &amp; Official Badges
                </h3>
                <p className="text-xs text-slate-600">
                  Approve or reject pending trainer sign-ups and verify privilege badges across the coaching team.
                </p>
              </div>

              {pendingTrainersCount === 0 ? (
                <div className="p-6 bg-emerald-50/70 rounded-2xl border border-emerald-200 text-center space-y-1">
                  <CheckCircle className="w-7 h-7 text-emerald-600 mx-auto" />
                  <p className="text-xs font-black text-emerald-900">
                    All Coaches Verified ({activeTrainersCount} Active)
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    Zero pending approvals in queue. All registered coaches and staff members have been verified.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-700">
                    Pending Verification Queue ({pendingTrainersCount})
                  </h4>
                  {safeTrainers
                    .filter((t) => t.status === 'pending' || t.status === 'pending_verification')
                    .map((tr) => (
                      <div
                        key={tr.trainerId}
                        className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={tr.photoUrl}
                            alt={tr.displayName}
                            className="w-11 h-11 rounded-xl object-cover border border-amber-300"
                          />
                          <div>
                            <div className="flex items-center flex-wrap gap-2">
                              <h5 className="text-sm font-black text-slate-900">
                                {tr.displayName} (@{tr.trainerId})
                              </h5>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-200/80 text-amber-900">
                                {tr.gender || 'Trainer'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">
                              {tr.specializations || 'Strength & Conditioning'} • {tr.phone || ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApproveTrainer(tr.trainerId)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Approve Coach</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectTrainer(tr.trainerId)}
                            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Verified Staff Badge Matrix */}
              <div className="bg-white/90 rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 font-bold text-xs text-slate-800">
                  Verified Staff Badge &amp; Privilege Matrix ({safeTrainers.length})
                </div>
                <div className="divide-y divide-slate-200/80">
                  {safeTrainers.map((tr) => {
                    const currentRole =
                      tr.badge === 'crown' || tr.badge === 'owner'
                        ? 'owner'
                        : tr.badge === 'shield' || tr.badge === 'manager'
                        ? 'manager'
                        : 'trainer';
                    return (
                      <div
                        key={tr.trainerId}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={tr.photoUrl}
                            alt={tr.displayName}
                            className="w-9 h-9 rounded-xl object-cover border border-slate-200"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">
                                {tr.displayName}
                              </span>
                              <TrainerIdentityBadge badge={tr.badge} />
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">
                              ID: {tr.trainerId}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(['owner', 'manager', 'trainer'] as const).map((roleOpt) => (
                            <button
                              key={roleOpt}
                              type="button"
                              onClick={() => handleUpdateTrainerBadge(tr.trainerId, roleOpt)}
                              className={`px-3 py-1 rounded-xl text-[11px] font-bold capitalize border transition-all ${
                                currentRole === roleOpt
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'
                              }`}
                            >
                              {roleOpt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {selectedDomain === 'domain_06' && activeSubFeature === 'd6_pt_allocations' && (() => {
            const needsAssignmentRequests = ptRequests.filter(
              r => r.status === 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT'
            );
            const pendingCashRequests = ptRequests.filter(
              r => r.status === 'PENDING_CASH_CONFIRMATION'
            );
            const activePtClients = clients.filter(
              c => c.ptStatus === 'active' || c.assignedTrainerName
            );

            const filteredRequests = ptRequests.filter(r => {
              if (ptFilterStatus === 'needs_action') {
                return (
                  r.status === 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT' ||
                  r.status === 'PENDING_CASH_CONFIRMATION' ||
                  r.status === 'pending'
                );
              }
              if (ptFilterStatus === 'online_paid') {
                return r.status === 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT' || (r.paymentMode === 'online' && r.paidStatus === 'paid');
              }
              if (ptFilterStatus === 'cash_pending') {
                return r.status === 'PENDING_CASH_CONFIRMATION' || r.paymentMode === 'cash';
              }
              if (ptFilterStatus === 'active') {
                return r.status === 'active';
              }
              return true;
            });

            return (
              <div className="space-y-6 animate-fade-in">
                {/* Header & High-Level KPI Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-4 bg-white/90 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-teal-600" />
                      Paid • Needs Assignment
                    </span>
                    <div className="text-2xl font-black text-slate-900">
                      {needsAssignmentRequests.length}
                    </div>
                    <p className="text-[10px] text-slate-500">Online paid clients awaiting coach link</p>
                  </div>

                  <div className="p-4 bg-white/90 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                      <Banknote className="w-3 h-3 text-amber-600" />
                      Pending Cash Receipt
                    </span>
                    <div className="text-2xl font-black text-slate-900">
                      {pendingCashRequests.length}
                    </div>
                    <p className="text-[10px] text-slate-500">Offline requests awaiting desk payment</p>
                  </div>

                  <div className="p-4 bg-white/90 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-indigo-600" />
                      Active 1-on-1 PT Members
                    </span>
                    <div className="text-2xl font-black text-slate-900">
                      {activePtClients.length}
                    </div>
                    <p className="text-[10px] text-slate-500">Members with dedicated coaches</p>
                  </div>

                  <div className="p-4 bg-white/90 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 flex items-center gap-1">
                      <Target className="w-3 h-3 text-cyan-600" />
                      Available Coaches
                    </span>
                    <div className="text-2xl font-black text-slate-900">
                      {safeTrainers.filter(t => t.ptAvailable && t.status === 'active').length}
                    </div>
                    <p className="text-[10px] text-slate-500">Ready to accept PT clients</p>
                  </div>
                </div>

                {/* HIGH PRIORITY 2-TIER ACTION QUEUE */}
                {(needsAssignmentRequests.length > 0 || pendingCashRequests.length > 0) && (
                  <div className="p-5 rounded-3xl bg-gradient-to-r from-teal-50/90 via-sky-50/90 to-amber-50/90 border border-teal-200 shadow-sm space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
                        <h4 className="text-sm font-black text-slate-900">
                          High-Priority PT Action Queue ({needsAssignmentRequests.length + pendingCashRequests.length} Pending)
                        </h4>
                      </div>
                      <span className="text-xs text-slate-600 font-medium">
                        Immediate client onboarding required
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Case A: Online Paid - Needs 1-Click Assignment */}
                      {needsAssignmentRequests.map(r => (
                        <div
                          key={r.id}
                          className="p-4 bg-white rounded-2xl border border-teal-300 shadow-xs space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs shrink-0">
                                💳
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h5 className="text-xs font-black text-slate-900">{r.clientName || 'Client'}</h5>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
                                    ONLINE PAID
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Txn: {r.transactionId || 'Verified Gateway'}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs font-black text-emerald-700 font-mono">
                              ₹{(r.fee || 3500).toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                            <span className="text-slate-600">Requested Coach:</span>
                            <strong className="text-indigo-700 font-black">{r.trainerName || 'Trainer'}</strong>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={ptAssigningReqId === r.id}
                              onClick={() => handleAssignTrainerOnlinePt(r)}
                              className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>{ptAssigningReqId === r.id ? 'Assigning...' : `Assign ${r.trainerName} & Activate PT`}</span>
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Case B: Offline Cash - Needs Cash Verification */}
                      {pendingCashRequests.map(r => (
                        <div
                          key={r.id}
                          className="p-4 bg-white rounded-2xl border border-amber-300 shadow-xs space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                                💵
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h5 className="text-xs font-black text-slate-900">{r.clientName || 'Client'}</h5>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    CASH PENDING
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Ref: {r.transactionId || 'Front Desk'}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs font-black text-amber-700 font-mono">
                              ₹{(r.fee || 3500).toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                            <span className="text-slate-600">Requested Coach:</span>
                            <strong className="text-indigo-700 font-black">{r.trainerName || 'Trainer'}</strong>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => openCashVerifyModal(r)}
                              className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition-all"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              <span>Verify Cash (₹{(r.fee || 3500).toLocaleString('en-IN')}) & Assign</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdatePtRequestStatus(r, 'rejected')}
                              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2-TIER PT REQUESTS & ASSIGNMENT TABLE */}
                <div className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                    <div>
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                        <Target className="w-4 h-4 text-cyan-600" />
                        <span>Dedicated Personal Training Requests & History Queue</span>
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Track online gateway approvals, verify cash receipts, and confirm client-to-coach allocations.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80 flex-wrap">
                      {[
                        { key: 'all', label: `All (${ptRequests.length})` },
                        { key: 'needs_action', label: `Needs Action (${needsAssignmentRequests.length + pendingCashRequests.length})` },
                        { key: 'online_paid', label: 'Online Paid' },
                        { key: 'cash_pending', label: 'Cash Pending' },
                        { key: 'active', label: 'Active' }
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setPtFilterStatus(tab.key as any)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            ptFilterStatus === tab.key
                              ? 'bg-white text-indigo-700 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredRequests.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No PT requests matching filter &quot;{ptFilterStatus}&quot;.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3">Member</th>
                            <th className="py-2.5 px-3">Requested Coach</th>
                            <th className="py-2.5 px-3">Fee</th>
                            <th className="py-2.5 px-3">Payment Mode</th>
                            <th className="py-2.5 px-3">Paid Status</th>
                            <th className="py-2.5 px-3">Queue Status</th>
                            <th className="py-2.5 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredRequests.map((r) => {
                            const isOnlinePaidNeedsAssign = r.status === 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT';
                            const isCashPending = r.status === 'PENDING_CASH_CONFIRMATION';
                            const isPending = r.status === 'pending';
                            const isActive = r.status === 'active';

                            return (
                              <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2.5">
                                    <img
                                      src={
                                        r.clientPhotoUrl ||
                                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
                                      }
                                      alt={r.clientName || 'Client'}
                                      className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                                    />
                                    <div>
                                      <strong className="text-slate-900 block font-bold">{r.clientName || 'Client'}</strong>
                                      <span className="text-[10px] text-slate-500 font-mono">@{r.clientId}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <strong className="text-indigo-700 font-black">{r.trainerName || 'Coach'}</strong>
                                </td>
                                <td className="py-3 px-3 font-mono font-bold text-slate-800">
                                  ₹{(r.fee || 3500).toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-3">
                                  {r.paymentMode === 'online' ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                      Online Gateway
                                    </span>
                                  ) : r.paymentMode === 'cash' ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      Cash / Desk
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 font-medium">Standard</span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  {r.paidStatus === 'paid' ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      ✓ Paid
                                    </span>
                                  ) : r.paidStatus === 'pending' ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      ⏳ Pending
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500">Unpaid</span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      isOnlinePaidNeedsAssign
                                        ? 'bg-teal-50 text-teal-800 border-teal-300'
                                        : isCashPending
                                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                                        : isActive
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : 'bg-sky-50 text-sky-800 border-sky-300'
                                    }`}
                                  >
                                    {isOnlinePaidNeedsAssign
                                      ? 'Paid • Needs Assignment'
                                      : isCashPending
                                      ? 'Pending Cash Verification'
                                      : isActive
                                      ? 'Active Coaching'
                                      : String(r.status || 'Pending').toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {isOnlinePaidNeedsAssign && (
                                      <button
                                        type="button"
                                        disabled={ptAssigningReqId === r.id}
                                        onClick={() => handleAssignTrainerOnlinePt(r)}
                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow-xs flex items-center gap-1"
                                      >
                                        <CheckCircle className="w-3 h-3" />
                                        <span>Assign & Activate</span>
                                      </button>
                                    )}

                                    {isCashPending && (
                                      <button
                                        type="button"
                                        onClick={() => openCashVerifyModal(r)}
                                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold shadow-xs flex items-center gap-1"
                                      >
                                        <Banknote className="w-3 h-3" />
                                        <span>Verify Cash</span>
                                      </button>
                                    )}

                                    {isPending && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdatePtRequestStatus(r, 'accepted')}
                                          className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdatePtRequestStatus(r, 'rejected')}
                                          className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold"
                                        >
                                          Reject
                                        </button>
                                      </>
                                    )}

                                    {isActive && (
                                      <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" /> Assigned
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Direct Manual PT Workbench for Admin Overrides */}
                <form
                  onSubmit={handleAssignPtCoach}
                  className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs space-y-4"
                >
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Manual 1-on-1 PT Allocation Workbench (Direct Override)
                    </h3>
                    <p className="text-xs text-slate-600">
                      Directly link or reassign any registered member to a coach without an existing request ticket.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      required
                      value={ptAssignClientId}
                      onChange={(e) => setPtAssignClientId(e.target.value)}
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none"
                    >
                      <option value="">-- Select Client --</option>
                      {clients.map((c) => (
                        <option key={c.userId} value={c.userId}>
                          {c.displayName} (@{c.userId}){' '}
                          {c.assignedTrainerName ? `[Current: ${c.assignedTrainerName}]` : ''}
                        </option>
                      ))}
                    </select>

                    <select
                      required
                      value={ptAssignTrainerId}
                      onChange={(e) => setPtAssignTrainerId(e.target.value)}
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none"
                    >
                      <option value="">-- Select PT Coach --</option>
                      {safeTrainers
                        .filter((t) => t.status === 'active')
                        .map((t) => (
                          <option key={t.trainerId} value={t.trainerId}>
                            {t.displayName} ({t.specializations || 'Strength & Conditioning'})
                          </option>
                        ))}
                    </select>

                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm"
                    >
                      Assign 1-on-1 PT Coach
                    </button>
                  </div>
                </form>

                {/* Active PT Allocations Grid */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Active Client-to-Coach PT Allocations ({activePtClients.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activePtClients.map((c) => (
                      <div
                        key={c.userId}
                        className="p-3.5 bg-white/90 rounded-2xl border border-slate-200/90 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={c.photoUrl}
                            alt={c.displayName}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                          />
                          <div>
                            <h5 className="text-xs font-black text-slate-900">{c.displayName}</h5>
                            <span className="text-[11px] text-indigo-700 font-bold block">
                              Coach: {c.assignedTrainerName || 'Assigned'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePtAssignment(c.userId)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold"
                        >
                          Unassign
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* DOMAIN 03 SUB-FEATURES: ATTENDANCE & ACCESS CONTROL */}
          {/* ========================================================================= */}
          {selectedDomain === 'domain_03' && activeSubFeature === 'd3_qr_standee' && (
            <div className="space-y-4 animate-fade-in">
              <GymDeskQrDisplay
                isAdmin={true}
                onTokenRegenerated={(c) => setQrConfig(c)}
              />
            </div>
          )}

          {selectedDomain === 'domain_03' && activeSubFeature === 'd3_floor_sessions' && (
            <div className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 space-y-4 animate-fade-in shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Active Floor Sessions & 2-Hour Auto Lockout Monitor</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Real-time floor occupancy monitor and automatic 120-minute workout lockout enforcement.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                  {activeSessionsCount} Active On-Floor
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Active Floor Occupancy</span>
                  <strong className="text-2xl font-black text-emerald-600 mt-1 block">{activeSessionsCount}</strong>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Currently checked in</span>
                </div>
                <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Today's Total Scans</span>
                  <strong className="text-2xl font-black text-indigo-600 mt-1 block">{todayCheckInsCount}</strong>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Verified check-ins today</span>
                </div>
                <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Turnstile Lockout Rule</span>
                  <strong className="text-2xl font-black text-purple-600 mt-1 block">120 Mins</strong>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">2-Hour Auto-Session Close</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-slate-700 block">Live Floor Roster</span>
                {activeSessionsCount === 0 ? (
                  <div className="p-6 bg-slate-50/90 rounded-2xl text-center text-xs text-slate-500 border border-slate-200/80">
                    No active members on the gym floor right now.
                  </div>
                ) : (
                  attendance
                    .filter(a => a.sessionStatus === 'active')
                    .map(rec => {
                      const hasAero = isAerobicsEnrolled(rec.clientId, rec);
                      return (
                        <div
                          key={rec.id}
                          className="p-3.5 bg-white rounded-xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs"
                        >
                          <div className="flex items-center flex-wrap gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <div className="flex items-center flex-wrap gap-2">
                              <strong className="text-slate-900 font-bold">{rec.clientName}</strong>
                              <span className="text-slate-500 font-mono">(@{rec.clientId})</span>
                              {hasAero && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-xs">
                                  ✨ AEROBICS
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-slate-700">
                              Entry: <strong className="text-indigo-600">{rec.entryTime}</strong>
                            </span>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-300 font-bold text-[10px]">
                              ON FLOOR
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCheckoutActiveSession(rec)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold"
                            >
                              End Session
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}

          {selectedDomain === 'domain_03' && activeSubFeature === 'd3_manual_logs' && (
            <div className="space-y-5 animate-fade-in">
              {/* Front-Desk Manual Check-in Form */}
              <form
                onSubmit={handleManualDeskCheckIn}
                className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-end justify-between gap-3"
              >
                <div className="flex-1">
                  <label className="block text-xs font-black text-slate-900 mb-1">
                    Manual Reception Desk Check-in Override
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Select a registered member below to log an immediate verified desk check-in.
                  </p>
                  <select
                    required
                    value={manualCheckInClientId}
                    onChange={(e) => setManualCheckInClientId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none"
                  >
                    <option value="">-- Choose Member for Manual Check-in --</option>
                    {clients.map(c => (
                      <option key={c.userId} value={c.userId}>
                        {c.displayName} (@{c.userId}) — {c.membershipStatus.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm shrink-0"
                >
                  + Log Manual Check-in
                </button>
              </form>

              {/* Chronological Check-in / Check-out Table */}
              <div className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Chronological Check-in & Check-out Log ({attendance.length})
                    </h3>
                    <p className="text-xs text-slate-600">
                      Complete turnstile and manual reception desk entry/exit history.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[450px] overflow-y-auto rounded-2xl border border-slate-200/80">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-slate-100/90 text-slate-700 uppercase text-[10px] font-bold sticky top-0 z-10">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Photo</th>
                        <th className="py-2.5 px-3">Member Name</th>
                        <th className="py-2.5 px-3">Client ID</th>
                        <th className="py-2.5 px-3">Date & Timestamp</th>
                        <th className="py-2.5 px-3">Check-in</th>
                        <th className="py-2.5 px-3">Check-out</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 bg-white">
                      {attendance.map((rec, idx) => {
                        const hasAero = isAerobicsEnrolled(rec.clientId, rec);
                        const memberPhoto =
                          rec.clientPhotoUrl ||
                          clients.find((c) => c.userId === rec.clientId)?.photoUrl ||
                          '';
                        const recordTimestamp = rec.timestamp || rec.createdAt;
                        const timeDisplay = recordTimestamp
                          ? new Date(recordTimestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })
                          : '';

                        return (
                          <tr key={rec.id || idx} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                {memberPhoto ? (
                                  <img
                                    src={memberPhoto}
                                    alt={rec.clientName}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-600 font-bold text-xs bg-slate-100">
                                    {(rec.clientName || 'M').charAt(0)}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              <div className="flex items-center flex-wrap gap-2">
                                <span>{rec.clientName}</span>
                                {hasAero && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-2xs">
                                    ✨ AEROBICS
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-indigo-700 font-semibold text-[11px]">
                              @{rec.clientId}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              <div>{rec.entryDate || rec.date}</div>
                              {timeDisplay && (
                                <div className="text-[10px] text-slate-400">{timeDisplay}</div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-indigo-600 font-bold">
                              {rec.entryTime || rec.checkInTime}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{rec.exitTime || '--'}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  rec.sessionStatus === 'active'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {(rec.sessionStatus || 'completed').toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {rec.sessionStatus === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => handleCheckoutActiveSession(rec)}
                                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold"
                                >
                                  Check-out
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {selectedDomain === 'domain_03' && activeSubFeature === 'd3_inspector' && (
            <div className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 space-y-5 animate-fade-in shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>Member Attendance Inspector & Selective PDF Analytics</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Inspect individual daily/weekly/monthly attendance logs or select multiple members to compile a PDF report.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSelectionMode) {
                        setIsSelectionMode(true);
                        if (selectedAttendanceClientIds.length === 0) {
                          setSelectedAttendanceClientIds(clients.map(c => c.userId));
                        }
                      } else {
                        setIsSelectionMode(false);
                      }
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
                      isSelectionMode
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>
                      {isSelectionMode ? 'Exit Selection Mode' : 'Selective Multi-Member PDF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isExportingBulkPdf || clients.length === 0}
                    onClick={() => {
                      requestPdfDownload({
                        portalType: 'admin',
                        documentName: 'Consolidated All Members Attendance Report',
                        customTitle: 'Confirm PDF Download',
                        customMessage: 'Are you sure you want to download and export this Consolidated All Members Attendance Report as a PDF?',
                        onConfirm: async () => {
                          setIsExportingBulkPdf(true);
                          try {
                            await exportAllMembersAttendancePdf({
                              clients,
                              users: allUsers,
                              attendanceRecords: attendance,
                              filterLabel: 'Consolidated All Members Attendance Report',
                              gymName: gymSettings?.gymName || 'Torrent Fitness'
                            });
                          } finally {
                            setIsExportingBulkPdf(false);
                          }
                        }
                      });
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isExportingBulkPdf ? 'Generating...' : 'Export All Attendance (PDF)'}</span>
                  </button>
                </div>
              </div>

              {isSelectionMode && (
                <div className="bg-indigo-50/90 p-4 rounded-2xl border border-indigo-200 space-y-3 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase">
                        Selection Mode
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {selectedAttendanceClientIds.length} of {clients.length} Members Selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAttendanceClientIds(clients.map(c => c.userId))}
                        className="px-2.5 py-1 bg-white text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAttendanceClientIds([])}
                        className="px-2.5 py-1 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-bold"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={selectedAttendanceClientIds.length === 0}
                        onClick={() => {
                          const selClients = clients.filter(c => selectedAttendanceClientIds.includes(c.userId));
                          requestPdfDownload({
                            portalType: 'admin',
                            documentName: `${selClients.length} Selected Clients Attendance Report`,
                            customTitle: 'Confirm PDF Download',
                            customMessage: `Are you sure you want to download and export this ${selClients.length} Selected Clients Attendance Report as a PDF?`,
                            onConfirm: async () => {
                              await exportMultipleAttendancePdf({
                                clients: selClients,
                                users: allUsers,
                                attendanceRecords: attendance,
                                filterLabel: 'Selected Clients Attendance Report',
                                gymName: gymSettings?.gymName || 'Torrent Fitness'
                              });
                              setIsSelectionMode(false);
                            }
                          });
                        }}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Selected ({selectedAttendanceClientIds.length})</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Member Roster Grid for Attendance Inspection */}
              <div className="bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="relative max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search member to inspect attendance..."
                    value={attendanceSearchQuery}
                    onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200/90 rounded-xl text-xs text-slate-800 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {clients
                    .filter(
                      c =>
                        c.displayName.toLowerCase().includes(attendanceSearchQuery.toLowerCase()) ||
                        c.userId.toLowerCase().includes(attendanceSearchQuery.toLowerCase())
                    )
                    .map(c => {
                      const isInspecting = selectedAttendanceClientId === c.userId;
                      const isChecked = selectedAttendanceClientIds.includes(c.userId);
                      const memberLogsCount = attendance.filter(a => a.clientId === c.userId).length;

                      if (isSelectionMode) {
                        return (
                          <div
                            key={c.userId}
                            onClick={() => {
                              if (isChecked) {
                                setSelectedAttendanceClientIds(prev => prev.filter(id => id !== c.userId));
                              } else {
                                setSelectedAttendanceClientIds(prev => [...prev, c.userId]);
                              }
                            }}
                            className={`p-3 rounded-2xl border flex items-center justify-between gap-2 cursor-pointer ${
                              isChecked ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input type="checkbox" checked={isChecked} onChange={() => {}} className="rounded text-indigo-600" />
                              <span className="text-xs font-bold text-slate-900 truncate">{c.displayName}</span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-600">{memberLogsCount} visits</span>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={c.userId}
                          type="button"
                          onClick={() => setSelectedAttendanceClientId(c.userId)}
                          className={`p-3 rounded-2xl border text-left flex items-center justify-between gap-2 transition-all ${
                            isInspecting
                              ? 'bg-indigo-50 border-2 border-indigo-500 shadow-sm'
                              : 'bg-white border-slate-200/90 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img src={c.photoUrl} alt={c.displayName} className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="text-xs font-bold text-slate-900 truncate">{c.displayName}</h4>
                                {isAerobicsEnrolled(c.userId) && (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-rose-600 text-white shrink-0">
                                    AEROBICS
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono block truncate">@{c.userId}</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                            {memberLogsCount} visits
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {selectedAttendanceClientId ? (() => {
                const targetClient = clients.find(c => c.userId === selectedAttendanceClientId);
                const targetUser = allUsers.find(u => u.uid === selectedAttendanceClientId);
                if (!targetClient) return null;
                return (
                  <div className="pt-2 space-y-3 animate-fade-in">
                    <div className="p-3.5 bg-indigo-50/80 rounded-2xl border border-indigo-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={targetClient.photoUrl} alt={targetClient.displayName} className="w-9 h-9 rounded-xl object-cover border border-indigo-300" />
                        <div>
                          <h4 className="text-xs font-black text-slate-900">
                            Inspecting Attendance for {targetClient.displayName} (@{targetClient.userId})
                          </h4>
                          <p className="text-[11px] text-slate-600">Daily, weekly, and monthly attendance logs & individual PDF export</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedAttendanceClientId('')}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200"
                      >
                        Close Inspector
                      </button>
                    </div>
                    <Suspense fallback={<ViewSkeleton cards={2} />}>
                      <ClientAttendanceAnalytics
                        client={targetClient}
                        user={targetUser}
                        attendanceRecords={attendance}
                        gymName={gymSettings?.gymName || 'Torrent Fitness'}
                      />
                    </Suspense>
                  </div>
                );
              })() : (
                <div className="p-6 bg-slate-50/80 rounded-2xl border border-slate-200/80 text-center space-y-1.5">
                  <Calendar className="w-7 h-7 text-indigo-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">
                    Select any member card above to inspect their daily, weekly, and monthly attendance analytics.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Legacy fallback if any deep link opens old d4_* sub-features */}
          {selectedDomain === 'domain_04' &&
            (activeSubFeature === 'd4_plans_catalog' ||
              activeSubFeature === 'd4_promos_coupons' ||
              activeSubFeature === 'd4_cash_desk') && (
              <Suspense fallback={<ViewSkeleton cards={3} />}>
                <UnifiedMembershipManager
                  clients={clients}
                  plans={plans}
                  memberships={memberships}
                  offers={offers}
                  hideInternalTabs={true}
                  defaultSubTab={
                    activeSubFeature === 'd4_plans_catalog'
                      ? 'pricing'
                      : activeSubFeature === 'd4_cash_desk'
                      ? 'cash_desk'
                      : 'coupons'
                  }
                  onSelectClientForDetail={(client) => {
                    const clientUser = allUsers.find((u) => u.uid === client.userId) || null;
                    setSelectedClientForModal({ client, user: clientUser, initialTab: 'overview' });
                  }}
                />
              </Suspense>
            )}

          {/* ========================================================================= */}
          {/* DOMAIN 05 SUB-FEATURES: WORKOUTS & EXERCISE LIBRARY */}
          {/* ========================================================================= */}
          {selectedDomain === 'domain_05' &&
            (activeSubFeature === 'd5_exercise_catalog' ||
              activeSubFeature === 'd5_media_hub' ||
              activeSubFeature === 'd5_visibility_controller') && (
              <Suspense fallback={<ViewSkeleton cards={3} />}>
                <WorkoutLibraryManager
                  workouts={workouts}
                  clients={clients}
                  viewMode={
                    activeSubFeature === 'd5_media_hub'
                      ? 'media_hub'
                      : activeSubFeature === 'd5_visibility_controller'
                      ? 'visibility'
                      : 'catalog'
                  }
                />
              </Suspense>
            )}

          {selectedDomain === 'domain_05' && activeSubFeature === 'd5_diet_bmr' && (() => {
            const parsedH = parseHeight(calcHeight);
            const heightInches = parsedH.totalInches;
            const heightM = heightInches * 0.0254;
            const heightCm = Math.round(heightInches * 2.54);
            const bmi = Number((calcWeight / (heightM * heightM)).toFixed(1));
            const bmiCategory =
              bmi < 18.5
                ? 'Underweight (<18.5)'
                : bmi < 25
                ? 'Normal Weight (18.5 - 24.9)'
                : bmi < 30
                ? 'Overweight (25.0 - 29.9)'
                : 'Obese (≥30.0)';
            const bmr = Math.round(
              calcGender === 'male'
                ? 10 * calcWeight + 6.25 * heightCm - 5 * calcAge + 5
                : 10 * calcWeight + 6.25 * heightCm - 5 * calcAge - 161
            );
            const tdee = Math.round(bmr * calcActivity);
            const targetKcal =
              calcGoal === 'loss' ? tdee - 450 : calcGoal === 'gain' ? tdee + 350 : tdee;
            const proteinGrams = Math.round(calcWeight * 2.0);
            const fatGrams = Math.round((targetKcal * 0.25) / 9);
            const carbGrams = Math.max(50, Math.round((targetKcal - proteinGrams * 4 - fatGrams * 9) / 4));

            return (
              <div className="space-y-5 animate-fade-in">
                <div className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-emerald-600" />
                        <span>Automated BMR / BMI Diagnostics & Client Diet Prescription Engine</span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Compute exact Mifflin-St Jeor BMR, BMI classification, TDEE, and publish tailored nutrition plans to any client.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveDietPrescription} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block font-bold text-slate-700 mb-1">Select Client Profile</label>
                        <select
                          value={calcClientId}
                          onChange={(e) => handleSelectClientForDiet(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold"
                        >
                          <option value="">-- Choose Client to Auto-Fill --</option>
                          {clients.map(c => (
                            <option key={c.userId} value={c.userId}>
                              {c.displayName} (@{c.userId})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Weight (kg)</label>
                        <input
                          type="number"
                          min={30}
                          max={250}
                          value={calcWeight}
                          onChange={(e) => setCalcWeight(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Height (cm)</label>
                        <input
                          type="number"
                          min={100}
                          max={240}
                          value={calcHeight}
                          onChange={(e) => setCalcHeight(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Age (yrs)</label>
                        <input
                          type="number"
                          min={12}
                          max={95}
                          value={calcAge}
                          onChange={(e) => setCalcAge(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Gender</label>
                        <select
                          value={calcGender}
                          onChange={(e) => setCalcGender(e.target.value as any)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                        >
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Activity Multiplier</label>
                        <select
                          value={calcActivity}
                          onChange={(e) => setCalcActivity(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-800"
                        >
                          <option value={1.2}>Sedentary (1.2x BMR)</option>
                          <option value={1.375}>Lightly Active 1-3 days/wk (1.375x BMR)</option>
                          <option value={1.55}>Moderately Active 3-5 days/wk (1.55x BMR)</option>
                          <option value={1.725}>Very Active 6-7 days/wk (1.725x BMR)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Caloric Target Objective</label>
                        <select
                          value={calcGoal}
                          onChange={(e) => setCalcGoal(e.target.value as any)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-800"
                        >
                          <option value="loss">Fat Loss Deficit (-450 kcal/day)</option>
                          <option value="maintain">Body Recomposition / Maintenance</option>
                          <option value="gain">Lean Muscle Surplus (+350 kcal/day)</option>
                        </select>
                      </div>
                    </div>

                    {/* Live Computed BMR / BMI / Macro Output Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block">Computed BMI</span>
                        <span className="text-xl font-black text-slate-900 mt-0.5 block">{bmi}</span>
                        <span className="text-[10px] font-bold text-indigo-700 block mt-0.5">{bmiCategory}</span>
                      </div>
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block">Basal Metabolic Rate</span>
                        <span className="text-xl font-black text-slate-900 mt-0.5 block">{bmr} kcal</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">Resting expenditure</span>
                      </div>
                      <div className="p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200">
                        <span className="text-[10px] font-bold uppercase text-emerald-800 block">Daily Target Intake</span>
                        <span className="text-xl font-black text-emerald-700 mt-0.5 block">{targetKcal} kcal</span>
                        <span className="text-[10px] font-semibold text-emerald-700 block mt-0.5">TDEE: {tdee} kcal</span>
                      </div>
                      <div className="p-3.5 bg-indigo-50/80 rounded-2xl border border-indigo-200">
                        <span className="text-[10px] font-bold uppercase text-indigo-800 block">Daily Macro Split</span>
                        <span className="text-xs font-black text-indigo-900 mt-1 block">
                          P: {proteinGrams}g • C: {carbGrams}g • F: {fatGrams}g
                        </span>
                        <span className="text-[10px] text-indigo-700 block mt-0.5">High-Protein Protocol</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Daily Meal Timing Prescription</label>
                        <textarea
                          rows={4}
                          value={dietMealPlanText}
                          onChange={(e) => setDietMealPlanText(e.target.value)}
                          placeholder="Enter meal timings and food breakdown..."
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Hydration & Supplementation Guidelines</label>
                        <textarea
                          rows={4}
                          value={dietNotesText}
                          onChange={(e) => setDietNotesText(e.target.value)}
                          placeholder="Hydration target, whey protein, creatine, sleep notes..."
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={dietSaving || !calcClientId}
                        className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md disabled:opacity-50"
                      >
                        {dietSaving ? 'Syncing Prescription...' : 'Save BMR Diagnostics & Assign Diet Plan'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* DOMAIN 04 SUB-FEATURES: OPERATIONS, MEDIA & ANNOUNCEMENTS */}
          {/* ========================================================================= */}
          {(selectedDomain === 'domain_04' || selectedDomain === 'domain_06') &&
            activeSubFeature === 'd6_media_carousel' && (
              <Suspense fallback={<ViewSkeleton cards={3} />}>
                <PromoBannerManager />
              </Suspense>
            )}

          {(selectedDomain === 'domain_04' || selectedDomain === 'domain_06') &&
            activeSubFeature === 'd6_announcements' && (
            <div className="space-y-5 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Publish Broadcast Notice Form */}
                <form
                  onSubmit={handlePublishAnnouncement}
                  className="lg:col-span-2 p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs space-y-3.5"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-900">
                      Publish Gym Broadcast Announcement
                    </h3>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Announcement Headline (e.g. Sunday Holiday Timings, New Squat Racks Arrived)..."
                    value={newAnnTitle}
                    onChange={(e) => setNewAnnTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none"
                  />
                  <textarea
                    required
                    rows={3}
                    placeholder="Enter full broadcast message for clients and trainers..."
                    value={newAnnContent}
                    onChange={(e) => setNewAnnContent(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none"
                  />
                  {/* Priority Toggle: NORMAL vs HIGH vs URGENT */}
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-700">Broadcast Priority:</span>
                        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/90 gap-1">
                          <button
                            type="button"
                            onClick={() => setNewAnnPriority('normal')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                              newAnnPriority === 'normal'
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Normal
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewAnnPriority('high')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                              newAnnPriority === 'high'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            High
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewAnnPriority('urgent')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              newAnnPriority === 'urgent'
                                ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-xs'
                                : 'text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            <span>🚨 Urgent / Critical</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={newAnnTarget}
                          onChange={(e) => setNewAnnTarget(e.target.value as any)}
                          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold"
                        >
                          <option value="all">Audience: All Users</option>
                          <option value="clients">Audience: Clients Only</option>
                          <option value="trainers">Audience: Trainers Only</option>
                        </select>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer shrink-0"
                        >
                          Broadcast Notice Now
                        </button>
                      </div>
                    </div>

                    {newAnnPriority === 'urgent' && (
                      <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2 animate-fade-in font-medium">
                        <span className="text-base">🚨</span>
                        <span>
                          <strong>Pinned Alert Action:</strong> This announcement will be pinned as a prominent, glowing Apple VisionOS alert card at the very top of all Client Home Screens until dismissed.
                        </span>
                      </div>
                    )}
                  </div>
                </form>

                {/* Gym Operating Hours & Timings Config */}
                <form
                  onSubmit={handleSaveOpeningHours}
                  className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-sm font-black text-slate-900">Gym Profile &amp; Timings Configuration</h3>
                    </div>
                    <p className="text-xs text-slate-600">
                      Update official facility operating hours and address displayed across client app &amp; PDF invoices.
                    </p>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Operating Schedule</label>
                      <input
                        type="text"
                        value={editOpeningHours}
                        onChange={(e) => setEditOpeningHours(e.target.value)}
                        placeholder="5:30 AM - 10:30 PM"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Official Gym Facility Phone (Invoices & Direct Desk)</label>
                      <input
                        type="tel"
                        value={editGymPhone}
                        onChange={(e) => setEditGymPhone(e.target.value)}
                        placeholder="8208002585"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Official Gym Facility Address</label>
                      <textarea
                        rows={2}
                        value={editGymAddress}
                        onChange={(e) => setEditGymAddress(e.target.value)}
                        placeholder="Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 resize-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    Update Gym Profile &amp; Timings
                  </button>
                </form>
              </div>

              {/* Active Broadcasts List (Strict Reverse-Chronological Order) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Published Broadcast Announcements ({announcements.length})
                  </h4>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    Sorted by newest broadcast first
                  </span>
                </div>
                {[...announcements]
                  .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                  .map((ann) => {
                    const isUrgent = ann.priority === 'urgent' || (ann as any).isUrgent;
                    return (
                      <div
                        key={ann.id}
                        className={`p-4 rounded-2xl border shadow-2xs flex items-start justify-between gap-3 text-xs transition-all ${
                          isUrgent
                            ? 'bg-rose-50/70 border-rose-200'
                            : 'bg-white/90 border-slate-200/90'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong className="text-sm font-black text-slate-900">{ann.title}</strong>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {ann.targetRole}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                                isUrgent
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : ann.priority === 'high'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {isUrgent ? '🚨 URGENT' : ann.priority}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {ann.createdAt ? new Date(ann.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                            </span>
                          </div>
                          <p className="text-slate-600 leading-relaxed font-medium">{ann.content}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 shrink-0 cursor-pointer"
                          title="Delete Notice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {(selectedDomain === 'domain_04' || selectedDomain === 'domain_06') &&
            activeSubFeature === 'd6_events_challenges' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">
              {/* Left Column: Gym Events & Workshops Scheduler */}
              <div className="space-y-4">
                <form
                  onSubmit={handleCreateEvent}
                  className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-900">
                      Schedule Gym Event or Workshop
                    </h3>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Event Title (e.g. Torrent Deadlift Clinic)..."
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={newEventDate}
                      onChange={(e) => setNewEventDate(e.target.value)}
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                    />
                    <input
                      type="text"
                      value={newEventTime}
                      onChange={(e) => setNewEventTime(e.target.value)}
                      placeholder="06:00 PM"
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newEventReg}
                        onChange={(e) => setNewEventReg(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>Client RSVP Registration Open</span>
                    </label>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm"
                    >
                      + Publish Event
                    </button>
                  </div>
                </form>

                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Scheduled Events & Workshops ({events.length})
                  </h4>
                  {events.map(ev => (
                    <div
                      key={ev.id}
                      className="p-3.5 bg-white/90 rounded-2xl border border-slate-200/90 flex items-center justify-between gap-2 text-xs shadow-2xs"
                    >
                      <div>
                        <strong className="text-slate-900 font-bold block">{ev.title}</strong>
                        <span className="text-[11px] text-slate-500">
                          {ev.eventDate} • {ev.eventTime || '06:00 PM'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleEventRegistration(ev)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            ev.registrationEnabled
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {ev.registrationEnabled ? 'Reg OPEN' : 'Reg CLOSED'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(ev.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Gym Challenges & Leaderboards */}
              <div className="space-y-4">
                <form
                  onSubmit={handleCreateChallenge}
                  className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-black text-slate-900">
                      Launch Gym Challenge
                    </h3>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Challenge Name (e.g. 30-Day Core Shred)..."
                    value={newChalTitle}
                    onChange={(e) => setNewChalTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Target Goal (e.g. 100 Pull-ups)"
                      value={newChalTarget}
                      onChange={(e) => setNewChalTarget(e.target.value)}
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                    />
                    <select
                      value={newChalDifficulty}
                      onChange={(e) => setNewChalDifficulty(e.target.value as any)}
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold"
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm"
                    >
                      + Launch Challenge
                    </button>
                  </div>
                </form>

                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Active Gym Challenges ({challenges.length})
                  </h4>
                  {challenges.map(ch => (
                    <div
                      key={ch.id}
                      className="p-3.5 bg-white/90 rounded-2xl border border-slate-200/90 flex items-center justify-between gap-2 text-xs shadow-2xs"
                    >
                      <div>
                        <strong className="text-slate-900 font-bold block">{ch.title}</strong>
                        <span className="text-[11px] text-slate-500">
                          Target: {ch.target} • {ch.difficulty || 'Intermediate'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          ★ {ch.participantsCount || 0} Joined
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteChallenge(ch.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL 1: CHANGE USER PASSWORD MODAL */}
      {selectedUserForPasswordChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shadow-2xs">
                  <Key className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Change User Password</h3>
                  <p className="text-[11px] text-slate-500">Master Administrator Credential Override</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForPasswordChange(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1 text-xs text-slate-700 shadow-2xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Target User:</span>
                <strong className="text-slate-900">{selectedUserForPasswordChange.displayName}</strong>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-slate-500">User ID:</span>
                <span className="text-indigo-600 font-bold">{selectedUserForPasswordChange.uid}</span>
              </div>
              <div className="flex justify-between font-mono pt-1 border-t border-slate-200/80">
                <span className="text-slate-500">Current Password:</span>
                <span className="text-slate-800 font-bold">{selectedUserForPasswordChange.currentPassword || 'password123'}</span>
              </div>
            </div>

            <form onSubmit={handleSaveNewPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Enter New Password *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Type new password (minimum 6 characters)..."
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-slate-800"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForPasswordChange(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordChangeLoading || !newPasswordInput.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl text-xs transition-all shadow-md disabled:opacity-50"
                >
                  {passwordChangeLoading ? 'Saving...' : 'Update Password Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DETAILED TRAINER / STAFF PROFILE MODAL */}
      {selectedUserForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shadow-2xs">
                  <User className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Detailed Staff Account Profile</h3>
                  <p className="text-[11px] text-slate-500">Workforce Records & Credentials</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForDetail(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 shadow-2xs">
              <img
                src={
                  selectedUserForDetail.trainer?.photoUrl ||
                  selectedUserForDetail.user?.photoUrl ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
                }
                alt="Profile"
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-md shrink-0"
              />
              <div className="space-y-1">
                <h4 className="text-base font-black text-slate-900">
                  {selectedUserForDetail.trainer?.displayName || selectedUserForDetail.user?.displayName}
                </h4>
                <div className="font-mono text-xs text-indigo-700 font-bold">
                  ID: {selectedUserForDetail.trainer?.trainerId || selectedUserForDetail.user?.uid}
                </div>
                <div className="text-xs text-slate-600">
                  Status: <strong className="text-emerald-700 uppercase">{selectedUserForDetail.trainer?.status || 'active'}</strong>
                </div>
              </div>
            </div>

            {selectedUserForDetail.trainer && (
              <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2 text-xs text-slate-700">
                <div>• Specializations: <strong className="text-slate-900">{selectedUserForDetail.trainer.specializations}</strong></div>
                <div>• Bio: <p className="text-slate-600 mt-0.5">{selectedUserForDetail.trainer.bio}</p></div>
                <div>• Rating: <strong className="text-amber-600">★ {selectedUserForDetail.trainer.rating}</strong></div>
                <div>• Privilege Role: <strong className="text-indigo-600 uppercase">{selectedUserForDetail.trainer.badge}</strong></div>
              </div>
            )}

            <button
              onClick={() => setSelectedUserForDetail(null)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors border border-slate-200"
            >
              Close Profile View
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: CLIENT DETAIL MODAL (OVERVIEW & ASSIGNED MEMBERSHIPS ONLY) */}
      <ClientDetailModal
        isOpen={!!selectedClientForModal}
        client={selectedClientForModal?.client || null}
        user={selectedClientForModal?.user || null}
        initialTab={selectedClientForModal?.initialTab || 'overview'}
        allAttendance={attendance}
        allMemberships={memberships}
        onClose={() => setSelectedClientForModal(null)}
        onRequestPasswordChange={(client, userPass) => {
          setSelectedClientForModal(null);
          setSelectedUserForPasswordChange({
            uid: client.userId,
            displayName: client.displayName,
            role: 'client',
            currentPassword: userPass
          });
          setNewPasswordInput('');
        }}
        onRequestDelete={(target) => {
          setSelectedClientForModal(null);
          setDeleteAccountTarget(target);
        }}
        onClientUpdated={(updatedClient) => {
          setClients(prev => prev.map(c => (c.userId === updatedClient.userId ? updatedClient : c)));
          if (selectedClientForModal) {
            setSelectedClientForModal({ ...selectedClientForModal, client: updatedClient });
          }
        }}
      />

      {/* MODAL 4: PERMANENT ACCOUNT DELETION CONFIRMATION */}
      <DeleteAccountModal
        isOpen={!!deleteAccountTarget}
        target={deleteAccountTarget}
        onClose={() => setDeleteAccountTarget(null)}
        onDeleted={(deletedUid) => {
          setClients(prev => prev.filter(c => c.userId !== deletedUid));
          setTrainers(prev => prev.filter(t => t.trainerId !== deletedUid));
          setAllUsers(prev => prev.filter(u => u.uid !== deletedUid));
          if (selectedClientForModal?.client.userId === deletedUid) {
            setSelectedClientForModal(null);
          }
        }}
      />

      {/* MODAL 5: GLOBAL DELETE CONFIRMATION MODAL */}
      <GlobalDeleteConfirmModal
        isOpen={!!globalDeletePending}
        title={globalDeletePending?.title || 'Confirm Permanent Deletion'}
        itemName={globalDeletePending?.itemName || ''}
        itemType={globalDeletePending?.itemType}
        description={globalDeletePending?.description || ''}
        warningNote={globalDeletePending?.warningNote}
        confirmLabel={globalDeletePending?.confirmLabel}
        onClose={() => setGlobalDeletePending(null)}
        onConfirm={async () => {
          if (globalDeletePending) {
            await globalDeletePending.onConfirm();
            setGlobalDeletePending(null);
          }
        }}
      />

      {/* MODAL 6: VERIFY OFFLINE CASH & ASSIGN TRAINER */}
      {cashVerifyModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shadow-2xs">
                  <Banknote className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Verify Offline Cash PT Request</h3>
                  <p className="text-[11px] text-slate-500">Confirm cash payment & assign personal coach</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCashVerifyModalReq(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs text-slate-700 shadow-2xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Member:</span>
                <strong className="text-slate-900">{cashVerifyModalReq.clientName} (@{cashVerifyModalReq.clientId})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Requested Coach:</span>
                <strong className="text-indigo-700 font-black">{cashVerifyModalReq.trainerName}</strong>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-slate-500">Reference / Ticket:</span>
                <span className="text-slate-700 font-bold">{cashVerifyModalReq.transactionId || cashVerifyModalReq.id}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmCashPtPayment} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">
                    Amount Received (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={cashVerifyAmount}
                    onChange={(e) => setCashVerifyAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-emerald-700 font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">
                    Receipt Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={cashVerifyDate}
                    onChange={(e) => setCashVerifyDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">
                  Cash Verification Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cash handed to reception desk, receipt issued"
                  value={cashVerifyNotes}
                  onChange={(e) => setCashVerifyNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setCashVerifyModalReq(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cashVerifying || cashVerifyAmount <= 0}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{cashVerifying ? 'Verifying...' : 'Verify Cash & Assign PT'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Admin Password Security Modal */}
      {showAdminPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-sky-400 text-white flex items-center justify-center shadow-md">
                  <Key className="w-5 h-5" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Set Admin Password</h3>
                  <p className="text-[11px] text-slate-500">Master Admin Security Credentials</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAdminPasswordModal(false);
                  setAdminPasswordError('');
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateAdminPasswordSubmit} className="space-y-3.5 text-xs">
              <div className="p-3 bg-indigo-50/80 rounded-2xl border border-indigo-200/70 text-[11px] text-indigo-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Active Account: <strong className="font-mono">admintorrentfitness1</strong></span>
              </div>

              {/* Current Password Field */}
              <div>
                <label className="block text-slate-700 mb-1 font-bold">
                  Current Password *
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    placeholder="Enter active admin password"
                    value={currentAdminPasswordInput}
                    onChange={(e) => setCurrentAdminPasswordInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono text-xs pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Mandatory verification against active database credentials.</p>
              </div>

              {/* New Password Field */}
              <div>
                <label className="block text-slate-700 mb-1 font-bold">
                  New Password *
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    placeholder="Min 6 characters"
                    value={newAdminPasswordInput}
                    onChange={(e) => setNewAdminPasswordInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono text-xs pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password Field */}
              <div>
                <label className="block text-slate-700 mb-1 font-bold">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    placeholder="Re-enter new password"
                    value={confirmAdminPasswordInput}
                    onChange={(e) => setConfirmAdminPasswordInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono text-xs pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {adminPasswordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2 font-medium text-xs">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{adminPasswordError}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminPasswordModal(false);
                    setAdminPasswordError('');
                  }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminPasswordLoading || !currentAdminPasswordInput || !newAdminPasswordInput || !confirmAdminPasswordInput}
                  className="flex-1 py-2.5 vision-btn-aurora text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{adminPasswordLoading ? 'Verifying & Updating...' : 'Save New Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
