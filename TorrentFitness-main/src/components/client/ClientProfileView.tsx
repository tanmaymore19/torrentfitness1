import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PhotoUploader } from '../common/PhotoUploader';
import {
  Phone,
  AlertTriangle,
  LogOut,
  Trash2,
  CheckCircle2,
  MessageSquare,
  FileText,
  ArrowLeft,
  Receipt,
  User,
  MapPin
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, addDoc, onSnapshot, query, limit } from 'firebase/firestore';
import { TrainerProfile } from '../../types';
import { DirectChatModal } from '../common/DirectChatModal';
import { ClientPaymentHistorySection } from './ClientPaymentHistorySection';
import { parseHeight, formatHeight } from '../../utils/heightUtils';

interface ClientProfileViewProps {
  onBack?: () => void;
  initialSubTab?: 'overview' | 'bills';
}

export const ClientProfileView: React.FC<ClientProfileViewProps> = ({
  onBack,
  initialSubTab = 'overview'
}) => {
  const { currentUser, clientProfile, updateClientProfile, logout, deleteAccount } = useAuth();

  // Dedicated Profile Sub-View: 'overview' (Profile & Settings) vs 'bills' (My Bills)
  const [profileSection, setProfileSection] = useState<'overview' | 'bills'>(initialSubTab);

  // Profile edit states
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(clientProfile?.displayName || '');
  const [photoUrl, setPhotoUrl] = useState(clientProfile?.photoUrl || '');
  const [phone, setPhone] = useState(clientProfile?.phone || '');
  const [age, setAge] = useState<number>(clientProfile?.age || 24);
  const initialParsedHeight = parseHeight(clientProfile?.height);
  const [heightFeet, setHeightFeet] = useState<number>(initialParsedHeight.feet);
  const [heightInches, setHeightInches] = useState<number>(initialParsedHeight.inches);
  const [weight, setWeight] = useState<number>(clientProfile?.weight || 72);
  const [fitnessGoal, setFitnessGoal] = useState(clientProfile?.fitnessGoal || 'General Fitness');
  const [profileNotice, setProfileNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (clientProfile?.height) {
      const parsed = parseHeight(clientProfile.height);
      setHeightFeet(parsed.feet);
      setHeightInches(parsed.inches);
    }
  }, [clientProfile?.height]);

  // Trainers & Direct Chat
  const [trainers, setTrainers] = useState<TrainerProfile[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPartnerTrainer, setChatPartnerTrainer] = useState<TrainerProfile | null>(null);

  useEffect(() => {
    const unsubTrainers = onSnapshot(
      query(collection(db, 'trainerProfiles'), limit(20)),
      (snap) => {
        setTrainers(snap.docs.map((d) => ({ trainerId: d.id, ...d.data() } as TrainerProfile)));
      },
      (err) => console.warn('Trainer profile listener note:', err)
    );
    return () => unsubTrainers();
  }, []);

  // Rating & Feedback Modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackTarget, setFeedbackTarget] = useState<'gym' | 'trainer' | 'service'>('gym');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Delete Account Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileNotice(null);
    try {
      const totalInches = (heightFeet * 12) + heightInches;
      await updateClientProfile({
        displayName,
        photoUrl: photoUrl || currentUser?.photoUrl,
        phone,
        age: Number(age),
        height: totalInches,
        weight: Number(weight),
        fitnessGoal
      });
      setIsEditing(false);
      setProfileNotice({ type: 'success', text: 'Profile details updated successfully.' });
    } catch (err: any) {
      setProfileNotice({ type: 'error', text: 'Error updating profile: ' + (err.message || 'Please try again') });
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      await addDoc(collection(db, 'feedback'), {
        clientId: currentUser.uid,
        clientName: currentUser.displayName,
        target: feedbackTarget,
        rating: feedbackRating,
        comment: feedbackComment,
        createdAt: new Date().toISOString()
      });
      setFeedbackSubmitted(true);
      setTimeout(() => {
        setFeedbackSubmitted(false);
        setShowFeedbackModal(false);
        setFeedbackComment('');
      }, 1500);
    } catch (err: any) {
      setProfileNotice({ type: 'error', text: 'Feedback submission error: ' + (err.message || '') });
    }
  };

  const handleDeleteAccountConfirm = async () => {
    setDeleteError('');
    if (deleteConfirmationText !== 'DELETE') {
      setDeleteError('Please type DELETE in capital letters to confirm.');
      return;
    }
    try {
      await deleteAccount();
    } catch (err: any) {
      setDeleteError('Deletion error: ' + (err.message || 'Please try again'));
    }
  };

  return (
    <div className="space-y-4 pb-20 text-slate-800 animate-fade-in">
      {/* Top Navigation & Back Bar */}
      <div className="flex items-center justify-between px-1">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 vision-card text-xs font-bold text-slate-700 hover:text-indigo-600 rounded-xl transition-all shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
        ) : (
          <span className="text-xs font-bold text-slate-500">Member Profile</span>
        )}
        <button
          type="button"
          onClick={logout}
          title="Sign out of Torrent Fitness"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/90 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-600" strokeWidth={2} />
          <span>Log Out</span>
        </button>
      </div>

      {/* Dedicated Profile Switcher: Account Overview vs My Bills */}
      <div className="grid grid-cols-2 gap-2 p-1.5 vision-surface rounded-2xl border border-white/85 shadow-sm">
        <button
          type="button"
          onClick={() => setProfileSection('overview')}
          className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${
            profileSection === 'overview'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <User className="w-4 h-4 shrink-0" />
          <span>Profile &amp; Account</span>
        </button>

        <button
          type="button"
          onClick={() => setProfileSection('bills')}
          className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${
            profileSection === 'bills'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Receipt className="w-4 h-4 shrink-0" />
          <span>My Bills</span>
        </button>
      </div>

      {profileNotice && (
        <div
          className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            profileNotice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{profileNotice.text}</span>
          <button
            type="button"
            onClick={() => setProfileNotice(null)}
            className="text-slate-400 hover:text-slate-700 px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 2: DEDICATED "MY BILLS" VIEW (Exclusively in Profile Section) */}
      {profileSection === 'bills' ? (
        <ClientPaymentHistorySection />
      ) : (
        /* TAB 1: PROFILE OVERVIEW & ACCOUNT SETTINGS */
        <>
          {/* Profile Overview Card */}
          <div className="vision-surface rounded-3xl p-5 border border-white/80 text-center relative overflow-hidden shadow-xl">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative w-20 h-20 mx-auto rounded-full overflow-hidden border-2 border-indigo-400/80 shadow-lg ring-4 ring-indigo-500/10">
              <img
                src={
                  clientProfile?.photoUrl ||
                  currentUser?.photoUrl ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
                }
                alt="Profile"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <h2 className="text-base font-black text-slate-900 mt-3 tracking-tight">
              {clientProfile?.displayName || currentUser?.displayName}
            </h2>
            <p className="text-xs text-indigo-600 font-bold font-mono mt-0.5">
              @{currentUser?.username}
            </p>

            {/* Membership status summary & Queued Next Plan Badge */}
            <div className="mt-2.5 flex flex-col items-center gap-1.5">
              <span
                className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                  String(clientProfile?.membershipStatus || '').toLowerCase() === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {String(clientProfile?.membershipStatus || '').toLowerCase() === 'active'
                  ? `ACTIVE: ${clientProfile?.membershipPlanName || clientProfile?.membershipPlan || 'Member'}`
                  : 'No Active Membership'}
              </span>

              {/* Seamless Membership Stacking Badge */}
              {clientProfile?.queuedPlanName && clientProfile?.queuedStartDate && (
                <div className="w-full max-w-md p-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl text-center shadow-xs animate-fade-in">
                  <span className="text-[11px] font-black text-indigo-950 block">
                    Current Plan: Active until {clientProfile?.membershipEndDate || clientProfile?.membershipExpiryDate || 'Current Expiry'} | Next Plan: Queued to start on {clientProfile.queuedStartDate}
                  </span>
                  <span className="text-[10px] text-indigo-700 font-semibold block mt-0.5">
                    Upcoming: {clientProfile.queuedPlanName} ({clientProfile.queuedDurationMonths || 1}M) - Automatically queued without losing any active days!
                  </span>
                </div>
              )}
            </div>

            {/* Quick Action Buttons: Edit Profile & My Bills */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="px-4 py-2 text-xs font-bold vision-card hover:bg-white text-slate-800 border border-slate-200/90 rounded-xl transition-all shadow-2xs"
              >
                {isEditing ? 'Cancel Editing' : 'Edit Fitness Metrics'}
              </button>
              <button
                type="button"
                onClick={() => setProfileSection('bills')}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-xs inline-flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>My Bills &amp; Invoices</span>
              </button>
            </div>
          </div>

          {/* Assigned Personal Trainer & Direct Contact Card */}
          {clientProfile?.assignedTrainerId && (
            <div className="vision-surface rounded-3xl p-5 text-slate-800 border border-indigo-200/80 shadow-lg space-y-3.5 relative overflow-hidden">
              <div className="flex items-center justify-between relative z-10">
                <span className="text-[11px] font-bold text-indigo-700">
                  My Assigned Personal Trainer
                </span>
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Active Coaching
                </span>
              </div>

              {(() => {
                const assignedTr = trainers.find((t) => t.trainerId === clientProfile.assignedTrainerId);
                const coachName = (clientProfile?.assignedTrainerName || assignedTr?.displayName || '').toLowerCase();
                const coachId = (clientProfile?.assignedTrainerId || assignedTr?.trainerId || '').toLowerCase();
                const coachPhone =
                  coachId.includes('hitesh') || coachName.includes('hitesh')
                    ? '8208002585'
                    : coachId.includes('bhavesh') || coachName.includes('bhavesh')
                    ? '9607292842'
                    : assignedTr?.phone || '8208002585';
                const cleanPhone = coachPhone.replace(/[^\d+]/g, '');

                return (
                  <div className="relative z-10 space-y-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          assignedTr?.photoUrl ||
                          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
                        }
                        alt={clientProfile.assignedTrainerName || 'Trainer'}
                        referrerPolicy="no-referrer"
                        className="w-13 h-13 rounded-2xl object-cover border border-slate-200 shadow-xs shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-slate-900 truncate">
                            {clientProfile.assignedTrainerName || assignedTr?.displayName || 'Coach'}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {assignedTr?.specializations || 'Certified Torrent Fitness Coach'}
                        </p>

                        <div className="mt-1.5 flex items-center gap-2">
                          <a
                            href={`tel:${cleanPhone}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-200"
                          >
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{coachPhone}</span>
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call Coach</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          const trId = clientProfile?.assignedTrainerId || 'trainer_hitesh_rajput';
                          setChatPartnerTrainer(
                            assignedTr || {
                              trainerId: trId,
                              displayName: clientProfile?.assignedTrainerName || 'Coach',
                              photoUrl:
                                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                              phone: coachPhone,
                              badge: trId.includes('hitesh') ? 'crown' : trId.includes('bhavesh') ? 'shield' : 'none',
                              specializations: 'Personal Coaching',
                              ptAvailable: true,
                              status: 'active',
                              rating: 5.0,
                              createdAt: ''
                            }
                          );
                          setIsChatOpen(true);
                        }}
                        className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Direct Chat</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Edit Profile Form */}
          {isEditing ? (
            <form
              onSubmit={handleSaveProfile}
              className="vision-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Update Profile Details</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <PhotoUploader
                label="Replace Profile Photo"
                required={true}
                defaultPhoto={photoUrl}
                onPhotoSelected={(url) => setPhotoUrl(url)}
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="+91..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Height</span>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded">
                      {heightFeet} ft {heightInches} in
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={heightFeet}
                      onChange={(e) => setHeightFeet(Number(e.target.value))}
                      className="w-full px-2 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl font-bold"
                    >
                      {[4, 5, 6, 7].map((f) => (
                        <option key={f} value={f}>
                          {f} ft
                        </option>
                      ))}
                    </select>
                    <select
                      value={heightInches}
                      onChange={(e) => setHeightInches(Number(e.target.value))}
                      className="w-full px-2 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl font-bold"
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((inc) => (
                        <option key={inc} value={inc}>
                          {inc} in
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Goal</label>
                <select
                  value={fitnessGoal}
                  onChange={(e) => setFitnessGoal(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl"
                >
                  <option value="Muscle Gain">Muscle Gain</option>
                  <option value="Fat Loss">Fat Loss</option>
                  <option value="Strength">Strength</option>
                  <option value="Endurance">Endurance</option>
                  <option value="General Fitness">General Fitness</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                Save Changes
              </button>
            </form>
          ) : (
            /* Metrics Display */
            <div className="grid grid-cols-3 gap-2.5 tabular-nums">
              <div className="vision-card p-3.5 rounded-2xl border border-white/80 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Height</span>
                <span className="text-sm sm:text-base font-black text-slate-900 mt-0.5 block truncate">
                  {formatHeight(clientProfile?.height)}
                </span>
              </div>
              <div className="vision-card p-3.5 rounded-2xl border border-white/80 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Weight</span>
                <span className="text-base font-black text-slate-900 mt-0.5 block">
                  {clientProfile?.weight || '--'} <span className="text-xs font-normal text-slate-500">kg</span>
                </span>
              </div>
              <div className="vision-card p-3.5 rounded-2xl border border-white/80 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Age</span>
                <span className="text-base font-black text-slate-900 mt-0.5 block">
                  {clientProfile?.age || '--'} <span className="text-xs font-normal text-slate-500">Yrs</span>
                </span>
              </div>
            </div>
          )}

          {/* Feedback Trigger */}
          <div className="vision-surface rounded-2xl p-4 border border-white/80 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                Rate Gym &amp; Trainers
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Share your workout experience or service feedback.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFeedbackModal(true)}
              className="px-3.5 py-2 text-xs font-bold bg-white hover:bg-slate-50 text-indigo-700 border border-slate-200 rounded-xl transition-all shadow-2xs whitespace-nowrap"
            >
              Give Rating
            </button>
          </div>

          {/* Official Gym Location & Facility Details */}
          <div className="vision-card rounded-2xl p-4 border border-white/80 text-[11px] text-slate-600 space-y-2 leading-relaxed">
            <div className="font-bold text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                Official Gym Facility &amp; Location
              </span>
              <a
                href="tel:8208002585"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-2xs transition-all"
              >
                <Phone className="w-2.5 h-2.5" />
                <span>Call Desk: 8208002585</span>
              </a>
            </div>
            <p className="text-slate-800 font-bold">
              Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[10px] text-slate-500 font-semibold">
              <span>Operating Schedule: 5:30 AM - 10:30 PM (Mon - Sun)</span>
              <span>•</span>
              <span>Official Phone: 8208002585</span>
            </div>
          </div>

          {/* Disclaimers & Gym Policies */}
          <div className="vision-card rounded-2xl p-4 border border-white/80 text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              Torrent Fitness Policies &amp; Health Disclaimer
            </div>
            <p>• Membership validity ends automatically upon plan expiration. No in-app refunds.</p>
            <p>• Fitness Analysis is an educational guideline based on standard physiological formulas, not clinical diagnosis.</p>
            <p>• Always re-rack weights and scan the reception QR code upon entering.</p>
          </div>

          {/* Session Logout & Account Deletion */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={logout}
              className="w-full py-3 vision-card hover:bg-white text-slate-800 border border-white/80 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <LogOut className="w-4 h-4 text-slate-600" />
              <span>Log Out of Session (Keeps Account Safe)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="w-full py-2.5 text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account Permanently</span>
            </button>
          </div>
        </>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm vision-surface rounded-3xl p-5 shadow-2xl border border-white/90 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900">Gym Feedback &amp; Rating</h3>
              <button
                type="button"
                onClick={() => setShowFeedbackModal(false)}
                className="text-slate-500 hover:text-slate-800 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Feedback Target</label>
                <select
                  value={feedbackTarget}
                  onChange={(e) => setFeedbackTarget(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl"
                >
                  <option value="gym">Gym Arena &amp; Equipment</option>
                  <option value="trainer">Trainer Guidance</option>
                  <option value="service">Cleanliness &amp; Amenities</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Star Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className={`text-xl ${feedbackRating >= star ? 'text-amber-400' : 'text-slate-300'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Review Comments</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Tell us what you like or how we can improve..."
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white text-slate-900 border border-slate-200 rounded-xl"
                />
              </div>

              {feedbackSubmitted ? (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold text-center rounded-xl">
                  Thank you! Feedback received.
                </div>
              ) : (
                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Submit Feedback
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Account Deletion Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm vision-surface rounded-3xl p-5 shadow-2xl border border-rose-300 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Permanently Delete Account?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                This will deactivate your credentials, attendance logs, and workout records permanently.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Type <span className="text-rose-600 font-mono">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 text-xs bg-white text-slate-900 border border-rose-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono uppercase"
              />
              {deleteError && (
                <p className="text-[11px] font-bold text-rose-600">{deleteError}</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmationText('');
                  setDeleteError('');
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccountConfirm}
                disabled={deleteConfirmationText !== 'DELETE'}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Chat Modal with Trainer */}
      {isChatOpen && chatPartnerTrainer && currentUser && (
        <DirectChatModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          currentUserId={currentUser.uid}
          currentUserName={currentUser.displayName}
          currentUserRole="client"
          partnerId={chatPartnerTrainer.trainerId}
          partnerName={chatPartnerTrainer.displayName}
          partnerRole="trainer"
          partnerPhotoUrl={chatPartnerTrainer.photoUrl}
          partnerPhone={chatPartnerTrainer.phone}
          partnerBadge={chatPartnerTrainer.badge}
        />
      )}
    </div>
  );
};
