import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, doc, onSnapshot, query, limit } from 'firebase/firestore';
import { WorkoutPlan, ExerciseItem } from '../../types';
import { INITIAL_WORKOUTS } from '../../services/db';
import { getCachedData, setCachedData, optimizeImageUrl } from '../../services/cacheService';
import { DEFAULT_WORKOUT_CATEGORIES } from '../admin/WorkoutLibraryManager';
import { ViewSkeleton } from '../common/ViewSkeleton';

const AerobicsModuleView = lazy(() =>
  import('./AerobicsModuleView').then((m) => ({ default: m.AerobicsModuleView }))
);
import {
  Dumbbell,
  Sparkles,
  UserCheck,
  Play,
  Info,
  CheckCircle2,
  Search,
  Lock,
  X,
  Video,
  Music
} from 'lucide-react';

interface WorkoutLibraryViewProps {
  initialSubTab?: 'library' | 'myWorkout' | 'aerobics';
}

export const WorkoutLibraryView: React.FC<WorkoutLibraryViewProps> = ({ initialSubTab }) => {
  const { currentUser, clientProfile } = useAuth();
  const isFemaleClient =
    currentUser?.role === 'client' &&
    (clientProfile?.gender || currentUser?.gender || '').trim().toLowerCase() === 'female';

  const [allWorkouts, setAllWorkouts] = useState<WorkoutPlan[]>(() =>
    getCachedData<WorkoutPlan[]>('workouts_library', INITIAL_WORKOUTS)
  );
  const [categories, setCategories] = useState<string[]>(() =>
    getCachedData<string[]>('workout_categories', ['All', ...DEFAULT_WORKOUT_CATEGORIES])
  );
  const [activeTab, setActiveTab] = useState<'library' | 'myWorkout' | 'aerobics'>(
    initialSubTab === 'aerobics' && isFemaleClient ? 'aerobics' : initialSubTab || 'library'
  );

  useEffect(() => {
    if (initialSubTab === 'aerobics' && isFemaleClient) {
      setActiveTab('aerobics');
    } else if (activeTab === 'aerobics' && !isFemaleClient) {
      setActiveTab('library');
    }
  }, [initialSubTab, isFemaleClient]);

  // Filters
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>('All');
  const [selectedGoal, setSelectedGoal] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedExerciseModal, setSelectedExerciseModal] = useState<{
    exercise: ExerciseItem;
    workoutTitle: string;
    category: string;
  } | null>(null);

  const fitnessGoals = [
    'All',
    'Muscle Gain',
    'Fat Loss',
    'Strength',
    'Endurance',
    'Flexibility',
    'General Fitness'
  ];

  useEffect(() => {
    // 1. Subscribe to workouts (bounded by limit(30)) and cache results
    const qWorkouts = query(collection(db, 'workouts'), limit(30));
    const unsubWorkouts = onSnapshot(
      qWorkouts,
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkoutPlan));
          setAllWorkouts(list);
          setCachedData('workouts_library', list);
        }
      },
      (err) => console.warn('Workouts listener note:', err)
    );

    // 2. Subscribe to Admin-configured categories
    const unsubCats = onSnapshot(
      doc(db, 'gymSettings', 'workout-categories'),
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data().list)) {
          const merged = Array.from(
            new Set(['All', ...DEFAULT_WORKOUT_CATEGORIES, ...snap.data().list])
          );
          setCategories(merged);
          setCachedData('workout_categories', merged);
        }
      },
      (err) => console.warn('Categories listener note:', err)
    );

    return () => {
      unsubWorkouts();
      unsubCats();
    };
  }, []);

  const hasActivePt = clientProfile?.ptStatus === 'active';

  // Filter only Admin-approved visible workouts for general library
  const generalVisibleWorkouts = allWorkouts.filter((w) => {
    if (w.visibleToClients === false || w.visibility === 'hidden') return false;
    if (w.visibility === 'pt_only') return false;
    if (w.clientId && !w.isGeneral) return false;
    return true;
  });

  // Filter PT-Exclusive and Trainer-Assigned workouts for this client
  const ptAssignedWorkouts = allWorkouts.filter((w) => {
    if (w.visibleToClients === false || w.visibility === 'hidden') return false;
    const isAssignedToMe = currentUser && w.clientId === currentUser.uid;
    const isPtExclusiveGeneral = w.visibility === 'pt_only' && (!w.clientId || w.clientId === '');
    return isAssignedToMe || isPtExclusiveGeneral;
  });

  const filteredGeneralWorkouts = generalVisibleWorkouts.filter((w) => {
    const normalizedCat = w.bodyPart === 'Abs/Core' ? 'Core' : w.bodyPart;
    const matchBody =
      selectedBodyPart === 'All' ||
      normalizedCat?.toLowerCase() === selectedBodyPart.toLowerCase() ||
      w.exercises?.some(ex => ex.muscleGroup?.toLowerCase() === selectedBodyPart.toLowerCase());

    const matchGoal =
      selectedGoal === 'All' || w.goal === selectedGoal || w.category === selectedGoal;

    const matchDiff =
      selectedDifficulty === 'All' || (w.difficulty || 'Intermediate') === selectedDifficulty;

    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      w.title.toLowerCase().includes(q) ||
      (w.bodyPart && w.bodyPart.toLowerCase().includes(q)) ||
      w.exercises?.some(
        ex =>
          ex.name.toLowerCase().includes(q) ||
          (ex.instructions && ex.instructions.toLowerCase().includes(q))
      );

    return matchBody && matchGoal && matchDiff && matchSearch;
  });

  return (
    <div className="space-y-4 pb-20 text-slate-800 animate-fade-in">
      {/* Header and Switcher */}
      <div className="vision-surface rounded-3xl p-5 border border-white/90 shadow-md space-y-3.5 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
              Live Training Library
            </span>
            <h2 className="text-lg font-black text-slate-900 mt-0.5 tracking-tight">
              Torrent Workout & Exercise Hub
            </h2>
            <p className="text-xs text-slate-600 mt-0.5 font-medium">
              Visual exercise demos, sets, reps & biomechanical form guides.
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-sky-400 text-white flex items-center justify-center shrink-0 shadow-md border border-white/60">
            <Dumbbell className="w-5 h-5 -rotate-45" />
          </div>
        </div>

        {/* Tab Toggle: General Library vs My Assigned Workout (PT) vs Female-Exclusive Aerobics */}
        <div className="flex bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'library'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Exercises ({generalVisibleWorkouts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('myWorkout')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'myWorkout'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>My PT</span>
            {hasActivePt && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
          {isFemaleClient && (
            <button
              type="button"
              onClick={() => setActiveTab('aerobics')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'aerobics'
                  ? 'bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-xs'
                  : 'text-rose-700 hover:bg-rose-50'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>Aerobics</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'aerobics' && isFemaleClient ? (
        <Suspense fallback={<ViewSkeleton cards={2} />}>
          <AerobicsModuleView />
        </Suspense>
      ) : activeTab === 'library' ? (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exercises (e.g. Bench Press, Squat, Lat Pulldown)..."
              className="w-full pl-9 pr-4 py-2.5 bg-white/90 border border-white/90 rounded-2xl text-xs text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
            />
          </div>

          {/* Muscle Category Filter Bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Muscle Category
              </span>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="text-[11px] font-bold text-indigo-700 bg-white/80 border border-slate-200/90 rounded-lg px-2 py-0.5 focus:outline-none"
              >
                <option value="All">All Levels</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {categories.map((bp) => (
                <button
                  key={bp}
                  type="button"
                  onClick={() => setSelectedBodyPart(bp)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    selectedBodyPart === bp
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white/85 text-slate-700 border-white/90 hover:bg-white'
                  }`}
                >
                  {bp}
                </button>
              ))}
            </div>
          </div>

          {/* Goal Filter Chips */}
          <div>
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1.5 px-1">
              Training Goal
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {fitnessGoals.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGoal(g)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    selectedGoal === g
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white/85 text-slate-600 border-white/90 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Workouts List */}
          <div className="space-y-3.5">
            {filteredGeneralWorkouts.length === 0 ? (
              <div className="p-8 text-center vision-surface rounded-3xl border border-white/90 text-slate-600 space-y-2">
                <Dumbbell className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-800">
                  No workouts found matching these filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBodyPart('All');
                    setSelectedGoal('All');
                    setSelectedDifficulty('All');
                    setSearchQuery('');
                  }}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              filteredGeneralWorkouts.map((workout) => {
                const displayCat = workout.bodyPart === 'Abs/Core' ? 'Core' : workout.bodyPart;
                const coverImg =
                  workout.thumbnailUrl ||
                  workout.exercises?.find(e => e.imageUrl)?.imageUrl;

                return (
                  <div
                    key={workout.id}
                    className="vision-surface rounded-3xl overflow-hidden border border-white/90 shadow-sm space-y-3"
                  >
                    {/* Optional Cover Banner if present */}
                    {coverImg && (
                      <div className="relative h-32 bg-slate-900 overflow-hidden">
                        {workout.videoUrl ? (
                          <video
                            src={workout.videoUrl}
                            className="w-full h-full object-cover opacity-90"
                            muted
                            loop
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={optimizeImageUrl(coverImg, 640, 70)}
                            alt={workout.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover opacity-90"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
                        <div className="absolute top-3 left-3.5 right-3.5 flex items-center justify-between text-white text-[10px] font-bold">
                          <span className="uppercase tracking-wider bg-indigo-600/90 px-2.5 py-0.5 rounded-md">
                            {displayCat}
                          </span>
                          <span className="bg-black/50 backdrop-blur-xs px-2 py-0.5 rounded-md">
                            {workout.difficulty || 'Intermediate'} · {workout.goal}
                          </span>
                        </div>
                        <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-end justify-between text-white">
                          <h3 className="text-sm sm:text-base font-black tracking-tight drop-shadow-xs">
                            {workout.title}
                          </h3>
                          <span className="text-[11px] font-bold text-white/85">
                            {workout.exercises.length} Exercises
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="p-4 pt-2 space-y-2">
                      {!coverImg && (
                        <div className="flex items-start justify-between pb-2 border-b border-slate-200/80">
                          <div>
                            <div className="flex items-center gap-2 text-[11px] text-indigo-600 font-bold">
                              <span>{displayCat}</span>
                              <span>·</span>
                              <span>{workout.difficulty || 'Intermediate'}</span>
                              <span>·</span>
                              <span>{workout.goal}</span>
                            </div>
                            <h3 className="text-sm font-black text-slate-900 mt-0.5">
                              {workout.title}
                            </h3>
                          </div>
                          <span className="text-xs font-bold text-slate-500">
                            {workout.exercises.length} Exercises
                          </span>
                        </div>
                      )}

                      {/* Exercises in routine */}
                      <div className="space-y-2 pt-1">
                        {workout.exercises.map((ex, exIdx) => (
                          <div
                            key={exIdx}
                            onClick={() =>
                              setSelectedExerciseModal({
                                exercise: ex,
                                workoutTitle: workout.title,
                                category: ex.muscleGroup || displayCat
                              })
                            }
                            className="p-2.5 bg-white/90 hover:bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-300 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Exercise Media Thumbnail */}
                              <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                                {ex.imageUrl ? (
                                  <img
                                    src={optimizeImageUrl(ex.imageUrl, 240, 68)}
                                    alt={ex.name}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Dumbbell className="w-5 h-5 text-indigo-500" />
                                )}
                                {ex.videoUrl && (
                                  <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                                    <Play className="w-4 h-4 fill-current" />
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="text-xs font-black text-slate-900 truncate">
                                  {ex.name}
                                </div>
                                <div className="text-[11px] text-indigo-600 font-bold mt-0.5">
                                  {ex.sets} · {ex.reps}
                                  {ex.difficulty ? ` · ${ex.difficulty}` : ''}
                                </div>
                                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                  {ex.instructions}
                                </p>
                              </div>
                            </div>

                            <span className="text-[11px] text-indigo-600 font-bold flex items-center gap-1 shrink-0 bg-indigo-50 px-2.5 py-1.5 rounded-xl">
                              <span>Guide</span>
                              <Info className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* My Assigned / PT Exclusive Workout Tab */
        <div className="space-y-4">
          {!hasActivePt ? (
            <div className="vision-surface rounded-3xl p-6 border border-white/90 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">
                Personal Training Exclusive Routines
              </h3>
              <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed font-medium">
                Custom trainer-prescribed workouts and PT-exclusive hypertrophy blocks are unlocked when you enroll with a Personal Trainer.
              </p>
              <div className="pt-1">
                <span className="text-xs font-bold text-amber-700">
                  Active PT Membership Required
                </span>
              </div>
            </div>
          ) : ptAssignedWorkouts.length === 0 ? (
            <div className="p-8 text-center vision-surface rounded-3xl border border-white/90 text-slate-700 space-y-2 shadow-sm">
              <UserCheck className="w-8 h-8 text-indigo-600 mx-auto" />
              <h4 className="text-sm font-black text-slate-900">
                No Custom PT Workouts Assigned Yet
              </h4>
              <p className="text-xs text-slate-600">
                Your assigned coach (<strong>{clientProfile?.assignedTrainerName || 'Trainer'}</strong>) will publish your custom routine here.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 font-bold flex items-center gap-2 shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Exclusive PT Workouts unlocked for <strong>{clientProfile?.displayName}</strong>
                </span>
              </div>

              {ptAssignedWorkouts.map((w) => (
                <div
                  key={w.id}
                  className="vision-surface rounded-3xl p-4 border border-white/90 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between border-b border-slate-200/80 pb-2.5">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">
                        PT Exclusive Routine · {w.bodyPart}
                      </span>
                      <h4 className="text-sm font-black text-slate-900 mt-0.5">{w.title}</h4>
                    </div>
                    <span className="text-xs font-bold text-slate-500">
                      {w.exercises.length} Exercises
                    </span>
                  </div>

                  <div className="space-y-2">
                    {w.exercises.map((ex, i) => (
                      <div
                        key={i}
                        onClick={() =>
                          setSelectedExerciseModal({
                            exercise: ex,
                            workoutTitle: w.title,
                            category: ex.muscleGroup || w.bodyPart
                          })
                        }
                        className="p-2.5 bg-white/90 hover:bg-white rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                            {ex.imageUrl ? (
                              <img
                                src={ex.imageUrl}
                                alt={ex.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Dumbbell className="w-4 h-4 text-indigo-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate">{ex.name}</p>
                            <p className="text-[11px] text-indigo-600 font-bold">
                              {ex.sets} · {ex.reps}
                            </p>
                          </div>
                        </div>
                        <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Exercise Detail & Media Playback Modal */}
      {selectedExerciseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface rounded-3xl overflow-hidden shadow-2xl border border-white/90 max-h-[88vh] flex flex-col text-slate-800">
            {/* Media Demonstration Header (Video or Photo/GIF) */}
            {selectedExerciseModal.exercise.videoUrl ? (
              <div className="relative h-56 bg-slate-900 shrink-0">
                <video
                  src={selectedExerciseModal.exercise.videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setSelectedExerciseModal(null)}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : selectedExerciseModal.exercise.imageUrl ? (
              <div className="relative h-52 bg-slate-900 shrink-0">
                <img
                  src={selectedExerciseModal.exercise.imageUrl}
                  alt={selectedExerciseModal.exercise.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
                <button
                  type="button"
                  onClick={() => setSelectedExerciseModal(null)}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 left-4 right-4 text-white">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-600 px-2 py-0.5 rounded-md">
                    {selectedExerciseModal.category} · {selectedExerciseModal.exercise.difficulty || 'Intermediate'}
                  </span>
                  <h3 className="text-base font-black mt-1 drop-shadow-xs">
                    {selectedExerciseModal.exercise.name}
                  </h3>
                </div>
              </div>
            ) : null}

            <div className="p-5 overflow-y-auto space-y-4">
              {!selectedExerciseModal.exercise.imageUrl && (
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
                      {selectedExerciseModal.category} · {selectedExerciseModal.exercise.difficulty || 'Intermediate'}
                    </span>
                    <h3 className="text-base font-black text-slate-900 mt-0.5">
                      {selectedExerciseModal.exercise.name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedExerciseModal(null)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-full"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Target Sets & Reps */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-50/90 p-3 rounded-2xl text-center border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Recommended Sets
                  </span>
                  <span className="text-sm font-black text-indigo-600 mt-0.5 block">
                    {selectedExerciseModal.exercise.sets}
                  </span>
                </div>
                <div className="bg-slate-50/90 p-3 rounded-2xl text-center border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Target Reps
                  </span>
                  <span className="text-sm font-black text-indigo-600 mt-0.5 block">
                    {selectedExerciseModal.exercise.reps}
                  </span>
                </div>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Step-by-Step Instructions
                </h4>
                <p className="text-xs text-slate-800 leading-relaxed bg-white p-3.5 rounded-2xl border border-slate-200/90 font-medium shadow-2xs">
                  {selectedExerciseModal.exercise.instructions}
                </p>
              </div>

              {/* Correct Form Notes */}
              {selectedExerciseModal.exercise.formNotes && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Correct Form & Biomechanics</span>
                  </h4>
                  <p className="text-xs text-emerald-950 bg-emerald-50/90 p-3.5 rounded-2xl border border-emerald-200 leading-relaxed font-medium">
                    {selectedExerciseModal.exercise.formNotes}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedExerciseModal(null)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Close Exercise Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
