import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserAccount,
  ClientProfile,
  TrainerProfile,
  UserRole
} from '../types';
import { db, auth, testFirestoreConnection } from '../firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { LogoutConfirmationModal } from '../components/common/LogoutConfirmationModal';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  collection,
  getDocs,
  query,
  limit
} from 'firebase/firestore';
import { initializeDatabaseSeed } from '../services/db';
import { getCachedData, setCachedData, withTimeout } from '../services/cacheService';

export interface SignupClientParams {
  username: string;
  password: string;
  displayName: string;
  email: string;
  phone: string;
  photoUrl: string;
  fitnessGoal: string;
  dob: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
}

export interface SignupTrainerParams {
  username: string;
  password: string;
  displayName: string;
  email: string;
  phone: string;
  photoUrl: string;
  bio: string;
  specializations: string;
  dob: string;
  gender: string;
}

interface AuthContextType {
  currentUser: UserAccount | null;
  clientProfile: ClientProfile | null;
  trainerProfile: TrainerProfile | null;
  isLoading: boolean;
  isBooting: boolean;
  isLogoutConfirmOpen: boolean;
  requestLogout: () => void;
  cancelLogout: () => void;
  confirmLogout: () => Promise<void>;
  loginClientOrTrainer: (username: string, password: string, role: 'client' | 'trainer') => Promise<void>;
  signupClient: (params: SignupClientParams) => Promise<void>;
  signupTrainer: (params: SignupTrainerParams) => Promise<void>;
  loginAdmin: (adminId: string, password: string) => Promise<void>;
  updateAdminPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  verifyAdminPassword: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateClientProfile: (updates: Partial<ClientProfile>) => Promise<void>;
  updateTrainerProfile: (updates: Partial<TrainerProfile & { password?: string; username?: string; dob?: string }>) => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_SESSION_KEY = 'torrent_fitness_user_session';
export const AUTH_TOKEN_KEY = 'torrent_fitness_auth_token';
const BOOT_TIMEOUT_MS = 2500;

export function getAuthToken(): string {
  try {
    return (
      (typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null) ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(AUTH_TOKEN_KEY) : null) ||
      ''
    );
  } catch {
    return '';
  }
}

