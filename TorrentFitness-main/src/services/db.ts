import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from './firebaseError';
import {
  UserAccount,
  ClientProfile,
  TrainerProfile,
  MembershipPlan,
  MembershipRecord,
  PtRequest,
  PtSchedule,
  WorkoutPlan,
  DietPlan,
  AttendanceRecord,
  FitnessAnalysisResult,
  GymEvent,
  GymChallenge,
  Announcement,
  PromotionalOffer,
  HomePopup,
  GymFeedback,
  GymQrConfig,
  GymSettings,
  AerobicsRoutine,
  AerobicsBatch
} from '../types';

export const DEFAULT_MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: 'plan_1m',
    name: '1 Month Kickstart',
    durationMonths: 1,
    price: 1500,
    originalPrice: 1800,
    benefits: ['Full floor gym access', 'Standard locker access', 'Cardio & Strength equipment', 'Gym floor trainer guidance'],
    active: true,
    popular: false
  },
  {
    id: 'plan_3m',
    name: '3 Months Muscle Builder',
    durationMonths: 3,
    price: 4000,
    originalPrice: 4800,
    benefits: ['Full gym access', 'Free initial fitness assessment', 'Dedicated shower & steam access', 'Priority locker room'],
    active: true,
    popular: true
  },
  {
    id: 'plan_6m',
    name: '6 Months Transformer',
    durationMonths: 6,
    price: 7200,
    originalPrice: 9000,
    benefits: ['All gym amenities', 'Free 1 PT trial session', 'Diet assessment orientation', 'Save 20% on monthly fee'],
    active: true,
    popular: false
  },
  {
    id: 'plan_8m',
    name: '8 Months Pro Athlete',
    durationMonths: 8,
    price: 9200,
    originalPrice: 12000,
    benefits: ['Full access including weekend clinics', '1 Free body analysis', 'Guest pass x2 per month', 'High savings'],
    active: true,
    popular: false
  },
  {
    id: 'plan_1y',
    name: '1 Year Elite Member',
    durationMonths: 12,
    price: 12999,
    originalPrice: 18000,
    benefits: ['Maximum savings & VIP perks', 'Unlimited locker & shower', 'Quarterly goal check-in', '15% discount on PT packages'],
    active: true,
    popular: false
  }
];

