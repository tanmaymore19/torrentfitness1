import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, updateDoc, collection, query, where, getDocs, getDoc, setDoc } from 'firebase/firestore';
import { ClientProfile, UserAccount, AttendanceRecord, MembershipRecord, FitnessAnalysisResult, DietPlan } from '../../types';
import { DeleteAccountTarget } from './DeleteAccountModal';
import { copyToClipboard } from '../../utils/clipboard';
import { formatHeight } from '../../utils/heightUtils';

const ClientAttendanceAnalytics = React.lazy(() =>
  import('./ClientAttendanceAnalytics').then((m) => ({ default: m.ClientAttendanceAnalytics }))
);
import {
  User,
  Calendar,
  Clock,
  CreditCard,
  Key,
  Copy,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  Eye,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Activity,
  Award,
  Sparkles,
  Scale,
  Flame,
  Ruler,
  Apple,
  Droplets,
  Sun,
  Moon,
  Coffee,
  Cookie,
  Pill
} from 'lucide-react';

interface ClientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientProfile | null;
  user: UserAccount | null;
  allAttendance: AttendanceRecord[];
  allMemberships: MembershipRecord[];
  onRequestPasswordChange: (client: ClientProfile, userPass: string) => void;
  onRequestDelete: (target: DeleteAccountTarget) => void;
  onClientUpdated?: (updated: ClientProfile) => void;
  initialTab?: 'overview' | 'attendance' | 'memberships' | 'fitness';
}

