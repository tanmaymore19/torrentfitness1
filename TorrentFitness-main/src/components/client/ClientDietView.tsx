import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { DietPlan } from '../../types';
import {
  Apple,
  Flame,
  Droplets,
  Clock,
  Sparkles,
  CheckCircle2,
  Calendar,
  UserCheck,
  ChevronRight,
  ShieldCheck,
  Coffee,
  Sun,
  Cookie,
  Moon,
  Pill,
  ArrowLeft
} from 'lucide-react';

interface ClientDietViewProps {
  onBack?: () => void;
}

export const ClientDietView: React.FC<ClientDietViewProps> = ({ onBack }) => {
  const { currentUser, clientProfile } = useAuth();
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clientId = currentUser?.uid;

  useEffect(() => {
    if (!clientId) return;

    // Listen to direct diet doc `diet_${clientId}`
    const docRef = doc(db, 'dietPlans', `diet_${clientId}`);
    const unsub = onSnapshot(
      docRef,
      async (snap) => {
        if (snap.exists()) {
          setDietPlan({ id: snap.id, ...snap.data() } as DietPlan);
          setIsLoading(false);
        } else {
          // Fallback query by clientId field if named differently
          try {
            const q = query(collection(db, 'dietPlans'), where('clientId', '==', clientId));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              setDietPlan({ id: querySnap.docs[0].id, ...querySnap.docs[0].data() } as DietPlan);
            } else {
              setDietPlan(null);
            }
          } catch (err) {
            console.warn('Diet plan query note:', err);
            setDietPlan(null);
          }
          setIsLoading(false);
        }
      },
      (err) => {
        console.warn('Diet listener error:', err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [clientId]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in p-2">
        <div className="h-44 rounded-3xl bg-white/70 animate-pulse border border-white/80" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/70 animate-pulse border border-white/80" />
          ))}
        </div>
      </div>
    );
  }

  // Clean empty state when no diet plan is assigned yet
  if (!dietPlan || (!dietPlan.title && !dietPlan.dailyCalories && !dietPlan.breakfast)) {
    return (
      <div className="space-y-5 animate-fade-in pb-12">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
        )}

        {/* Banner Card */}
        <div className="bg-gradient-to-tr from-emerald-500 via-teal-500 to-sky-400 rounded-3xl p-6 text-white border border-white/60 shadow-[0_16px_36px_rgba(16,185,129,0.2),inset_0_1px_2px_rgba(255,255,255,0.7)] relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 border border-white/30 backdrop-blur-md">
                NUTRITION &amp; RECOVERY
              </span>
              <h2 className="text-xl font-black text-white tracking-tight">Diet &amp; Nutrition Hub</h2>
              <p className="text-xs text-white/90 font-medium max-w-xs">
                Fuel your gym transformations with science-backed macro distributions.
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/40 shrink-0 shadow-inner">
              <Apple className="w-7 h-7 text-white" strokeWidth={1.9} />
            </div>
          </div>
        </div>

        {/* Clean Placeholder Requested */}
        <div className="p-8 vision-surface rounded-3xl border border-white/90 text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 flex items-center justify-center mx-auto shadow-sm">
            <Apple className="w-8 h-8" strokeWidth={1.75} />
          </div>

          <div className="space-y-1.5 max-w-sm mx-auto">
            <h3 className="text-base font-black text-slate-800">Custom Meal Plan Pending</h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Your customized diet plan will appear here once assigned by the fitness team.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-600 font-semibold">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-sky-500" />
              Daily Water Target
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              Calorie Breakdown
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Personalized Macros
            </span>
          </div>

          <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/70 text-left space-y-2 mt-4 text-xs text-slate-700">
            <div className="flex items-center gap-2 text-emerald-800 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>How to request your personalized diet plan?</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Ask any certified trainer on the gym floor or book an active 1-on-1 PT package. Our coaching team will assess your BMR, body fat percentage, and goals to assign your exact meal protocol.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Active Assigned Diet Plan
  const calories = dietPlan.dailyCalories || 2200;
  const protein = dietPlan.proteinGrams || 140;
  const carbs = dietPlan.carbsGrams || 220;
  const fats = dietPlan.fatsGrams || 55;
  const water = dietPlan.waterIntakeLiters || 3.5;

  return (
    <div className="space-y-5 animate-fade-in pb-16">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>
      )}

      {/* Top Hero Card */}
      <div className="bg-gradient-to-tr from-emerald-600 via-teal-600 to-sky-500 rounded-3xl p-6 text-white border border-white/60 shadow-[0_16px_36px_rgba(16,185,129,0.22),inset_0_1px_2px_rgba(255,255,255,0.7)] relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 border border-white/30 backdrop-blur-md">
              OFFICIAL ASSIGNED DIET
            </span>
            <span className="text-[10px] text-white/90 font-mono">
              Updated: {dietPlan.updatedAt ? new Date(dietPlan.updatedAt).toLocaleDateString('en-IN') : 'Recently'}
            </span>
          </div>

          <div>
            <h2 className="text-xl font-black text-white tracking-tight">{dietPlan.title || 'Personalized Nutrition Protocol'}</h2>
            <p className="text-xs text-white/90 font-medium mt-0.5">
              Assigned by: <strong className="text-white underline">{dietPlan.assignedByAdminName || 'Torrent Fitness Coaching Staff'}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Daily Targets & Macro Distribution Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Calories */}
        <div className="p-4 bg-white/90 rounded-2xl border border-white/90 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Daily Target</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">{calories}</div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Calories (kcal)</p>
        </div>

        {/* Protein */}
        <div className="p-4 bg-white/90 rounded-2xl border border-white/90 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Protein</span>
            <Sparkles className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">{protein}g</div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Muscle Recovery</p>
        </div>

        {/* Carbs */}
        <div className="p-4 bg-white/90 rounded-2xl border border-white/90 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-teal-600">Carbs</span>
            <Sun className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">{carbs}g</div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Energy &amp; Glycogen</p>
        </div>

        {/* Water & Fats */}
        <div className="p-4 bg-white/90 rounded-2xl border border-white/90 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-600">Water Goal</span>
            <Droplets className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">{water}L</div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Hydration ({fats}g Fats)</p>
        </div>
      </div>

      {/* Daily Meal Breakdown */}
      <div className="vision-surface rounded-3xl p-5 sm:p-6 border border-white/90 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2">
            <Apple className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-black text-slate-900">Daily Meal Schedule</h3>
          </div>
          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            4 Structured Meals
          </span>
        </div>

        <div className="space-y-3.5">
          {/* Meal 1: Breakfast */}
          <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Coffee className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Breakfast</h4>
                  <span className="text-[10px] text-slate-400 font-bold">Morning (07:30 AM - 09:00 AM)</span>
                </div>
              </div>
              <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                Meal 1
              </span>
            </div>
            <p className="text-xs text-slate-700 font-medium leading-relaxed pl-10 whitespace-pre-line">
              {dietPlan.breakfast || '4 Boiled Egg Whites + 1 Whole Egg, 60g Rolled Oats with warm almond milk, 1 Banana & 1 scoop Whey Protein.'}
            </p>
          </div>

          {/* Meal 2: Lunch */}
          <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Lunch</h4>
                  <span className="text-[10px] text-slate-400 font-bold">Afternoon (01:00 PM - 02:30 PM)</span>
                </div>
              </div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                Meal 2
              </span>
            </div>
            <p className="text-xs text-slate-700 font-medium leading-relaxed pl-10 whitespace-pre-line">
              {dietPlan.lunch || '180g Grilled Chicken Breast or Low-fat Paneer, 150g Brown/White Basmati Rice, 1 bowl Dal & Green Garden Salad.'}
            </p>
          </div>

          {/* Meal 3: Evening Snacks / Pre-Workout */}
          <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                  <Cookie className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Snacks &amp; Pre-Workout</h4>
                  <span className="text-[10px] text-slate-400 font-bold">Evening (05:00 PM - 06:30 PM)</span>
                </div>
              </div>
              <span className="text-[10px] font-black text-orange-700 bg-orange-50 px-2 py-0.5 rounded-md">
                Meal 3
              </span>
            </div>
            <p className="text-xs text-slate-700 font-medium leading-relaxed pl-10 whitespace-pre-line">
              {dietPlan.snacks || '2 slices Whole Wheat Brown Bread with 1 tbsp Natural Peanut Butter, Black Coffee or Green Tea, handful of soaked almonds.'}
            </p>
          </div>

          {/* Meal 4: Dinner */}
          <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/80 shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Dinner</h4>
                  <span className="text-[10px] text-slate-400 font-bold">Night (08:30 PM - 09:30 PM)</span>
                </div>
              </div>
              <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                Meal 4
              </span>
            </div>
            <p className="text-xs text-slate-700 font-medium leading-relaxed pl-10 whitespace-pre-line">
              {dietPlan.dinner || '150g Steamed Fish or Tofu Stir-Fry, 2 Multigrain Chapatis, Sautéed seasonal vegetables (Broccoli, Capsicum, Zucchini).'}
            </p>
          </div>
        </div>

        {/* Guidelines & Supplements Card */}
        {(dietPlan.guidelines || dietPlan.supplements) && (
          <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2 mt-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
              <Pill className="w-4 h-4 text-emerald-600" />
              <span>Coach Guidelines &amp; Supplement Schedule</span>
            </div>
            {dietPlan.supplements && (
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                <strong className="text-slate-800">Supplements:</strong> {dietPlan.supplements}
              </p>
            )}
            {dietPlan.guidelines && (
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                <strong className="text-slate-800">Guidelines:</strong> {dietPlan.guidelines}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientDietView;