function getInitialSavedSession(): UserAccount | null {
  try {
    const raw =
      (typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_SESSION_KEY) : null) ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(LOCAL_STORAGE_SESSION_KEY) : null);
    if (!raw) return null;
    const user = JSON.parse(raw) as UserAccount;
    // Re-synchronize both storages for durability across refresh
    try {
      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, raw);
      sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, raw);
    } catch {}
    return user;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialUser = getInitialSavedSession();

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(initialUser);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(() => {
    if (initialUser?.role === 'client') {
      return getCachedData<ClientProfile | null>(`client_profile_${initialUser.uid}`, {
        userId: initialUser.uid,
        displayName: initialUser.displayName,
        photoUrl: initialUser.photoUrl,
        gender: initialUser.gender || 'Male',
        membershipStatus:
          String(initialUser.membershipStatus || '').toLowerCase() === 'active'
            ? 'active'
            : 'inactive',
        membershipPlanName: initialUser.membershipPlan,
        membershipEndDate: initialUser.membershipExpiryDate,
        ptStatus: 'none',
        createdAt: initialUser.createdAt || new Date().toISOString()
      });
    }
    return null;
  });
  const [trainerProfile, setTrainerProfile] = useState<TrainerProfile | null>(() => {
    if (initialUser?.role === 'trainer') {
      return getCachedData<TrainerProfile | null>(`trainer_profile_${initialUser.uid}`, null);
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isBooting, setIsBooting] = useState<boolean>(true);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  // Synchronize Firebase Auth State across page reloads
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const saved = getInitialSavedSession();
        if (!saved && fbUser.uid) {
          try {
            const uSnap = await getDoc(doc(db, 'users', fbUser.uid));
            if (uSnap.exists()) {
              const uData = uSnap.data() as UserAccount;
              localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(uData));
              sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(uData));
              setCurrentUser(uData);
              loadUserProfile(uData).catch(() => {});
            }
          } catch (e) {
            console.warn('Firebase onAuthStateChanged sync notice:', e);
          }
        }
      }
    });

    return () => unsub();
  }, []);

  // Non-blocking boot pipeline with strict 2.5s timeout
  useEffect(() => {
    let isMounted = true;
    const hardTimeoutId = setTimeout(() => {
      if (isMounted) {
        setIsBooting(false);
      }
    }, BOOT_TIMEOUT_MS);

    async function boot() {
      try {
        const savedUser = getInitialSavedSession();
        if (savedUser) {
          // If we already have a cached profile, unlock UI immediately and sync in background
          const hasCachedClient =
            savedUser.role === 'client' &&
            Boolean(getCachedData<ClientProfile | null>(`client_profile_${savedUser.uid}`, null));
          const hasCachedTrainer =
            savedUser.role === 'trainer' &&
            Boolean(getCachedData<TrainerProfile | null>(`trainer_profile_${savedUser.uid}`, null));

          if (savedUser.role === 'admin' || hasCachedClient || hasCachedTrainer) {
            if (isMounted) setIsBooting(false);
            // Non-blocking background refresh of the user's immediate profile document
            loadUserProfile(savedUser).catch(() => {});
          } else {
            // Race immediate profile doc fetch against strict 2-second timeout
            await withTimeout(loadUserProfile(savedUser), BOOT_TIMEOUT_MS);
          }
        }
      } catch (err) {
        console.warn('Boot profile sync timed out or offline, rendering cached/default state:', err);
      } finally {
        clearTimeout(hardTimeoutId);
        if (isMounted) {
          setIsBooting(false);
        }
      }

      // Run Firestore connection test & seed completely non-blocking in the background
      setTimeout(() => {
        testFirestoreConnection().catch(() => {});
        initializeDatabaseSeed().catch(() => {});
      }, 200);
    }

    boot();

    return () => {
      isMounted = false;
      clearTimeout(hardTimeoutId);
    };
  }, []);

  // Keep clientProfile in real-time sync with Firestore whenever a client is logged in
  useEffect(() => {
    if (!currentUser?.uid || currentUser.role !== 'client') return;

    const clientRef = doc(db, 'clientProfiles', currentUser.uid);
    const unsubClient = onSnapshot(
      clientRef,
      (snap) => {
        if (snap.exists()) {
          const cData = snap.data() as ClientProfile;
          const normalizedStatus =
            String(cData.membershipStatus || '').toLowerCase() === 'active'
              ? 'active'
              : 'inactive';
          const normalizedProfile: ClientProfile = {
            ...cData,
            membershipStatus: normalizedStatus,
            membershipPlanName: cData.membershipPlanName || cData.membershipPlan,
            membershipEndDate: cData.membershipEndDate || cData.membershipExpiryDate,
            gender: cData.gender || currentUser.gender
          };
          setClientProfile(normalizedProfile);
          setCachedData(`client_profile_${currentUser.uid}`, normalizedProfile);
        }
      },
      (err) => {
        console.warn('ClientProfile realtime listener warning:', err);
      }
    );

    return () => unsubClient();
  }, [currentUser?.uid, currentUser?.role]);

  // Sync only the authenticated user's immediate profile document
  async function loadUserProfile(user: UserAccount) {
    setCurrentUser(user);
    try {
      if (user.role === 'client') {
        const clientRef = doc(db, 'clientProfiles', user.uid);
        const snap = await withTimeout(getDoc(clientRef), 2200);
        if (snap.exists()) {
          const cData = snap.data() as ClientProfile;
          if (!cData.gender && user.gender) {
            cData.gender = user.gender;
          }
          const normalizedStatus =
            String(cData.membershipStatus || '').toLowerCase() === 'active'
              ? 'active'
              : 'inactive';
          const normalizedProfile: ClientProfile = {
            ...cData,
            membershipStatus: normalizedStatus,
            membershipPlanName: cData.membershipPlanName || cData.membershipPlan,
            membershipEndDate: cData.membershipEndDate || cData.membershipExpiryDate
          };
          setClientProfile(normalizedProfile);
          setCachedData(`client_profile_${user.uid}`, normalizedProfile);
        } else {
          const defaultClient: ClientProfile = {
            userId: user.uid,
            displayName: user.displayName,
            photoUrl: user.photoUrl,
            gender: user.gender || 'Male',
            membershipStatus: 'inactive',
            ptStatus: 'none',
            createdAt: new Date().toISOString()
          };
          setClientProfile(defaultClient);
          setCachedData(`client_profile_${user.uid}`, defaultClient);
          setDoc(clientRef, defaultClient).catch(() => {});
        }
        setTrainerProfile(null);
      } else if (user.role === 'trainer') {
        const trainerRef = doc(db, 'trainerProfiles', user.uid);
        const isHitesh = user.uid.includes('hitesh') || (user.displayName || '').toLowerCase().includes('hitesh');
        const isBhavesh = user.uid.includes('bhavesh') || (user.displayName || '').toLowerCase().includes('bhavesh');
        const defaultPhone = isHitesh
          ? '8208002585'
          : isBhavesh
          ? '9607292842'
          : '8208002585';

        const snap = await withTimeout(getDoc(trainerRef), 2200);
        if (snap.exists()) {
          const raw = snap.data() as any;
          const resolvedName = raw.displayName || raw.fullName || user.displayName || user.uid;
          const resolvedStatus =
            raw.status === 'pending' ||
            raw.status === 'pending_verification' ||
            raw.isVerified === false ||
            user.status === 'pending' ||
            user.status === 'pending_verification'
              ? 'pending'
              : raw.status || user.status || 'active';

          const resolvedTrainerPhone =
            isHitesh || resolvedName.toLowerCase().includes('hitesh')
              ? '8208002585'
              : isBhavesh || resolvedName.toLowerCase().includes('bhavesh')
              ? '9607292842'
              : raw.phone || raw.mobileNumber || user.phone || defaultPhone;

          const tData: TrainerProfile = {
            ...raw,
            trainerId: raw.trainerId || user.uid,
            displayName: resolvedName,
            fullName: resolvedName,
            photoUrl:
              raw.photoUrl ||
              user.photoUrl ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
            phone: resolvedTrainerPhone,
            mobileNumber: resolvedTrainerPhone,
            gender: raw.gender || user.gender || (user.uid.includes('pooja') ? 'Female' : 'Male'),
            badge:
              raw.badge ||
              (isHitesh
                ? 'crown'
                : isBhavesh
                ? 'shield'
                : 'none'),
            specializations: raw.specializations || 'Strength & Conditioning',
            bio: raw.bio || 'Certified Trainer at Torrent Fitness',
            ptAvailable: typeof raw.ptAvailable === 'boolean' ? raw.ptAvailable : true,
            status: resolvedStatus,
            isVerified: resolvedStatus === 'active',
            rating: typeof raw.rating === 'number' ? raw.rating : 5.0,
            createdAt: raw.createdAt || new Date().toISOString()
          };

          if (!raw.displayName || !raw.phone || !raw.gender || !raw.status || raw.phone !== resolvedTrainerPhone) {
            setDoc(trainerRef, tData, { merge: true }).catch(() => {});
          }
          setTrainerProfile(tData);
          setCachedData(`trainer_profile_${user.uid}`, tData);
        } else {
          const defaultGender = user.gender || (user.uid.includes('pooja') ? 'Female' : 'Male');
          const resolvedStatus =
            user.status === 'pending' || user.status === 'pending_verification'
              ? 'pending'
              : (user.status as any) || 'active';
          const defaultTrainer: TrainerProfile = {
            trainerId: user.uid,
            displayName: user.displayName || user.fullName || user.uid,
            fullName: user.displayName || user.fullName || user.uid,
            photoUrl:
              user.photoUrl ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
            phone: defaultPhone,
            mobileNumber: defaultPhone,
            gender: defaultGender,
            badge: isHitesh ? 'crown' : isBhavesh ? 'shield' : 'none',
            isOwner: isHitesh,
            isCoManager: isBhavesh,
            bio: user.uid.includes('pooja')
              ? 'Head Women’s Aerobics & Dance Fitness Instructor'
              : 'Certified Trainer at Torrent Fitness',
            specializations: user.uid.includes('pooja')
              ? 'Aerobics & Dance Fitness, Zumba, Step Aerobics'
              : 'Strength & Conditioning',
            ptAvailable: true,
            status: resolvedStatus,
            isVerified: resolvedStatus === 'active',
            rating: 5.0,
            createdAt: new Date().toISOString()
          };
          setTrainerProfile(defaultTrainer);
          setCachedData(`trainer_profile_${user.uid}`, defaultTrainer);
          setDoc(trainerRef, defaultTrainer, { merge: true }).catch(() => {});
        }
        setClientProfile(null);
      } else {
        // Admin
        setClientProfile(null);
        setTrainerProfile(null);
      }
    } catch (e) {
      console.warn('Profile load timed out or offline, using cached/fallback profile:', e);
    }
  }

  // Client / Trainer Multi-Identifier Login (Mobile Number, Email, or Client ID / Username)
  const loginClientOrTrainer = async (
    identifier: string,
    password: string,
    role: 'client' | 'trainer'
  ) => {
    setIsLoading(true);
    try {
      const rawIdentifier = identifier.trim();
      const cleanIdNoSpaces = rawIdentifier.toLowerCase().replace(/\s+/g, '');

      if (!rawIdentifier || !password || !password.trim()) {
        throw new Error('Invalid mobile/email/ID or password');
      }

      // 1. Primary Secure Path: Server-Authoritative Authentication
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: rawIdentifier, password, role })
        });

        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.success && data?.user) {
          if (data.token) {
            try {
              localStorage.setItem(AUTH_TOKEN_KEY, data.token);
              sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
            } catch {}
          }
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(data.user));
          sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(data.user));
          await loadUserProfile(data.user);
          return;
        }

        if (data?.error) {
          throw new Error(data.error);
        }
      } catch (apiErr: any) {
        // If it's an explicit authentication rejection, rethrow immediately
        if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('Failed to fetch')) {
          throw apiErr;
        }
        console.warn('Server auth endpoint notice, checking direct document:', apiErr);
      }

      // 2. Direct Single-Document Fallback (if server API is temporarily unreachable)
      let userData: UserAccount | null = null;
      if (cleanIdNoSpaces && !cleanIdNoSpaces.includes('/')) {
        const directSnap = await withTimeout(getDoc(doc(db, 'users', cleanIdNoSpaces)), 2500).catch(() => null);
        if (directSnap?.exists()) {
          const d = directSnap.data() as UserAccount;
          const uRole = String(d.role || '');
          const isClientMatch = role === 'client' && (uRole === 'client' || uRole === 'member');
          const isTrainerMatch = role === 'trainer' && (uRole === 'trainer' || uRole === 'coach' || uRole === 'staff');
          if (isClientMatch || isTrainerMatch) {
            const expectedPw = d.password || 'password123';
            if (expectedPw === password) {
              userData = { ...d, uid: d.uid || directSnap.id };
            }
          }
        }
      }

      if (!userData) {
        throw new Error('Invalid mobile/email/ID or password');
      }

      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userData));
      sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userData));
      await loadUserProfile(userData);
    } finally {
      setIsLoading(false);
    }
  };

  // Client Signup
  const signupClient = async (params: SignupClientParams) => {
    setIsLoading(true);
    try {
      const {
        username,
        password,
        displayName,
        email,
        phone,
        photoUrl,
        fitnessGoal,
        dob,
        age,
        gender,
        height,
        weight
      } = params;

      const cleanUser = username.trim().toLowerCase().replace(/\s+/g, '');
      if (!cleanUser) throw new Error('Client ID / Username cannot be empty.');
      if (!displayName || !displayName.trim()) throw new Error('Full Name is mandatory.');
      if (!email || !email.trim() || !email.includes('@')) throw new Error('A valid Email Address is mandatory.');
      const cleanPhone = phone.replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 10) throw new Error('A valid 10-digit Mobile Number is mandatory.');
      if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
      if (!dob || !dob.trim()) throw new Error('Date of birth is mandatory.');
      if (!photoUrl) throw new Error('A mandatory profile photo is required to register.');
      if (!age || age < 12) throw new Error('Please enter a valid age (12+).');
      if (!gender || !gender.trim()) throw new Error('Gender selection (Female, Male, or Other) is mandatory.');
      const numHeight = Number(height);
      if (!numHeight || numHeight < 3.5 || (numHeight > 8.0 && numHeight < 30) || numHeight > 250) {
        throw new Error('Please enter a valid height in feet and inches (e.g., 5.4 to 6.8).');
      }
      if (!weight || weight < 20 || weight > 300) throw new Error('Please enter a valid weight in kg (20-300 kg).');

      // 1. Try Server Endpoint First
      try {
        const resp = await fetch('/api/auth/signup-client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.success && data?.user) {
          if (data.token) {
            try {
              localStorage.setItem(AUTH_TOKEN_KEY, data.token);
              sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
            } catch {}
          }
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(data.user));
          sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(data.user));
          setCurrentUser(data.user);
          setClientProfile(data.profile);
          return;
        }
        if (data?.error) {
          throw new Error(data.error);
        }
      } catch (apiErr: any) {
        if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('Failed to fetch')) {
          throw apiErr;
        }
        console.warn('Server signup API notice, using direct persistence fallback:', apiErr);
      }

      // 2. Direct Firestore fallback
      const userRef = doc(db, 'users', cleanUser);
      const exists = await getDoc(userRef);
      if (exists.exists()) {
        throw new Error(`Username "${username}" is already taken. Please choose another.`);
      }

      const formattedPhone = `+91 ${cleanPhone.slice(-10)}`;
      const newUser: UserAccount = {
        uid: cleanUser,
        username: cleanUser,
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        phone: formattedPhone,
        mobileNumber: formattedPhone,
        photoUrl,
        role: 'client',
        status: 'active',
        dob,
        gender: gender.trim(),
        createdAt: new Date().toISOString()
      };

      const newClientProfile: ClientProfile = {
        userId: cleanUser,
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        phone: formattedPhone,
        photoUrl,
        dob,
        age,
        gender: gender.trim(),
        height,
        weight,
        fitnessGoal: fitnessGoal || 'General Fitness',
        membershipStatus: 'inactive',
        ptStatus: 'none',
        createdAt: new Date().toISOString()
      };

      await setDoc(userRef, newUser);
      await setDoc(doc(db, 'clientProfiles', cleanUser), newClientProfile);

      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(newUser));
      sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(newUser));
      setCurrentUser(newUser);
      setClientProfile(newClientProfile);
    } finally {
      setIsLoading(false);
    }
  };

  // Trainer Signup (Starts as Pending Admin Approval / pending_verification)
  const signupTrainer = async (params: SignupTrainerParams) => {
    setIsLoading(true);
    try {
      const {
        username,
        password,
        displayName,
        email,
        phone,
        photoUrl,
        bio,
        specializations,
        dob,
        gender
      } = params;

      const cleanUser = (username || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_.-]/g, '_');

      if (!cleanUser) throw new Error('Trainer Username / ID cannot be empty.');
      if (!displayName || !displayName.trim()) throw new Error('Full Name is mandatory.');
      if (!email || !email.trim() || !email.includes('@')) throw new Error('A valid Email Address is mandatory.');
      const cleanPhone = (phone || '').replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 10) {
        throw new Error('A valid 10-digit Mobile Number is mandatory.');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }
      if (!gender || !gender.trim()) {
        throw new Error('Gender selection (Male, Female, or Other) is mandatory.');
      }

      // 1. Try Server Endpoint First
      try {
        const resp = await fetch('/api/auth/signup-trainer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.success && data?.user) {
          if (data.token) {
            try {
              localStorage.setItem(AUTH_TOKEN_KEY, data.token);
              sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
            } catch {}
          }
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(data.user));
          sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(data.user));
          setClientProfile(null);
          setTrainerProfile(data.profile);
          setCurrentUser(data.user);
          return;
        }
        if (data?.error) {
          throw new Error(data.error);
        }
      } catch (apiErr: any) {
        if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('Failed to fetch')) {
          throw apiErr;
        }
        console.warn('Server trainer signup API notice, using direct persistence fallback:', apiErr);
      }

      // 2. Direct Firestore Fallback
      const userRef = doc(db, 'users', cleanUser);
      const exists = await getDoc(userRef);
      if (exists.exists() && exists.data()?.status === 'active') {
        throw new Error(`Trainer Username "${cleanUser}" is already registered. Please choose another ID or switch to Log In.`);
      }

      const formattedPhone = `+91 ${cleanPhone.slice(-10)}`;
      const cleanGender = gender.trim();
      const safeDob = dob && dob.trim() ? dob.trim() : '1995-01-01';
      const defaultTrainerAvatar =
        cleanGender.toLowerCase() === 'female'
          ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80'
          : 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80';
      const safePhotoUrl = photoUrl && photoUrl.trim() ? photoUrl.trim() : defaultTrainerAvatar;
      const safeSpec =
        specializations && specializations.trim()
          ? specializations.trim()
          : cleanGender.toLowerCase() === 'female'
          ? 'Aerobics & Dance Fitness, Strength & Conditioning'
          : 'Strength & Conditioning';
      const safeBio =
        bio && bio.trim()
          ? bio.trim()
          : 'Certified Trainer at Torrent Fitness';
      const timestamp = new Date().toISOString();

      const newUser: UserAccount = {
        uid: cleanUser,
        username: cleanUser,
        displayName: displayName.trim(),
        fullName: displayName.trim(),
        email: email.trim(),
        phone: formattedPhone,
        mobileNumber: formattedPhone,
        photoUrl: safePhotoUrl,
        role: 'trainer',
        status: 'pending',
        verificationStatus: 'pending_verification',
        isVerified: false,
        dob: safeDob,
        gender: cleanGender,
        createdAt: timestamp
      };

      const newTrainerProfile: TrainerProfile = {
        trainerId: cleanUser,
        username: cleanUser,
        displayName: displayName.trim(),
        fullName: displayName.trim(),
        email: email.trim(),
        phone: formattedPhone,
        mobileNumber: formattedPhone,
        photoUrl: safePhotoUrl,
        role: 'trainer',
        badge: 'none',
        isOwner: false,
        isCoManager: false,
        dob: safeDob,
        gender: cleanGender,
        bio: safeBio,
        specializations: safeSpec,
        ptAvailable: true,
        status: 'pending',
        verificationStatus: 'pending_verification',
        isVerified: false,
        rating: 5.0,
        createdAt: timestamp
      };

      await setDoc(userRef, newUser);
      await setDoc(doc(db, 'trainerProfiles', cleanUser), newTrainerProfile);

      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(newUser));
      sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(newUser));
      setClientProfile(null);
      setTrainerProfile(newTrainerProfile);
      setCurrentUser(newUser);
    } catch (err: any) {
      console.warn('Trainer Sign-Up validation/error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Secure Master Admin Login via Server Authentication
  const loginAdmin = async (adminId: string, password: string) => {
    setIsLoading(true);
    try {
      const cleanAdminId = adminId.trim().toLowerCase().replace(/\s+/g, '');

      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanAdminId, password, role: 'admin' })
      });

      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success && data?.user) {
        if (data.token) {
          try {
            localStorage.setItem(AUTH_TOKEN_KEY, data.token);
            sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
          } catch {}
        }
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(data.user));
        sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(data.user));
        setCurrentUser(data.user);
        setClientProfile(null);
        setTrainerProfile(null);
        return;
      }

      throw new Error(data?.error || 'Invalid Admin credentials. Access denied.');
    } finally {
      setIsLoading(false);
    }
  };

  // Dedicated Admin Password Management (Protected by Server Token)
  const updateAdminPassword = async (currentPassword: string, newPassword: string) => {
    setIsLoading(true);
    try {
      if (!currentUser || currentUser.role !== 'admin') {
        throw new Error('Unauthorized. Only Master Admin can change this password.');
      }

      const token = getAuthToken();
      const resp = await fetch('/api/auth/update-admin-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update admin password.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Verify Master Admin Password for sensitive security gates (e.g. Payment Gateway credentials)
  const verifyAdminPassword = async (inputPassword: string): Promise<boolean> => {
    const cleanInput = (inputPassword || '').trim();
    if (!cleanInput) return false;
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admintorrentfitness1', password: cleanInput, role: 'admin' })
      });
      const data = await resp.json().catch(() => null);
      return Boolean(resp.ok && data?.success);
    } catch {
      return false;
    }
  };

  // Open 2-step logout confirmation dialog
  const requestLogout = () => {
    setIsLogoutConfirmOpen(true);
  };

  const cancelLogout = () => {
    setIsLogoutConfirmOpen(false);
  };

  // Explicitly clears the local session, signs out from auth, and smoothly redirects to login screen
  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut(auth).catch(() => {});
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
      sessionStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      setCurrentUser(null);
      setClientProfile(null);
      setTrainerProfile(null);
    } finally {
      setIsLoggingOut(false);
      setIsLogoutConfirmOpen(false);
    }
  };

  // Calling logout triggers the 2-step confirmation dialog
  const logout = async () => {
    requestLogout();
  };

  // Update Client Profile
  const updateClientProfile = async (updates: Partial<ClientProfile>) => {
    if (!currentUser || currentUser.role !== 'client') return;
    const cleanUpdates: Record<string, any> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) {
        cleanUpdates[k] = v;
      }
    }
    const clientRef = doc(db, 'clientProfiles', currentUser.uid);
    await setDoc(clientRef, cleanUpdates, { merge: true });
    setClientProfile(prev => (prev ? { ...prev, ...cleanUpdates } : null));

    // Also update displayName / photoUrl / membership fields in users collection if changed
    const userUpdates: Partial<UserAccount> = {};
    if (cleanUpdates.displayName) userUpdates.displayName = cleanUpdates.displayName;
    if (cleanUpdates.photoUrl) userUpdates.photoUrl = cleanUpdates.photoUrl;
    if (cleanUpdates.membershipStatus) {
      userUpdates.membershipStatus =
        String(cleanUpdates.membershipStatus).toLowerCase() === 'active'
          ? 'ACTIVE'
          : 'inactive';
    }
    if (cleanUpdates.membershipPlanName || cleanUpdates.membershipPlan) {
      userUpdates.membershipPlan =
        cleanUpdates.membershipPlanName || cleanUpdates.membershipPlan;
    }
    if (cleanUpdates.membershipStartDate) {
      userUpdates.membershipStartDate = cleanUpdates.membershipStartDate;
    }
    if (cleanUpdates.membershipEndDate || cleanUpdates.membershipExpiryDate) {
      userUpdates.membershipExpiryDate =
        cleanUpdates.membershipEndDate || cleanUpdates.membershipExpiryDate;
    }

    if (Object.keys(userUpdates).length > 0) {
      await setDoc(doc(db, 'users', currentUser.uid), userUpdates, { merge: true });
      setCurrentUser(prev => {
        if (!prev) return null;
        const updated = { ...prev, ...userUpdates };
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(updated));
        sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Update Trainer Profile & ID
  const updateTrainerProfile = async (updates: Partial<TrainerProfile & { password?: string; username?: string; dob?: string }>) => {
    if (!currentUser || currentUser.role !== 'trainer') return;
    const trainerRef = doc(db, 'trainerProfiles', currentUser.uid);
    await setDoc(trainerRef, updates, { merge: true });
    setTrainerProfile(prev => (prev ? { ...prev, ...updates } : null));

    // Also update users collection if displayName, photoUrl, dob, gender, phone, password or username changed
    const userUpdates: Partial<UserAccount> = {};
    if (updates.displayName) userUpdates.displayName = updates.displayName;
    if (updates.photoUrl) userUpdates.photoUrl = updates.photoUrl;
    if (updates.dob) userUpdates.dob = updates.dob;
    if (updates.gender) userUpdates.gender = updates.gender;
    if (updates.password) userUpdates.password = updates.password;
    if (updates.username) userUpdates.username = updates.username;

    if (Object.keys(userUpdates).length > 0) {
      await setDoc(doc(db, 'users', currentUser.uid), userUpdates, { merge: true });
      setCurrentUser(prev => {
        if (!prev) return null;
        const updated = { ...prev, ...userUpdates };
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(updated));
        sessionStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Account deletion - soft delete for clients, preserving data in database
  const deleteAccount = async () => {
    if (!currentUser) return;
    if (currentUser.role === 'admin' || currentUser.uid === 'admintorrentfitness1' || currentUser.uid === 'admin') {
      throw new Error('Admin account cannot be deleted.');
    }

    const token = getAuthToken();
    try {
      await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (e) {
      console.warn('Server delete endpoint note, performing client cleanup:', e);
    }

    const uid = currentUser.uid;
    if (currentUser.role === 'client') {
      try {
        await setDoc(doc(db, 'clientProfiles', uid), { isSelfDeleted: true, membershipStatus: 'inactive' }, { merge: true });
        await setDoc(doc(db, 'users', uid), { isSelfDeleted: true }, { merge: true });
      } catch (e) {
        console.warn('Soft delete error:', e);
      }
    } else {
      await deleteDoc(doc(db, 'users', uid)).catch(() => {});
      if (currentUser.role === 'trainer') {
        await deleteDoc(doc(db, 'trainerProfiles', uid)).catch(() => {});
      }
    }

    await signOut(auth).catch(() => {});
    localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    sessionStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    setCurrentUser(null);
    setClientProfile(null);
    setTrainerProfile(null);
  };

  const refreshUserData = async () => {
    if (currentUser) {
      await loadUserProfile(currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        clientProfile,
        trainerProfile,
        isLoading,
        isBooting,
        isLogoutConfirmOpen,
        requestLogout,
        cancelLogout,
        confirmLogout,
        loginClientOrTrainer,
        signupClient,
        signupTrainer,
        loginAdmin,
        updateAdminPassword,
        verifyAdminPassword,
        logout,
        updateClientProfile,
        updateTrainerProfile,
        deleteAccount,
        refreshUserData
      }}
    >
      {children}
      <LogoutConfirmationModal
        isOpen={isLogoutConfirmOpen}
        onClose={cancelLogout}
        onConfirm={confirmLogout}
        isLoading={isLoggingOut}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