export const INITIAL_TRAINERS: TrainerProfile[] = [
  {
    trainerId: 'trainer_hitesh_rajput',
    displayName: 'Hitesh Rajput',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    badge: 'crown',
    gender: 'Male',
    isOwner: true,
    isCoManager: false,
    bio: 'Gym Founder & Head Coach. Passionate about bodybuilding, strength conditioning, and helping members reach peak potential.',
    specializations: 'Strength & Conditioning, Hypertrophy, Competition Prep',
    shifts: 'Morning (06:00 AM - 10:30 AM) & Evening (05:00 PM - 09:30 PM)',
    assignedClientIds: ['tanmay1_19'],
    ptAvailable: true,
    phone: '8208002585',
    status: 'active',
    rating: 5.0,
    createdAt: new Date().toISOString()
  },
  {
    trainerId: 'trainer_bhavesh_rajput',
    displayName: 'Bhavesh Rajput',
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    badge: 'shield',
    gender: 'Male',
    isOwner: false,
    isCoManager: true,
    bio: 'Senior Trainer & Operations Manager. Specializing in functional training, fat loss transformations, and endurance coaching.',
    specializations: 'Functional Fitness, Fat Loss, Athletic Mobility',
    shifts: 'Afternoon (11:00 AM - 03:00 PM) & Evening (05:30 PM - 10:00 PM)',
    assignedClientIds: [],
    ptAvailable: true,
    phone: '9607292842',
    status: 'active',
    rating: 4.9,
    createdAt: new Date().toISOString()
  },
  {
    trainerId: 'trainer_vikram_singh',
    displayName: 'Vikram Singh',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    badge: 'none',
    gender: 'Male',
    bio: 'Strength Coach & Powerlifting specialist. Focuses on safe form and progressive overload.',
    specializations: 'Powerlifting, Compound Lifts, Core Stability',
    shifts: 'Morning (06:00 AM - 12:00 PM)',
    assignedClientIds: [],
    ptAvailable: true,
    status: 'active',
    rating: 4.8,
    createdAt: new Date().toISOString()
  },
  {
    trainerId: 'trainer_pooja_sharma',
    displayName: 'Pooja Sharma',
    photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    badge: 'none',
    gender: 'Female',
    bio: 'Head Women’s Aerobics & Dance Fitness Instructor, Certified Nutritionist & Calisthenics Coach.',
    specializations: 'Aerobics & Dance Fitness, Zumba, Step Aerobics, HIIT',
    shifts: 'Morning (07:00 AM - 11:30 AM) & Evening (05:00 PM - 08:30 PM)',
    assignedClientIds: [],
    ptAvailable: true,
    status: 'active',
    rating: 4.9,
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_WORKOUTS: WorkoutPlan[] = [
  {
    id: 'workout_chest_strength',
    title: 'Chest Dominance & Power',
    category: 'Muscle Gain',
    goal: 'Muscle Gain',
    bodyPart: 'Chest',
    difficulty: 'Intermediate',
    thumbnailUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=800&q=80',
    isGeneral: true,
    visibleToClients: true,
    visibility: 'visible',
    createdAt: new Date().toISOString(),
    exercises: [
      {
        name: 'Barbell Flat Bench Press',
        muscleGroup: 'Chest',
        difficulty: 'Intermediate',
        sets: '4 Sets',
        reps: '8-10 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
        instructions: 'Lie flat with eyes beneath bar. Grip slightly wider than shoulder-width, plant feet firmly, unrack and lower bar smoothly to mid-chest. Press upward explosively.',
        formNotes: 'Keep shoulder blades retracted and elbows tucked at roughly 45 degrees. Do not bounce the bar off ribs.'
      },
      {
        name: 'Incline Dumbbell Press',
        muscleGroup: 'Chest',
        difficulty: 'Intermediate',
        sets: '3 Sets',
        reps: '10-12 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=800&q=80',
        instructions: 'Set bench to 30 degrees. Press dumbbells overhead, rotating slightly at top without clinking weights together.',
        formNotes: 'Focus on stretching the upper pectoral fibers at bottom.'
      },
      {
        name: 'Cable Chest Flyes',
        muscleGroup: 'Chest',
        difficulty: 'Beginner',
        sets: '3 Sets',
        reps: '12-15 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
        instructions: 'Set pulleys to shoulder height. Bring hands together in a hugging motion, pausing for 1 second at full peak contraction.',
        formNotes: 'Maintain a slight micro-bend in elbows throughout the arc.'
      }
    ]
  },
  {
    id: 'workout_back_thickness',
    title: 'Back V-Taper & Thickness',
    category: 'Muscle Gain',
    goal: 'Muscle Gain',
    bodyPart: 'Back',
    difficulty: 'Advanced',
    thumbnailUrl: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?auto=format&fit=crop&w=800&q=80',
    isGeneral: true,
    visibleToClients: true,
    visibility: 'visible',
    createdAt: new Date().toISOString(),
    exercises: [
      {
        name: 'Conventional Barbell Deadlift',
        muscleGroup: 'Back',
        difficulty: 'Advanced',
        sets: '4 Sets',
        reps: '6-8 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
        instructions: 'Stand mid-foot under barbell. Hinge hips back, grip bar, brace core, and drive through heels while pulling chest tall.',
        formNotes: 'Keep spine neutral; do not hyperextend at top lockout.'
      },
      {
        name: 'Wide-Grip Lat Pulldown',
        muscleGroup: 'Back',
        difficulty: 'Beginner',
        sets: '3 Sets',
        reps: '10-12 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?auto=format&fit=crop&w=800&q=80',
        instructions: 'Grip bar wider than shoulder-width. Pull straight down towards collarbone while driving elbows down and back.',
        formNotes: 'Avoid swinging momentum; control the 2-second eccentric return.'
      },
      {
        name: 'Seated Cable Row',
        muscleGroup: 'Back',
        difficulty: 'Intermediate',
        sets: '3 Sets',
        reps: '12 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
        instructions: 'Sit upright, brace knees slightly bent. Pull handle towards navel, squeezing shoulder blades together.',
        formNotes: 'Do not rock torso back and forth excessively.'
      }
    ]
  },
  {
    id: 'workout_legs_hypertrophy',
    title: 'Legs & Quad Annihilation',
    category: 'Strength',
    goal: 'Strength',
    bodyPart: 'Legs',
    difficulty: 'Advanced',
    thumbnailUrl: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=800&q=80',
    isGeneral: true,
    visibleToClients: true,
    visibility: 'visible',
    createdAt: new Date().toISOString(),
    exercises: [
      {
        name: 'Barbell Back Squat',
        muscleGroup: 'Legs',
        difficulty: 'Advanced',
        sets: '4 Sets',
        reps: '8 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=800&q=80',
        instructions: 'Rest bar on upper traps. Descend until hips break parallel with knees while keeping chest proud.',
        formNotes: 'Knees should track directly over toes. Drive through mid-foot.'
      },
      {
        name: 'Romanian Deadlift (RDL)',
        muscleGroup: 'Legs',
        difficulty: 'Intermediate',
        sets: '3 Sets',
        reps: '10 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
        instructions: 'Hold dumbbells or bar. Push hips backward with slight knee bend until deep hamstring stretch is felt.',
        formNotes: 'Keep weight close to shins; avoid rounding lower back.'
      },
      {
        name: 'Leg Press',
        muscleGroup: 'Legs',
        difficulty: 'Beginner',
        sets: '3 Sets',
        reps: '12-15 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
        instructions: 'Place feet shoulder-width on platform. Lower sled under control until knees reach 90 degrees, then press up.',
        formNotes: 'Do not lock out knees abruptly at top.'
      }
    ]
  },
  {
    id: 'workout_shoulders_arms',
    title: 'Boulders & Arms Super-Pump',
    category: 'Muscle Gain',
    goal: 'Muscle Gain',
    bodyPart: 'Shoulders',
    difficulty: 'Intermediate',
    thumbnailUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=80',
    isGeneral: true,
    visibleToClients: true,
    visibility: 'visible',
    createdAt: new Date().toISOString(),
    exercises: [
      {
        name: 'Seated Overhead Dumbbell Press',
        muscleGroup: 'Shoulders',
        difficulty: 'Intermediate',
        sets: '4 Sets',
        reps: '8-10 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=80',
        instructions: 'Sit with back supported. Press dumbbells straight overhead, locking out safely before lowering to ear level.',
        formNotes: 'Keep core tight and lower back flush against the pad.'
      },
      {
        name: 'Dumbbell Lateral Raises',
        muscleGroup: 'Shoulders',
        difficulty: 'Beginner',
        sets: '4 Sets',
        reps: '12-15 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
        instructions: 'Lead with elbows slightly in the scapular plane, raising to shoulder height. Pause for 0.5s.',
        formNotes: 'Do not shrug neck or use torso swing.'
      },
      {
        name: 'EZ-Bar Bicep Curls',
        muscleGroup: 'Arms',
        difficulty: 'Beginner',
        sets: '3 Sets',
        reps: '10-12 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=800&q=80',
        instructions: 'Grip knurling with palms up. Curl bar towards chest while pinning elbows to your sides.',
        formNotes: 'Lower slowly for 3 seconds on each repetition.'
      }
    ]
  },
  {
    id: 'workout_core_abs',
    title: 'Core & Pillar Conditioning',
    category: 'Endurance',
    goal: 'Endurance',
    bodyPart: 'Core',
    difficulty: 'Intermediate',
    thumbnailUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
    isGeneral: true,
    visibleToClients: true,
    visibility: 'visible',
    createdAt: new Date().toISOString(),
    exercises: [
      {
        name: 'Hanging Leg Raises',
        muscleGroup: 'Core',
        difficulty: 'Intermediate',
        sets: '3 Sets',
        reps: '12-15 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
        instructions: 'Hang from pull-up bar. Flex abs to raise knees or straight toes up to hip level without swinging.',
        formNotes: 'Control hip sway; initiate pull strictly from abdominal contraction.'
      },
      {
        name: 'Cable Woodchopper',
        muscleGroup: 'Core',
        difficulty: 'Intermediate',
        sets: '3 Sets',
        reps: '12 Per Side',
        imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80',
        instructions: 'Set cable high. Pull diagonally across body down to opposite knee with rotating hips.',
        formNotes: 'Pivot trailing foot to generate smooth rotational torque.'
      },
      {
        name: 'Weighted Forearm Plank',
        muscleGroup: 'Core',
        difficulty: 'Beginner',
        sets: '3 Sets',
        reps: '45-60 Seconds',
        imageUrl: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=800&q=80',
        instructions: 'Hold horizontal plank posture with plate on upper back if advanced. Squeeze glutes and abdominal wall.',
        formNotes: 'Avoid sagging hips or hiking glutes high in the air.'
      }
    ]
  },
  {
    id: 'workout_cardio_shred',
    title: 'Metabolic Cardio & HIIT Burn',
    category: 'Fat Loss',
    goal: 'Fat Loss',
    bodyPart: 'Cardio',
    difficulty: 'Beginner',
    thumbnailUrl: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=800&q=80',
    isGeneral: true,
    visibleToClients: true,
    visibility: 'visible',
    createdAt: new Date().toISOString(),
    exercises: [
      {
        name: 'Incline Treadmill Power Intervals',
        muscleGroup: 'Cardio',
        difficulty: 'Beginner',
        sets: '5 Intervals',
        reps: '2 Min Sprint / 1 Min Walk',
        imageUrl: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=800&q=80',
        instructions: 'Set incline to 6-8%. Alternate 2 minutes of brisk power-striding or jogging with 1 minute active recovery.',
        formNotes: 'Avoid holding onto the front handrails to maximize caloric expenditure.'
      },
      {
        name: 'Battle Rope Alternating Waves',
        muscleGroup: 'Cardio',
        difficulty: 'Intermediate',
        sets: '4 Sets',
        reps: '30 Seconds All-Out',
        imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
        instructions: 'Sink into an athletic half-squat stance and drive rapid alternating waves down the length of the ropes.',
        formNotes: 'Keep core braced and shoulders relaxed while breathing rhythmically.'
      }
    ]
  },
  {
    id: 'workout_full_body_hiit',
    title: 'Full Body Torrent Conditioning',
    category: 'Fat Loss',
    goal: 'Fat Loss',
    bodyPart: 'Full Body',
    difficulty: 'Intermediate',
    thumbnailUrl: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=800&q=80',
    isGeneral: true,
    visibleToClients: true,
    visibility: 'visible',
    createdAt: new Date().toISOString(),
    exercises: [
      {
        name: 'Kettlebell Swings',
        muscleGroup: 'Full Body',
        difficulty: 'Intermediate',
        sets: '4 Sets',
        reps: '20 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
        instructions: 'Hinge back at hips with flat back. Snap hips violently forward to launch kettlebell to eye level.',
        formNotes: 'This is a pure hip hinge movement, not a squat.'
      },
      {
        name: 'Dumbbell Thrusters',
        muscleGroup: 'Full Body',
        difficulty: 'Intermediate',
        sets: '4 Sets',
        reps: '12 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
        instructions: 'Hold weights at shoulders, perform full front squat, then press overhead in one continuous fluid motion.',
        formNotes: 'Use momentum from upward leg drive to launch the press.'
      },
      {
        name: 'Burpees with Push-up',
        muscleGroup: 'Full Body',
        difficulty: 'Advanced',
        sets: '3 Sets',
        reps: '15 Reps',
        imageUrl: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=800&q=80',
        instructions: 'Drop chest to floor, perform push-up, jump feet in, and leap vertically with arms overhead.',
        formNotes: 'Maintain steady rhythmic breathing.'
      }
    ]
  }
];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann_1',
    title: 'Gym Timings Notice',
    content: 'Torrent Fitness is open Monday to Sunday from 5:30 AM to 10:30 PM. Please scan the QR at the reception gate for contactless attendance.',
    targetRole: 'all',
    priority: 'normal',
    createdAt: new Date().toISOString()
  },
  {
    id: 'ann_2',
    title: 'New High-Performance Lifting Racks Added',
    content: 'We have upgraded our powerlifting stations with olympic competition bars and bumper plates. Train hard and re-rack your weights!',
    targetRole: 'clients',
    priority: 'high',
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_EVENTS: GymEvent[] = [
  {
    id: 'evt_1',
    title: 'Torrent Bench Press Showdown 2026',
    description: 'Annual in-house bench press competition open to all members! Medals, protein hampers, and gym vouchers for 1RM champions.',
    eventDate: '2026-10-25',
    eventTime: '10:00 AM',
    location: 'Torrent Fitness Main Arena',
    registrationEnabled: true,
    registeredCount: 14,
    createdAt: new Date().toISOString()
  },
  {
    id: 'evt_2',
    title: 'Nutrition & Supplementation Seminar',
    description: 'Expert session led by Hitesh Rajput and Pooja Sharma on debunking diet myths, macro counting, and natural strength gains.',
    eventDate: '2026-11-02',
    eventTime: '06:00 PM',
    location: 'Studio Room B',
    registrationEnabled: false, // Registration OFF - view only as required by specs
    registeredCount: 0,
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_CHALLENGES: GymChallenge[] = [
  {
    id: 'chal_1',
    title: '30-Day Torrent Attendance Streak',
    description: 'Check in for at least 22 days this month. Earn the Torrent Streak Finisher Badge and a 10% renewal coupon!',
    target: '22 Gym Entries in 30 Days',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    participantsCount: 28,
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'chal_2',
    title: '10,000 Push-ups Squad Challenge',
    description: 'Log push-ups with your gym buddies. The collective gym target is 10k push-ups this week.',
    target: 'Collective 10,000 Pushups',
    startDate: '2026-10-10',
    endDate: '2026-10-17',
    participantsCount: 19,
    status: 'active',
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_OFFERS: PromotionalOffer[] = [
  {
    id: 'off_1',
    title: 'Annual Plan Festival Discount',
    code: 'TORRENT10',
    discountPercent: 10,
    description: 'Get an extra 10% OFF on any 6-month or 1-year membership plan when purchased online.',
    active: true,
    validUntil: '2027-12-31',
    validityDays: 365,
    maxUsageLimit: 50,
    timesUsed: 0
  },
  {
    id: 'off_2',
    title: 'PT Combo Offer',
    code: 'PTBOOST',
    discountPercent: 15,
    description: 'Save 15% on Personal Training when bundled with your membership purchase.',
    active: true,
    validUntil: '2027-11-30',
    validityDays: 365,
    maxUsageLimit: 25,
    timesUsed: 0
  },
  {
    id: 'off_3',
    title: 'VIP Founder 100% Promo Pass',
    code: 'VIP100',
    discountPercent: 100,
    description: '100% Discount VIP Promo! Requires a nominal ₹1 token payment for financial audit and membership activation.',
    active: true,
    validUntil: '2027-12-31',
    validityDays: 365,
    maxUsageLimit: 10,
    timesUsed: 0
  }
];

export const INITIAL_POPUP: HomePopup = {
  id: 'popup_welcome',
  title: 'Welcome to Torrent Fitness',
  description: 'Track attendance with dynamic QR, access customized workouts, and elevate your fitness goals with our certified trainers.',
  buttonText: 'Explore Plans',
  buttonAction: 'membership',
  active: true,
  createdAt: new Date().toISOString()
};

export const INITIAL_GYM_CONFIG: GymQrConfig = {
  activeToken: 'TF-QR-ACTIVE-2026-GATEWAY',
  gymCode: 'TORRENT-FITNESS-PUNJAB-01',
  generatedAt: new Date().toISOString(),
  active: true,
  previousTokens: []
};

export const INITIAL_SETTINGS: GymSettings = {
  gymName: 'Torrent Fitness',
  contactPhone: '8208002585',
  address: 'Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001',
  openingHours: '5:30 AM - 10:30 PM (Mon - Sun)',
  ptMonthlyRate: 3500,
  sessionDurationHours: 2
};

export const INITIAL_AEROBICS_ROUTINES: AerobicsRoutine[] = [
  {
    id: 'aero_step_cardio_blast',
    title: 'Rhythm Step Aerobics Sculpt',
    category: 'Step Aerobics',
    intensity: 'Moderate',
    durationMinutes: 35,
    bpm: 128,
    caloriesBurn: 340,
    instructorName: 'Coach Pooja Sharma',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-woman-doing-aerobics-exercises-at-home-43723-large.mp4',
    description: 'High-energy elevated platform step sequences synchronizing lower-body toning with 128 BPM studio beats.',
    visibility: 'active',
    createdAt: new Date().toISOString(),
    choreoSteps: [
      {
        stepNumber: 1,
        moveName: 'Basic Right & Left Alternating Step-Up',
        counts: '16 Counts (2 Sets of 8)',
        bpmCue: '128 BPM Warm Groove',
        instructions: 'Step full foot onto center of platform with right lead, bring left up, step down right-left. Keep chest lifted and core braced.'
      },
      {
        stepNumber: 2,
        moveName: 'Corner Knee Lift & Repeater Three',
        counts: '32 Counts (4 Sets of 8)',
        bpmCue: '128 BPM On-Beat Drive',
        instructions: 'Travel corner-to-corner on the step deck executing 3 rhythmic knee drives before switching lead foot.'
      },
      {
        stepNumber: 3,
        moveName: 'V-Step Wide Platform Power & Glute Squeeze',
        counts: '16 Counts (2 Sets of 8)',
        bpmCue: '128 BPM Peak Pulse',
        instructions: 'Step wide to outer corners of the platform forming a V, sink slightly into heels, and return briskly to floor.'
      }
    ]
  },
  {
    id: 'aero_zumba_latin_fusion',
    title: 'Zumba & Bollywood Dance Cardio Flow',
    category: 'Zumba / Dance Cardio',
    intensity: 'High',
    durationMinutes: 45,
    bpm: 136,
    caloriesBurn: 460,
    instructorName: 'Coach Pooja Sharma',
    thumbnailUrl: 'https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?auto=format&fit=crop&w=900&q=80',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-fitness-woman-stretching-her-body-before-workout-40275-large.mp4',
    description: 'Infectious Latin & Desi dance rhythms designed to torch calories, boost endorphins, and sculpt waist definition.',
    visibility: 'active',
    createdAt: new Date().toISOString(),
    choreoSteps: [
      {
        stepNumber: 1,
        moveName: 'Salsa Side-to-Side Hip Mambo',
        counts: '16 Counts (2 Sets of 8)',
        bpmCue: '136 BPM Rhythm Sync',
        instructions: 'Rock forward on right foot, recover weight on left, and step together with fluid hip motion and natural arm styling.'
      },
      {
        stepNumber: 2,
        moveName: 'Reggaeton Stomp & Double Chest Iso',
        counts: '32 Counts (4 Sets of 8)',
        bpmCue: '136 BPM High Energy',
        instructions: 'Wide athletic stance, double bounce step to the right with sharp ribcage isolation and diagonal arm sweeps.'
      },
      {
        stepNumber: 3,
        moveName: 'Cumbia Travel & Core Twist Finale',
        counts: '16 Counts (2 Sets of 8)',
        bpmCue: '136 BPM Cardio Surge',
        instructions: 'Step behind on the ball of the back foot while rotating obliques and sweeping opposite arm across midline.'
      }
    ]
  },
  {
    id: 'aero_hiit_metabolic_burn',
    title: 'HIIT Aerobics Metabolic Igniter',
    category: 'HIIT Aerobics',
    intensity: 'Peak Burn',
    durationMinutes: 30,
    bpm: 145,
    caloriesBurn: 420,
    instructorName: 'Coach Pooja Sharma',
    thumbnailUrl: 'https://images.unsplash.com/photo-1549576490-b0b4831ef60a?auto=format&fit=crop&w=900&q=80',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-woman-doing-jumping-jacks-in-a-gym-23261-large.mp4',
    description: 'Explosive beat-driven aerobic intervals pairing plyometric rhythm bursts with active recovery sculpting.',
    visibility: 'active',
    createdAt: new Date().toISOString(),
    choreoSteps: [
      {
        stepNumber: 1,
        moveName: 'Syncopated Power Jacks & Overhead Clap',
        counts: '32 Counts (4 Sets of 8)',
        bpmCue: '145 BPM Sprint Beat',
        instructions: 'Land softly on balls of feet with knees tracking toes while snapping arms overhead in rhythm with every beat.'
      },
      {
        stepNumber: 2,
        moveName: 'Skater Lateral Hop & Touch-Down',
        counts: '32 Counts (4 Sets of 8)',
        bpmCue: '145 BPM Peak Interval',
        instructions: 'Bound laterally side-to-side, sweeping trailing leg behind and tapping fingertips toward shin while keeping chest proud.'
      },
      {
        stepNumber: 3,
        moveName: 'High-Knee Rhythm March & Standing Crunch',
        counts: '16 Counts (2 Sets of 8)',
        bpmCue: '132 BPM Active Recovery',
        instructions: 'Drive alternating knees to hip height while pulling elbows down to engage lower abs without breaking cadence.'
      }
    ]
  },
  {
    id: 'aero_low_impact_sculpt',
    title: 'Low-Impact Barre & Aerobic Tone',
    category: 'Low-Impact Tone',
    intensity: 'Low',
    durationMinutes: 40,
    bpm: 116,
    caloriesBurn: 280,
    instructorName: 'Coach Pooja Sharma',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=900&q=80',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-woman-doing-squats-in-a-fitness-studio-40271-large.mp4',
    description: 'Joint-friendly, zero-jumping aerobic flow combining graceful posture alignment, glute toning, and core endurance.',
    visibility: 'active',
    createdAt: new Date().toISOString(),
    choreoSteps: [
      {
        stepNumber: 1,
        moveName: 'Grapevine Lateral Glide & Hamstring Curl',
        counts: '16 Counts (2 Sets of 8)',
        bpmCue: '116 BPM Smooth Flow',
        instructions: 'Step side, cross behind, step side, and kick heel toward glutes with controlled shoulder blade squeeze.'
      },
      {
        stepNumber: 2,
        moveName: 'Plie Squat Pulse & Alternating Heel Raise',
        counts: '32 Counts (4 Sets of 8)',
        bpmCue: '116 BPM Sculpt Tempo',
        instructions: 'Turn toes out 45 degrees, hold a deep plie squat, and pulse on the beat while lifting right and left heels.'
      },
      {
        stepNumber: 3,
        moveName: 'Standing Side-Leg Sweep & Waist Lengthener',
        counts: '16 Counts (2 Sets of 8)',
        bpmCue: '110 BPM Cool-Down',
        instructions: 'Extend leg laterally with pointed toe while reaching overhead to sculpt outer thighs and obliques.'
      }
    ]
  }
];

export const INITIAL_AEROBICS_BATCHES: AerobicsBatch[] = [
  {
    id: 'batch_morning_zumba',
    title: 'Morning Sunshine Zumba & Dance Cardio',
    category: 'Zumba / Dance Cardio',
    instructorId: 'trainer_pooja_sharma',
    instructorName: 'Pooja Sharma',
    daysOfWeek: 'Mon - Sat',
    timeSlot: 'Morning 07:00 AM - 08:00 AM',
    studioZone: 'Rose Aurora Studio A (Women Only)',
    intensity: 'High',
    maxCapacity: 25,
    monthlyPrice: 1499,
    quarterlyPrice: 3999,
    enrolledClientIds: [],
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'batch_evening_step_hiit',
    title: 'Evening Power Step & HIIT Aerobics',
    category: 'Step Aerobics',
    instructorId: 'trainer_pooja_sharma',
    instructorName: 'Pooja Sharma',
    daysOfWeek: 'Mon - Sat',
    timeSlot: 'Evening 05:00 PM - 06:00 PM',
    studioZone: 'Rose Aurora Studio A (Women Only)',
    intensity: 'Moderate',
    maxCapacity: 20,
    monthlyPrice: 1499,
    quarterlyPrice: 3999,
    enrolledClientIds: [],
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'batch_low_impact_tone',
    title: 'Mid-Morning Low-Impact Aerobic Tone',
    category: 'Low-Impact Tone',
    instructorId: 'trainer_pooja_sharma',
    instructorName: 'Pooja Sharma',
    daysOfWeek: 'Mon, Wed, Fri',
    timeSlot: 'Morning 10:30 AM - 11:30 AM',
    studioZone: 'Studio B Wellness Floor (Women Only)',
    intensity: 'Low',
    maxCapacity: 20,
    monthlyPrice: 1299,
    quarterlyPrice: 3499,
    enrolledClientIds: [],
    active: true,
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_GYM_PHOTOS = [
  {
    id: 'photo_weights',
    title: 'Olympic Strength & Power Racks',
    category: 'Free Weights',
    photoUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
    caption: 'Competition Eleiko barbells, calibrated bumpers, and dedicated deadlift platforms.',
    order: 1,
    active: true
  },
  {
    id: 'photo_cardio',
    title: 'Cardio Sprint Track & Turf',
    category: 'Cardio Zone',
    photoUrl: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=1200&q=80',
    caption: 'Air assault bikes, curved motorless treadmills, and 30m sled sprint turf.',
    order: 2,
    active: true
  },
  {
    id: 'photo_studio',
    title: 'Aerobics & Dance Cardio Studio',
    category: 'Women Studio',
    photoUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80',
    caption: 'Dedicated women-exclusive studio with shock-absorbing sprung flooring.',
    order: 3,
    active: true
  },
  {
    id: 'photo_steam',
    title: 'Luxury Steam & Recovery Spa',
    category: 'Recovery Spa',
    photoUrl: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=1200&q=80',
    caption: 'Eucalyptus aroma steam room and post-workout recovery lounge.',
    order: 4,
    active: true
  }
];

const SEED_CACHE_FLAG_KEY = 'torrent_fitness_seed_v4';

// Non-blocking, parallelized seed for initial database state if collections are empty
export async function initializeDatabaseSeed(force: boolean = false): Promise<void> {
  try {
    if (!force && typeof window !== 'undefined' && localStorage.getItem(SEED_CACHE_FLAG_KEY) === 'done') {
      return;
    }

    await Promise.allSettled([
      // 1. Gym Settings
      (async () => {
        const settingsDoc = await getDoc(doc(db, 'gymSettings', 'active-config'));
        if (!settingsDoc.exists()) {
          await setDoc(doc(db, 'gymSettings', 'active-config'), INITIAL_SETTINGS);
        }
      })(),

      // 2. Gym QR Config
      (async () => {
        const qrDoc = await getDoc(doc(db, 'gymQrConfig', 'active-qr'));
        if (!qrDoc.exists()) {
          await setDoc(doc(db, 'gymQrConfig', 'active-qr'), INITIAL_GYM_CONFIG);
        }
      })(),

      // 3. Membership Plans (Populate membershipPlans, plans, and membership_plans)
      (async () => {
        const plansSnap = await getDocs(query(collection(db, 'membershipPlans'), limit(1)));
        if (plansSnap.empty) {
          await Promise.all(
            DEFAULT_MEMBERSHIP_PLANS.flatMap((plan) => [
              setDoc(doc(db, 'membershipPlans', plan.id), plan),
              setDoc(doc(db, 'plans', plan.id), plan),
              setDoc(doc(db, 'membership_plans', plan.id), plan)
            ])
          );
        }
      })(),

      // 4. Trainers (Populate trainerProfiles and trainers)
      (async () => {
        const trainersSnap = await getDocs(query(collection(db, 'trainerProfiles'), limit(1)));
        if (trainersSnap.empty) {
          await Promise.all(
            INITIAL_TRAINERS.flatMap((trainer) => [
              setDoc(doc(db, 'trainerProfiles', trainer.trainerId), trainer),
              setDoc(doc(db, 'trainers', trainer.trainerId), trainer)
            ])
          );
        }
      })(),

      // 5. Workouts (Populate workouts and workout_library)
      (async () => {
        const workoutsSnap = await getDocs(query(collection(db, 'workouts'), limit(1)));
        if (workoutsSnap.empty) {
          await Promise.all(
            INITIAL_WORKOUTS.flatMap((workout) => [
              setDoc(doc(db, 'workouts', workout.id), workout),
              setDoc(doc(db, 'workout_library', workout.id), workout)
            ])
          );
        }
      })(),

      // 5B. Gym Facilities & Floor Photos
      (async () => {
        const photosSnap = await getDocs(query(collection(db, 'gymPhotos'), limit(1)));
        if (photosSnap.empty) {
          await Promise.all(
            INITIAL_GYM_PHOTOS.flatMap((photo) => [
              setDoc(doc(db, 'gymPhotos', photo.id), photo),
              setDoc(doc(db, 'facilities', photo.id), photo)
            ])
          );
        }
      })(),

      // 5C. Aerobics Routines & Batches
      (async () => {
        const aeroRoutinesSnap = await getDocs(query(collection(db, 'aerobicsRoutines'), limit(1)));
        if (aeroRoutinesSnap.empty) {
          await Promise.all(
            INITIAL_AEROBICS_ROUTINES.map((routine) =>
              setDoc(doc(db, 'aerobicsRoutines', routine.id), routine)
            )
          );
        }

        const aeroBatchesSnap = await getDocs(query(collection(db, 'aerobicsBatches'), limit(5)));
        if (aeroBatchesSnap.empty) {
          await Promise.all(
            INITIAL_AEROBICS_BATCHES.map((batch) =>
              setDoc(doc(db, 'aerobicsBatches', batch.id), batch)
            )
          );
        }
      })(),

      // 6. Announcements, Events, Challenges, Offers, Popups
      (async () => {
        const [announcementsSnap, eventsSnap, challengesSnap, offersSnap, popupDoc] =
          await Promise.all([
            getDocs(query(collection(db, 'announcements'), limit(1))),
            getDocs(query(collection(db, 'events'), limit(1))),
            getDocs(query(collection(db, 'challenges'), limit(1))),
            getDocs(query(collection(db, 'offers'), limit(1))),
            getDoc(doc(db, 'popups', 'welcome-popup'))
          ]);

        const writes: Promise<any>[] = [];
        if (announcementsSnap.empty) {
          INITIAL_ANNOUNCEMENTS.forEach((ann) =>
            writes.push(setDoc(doc(db, 'announcements', ann.id), ann))
          );
        }
        if (eventsSnap.empty) {
          INITIAL_EVENTS.forEach((evt) => writes.push(setDoc(doc(db, 'events', evt.id), evt)));
        }
        if (challengesSnap.empty) {
          INITIAL_CHALLENGES.forEach((ch) =>
            writes.push(setDoc(doc(db, 'challenges', ch.id), ch))
          );
        }
        if (offersSnap.empty) {
          INITIAL_OFFERS.forEach((off) => writes.push(setDoc(doc(db, 'offers', off.id), off)));
        }
        if (!popupDoc.exists()) {
          writes.push(setDoc(doc(db, 'popups', 'welcome-popup'), INITIAL_POPUP));
        }
        if (writes.length > 0) {
          await Promise.allSettled(writes);
        }
      })(),

      // 7. Seed Predefined Admin Account for Stealth Master Login
      (async () => {
        const adminUserDoc = await getDoc(doc(db, 'users', 'admin'));
        const demoWrites: Promise<any>[] = [];

        if (!adminUserDoc.exists()) {
          demoWrites.push(
            setDoc(doc(db, 'users', 'admin'), {
              uid: 'torrent_admin_master',
              username: 'admin',
              displayName: 'Torrent Admin (Master)',
              email: 'tanmaymore0220@gmail.com',
              photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
              role: 'admin',
              status: 'active',
              dob: '1990-01-01',
              password: 'TorrentAdmin@2026',
              createdAt: new Date().toISOString()
            })
          );
        }

        if (demoWrites.length > 0) {
          await Promise.allSettled(demoWrites);
        }
      })(),

      // 8. Restore Pre-9:00 AM Member & Payment Gateway Config (tanmay1_19 & Live Razorpay)
      (async () => {
        try {
          const liveRzp = {
            id: 'gw_razorpay_main',
            provider: 'razorpay',
            name: 'Razorpay PG (UPI / Cards / NetBanking)',
            description: 'Official Razorpay standard gateway supporting UPI, Dynamic QR, Cards & NetBanking.',
            isEnabled: true,
            isDefault: true,
            environment: 'live',
            keyId: 'rzp_live_TqxKgruP8oLXbD',
            keySecret: 'oToShMju6rOURDG8MQP35jhC',
            merchantName: 'Torrent Fitness Club',
            themeColor: '#4f46e5',
            currency: 'INR',
            instructions: 'Official Razorpay Checkout popup supporting Google Pay, PhonePe, Paytm, QR, Cards & NetBanking with instant activation.',
            status: 'ACTIVE',
            createdAt: '2026-11-01T00:00:00.000Z',
            updatedAt: new Date().toISOString()
          };

          const tanmayAccount = {
            uid: 'tanmay1_19',
            authUid: 'tanmay1_19',
            username: 'tanmay1_19',
            clientId: 'tanmay1_19',
            displayName: 'Tanmay More',
            fullName: 'Tanmay More',
            email: 'tanmaymore0220@gmail.com',
            phone: '+91 8208002585',
            mobileNumber: '+91 8208002585',
            photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
            role: 'client',
            status: 'active',
            membershipStatus: 'ACTIVE',
            membershipPlan: '3 Months Muscle Builder',
            membershipPlanId: 'plan_3m',
            membershipPlanName: '3 Months Muscle Builder',
            membershipStartDate: '2026-10-01',
            membershipEndDate: '2027-01-01',
            membershipExpiryDate: '2027-01-01',
            dob: '2000-02-20',
            age: 24,
            gender: 'Male',
            height: 175,
            weight: 74,
            fitnessGoal: 'Muscle Gain & Strength',
            password: 'tanmay@19',
            createdAt: '2026-10-01T00:00:00.000Z'
          };

          const tanmayProfile = {
            userId: 'tanmay1_19',
            authUid: 'tanmay1_19',
            username: 'tanmay1_19',
            displayName: 'Tanmay More',
            fullName: 'Tanmay More',
            email: 'tanmaymore0220@gmail.com',
            phone: '+91 8208002585',
            mobileNumber: '+91 8208002585',
            photoUrl: tanmayAccount.photoUrl,
            dob: '2000-02-20',
            age: 24,
            gender: 'Male',
            height: 175,
            weight: 74,
            fitnessGoal: 'Muscle Gain & Strength',
            membershipStatus: 'active',
            membershipPlan: '3 Months Muscle Builder',
            membershipPlanId: 'plan_3m',
            membershipPlanName: '3 Months Muscle Builder',
            membershipStartDate: '2026-10-01',
            membershipEndDate: '2027-01-01',
            membershipExpiryDate: '2027-01-01',
            assignedTrainerId: 'trainer_hitesh_rajput',
            assignedTrainerName: 'Hitesh Rajput',
            ptStatus: 'none',
            createdAt: '2026-10-01T00:00:00.000Z'
          };

          const historicalTxn = {
            id: 'txn_historical_tanmay_01',
            receiptNumber: 'TF-REC-2026-100220',
            paymentId: 'pay_live_tanmay_0220_3m',
            referenceId: 'pay_live_tanmay_0220_3m',
            orderId: 'order_live_tanmay_0220',
            clientId: 'tanmay1_19',
            clientName: 'Tanmay More',
            clientEmail: 'tanmaymore0220@gmail.com',
            clientPhone: '+91 8208002585',
            purpose: 'membership',
            itemTitle: '3 Months Muscle Builder',
            planId: 'plan_3m',
            planName: '3 Months Muscle Builder',
            durationMonths: 3,
            startDate: '2026-10-01',
            endDate: '2027-01-01',
            originalPrice: 4800,
            discountAmount: 800,
            discountPercent: 16.67,
            amount: 4000,
            finalAmount: 4000,
            currency: 'INR',
            status: 'success',
            verificationStatus: 'ACTIVE',
            paymentMode: 'online',
            gatewayId: 'gw_razorpay_main',
            gatewayProvider: 'razorpay',
            gatewayName: 'Razorpay PG (UPI / Cards / NetBanking)',
            paymentMethod: 'UPI / Cards / NetBanking',
            razorpayPaymentId: 'pay_live_tanmay_0220_3m',
            razorpayOrderId: 'order_live_tanmay_0220',
            timestamp: '2026-10-01T10:15:00.000Z',
            createdAt: '2026-10-01T10:15:00.000Z',
            approvedAt: '2026-10-01T10:15:00.000Z',
            completedAt: '2026-10-01T10:15:00.000Z',
            membershipId: 'mem_tanmay_3m_01'
          };

          const historicalMembership = {
            id: 'mem_tanmay_3m_01',
            clientId: 'tanmay1_19',
            clientName: 'Tanmay More',
            planId: 'plan_3m',
            planName: '3 Months Muscle Builder',
            durationMonths: 3,
            amountPaid: 4000,
            originalPrice: 4800,
            discountAmount: 800,
            discountPercent: 16.67,
            paymentMode: 'online',
            gatewayId: 'gw_razorpay_main',
            gatewayProvider: 'razorpay',
            gatewayName: 'Razorpay PG (UPI / Cards / NetBanking)',
            referenceId: 'pay_live_tanmay_0220_3m',
            receiptNumber: 'TF-REC-2026-100220',
            transactionId: 'txn_historical_tanmay_01',
            status: 'active',
            startDate: '2026-10-01',
            endDate: '2027-01-01',
            approvedAt: '2026-10-01T10:15:00.000Z',
            createdAt: '2026-10-01T10:15:00.000Z'
          };

          const historicalAttendanceLogs = [
            {
              id: 'att_20261026_tanmay',
              clientId: 'tanmay1_19',
              clientName: 'Tanmay More',
              memberName: 'Tanmay More',
              clientPhotoUrl: tanmayAccount.photoUrl,
              entryDate: '2026-10-26',
              date: '2026-10-26',
              entryTime: '06:30 AM',
              time: '06:30 AM',
              checkInTime: '06:30 AM',
              sessionStatus: 'completed',
              sessionDurationMinutes: 90,
              qrValidationToken: 'TF-QR-ACTIVE-2026-GATEWAY',
              status: 'PRESENT',
              planName: '3 Months Muscle Builder',
              membershipPlan: '3 Months Muscle Builder',
              badge: 'STANDARD',
              timestamp: '2026-10-26T06:30:00.000Z',
              createdAt: '2026-10-26T06:30:00.000Z'
            },
            {
              id: 'att_20261027_tanmay',
              clientId: 'tanmay1_19',
              clientName: 'Tanmay More',
              memberName: 'Tanmay More',
              clientPhotoUrl: tanmayAccount.photoUrl,
              entryDate: '2026-10-27',
              date: '2026-10-27',
              entryTime: '06:45 AM',
              time: '06:45 AM',
              checkInTime: '06:45 AM',
              sessionStatus: 'completed',
              sessionDurationMinutes: 85,
              qrValidationToken: 'TF-QR-ACTIVE-2026-GATEWAY',
              status: 'PRESENT',
              planName: '3 Months Muscle Builder',
              membershipPlan: '3 Months Muscle Builder',
              badge: 'STANDARD',
              timestamp: '2026-10-27T06:45:00.000Z',
              createdAt: '2026-10-27T06:45:00.000Z'
            },
            {
              id: 'att_20261028_tanmay',
              clientId: 'tanmay1_19',
              clientName: 'Tanmay More',
              memberName: 'Tanmay More',
              clientPhotoUrl: tanmayAccount.photoUrl,
              entryDate: '2026-10-28',
              date: '2026-10-28',
              entryTime: '07:00 AM',
              time: '07:00 AM',
              checkInTime: '07:00 AM',
              sessionStatus: 'completed',
              sessionDurationMinutes: 110,
              qrValidationToken: 'TF-QR-ACTIVE-2026-GATEWAY',
              status: 'PRESENT',
              planName: '3 Months Muscle Builder',
              membershipPlan: '3 Months Muscle Builder',
              badge: 'STANDARD',
              timestamp: '2026-10-28T07:00:00.000Z',
              createdAt: '2026-10-28T07:00:00.000Z'
            },
            {
              id: 'att_20261030_tanmay',
              clientId: 'tanmay1_19',
              clientName: 'Tanmay More',
              memberName: 'Tanmay More',
              clientPhotoUrl: tanmayAccount.photoUrl,
              entryDate: '2026-10-30',
              date: '2026-10-30',
              entryTime: '06:35 AM',
              time: '06:35 AM',
              checkInTime: '06:35 AM',
              sessionStatus: 'completed',
              sessionDurationMinutes: 95,
              qrValidationToken: 'TF-QR-ACTIVE-2026-GATEWAY',
              status: 'PRESENT',
              planName: '3 Months Muscle Builder',
              membershipPlan: '3 Months Muscle Builder',
              badge: 'STANDARD',
              timestamp: '2026-10-30T06:35:00.000Z',
              createdAt: '2026-10-30T06:35:00.000Z'
            },
            {
              id: 'att_20261031_tanmay',
              clientId: 'tanmay1_19',
              clientName: 'Tanmay More',
              memberName: 'Tanmay More',
              clientPhotoUrl: tanmayAccount.photoUrl,
              entryDate: '2026-10-31',
              date: '2026-10-31',
              entryTime: '06:40 AM',
              time: '06:40 AM',
              checkInTime: '06:40 AM',
              sessionStatus: 'completed',
              sessionDurationMinutes: 100,
              qrValidationToken: 'TF-QR-ACTIVE-2026-GATEWAY',
              status: 'PRESENT',
              planName: '3 Months Muscle Builder',
              membershipPlan: '3 Months Muscle Builder',
              badge: 'STANDARD',
              timestamp: '2026-10-31T06:40:00.000Z',
              createdAt: '2026-10-31T06:40:00.000Z'
            },
            {
              id: 'att_20261101_tanmay',
              clientId: 'tanmay1_19',
              clientName: 'Tanmay More',
              memberName: 'Tanmay More',
              clientPhotoUrl: tanmayAccount.photoUrl,
              entryDate: '2026-11-01',
              date: '2026-11-01',
              entryTime: '07:15 AM',
              time: '07:15 AM',
              checkInTime: '07:15 AM',
              sessionStatus: 'completed',
              sessionDurationMinutes: 105,
              qrValidationToken: 'TF-QR-ACTIVE-2026-GATEWAY',
              status: 'PRESENT',
              planName: '3 Months Muscle Builder',
              membershipPlan: '3 Months Muscle Builder',
              badge: 'STANDARD',
              timestamp: '2026-11-01T07:15:00.000Z',
              createdAt: '2026-11-01T07:15:00.000Z'
            },
            {
              id: 'att_20261102_tanmay',
              clientId: 'tanmay1_19',
              clientName: 'Tanmay More',
              memberName: 'Tanmay More',
              clientPhotoUrl: tanmayAccount.photoUrl,
              entryDate: '2026-11-02',
              date: '2026-11-02',
              entryTime: '06:50 AM',
              time: '06:50 AM',
              checkInTime: '06:50 AM',
              sessionStatus: 'completed',
              sessionDurationMinutes: 120,
              qrValidationToken: 'TF-QR-ACTIVE-2026-GATEWAY',
              status: 'PRESENT',
              planName: '3 Months Muscle Builder',
              membershipPlan: '3 Months Muscle Builder',
              badge: 'STANDARD',
              timestamp: '2026-11-02T06:50:00.000Z',
              createdAt: '2026-11-02T06:50:00.000Z'
            }
          ];

          await Promise.allSettled([
            setDoc(doc(db, 'gym_config', 'payment_gateways'), liveRzp, { merge: true }),
            setDoc(doc(db, 'paymentGateways', 'gw_razorpay_main'), liveRzp, { merge: true }),
            setDoc(doc(db, 'users', 'tanmay1_19'), tanmayAccount, { merge: true }),
            setDoc(doc(db, 'members', 'tanmay1_19'), { ...tanmayAccount, profilePhoto: tanmayAccount.photoUrl }, { merge: true }),
            setDoc(doc(db, 'clientProfiles', 'tanmay1_19'), tanmayProfile, { merge: true }),
            setDoc(doc(db, 'usernames', 'tanmay1_19'), {
              uid: 'tanmay1_19',
              username: 'tanmay1_19',
              email: 'tanmaymore0220@gmail.com'
            }, { merge: true }),
            setDoc(doc(db, 'memberships', historicalMembership.id), historicalMembership, { merge: true }),
            // Sync financial transaction across all 5 financial collections
            setDoc(doc(db, 'paymentTransactions', historicalTxn.id), historicalTxn, { merge: true }),
            setDoc(doc(db, 'transactions', historicalTxn.id), historicalTxn, { merge: true }),
            setDoc(doc(db, 'payments', historicalTxn.id), historicalTxn, { merge: true }),
            setDoc(doc(db, 'invoices', historicalTxn.id), historicalTxn, { merge: true }),
            setDoc(doc(db, 'billing_history', historicalTxn.id), historicalTxn, { merge: true }),
            // Sync historical attendance logs across both attendance and attendance_logs
            ...historicalAttendanceLogs.flatMap((log) => [
              setDoc(doc(db, 'attendance', log.id), log, { merge: true }),
              setDoc(doc(db, 'attendance_logs', log.id), log, { merge: true })
            ])
          ]);
        } catch (restoreErr) {
          console.warn('Pre-9AM account & gateway restoration note:', restoreErr);
        }
      })()
    ]);

    if (typeof window !== 'undefined') {
      localStorage.setItem(SEED_CACHE_FLAG_KEY, 'done');
    }
  } catch (err) {
    console.warn('Background seed note:', err);
  }
}


