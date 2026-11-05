export type UserRole = 'client' | 'trainer' | 'admin';
export type TrainerStatus = 'pending' | 'pending_verification' | 'active' | 'rejected';
export type MembershipStatus = 'active' | 'inactive' | 'pending' | 'rejected' | 'expired' | 'cancelled' | 'queued';
export type PtRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'payment_pending'
  | 'active'
  | 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT'
  | 'PENDING_CASH_CONFIRMATION';

export interface UserAccount {
  uid: string;
  username: string;
  displayName: string;
  fullName?: string;
  email?: string;
  photoUrl: string;
  phone?: string; // Mandatory mobile number
  mobileNumber?: string;
  role: UserRole;
  status: 'active' | 'pending' | 'pending_verification' | 'rejected';
  isVerified?: boolean;
  verificationStatus?: string;
  membershipStatus?: 'ACTIVE' | 'active' | 'inactive' | 'expired' | 'pending';
  membershipPlan?: string;
  membershipStartDate?: string;
  membershipExpiryDate?: string;
  dob?: string; // Mandatory YYYY-MM-DD
  gender?: 'Female' | 'Male' | 'Other' | string; // Mandatory for members & trainers
  password?: string; // Stored for administrative account oversight & credential management
  isSelfDeleted?: boolean;
  createdAt: string;
}

export interface ClientProfile {
  userId: string;
  displayName: string;
  photoUrl: string;
  email?: string;
  dob?: string;
  phone?: string;
  age?: number;
  gender?: string;
  height?: number; // cm
  weight?: number; // kg
  fitnessGoal?: string;
  membershipStatus: 'active' | 'inactive' | 'ACTIVE';
  membershipPlan?: string;
  membershipPlanId?: string;
  membershipPlanName?: string;
  membershipStartDate?: string;
  membershipEndDate?: string;
  membershipExpiryDate?: string;
  queuedPlanId?: string;
  queuedPlanName?: string;
  queuedStartDate?: string;
  queuedEndDate?: string;
  queuedDurationMonths?: number;
  queuedAmountPaid?: number;
  assignedTrainerId?: string;
  assignedTrainerName?: string;
  ptStatus: 'none' | 'pending' | 'active';
  aerobicsStatus?: 'active' | 'inactive' | 'expired' | 'pending';
  aerobicsBatchId?: string;
  aerobicsBatchName?: string;
  aerobicsSlotTiming?: string;
  aerobicsPlanType?: 'monthly' | 'quarterly';
  aerobicsStartDate?: string;
  aerobicsEndDate?: string;
  pendingOfflineRequestId?: string;
  offlineRequestStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  offlineRejectionReason?: string;
  offlineRejectedAt?: string;
  lastAiAnalysisDate?: string;
  latestAiAnalysis?: AiPhysiqueAnalysis;
  isSelfDeleted?: boolean;
  createdAt: string;
}

export interface AiPhysiqueAnalysis {
  scannedAt: string;
  summary: string;
  postureAssessment: {
    upperLowerBalance: string;
    coreTone: string;
    postureAlignment: string;
    summary: string;
  };
  workoutRecommendations: {
    focusAreas: string[];
    trainingPriorities: string[];
    recommendedSplits: string;
    actionableAdvice: string;
  };
  nutritionGuidance: {
    dietaryPreference?: 'Vegetarian' | 'Non-Vegetarian' | 'Eggetarian / Vegan' | string;
    calorieStrategy: string;
    macroBreakdown: {
      protein: string;
      carbs: string;
      fats: string;
    };
    hydrationLitres?: number;
    actionableNutrition: string;
  };
  actionableWeeklyTargets?: string[];
  currentMetrics?: {
    weightKg: number;
    heightCm?: number;
    heightInches?: number;
    heightFormatted?: string;
    bmi: number;
  };
  chips: {
    physiqueType: string;
    primaryFocus: string;
    targetPhase: string;
  };
  disclaimer: string;
  isPtClient?: boolean;
}

