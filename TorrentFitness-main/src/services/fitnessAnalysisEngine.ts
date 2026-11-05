import { FitnessAnalysisResult } from '../types';

export interface AnalysisInput {
  clientId: string;
  age: number;
  heightCm: number;
  weightKg: number;
  gender: 'male' | 'female' | 'other';
  activityLevel: 'sedentary' | 'moderate' | 'active';
  hasActivePt: boolean;
  bodyFatPct?: number;
  muscleMassKg?: number;
  chestCm?: number;
  waistCm?: number;
  armsCm?: number;
  thighsCm?: number;
  progressPhotoUrl?: string;
  frontPhotoUrl?: string;
  sidePhotoUrl?: string;
  privacyMode?: boolean;
  frontPhotoFile?: File | null;
  sidePhotoFile?: File | null;
}

export interface AnalysisOutput {
  result: FitnessAnalysisResult;
  photosDiscardedConfirmed: boolean;
}

/**
 * STRICTLY RULE-BASED FITNESS ANALYSIS (NO AI/ML)
 * Calculates BMI, BMR (Mifflin-St Jeor), Lean Body Mass (LBM),
 * and predefined physiological ranges to output general fitness guidance.
 */
export function runRuleBasedFitnessAnalysis(input: AnalysisInput): AnalysisOutput {
  const {
    clientId,
    age,
    heightCm,
    weightKg,
    gender,
    activityLevel,
    hasActivePt,
    bodyFatPct,
    muscleMassKg,
    chestCm,
    waistCm,
    armsCm,
    thighsCm,
    progressPhotoUrl,
    frontPhotoUrl,
    sidePhotoUrl,
    privacyMode
  } = input;

  // Validation
  if (!heightCm || heightCm < 90 || heightCm > 250) {
    throw new Error('Please enter a valid height between 90cm and 250cm.');
  }
  if (!weightKg || weightKg < 30 || weightKg > 250) {
    throw new Error('Please enter a valid weight between 30kg and 250kg.');
  }
  if (!age || age < 14 || age > 95) {
    throw new Error('Please enter an age between 14 and 95.');
  }

  // 1. Calculate BMI: weight (kg) / (height (m) ^ 2)
  const heightM = heightCm / 100;
  const rawBmi = weightKg / (heightM * heightM);
  const bmi = Math.round(rawBmi * 10) / 10;

  // 2. Calculate BMR (Mifflin-St Jeor formula)
  let bmr = 0;
  if (gender === 'male') {
    bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + 5);
  } else if (gender === 'female') {
    bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age - 161);
  } else {
    bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age - 78);
  }

  // 3. Calculate Lean Body Mass (LBM in kg)
  let leanBodyMassKg = 0;
  if (bodyFatPct && bodyFatPct > 0 && bodyFatPct < 60) {
    leanBodyMassKg = Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;
  } else if (gender === 'female') {
    // Boer formula for women
    leanBodyMassKg = Math.round((0.252 * weightKg + 0.473 * heightCm - 48.3) * 10) / 10;
  } else {
    // Boer formula for men
    leanBodyMassKg = Math.round((0.407 * weightKg + 0.267 * heightCm - 19.2) * 10) / 10;
  }

  let bmiCategory = '';
  let recommendedGoal: 'Weight Loss' | 'Weight Gain/Muscle Gain' | 'Lean Body / Lean & Fit';
  let fitnessFocus = '';
  let recommendedWorkout = '';
  let dietRecommendation: string | undefined = undefined;

  // Standard WHO BMI Classification Thresholds (Rule-Based)
  if (bmi < 18.5) {
    bmiCategory = 'Underweight (High Caloric Need)';
    recommendedGoal = 'Weight Gain/Muscle Gain';
    fitnessFocus = 'Hypertrophy & Progressive Strength Overload to build lean mass';
    recommendedWorkout = 'Chest Dominance & Power + Legs & Quad Annihilation (Heavy compound lifts, 3-4 sessions/week)';
    if (hasActivePt) {
      dietRecommendation = 'Caloric Surplus Strategy: +350-500 kcal surplus, 1.8g protein per kg bodyweight, complex carbs (oats, brown rice, sweet potatoes), healthy fats (almonds, peanut butter). Consult your assigned trainer for specific portions.';
    }
  } else if (bmi >= 18.5 && bmi < 24.9) {
    bmiCategory = 'Normal Range';
    if (activityLevel === 'sedentary') {
      recommendedGoal = 'Lean Body / Lean & Fit';
      fitnessFocus = 'Body Recomposition & Core Stability';
      recommendedWorkout = 'Full Body Torrent Conditioning + Core & Pillar Conditioning (Functional circuits, 4 sessions/week)';
      if (hasActivePt) {
        dietRecommendation = 'Maintenance Caloric Intake: Balanced 40% carbs, 30% protein, 30% healthy fats. Prioritize whole foods and hydration (3.5L water/day).';
      }
    } else {
      recommendedGoal = 'Weight Gain/Muscle Gain';
      fitnessFocus = 'Lean Muscle Mass & Athletic Strength';
      recommendedWorkout = 'Back V-Taper & Thickness + Boulders & Arms Super-Pump';
      if (hasActivePt) {
        dietRecommendation = 'Lean Bulk Strategy: Mild surplus of +200 kcal, timed pre-workout complex carbs and post-workout whey/egg protein.';
      }
    }
  } else if (bmi >= 25 && bmi < 29.9) {
    bmiCategory = 'Overweight (Targeted Fat Reduction)';
    recommendedGoal = 'Weight Loss';
    fitnessFocus = 'Cardiovascular Endurance & High Energy Expenditure';
    recommendedWorkout = 'Full Body Torrent Conditioning (HIIT circuits, supersets, 4-5 sessions/week with 20 min stairmaster/incline walk)';
    if (hasActivePt) {
      dietRecommendation = 'Targeted Caloric Deficit: -400 kcal deficit, high dietary fiber (cruciferous veggies, leafy greens), lean protein (chicken breast, tofu, paneer, egg whites), eliminate sugary drinks.';
    }
  } else {
    bmiCategory = 'Class I/II Obesity Range';
    recommendedGoal = 'Weight Loss';
    fitnessFocus = 'Sustainable Fat Loss, Low-Impact Joint Conditioning & Mobility';
    recommendedWorkout = 'Core & Pillar Conditioning + Low-Impact Functional Cardio (Cycle, Elliptical, Machine Assisted Squats)';
    if (hasActivePt) {
      dietRecommendation = 'Structured Deficit & Metabolic Reset: -500 kcal deficit under supervision of your trainer. Focus on whole natural foods, zero processed sugars, balanced electrolytes.';
    }
  }

  // Construct Result Record
  const result: FitnessAnalysisResult = {
    id: `fa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    clientId,
    age,
    height: heightCm,
    weight: weightKg,
    gender,
    bmi,
    bmr,
    leanBodyMassKg,
    bodyFatPct: bodyFatPct && bodyFatPct > 0 ? bodyFatPct : undefined,
    muscleMassKg: muscleMassKg && muscleMassKg > 0 ? muscleMassKg : undefined,
    chestCm: chestCm && chestCm > 0 ? chestCm : undefined,
    waistCm: waistCm && waistCm > 0 ? waistCm : undefined,
    armsCm: armsCm && armsCm > 0 ? armsCm : undefined,
    thighsCm: thighsCm && thighsCm > 0 ? thighsCm : undefined,
    progressPhotoUrl: progressPhotoUrl || frontPhotoUrl || undefined,
    frontPhotoUrl: frontPhotoUrl || undefined,
    sidePhotoUrl: sidePhotoUrl || undefined,
    privacyMode: Boolean(privacyMode),
    isPtClient: hasActivePt,
    bmiCategory,
    recommendedGoal,
    fitnessFocus,
    recommendedWorkout,
    dietRecommendation,
    analysisDate: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  return {
    result,
    photosDiscardedConfirmed: true
  };
}
