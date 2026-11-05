import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db, auth } from '../../firebase';
import { signOut } from 'firebase/auth';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  UserAccount,
  ClientProfile,
  PtRequest,
  PtSchedule,
  WorkoutPlan,
  DietPlan,
  AttendanceRecord,
  Announcement,
  AerobicsBatch,
  AerobicsCategory,
  AerobicsIntensity
} from '../../types';
import { INITIAL_AEROBICS_BATCHES, INITIAL_ANNOUNCEMENTS } from '../../services/db';
import { getCachedData, setCachedData } from '../../services/cacheService';
import { Header } from '../common/Header';
import { TrainerIdentityBadge } from '../common/Badge';
import { PhotoUploader } from '../common/PhotoUploader';
import { BirthdayAlertBanner } from '../common/BirthdayAlertBanner';
import {
  Clock,
  ShieldAlert,
  Users,
  Dumbbell,
  Apple,
  Calendar,
  Inbox,
  UserCheck,
  Eye,
  CheckCircle,
  XCircle,
  Plus,
  Send,
  AlertTriangle,
  Lock,
  Bell,
  User,
  Key,
  Save,
  Edit,
  Phone,
  MessageSquare,
  Music,
  Sparkles,
  LogOut,
  X
} from 'lucide-react';
import { DirectChatModal } from '../common/DirectChatModal';
import { isStaffOwnerOrCoManager } from '../../services/chatService';
import { formatHeight } from '../../utils/heightUtils';

interface TrainerAppProps {}