export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  isOpen,
  onClose,
  client,
  user,
  allAttendance,
  allMemberships,
  onRequestPasswordChange,
  onRequestDelete,
  onClientUpdated,
  initialTab = 'overview'
}) => {
  if (!isOpen || !client) return null;

  const [currentEndDate, setCurrentEndDate] = useState<string>(client.membershipEndDate || '');
  const [customNewDate, setCustomNewDate] = useState<string>(client.membershipEndDate || '');
  const [isUpdatingDuration, setIsUpdatingDuration] = useState<boolean>(false);
  const [durationFeedback, setDurationFeedback] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'memberships' | 'fitness' | 'diet'>(initialTab);
  const [fitnessHistory, setFitnessHistory] = useState<FitnessAnalysisResult[]>([]);

  // Diet & Nutrition Plan state for client
  const [dietTitle, setDietTitle] = useState('Personalized High-Protein Protocol');
  const [dietCalories, setDietCalories] = useState<number>(2200);
  const [dietProtein, setDietProtein] = useState<number>(140);
  const [dietCarbs, setDietCarbs] = useState<number>(220);
  const [dietFats, setDietFats] = useState<number>(55);
  const [dietWater, setDietWater] = useState<number>(3.5);
  const [dietBreakfast, setDietBreakfast] = useState('');
  const [dietLunch, setDietLunch] = useState('');
  const [dietSnacks, setDietSnacks] = useState('');
  const [dietDinner, setDietDinner] = useState('');
  const [dietGuidelines, setDietGuidelines] = useState('');
  const [dietSupplements, setDietSupplements] = useState('');
  const [isSavingDiet, setIsSavingDiet] = useState(false);
  const [dietFeedback, setDietFeedback] = useState('');

  useEffect(() => {
    setCurrentEndDate(client.membershipEndDate || '');
    setCustomNewDate(client.membershipEndDate || '');
    setDurationFeedback('');
    setDietFeedback('');
    if (initialTab) {
      setActiveTab(initialTab);
    }

    if (client?.userId) {
      const qHist = query(
        collection(db, 'fitnessAnalysisHistory'),
        where('clientId', '==', client.userId)
      );
      getDocs(qHist).then((snap) => {
        const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as FitnessAnalysisResult));
        records.sort((a, b) => new Date(b.createdAt || b.analysisDate).getTime() - new Date(a.createdAt || a.analysisDate).getTime());
        setFitnessHistory(records);
      }).catch(err => console.warn('Could not load fitness history:', err));

      // Load assigned Diet Plan for client
      getDoc(doc(db, 'dietPlans', `diet_${client.userId}`)).then((snap) => {
        if (snap.exists()) {
          const d = snap.data() as DietPlan;
          setDietTitle(d.title || `${client.displayName}'s Nutrition Protocol`);
          setDietCalories(d.dailyCalories || 2200);
          setDietProtein(d.proteinGrams || 140);
          setDietCarbs(d.carbsGrams || 220);
          setDietFats(d.fatsGrams || 55);
          setDietWater(d.waterIntakeLiters || 3.5);
          setDietBreakfast(d.breakfast || '');
          setDietLunch(d.lunch || '');
          setDietSnacks(d.snacks || '');
          setDietDinner(d.dinner || '');
          setDietGuidelines(d.guidelines || '');
          setDietSupplements(d.supplements || '');
        } else {
          setDietTitle(`${client.displayName}'s ${client.fitnessGoal || 'Nutrition'} Protocol`);
          setDietCalories(2200);
          setDietProtein(140);
          setDietCarbs(220);
          setDietFats(55);
          setDietWater(3.5);
          setDietBreakfast('4 Egg Whites + 1 Whole Egg, 60g Rolled Oats with warm almond milk, 1 Banana.');
          setDietLunch('180g Grilled Chicken Breast / Low-fat Paneer, 150g Basmati Rice, 1 bowl Dal, Mixed Greens.');
          setDietSnacks('Handful of roasted almonds, 1 scoop Whey Protein, 1 Apple or Green Tea.');
          setDietDinner('150g Steamed Fish / Tofu Stir-Fry, 2 Multigrain Rotis, Sautéed seasonal vegetables.');
          setDietGuidelines('Drink at least 3-4 liters of water daily. Avoid sugary soda and ultra-processed seed oils.');
          setDietSupplements('Whey Protein (1 scoop post-workout), Creatine Monohydrate (5g daily), Multivitamin with breakfast.');
        }
      }).catch(err => console.warn('Could not load client diet:', err));
    }
  }, [client, initialTab, isOpen]);

  // Client's specific attendance records
  const clientAttendance = allAttendance
    .filter(a => a.clientId === client.userId)
    .sort((a, b) => new Date(`${b.entryDate}T${b.entryTime || '00:00'}`).getTime() - new Date(`${a.entryDate}T${a.entryTime || '00:00'}`).getTime());

  // Client's specific membership history
  const clientMemberships = allMemberships
    .filter(m => m.clientId === client.userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Calculate days remaining or expired
  const calculateDaysRemaining = (endDateStr?: string) => {
    if (!endDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr);
    end.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysRemaining = calculateDaysRemaining(currentEndDate);

  // Extend or reduce membership by X days
  const handleAdjustDuration = async (deltaDays: number) => {
    setIsUpdatingDuration(true);
    setDurationFeedback('');

    try {
      const baseDate = currentEndDate ? new Date(currentEndDate) : new Date();
      baseDate.setDate(baseDate.getDate() + deltaDays);
      const newDateStr = baseDate.toISOString().split('T')[0];

      await applyNewEndDate(newDateStr);
      setDurationFeedback(`Membership adjusted by ${deltaDays > 0 ? `+${deltaDays}` : deltaDays} days! New Expiry: ${newDateStr}`);
    } catch (err: any) {
      setDurationFeedback('Error adjusting duration: ' + err.message);
    } finally {
      setIsUpdatingDuration(false);
    }
  };

  // Set explicit date
  const handleSetCustomEndDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customNewDate) return;
    setIsUpdatingDuration(true);
    setDurationFeedback('');

    try {
      await applyNewEndDate(customNewDate);
      setDurationFeedback(`Membership expiry updated to ${customNewDate}!`);
    } catch (err: any) {
      setDurationFeedback('Error updating expiry: ' + err.message);
    } finally {
      setIsUpdatingDuration(false);
    }
  };

  const applyNewEndDate = async (newDateStr: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const isNowActive = newDateStr >= todayStr;

    // 1. Update client profile
    const clientRef = doc(db, 'clientProfiles', client.userId);
    await updateDoc(clientRef, {
      membershipEndDate: newDateStr,
      membershipStatus: isNowActive ? 'active' : 'inactive'
    });

    // 2. Update active membership record if exists
    try {
      const memQuery = query(
        collection(db, 'memberships'),
        where('clientId', '==', client.userId),
        where('status', '==', 'active')
      );
      const snap = await getDocs(memQuery);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, {
          endDate: newDateStr,
          status: isNowActive ? 'active' : 'inactive'
        });
      }
    } catch (err) {
      console.warn('Could not update active membership record:', err);
    }

    setCurrentEndDate(newDateStr);
    setCustomNewDate(newDateStr);

    if (onClientUpdated) {
      onClientUpdated({
        ...client,
        membershipEndDate: newDateStr,
        membershipStatus: isNowActive ? 'active' : 'inactive'
      });
    }
  };

  const handleSaveDietPlan = async () => {
    if (!client?.userId) return;
    setIsSavingDiet(true);
    setDietFeedback('');
    try {
      const dietData: DietPlan = {
        clientId: client.userId,
        title: dietTitle.trim() || `${client.displayName}'s Nutrition Protocol`,
        dailyCalories: Number(dietCalories) || 2000,
        proteinGrams: Number(dietProtein) || 120,
        carbsGrams: Number(dietCarbs) || 200,
        fatsGrams: Number(dietFats) || 50,
        waterIntakeLiters: Number(dietWater) || 3.0,
        breakfast: dietBreakfast.trim(),
        lunch: dietLunch.trim(),
        snacks: dietSnacks.trim(),
        dinner: dietDinner.trim(),
        guidelines: dietGuidelines.trim(),
        supplements: dietSupplements.trim(),
        assignedBy: 'Master Admin',
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'dietPlans', `diet_${client.userId}`), dietData, { merge: true });
      setDietFeedback('Diet & Nutrition protocol saved & assigned successfully!');
      setTimeout(() => setDietFeedback(''), 4000);
    } catch (err: any) {
      console.error('Error saving diet plan:', err);
      setDietFeedback('Failed to save diet plan. Please try again.');
    } finally {
      setIsSavingDiet(false);
    }
  };

  const userPass = user?.password || (client as any).password || 'password123';
  const userDob = user?.dob || client.dob || 'Not set';

  // Compute total attendance hours
  const totalMinutes = clientAttendance.reduce((acc, a) => acc + (a.sessionDurationMinutes || 120), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/30 backdrop-blur-md animate-fade-in">
      <div className={`w-full ${activeTab === 'attendance' ? 'max-w-4xl' : 'max-w-2xl'} vision-surface border border-white/90 rounded-3xl overflow-hidden shadow-2xl text-slate-800 flex flex-col max-h-[92vh] transition-all`}>
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-white/80 flex items-center justify-between bg-white/70 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img
              src={client.photoUrl || user?.photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}
              alt={client.displayName}
              className="w-12 h-12 rounded-2xl object-cover border-2 border-white/80 shrink-0 ring-2 ring-indigo-500/25 shadow-sm"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-800 tracking-tight">{client.displayName}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  CLIENT PROFILE
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    client.membershipStatus === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {client.membershipStatus.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span className="font-mono text-indigo-600 font-bold">ID: @{client.userId}</span>
                <span>• DOB: {userDob}</span>
                {client.phone && <span>• {client.phone}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onRequestDelete({
                uid: client.userId,
                displayName: client.displayName,
                role: 'client',
                email: user?.email
              })}
              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Delete Account"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" strokeWidth={1.75} />
              <span>Delete</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200/80 bg-white/60 px-5 gap-4 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'overview'
                ? 'text-indigo-600 font-bold border-indigo-600'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <User className="w-4 h-4" strokeWidth={1.75} />
            <span>Profile & Membership</span>
          </button>
          <button
            onClick={() => setActiveTab('fitness')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'fitness'
                ? 'text-indigo-600 font-bold border-indigo-600'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" strokeWidth={1.75} />
            <span>Fitness Analysis ({fitnessHistory.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('diet')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'diet'
                ? 'text-emerald-600 font-bold border-emerald-600'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <Apple className="w-4 h-4 text-emerald-600" strokeWidth={1.75} />
            <span>Diet & Nutrition</span>
          </button>
          <button
            onClick={() => setActiveTab('memberships')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'memberships'
                ? 'text-indigo-600 font-bold border-indigo-600'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4" strokeWidth={1.75} />
            <span>Assigned Plans ({clientMemberships.length})</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: OVERVIEW & MEMBERSHIP DURATION CONTROLS */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* CURRENT MEMBERSHIP EXPIRY & EXTEND/REDUCE CONTROLS */}
              <div className="p-4 bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200/80 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h4 className="text-sm font-black text-slate-800">Assigned Membership & Validity Overview</h4>
                      <p className="text-[11px] text-slate-600">Inspect active plan status and validity dates</p>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-black px-2.5 py-1 rounded-full border shadow-2xs ${
                      daysRemaining !== null && daysRemaining >= 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {daysRemaining !== null
                      ? daysRemaining >= 0
                        ? `${daysRemaining} days remaining`
                        : `Expired ${Math.abs(daysRemaining)} days ago`
                      : 'No active plan'}
                  </span>
                </div>

                {/* Expiry Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Active Plan</span>
                    <strong className="text-slate-900 font-bold">{client.membershipPlanName || 'Standard Plan'}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Start Date</span>
                    <strong className="text-slate-700 font-bold">{client.membershipStartDate || 'Not recorded'}</strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200 shadow-2xs">
                    <span className="text-[10px] text-indigo-700 block uppercase font-bold">Current Expiry Date</span>
                    <strong className="text-indigo-950 font-mono text-sm font-black">{currentEndDate || 'No Expiry Set'}</strong>
                  </div>
                </div>

                {/* Seamless Stacking Queued Plan Badge */}
                {client.queuedPlanName && client.queuedStartDate && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 text-xs shadow-2xs">
                    <span className="font-black text-indigo-950 block">
                      Current Plan: Active until {currentEndDate} | Next Plan: Queued to start on {client.queuedStartDate}
                    </span>
                    <span className="text-[11px] text-indigo-700 font-medium block mt-0.5">
                      Stacked Plan: {client.queuedPlanName} ({client.queuedDurationMonths || 1}M) - Scheduled to start automatically without losing remaining days.
                    </span>
                  </div>
                )}

                {/* Quick Extend / Reduce Buttons */}
                <div className="space-y-2 pt-1 border-t border-slate-200/80">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Quick Validity Adjustments:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {/* Extend buttons */}
                    <button
                      type="button"
                      disabled={isUpdatingDuration}
                      onClick={() => handleAdjustDuration(7)}
                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Extend +7 Days</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingDuration}
                      onClick={() => handleAdjustDuration(15)}
                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Extend +15 Days</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingDuration}
                      onClick={() => handleAdjustDuration(30)}
                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Extend +30 Days (1M)</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingDuration}
                      onClick={() => handleAdjustDuration(60)}
                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Extend +60 Days</span>
                    </button>

                    {/* Reduce buttons */}
                    <button
                      type="button"
                      disabled={isUpdatingDuration}
                      onClick={() => handleAdjustDuration(-7)}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      <span>Reduce -7 Days</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingDuration}
                      onClick={() => handleAdjustDuration(-15)}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      <span>Reduce -15 Days</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingDuration}
                      onClick={() => handleAdjustDuration(-30)}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      <span>Reduce -30 Days</span>
                    </button>
                  </div>
                </div>

                {/* Custom Date Form */}
                <form onSubmit={handleSetCustomEndDate} className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-200/80">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Set Specific Expiry Date:</label>
                    <input
                      type="date"
                      required
                      value={customNewDate}
                      onChange={(e) => setCustomNewDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isUpdatingDuration || !customNewDate}
                    className="self-end px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
                  >
                    Save Custom Expiry Date
                  </button>
                </form>

                {durationFeedback && (
                  <p className="text-xs font-bold text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                    {durationFeedback}
                  </p>
                )}
              </div>

              {/* Password Record Box */}
              <div className="p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200/90 space-y-2 text-xs shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-600" />
                    Plaintext Account Password Record
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRequestPasswordChange(client, userPass);
                    }}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs shadow-2xs transition-colors"
                  >
                    Change Password
                  </button>
                </div>
                <div className="flex items-center justify-between font-mono bg-white/90 p-2.5 rounded-xl border border-amber-200 text-amber-900 font-bold shadow-2xs">
                  <span>{userPass}</span>
                  <button
                    type="button"
                    onClick={() => {
                      copyToClipboard(userPass);
                    }}
                    className="text-slate-500 hover:text-slate-800 p-1"
                    title="Copy Password"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Fitness Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] text-slate-500 font-semibold block uppercase">Fitness Goal</span>
                  <strong className="text-slate-900 font-bold mt-0.5 block">{client.fitnessGoal || 'General Fitness'}</strong>
                </div>
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] text-slate-500 font-semibold block uppercase">Height & Weight</span>
                  <strong className="text-slate-900 font-bold mt-0.5 block">{formatHeight(client.height)} / {client.weight || '--'} kg</strong>
                </div>
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] text-slate-500 font-semibold block uppercase">Assigned PT</span>
                  <strong className="text-slate-900 font-bold mt-0.5 block">{client.assignedTrainerName || 'None'}</strong>
                </div>
                <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] text-slate-500 font-semibold block uppercase">Total Check-ins</span>
                  <strong className="text-emerald-700 font-bold mt-0.5 block">{clientAttendance.length} Visits</strong>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPLETE ATTENDANCE LOG & ADVANCED ANALYTICS */}
          {activeTab === 'attendance' && (
            <div className="pt-1">
              <React.Suspense
                fallback={
                  <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <span>Loading Attendance Analytics...</span>
                  </div>
                }
              >
                <ClientAttendanceAnalytics
                  client={client}
                  user={user}
                  attendanceRecords={clientAttendance}
                />
              </React.Suspense>
            </div>
          )}

          {/* TAB: FITNESS ANALYSIS LOGS */}
          {activeTab === 'fitness' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Member Body Composition &amp; Physiological Assessments:</span>
                <span className="font-mono text-indigo-700 font-bold">{fitnessHistory.length} Total Logs</span>
              </div>

              {fitnessHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-50/90 rounded-2xl border border-slate-200/80 shadow-2xs">
                  No fitness analysis logs submitted by this member yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {fitnessHistory.map((fa, index) => (
                    <div
                      key={fa.id}
                      className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 text-xs space-y-3 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                            {fa.recommendedGoal}
                          </span>
                          {index === 0 && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                              Latest
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {new Date(fa.analysisDate || fa.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                      </div>

                      {/* Primary Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">BMI</span>
                          <strong className="text-slate-800">{fa.bmi} ({fa.bmiCategory})</strong>
                        </div>
                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Weight</span>
                          <strong className="text-slate-800">{fa.weight} kg</strong>
                        </div>
                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">BMR</span>
                          <strong className="text-slate-800">{fa.bmr ? `${fa.bmr} kcal` : '--'}</strong>
                        </div>
                        <div className="p-2 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Lean Body Mass</span>
                          <strong className="text-slate-800">{fa.leanBodyMassKg ? `${fa.leanBodyMassKg} kg` : '--'}</strong>
                        </div>
                      </div>

                      {/* Advanced measurements if present */}
                      {(fa.bodyFatPct || fa.muscleMassKg || fa.chestCm || fa.waistCm || fa.armsCm || fa.thighsCm) && (
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-700 bg-white p-2 rounded-xl border border-slate-200">
                          {fa.bodyFatPct && <span>Body Fat: <strong>{fa.bodyFatPct}%</strong></span>}
                          {fa.muscleMassKg && <span>• Muscle: <strong>{fa.muscleMassKg}kg</strong></span>}
                          {fa.chestCm && <span>• Chest: <strong>{fa.chestCm}cm</strong></span>}
                          {fa.waistCm && <span>• Waist: <strong>{fa.waistCm}cm</strong></span>}
                          {fa.armsCm && <span>• Arms: <strong>{fa.armsCm}cm</strong></span>}
                          {fa.thighsCm && <span>• Thighs: <strong>{fa.thighsCm}cm</strong></span>}
                        </div>
                      )}

                      {/* Progress Photo if present */}
                      {fa.progressPhotoUrl && (
                        <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-200">
                          <img
                            src={fa.progressPhotoUrl}
                            alt="Progress Photo"
                            className="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-2xs"
                          />
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">Progress Assessment Photo</span>
                            <span className="text-[10px] text-slate-500">Captured during this evaluation</span>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1 text-[11px] bg-white p-2.5 rounded-xl border border-slate-200 leading-relaxed">
                        <strong className="text-indigo-900 block">Recommended Focus &amp; Routine:</strong>
                        <p className="text-slate-700">{fa.fitnessFocus}</p>
                        <p className="text-slate-600 mt-1">{fa.recommendedWorkout}</p>
                      </div>

                      {fa.dietRecommendation && (
                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 leading-relaxed">
                          <strong className="block text-emerald-950">🥗 Assigned Diet Strategy:</strong>
                          <p>{fa.dietRecommendation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FULL MEMBERSHIP HISTORY */}
          {activeTab === 'memberships' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Complete history of all plans assigned or purchased:</span>
                <span className="font-mono text-indigo-700 font-bold">{clientMemberships.length} Records</span>
              </div>

              <div className="space-y-2.5">
                {clientMemberships.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-50/90 rounded-2xl border border-slate-200/80 shadow-2xs">
                    No membership purchases or assignments recorded yet.
                  </div>
                ) : (
                  clientMemberships.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 text-xs space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <strong className="text-slate-900 text-sm font-black">{m.planName}</strong>
                          <span className="text-slate-500 ml-2 font-medium">({m.durationMonths} Months)</span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            m.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {m.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600 pt-2 border-t border-slate-200/80">
                        <div>
                          <span className="text-slate-500 block text-[10px] font-semibold uppercase">Amount:</span>
                          <strong className="text-emerald-700 font-bold">₹{m.amountPaid?.toLocaleString() || 0}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] font-semibold uppercase">Payment Mode:</span>
                          <strong className="text-slate-800 uppercase">{m.paymentMode}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] font-semibold uppercase">Validity Range:</span>
                          <span className="text-slate-700 font-medium">{m.startDate} → {m.endDate}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] font-semibold uppercase">Purchased On:</span>
                          <span className="text-slate-600">
                            {new Date(m.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: DIET & NUTRITION ASSIGNMENT */}
          {activeTab === 'diet' && (
            <div className="space-y-4">
              {/* Header Card */}
              <div className="p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-white rounded-2xl border border-emerald-200/80 shadow-xs">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
                      <Apple className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">Diet & Nutrition Assignment</h4>
                      <p className="text-[11px] text-slate-600">
                        Customize daily calorie targets, macronutrients, and meal-by-meal schedule for {client.displayName}.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Live Client Sync
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700">Plan Title / Focus:</label>
                  <input
                    type="text"
                    value={dietTitle}
                    onChange={(e) => setDietTitle(e.target.value)}
                    placeholder="e.g. Lean Muscle Gain & Strength Protocol"
                    className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Macro & Hydration Targets Grid */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-500" />
                  Daily Targets & Macronutrients
                </h5>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200">
                    <label className="text-[10px] font-bold text-amber-800 block">Calories (kcal)</label>
                    <input
                      type="number"
                      value={dietCalories}
                      onChange={(e) => setDietCalories(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-black text-slate-800"
                    />
                  </div>

                  <div className="p-2.5 bg-rose-50/70 rounded-xl border border-rose-200">
                    <label className="text-[10px] font-bold text-rose-800 block">Protein (g)</label>
                    <input
                      type="number"
                      value={dietProtein}
                      onChange={(e) => setDietProtein(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 bg-white border border-rose-300 rounded-lg text-xs font-black text-slate-800"
                    />
                  </div>

                  <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-200">
                    <label className="text-[10px] font-bold text-blue-800 block">Carbs (g)</label>
                    <input
                      type="number"
                      value={dietCarbs}
                      onChange={(e) => setDietCarbs(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 bg-white border border-blue-300 rounded-lg text-xs font-black text-slate-800"
                    />
                  </div>

                  <div className="p-2.5 bg-purple-50/70 rounded-xl border border-purple-200">
                    <label className="text-[10px] font-bold text-purple-800 block">Fats (g)</label>
                    <input
                      type="number"
                      value={dietFats}
                      onChange={(e) => setDietFats(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 bg-white border border-purple-300 rounded-lg text-xs font-black text-slate-800"
                    />
                  </div>

                  <div className="p-2.5 bg-cyan-50/70 rounded-xl border border-cyan-200 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-cyan-800 block">Water Goal (L)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={dietWater}
                      onChange={(e) => setDietWater(Number(e.target.value))}
                      className="w-full mt-1 px-2 py-1 bg-white border border-cyan-300 rounded-lg text-xs font-black text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Meal Breakdown Inputs */}
              <div className="space-y-3">
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                    <Coffee className="w-4 h-4 text-amber-600" />
                    <span>Breakfast (Morning Meal)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={dietBreakfast}
                    onChange={(e) => setDietBreakfast(e.target.value)}
                    placeholder="e.g. 4 egg whites + 1 whole egg, 60g rolled oats with almond milk, 1 banana..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                    <Sun className="w-4 h-4 text-orange-500" />
                    <span>Lunch (Midday Meal)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={dietLunch}
                    onChange={(e) => setDietLunch(e.target.value)}
                    placeholder="e.g. 180g grilled chicken / low-fat paneer, 150g basmati rice, dal, cucumber salad..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                    <Cookie className="w-4 h-4 text-yellow-600" />
                    <span>Snacks / Pre-Workout</span>
                  </div>
                  <textarea
                    rows={2}
                    value={dietSnacks}
                    onChange={(e) => setDietSnacks(e.target.value)}
                    placeholder="e.g. 1 scoop whey protein, 1 apple, handful of roasted almonds..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span>Dinner (Evening Meal)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={dietDinner}
                    onChange={(e) => setDietDinner(e.target.value)}
                    placeholder="e.g. 150g grilled fish / tofu, 2 multigrain rotis, green salad with lemon..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                      <Droplets className="w-4 h-4 text-blue-500" />
                      <span>General Nutrition Guidelines</span>
                    </div>
                    <textarea
                      rows={2}
                      value={dietGuidelines}
                      onChange={(e) => setDietGuidelines(e.target.value)}
                      placeholder="e.g. Drink 3-4L water daily. Avoid deep fried foods & refined sugar."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                      <Pill className="w-4 h-4 text-emerald-600" />
                      <span>Supplements Schedule</span>
                    </div>
                    <textarea
                      rows={2}
                      value={dietSupplements}
                      onChange={(e) => setDietSupplements(e.target.value)}
                      placeholder="e.g. Whey Protein (1 scoop post-workout), Creatine (5g), Multivitamin with breakfast."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Feedback Alert */}
              {dietFeedback && (
                <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  dietFeedback.includes('successfully')
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{dietFeedback}</span>
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveDietPlan}
                  disabled={isSavingDiet}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Apple className="w-4 h-4" />
                  <span>{isSavingDiet ? 'Saving & Syncing...' : 'Save & Assign Diet Plan'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200/80 bg-slate-50/90 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            Torrent Fitness Master Admin Oversight
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition-colors shadow-2xs"
          >
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
};
