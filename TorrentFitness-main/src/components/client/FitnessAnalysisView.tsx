import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { doc, onSnapshot, collection, query, where, limit } from 'firebase/firestore';
import { AiPhysiqueAnalysis } from '../../types';
import {
  Sparkles,
  Camera,
  Lock,
  ShieldCheck,
  Activity,
  Dumbbell,
  Apple,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Flame,
  Scale,
  RefreshCw,
  X,
  UserCheck,
  ChevronRight,
  Zap,
  Droplets,
  CreditCard,
  Target,
  Ruler,
  Salad,
  Egg,
  Beef,
  Plus,
  Minus,
  Gift
} from 'lucide-react';
import { parseHeight, calculateBmi, formatHeight } from '../../utils/heightUtils';

export interface FitnessAnalysisViewProps {
  onNavigateToPt?: () => void;
  onNavigateToPlans?: () => void;
}

export type DietaryPreferenceType = 'Vegetarian' | 'Non-Vegetarian' | 'Eggetarian / Vegan';

export const FitnessAnalysisView: React.FC<FitnessAnalysisViewProps> = ({
  onNavigateToPt,
  onNavigateToPlans
}) => {
  const { currentUser, clientProfile } = useAuth();

  // Access Gate: strictly ACTIVE members
  const rawProfileStatus = String(clientProfile?.membershipStatus || '').trim().toUpperCase();
  const rawUserStatus = String(currentUser?.membershipStatus || '').trim().toUpperCase();
  const isMembershipActive = rawProfileStatus === 'ACTIVE' || rawUserStatus === 'ACTIVE';

  // Modal & Intake state
  const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [intakeWeight, setIntakeWeight] = useState<number>(clientProfile?.weight || 72);
  const initialParsedHeight = parseHeight(clientProfile?.height);
  const [heightFeet, setHeightFeet] = useState<number>(initialParsedHeight.feet);
  const [heightInches, setHeightInches] = useState<number>(initialParsedHeight.inches);
  const [intakeDiet, setIntakeDiet] = useState<DietaryPreferenceType>(
    ((clientProfile as any)?.dietaryPreference as DietaryPreferenceType) || 'Vegetarian'
  );

  // Photo state
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Latest analysis state (single active view only)
  const [latestAnalysis, setLatestAnalysis] = useState<AiPhysiqueAnalysis | null>(() => {
    return (
      clientProfile?.latestAiAnalysis ||
      (clientProfile as any)?.latestAnalysis ||
      (clientProfile as any)?.lastAiReport ||
      null
    );
  });

  // Check for admin-granted bonus scan (+1 scan bypass)
  const bonusScans = Number((clientProfile as any)?.extraAiScans || (clientProfile as any)?.extraScans || 0);
  const hasBonusScan = bonusScans > 0;

  // Live profile listener to synchronize latest analysis and profile fields immediately
  useEffect(() => {
    if (!currentUser?.uid) return;

    // 1. Sync from clientProfiles/{uid}
    const unsubProfile = onSnapshot(
      doc(db, 'clientProfiles', currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const report = data.latestAiAnalysis || data.latestAnalysis || data.lastAiReport;
          if (report) {
            setLatestAnalysis(report as AiPhysiqueAnalysis);
          }
          if (data.weight && !selectedPhotoFile) {
            setIntakeWeight(Number(data.weight));
          }
          if (data.height && !selectedPhotoFile) {
            const parsed = parseHeight(data.height);
            setHeightFeet(parsed.feet);
            setHeightInches(parsed.inches);
          }
          if (data.dietaryPreference) {
            setIntakeDiet(data.dietaryPreference as DietaryPreferenceType);
          }
        }
      },
      (err) => console.warn('Profile sync note:', err)
    );

    // 2. Query fallback from fitnessAnalysisHistory (ordered by analysis date limit 5)
    const histQuery = query(
      collection(db, 'fitnessAnalysisHistory'),
      where('clientId', '==', currentUser.uid),
      limit(5)
    );

    const unsubHist = onSnapshot(
      histQuery,
      (snap) => {
        if (!snap.empty) {
          const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          records.sort(
            (a: any, b: any) =>
              new Date(b.scannedAt || b.createdAt || b.analysisDate).getTime() -
              new Date(a.scannedAt || a.createdAt || a.analysisDate).getTime()
          );
          const topDoc: any = records[0];

          setLatestAnalysis((prev) => {
            if (prev) return prev;
            return {
              scannedAt: topDoc.scannedAt || topDoc.createdAt || topDoc.analysisDate || new Date().toISOString(),
              summary: topDoc.summary || topDoc.fitnessFocus || 'Physique and conditioning analysis recorded.',
              postureAssessment: topDoc.postureAssessment || {
                upperLowerBalance: 'Evaluated from historical biometric assessment',
                coreTone: 'Functional core engagement verified',
                postureAlignment: 'Aligned athletic posture profile',
                summary: topDoc.fitnessFocus || 'Solid structural baseline'
              },
              workoutRecommendations: topDoc.workoutRecommendations || {
                focusAreas: ['Compound Hypertrophy', 'Core Pillar'],
                trainingPriorities: [topDoc.recommendedWorkout || 'Progressive overload tracking'],
                recommendedSplits: '4-Day Hypertrophy Split',
                actionableAdvice: 'Maintain consistency and focus on recovery.'
              },
              nutritionGuidance: topDoc.nutritionGuidance || {
                dietaryPreference: topDoc.dietaryPreference || 'Vegetarian',
                calorieStrategy: topDoc.recommendedGoal || 'Metabolic Recomposition',
                macroBreakdown: { protein: '2.0g/kg', carbs: 'Complex pre/post-workout carbs', fats: '25-30% healthy fats' },
                hydrationLitres: 3.5,
                actionableNutrition: topDoc.dietRecommendation || 'Balanced whole-food nutritional intake.'
              },
              actionableWeeklyTargets: topDoc.actionableWeeklyTargets || [
                'Complete scheduled workout splits with progressive overload',
                'Adhere to targeted macronutrient distribution',
                'Maintain daily 3.5L hydration'
              ],
              currentMetrics: topDoc.currentMetrics || {
                weightKg: topDoc.weight || 70,
                heightCm: topDoc.height || 175,
                bmi: topDoc.bmi || 22.8
              },
              chips: topDoc.chips || {
                physiqueType: 'Athletic Conditioning',
                primaryFocus: 'Hypertrophy & Core Alignment',
                targetPhase: 'Progressive Overload'
              },
              disclaimer: topDoc.disclaimer || 'AI-generated fitness suggestions are for guidance purposes only and do not replace certified medical or coaching advice.',
              isPtClient: Boolean(topDoc.isPtClient)
            };
          });
        }
      },
      (err) => console.warn('History fallback note:', err)
    );

    return () => {
      unsubProfile();
      unsubHist();
    };
  }, [currentUser?.uid]);

  // Clean up object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  // PT Status & Rate-Limiting Quotas
  const isPtClient =
    clientProfile?.ptStatus === 'active' ||
    (clientProfile as any)?.hasActivePT === true ||
    Boolean(clientProfile?.assignedTrainerId && clientProfile?.ptStatus !== 'none');

  // Cooldown rules:
  // Standard members (Without PT): exactly 1 scan every 30 days
  // Active PT members: exactly 1 scan every 7 days
  // Admin bonus scan (+1 scan) completely bypasses cooldown!
  const cooldownDays = isPtClient ? 7 : 30;
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;

  const lastScanDateStr =
    clientProfile?.lastAiAnalysisDate ||
    latestAnalysis?.scannedAt ||
    (clientProfile as any)?.latestAiAnalysis?.scannedAt ||
    (clientProfile as any)?.latestAnalysis?.scannedAt;

  let isCooldownActive = false;
  let daysRemaining = 0;
  let unlockDateFormatted = '';

  if (!hasBonusScan && lastScanDateStr) {
    const lastScanTime = new Date(lastScanDateStr).getTime();
    if (!isNaN(lastScanTime)) {
      const now = Date.now();
      const elapsed = now - lastScanTime;
      if (elapsed < cooldownMs) {
        isCooldownActive = true;
        daysRemaining = Math.max(1, Math.ceil((cooldownMs - elapsed) / (1000 * 60 * 60 * 24)));
        const unlockDate = new Date(lastScanTime + cooldownMs);
        unlockDateFormatted = unlockDate.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
    }
  }

  // Live BMI calculation for intake with height in feet & inches and weight in kg
  const calculatedBmi = calculateBmi(intakeWeight, heightFeet, heightInches);
  const bmiCategory =
    calculatedBmi < 18.5
      ? 'Underweight (<18.5)'
      : calculatedBmi < 25.0
      ? 'Healthy & Normal (18.5 - 24.9)'
      : calculatedBmi < 30.0
      ? 'Overweight (25.0 - 29.9)'
      : 'High Mass (≥30.0)';

  // Handle Photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreviewUrl);
    }

    const blobUrl = URL.createObjectURL(file);
    setSelectedPhotoFile(file);
    setPhotoPreviewUrl(blobUrl);
    setErrorMessage('');
    e.target.value = '';
  };

  const handleClearPhoto = () => {
    if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhotoPreviewUrl('');
    setSelectedPhotoFile(null);
  };

  // Run AI Vision Physique Analysis
  const handleRunAiAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.uid) return;

    if (!isMembershipActive) {
      setErrorMessage('Active gym membership is required to run AI Fitness Analysis.');
      return;
    }

    if (isCooldownActive) {
      setErrorMessage(
        `Scan limit active: Next analysis unlocks in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} (${unlockDateFormatted}).`
      );
      return;
    }

    if (!selectedPhotoFile) {
      setErrorMessage('Please select or capture a physique photo for visual analysis.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // Convert file to base64 data URL
      const reader = new FileReader();
      const base64DataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(selectedPhotoFile);
      });

      const token = localStorage.getItem('torrent_auth_token');
      const response = await fetch('/api/ai/physique-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          clientId: currentUser.uid,
          photoDataUrl: base64DataUrl,
          clientMetrics: {
            age: clientProfile?.age || 24,
            gender: clientProfile?.gender || 'male',
            heightInches: (heightFeet * 12) + heightInches,
            heightCm: Math.round(((heightFeet * 12) + heightInches) * 2.54),
            heightFormatted: `${heightFeet} ft ${heightInches} in`,
            weightKg: intakeWeight,
            dietaryPreference: intakeDiet,
            fitnessGoal: clientProfile?.fitnessGoal || 'Hypertrophy & Conditioning'
          }
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 429) {
          throw new Error(data.error || 'Scan cooldown is currently active.');
        }
        if (response.status === 403) {
          throw new Error(data.error || 'Active Membership Required. Renew or activate your gym membership.');
        }
        throw new Error(data.error || 'Unable to complete AI physique analysis. Please try again.');
      }

      // Overwrite/update single latest analysis in UI
      setLatestAnalysis(data.analysis as AiPhysiqueAnalysis);
      setSuccessMessage('AI Physique Analysis completed successfully! Report updated below.');
      handleClearPhoto();
      setIsIntakeModalOpen(false);
      setModalStep(1);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error running AI visual scan. Please check your photo and try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 pb-36 text-slate-800 animate-fade-in max-w-xl mx-auto">
      {/* VisionOS Glassmorphic Header */}
      <div className="vision-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                Fitness Analysis with AI
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                AI Visual Physique & Posture Scan with tailored nutrition
              </p>
            </div>
          </div>

          {/* Membership Badge */}
          <span
            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              !isMembershipActive
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : hasBonusScan
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : isPtClient
                ? 'bg-purple-100 text-purple-800 border-purple-300'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}
          >
            {!isMembershipActive
              ? 'Membership Inactive'
              : hasBonusScan
              ? 'Scan Granted (+1)'
              : isPtClient
              ? 'PT (Weekly Scan)'
              : 'Standard (Monthly)'}
          </span>
        </div>

        {/* Quota Rules Notice */}
        <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/80 text-xs text-slate-600 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              Scan Quota Policy
            </span>
            <span className="text-indigo-600 font-semibold">
              {hasBonusScan
                ? '1 Unlocked Scan Available'
                : isPtClient
                ? '1 Scan / 7 Days'
                : '1 Scan / 30 Days'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {hasBonusScan
              ? 'Special Scan Granted: An immediate bonus analysis scan has been enabled for your account!'
              : isPtClient
              ? 'Active PT members are allocated 1 comprehensive AI visual physique analysis every 7 days to evaluate weekly muscular adaptation.'
              : 'Standard gym members are allocated 1 AI scan every 30 days to measure sustainable monthly body composition progress.'}
          </p>
        </div>
      </div>

      {/* SUCCESS TOAST BANNER */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 rounded-2xl flex items-center gap-2 animate-fade-in shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 3. PROMINENT "LATEST AI PHYSIQUE REPORT" CARD AT TOP OF VIEW */}
      {latestAnalysis ? (
        <div className="vision-surface rounded-3xl p-5 border border-white/80 shadow-2xl space-y-4 relative overflow-hidden animate-fade-in">
          {/* Subtle Ambient Glow */}
          <div className="absolute -right-12 -top-12 w-44 h-44 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Card Top Meta */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Latest AI Physique Report
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Scanned on{' '}
                {new Date(latestAnalysis.scannedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>

            {isCooldownActive && !hasBonusScan && (
              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" /> Next in {daysRemaining}d
              </span>
            )}
          </div>

          {/* Visual Chips: Metrics, Diet, Focus */}
          <div className="flex flex-wrap gap-2">
            {latestAnalysis.currentMetrics && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
                ⚖️ {latestAnalysis.currentMetrics.weightKg} kg •{' '}
                {formatHeight(latestAnalysis.currentMetrics.heightInches || latestAnalysis.currentMetrics.heightCm)} (BMI: {latestAnalysis.currentMetrics.bmi})
              </span>
            )}
            {latestAnalysis.nutritionGuidance?.dietaryPreference && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                🥗 {latestAnalysis.nutritionGuidance.dietaryPreference}
              </span>
            )}
            {latestAnalysis.chips?.physiqueType && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
                🧬 {latestAnalysis.chips.physiqueType}
              </span>
            )}
            {latestAnalysis.chips?.primaryFocus && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                🎯 {latestAnalysis.chips.primaryFocus}
              </span>
            )}
            {latestAnalysis.chips?.targetPhase && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-sky-50 text-sky-700 border border-sky-200">
                ⚡ {latestAnalysis.chips.targetPhase}
              </span>
            )}
          </div>

          {/* Executive Summary */}
          <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 rounded-2xl border border-indigo-200/60">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-indigo-900 mb-1 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              Executive Assessment
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              {latestAnalysis.summary}
            </p>
          </div>

          {/* 1. Body Posture & Physique Assessment */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-indigo-600" />
              1. Body Posture & Physique Breakdown
            </h4>

            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="p-3 bg-white/70 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Upper vs Lower Symmetry
                </span>
                <p className="text-slate-800 font-medium leading-relaxed">
                  {latestAnalysis.postureAssessment?.upperLowerBalance}
                </p>
              </div>

              <div className="p-3 bg-white/70 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Core & Midsection Tone
                </span>
                <p className="text-slate-800 font-medium leading-relaxed">
                  {latestAnalysis.postureAssessment?.coreTone}
                </p>
              </div>

              <div className="p-3 bg-white/70 rounded-2xl border border-slate-200/80 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Anatomical Posture & Spine Alignment
                </span>
                <p className="text-slate-800 font-medium leading-relaxed">
                  {latestAnalysis.postureAssessment?.postureAlignment}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Actionable Workout Recommendations */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Dumbbell className="w-4 h-4 text-purple-600" />
              2. Actionable Workout Recommendations
            </h4>

            <div className="p-3.5 bg-white/70 rounded-2xl border border-slate-200/80 space-y-2.5 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Target Priority Muscle Groups
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {latestAnalysis.workoutRecommendations?.focusAreas?.map((area, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-0.5 rounded-lg bg-purple-50 text-purple-800 font-bold border border-purple-200 text-[11px]"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Key Training Priorities
                </span>
                <ul className="space-y-1">
                  {latestAnalysis.workoutRecommendations?.trainingPriorities?.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-slate-700 leading-tight">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {latestAnalysis.workoutRecommendations?.recommendedSplits && (
                <div className="pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Recommended Training Split
                  </span>
                  <p className="font-bold text-slate-800">
                    {latestAnalysis.workoutRecommendations.recommendedSplits}
                  </p>
                </div>
              )}

              {latestAnalysis.workoutRecommendations?.actionableAdvice && (
                <p className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-200/50 text-[11px] text-purple-950 leading-relaxed font-medium">
                  💡 {latestAnalysis.workoutRecommendations.actionableAdvice}
                </p>
              )}
            </div>
          </div>

          {/* 3. Nutrition & Macro Guidance Tailored to Diet Preference */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Apple className="w-4 h-4 text-emerald-600" />
                3. Nutrition & Macro Guidance
              </h4>
              {latestAnalysis.nutritionGuidance?.dietaryPreference && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                  {latestAnalysis.nutritionGuidance.dietaryPreference} Focus
                </span>
              )}
            </div>

            <div className="p-3.5 bg-white/70 rounded-2xl border border-slate-200/80 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">
                  Calorie Strategy
                </span>
                <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                  {latestAnalysis.nutritionGuidance?.calorieStrategy}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-center">
                  <span className="text-[9px] text-emerald-800 font-bold uppercase block">Protein</span>
                  <span className="text-[11px] font-black text-emerald-950 block truncate">
                    {latestAnalysis.nutritionGuidance?.macroBreakdown?.protein || '2.0g/kg'}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-center">
                  <span className="text-[9px] text-emerald-800 font-bold uppercase block">Carbs</span>
                  <span className="text-[11px] font-black text-emerald-950 block truncate">
                    {latestAnalysis.nutritionGuidance?.macroBreakdown?.carbs || 'Peri-workout'}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-center">
                  <span className="text-[9px] text-emerald-800 font-bold uppercase block">Healthy Fats</span>
                  <span className="text-[11px] font-black text-emerald-950 block truncate">
                    {latestAnalysis.nutritionGuidance?.macroBreakdown?.fats || '25-30%'}
                  </span>
                </div>
              </div>

              {latestAnalysis.nutritionGuidance?.hydrationLitres && (
                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                  <Droplets className="w-3.5 h-3.5 text-sky-600" />
                  <span>
                    Daily Hydration Target: <strong>{latestAnalysis.nutritionGuidance.hydrationLitres} Litres</strong>
                  </span>
                </div>
              )}

              {latestAnalysis.nutritionGuidance?.actionableNutrition && (
                <p className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/50 text-[11px] text-emerald-950 leading-relaxed font-medium">
                  🥗 {latestAnalysis.nutritionGuidance.actionableNutrition}
                </p>
              )}
            </div>
          </div>

          {/* 4. Actionable Weekly Targets */}
          {latestAnalysis.actionableWeeklyTargets && latestAnalysis.actionableWeeklyTargets.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-indigo-600" />
                4. Actionable Weekly Targets
              </h4>

              <div className="p-3.5 bg-gradient-to-br from-indigo-50/90 to-white rounded-2xl border border-indigo-200/70 space-y-2 text-xs">
                {latestAnalysis.actionableWeeklyTargets.map((target, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 rounded-xl bg-white/80 border border-indigo-100">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <span className="text-slate-800 font-semibold leading-snug">{target}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Official AI Coaching Disclaimer */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-[10px] text-slate-500 leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p>
              <strong>Disclaimer:</strong> {latestAnalysis.disclaimer || 'AI-generated fitness suggestions are for guidance purposes only and do not replace certified medical or coaching advice.'}
            </p>
          </div>
        </div>
      ) : null}

      {/* SCAN ACTION SECTION: POSITIONED BELOW THE REPORT (OR AS SOLE CARD IF NO SCANS YET) */}
      {!isMembershipActive ? (
        /* Membership Inactive Locked Banner */
        <div className="p-6 rounded-3xl bg-gradient-to-br from-rose-50/90 via-white/80 to-indigo-50/90 border border-rose-200/80 shadow-xl text-center space-y-3.5 animate-fade-in relative overflow-hidden backdrop-blur-md">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              Active Membership Required
            </h3>
            <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
              Renew or activate your gym membership to unlock AI Fitness Analysis, posture diagnostics, and tailored dietary planning.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToPlans}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 vision-btn-aurora text-white text-xs font-black rounded-2xl shadow-lg shadow-indigo-500/25 transition-all cursor-pointer active:scale-95"
          >
            <CreditCard className="w-4 h-4" />
            <span>Renew / Activate Membership Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : isCooldownActive && !hasBonusScan ? (
        /* Cooldown Active Banner */
        <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300/80 text-amber-950 shadow-md space-y-3 animate-fade-in relative overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-200/80 border border-amber-300 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-black uppercase tracking-wider text-amber-950 block">
                  AI Scan Cooldown Active
                </span>
                <p className="text-xs text-amber-900 font-semibold leading-snug">
                  Next AI scan unlocks in <strong>{daysRemaining} day{daysRemaining > 1 ? 's' : ''}</strong> on{' '}
                  <span className="underline decoration-amber-400">{unlockDateFormatted}</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Standard Member Upgrade to PT Callout */}
          {!isPtClient && (
            <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <p className="text-[11px] text-amber-800 font-medium">
                Want weekly physique scans & coach supervision?
              </p>
              <button
                type="button"
                onClick={onNavigateToPt || onNavigateToPlans}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-black shadow-sm hover:opacity-95 transition-all cursor-pointer shrink-0"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Get Personal Training (PT)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Scan Action Available Card */
        <div className="vision-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                {hasBonusScan ? (
                  <>
                    <Gift className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700 font-black">Bonus Scan Available (+1 Grant)</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Scan Ready
                  </>
                )}
              </span>
              <h3 className="text-sm font-black text-slate-900">
                {latestAnalysis ? 'Run New Visual Physique Scan' : 'Start Context-Aware AI Visual Scan'}
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Provide your current weight, height, dietary preference, and upload a body photo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setModalStep(1);
              setErrorMessage('');
              setIsIntakeModalOpen(true);
            }}
            className="w-full py-3.5 vision-btn-aurora text-white text-xs font-black rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Camera className="w-4 h-4" />
            <span>{latestAnalysis ? 'New Analysis Scan (Intake & Photo)' : 'Start AI Analysis (Intake & Photo)'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* DYNAMIC 2-STEP PRE-ANALYSIS INTAKE WIZARD (STRICT SCROLL QUARANTINE & PINNED CONTROLS) */}
      {isIntakeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          {/* Modal Container: Max 85dvh with strict flex-col to keep header & footer pinned */}
          <div className="w-full max-w-sm max-h-[85dvh] flex flex-col rounded-3xl bg-white/95 backdrop-blur-xl border border-white/60 shadow-2xl overflow-hidden animate-slide-up">
            {/* Pinned Modal Header */}
            <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 tracking-tight">
                    {modalStep === 1
                      ? 'Step 1 of 2: Body Metrics & Nutrition'
                      : 'Step 2 of 2: Physique Photo Capture'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {modalStep === 1
                      ? 'Weight, Height & Diet Preference'
                      : 'Silhouette Capture & AI Scan'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isProcessing) {
                    setIsIntakeModalOpen(false);
                    setModalStep(1);
                  }
                }}
                disabled={isProcessing}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
              {/* STEP 1: BODY METRICS & DIETARY PREFERENCE */}
              {modalStep === 1 && (
                <div className="space-y-4 animate-fade-in">
                  {/* Weight Input with +/- Steppers */}
                  <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Current Weight</span>
                      </span>
                      <span className="text-[11px] font-black text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded-md">
                        {intakeWeight} kg
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setIntakeWeight((prev) => Math.max(30, Math.round((prev - 1) * 10) / 10))
                        }
                        className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="30"
                        max="220"
                        step="0.5"
                        value={intakeWeight}
                        onChange={(e) => setIntakeWeight(Number(e.target.value) || 70)}
                        className="flex-1 text-center font-black text-base py-1.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setIntakeWeight((prev) => Math.min(220, Math.round((prev + 1) * 10) / 10))
                        }
                        className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 transition-all shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Height Input (Feet & Inches Dual Selectors) */}
                  <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Ruler className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Current Height</span>
                      </span>
                      <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {heightFeet} ft {heightInches} in ({heightFeet}.{heightInches})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          Feet
                        </label>
                        <select
                          value={heightFeet}
                          onChange={(e) => setHeightFeet(Number(e.target.value))}
                          className="w-full px-3 py-2 text-xs font-bold bg-white text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs cursor-pointer"
                        >
                          {[4, 5, 6, 7].map((f) => (
                            <option key={f} value={f}>
                              {f} Feet ({f} ft)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          Inches
                        </label>
                        <select
                          value={heightInches}
                          onChange={(e) => setHeightInches(Number(e.target.value))}
                          className="w-full px-3 py-2 text-xs font-bold bg-white text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs cursor-pointer"
                        >
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((inc) => (
                            <option key={inc} value={inc}>
                              {inc} Inches ({inc} in)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Calculated BMI Card */}
                  <div className="p-3 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 border border-indigo-200/70 rounded-2xl flex items-center justify-between shadow-2xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
                        Body Mass Index (BMI)
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600 block">
                        {bmiCategory}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black font-mono text-indigo-700 bg-white px-2.5 py-1 rounded-xl border border-indigo-200 shadow-2xs block">
                        {calculatedBmi} <span className="text-[10px] font-normal text-slate-500">kg/m²</span>
                      </span>
                    </div>
                  </div>

                  {/* Dietary Preference Cards */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Salad className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Dietary Preference (Nutrition Guidance)</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {/* Vegetarian */}
                      <button
                        type="button"
                        onClick={() => setIntakeDiet('Vegetarian')}
                        className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          intakeDiet === 'Vegetarian'
                            ? 'border-emerald-500 bg-emerald-50/90 text-emerald-950 font-black shadow-xs ring-2 ring-emerald-500/20'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Salad className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs leading-none">Vegetarian</span>
                        <span className="text-[9px] text-slate-500 font-normal">Paneer, daal</span>
                      </button>

                      {/* Non-Vegetarian */}
                      <button
                        type="button"
                        onClick={() => setIntakeDiet('Non-Vegetarian')}
                        className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          intakeDiet === 'Non-Vegetarian'
                            ? 'border-rose-500 bg-rose-50/90 text-rose-950 font-black shadow-xs ring-2 ring-rose-500/20'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Beef className="w-4 h-4 text-rose-600" />
                        <span className="text-xs leading-none">Non-Veg</span>
                        <span className="text-[9px] text-slate-500 font-normal">Chicken, eggs</span>
                      </button>

                      {/* Eggetarian / Vegan */}
                      <button
                        type="button"
                        onClick={() => setIntakeDiet('Eggetarian / Vegan')}
                        className={`p-2.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          intakeDiet === 'Eggetarian / Vegan'
                            ? 'border-amber-500 bg-amber-50/90 text-amber-950 font-black shadow-xs ring-2 ring-amber-500/20'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Egg className="w-4 h-4 text-amber-600" />
                        <span className="text-xs leading-none">Egg / Vegan</span>
                        <span className="text-[9px] text-slate-500 font-normal">Eggs, plant</span>
                      </button>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 rounded-2xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: PHYSIQUE SILHOUETTE PHOTO CAPTURE & UPLOAD */}
              {modalStep === 2 && (
                <div className="space-y-4 animate-fade-in">
                  {/* Photography Tips Card */}
                  <div className="p-3.5 bg-indigo-50/80 rounded-2xl border border-indigo-200/70 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                      <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Photography Tips for AI Analysis</span>
                    </div>
                    <ul className="text-[11px] text-slate-600 space-y-1 pl-1">
                      <li className="flex items-start gap-1.5">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span>Good ambient lighting; avoid strong backlighting or dark shadows.</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span>Wear athletic wear / swimwear with relaxed standing posture.</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span>Stand 6–8 feet away showing your front or side physique silhouette.</span>
                      </li>
                    </ul>
                  </div>

                  {/* Interactive Photo Upload / Camera Card */}
                  <div className="space-y-1.5">
                    {photoPreviewUrl ? (
                      <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 flex items-center gap-3 shadow-2xs">
                        <img
                          src={photoPreviewUrl}
                          alt="Silhouette Preview"
                          className="w-16 h-20 object-cover rounded-xl border border-white shadow-md shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <span className="text-xs font-bold text-slate-900 block truncate">
                            Physique Photo Loaded
                          </span>
                          <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> High-contrast image ready
                          </p>
                          <button
                            type="button"
                            onClick={handleClearPhoto}
                            disabled={isProcessing}
                            className="text-[11px] font-bold text-rose-600 hover:text-rose-800 inline-flex items-center gap-1 cursor-pointer pt-0.5"
                          >
                            <X className="w-3.5 h-3.5" /> Change Photo / Retake
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="block p-5 rounded-2xl border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/30 hover:bg-white text-center cursor-pointer transition-all group shadow-2xs">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isProcessing}
                          onChange={handlePhotoSelect}
                        />
                        <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform shadow-xs">
                          <Camera className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Tap to Capture or Upload Physique Photo
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Front or side standing posture (JPEG, PNG, WebP)
                        </span>
                      </label>
                    )}
                  </div>

                  {/* Confirmed Metrics Recap */}
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-700 flex items-center justify-between">
                    <span className="font-semibold text-slate-500">Confirmed Metrics:</span>
                    <span className="font-bold text-indigo-700">
                      {intakeWeight} kg • {heightFeet} ft {heightInches} in • {intakeDiet}
                    </span>
                  </div>

                  {errorMessage && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 rounded-2xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pinned Modal Footer */}
            <div className="shrink-0 p-4 border-t border-slate-100 bg-white/90 backdrop-blur-md">
              {modalStep === 1 ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isProcessing) setIsIntakeModalOpen(false);
                    }}
                    disabled={isProcessing}
                    className="px-4 py-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!intakeWeight || intakeWeight < 30 || intakeWeight > 220) {
                        setErrorMessage('Please enter a valid weight (30-220 kg).');
                        return;
                      }
                      if (!heightFeet || heightFeet < 4 || heightFeet > 7 || heightInches < 0 || heightInches > 11) {
                        setErrorMessage('Please select a valid height.');
                        return;
                      }
                      if (!intakeDiet) {
                        setErrorMessage('Please select your dietary preference.');
                        return;
                      }
                      setErrorMessage('');
                      setModalStep(2);
                    }}
                    className="flex-1 py-3.5 vision-btn-aurora text-white text-xs font-black rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    <span>Next: Upload Physique Photo</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setModalStep(1);
                    }}
                    disabled={isProcessing}
                    className="px-4 py-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRunAiAnalysis}
                    disabled={isProcessing || !selectedPhotoFile}
                    className="flex-1 py-3.5 vision-btn-aurora text-white text-xs font-black rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Analyzing Physique with AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analyze Physique with AI ✨</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
