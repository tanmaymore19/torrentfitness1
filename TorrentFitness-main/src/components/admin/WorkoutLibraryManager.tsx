import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  WorkoutPlan,
  ExerciseItem,
  DifficultyLevel,
  WorkoutVisibility,
  ClientProfile
} from '../../types';
import { INITIAL_WORKOUTS } from '../../services/db';
import { GlobalDeleteConfirmModal } from '../common/GlobalDeleteConfirmModal';
import { MediaUploadAdjustModal, MediaUploadResult } from '../common/MediaUploadAdjustModal';
import {
  Dumbbell,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Lock,
  Upload,
  Video,
  Image as ImageIcon,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  X,
  FolderPlus,
  Layers,
  Play,
  Info,
  UserCheck,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export type WorkoutManagerViewMode = 'catalog' | 'media_hub' | 'visibility';

interface WorkoutLibraryManagerProps {
  workouts: WorkoutPlan[];
  clients?: ClientProfile[];
  viewMode?: WorkoutManagerViewMode;
}

export const DEFAULT_WORKOUT_CATEGORIES = [
  'Chest',
  'Back',
  'Legs',
  'Core',
  'Cardio',
  'Shoulders',
  'Arms',
  'Full Body'
];

const FITNESS_GOALS = [
  'Muscle Gain',
  'Fat Loss',
  'Strength',
  'Endurance',
  'Flexibility',
  'General Fitness'
];

const DIFFICULTY_LEVELS: DifficultyLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

const DEMO_MEDIA_PRESETS = [
  {
    label: 'Bench Press / Chest Demo',
    imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
    videoUrl: ''
  },
  {
    label: 'Back Pull / Deadlift Demo',
    imageUrl: 'https://images.unsplash.com/photo-1605296867304-46d5465a13f1?auto=format&fit=crop&w=800&q=80',
    videoUrl: ''
  },
  {
    label: 'Barbell Squat / Legs Demo',
    imageUrl: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=800&q=80',
    videoUrl: ''
  },
  {
    label: 'Core / Abs Conditioning',
    imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
    videoUrl: ''
  },
  {
    label: 'HIIT Cardio Sprint Video',
    imageUrl: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  }
];

export const WorkoutLibraryManager: React.FC<WorkoutLibraryManagerProps> = ({
  workouts,
  clients = [],
  viewMode = 'catalog'
}) => {
  // Categories state (synced with Firestore gymSettings/workout-categories)
  const [categories, setCategories] = useState<string[]>(DEFAULT_WORKOUT_CATEGORIES);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  // Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedVisibilityFilter, setSelectedVisibilityFilter] = useState<'all' | 'visible' | 'pt_only' | 'hidden'>('all');
  const [selectedDifficultyFilter, setSelectedDifficultyFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states for Add/Edit Workout & Exercise
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutPlan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Standalone Exercise Modal state
  const [isQuickExerciseOpen, setIsQuickExerciseOpen] = useState(false);
  const [targetWorkoutIdForExercise, setTargetWorkoutIdForExercise] = useState<string>('new');

  // Preview Exercise Detail Modal
  const [previewExercise, setPreviewExercise] = useState<{
    exercise: ExerciseItem;
    workoutTitle: string;
  } | null>(null);

  // Global Delete Confirmation Modal State
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{
    title: string;
    itemName: string;
    itemType: string;
    description: string;
    warningNote?: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Workout Form State
  const [title, setTitle] = useState('');
  const [bodyPart, setBodyPart] = useState<string>('Chest');
  const [goal, setGoal] = useState<string>('Muscle Gain');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Intermediate');
  const [visibility, setVisibility] = useState<WorkoutVisibility>('visible');
  const [assignedClientId, setAssignedClientId] = useState<string>('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [exercises, setExercises] = useState<ExerciseItem[]>([
    {
      name: '',
      muscleGroup: 'Chest',
      difficulty: 'Intermediate',
      sets: '3 Sets',
      reps: '10-12 Reps',
      instructions: '',
      formNotes: '',
      imageUrl: '',
      videoUrl: ''
    }
  ]);

  // Quick Exercise Form State
  const [quickExName, setQuickExName] = useState('');
  const [quickExCategory, setQuickExCategory] = useState('Chest');
  const [quickExDifficulty, setQuickExDifficulty] = useState<DifficultyLevel>('Intermediate');
  const [quickExSets, setQuickExSets] = useState('4 Sets');
  const [quickExReps, setQuickExReps] = useState('10-12 Reps');
  const [quickExInstructions, setQuickExInstructions] = useState('');
  const [quickExFormNotes, setQuickExFormNotes] = useState('');
  const [quickExImageUrl, setQuickExImageUrl] = useState('');
  const [quickExVideoUrl, setQuickExVideoUrl] = useState('');
  const [quickExVisibility, setQuickExVisibility] = useState<WorkoutVisibility>('visible');

  // Subscribe to custom workout categories from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'gymSettings', 'workout-categories'),
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data().list)) {
          const merged = Array.from(new Set([...DEFAULT_WORKOUT_CATEGORIES, ...snap.data().list]));
          setCategories(merged);
        }
      },
      (err) => {
        console.warn('workout-categories listener notice:', err);
      }
    );
    return () => unsub();
  }, []);

  // Normalize workout visibility helper
  const getWorkoutVisibility = (w: WorkoutPlan): WorkoutVisibility => {
    if (w.visibility) return w.visibility;
    if (w.visibleToClients === false) return 'hidden';
    if (!w.isGeneral && w.clientId) return 'pt_only';
    return 'visible';
  };

  // Add a new category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewCategoryName('');
      return;
    }
    const updated = [...categories, trimmed];
    setCategories(updated);
    setNewCategoryName('');
    try {
      await setDoc(doc(db, 'gymSettings', 'workout-categories'), {
        list: updated,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Error saving category:', err);
    }
  };

  // Remove a custom category
  const handleDeleteCategory = (cat: string) => {
    if (DEFAULT_WORKOUT_CATEGORIES.includes(cat)) return;
    setPendingDeleteAction({
      title: 'Delete Workout Category',
      itemName: cat,
      itemType: 'Custom Muscle Category',
      description: `Are you sure you want to remove the custom category "${cat}"?`,
      confirmLabel: 'Yes, Delete Category',
      onConfirm: async () => {
        const updated = categories.filter(c => c !== cat);
        setCategories(updated);
        if (selectedCategory === cat) setSelectedCategory('All');
        await setDoc(doc(db, 'gymSettings', 'workout-categories'), {
          list: updated,
          updatedAt: new Date().toISOString()
        });
      }
    });
  };

  // Open Create Workout Modal
  const handleOpenCreateWorkout = () => {
    setEditingWorkout(null);
    setTitle('');
    setBodyPart(selectedCategory !== 'All' ? selectedCategory : 'Chest');
    setGoal('Muscle Gain');
    setDifficulty('Intermediate');
    setVisibility('visible');
    setAssignedClientId('');
    setThumbnailUrl('');
    setVideoUrl('');
    setExercises([
      {
        name: '',
        muscleGroup: selectedCategory !== 'All' ? selectedCategory : 'Chest',
        difficulty: 'Intermediate',
        sets: '4 Sets',
        reps: '10-12 Reps',
        instructions: '',
        formNotes: '',
        imageUrl: '',
        videoUrl: ''
      }
    ]);
    setIsModalOpen(true);
  };

  // Open Edit Workout Modal
  const handleOpenEditWorkout = (w: WorkoutPlan) => {
    setEditingWorkout(w);
    setTitle(w.title || '');
    setBodyPart(w.bodyPart === 'Abs/Core' ? 'Core' : w.bodyPart || 'Chest');
    setGoal(w.goal || w.category || 'Muscle Gain');
    setDifficulty(w.difficulty || 'Intermediate');
    setVisibility(getWorkoutVisibility(w));
    setAssignedClientId(w.clientId || '');
    setThumbnailUrl(w.thumbnailUrl || '');
    setVideoUrl(w.videoUrl || '');
    setExercises(
      w.exercises && w.exercises.length > 0
        ? w.exercises.map(ex => ({
            ...ex,
            muscleGroup: ex.muscleGroup || w.bodyPart || 'Chest',
            difficulty: ex.difficulty || w.difficulty || 'Intermediate',
            imageUrl: ex.imageUrl || '',
            videoUrl: ex.videoUrl || ''
          }))
        : [
            {
              name: '',
              muscleGroup: w.bodyPart || 'Chest',
              difficulty: w.difficulty || 'Intermediate',
              sets: '3 Sets',
              reps: '10-12 Reps',
              instructions: '',
              formNotes: '',
              imageUrl: '',
              videoUrl: ''
            }
          ]
    );
    setIsModalOpen(true);
  };

  // Interactive Media Upload & Cropper Modal State
  const [mediaModalState, setMediaModalState] = useState<{
    file: File;
    onDone: (result: MediaUploadResult) => void;
  } | null>(null);

  // Handle file upload for routine cover or exercise media
  const handleMediaFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    onUploaded: (dataUrl: string, isVideo: boolean) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMediaModalState({
      file,
      onDone: (res: MediaUploadResult) => {
        onUploaded(res.mediaUrl, res.mediaType === 'video');
      }
    });

    // Reset input
    e.target.value = '';
  };

  // Add exercise row inside workout modal
  const handleAddExerciseRow = () => {
    setExercises(prev => [
      ...prev,
      {
        name: '',
        muscleGroup: bodyPart || 'Chest',
        difficulty: difficulty || 'Intermediate',
        sets: '3 Sets',
        reps: '10-12 Reps',
        instructions: '',
        formNotes: '',
        imageUrl: '',
        videoUrl: ''
      }
    ]);
  };

  // Remove exercise row inside workout modal
  const handleRemoveExerciseRow = (index: number) => {
    if (exercises.length <= 1) return;
    setExercises(prev => prev.filter((_, i) => i !== index));
  };

  // Update specific exercise field
  const handleUpdateExerciseField = (index: number, field: keyof ExerciseItem, value: any) => {
    setExercises(prev =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  // Save Workout Routine & Exercises to Firestore
  const handleSaveWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    const validExercises = exercises.filter(ex => ex.name.trim() !== '');
    if (!title.trim() || validExercises.length === 0) return;

    setIsSubmitting(true);
    try {
      const workoutId = editingWorkout ? editingWorkout.id : `workout_${Date.now()}`;
      const isVisible = visibility !== 'hidden';
      const isGeneral = visibility === 'visible';

      const payload: WorkoutPlan = {
        id: workoutId,
        title: title.trim(),
        category: goal,
        goal,
        bodyPart,
        difficulty,
        thumbnailUrl: thumbnailUrl.trim() || validExercises[0]?.imageUrl || '',
        videoUrl: videoUrl.trim(),
        isGeneral,
        visibleToClients: isVisible,
        visibility,
        clientId: visibility === 'pt_only' && assignedClientId ? assignedClientId : undefined,
        exercises: validExercises.map(ex => ({
          name: ex.name.trim(),
          muscleGroup: ex.muscleGroup || bodyPart,
          difficulty: ex.difficulty || difficulty,
          sets: ex.sets.trim() || '3 Sets',
          reps: ex.reps.trim() || '10-12 Reps',
          instructions: ex.instructions.trim() || 'Perform with controlled tempo and proper breathing.',
          formNotes: ex.formNotes?.trim() || '',
          imageUrl: ex.imageUrl?.trim() || '',
          videoUrl: ex.videoUrl?.trim() || ''
        })),
        createdAt: editingWorkout?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Clean undefined fields for Firestore
      const cleanPayload = JSON.parse(JSON.stringify(payload));
      await setDoc(doc(db, 'workouts', workoutId), cleanPayload);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving workout:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Quick Single Exercise (either appends to an existing routine or creates a new routine card)
  const handleSaveQuickExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickExName.trim()) return;

    setIsSubmitting(true);
    try {
      const newExercise: ExerciseItem = {
        name: quickExName.trim(),
        muscleGroup: quickExCategory,
        difficulty: quickExDifficulty,
        sets: quickExSets.trim() || '3 Sets',
        reps: quickExReps.trim() || '10-12 Reps',
        instructions: quickExInstructions.trim() || 'Execute with controlled full range of motion.',
        formNotes: quickExFormNotes.trim(),
        imageUrl: quickExImageUrl.trim(),
        videoUrl: quickExVideoUrl.trim()
      };

      if (targetWorkoutIdForExercise !== 'new') {
        const existing = workouts.find(w => w.id === targetWorkoutIdForExercise);
        if (existing) {
          const updatedExercises = [...(existing.exercises || []), newExercise];
          await updateDoc(doc(db, 'workouts', existing.id), {
            exercises: updatedExercises,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        const workoutId = `workout_ex_${Date.now()}`;
        const payload: WorkoutPlan = {
          id: workoutId,
          title: `${quickExName.trim()} (${quickExCategory})`,
          category: 'Muscle Gain',
          goal: 'Muscle Gain',
          bodyPart: quickExCategory,
          difficulty: quickExDifficulty,
          thumbnailUrl: quickExImageUrl.trim(),
          videoUrl: quickExVideoUrl.trim(),
          isGeneral: quickExVisibility === 'visible',
          visibleToClients: quickExVisibility !== 'hidden',
          visibility: quickExVisibility,
          exercises: [newExercise],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'workouts', workoutId), JSON.parse(JSON.stringify(payload)));
      }

      setIsQuickExerciseOpen(false);
      setQuickExName('');
      setQuickExInstructions('');
      setQuickExFormNotes('');
      setQuickExImageUrl('');
      setQuickExVideoUrl('');
    } catch (err) {
      console.error('Error saving quick exercise:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Client Visibility directly from card
  const handleCycleVisibility = async (w: WorkoutPlan) => {
    const current = getWorkoutVisibility(w);
    const next: WorkoutVisibility =
      current === 'visible' ? 'hidden' : current === 'hidden' ? 'pt_only' : 'visible';

    try {
      await updateDoc(doc(db, 'workouts', w.id), {
        visibility: next,
        visibleToClients: next !== 'hidden',
        isGeneral: next === 'visible',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to update visibility:', err);
    }
  };

  // Direct toggle Visible <-> Hidden
  const handleToggleClientVisible = async (w: WorkoutPlan) => {
    const current = getWorkoutVisibility(w);
    const next: WorkoutVisibility = current === 'hidden' ? 'visible' : 'hidden';
    try {
      await updateDoc(doc(db, 'workouts', w.id), {
        visibility: next,
        visibleToClients: next !== 'hidden',
        isGeneral: next === 'visible',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
    }
  };

  // Delete entire workout routine
  const handleDeleteWorkout = (id: string) => {
    const target = workouts.find(w => w.id === id);
    setPendingDeleteAction({
      title: 'Delete Workout Routine',
      itemName: target ? `${target.title} (${target.bodyPart})` : id,
      itemType: 'Workout Routine',
      description: 'Are you sure you want to permanently delete this workout routine and all exercises inside it?',
      warningNote: 'This routine will be immediately removed from the Client Workout Library.',
      confirmLabel: 'Yes, Delete Routine',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'workouts', id));
      }
    });
  };

  // Delete single exercise inside a workout
  const handleDeleteExerciseFromWorkout = (workout: WorkoutPlan, exIndex: number) => {
    if (workout.exercises.length <= 1) {
      handleDeleteWorkout(workout.id);
      return;
    }
    const targetEx = workout.exercises[exIndex];
    setPendingDeleteAction({
      title: 'Delete Exercise from Routine',
      itemName: `${targetEx?.name || 'Exercise'} (in ${workout.title})`,
      itemType: 'Exercise Item',
      description: `Are you sure you want to remove "${targetEx?.name || 'this exercise'}" from "${workout.title}"?`,
      confirmLabel: 'Yes, Delete Exercise',
      onConfirm: async () => {
        const updated = workout.exercises.filter((_, idx) => idx !== exIndex);
        await updateDoc(doc(db, 'workouts', workout.id), {
          exercises: updated,
          updatedAt: new Date().toISOString()
        });
      }
    });
  };

  // Seed / Restore default workouts
  const handleSeedDefaultWorkouts = async () => {
    try {
      for (const w of INITIAL_WORKOUTS) {
        await setDoc(doc(db, 'workouts', w.id), w);
      }
    } catch (err) {
      console.error('Error seeding default workouts:', err);
    }
  };

  // Compute filtered workouts
  const filteredWorkouts = workouts.filter(w => {
    const normalizedBodyPart = w.bodyPart === 'Abs/Core' ? 'Core' : w.bodyPart;
    const matchCategory =
      selectedCategory === 'All' ||
      normalizedBodyPart?.toLowerCase() === selectedCategory.toLowerCase() ||
      w.exercises?.some(ex => ex.muscleGroup?.toLowerCase() === selectedCategory.toLowerCase());

    const vis = getWorkoutVisibility(w);
    const matchVis = selectedVisibilityFilter === 'all' || vis === selectedVisibilityFilter;

    const matchDiff =
      selectedDifficultyFilter === 'All' ||
      (w.difficulty || 'Intermediate') === selectedDifficultyFilter;

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

    return matchCategory && matchVis && matchDiff && matchSearch;
  });

  // Total exercises count
  const totalExercisesCount = workouts.reduce(
    (acc, w) => acc + (w.exercises ? w.exercises.length : 0),
    0
  );
  const visibleWorkoutsCount = workouts.filter(w => getWorkoutVisibility(w) === 'visible').length;
  const ptOnlyWorkoutsCount = workouts.filter(w => getWorkoutVisibility(w) === 'pt_only').length;
  const hiddenWorkoutsCount = workouts.filter(w => getWorkoutVisibility(w) === 'hidden').length;

  // Direct explicit visibility setter
  const handleSetExplicitVisibility = async (w: WorkoutPlan, next: WorkoutVisibility, clientId?: string) => {
    try {
      const updateData: any = {
        visibility: next,
        visibleToClients: next !== 'hidden',
        isGeneral: next === 'visible',
        updatedAt: new Date().toISOString()
      };
      if (clientId !== undefined) {
        updateData.clientId = clientId || null;
      }
      await updateDoc(doc(db, 'workouts', w.id), updateData);
    } catch (err) {
      console.error('Failed to set visibility:', err);
    }
  };

  // Direct inline exercise media upload
  const handleDirectExerciseMediaUpload = (workout: WorkoutPlan, exIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (!isVideo) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new window.Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const maxW = 900;
          const scale = img.width > maxW ? maxW / img.width : 1;
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            const updatedExercises = workout.exercises.map((ex, idx) =>
              idx === exIndex ? { ...ex, imageUrl: dataUrl } : ex
            );
            await updateDoc(doc(db, 'workouts', workout.id), {
              exercises: updatedExercises,
              thumbnailUrl: workout.thumbnailUrl || dataUrl,
              updatedAt: new Date().toISOString()
            });
          }
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const updatedExercises = workout.exercises.map((ex, idx) =>
          idx === exIndex ? { ...ex, videoUrl: dataUrl } : ex
        );
        await updateDoc(doc(db, 'workouts', workout.id), {
          exercises: updatedExercises,
          updatedAt: new Date().toISOString()
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      {/* Top Executive Header */}
      <div className="vision-surface rounded-3xl p-6 border border-white/90 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-indigo-700 font-bold uppercase tracking-wider">
            <Dumbbell className="w-4 h-4 -rotate-45 text-indigo-600" />
            <span>
              {viewMode === 'media_hub'
                ? 'Domain 05 • Sub-Feature 2: Exercise Media Hub'
                : viewMode === 'visibility'
                ? 'Domain 05 • Sub-Feature 3: Client Visibility Controller'
                : 'Domain 05 • Sub-Feature 1: Exercise Master Catalog'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tracking-tight">
            {viewMode === 'media_hub'
              ? 'Exercise Media Hub (Photos, GIFs & Videos)'
              : viewMode === 'visibility'
              ? 'Client Visibility Controller (Public / PT-Only / Hidden)'
              : 'Exercise Master Catalog & Category Engine'}
          </h2>
          <p className="text-xs text-slate-600 max-w-2xl mt-1 leading-relaxed">
            {viewMode === 'media_hub'
              ? 'Upload demonstration photos, animated GIFs, or instructional MP4 videos directly to any exercise in the library.'
              : viewMode === 'visibility'
              ? 'Control which workouts and exercises are visible to regular clients vs locked/hidden or exclusive to Personal Training (PT) clients.'
              : 'Create, edit, or delete exercises and routines with muscle groups, difficulty levels, sets/reps recommendations, and step-by-step instructions.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowCategoryManager(!showCategoryManager)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-2xs ${
              showCategoryManager
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'vision-card text-slate-700 hover:text-indigo-600 border-white/90'
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Categories ({categories.length})</span>
          </button>

          <button
            type="button"
            onClick={handleSeedDefaultWorkouts}
            className="px-3.5 py-2 vision-card text-xs font-bold text-slate-700 hover:text-indigo-600 rounded-xl border border-white/90 transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Restore Presets</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setQuickExCategory(selectedCategory !== 'All' ? selectedCategory : 'Chest');
              setTargetWorkoutIdForExercise(workouts[0]?.id || 'new');
              setIsQuickExerciseOpen(true);
            }}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Quick Add Exercise</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateWorkout}
            className="px-4 py-2 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Workout Routine</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="vision-card p-4 rounded-2xl border border-white/90">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Routines & Exercises</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            {workouts.length} <span className="text-xs font-bold text-slate-500">/ {totalExercisesCount} ex</span>
          </span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Across {categories.length} categories</span>
        </div>

        <div className="vision-card p-4 rounded-2xl border border-white/90">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Visible to All Clients</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">{visibleWorkoutsCount}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Live on Client Portal</span>
        </div>

        <div className="vision-card p-4 rounded-2xl border border-white/90">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">PT Exclusive</span>
          <span className="text-2xl font-black text-indigo-600 mt-1 block">{ptOnlyWorkoutsCount}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Unlocked for active PT members</span>
        </div>

        <div className="vision-card p-4 rounded-2xl border border-white/90">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Hidden / Locked</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">{hiddenWorkoutsCount}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Hidden from regular clients</span>
        </div>
      </div>

      {/* Focused Visibility Controller Matrix when viewMode === 'visibility' */}
      {viewMode === 'visibility' && (
        <div className="vision-surface rounded-3xl p-5 border border-white/90 shadow-md space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-600" />
                <span>Master Client Visibility Control Matrix</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Instant 1-click access control for every workout routine and its exercises. Changes sync live to the Client Portal.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-200/80 bg-white/80 rounded-2xl border border-slate-200/80 overflow-hidden">
            {workouts.map((w) => {
              const vis = getWorkoutVisibility(w);
              return (
                <div key={w.id} className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={w.thumbnailUrl || w.exercises?.[0]?.imageUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=400&q=80'}
                      alt={w.title}
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black text-slate-900 truncate">{w.title}</h4>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {w.bodyPart}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {w.exercises?.length || 0} Exercises • Difficulty: <strong className="text-slate-700">{w.difficulty || 'Intermediate'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {vis === 'pt_only' && clients.length > 0 && (
                      <select
                        value={w.clientId || ''}
                        onChange={(e) => handleSetExplicitVisibility(w, 'pt_only', e.target.value)}
                        className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-[11px] font-bold text-indigo-800 focus:outline-none"
                      >
                        <option value="">All Active PT Clients</option>
                        {clients.map(c => (
                          <option key={c.userId} value={c.userId}>
                            Exclusive to: {c.displayName}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleSetExplicitVisibility(w, 'visible')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                          vis === 'visible'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        <span>Public</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetExplicitVisibility(w, 'pt_only')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                          vis === 'pt_only'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <UserCheck className="w-3 h-3" />
                        <span>PT-Only</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetExplicitVisibility(w, 'hidden')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                          vis === 'hidden'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <EyeOff className="w-3 h-3" />
                        <span>Hidden</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Focused Exercise Media Hub Workbench when viewMode === 'media_hub' */}
      {viewMode === 'media_hub' && (
        <div className="vision-surface rounded-3xl p-5 border border-white/90 shadow-md space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Direct Exercise Demonstration Media Uploader</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Directly upload demonstration photos, animated GIFs, or instructional videos for any exercise below, or click Edit on any card for full URL & preset options.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {workouts.flatMap(w =>
              (w.exercises || []).map((ex, exIdx) => ({ workout: w, ex, exIdx }))
            ).map(({ workout, ex, exIdx }, flatIdx) => (
              <div
                key={`${workout.id}_${exIdx}_${flatIdx}`}
                className="p-3.5 bg-white/90 rounded-2xl border border-slate-200/90 flex items-center justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                    {ex.imageUrl ? (
                      <img src={ex.imageUrl} alt={ex.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-slate-400" />
                    )}
                    {ex.videoUrl && (
                      <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-indigo-600 text-white text-[8px] font-black">
                        MP4
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-slate-900 truncate">{ex.name}</h4>
                    <p className="text-[10px] text-slate-500 truncate">{workout.title} • {ex.muscleGroup || workout.bodyPart}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        ex.imageUrl ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {ex.imageUrl ? 'Photo/GIF Ready' : 'No Photo'}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        ex.videoUrl ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {ex.videoUrl ? 'Video Linked' : 'No Video'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 shadow-2xs">
                    <Upload className="w-3 h-3" />
                    <span>Upload Media</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => handleDirectExerciseMediaUpload(workout, exIdx, e)}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleOpenEditWorkout(workout)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200"
                    title="Open Full Media & URL Editor"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable Category Manager Panel */}
      {showCategoryManager && (
        <div className="vision-surface rounded-3xl p-5 border border-white/90 shadow-md space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Exercise Category Management</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Organize workouts by muscle group or training style (Chest, Back, Legs, Core, Cardio, etc.). Custom categories sync immediately to the Client Portal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCategoryManager(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              Close
            </button>
          </div>

          <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Add new category (e.g. Calisthenics, Mobility, Glutes, CrossFit)..."
              className="flex-1 px-3.5 py-2 bg-white border border-slate-200/90 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Category</span>
            </button>
          </form>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
            {categories.map((cat) => {
              const count = workouts.filter(
                w =>
                  (w.bodyPart === 'Abs/Core' ? 'Core' : w.bodyPart)?.toLowerCase() === cat.toLowerCase()
              ).length;
              const isDefault = DEFAULT_WORKOUT_CATEGORIES.includes(cat);
              return (
                <div
                  key={cat}
                  className="p-3 bg-white/90 rounded-2xl border border-slate-200/80 flex items-center justify-between shadow-2xs"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{cat}</span>
                    <span className="text-[10px] text-slate-500 font-medium">{count} routines</span>
                  </div>
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      title="Remove custom category"
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search, Category Filter & Visibility Filter Bar */}
      <div className="vision-surface rounded-3xl p-4 border border-white/90 shadow-sm space-y-3.5">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exercises, workout titles, muscle groups, or instructions..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200/90 rounded-xl text-xs text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
          </div>

          {/* Client Visibility Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
            {[
              { id: 'all', label: 'All Status' },
              { id: 'visible', label: 'Visible to Clients' },
              { id: 'pt_only', label: 'PT Exclusive' },
              { id: 'hidden', label: 'Hidden' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedVisibilityFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedVisibilityFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Difficulty Filter */}
          <select
            value={selectedDifficultyFilter}
            onChange={(e) => setSelectedDifficultyFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          >
            <option value="All">All Difficulty Levels</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>

        {/* Category Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {['All', ...categories].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Workouts & Exercises Cards List */}
      {filteredWorkouts.length === 0 ? (
        <div className="vision-surface rounded-3xl p-10 text-center border border-white/90 space-y-3">
          <Dumbbell className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-sm font-black text-slate-800">No Workout Routines or Exercises Match Your Filter</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Create a new workout routine, add an exercise with demonstration photos/videos, or click "Restore Presets" to populate default gym routines.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleOpenCreateWorkout}
              className="px-4 py-2 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-sm"
            >
              + Create Workout Routine
            </button>
            <button
              type="button"
              onClick={handleSeedDefaultWorkouts}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-2xs"
            >
              Restore Default Library
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredWorkouts.map((workout) => {
            const vis = getWorkoutVisibility(workout);
            const coverImg =
              workout.thumbnailUrl ||
              workout.exercises?.find(e => e.imageUrl)?.imageUrl ||
              'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80';
            const displayCat = workout.bodyPart === 'Abs/Core' ? 'Core' : workout.bodyPart;

            return (
              <div
                key={workout.id}
                className={`vision-surface rounded-3xl border overflow-hidden shadow-md transition-all flex flex-col justify-between ${
                  vis === 'hidden'
                    ? 'border-dashed border-slate-300 bg-slate-100/75 opacity-80'
                    : 'border-white/90'
                }`}
              >
                <div>
                  {/* Card Top Cover & Visibility Controls */}
                  <div className="relative h-36 bg-slate-900 overflow-hidden">
                    {workout.videoUrl ? (
                      <video
                        src={workout.videoUrl}
                        className="w-full h-full object-cover opacity-85"
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={coverImg}
                        alt={workout.title}
                        className="w-full h-full object-cover opacity-85"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

                    {/* Top Left Category & Difficulty */}
                    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white shadow-xs">
                        {displayCat}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-white/90 text-slate-900 shadow-xs">
                        {workout.difficulty || 'Intermediate'}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-black/50 text-white backdrop-blur-xs">
                        {workout.goal || workout.category}
                      </span>
                    </div>

                    {/* Top Right Visibility Quick Toggle */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleClientVisible(workout)}
                        title={
                          vis === 'hidden'
                            ? 'Click to make Visible to Clients'
                            : 'Click to Hide from Clients'
                        }
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md transition-all cursor-pointer ${
                          vis === 'visible'
                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            : vis === 'pt_only'
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/40'
                        }`}
                      >
                        {vis === 'visible' ? (
                          <>
                            <Eye className="w-3 h-3" />
                            <span>Visible to Clients</span>
                          </>
                        ) : vis === 'pt_only' ? (
                          <>
                            <UserCheck className="w-3 h-3" />
                            <span>PT Exclusive</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCycleVisibility(workout)}
                        title="Cycle mode: Visible -> Hidden -> PT Exclusive"
                        className="p-1.5 rounded-xl bg-white/90 hover:bg-white text-slate-800 shadow-md text-[10px] font-bold"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Routine Title at Bottom of Cover */}
                    <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between text-white">
                      <div>
                        <h3 className="text-base font-black tracking-tight drop-shadow-sm">
                          {workout.title}
                        </h3>
                        <p className="text-[11px] text-white/80 font-medium">
                          {workout.exercises?.length || 0} Exercises Configured
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Exercises List inside Workout */}
                  <div className="p-4 space-y-2.5">
                    {(workout.exercises || []).map((ex, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white/90 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 hover:border-indigo-300 transition-all shadow-2xs"
                      >
                        <div
                          onClick={() =>
                            setPreviewExercise({ exercise: ex, workoutTitle: workout.title })
                          }
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                        >
                          {/* Exercise Media Thumbnail */}
                          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                            {ex.imageUrl ? (
                              <img
                                src={ex.imageUrl}
                                alt={ex.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Dumbbell className="w-5 h-5 text-slate-400" />
                            )}
                            {ex.videoUrl && (
                              <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
                                <Play className="w-4 h-4 fill-current" />
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-slate-900 truncate">
                                {ex.name}
                              </span>
                              {ex.difficulty && (
                                <span className="text-[10px] font-semibold text-slate-500">
                                  · {ex.difficulty}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-bold text-indigo-600 mt-0.5">
                              {ex.sets} · {ex.reps}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {ex.instructions}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewExercise({ exercise: ex, workoutTitle: workout.title })
                            }
                            title="Preview exercise guide & media"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExerciseFromWorkout(workout, idx)}
                            title="Remove this exercise"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="px-4 py-3 bg-slate-50/90 border-t border-slate-200/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                    <span>Access:</span>
                    <button
                      type="button"
                      onClick={() => handleCycleVisibility(workout)}
                      className="font-bold text-indigo-600 hover:underline"
                    >
                      {vis === 'visible'
                        ? 'Public (All Clients)'
                        : vis === 'pt_only'
                        ? 'PT Clients Only'
                        : 'Hidden / Draft'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditWorkout(workout)}
                      className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200/90 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit / Media</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteWorkout(workout.id)}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE / EDIT FULL WORKOUT ROUTINE & EXERCISES                   */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="vision-surface border border-white/90 rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-slate-800">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                  <Dumbbell className="w-5 h-5 -rotate-45" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">
                    {editingWorkout ? 'Edit Workout & Exercise Media' : 'Create New Workout & Exercises'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Configure muscle category, difficulty, client visibility, and upload exercise demo photos/videos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveWorkout} className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              {/* Top Section: Routine Metadata & Visibility */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-bold mb-1">
                    Workout Routine Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Chest Hypertrophy & Upper Pec Builder"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Muscle Category *
                  </label>
                  <select
                    value={bodyPart}
                    onChange={(e) => setBodyPart(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Difficulty Level</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  >
                    {DIFFICULTY_LEVELS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Fitness Goal</label>
                  <select
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  >
                    {FITNESS_GOALS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Client Visibility Control *
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as WorkoutVisibility)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-indigo-700 font-black focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  >
                    <option value="visible">Visible to All Clients</option>
                    <option value="pt_only">Exclusive to PT Clients</option>
                    <option value="hidden">Hidden / Locked from Clients</option>
                  </select>
                </div>
              </div>

              {visibility === 'pt_only' && clients.length > 0 && (
                <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-2xl">
                  <label className="block text-indigo-900 font-bold mb-1">
                    Optional: Assign to Specific PT Member (Leave blank for all active PT members)
                  </label>
                  <select
                    value={assignedClientId}
                    onChange={(e) => setAssignedClientId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-slate-800 font-bold"
                  >
                    <option value="">All Active Personal Training (PT) Clients</option>
                    {clients.map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.displayName} (@{c.userId})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cover Media Upload */}
              <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2.5">
                <span className="font-bold text-slate-800 block">
                  Routine Cover Image / Video (Optional)
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="Cover photo or GIF URL (https://...)"
                    className="flex-1 px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono"
                  />
                  <label className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold cursor-pointer flex items-center justify-center gap-1.5 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Cover Media</span>
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/webm"
                      onChange={(e) =>
                        handleMediaFileUpload(e, (url, isVid) => {
                          if (isVid) setVideoUrl(url);
                          else setThumbnailUrl(url);
                        })
                      }
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Exercises Builder Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">
                      Exercises & Demonstration Media ({exercises.length})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Add step-by-step instructions, sets/reps, and upload demonstration photos, GIFs, or videos for each exercise
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddExerciseRow}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Exercise</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {exercises.map((ex, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">
                          Exercise #{idx + 1}
                        </span>
                        {exercises.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveExerciseRow(idx)}
                            className="text-rose-600 hover:underline font-bold flex items-center gap-1 text-[11px]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Exercise Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={ex.name}
                            onChange={(e) => handleUpdateExerciseField(idx, 'name', e.target.value)}
                            placeholder="e.g. Incline Dumbbell Press"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Sets *
                          </label>
                          <input
                            type="text"
                            required
                            value={ex.sets}
                            onChange={(e) => handleUpdateExerciseField(idx, 'sets', e.target.value)}
                            placeholder="e.g. 4 Sets"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Reps / Duration *
                          </label>
                          <input
                            type="text"
                            required
                            value={ex.reps}
                            onChange={(e) => handleUpdateExerciseField(idx, 'reps', e.target.value)}
                            placeholder="e.g. 10-12 Reps"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Instructions *
                          </label>
                          <textarea
                            rows={2}
                            required
                            value={ex.instructions}
                            onChange={(e) =>
                              handleUpdateExerciseField(idx, 'instructions', e.target.value)
                            }
                            placeholder="Step-by-step execution guide..."
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Pro Form & Safety Notes
                          </label>
                          <textarea
                            rows={2}
                            value={ex.formNotes || ''}
                            onChange={(e) =>
                              handleUpdateExerciseField(idx, 'formNotes', e.target.value)
                            }
                            placeholder="e.g. Keep scapula retracted; control 2s eccentric..."
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                          />
                        </div>
                      </div>

                      {/* Exercise Media Upload (Photo / GIF / Video) */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Exercise Demonstration Media (Photo, GIF, or Video)</span>
                          </span>

                          {/* Quick preset selector */}
                          <div className="flex flex-wrap gap-1">
                            {DEMO_MEDIA_PRESETS.map((preset, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => {
                                  handleUpdateExerciseField(idx, 'imageUrl', preset.imageUrl);
                                  if (preset.videoUrl) {
                                    handleUpdateExerciseField(idx, 'videoUrl', preset.videoUrl);
                                  }
                                }}
                                className="px-2 py-0.5 bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 rounded-md text-[10px] font-semibold"
                              >
                                {preset.label.split(' ')[0]} Demo
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={ex.imageUrl || ''}
                              onChange={(e) =>
                                handleUpdateExerciseField(idx, 'imageUrl', e.target.value)
                              }
                              placeholder="Demo Photo or GIF URL..."
                              className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 font-mono"
                            />
                            <label className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1 shrink-0">
                              <Upload className="w-3 h-3" />
                              <span>Photo/GIF</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  handleMediaFileUpload(e, (url) =>
                                    handleUpdateExerciseField(idx, 'imageUrl', url)
                                  )
                                }
                                className="hidden"
                              />
                            </label>
                          </div>

                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={ex.videoUrl || ''}
                              onChange={(e) =>
                                handleUpdateExerciseField(idx, 'videoUrl', e.target.value)
                              }
                              placeholder="Instructional Video URL (MP4 / YouTube)..."
                              className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 font-mono"
                            />
                            <label className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1 shrink-0">
                              <Video className="w-3 h-3" />
                              <span>Video</span>
                              <input
                                type="file"
                                accept="video/mp4,video/webm"
                                onChange={(e) =>
                                  handleMediaFileUpload(e, (url) =>
                                    handleUpdateExerciseField(idx, 'videoUrl', url)
                                  )
                                }
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        {(ex.imageUrl || ex.videoUrl) && (
                          <div className="flex items-center gap-3 pt-1">
                            {ex.imageUrl && (
                              <img
                                src={ex.imageUrl}
                                alt="Exercise preview"
                                className="w-16 h-12 rounded-lg object-cover border border-slate-300"
                              />
                            )}
                            {ex.videoUrl && (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Video Attached
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-200/80 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 vision-btn-aurora text-white rounded-xl font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Saving to Library...'
                    : editingWorkout
                    ? 'Save Workout Changes'
                    : 'Publish Workout to Library'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: QUICK ADD SINGLE EXERCISE                                        */}
      {/* ========================================================================= */}
      {isQuickExerciseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="vision-surface border border-white/90 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-slate-800">
            <div className="px-5 py-4 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900">
                  Quick Add Exercise with Media
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickExerciseOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickExercise} className="p-5 overflow-y-auto space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Add To Existing Routine or Create Standalone Card
                </label>
                <select
                  value={targetWorkoutIdForExercise}
                  onChange={(e) => setTargetWorkoutIdForExercise(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold"
                >
                  <option value="new">+ Create as New Standalone Exercise Card</option>
                  {workouts.map((w) => (
                    <option key={w.id} value={w.id}>
                      Add inside: {w.title} ({w.bodyPart})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Exercise Name *</label>
                  <input
                    type="text"
                    required
                    value={quickExName}
                    onChange={(e) => setQuickExName(e.target.value)}
                    placeholder="e.g. Cable Rope Tricep Pushdown"
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Muscle Category *</label>
                  <select
                    value={quickExCategory}
                    onChange={(e) => setQuickExCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Difficulty</label>
                  <select
                    value={quickExDifficulty}
                    onChange={(e) => setQuickExDifficulty(e.target.value as DifficultyLevel)}
                    className="w-full px-2.5 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-bold"
                  >
                    {DIFFICULTY_LEVELS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Sets</label>
                  <input
                    type="text"
                    value={quickExSets}
                    onChange={(e) => setQuickExSets(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Reps</label>
                  <input
                    type="text"
                    value={quickExReps}
                    onChange={(e) => setQuickExReps(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold"
                  />
                </div>
              </div>

              {targetWorkoutIdForExercise === 'new' && (
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Client Visibility</label>
                  <select
                    value={quickExVisibility}
                    onChange={(e) => setQuickExVisibility(e.target.value as WorkoutVisibility)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-indigo-700 font-bold"
                  >
                    <option value="visible">Visible to All Clients</option>
                    <option value="pt_only">Exclusive to PT Clients</option>
                    <option value="hidden">Hidden / Locked</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">Instructions *</label>
                <textarea
                  rows={2}
                  required
                  value={quickExInstructions}
                  onChange={(e) => setQuickExInstructions(e.target.value)}
                  placeholder="Step-by-step execution..."
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Form & Safety Tip</label>
                <input
                  type="text"
                  value={quickExFormNotes}
                  onChange={(e) => setQuickExFormNotes(e.target.value)}
                  placeholder="e.g. Lock elbows at your sides throughout the movement."
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <label className="block text-slate-700 font-bold">
                  Demonstration Photo / GIF / Video Upload
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={quickExImageUrl}
                    onChange={(e) => setQuickExImageUrl(e.target.value)}
                    placeholder="Paste Photo/GIF URL or click Upload ->"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-800 font-mono"
                  />
                  <label className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold cursor-pointer flex items-center gap-1 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/webm"
                      onChange={(e) =>
                        handleMediaFileUpload(e, (url, isVid) => {
                          if (isVid) setQuickExVideoUrl(url);
                          else setQuickExImageUrl(url);
                        })
                      }
                      className="hidden"
                    />
                  </label>
                </div>

                <input
                  type="text"
                  value={quickExVideoUrl}
                  onChange={(e) => setQuickExVideoUrl(e.target.value)}
                  placeholder="Optional Instructional Video URL (MP4 / WebM)..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-800 font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickExerciseOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm"
                >
                  {isSubmitting ? 'Saving...' : 'Save Exercise'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EXERCISE MEDIA & FORM GUIDE PREVIEW                              */}
      {/* ========================================================================= */}
      {previewExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="vision-surface border border-white/90 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl text-slate-800">
            {previewExercise.exercise.videoUrl ? (
              <div className="relative h-52 bg-slate-900">
                <video
                  src={previewExercise.exercise.videoUrl}
                  controls
                  autoPlay
                  loop
                  className="w-full h-full object-cover"
                />
              </div>
            ) : previewExercise.exercise.imageUrl ? (
              <div className="relative h-48 bg-slate-900">
                <img
                  src={previewExercise.exercise.imageUrl}
                  alt={previewExercise.exercise.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}

            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                    {previewExercise.workoutTitle} · {previewExercise.exercise.difficulty || 'Intermediate'}
                  </span>
                  <h3 className="text-base font-black text-slate-900 mt-0.5">
                    {previewExercise.exercise.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewExercise(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Sets</span>
                  <span className="text-sm font-black text-indigo-600">
                    {previewExercise.exercise.sets}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Reps</span>
                  <span className="text-sm font-black text-indigo-600">
                    {previewExercise.exercise.reps}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase text-slate-500 block">
                  Execution Instructions
                </span>
                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/80 leading-relaxed">
                  {previewExercise.exercise.instructions}
                </p>
              </div>

              {previewExercise.exercise.formNotes && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Form & Biomechanics Note</span>
                  </span>
                  <p className="text-xs text-emerald-900 bg-emerald-50/90 p-3 rounded-xl border border-emerald-200 leading-relaxed font-medium">
                    {previewExercise.exercise.formNotes}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setPreviewExercise(null)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteConfirmModal
        isOpen={!!pendingDeleteAction}
        title={pendingDeleteAction?.title || 'Confirm Permanent Deletion'}
        itemName={pendingDeleteAction?.itemName || ''}
        itemType={pendingDeleteAction?.itemType}
        description={pendingDeleteAction?.description || ''}
        warningNote={pendingDeleteAction?.warningNote}
        confirmLabel={pendingDeleteAction?.confirmLabel}
        onClose={() => setPendingDeleteAction(null)}
        onConfirm={async () => {
          if (pendingDeleteAction) {
            await pendingDeleteAction.onConfirm();
            setPendingDeleteAction(null);
          }
        }}
      />

      {/* Interactive Media Upload & Adjuster Modal */}
      {mediaModalState && (
        <MediaUploadAdjustModal
          file={mediaModalState.file}
          defaultAspect="16:9"
          title="Adjust Workout Media (Image Crop or Video Seeker)"
          onComplete={(res) => {
            mediaModalState.onDone(res);
            setMediaModalState(null);
          }}
          onCancel={() => setMediaModalState(null)}
        />
      )}
    </div>
  );
};