export const TrainerApp: React.FC<TrainerAppProps> = () => {
  const { currentUser, trainerProfile, updateTrainerProfile, refreshUserData, confirmLogout } = useAuth();

  // 2-Step Logout Confirmation Dialog States (Trainer Portal Exclusive)
  const [showTrainerLogoutModal, setShowTrainerLogoutModal] = useState<boolean>(false);
  const [isLoggingOutTrainer, setIsLoggingOutTrainer] = useState<boolean>(false);
  const [trainerLogoutToast, setTrainerLogoutToast] = useState<string>('');

  // Handle ESC key to dismiss trainer logout modal
  useEffect(() => {
    if (!showTrainerLogoutModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoggingOutTrainer) {
        setShowTrainerLogoutModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTrainerLogoutModal, isLoggingOutTrainer]);

  // Safe Session Teardown & Redirection exclusively for Trainer Portal
  const handleConfirmTrainerLogout = async () => {
    setIsLoggingOutTrainer(true);
    try {
      // 1. Clear trainer cached session states from localStorage & sessionStorage
      localStorage.removeItem('torrent_fitness_user');
      sessionStorage.removeItem('torrent_fitness_user');
      localStorage.removeItem('torrent_fitness_auth_token');
      sessionStorage.removeItem('torrent_fitness_auth_token');
      if (currentUser?.uid) {
        localStorage.removeItem(`trainer_profile_${currentUser.uid}`);
        sessionStorage.removeItem(`trainer_profile_${currentUser.uid}`);
      }

      // 2. Call Firebase signOut(auth)
      await signOut(auth).catch(() => {});

      // 3. Close confirmation modal
      setShowTrainerLogoutModal(false);

      // 4. Display clean toast notification
      setTrainerLogoutToast('Trainer session logged out successfully.');

      // 5. Clean teardown and redirect to root login view (/login or AuthScreen)
      setTimeout(async () => {
        await confirmLogout();
      }, 650);
    } catch (err: any) {
      console.error('Error logging out trainer:', err);
      setShowTrainerLogoutModal(false);
      await confirmLogout();
    } finally {
      setIsLoggingOutTrainer(false);
    }
  };

  // Reusable 2-Step Glassmorphic Logout Confirmation Dialog
  const renderTrainerLogoutModal = () => {
    if (!showTrainerLogoutModal) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoggingOutTrainer) {
            setShowTrainerLogoutModal(false);
          }
        }}
        aria-modal="true"
        role="dialog"
        aria-labelledby="trainer-logout-modal-title"
      >
        <div className="relative bg-white/95 rounded-3xl p-6 max-w-sm w-full border border-white/60 shadow-2xl text-slate-800 text-center animate-scale-up overflow-hidden">
          {/* Subtle VisionOS Ambient Glow Orbs */}
          <div className="ambient-orb w-28 h-28 bg-rose-400/20 -top-6 -right-6 pointer-events-none" />
          <div className="ambient-orb w-28 h-28 bg-amber-400/15 -bottom-6 -left-6 pointer-events-none" />

          {/* Close Button Top-Right */}
          <button
            type="button"
            onClick={() => setShowTrainerLogoutModal(false)}
            disabled={isLoggingOutTrainer}
            aria-label="Close dialog"
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Warning / Logout Icon */}
          <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center shadow-inner text-rose-600">
            <AlertTriangle className="w-7 h-7 text-rose-600" strokeWidth={2} />
          </div>

          {/* Title */}
          <h3 id="trainer-logout-modal-title" className="text-lg font-black text-slate-900 tracking-tight">
            Confirm Trainer Logout
          </h3>

          {/* Message */}
          <p className="text-xs text-slate-600 mt-2 font-medium leading-relaxed max-w-[280px] mx-auto">
            Are you sure you want to end your trainer session? Any unsaved client workout routines or diet drafts may be lost.
          </p>

          {/* 2-Step Action Buttons */}
          <div className="mt-6 flex items-center gap-3">
            {/* Button A: Cancel */}
            <button
              type="button"
              onClick={() => setShowTrainerLogoutModal(false)}
              disabled={isLoggingOutTrainer}
              className="flex-1 py-3 px-4 vision-btn-neutral text-slate-700 hover:text-slate-900 text-xs font-bold rounded-2xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>

            {/* Button B: Confirm Logout (Danger Styling) */}
            <button
              type="button"
              onClick={handleConfirmTrainerLogout}
              disabled={isLoggingOutTrainer}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-[0.98] text-white text-xs font-bold rounded-2xl shadow-md shadow-rose-600/25 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isLoggingOutTrainer ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Logging out...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Yes, Log Out</span>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Toast Notification for Trainer Logout
  const renderTrainerToast = () => {
    if (!trainerLogoutToast) return null;
    return (
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-2xl border border-white/20 flex items-center gap-2 animate-bounce">
        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>{trainerLogoutToast}</span>
      </div>
    );
  };

  // Active module
  const [activeModule, setActiveModule] = useState<
    | 'ptClients'
    | 'assignWorkout'
    | 'dietPlan'
    | 'schedule'
    | 'ptRequests'
    | 'allClients'
    | 'attendance'
    | 'notifications'
    | 'myProfile'
    | 'aerobicsBatches'
  >('ptClients');

  // Data states hydrated from cache
  const [ptClients, setPtClients] = useState<ClientProfile[]>([]);
  const [allGymClients, setAllGymClients] = useState<ClientProfile[]>(() =>
    getCachedData<ClientProfile[]>('admin_clients', [])
  );
  const [allUsers, setAllUsers] = useState<UserAccount[]>(() =>
    getCachedData<UserAccount[]>('admin_users', [])
  );
  const [ptRequests, setPtRequests] = useState<PtRequest[]>([]);
  const [ptSchedules, setPtSchedules] = useState<PtSchedule[]>([]);
  const [dietPlans, setDietPlans] = useState<DietPlan[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>(() =>
    getCachedData<AttendanceRecord[]>('admin_attendance', [])
  );
  const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
    getCachedData<Announcement[]>('announcements_client', INITIAL_ANNOUNCEMENTS)
  );
  const [aerobicsBatches, setAerobicsBatches] = useState<AerobicsBatch[]>(() =>
    getCachedData<AerobicsBatch[]>('admin_aerobics_batches', INITIAL_AEROBICS_BATCHES)
  );

  // Female Trainer Aerobics Batch Quick Form State
  const [aeroBatchTitle, setAeroBatchTitle] = useState('');
  const [aeroBatchCategory, setAeroBatchCategory] = useState<AerobicsCategory>('Zumba / Dance Cardio');
  const [aeroBatchTimeSlot, setAeroBatchTimeSlot] = useState('Morning 07:00 AM - 08:00 AM');
  const [aeroBatchDays, setAeroBatchDays] = useState('Mon - Sat');
  const [aeroBatchCapacity, setAeroBatchCapacity] = useState<number>(25);
  const [aeroBatchMonthlyPrice, setAeroBatchMonthlyPrice] = useState<number>(1499);
  const [aeroBatchQuarterlyPrice, setAeroBatchQuarterlyPrice] = useState<number>(3999);
  const [aeroNotice, setAeroNotice] = useState('');

  // Direct chat with client state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPartnerClient, setChatPartnerClient] = useState<ClientProfile | null>(null);

  // Trainer Profile & ID edit states
  const [profileName, setProfileName] = useState(trainerProfile?.displayName || currentUser?.displayName || '');
  const [profileUsername, setProfileUsername] = useState(currentUser?.username || currentUser?.uid || '');
  const [profilePhone, setProfilePhone] = useState(trainerProfile?.phone || '');
  const [profileDob, setProfileDob] = useState(trainerProfile?.dob || currentUser?.dob || '');
  const [profileGender, setProfileGender] = useState<string>(
    trainerProfile?.gender || currentUser?.gender || (currentUser?.uid.includes('pooja') ? 'Female' : 'Male')
  );
  const [profileBio, setProfileBio] = useState(trainerProfile?.bio || '');
  const [profileSpec, setProfileSpec] = useState(trainerProfile?.specializations || '');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(trainerProfile?.photoUrl || currentUser?.photoUrl || '');
  const [profilePtAvailable, setProfilePtAvailable] = useState<boolean>(trainerProfile?.ptAvailable ?? true);
  const [profilePassword, setProfilePassword] = useState(currentUser?.password || 'password123');
  const [profileSaveNotice, setProfileSaveNotice] = useState('');
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  const isFemaleTrainer =
    (trainerProfile?.gender || currentUser?.gender || profileGender || '')
      .trim()
      .toLowerCase() === 'female' ||
    Boolean(currentUser?.uid.toLowerCase().includes('pooja'));

  const isPrivilegedStaff = isStaffOwnerOrCoManager(
    trainerProfile || (currentUser ? ({ ...currentUser, uid: currentUser.uid } as any) : null)
  );

  useEffect(() => {
    if (trainerProfile) {
      setProfileName(trainerProfile.displayName || currentUser?.displayName || '');
      setProfilePhone(trainerProfile.phone || '');
      setProfileDob(trainerProfile.dob || currentUser?.dob || '');
      if (trainerProfile.gender) setProfileGender(trainerProfile.gender);
      setProfileBio(trainerProfile.bio || '');
      setProfileSpec(trainerProfile.specializations || '');
      setProfilePhotoUrl(trainerProfile.photoUrl || currentUser?.photoUrl || '');
      setProfilePtAvailable(trainerProfile.ptAvailable ?? true);
    }
    if (currentUser) {
      setProfileUsername(currentUser.username || currentUser.uid);
      if (currentUser.password) setProfilePassword(currentUser.password);
      if (currentUser.dob) setProfileDob(currentUser.dob);
      if (currentUser.gender) setProfileGender(currentUser.gender);
    }
  }, [trainerProfile, currentUser]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveLoading(true);
    setProfileSaveNotice('');
    try {
      if (!profileName.trim()) throw new Error('Full Name cannot be empty.');
      if (!profileDob.trim()) throw new Error('Date of Birth is mandatory.');
      if (!profileGender.trim()) throw new Error('Gender selection is mandatory.');

      await updateTrainerProfile({
        displayName: profileName.trim(),
        username: profileUsername.trim().toLowerCase(),
        phone: profilePhone.trim(),
        dob: profileDob.trim(),
        gender: profileGender.trim(),
        bio: profileBio.trim(),
        specializations: profileSpec.trim(),
        ptAvailable: profilePtAvailable,
        photoUrl: profilePhotoUrl,
        password: profilePassword.trim() || undefined
      });

      setProfileSaveNotice('Trainer Profile & ID successfully updated!');
      setTimeout(() => setProfileSaveNotice(''), 4000);
    } catch (err: any) {
      setProfileSaveNotice('Error updating profile: ' + (err.message || 'Try again.'));
    } finally {
      setProfileSaveLoading(false);
    }
  };

  // Selected client for workout assignment / diet plan / schedule
  const [selectedPtClient, setSelectedPtClient] = useState<ClientProfile | null>(null);

  // Workout assignment form
  const [workoutTitle, setWorkoutTitle] = useState('');
  const [exName, setExName] = useState('');
  const [exSets, setExSets] = useState('3 Sets');
  const [exReps, setExReps] = useState('10-12 Reps');
  const [exInstructions, setExInstructions] = useState('');
  const [exForm, setExForm] = useState('');
  const [workoutSavedNotice, setWorkoutSavedNotice] = useState('');

  // Diet plan form
  const [dietTitle, setDietTitle] = useState('High-Protein Recomp Plan');
  const [dietGuidelines, setDietGuidelines] = useState('Drink 3.5L water daily. Eat whole proteins within 45 mins of training.');
  const [meal1Name, setMeal1Name] = useState('Eggs & Oats Breakfast');
  const [meal1Desc, setMeal1Desc] = useState('4 whole eggs, 60g rolled oats with almond milk.');
  const [meal2Name, setMeal2Name] = useState('Post-Workout Lunch');
  const [meal2Desc, setMeal2Desc] = useState('200g grilled chicken / paneer, 150g brown rice, sautéed greens.');
  const [dietSavedNotice, setDietSavedNotice] = useState('');

  // Schedule form (recurring time once, editable)
  const [scheduleTime, setScheduleTime] = useState('06:30 AM - 08:00 AM');
  const [scheduleDays, setScheduleDays] = useState('Mon, Wed, Fri');
  const [scheduleNotes, setScheduleNotes] = useState('Arrive 10 minutes prior for dynamic warm-up');
  const [schedSavedNotice, setSchedSavedNotice] = useState('');

  // Status check: Is Trainer Pending Admin Approval? (Section 3 requirement)
  const isPendingApproval =
    trainerProfile?.status === 'pending' ||
    trainerProfile?.status === 'pending_verification' ||
    trainerProfile?.isVerified === false ||
    (!trainerProfile && (currentUser?.status === 'pending' || currentUser?.status === 'pending_verification'));

  // Real-time listener on trainerProfile so Admin approval unlocks the dashboard immediately
  useEffect(() => {
    if (!currentUser) return;
    const unsubSelf = onSnapshot(
      doc(db, 'trainerProfiles', currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.status === 'active' && isPendingApproval) {
            refreshUserData();
          }
        }
      },
      (err) => console.warn('Trainer self listener note:', err)
    );
    return () => unsubSelf();
  }, [currentUser, isPendingApproval]);

  // Core Trainer Listeners (Clients & My PT Requests/Schedules/Diets)
  useEffect(() => {
    if (!currentUser || isPendingApproval) return;

    const unsubClients = onSnapshot(
      query(collection(db, 'clientProfiles'), limit(50)),
      (snap) => {
        const list = snap.docs.map((d) => ({ userId: d.id, ...d.data() } as ClientProfile));
        setAllGymClients(list);
        setCachedData('admin_clients', list);

        const myPt = list.filter(
          (c) => c.assignedTrainerId === currentUser.uid && c.ptStatus === 'active'
        );
        setPtClients(myPt);
        if (myPt.length > 0 && !selectedPtClient) {
          setSelectedPtClient(myPt[0]);
        }
      },
      (err) => console.warn('Trainer clients listener note:', err)
    );

    const reqQuery = query(
      collection(db, 'ptRequests'),
      where('trainerId', '==', currentUser.uid),
      limit(25)
    );
    const unsubReq = onSnapshot(
      reqQuery,
      (snap) => {
        setPtRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PtRequest)));
      },
      (err) => console.warn('Trainer ptRequests listener note:', err)
    );

    const schedQuery = query(
      collection(db, 'ptSchedules'),
      where('trainerId', '==', currentUser.uid),
      limit(25)
    );
    const unsubSched = onSnapshot(
      schedQuery,
      (snap) => {
        setPtSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PtSchedule)));
      },
      (err) => console.warn('Trainer ptSchedules listener note:', err)
    );

    const dietQuery = query(
      collection(db, 'dietPlans'),
      where('trainerId', '==', currentUser.uid),
      limit(25)
    );
    const unsubDiet = onSnapshot(
      dietQuery,
      (snap) => {
        setDietPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DietPlan)));
      },
      (err) => console.warn('Trainer dietPlans listener note:', err)
    );

    const unsubAnn = onSnapshot(
      query(collection(db, 'announcements'), limit(15)),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement));
          setAnnouncements(list);
          setCachedData('announcements_client', list);
        }
      },
      (err) => console.warn('Trainer announcements listener note:', err)
    );

    return () => {
      unsubClients();
      unsubReq();
      unsubSched();
      unsubDiet();
      unsubAnn();
    };
  }, [currentUser, isPendingApproval]);

  // On-Demand Secondary Listeners for Attendance & Aerobics tabs
  useEffect(() => {
    if (!currentUser || isPendingApproval) return;
    const unsubs: Array<() => void> = [];

    if (activeModule === 'attendance') {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'attendance'), limit(30)),
          (snap) => {
            const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
            logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setAttendanceLogs(logs);
            setCachedData('admin_attendance', logs);
          },
          (err) => console.warn('Trainer attendance listener note:', err)
        )
      );
    }

    if (activeModule === 'aerobicsBatches' || activeModule === 'attendance') {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'aerobicsBatches'), limit(20)),
          (snap) => {
            if (!snap.empty) {
              const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AerobicsBatch));
              setAerobicsBatches(list);
              setCachedData('admin_aerobics_batches', list);
            }
          },
          (err) => console.warn('Trainer aerobics listener note:', err)
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [currentUser, isPendingApproval, activeModule]);

  // Check if a member has an active Aerobics subscription
  const isAerobicsMember = (clientId: string, rec?: AttendanceRecord): boolean => {
    if (rec?.isAerobicsMember) return true;
    const cl = allGymClients.find(c => c.userId === clientId);
    const usr = allUsers.find(u => u.uid === clientId || u.username === clientId);
    const gender = (cl?.gender || usr?.gender || '').trim().toLowerCase();
    if (gender !== 'female') return false;
    if (cl?.aerobicsStatus === 'active') return true;
    return aerobicsBatches.some(
      b => b.active !== false && Array.isArray(b.enrolledClientIds) && b.enrolledClientIds.includes(clientId)
    );
  };

  // Female Trainer: Create New Aerobics Studio Batch
  const handleCreateTrainerAerobicsBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aeroBatchTitle.trim() || !currentUser) return;
    const id = `batch_${Date.now()}`;
    const newBatch: AerobicsBatch = {
      id,
      title: aeroBatchTitle.trim(),
      category: aeroBatchCategory,
      instructorId: currentUser.uid,
      instructorName: trainerProfile?.displayName || currentUser.displayName,
      daysOfWeek: aeroBatchDays.trim() || 'Mon - Sat',
      timeSlot: aeroBatchTimeSlot.trim() || 'Morning 07:00 AM - 08:00 AM',
      studioZone: 'Rose Aurora Studio A (Women Only)',
      intensity: 'High',
      maxCapacity: Math.max(5, Number(aeroBatchCapacity) || 25),
      monthlyPrice: Math.max(100, Number(aeroBatchMonthlyPrice) || 1499),
      quarterlyPrice: Math.max(100, Number(aeroBatchQuarterlyPrice) || 3999),
      enrolledClientIds: [],
      active: true,
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, 'aerobicsBatches', id), newBatch);
      setAeroBatchTitle('');
      setAeroNotice(`Published new Aerobics batch "${newBatch.title}"!`);
      setTimeout(() => setAeroNotice(''), 4000);
    } catch (err: any) {
      setAeroNotice('Error saving batch: ' + err.message);
    }
  };

  // Section 5.5: Trainer Accepts PT Request
  const handleAcceptPtRequest = async (request: PtRequest) => {
    try {
      // Acceptance makes payment due
      await updateDoc(doc(db, 'ptRequests', request.id), {
        status: 'accepted',
        updatedAt: new Date().toISOString()
      });
      alert(`Request from ${request.clientName} ACCEPTED. Payment is now due from client.`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Section 5.5: Trainer Rejects PT Request
  const handleRejectPtRequest = async (request: PtRequest) => {
    try {
      await updateDoc(doc(db, 'ptRequests', request.id), {
        status: 'rejected',
        updatedAt: new Date().toISOString()
      });
      alert(`Request from ${request.clientName} REJECTED. Client can pick another trainer.`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Section 5.2: Assign Workout to PT Client
  const handleSaveAssignedWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedPtClient) return;

    try {
      const workoutId = `assigned_${selectedPtClient.userId}_${Date.now()}`;
      const newWorkout: WorkoutPlan = {
        id: workoutId,
        title: workoutTitle || 'Trainer Custom Routine',
        category: 'PT Custom',
        goal: selectedPtClient.fitnessGoal || 'General Fitness',
        bodyPart: 'Full Body',
        clientId: selectedPtClient.userId,
        trainerId: currentUser.uid,
        isGeneral: false,
        exercises: [
          {
            name: exName || 'Flat Barbell Bench Press',
            sets: exSets,
            reps: exReps,
            instructions: exInstructions || 'Full range of motion, drive heels into floor.',
            formNotes: exForm || 'Squeeze chest at top lockout'
          }
        ],
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'workouts', workoutId), newWorkout);
      setWorkoutSavedNotice('Workout routine assigned directly to client!');
      setTimeout(() => setWorkoutSavedNotice(''), 3000);
      setWorkoutTitle('');
      setExName('');
    } catch (err: any) {
      alert('Error assigning workout: ' + err.message);
    }
  };

  // Section 5.3: Save PT Diet Plan
  const handleSaveDietPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedPtClient) return;

    try {
      const dietId = `diet_${selectedPtClient.userId}`;
      const newDiet: DietPlan = {
        id: dietId,
        clientId: selectedPtClient.userId,
        trainerId: currentUser.uid,
        title: dietTitle,
        guidelines: dietGuidelines,
        meals: [
          {
            mealTime: 'Meal 1 (Breakfast)',
            mealName: meal1Name,
            description: meal1Desc,
            proteinApprox: '35g Protein'
          },
          {
            mealTime: 'Meal 2 (Lunch)',
            mealName: meal2Name,
            description: meal2Desc,
            proteinApprox: '45g Protein'
          }
        ],
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'dietPlans', dietId), newDiet);
      setDietSavedNotice('Diet plan updated for client!');
      setTimeout(() => setDietSavedNotice(''), 3000);
    } catch (err: any) {
      alert('Error saving diet plan: ' + err.message);
    }
  };

  // Section 5.4: Save Recurring PT Schedule
  const handleSavePtSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedPtClient) return;

    try {
      const schedId = `sched_${selectedPtClient.userId}`;
      const newSched: PtSchedule = {
        id: schedId,
        clientId: selectedPtClient.userId,
        trainerId: currentUser.uid,
        clientName: selectedPtClient.displayName,
        recurringTime: scheduleTime,
        daysOfWeek: scheduleDays,
        notes: scheduleNotes,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'ptSchedules', schedId), newSched);
      setSchedSavedNotice('Recurring PT timing assigned!');
      setTimeout(() => setSchedSavedNotice(''), 3000);
    } catch (err: any) {
      alert('Error saving schedule: ' + err.message);
    }
  };

  // Section 3: If trainer is Pending Approval, display restricted pending screen
  if (isPendingApproval) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] text-slate-800 flex flex-col justify-between relative overflow-hidden">
        <div className="ambient-orb w-80 h-80 bg-amber-200/20 top-10 left-1/2 -translate-x-1/2" />
        <Header />
        <main className="max-w-md w-full mx-auto px-4 py-8 text-center space-y-4 relative z-10">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center mx-auto shadow-sm">
            <Clock className="w-8 h-8 animate-pulse" strokeWidth={1.75} />
          </div>

          <h2 className="text-xl font-black text-slate-800 tracking-tight">Pending Admin Verification</h2>

          <div className="p-5 vision-surface rounded-3xl border border-amber-300/60 shadow-xl text-left space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-700 text-xs font-bold">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" strokeWidth={1.75} />
                <span>Account Registration Under Review</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300">
                PENDING_VERIFICATION
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Welcome, <strong className="text-slate-900">{trainerProfile?.displayName || currentUser?.displayName}</strong>. Your Trainer profile has been created in the database and is queued in <strong className="text-indigo-700">Admin Domain 02 (Staff Verification Queue)</strong>.
            </p>
            <div className="p-3 bg-white/80 rounded-2xl border border-slate-200/80 text-[11px] text-slate-700 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Trainer Username / ID:</span>
                <strong className="font-mono text-indigo-700">@{currentUser?.uid}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Gender:</span>
                <strong className="text-slate-800">{trainerProfile?.gender || currentUser?.gender || 'Specified'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Mobile Number:</span>
                <strong className="text-slate-800">{trainerProfile?.phone || currentUser?.phone || 'Registered'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Specialization:</span>
                <strong className="text-slate-800">{trainerProfile?.specializations || 'Strength & Conditioning'}</strong>
              </div>
            </div>
            <div className="p-3 vision-inset rounded-2xl text-[11px] text-amber-800 font-semibold space-y-1">
              <p>• Access to Client details and confidential records is currently locked.</p>
              <p>• Once approved by Admin in Domain 02, all trainer modules will unlock automatically.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowTrainerLogoutModal(true)}
            className="px-5 py-2.5 vision-btn-neutral text-slate-700 hover:text-slate-900 text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out &amp; Return to Login</span>
          </button>
        </main>
        {renderTrainerLogoutModal()}
        {renderTrainerToast()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-800 flex flex-col justify-between relative overflow-hidden selection:bg-indigo-500/20 selection:text-indigo-800">
      {/* Subtle Ambient Light Orbs */}
      <div className="ambient-orb w-80 h-80 bg-indigo-300/20 -top-10 -right-10 pointer-events-none" />
      <div className="ambient-orb w-72 h-72 bg-sky-300/15 bottom-24 -left-10 pointer-events-none" />

      <Header
        onOpenProfile={() => setActiveModule('myProfile')}
        isProfileActive={activeModule === 'myProfile'}
        onOpenNotifications={() => setActiveModule('notifications')}
      />

      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-3 pb-24 space-y-4 relative z-10">
        {/* Dynamic Today's Birthday Alert (Renders ONLY when >= 1 member has a birthday today) */}
        <BirthdayAlertBanner
          clients={allGymClients}
          users={allUsers}
          viewerRole="trainer"
          viewerName={trainerProfile?.displayName || currentUser?.displayName || 'Coach'}
          viewerId={currentUser?.uid || 'trainer'}
          onViewProfile={(member) => {
            if (member.assignedTrainerId === currentUser?.uid && member.ptStatus === 'active') {
              setSelectedPtClient(member);
              setActiveModule('ptClients');
            } else {
              setActiveModule('allClients');
            }
          }}
        />

        {/* Trainer Profile Overview Banner */}
        <div className="bg-gradient-to-tr from-indigo-500 via-purple-500 to-sky-400 rounded-3xl p-5 text-white border border-white/60 shadow-[0_16px_36px_rgba(99,102,241,0.22),inset_0_1px_2px_rgba(255,255,255,0.7)] relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/20 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={
                  trainerProfile?.photoUrl ||
                  currentUser?.photoUrl ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
                }
                alt={currentUser?.displayName}
                className="w-12 h-12 rounded-2xl object-cover border-2 border-white/80 shadow-md ring-2 ring-white/30"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-black text-white tracking-tight">{currentUser?.displayName}</h2>
                  <TrainerIdentityBadge
                    badge={
                      trainerProfile?.badge ||
                      (currentUser?.uid.includes('hitesh')
                        ? 'crown'
                        : currentUser?.uid.includes('bhavesh')
                        ? 'shield'
                        : 'none')
                    }
                    showLabel={false}
                  />
                </div>
                <p className="text-xs text-white/90 font-medium">
                  {trainerProfile?.specializations || 'Certified Gym Coach'}
                </p>
                <div className="mt-1 flex items-center flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveModule('myProfile')}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg vision-btn-neutral text-slate-800 text-[10px] font-bold transition-colors shadow-xs"
                  >
                    <Edit className="w-3 h-3 text-indigo-600" strokeWidth={1.75} />
                    <span>Update Profile & ID</span>
                  </button>
                  {isFemaleTrainer && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-500/90 text-white text-[10px] font-black uppercase border border-white/60 shadow-xs">
                      <Sparkles className="w-3 h-3" />
                      Aerobics Coach Privileges
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right flex flex-col items-end justify-between self-stretch gap-2">
              <div>
                <span className="text-[10px] text-white/80 uppercase font-semibold block">PT Clients</span>
                <span className="text-lg font-black text-white">{ptClients.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTrainerLogoutModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-rose-500/80 text-white text-[11px] font-bold border border-white/30 shadow-xs backdrop-blur-sm transition-all active:scale-95 cursor-pointer"
                title="End Trainer Session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Trainer Modules Navigation Bar */}
        <div className="grid grid-cols-3 gap-1.5 vision-inset p-2 rounded-2xl">
          <button
            onClick={() => setActiveModule('ptClients')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'ptClients'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            My PT ({ptClients.length})
          </button>
          <button
            onClick={() => setActiveModule('assignWorkout')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'assignWorkout'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            Assign Workout
          </button>
          <button
            onClick={() => setActiveModule('dietPlan')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'dietPlan'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            Diet Plan
          </button>
          <button
            onClick={() => setActiveModule('schedule')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'schedule'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            PT Schedule
          </button>
          <button
            onClick={() => setActiveModule('ptRequests')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'ptRequests'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            Requests ({ptRequests.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveModule('allClients')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'allClients'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            All Clients
          </button>
          <button
            onClick={() => setActiveModule('attendance')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'attendance'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            Attendance
          </button>
          <button
            onClick={() => setActiveModule('notifications')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'notifications'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
            }`}
          >
            Alerts
          </button>
          <button
            onClick={() => setActiveModule('myProfile')}
            className={`py-2 px-1 text-[11px] font-bold rounded-xl transition-all duration-150 text-center ${
              activeModule === 'myProfile'
                ? 'vision-btn-aurora text-white shadow-md font-bold'
                : 'text-indigo-600 hover:text-indigo-800 hover:bg-white/40 font-bold'
            }`}
          >
            👤 My Profile
          </button>
          {isFemaleTrainer && (
            <button
              onClick={() => setActiveModule('aerobicsBatches')}
              className={`col-span-3 py-2.5 px-2 text-xs font-black rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 ${
                activeModule === 'aerobicsBatches'
                  ? 'bg-gradient-to-r from-rose-500 via-fuchsia-600 to-pink-600 text-white shadow-md'
                  : 'bg-rose-50/90 text-rose-800 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>✨ Aerobics Batches &amp; Enrolled Female Roster ({aerobicsBatches.filter(b => b.active !== false).length})</span>
            </button>
          )}
        </div>

        {/* MODULE 1: MY PT CLIENTS (Section 5.1) */}
        {activeModule === 'ptClients' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-orange-500 font-bold" />
              Assigned PT Clients ({ptClients.length})
            </h3>

            {ptClients.length === 0 ? (
              <div className="p-8 text-center clay-surface rounded-3xl border border-white/80 text-slate-600">
                No active PT clients assigned yet. Requests will appear in the 'Requests' tab.
              </div>
            ) : (
              ptClients.map((client) => (
                <div
                  key={client.userId}
                  onClick={() => setSelectedPtClient(client)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    selectedPtClient?.userId === client.userId
                      ? 'border-cyan-500/80 bg-[#EFF4FA] shadow-sm'
                      : 'border-white/80 bg-[#E2EAF3] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={client.photoUrl}
                      alt={client.displayName}
                      className="w-11 h-11 rounded-xl object-cover border border-cyan-500/30"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800">{client.displayName}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                          Active PT
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1 flex gap-3">
                        <span>Goal: <strong className="text-slate-700">{client.fitnessGoal}</strong></span>
                        <span>Wt: <strong className="text-slate-700">{client.weight || '--'}kg</strong></span>
                        <span>Ht: <strong className="text-slate-700">{formatHeight(client.height)}</strong></span>
                      </div>

                      {/* Direct Phone & Chat Contact Bar (Role-gated to Owner & Co-Manager only) */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-white/80">
                        {isPrivilegedStaff ? (
                          <div className="flex items-center gap-2">
                            {client.phone && (
                              <a
                                href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-xl font-bold border border-emerald-300 transition-colors"
                                title="Tap to trigger device native phone dialer"
                              >
                                <Phone className="w-3 h-3 text-emerald-600" />
                                <span>{client.phone}</span>
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setChatPartnerClient(client);
                                setIsChatOpen(true);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-700 font-bold bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-xl border border-indigo-200 transition-colors"
                              title="Direct chat with member"
                            >
                              <MessageSquare className="w-3 h-3 text-indigo-600" />
                              <span>Chat</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">
                            Direct calling &amp; chat restricted to Owner / Co-Manager
                          </span>
                        )}

                        <span className="text-[10px] text-slate-600 font-medium">Tap to Select</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* MODULE 2: WORKOUT ASSIGNMENT (Section 5.2) */}
        {activeModule === 'assignWorkout' && (
          <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">Assign Workout to PT Client</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Targeted exercises will automatically appear under the Client's 'My Workout' section.
              </p>
            </div>

            {ptClients.length === 0 ? (
              <p className="text-xs text-slate-600 italic">You need active PT clients to assign workouts.</p>
            ) : (
              <form onSubmit={handleSaveAssignedWorkout} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Client</label>
                  <select
                    value={selectedPtClient?.userId || ''}
                    onChange={(e) => setSelectedPtClient(ptClients.find(c => c.userId === e.target.value) || null)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  >
                    {ptClients.map(c => (
                      <option key={c.userId} value={c.userId} className="bg-[#E2EAF3]">{c.displayName} ({c.fitnessGoal})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Routine Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chest & Tricep Progressive Hypertrophy"
                    value={workoutTitle}
                    onChange={(e) => setWorkoutTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                <div className="p-3.5 bg-[#E2EAF3] rounded-2xl border border-white/80 space-y-2.5">
                  <span className="text-[11px] font-bold text-orange-500 font-bold uppercase block tracking-wider">Exercise Details</span>
                  <input
                    type="text"
                    required
                    placeholder="Exercise Name (e.g. Incline DB Press)"
                    value={exName}
                    onChange={(e) => setExName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#EFF4FA] text-slate-800 border border-white/80 rounded-xl"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Sets (e.g. 4 Sets)"
                      value={exSets}
                      onChange={(e) => setExSets(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-[#EFF4FA] text-slate-800 border border-white/80 rounded-xl"
                    />
                    <input
                      type="text"
                      placeholder="Reps (e.g. 10-12 Reps)"
                      value={exReps}
                      onChange={(e) => setExReps(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-[#EFF4FA] text-slate-800 border border-white/80 rounded-xl"
                    />
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Step-by-step instructions..."
                    value={exInstructions}
                    onChange={(e) => setExInstructions(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#EFF4FA] text-slate-800 border border-white/80 rounded-xl"
                  />

                  <input
                    type="text"
                    placeholder="Correct form cue (e.g. Keep shoulder blades pinched)"
                    value={exForm}
                    onChange={(e) => setExForm(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#EFF4FA] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                {workoutSavedNotice && (
                  <p className="text-xs text-emerald-400 font-bold">{workoutSavedNotice}</p>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 clay-btn-sunset text-white text-slate-800 hover:from-cyan-400 hover:to-blue-500 text-slate-800 text-xs font-bold rounded-xl shadow-md transition-all"
                >
                  Publish to Client's 'My Workout'
                </button>
              </form>
            )}
          </div>
        )}

        {/* MODULE 3: DIET PLAN (Section 5.3) */}
        {activeModule === 'dietPlan' && (
          <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">PT Client Nutrition Plan</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Visible only to the active PT client. General fitness and nutrition guidance.
              </p>
            </div>

            {ptClients.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No active PT clients available.</p>
            ) : (
              <form onSubmit={handleSaveDietPlan} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Client</label>
                  <select
                    value={selectedPtClient?.userId || ''}
                    onChange={(e) => setSelectedPtClient(ptClients.find(c => c.userId === e.target.value) || null)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  >
                    {ptClients.map(c => (
                      <option key={c.userId} value={c.userId} className="bg-[#E2EAF3]">{c.displayName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Diet Title</label>
                  <input
                    type="text"
                    required
                    value={dietTitle}
                    onChange={(e) => setDietTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">General Guidelines</label>
                  <textarea
                    rows={2}
                    value={dietGuidelines}
                    onChange={(e) => setDietGuidelines(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                <div className="space-y-2 pt-1 border-t border-white/80">
                  <span className="text-[11px] font-bold text-orange-500 font-bold block">Meal 1 (Breakfast)</span>
                  <input
                    type="text"
                    value={meal1Name}
                    onChange={(e) => setMeal1Name(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                  <input
                    type="text"
                    value={meal1Desc}
                    onChange={(e) => setMeal1Desc(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                <div className="space-y-2 pt-1 border-t border-white/80">
                  <span className="text-[11px] font-bold text-orange-500 font-bold block">Meal 2 (Lunch / Post-Workout)</span>
                  <input
                    type="text"
                    value={meal2Name}
                    onChange={(e) => setMeal2Name(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                  <input
                    type="text"
                    value={meal2Desc}
                    onChange={(e) => setMeal2Desc(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                {dietSavedNotice && (
                  <p className="text-xs text-emerald-400 font-bold">{dietSavedNotice}</p>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-800 text-xs font-bold rounded-xl shadow-md transition-all"
                >
                  Save & Publish Diet Plan
                </button>
              </form>
            )}
          </div>
        )}

        {/* MODULE 4: PT SCHEDULE (Section 5.4) */}
        {activeModule === 'schedule' && (
          <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">Assign Recurring PT Timing</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Assign regular training slot once. Client sees updated time automatically without daily assignment.
              </p>
            </div>

            {ptClients.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No active PT clients available.</p>
            ) : (
              <form onSubmit={handleSavePtSchedule} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Client</label>
                  <select
                    value={selectedPtClient?.userId || ''}
                    onChange={(e) => setSelectedPtClient(ptClients.find(c => c.userId === e.target.value) || null)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  >
                    {ptClients.map(c => (
                      <option key={c.userId} value={c.userId} className="bg-[#E2EAF3]">{c.displayName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Recurring Time Slot</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 07:00 AM - 08:30 AM"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Days of Week</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mon, Wed, Fri"
                    value={scheduleDays}
                    onChange={(e) => setScheduleDays(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trainer Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Bring hydration & lifting belt"
                    value={scheduleNotes}
                    onChange={(e) => setScheduleNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl"
                  />
                </div>

                {schedSavedNotice && (
                  <p className="text-xs text-emerald-400 font-bold">{schedSavedNotice}</p>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 clay-btn-sunset text-white text-slate-800 hover:from-cyan-400 hover:to-blue-500 text-slate-800 text-xs font-bold rounded-xl shadow-md transition-all"
                >
                  Save Recurring Schedule
                </button>
              </form>
            )}
          </div>
        )}

        {/* MODULE 5: PT REQUESTS (Section 5.5) */}
        {activeModule === 'ptRequests' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Inbox className="w-4 h-4 text-orange-500 font-bold" />
              Incoming PT Requests
            </h3>

            {ptRequests.length === 0 ? (
              <div className="p-8 text-center clay-surface rounded-3xl border border-white/80 text-slate-600">
                No PT requests received yet.
              </div>
            ) : (
              ptRequests.map((req) => (
                <div
                  key={req.id}
                  className="clay-surface rounded-2xl p-4 border border-white/80 shadow-md space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={req.clientPhotoUrl}
                      alt={req.clientName}
                      className="w-10 h-10 rounded-full object-cover border border-cyan-500/30"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800">{req.clientName}</h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            req.status === 'pending'
                              ? 'bg-amber-950/80 text-amber-600 font-bold border-amber-500/30'
                              : req.status === 'accepted'
                              ? 'bg-cyan-950/80 text-orange-500 font-bold border-cyan-500/30'
                              : req.status === 'active'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-950/80 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {req.status.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-600">
                        Requested: {new Date(req.requestedAt).toLocaleDateString()} • Fee: ₹{req.fee}
                      </span>
                    </div>
                  </div>

                  {req.status === 'pending' && (
                    <div className="flex gap-2 pt-2 border-t border-white/80">
                      <button
                        onClick={() => handleAcceptPtRequest(req)}
                        className="flex-1 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-sm"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Accept Request</span>
                      </button>
                      <button
                        onClick={() => handleRejectPtRequest(req)}
                        className="flex-1 py-1.5 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* MODULE 6: ALL GYM CLIENTS (Section 5.6 & 9) */}
        {activeModule === 'allClients' && (
          <div className="space-y-3">
            <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-2xl text-[11px] text-cyan-200 leading-relaxed">
              <strong className="text-slate-800">Trainer Privacy Notice (Section 5.6):</strong> You are granted access to basic fitness metrics and membership validity. Confidential data (phone numbers, billing history, payment methods, credentials) is strictly hidden.
            </div>

            <div className="space-y-2">
              {allGymClients.map((client) => (
                <div
                  key={client.userId}
                  className="clay-surface rounded-2xl p-3.5 border border-white/80 shadow-sm space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={client.photoUrl}
                      alt={client.displayName}
                      className="w-10 h-10 rounded-full object-cover border border-cyan-500/30"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <h4 className="text-xs font-bold text-slate-800">{client.displayName}</h4>
                          {isAerobicsMember(client.userId) && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-2xs">
                              ✨ AEROBICS
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            client.membershipStatus === 'active'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
                              : 'bg-[#E2EAF3] text-slate-600 border-white/80'
                          }`}
                        >
                          {client.membershipStatus.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-600">
                        Plan: {client.membershipPlanName || 'Standard'} • Expiry: {client.membershipEndDate || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Permitted Basic Fitness Info ONLY */}
                  <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/80 text-[10px] text-slate-700">
                    <div className="bg-[#E2EAF3] p-1.5 rounded-lg text-center border border-white/50">
                      Goal: <strong className="text-orange-500 font-bold">{client.fitnessGoal}</strong>
                    </div>
                    <div className="bg-[#E2EAF3] p-1.5 rounded-lg text-center border border-white/50">
                      Height: <strong className="text-slate-800">{formatHeight(client.height)}</strong>
                    </div>
                    <div className="bg-[#E2EAF3] p-1.5 rounded-lg text-center border border-white/50">
                      Weight: <strong className="text-slate-800">{client.weight || '--'}kg</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODULE 7: ATTENDANCE (Section 5.7) */}
        {activeModule === 'attendance' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-500 font-bold" />
                Live Gym Attendance Logs
              </h3>
              <span className="text-xs text-orange-500 font-bold bg-cyan-950/80 border border-cyan-500/30 px-2.5 py-0.5 rounded-full font-bold">
                {attendanceLogs.length} Entries
              </span>
            </div>

            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Recent Floor Check-in Logs
              </h4>

              {attendanceLogs.length === 0 ? (
                <div className="p-8 text-center clay-surface rounded-3xl border border-white/80 text-slate-600">
                  No entry logs recorded today.
                </div>
              ) : (
                <div className="space-y-2">
                  {attendanceLogs.map((log) => {
                    const hasAero = isAerobicsMember(log.clientId, log);
                    return (
                      <div
                        key={log.id}
                        className="clay-surface rounded-2xl p-3 border border-white/80 flex items-center justify-between shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={log.clientPhotoUrl}
                            alt={log.clientName}
                            className="w-8 h-8 rounded-full object-cover border border-cyan-500/30"
                          />
                          <div>
                            <div className="flex items-center flex-wrap gap-1.5">
                              <h4 className="text-xs font-bold text-slate-800">{log.clientName}</h4>
                              {hasAero && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-2xs">
                                  ✨ AEROBICS
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-600">
                              {log.entryDate} at {log.entryTime}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            log.sessionStatus === 'active'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
                              : 'bg-[#E2EAF3] text-slate-600 border-white/80'
                          }`}
                        >
                          {log.sessionStatus === 'active' ? 'Floor Active' : 'Completed'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* EXCLUSIVE FEMALE TRAINER MODULE: AEROBICS BATCHES & ENROLLED ROSTER */}
        {activeModule === 'aerobicsBatches' && isFemaleTrainer && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-4 rounded-3xl bg-gradient-to-r from-rose-50/95 via-white to-fuchsia-50/95 border border-rose-200/90 shadow-sm space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white">
                  Female Trainer Studio Hub
                </span>
                <span className="text-[10px] font-bold text-rose-700">
                  {aerobicsBatches.filter(b => b.active !== false).length} Active Batches
                </span>
              </div>
              <h3 className="text-sm font-black text-slate-900">
                Aerobics Batches &amp; Enrolled Female Clients
              </h3>
              <p className="text-xs text-slate-600">
                Manage Morning &amp; Evening studio batch timings, monitor capacity, and view enrolled female members.
              </p>
            </div>

            {aeroNotice && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                {aeroNotice}
              </div>
            )}

            {/* Batches & Enrolled Clients Cards */}
            <div className="space-y-3">
              {aerobicsBatches
                .filter(b => b.active !== false)
                .map(batch => {
                  const enrolledIds = Array.isArray(batch.enrolledClientIds) ? batch.enrolledClientIds : [];
                  const enrolledMembers = allGymClients.filter(
                    c => enrolledIds.includes(c.userId) || c.aerobicsBatchId === batch.id
                  );

                  return (
                    <div
                      key={batch.id}
                      className="p-4 rounded-3xl vision-card border border-rose-200/80 space-y-3 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-800">
                            {batch.category}
                          </span>
                          <h4 className="text-sm font-black text-slate-900 mt-1">{batch.title}</h4>
                          <p className="text-xs text-rose-700 font-bold mt-0.5">
                            {batch.timeSlot} • {batch.daysOfWeek}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-900 block">
                            {enrolledMembers.length} / {batch.maxCapacity}
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold">Enrolled</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200/70">
                          <span className="text-[10px] text-slate-500 block font-bold">Monthly Fee</span>
                          <strong className="text-slate-900 font-black">
                            ₹{(batch.monthlyPrice || 1499).toLocaleString('en-IN')}/mo
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-fuchsia-50/70 border border-fuchsia-200/70">
                          <span className="text-[10px] text-slate-500 block font-bold">Quarterly Fee</span>
                          <strong className="text-slate-900 font-black">
                            ₹{(batch.quarterlyPrice || 3999).toLocaleString('en-IN')}/3mo
                          </strong>
                        </div>
                      </div>

                      {/* Enrolled Female Clients in this batch */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-200/70">
                        <span className="text-[10px] font-black uppercase text-slate-500 block">
                          Enrolled Female Members ({enrolledMembers.length})
                        </span>
                        {enrolledMembers.length === 0 ? (
                          <p className="text-[11px] text-slate-400">No female members enrolled in this slot yet.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {enrolledMembers.map(member => (
                              <div
                                key={member.userId}
                                className="p-2.5 rounded-xl bg-white border border-rose-200/70 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <img
                                    src={member.photoUrl}
                                    alt={member.displayName}
                                    className="w-7 h-7 rounded-full object-cover border border-rose-200"
                                  />
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-slate-900">{member.displayName}</span>
                                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-rose-600 text-white">
                                        AEROBICS
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 block">
                                      Goal: {member.fitnessGoal || 'Fitness'} • Valid till {member.aerobicsEndDate || 'Active'}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setChatPartnerClient(member);
                                    setIsChatOpen(true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center gap-1"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span>Chat</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Female Trainer: Quick Add Studio Batch Form */}
            <form
              onSubmit={handleCreateTrainerAerobicsBatch}
              className="p-4 rounded-3xl vision-card border border-white/90 space-y-3 text-xs"
            >
              <h4 className="text-xs font-black uppercase text-rose-800 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>Add New Aerobics Studio Batch</span>
              </h4>
              <input
                type="text"
                required
                placeholder="Batch Name (e.g. Evening Zumba & Core Tone)"
                value={aeroBatchTitle}
                onChange={(e) => setAeroBatchTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-bold text-slate-800"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Morning 07:00 AM - 08:00 AM"
                  value={aeroBatchTimeSlot}
                  onChange={(e) => setAeroBatchTimeSlot(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-semibold text-slate-800"
                />
                <input
                  type="text"
                  required
                  placeholder="Mon - Sat"
                  value={aeroBatchDays}
                  onChange={(e) => setAeroBatchDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-semibold text-slate-800"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Capacity</label>
                  <input
                    type="number"
                    min={5}
                    value={aeroBatchCapacity}
                    onChange={(e) => setAeroBatchCapacity(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Monthly ₹</label>
                  <input
                    type="number"
                    min={100}
                    value={aeroBatchMonthlyPrice}
                    onChange={(e) => setAeroBatchMonthlyPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quarterly ₹</label>
                  <input
                    type="number"
                    min={100}
                    value={aeroBatchQuarterlyPrice}
                    onChange={(e) => setAeroBatchQuarterlyPrice(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 font-bold text-slate-800"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white font-bold shadow-sm"
              >
                + Publish Aerobics Batch
              </button>
            </form>
          </div>
        )}

        {/* MODULE 8: TRAINER NOTIFICATIONS (Section 5.8) */}
        {activeModule === 'notifications' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-500 font-bold" />
              Operational Announcements & Alerts
            </h3>

            <div className="space-y-2">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="clay-surface rounded-2xl p-4 border border-white/80 space-y-1 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800">{ann.title}</h4>
                    <span className="text-[10px] font-bold uppercase text-orange-500 font-bold bg-cyan-950/80 border border-cyan-500/30 px-2 py-0.5 rounded-md">
                      {ann.priority}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{ann.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODULE 9: MY PROFILE & TRAINER ID */}
        {activeModule === 'myProfile' && (
          <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">My Trainer Profile & ID</h3>
                <p className="text-xs text-slate-600">
                  Manage and update your public coach ID, name, birth date, specializations, and password.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <TrainerIdentityBadge
                  badge={
                    trainerProfile?.badge ||
                    (currentUser?.uid.includes('hitesh')
                      ? 'crown'
                      : currentUser?.uid.includes('bhavesh')
                      ? 'shield'
                      : 'none')
                  }
                />
              </div>
            </div>

            {profileSaveNotice && (
              <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 font-semibold flex items-center gap-2 animate-scale-up">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{profileSaveNotice}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Photo Uploader */}
              <div className="p-4 bg-[#E2EAF3] rounded-2xl border border-white/80 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Coach Profile Picture
                </label>
                <PhotoUploader
                  label="Change Profile Photo"
                  defaultPhoto={profilePhotoUrl}
                  onPhotoSelected={(url) => setProfilePhotoUrl(url)}
                />
              </div>

              {/* Personal Identification Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Display Name / Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl focus:border-cyan-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Trainer ID / Username
                  </label>
                  <input
                    type="text"
                    required
                    value={profileUsername}
                    onChange={(e) => setProfileUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl focus:border-cyan-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">Unique login handle</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Date of Birth *</span>
                    <span className="text-[10px] text-orange-500 font-bold font-semibold">(Mandatory)</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().split('T')[0]}
                    value={profileDob}
                    onChange={(e) => setProfileDob(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl focus:border-cyan-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 00000"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Gender *
                  </label>
                  <select
                    required
                    value={profileGender}
                    onChange={(e) => setProfileGender(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl focus:border-cyan-500 font-bold"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Professional Specializations & Bio */}
              <div className="space-y-3 pt-2 border-t border-white/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Specializations & Expertise
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Strength & Conditioning, Hypertrophy, Powerlifting"
                    value={profileSpec}
                    onChange={(e) => setProfileSpec(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Trainer Bio & Overview
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Brief description of coaching philosophy, experience, and accomplishments..."
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-[#E2EAF3] text-slate-800 border border-white/80 rounded-xl focus:border-cyan-500 leading-relaxed"
                  />
                </div>

                <div className="p-3.5 bg-[#E2EAF3] rounded-2xl border border-white/80 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Accepting PT Requests</h4>
                    <p className="text-[11px] text-slate-600">
                      Allow members to send you personal training requests.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={profilePtAvailable}
                    onChange={(e) => setProfilePtAvailable(e.target.checked)}
                    className="w-4 h-4 text-cyan-500 bg-[#EFF4FA] border-slate-300 rounded-md focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Password Section */}
              <div className="p-4 bg-[#E2EAF3] rounded-2xl border border-white/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Trainer Account Password</h4>
                    <p className="text-[11px] text-slate-600">Update your account login password anytime.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPasswordInput(!showPasswordInput)}
                    className="text-xs font-bold text-orange-500 font-bold hover:text-orange-500 font-bold underline"
                  >
                    {showPasswordInput ? 'Hide Password Field' : 'Change Password'}
                  </button>
                </div>

                {showPasswordInput && (
                  <div className="pt-2 space-y-1 animate-fade-in">
                    <label className="block text-[11px] font-semibold text-slate-600">New Password</label>
                    <input
                      type="text"
                      placeholder="Enter new password (min 6 characters)"
                      value={profilePassword}
                      onChange={(e) => setProfilePassword(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs bg-[#EFF4FA] text-slate-800 border border-white/80 rounded-xl focus:border-cyan-500 font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Save Button */}
              <button
                type="submit"
                disabled={profileSaveLoading}
                className="w-full py-3 clay-btn-sunset text-white text-slate-800 hover:from-cyan-400 hover:to-blue-500 text-slate-800 text-xs font-bold rounded-2xl shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{profileSaveLoading ? 'Saving Changes...' : 'Save Profile & Trainer ID Updates'}</span>
              </button>
            </form>

            {/* Trainer Session Logout Section */}
            <div className="pt-3 border-t border-white/80">
              <button
                type="button"
                onClick={() => setShowTrainerLogoutModal(true)}
                className="w-full py-3 vision-card hover:bg-rose-50/80 text-rose-700 hover:text-rose-800 border border-rose-200/60 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-600" />
                <span>Log Out of Trainer Session</span>
              </button>
              <p className="text-[11px] text-slate-500 text-center mt-1.5">
                End your coaching session securely. You can sign back in anytime with your Trainer ID and password.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* DIRECT CHAT MODAL (TRAINER TO CLIENT) */}
      {chatPartnerClient && (
        <DirectChatModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          currentUserId={currentUser?.uid || ''}
          currentUserName={trainerProfile?.displayName || currentUser?.displayName || 'Trainer'}
          currentUserRole="trainer"
          partnerId={chatPartnerClient.userId}
          partnerName={chatPartnerClient.displayName}
          partnerRole="client"
          partnerPhotoUrl={chatPartnerClient.photoUrl}
          partnerPhone={chatPartnerClient.phone}
        />
      )}

      {/* 2-STEP TRAINER LOGOUT MODAL & TOAST */}
      {renderTrainerLogoutModal()}
      {renderTrainerToast()}
    </div>
  );
};