export interface TrainerProfile {
  trainerId: string;
  displayName: string;
  fullName?: string;
  username?: string;
  photoUrl: string;
  email?: string;
  badge: 'crown' | 'shield' | 'none' | 'owner' | 'manager' | 'trainer';
  dob?: string;
  gender?: 'Female' | 'Male' | 'Other' | string;
  phone?: string;
  mobileNumber?: string;
  password?: string;
  role?: UserRole;
  isOwner?: boolean;
  isCoManager?: boolean;
  isVerified?: boolean;
  verificationStatus?: string;
  bio?: string;
  specializations: string;
  ptAvailable: boolean;
  status: TrainerStatus;
  rating: number;
  shifts?: string;
  assignedClientIds?: string[];
  createdAt: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  durationMonths: number;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  discountTag?: string;
  isDiscountActive?: boolean;
  benefits: string[];
  active: boolean;
  popular?: boolean;
}

export interface MembershipRecord {
  id: string;
  clientId: string;
  clientName: string;
  planId: string;
  planName: string;
  durationMonths: number;
  amountPaid: number;
  originalPrice?: number;
  couponCode?: string;
  discountAmount?: number;
  discountPercent?: number;
  paymentMode: 'online' | 'cash';
  gatewayId?: string;
  gatewayProvider?: PaymentProvider;
  gatewayName?: string;
  referenceId?: string;
  receiptNumber?: string;
  transactionId?: string;
  status: MembershipStatus;
  startDate: string;
  endDate: string;
  ptIncluded: boolean;
  ptTrainerId?: string;
  ptTrainerName?: string;
  rejectionReason?: string;
  approvedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
}

export interface PtRequest {
  id: string;
  clientId: string;
  clientName: string;
  clientPhotoUrl: string;
  trainerId: string;
  trainerName: string;
  planId?: string;
  planName?: string;
  fee: number;
  status: PtRequestStatus | string;
  paymentMode?: 'online' | 'cash';
  paidStatus?: 'paid' | 'pending' | 'unpaid';
  transactionId?: string;
  cashReceivedAmount?: number;
  cashReceivedDate?: string;
  cashNotes?: string;
  requestedAt: string;
  updatedAt: string;
}

export interface PtSchedule {
  id: string;
  clientId: string;
  trainerId: string;
  clientName?: string;
  recurringTime: string; // e.g. "07:00 AM - 08:30 AM"
  daysOfWeek: string; // e.g. "Mon, Wed, Fri"
  notes?: string;
  updatedAt: string;
}

export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type WorkoutVisibility = 'visible' | 'pt_only' | 'hidden';

export interface ExerciseItem {
  id?: string;
  name: string;
  muscleGroup?: string;
  difficulty?: DifficultyLevel;
  sets: string;
  reps: string;
  formNotes?: string;
  instructions: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: 'image' | 'gif' | 'video';
}

