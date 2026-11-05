import React, { useState, useTransition } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PhotoUploader } from '../common/PhotoUploader';
import { GymLogo } from '../common/GymLogo';
import {
  ArrowRight,
  ArrowLeft,
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldAlert,
  Calendar,
  Activity,
  Ruler,
  Scale,
  AlertCircle,
  Mail,
  Phone,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { parseHeight, formatHeight } from '../../utils/heightUtils';

const PRESET_AVATARS = [
  { id: 'av-m1', label: 'Male Athlete', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80' },
  { id: 'av-f1', label: 'Female Athlete', url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80' },
  { id: 'av-m2', label: 'Power Athlete', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80' },
  { id: 'av-f2', label: 'Aerobics Pro', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80' },
  { id: 'av-m3', label: 'Calisthenics', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80' }
];

interface AuthScreenProps {}

export const AuthScreen: React.FC<AuthScreenProps> = () => {
  const {
    loginClientOrTrainer,
    signupClient,
    signupTrainer,
    isLoading
  } = useAuth();

  const [isPending, startTransition] = useTransition();

  // Active role view: 'client' or 'trainer' (default is 'client' per specs)
  const [roleMode, setRoleMode] = useState<'client' | 'trainer'>('client');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // Multi-part registration wizard step: 1 = Basic Account Info, 2 = Media & Fitness Onboarding
  const [signupStep, setSignupStep] = useState<1 | 2>(1);

  // Login form state (isolated for zero lag)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Step 1: Core Account Details
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dob, setDob] = useState('');

  // Step 2: Media & Fitness Onboarding Profile
  const [photoUrl, setPhotoUrl] = useState('');
  const [age, setAge] = useState<number | ''>(26);
  const [gender, setGender] = useState<'Female' | 'Male' | 'Other' | ''>('');
  const [heightFeet, setHeightFeet] = useState<number>(5);
  const [heightInches, setHeightInches] = useState<number>(8);
  const [weight, setWeight] = useState<number | ''>(76);
  const [fitnessGoal, setFitnessGoal] = useState('Muscle Gain');

  // Trainer-specific Step 2 fields
  const [specializations, setSpecializations] = useState('Strength & Conditioning');
  const [bio, setBio] = useState('');

  // Field validation error highlight map (e.g. { displayName: true, email: true })
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  // Status and feedback
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const clearFieldError = (fieldName: string) => {
    setFieldErrors((prev) => {
      if (!prev[fieldName]) return prev;
      const updated = { ...prev };
      delete updated[fieldName];
      return updated;
    });
  };

  const handleResetForm = () => {
    setSignupStep(1);
    setLoginIdentifier('');
    setLoginPassword('');
    setUsername('');
    setEmail('');
    setPhone('');
    setPassword('');
    setDisplayName('');
    setDob('');
    setPhotoUrl('');
    setAge(26);
    setGender('');
    setHeightFeet(5);
    setHeightInches(8);
    setWeight(76);
    setBio('');
    setFieldErrors({});
    setErrorMessage('');
    setSuccessNotice('');
  };

  const handleDobChange = (val: string) => {
    setDob(val);
    clearFieldError('dob');
    if (val) {
      const birthYear = new Date(val).getFullYear();
      const currentYear = new Date().getFullYear();
      if (!isNaN(birthYear) && birthYear < currentYear) {
        const calculated = Math.max(12, currentYear - birthYear);
        setAge(calculated);
        clearFieldError('age');
      }
    }
  };

  // -------------------------------------------------------------
  // LOGIN SUBMISSION HANDLER
  // -------------------------------------------------------------
  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');
    const newFieldErrors: Record<string, boolean> = {};

    const cleanUsername = loginIdentifier.trim();
    const cleanPassword = loginPassword;

    if (!cleanUsername) newFieldErrors.username = true;
    if (!cleanPassword.trim()) newFieldErrors.password = true;

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      setErrorMessage('Invalid mobile/email/ID or password');
      return;
    }

    setFieldErrors({});
    try {
      await loginClientOrTrainer(cleanUsername, cleanPassword, roleMode);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication failed. Please check your credentials and try again.');
    }
  };

  // -------------------------------------------------------------
  // STEP 1 VALIDATION & PROCEED TO STEP 2
  // -------------------------------------------------------------
  const handleProceedToStep2 = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');
    const newFieldErrors: Record<string, boolean> = {};

    const cleanDisplayName = displayName.trim();
    const cleanEmail = email.trim();
    const cleanDigits = phone.replace(/\D/g, '');
    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
    const cleanPassword = password.trim();

    if (!cleanDisplayName) {
      newFieldErrors.displayName = true;
    }
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      newFieldErrors.email = true;
    }
    if (!cleanDigits || cleanDigits.length < 10) {
      newFieldErrors.phone = true;
    }
    if (!cleanUsername) {
      newFieldErrors.username = true;
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      newFieldErrors.password = true;
    }
    if (!dob || !dob.trim()) {
      newFieldErrors.dob = true;
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      const missingNames: string[] = [];
      if (newFieldErrors.displayName) missingNames.push('Full Name');
      if (newFieldErrors.email) missingNames.push('Valid Email Address');
      if (newFieldErrors.phone) missingNames.push('10-digit Mobile Number');
      if (newFieldErrors.username) missingNames.push('Unique Username / ID');
      if (newFieldErrors.password) missingNames.push('Password (min 6 chars)');
      if (newFieldErrors.dob) missingNames.push('Date of Birth');

      setErrorMessage(
        `Please complete all required fields before proceeding: ${missingNames.join(', ')}.`
      );
      return;
    }

    if (!age && dob) {
      const birthYear = new Date(dob).getFullYear();
      const currentYear = new Date().getFullYear();
      if (!isNaN(birthYear) && birthYear < currentYear) {
        setAge(Math.max(12, currentYear - birthYear));
      }
    }

    setFieldErrors({});
    setErrorMessage('');
    startTransition(() => {
      setSignupStep(2);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // -------------------------------------------------------------
  // STEP 2 RETURN BACK TO STEP 1
  // -------------------------------------------------------------
  const handleBackToStep1 = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setErrorMessage('');
    startTransition(() => {
      setSignupStep(1);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // -------------------------------------------------------------
  // STEP 2 FINAL SIGNUP SUBMISSION
  // -------------------------------------------------------------
  const handleCompleteRegistration = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');
    const newFieldErrors: Record<string, boolean> = {};

    // Validate Step 2 fields
    if (!gender) {
      newFieldErrors.gender = true;
    }

    let finalAge = Number(age);
    if ((!finalAge || finalAge <= 0) && dob) {
      const birthYear = new Date(dob).getFullYear();
      const currentYear = new Date().getFullYear();
      if (!isNaN(birthYear) && birthYear < currentYear) {
        finalAge = Math.max(12, currentYear - birthYear);
        setAge(finalAge);
      }
    }
    if (!finalAge || finalAge <= 0) {
      finalAge = 22;
    }

    const totalInches = (Number(heightFeet) * 12) + Number(heightInches);
    const finalHeight = totalInches || 68;
    const finalWeight = Number(weight) && Number(weight) >= 20 && Number(weight) <= 300 ? Number(weight) : 68;

    if (roleMode === 'client') {
      if (!heightFeet || heightFeet < 4 || heightFeet > 7 || heightInches < 0 || heightInches > 11) {
        newFieldErrors.height = true;
      }
      if (weight !== '' && (Number(weight) < 20 || Number(weight) > 300)) {
        newFieldErrors.weight = true;
      }
    } else {
      if (!specializations.trim()) {
        newFieldErrors.specializations = true;
      }
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      const missingNames: string[] = [];
      if (newFieldErrors.gender) missingNames.push('Gender');
      if (newFieldErrors.height) missingNames.push('Valid Height (4 to 7 ft, 0-11 in)');
      if (newFieldErrors.weight) missingNames.push('Valid Weight (20-300 kg)');
      if (newFieldErrors.specializations) missingNames.push('Specialization');

      setErrorMessage(
        `Please complete all required onboarding profile details: ${missingNames.join(', ')}.`
      );
      return;
    }

    // Double check core credentials
    const cleanUsername = username.trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
    const cleanPassword = password;
    if (!displayName.trim() || !cleanUsername || !cleanPassword) {
      setSignupStep(1);
      setErrorMessage('Please verify your Step 1 account credentials.');
      return;
    }

    setFieldErrors({});

    const fallbackAvatar =
      gender === 'Female'
        ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80'
        : 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80';
    const finalPhoto = photoUrl || fallbackAvatar;

    try {
      if (roleMode === 'client') {
        await signupClient({
          username: cleanUsername,
          password: cleanPassword,
          displayName: displayName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          photoUrl: finalPhoto,
          fitnessGoal: fitnessGoal || 'General Fitness',
          dob: dob || '1998-01-01',
          age: finalAge,
          gender: gender || 'Male',
          height: finalHeight,
          weight: finalWeight
        });
        setSuccessNotice('Account created successfully! Welcome to Torrent Fitness.');
      } else {
        await signupTrainer({
          username: cleanUsername,
          password: cleanPassword,
          displayName: displayName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          photoUrl: finalPhoto,
          bio: bio.trim() || 'Certified Trainer at Torrent Fitness',
          specializations:
            specializations.trim() ||
            (gender === 'Female'
              ? 'Aerobics & Dance Fitness, Strength & Conditioning'
              : 'Strength & Conditioning'),
          dob: dob.trim() || '1995-01-01',
          gender: gender || 'Male'
        });
        setSuccessNotice('Trainer account registered! Redirecting to Pending Admin Verification screen...');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Registration failed. Please check your details and try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-800 flex flex-col justify-between py-8 px-4 relative overflow-hidden selection:bg-indigo-500/20 selection:text-indigo-800">
      {/* Subtle Ambient Light Orbs */}
      <div className="ambient-orb w-96 h-96 bg-indigo-300/20 top-0 left-1/2 -translate-x-1/2" />
      <div className="ambient-orb w-80 h-80 bg-sky-300/20 -bottom-10 right-10" />
      <div className="ambient-orb w-72 h-72 bg-rose-200/20 top-1/3 -left-12" />

      <div className="max-w-md w-full mx-auto space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center pt-2">
          <div className="inline-flex items-center justify-center mb-1">
            <GymLogo size="xl" showGlow />
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            TORRENT <span className="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent font-black">FITNESS</span>
          </h1>
          <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500 mt-1">
            BE MORE DO MORE
          </p>
          <p className="text-xs text-indigo-600 font-bold tracking-wide mt-1.5">
            {roleMode === 'client' ? 'Member Portal' : 'Gym Trainer Portal'}
          </p>
        </div>

        {/* Glass Card Container */}
        <div className="vision-surface rounded-3xl p-6 sm:p-7 border border-white/90">
          {/* Login / Signup Tabs */}
          <div className="flex vision-inset p-1.5 rounded-2xl mb-4">
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  setAuthMode('login');
                  setFieldErrors({});
                  setErrorMessage('');
                });
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all duration-150 ${
                authMode === 'login'
                  ? 'vision-btn-aurora font-bold shadow-md rounded-xl'
                  : 'text-slate-600 hover:text-slate-900 font-bold'
              }`}
            >
              Log In ({roleMode === 'client' ? 'Member' : 'Trainer'})
            </button>
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  setAuthMode('signup');
                  setFieldErrors({});
                  setErrorMessage('');
                });
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all duration-150 ${
                authMode === 'signup'
                  ? 'vision-btn-aurora font-bold shadow-md rounded-xl'
                  : 'text-slate-600 hover:text-slate-900 font-bold'
              }`}
            >
              Sign Up ({roleMode === 'client' ? 'New Member' : 'New Trainer'})
            </button>
          </div>

          {/* -------------------------------------------------------------
              FOCUSED LOGIN FORM (Zero Lag)
          ------------------------------------------------------------- */}
          {authMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
              {/* Username / Mobile / Email Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                  {roleMode === 'client'
                    ? 'Mobile Number, Email, or Client ID'
                    : 'Mobile Number, Email, or Trainer ID'}{' '}
                  <span className="text-orange-500 font-black">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    placeholder={
                      roleMode === 'client'
                        ? 'Enter Mobile, Email or Client ID'
                        : 'Enter Mobile, Email or Trainer ID'
                    }
                    value={loginIdentifier}
                    onFocus={() => clearFieldError('username')}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    className={`w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl font-medium focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 ${
                      fieldErrors.username
                        ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                        : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                    }`}
                  />
                  <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                  Password <span className="text-orange-500 font-black">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onFocus={() => clearFieldError('password')}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className={`w-full pl-9 pr-10 py-2.5 text-sm rounded-xl focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 ${
                      fieldErrors.password
                        ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                        : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                    }`}
                  />
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                    ) : (
                      <Eye className="w-4 h-4" strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message Toast */}
              {errorMessage && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 shadow-sm flex items-start gap-2.5 shadow-lg shadow-rose-100 animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" strokeWidth={1.75} />
                  <div className="flex-1">
                    <p className="font-semibold leading-relaxed">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 vision-btn-aurora text-white text-sm font-bold rounded-2xl shadow-lg transition-all duration-200 ease-out flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  'Processing securely...'
                ) : (
                  <>
                    <span>Sign In to Account</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={2} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* -------------------------------------------------------------
              2-STEP SIGNUP WIZARD
          ------------------------------------------------------------- */}
          {authMode === 'signup' && (
            <div className="space-y-4">
              {/* Subtle Progress Indicator Pill */}
              <div className="p-2.5 rounded-2xl bg-slate-100/90 border border-slate-200/80 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black transition-all ${
                      signupStep === 1
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-emerald-500 text-white'
                    }`}
                  >
                    {signupStep === 1 ? '1' : '✓'}
                  </span>
                  <div className="text-left">
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                      {signupStep === 1
                        ? roleMode === 'client'
                          ? 'Step 1 of 2: Account Details'
                          : 'Step 1 of 2: Trainer Account'
                        : roleMode === 'client'
                        ? 'Step 2 of 2: Fitness Profile'
                        : 'Step 2 of 2: Professional Profile'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {signupStep === 1
                        ? 'Basic credentials & verification'
                        : roleMode === 'client'
                        ? 'Media, metrics & fitness goal'
                        : 'Photo, coaching specialty & bio'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pr-1">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      signupStep === 1 ? 'w-6 bg-indigo-600' : 'w-3 bg-emerald-500'
                    }`}
                  />
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      signupStep === 2 ? 'w-6 bg-indigo-600' : 'w-3 bg-slate-300'
                    }`}
                  />
                </div>
              </div>

              {/* STEP 1: BASIC ACCOUNT INFORMATION */}
              {signupStep === 1 && (
                <div className="space-y-4 animate-fade-in">
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                      Full Name <span className="text-orange-500 font-black">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. Rahul Sharma"
                        value={displayName}
                        onFocus={() => clearFieldError('displayName')}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className={`w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 ${
                          fieldErrors.displayName
                            ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                            : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                        }`}
                      />
                      <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    </div>
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                      Email Address <span className="text-orange-500 font-black">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        placeholder="e.g. rahul@example.com"
                        value={email}
                        onFocus={() => clearFieldError('email')}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 ${
                          fieldErrors.email
                            ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                            : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                        }`}
                      />
                      <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    </div>
                  </div>

                  {/* 10-Digit Phone Number */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                      10-Digit Mobile Number <span className="text-orange-500 font-black">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="e.g. 9876543210"
                        value={phone}
                        onFocus={() => clearFieldError('phone')}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        className={`w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 font-mono ${
                          fieldErrors.phone
                            ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                            : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                        }`}
                      />
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    </div>
                  </div>

                  {/* Unique Username / Client ID */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                      Unique {roleMode === 'client' ? 'Client ID / Username' : 'Trainer ID / Username'}{' '}
                      <span className="text-orange-500 font-black">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        name="username"
                        autoComplete="username"
                        placeholder={roleMode === 'client' ? 'e.g. rahul_fit' : 'e.g. trainer_ankit'}
                        value={username}
                        onFocus={() => clearFieldError('username')}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                        className={`w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl font-mono focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 ${
                          fieldErrors.username
                            ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                            : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                        }`}
                      />
                      <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                      Password (Min 6 characters) <span className="text-orange-500 font-black">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        autoComplete="new-password"
                        placeholder="Min 6 characters"
                        value={password}
                        onFocus={() => clearFieldError('password')}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`w-full pl-9 pr-10 py-2.5 text-sm rounded-xl focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 ${
                          fieldErrors.password
                            ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                            : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                        }`}
                      />
                      <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                        ) : (
                          <Eye className="w-4 h-4" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                      Date of Birth <span className="text-orange-500 font-black">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        max={new Date().toISOString().split('T')[0]}
                        value={dob}
                        onChange={(e) => handleDobChange(e.target.value)}
                        className={`w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl font-medium focus:outline-none transition-all duration-200 text-slate-900 placeholder-slate-400 ${
                          fieldErrors.dob
                            ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                            : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                        }`}
                      />
                      <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    </div>
                  </div>

                  {/* Error Message Toast */}
                  {errorMessage && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 shadow-sm space-y-1 flex items-start gap-2.5 animate-fade-in">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" strokeWidth={1.75} />
                      <div className="flex-1">
                        <p className="font-semibold leading-relaxed">{errorMessage}</p>
                      </div>
                    </div>
                  )}

                  {/* Step 1 Bottom Action: Proceed to Profile Setup */}
                  <button
                    type="button"
                    onClick={handleProceedToStep2}
                    className="w-full py-3.5 px-4 vision-btn-aurora text-white text-sm font-bold rounded-2xl shadow-lg transition-all duration-200 ease-out flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
                  >
                    <span>Proceed to Profile Setup</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              )}

              {/* STEP 2: MEDIA & FITNESS ONBOARDING PROFILE */}
              {signupStep === 2 && (
                <form onSubmit={handleCompleteRegistration} className="space-y-4 animate-fade-in" noValidate>
                  {/* Profile Photo Selector + Quick Avatar Pickers */}
                  <div className="space-y-3">
                    <div className={fieldErrors.photoUrl ? 'p-1 bg-rose-50 rounded-2xl border border-rose-500/60' : ''}>
                      <PhotoUploader
                        label="Profile Photo"
                        required={true}
                        defaultPhoto={photoUrl}
                        onPhotoSelected={(url) => {
                          setPhotoUrl(url);
                          clearFieldError('photoUrl');
                        }}
                      />
                    </div>

                    {/* Quick Fitness Avatar Pickers */}
                    <div className="p-3 rounded-2xl bg-white/70 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Quick Fitness Avatars</span>
                        </div>
                        <span className="text-[10px] text-slate-500">Tap to select preset</span>
                      </div>
                      <div className="flex items-center gap-2.5 overflow-x-auto py-1 no-scrollbar">
                        {PRESET_AVATARS.map((av) => {
                          const isSelected = photoUrl === av.url;
                          return (
                            <button
                              key={av.id}
                              type="button"
                              onClick={() => {
                                setPhotoUrl(av.url);
                                clearFieldError('photoUrl');
                              }}
                              className={`relative shrink-0 rounded-full p-0.5 transition-all cursor-pointer ${
                                isSelected
                                  ? 'ring-2 ring-indigo-600 ring-offset-2 scale-105'
                                  : 'opacity-75 hover:opacity-100 hover:scale-105'
                              }`}
                              title={av.label}
                            >
                              <img
                                src={av.url}
                                alt={av.label}
                                className="w-10 h-10 rounded-full object-cover border border-white shadow-xs"
                              />
                              {isSelected && (
                                <span className="absolute -bottom-0.5 -right-0.5 bg-indigo-600 text-white rounded-full p-0.5 shadow-xs">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* CLIENT FITNESS PROFILE SECTION */}
                  {roleMode === 'client' && (
                    <div className="clay-card rounded-2xl p-4 space-y-3.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-orange-500 border-b border-slate-300/80 pb-2.5">
                        <Activity className="w-4 h-4 text-orange-500" strokeWidth={1.75} />
                        <span className="tracking-wide">Fitness Onboarding Profile</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Age */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 font-bold mb-1">
                            Age (Years) <span className="text-orange-500 font-black">*</span>
                          </label>
                          <input
                            type="number"
                            min={12}
                            max={100}
                            placeholder="e.g. 26"
                            value={age}
                            onFocus={() => clearFieldError('age')}
                            onChange={(e) => {
                              setAge(e.target.value === '' ? '' : Number(e.target.value));
                            }}
                            className={`w-full px-3 py-2 text-sm rounded-xl focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 ${
                              fieldErrors.age
                                ? 'border border-rose-500 ring-2 ring-rose-500/20 bg-rose-50'
                                : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                            }`}
                          />
                        </div>

                        {/* Gender (Mandatory for Aerobics Gating) */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 font-bold mb-1">
                            Gender <span className="text-orange-500 font-black">*</span>
                          </label>
                          <select
                            required
                            value={gender}
                            onFocus={() => clearFieldError('gender')}
                            onChange={(e) => {
                              setGender(e.target.value as 'Female' | 'Male' | 'Other' | '');
                            }}
                            className={`w-full px-3 py-2 text-sm rounded-xl focus:outline-none font-bold transition-colors duration-150 ${
                              fieldErrors.gender
                                ? 'border border-rose-500 ring-2 ring-rose-500/20 bg-rose-50 text-rose-900'
                                : gender === 'Female'
                                ? 'bg-rose-50/90 border border-rose-300 text-rose-900 shadow-xs'
                                : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                            }`}
                          >
                            <option value="" className="bg-white text-slate-400">
                              Select Gender *
                            </option>
                            <option value="Female" className="bg-white text-slate-800">
                              Female
                            </option>
                            <option value="Male" className="bg-white text-slate-800">
                              Male
                            </option>
                            <option value="Other" className="bg-white text-slate-800">
                              Other
                            </option>
                          </select>
                          {fieldErrors.gender && (
                            <p className="text-[10px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>Gender selection is required.</span>
                            </p>
                          )}
                          {gender === 'Female' && (
                            <p className="text-[10px] font-bold text-fuchsia-700 mt-1">
                              ✨ Unlocks Exclusive Aerobics &amp; Dance Fitness Studio
                            </p>
                          )}
                        </div>

                        {/* Height (Feet & Inches) */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 font-bold mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Ruler className="w-3 h-3 text-slate-400" strokeWidth={1.75} />
                              <span>Height <span className="text-orange-500 font-black">*</span></span>
                            </span>
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                              {heightFeet} ft {heightInches} in ({heightFeet}.{heightInches})
                            </span>
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={heightFeet}
                              onFocus={() => clearFieldError('height')}
                              onChange={(e) => setHeightFeet(Number(e.target.value))}
                              className="px-2 py-2 text-xs font-bold rounded-xl clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs"
                            >
                              {[4, 5, 6, 7].map((f) => (
                                <option key={f} value={f}>
                                  {f} ft
                                </option>
                              ))}
                            </select>
                            <select
                              value={heightInches}
                              onFocus={() => clearFieldError('height')}
                              onChange={(e) => setHeightInches(Number(e.target.value))}
                              className="px-2 py-2 text-xs font-bold rounded-xl clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs"
                            >
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((inc) => (
                                <option key={inc} value={inc}>
                                  {inc} in
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Weight (kg) */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 font-bold mb-1 flex items-center gap-1">
                            <Scale className="w-3 h-3 text-slate-400" strokeWidth={1.75} />
                            <span>Weight (kg) <span className="text-orange-500 font-black">*</span></span>
                          </label>
                          <input
                            type="number"
                            min={20}
                            max={300}
                            placeholder="e.g. 76"
                            value={weight}
                            onFocus={() => clearFieldError('weight')}
                            onChange={(e) => {
                              setWeight(e.target.value === '' ? '' : Number(e.target.value));
                            }}
                            className={`w-full px-3 py-2 text-sm rounded-xl focus:outline-none transition-colors duration-150 text-slate-900 placeholder-slate-400 ${
                              fieldErrors.weight
                                ? 'border border-rose-500 ring-2 ring-rose-500/20 bg-rose-50'
                                : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Primary Fitness Goal */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 font-bold mb-1">
                          Primary Fitness Goal
                        </label>
                        <select
                          value={fitnessGoal}
                          onChange={(e) => setFitnessGoal(e.target.value)}
                          className="w-full px-3 py-2 text-sm clay-inset border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                        >
                          <option value="Muscle Gain" className="bg-white text-slate-800">Muscle Gain &amp; Hypertrophy</option>
                          <option value="Fat Loss" className="bg-white text-slate-800">Fat Loss &amp; Leaning</option>
                          <option value="Strength" className="bg-white text-slate-800">Raw Strength &amp; Power</option>
                          <option value="Endurance" className="bg-white text-slate-800">Cardio &amp; Athletic Endurance</option>
                          <option value="Flexibility" className="bg-white text-slate-800">Flexibility &amp; Calisthenics</option>
                          <option value="General Fitness" className="bg-white text-slate-800">General Fitness &amp; Health</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* TRAINER PROFESSIONAL PROFILE SECTION */}
                  {roleMode === 'trainer' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                          Gender <span className="text-orange-500 font-black">*</span>
                        </label>
                        <select
                          required
                          value={gender}
                          onChange={(e) => {
                            setGender(e.target.value as 'Female' | 'Male' | 'Other' | '');
                            clearFieldError('gender');
                          }}
                          className={`w-full px-3.5 py-2.5 text-sm rounded-xl focus:outline-none font-bold transition-all duration-200 ${
                            fieldErrors.gender
                              ? 'border border-rose-500 ring-2 ring-rose-500/20 bg-rose-50 text-rose-900'
                              : gender === 'Female'
                              ? 'bg-rose-50/90 border border-rose-300 text-rose-900 shadow-xs'
                              : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                          }`}
                        >
                          <option value="" className="bg-white text-slate-400">
                            Select Trainer Gender *
                          </option>
                          <option value="Male" className="bg-white text-slate-800">
                            Male
                          </option>
                          <option value="Female" className="bg-white text-slate-800">
                            Female
                          </option>
                          <option value="Other" className="bg-white text-slate-800">
                            Other
                          </option>
                        </select>
                        {fieldErrors.gender && (
                          <p className="text-[10px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>Gender selection is required (Male, Female, or Other).</span>
                          </p>
                        )}
                        {gender === 'Female' && (
                          <p className="text-[10px] font-bold text-fuchsia-700 mt-1">
                            ✨ Unlocks Female Trainer Aerobics Batch &amp; Enrolled Roster Privileges
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                          Trainer Specialization <span className="text-orange-500 font-black">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Aerobics & Dance Fitness, Bodybuilding, Crossfit"
                          value={specializations}
                          onChange={(e) => {
                            setSpecializations(e.target.value);
                            clearFieldError('specializations');
                          }}
                          className={`w-full px-3.5 py-2.5 text-sm rounded-xl focus:outline-none transition-all duration-200 text-slate-900 placeholder-slate-400 ${
                            fieldErrors.specializations
                              ? 'bg-rose-50 border border-rose-500 ring-2 ring-rose-500/20'
                              : 'clay-inset text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 shadow-xs'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 font-bold mb-1.5">
                          Bio / Experience Summary
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Brief background about your coaching experience..."
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          className="w-full px-3.5 py-2 text-sm vision-inset rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25 text-slate-800 placeholder-slate-400"
                        />
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 shadow-sm flex items-start gap-2.5">
                        <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" strokeWidth={1.75} />
                        <span className="leading-relaxed">
                          New trainer registrations require <strong className="text-amber-900">Admin Approval</strong> before client information and protected training tools are unlocked.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Error Message Toast */}
                  {errorMessage && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 shadow-sm space-y-1 flex items-start gap-2.5 animate-fade-in">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" strokeWidth={1.75} />
                      <div className="flex-1">
                        <p className="font-semibold leading-relaxed">{errorMessage}</p>
                      </div>
                    </div>
                  )}

                  {/* Success notice */}
                  {successNotice && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 shadow-sm flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{successNotice}</span>
                    </div>
                  )}

                  {/* Step 2 Actions: Back Button & Complete Registration Button */}
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleBackToStep1}
                      disabled={isLoading}
                      className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 text-xs font-bold rounded-2xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-3.5 px-4 vision-btn-aurora text-white text-sm font-bold rounded-2xl shadow-lg transition-all duration-200 ease-out flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing registration...
                        </span>
                      ) : (
                        <>
                          <span>Complete Registration</span>
                          <ArrowRight className="w-4 h-4" strokeWidth={2} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Switch as Trainer / Switch as Client toggle */}
        <div className="text-center">
          {roleMode === 'client' ? (
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  setRoleMode('trainer');
                  handleResetForm();
                });
              }}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 vision-btn-neutral px-4 py-2 rounded-full border border-white/80 transition-all duration-150 shadow-sm cursor-pointer"
            >
              <span>Are you a Trainer?</span>
              <span className="font-bold text-indigo-600 underline">Switch as Trainer →</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  setRoleMode('client');
                  handleResetForm();
                });
              }}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 vision-btn-neutral px-4 py-2 rounded-full border border-white/80 transition-all duration-150 shadow-sm cursor-pointer"
            >
              <span>← Return to Client Login</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