export interface WorkoutPlan {
  id: string;
  title: string;
  category: string; // Muscle Gain, Fat Loss, Strength, Cardio, etc.
  goal: string;
  bodyPart: string; // 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core' | 'Cardio' | 'Full Body' or custom
  difficulty?: DifficultyLevel;
  thumbnailUrl?: string;
  videoUrl?: string;
  clientId?: string; // if assigned to active PT client
  trainerId?: string;
  isGeneral: boolean;
  visibleToClients?: boolean; // true = visible to clients, false = hidden
  visibility?: WorkoutVisibility; // 'visible' | 'pt_only' | 'hidden'
  exercises: ExerciseItem[];
  order?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface DietMeal {
  mealTime: string; // e.g., "Breakfast (8:30 AM)"
  mealName: string;
  description: string;
  proteinApprox?: string;
  caloriesApprox?: number;
  carbsApprox?: string;
  fatsApprox?: string;
}

export interface DietPlan {
  id?: string;
  clientId: string;
  clientName?: string;
  trainerId?: string;
  assignedBy?: string;
  assignedByAdminName?: string;
  assignedAt?: string;
  title: string;
  guidelines?: string;
  dailyCalories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatsGrams?: number;
  waterIntakeLiters?: number;
  breakfast?: string;
  lunch?: string;
  snacks?: string;
  dinner?: string;
  supplements?: string;
  meals?: DietMeal[];
  createdAt?: string;
  updatedAt: string;
}

export interface PtPlan {
  id: string;
  name: string;
  durationMonths: number;
  sessions: number;
  mrpPrice: number;
  offerPrice: number;
  savings?: string;
  badge?: string;
  benefits?: string[];
  active: boolean;
  popular?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  clientId: string;
  clientName: string;
  clientPhotoUrl?: string;
  entryDate: string; // YYYY-MM-DD
  entryTime: string; // HH:MM:SS
  exitTime?: string;
  sessionStatus: 'active' | 'completed' | 'auto-closed';
  sessionDurationMinutes?: number;
  qrValidationToken?: string;
  isAerobicsMember?: boolean;
  aerobicsBatchName?: string | null;
  createdAt: string;
  timestamp?: string;
  date?: string;
  time?: string;
  checkInTime?: string;
  status?: string;
  planName?: string;
  membershipPlan?: string;
  isAerobics?: boolean;
  memberName?: string;
  badge?: string;
  updatedAt?: string;
}

export interface FitnessAnalysisResult {
  id: string;
  clientId: string;
  age: number;
  height: number;
  weight: number;
  gender: string;
  bmi: number;
  bmiCategory: string;
  recommendedGoal: 'Weight Loss' | 'Weight Gain/Muscle Gain' | 'Lean Body / Lean & Fit';
  fitnessFocus: string;
  recommendedWorkout: string;
  dietRecommendation?: string;
  bodyFatPct?: number;
  muscleMassKg?: number;
  chestCm?: number;
  waistCm?: number;
  armsCm?: number;
  thighsCm?: number;
  bmr?: number;
  leanBodyMassKg?: number;
  progressPhotoUrl?: string;
  frontPhotoUrl?: string;
  sidePhotoUrl?: string;
  privacyMode?: boolean;
  isPtClient?: boolean;
  analysisDate: string;
  createdAt: string;
}

export interface GymEvent {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  eventTime: string;
  location: string;
  imageUrl?: string;
  registrationEnabled: boolean;
  registeredCount: number;
  createdAt: string;
}

export interface GymChallenge {
  id: string;
  title: string;
  description: string;
  target: string;
  startDate: string;
  endDate: string;
  participantsCount: number;
  status: 'active' | 'completed';
  difficulty?: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  targetRole: 'all' | 'clients' | 'trainers';
  priority: 'normal' | 'high' | 'urgent';
  createdAt: string;
}

export interface PromotionalOffer {
  id: string;
  title: string;
  code: string;
  discountPercent: number;
  description: string;
  active: boolean;
  validUntil: string;
  validityDays?: number;
  maxUsageLimit?: number;
  timesUsed?: number;
  applicableTarget?: 'all' | 'specific';
  applicablePlanIds?: string[];
  createdAt?: string;
  deactivatedAt?: string;
}

export interface HomePopup {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  buttonText: string;
  buttonAction: string;
  active: boolean;
  createdAt: string;
}

export interface PromoBanner {
  id: string;
  title: string;
  subtitle?: string;
  tag?: string; // e.g. "MEGA OFFER", "HOT DEAL", "NEW CLASS"
  mediaType: 'image' | 'video';
  mediaUrl: string;
  linkType?: 'plans' | 'workouts' | 'pt' | 'analysis' | 'events' | 'custom';
  linkTarget?: string;
  buttonText?: string;
  badgeColor?: string;
  active: boolean;
  order: number;
  createdAt: string;
}

export interface GymFeedback {
  id: string;
  clientId: string;
  clientName: string;
  targetType: 'gym' | 'trainer' | 'service';
  trainerId?: string;
  trainerName?: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface GymQrConfig {
  activeToken: string;
  gymCode: string;
  generatedAt: string;
  active: boolean;
  previousTokens?: string[];
}

export interface GymSettings {
  gymName: string;
  contactPhone: string;
  address: string;
  openingHours: string;
  ptMonthlyRate: number;
  sessionDurationHours: number;
}

export type PaymentProvider =
  | 'razorpay'
  | 'cashfree'
  | 'phonepe'
  | 'paypal'
  | 'gpay'
  | 'paytm'
  | 'payu'
  | 'offline_cash'
  | 'cash'
  | 'upi_manual'
  | 'custom';
export type PaymentGatewayEnvironment = 'test' | 'live';
export type PaymentTransactionStatus = 'success' | 'pending' | 'rejected' | 'failed' | 'refunded';
export type PaymentPurpose = 'membership' | 'personal_training' | 'renewal' | 'merchandise' | 'aerobics';

export interface PaymentGateway {
  id: string;
  provider: PaymentProvider;
  name: string;
  description: string;
  isEnabled: boolean;
  isDefault: boolean;
  environment: PaymentGatewayEnvironment;
  // Razorpay credentials
  keyId?: string;
  keySecret?: string;
  // Cashfree credentials
  appId?: string;
  secretKey?: string;
  // PhonePe PG credentials
  merchantId?: string;
  saltKey?: string;
  saltIndex?: string;
  // PayPal credentials
  clientId?: string;
  // Google Pay for Business credentials
  gpayMerchantId?: string;
  gpayApiKey?: string;
  // Paytm credentials
  paytmMid?: string;
  paytmMerchantKey?: string;
  paytmWebsite?: string;
  paytmChannelId?: string;
  // PayU credentials
  payuMerchantKey?: string;
  payuMerchantSalt?: string;
  // Common config
  merchantName?: string;
  themeColor?: string;
  currency: string;
  webhookSecret?: string;
  upiId?: string;
  qrCodeUrl?: string;
  instructions?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  receiptNumber: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  purpose: PaymentPurpose;
  itemTitle: string;
  planId?: string;
  planName?: string;
  durationMonths?: number;
  startDate?: string;
  endDate?: string;
  originalPrice?: number;
  couponCode?: string;
  discountAmount?: number;
  discountPercent?: number;
  finalAmount?: number;
  amount: number;
  currency: string;
  status: PaymentTransactionStatus;
  verificationStatus?: 'ACTIVE' | 'PENDING' | 'REJECTED' | 'EXPIRED';
  paymentMode?: 'online' | 'cash';
  gatewayId: string;
  gatewayProvider: PaymentProvider;
  gatewayName?: string;
  paymentMethod: string;
  paymentId?: string;
  referenceId?: string;
  membershipId?: string;
  ptIncluded?: boolean;
  ptTrainerId?: string;
  ptTrainerName?: string;
  rejectionReason?: string;
  approvedAt?: string;
  rejectedAt?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
  isTest?: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface DirectMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'trainer';
  recipientId: string;
  recipientName: string;
  text: string;
  createdAt: string;
  timestamp: number;
}

export type AerobicsCategory =
  | 'Step Aerobics'
  | 'Zumba / Dance Cardio'
  | 'HIIT Aerobics'
  | 'Low-Impact Tone';

export type AerobicsIntensity = 'Low' | 'Moderate' | 'High' | 'Peak Burn';
export type AerobicsVisibility = 'active' | 'inactive' | 'premium';

export interface AerobicsStep {
  stepNumber: number;
  moveName: string;
  counts: string; // e.g. "8 Counts (2 Sets)"
  bpmCue?: string; // e.g. "128 BPM On-Beat"
  instructions: string;
}

export interface AerobicsRoutine {
  id: string;
  title: string;
  category: AerobicsCategory;
  intensity: AerobicsIntensity;
  durationMinutes: number;
  bpm: number;
  caloriesBurn: number;
  instructorName: string;
  thumbnailUrl: string;
  videoUrl: string;
  description: string;
  visibility: AerobicsVisibility;
  choreoSteps: AerobicsStep[];
  createdAt: string;
  updatedAt?: string;
}

export interface AerobicsBatch {
  id: string;
  title: string;
  category: AerobicsCategory;
  instructorId?: string;
  instructorName: string;
  daysOfWeek: string; // e.g. "Mon - Sat" or "Mon, Wed, Fri"
  timeSlot: string; // e.g. "Morning 07:00 AM - 08:00 AM" / "Evening 05:00 PM - 06:00 PM"
  studioZone: string; // e.g. "Rose Aurora Studio A (Women Only)"
  intensity: AerobicsIntensity;
  maxCapacity: number;
  monthlyPrice: number; // e.g. 1499
  quarterlyPrice: number; // e.g. 3999
  enrolledClientIds: string[];
  active: boolean;
  createdAt: string;
}

export interface AerobicsSubscription {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  batchId: string;
  batchName: string;
  slotTiming: string;
  instructorName: string;
  planDuration: 'monthly' | 'quarterly';
  durationMonths: number;
  amountPaid: number;
  originalPrice?: number;
  couponCode?: string;
  discountAmount?: number;
  paymentMode: 'online' | 'cash';
  gatewayName?: string;
  referenceId?: string;
  status: 'active' | 'pending' | 'rejected' | 'expired' | 'cancelled';
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface AerobicsWorkoutLog {
  id: string;
  clientId: string;
  clientName: string;
  routineId: string;
  routineTitle: string;
  category: AerobicsCategory;
  durationMinutes: number;
  caloriesBurned: number;
  averageBpm: number;
  completedDate: string; // YYYY-MM-DD
  createdAt: string;
}

