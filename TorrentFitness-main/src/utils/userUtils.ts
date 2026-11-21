import { UserAccount, ClientProfile, UserRole } from '../types';

export interface NormalizedUserAccount extends UserAccount {
  usernameLower?: string;
  passwordHash?: string | null;
  authEmail?: string;
  planExpiryDate?: string | null;
}

/**
 * Resilient schema normalization for user documents.
 * Guarantees that login, session hydration, and directory lookups NEVER throw
 * "Invalid data" due to missing optional fields, partial document updates, or legacy schemas.
 */
export function normalizeUserDoc(docData: any, docId?: string): NormalizedUserAccount {
  if (!docData) {
    const fallbackId = docId || 'user_' + Date.now();
    return {
      uid: fallbackId,
      username: fallbackId,
      usernameLower: fallbackId.toLowerCase(),
      displayName: 'Member',
      fullName: 'Member',
      email: '',
      authEmail: `${fallbackId.toLowerCase()}@torrentfitness.app`,
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      phone: '',
      mobileNumber: '',
      role: 'client',
      status: 'active',
      membershipStatus: 'inactive',
      createdAt: new Date().toISOString()
    };
  }

  // 1. Resolve role safely with client fallback
  const rawRole = String(docData.role || '').toLowerCase().trim();
  const resolvedRole: UserRole =
    rawRole === 'admin' || rawRole === 'administrator' || rawRole === 'owner'
      ? 'admin'
      : rawRole === 'trainer' || rawRole === 'coach' || rawRole === 'staff'
      ? 'trainer'
      : 'client';

  // 2. Resolve identifiers safely
  const uid = String(docData.uid || docData.userId || docData.authUid || docData.clientId || docId || '').trim() || ('user_' + Date.now());
  const username = String(docData.username || docData.usernameLower || docData.handle || uid).trim();
  const usernameLower = String(docData.usernameLower || username).toLowerCase().trim();

  // 3. Resolve names safely
  const displayName = String(docData.displayName || docData.fullName || docData.name || username || 'Member').trim();
  const fullName = String(docData.fullName || docData.displayName || displayName).trim();

  // 4. Resolve contact info
  const email = String(docData.email || docData.authEmail || '').trim();
  const phone = String(docData.phone || docData.mobileNumber || docData.contact || '').trim();
  const photoUrl = String(docData.photoUrl || docData.avatar || docData.profilePhoto || '').trim() ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';

  // 5. Resolve account status safely
  const rawStatus = String(docData.status || '').toLowerCase().trim();
  const status: 'active' | 'pending' | 'pending_verification' | 'rejected' =
    rawStatus === 'rejected'
      ? 'rejected'
      : rawStatus === 'pending' || rawStatus === 'pending_verification'
      ? 'pending'
      : 'active';

  // 6. Resolve membership status safely (never downgrade valid active memberships)
  const rawMemStatus = String(docData.membershipStatus || '').toUpperCase().trim();
  const expiryDate = docData.membershipEndDate || docData.membershipExpiryDate || docData.planExpiryDate;
  const isDateFuture = expiryDate ? new Date(expiryDate).getTime() > Date.now() : false;
  const membershipStatus: 'ACTIVE' | 'active' | 'inactive' | 'expired' | 'pending' =
    rawMemStatus === 'ACTIVE' || rawMemStatus === 'ACTIVE_PAID' || isDateFuture
      ? 'ACTIVE'
      : (rawMemStatus === 'PENDING' ? 'pending' : 'inactive');

  // 7. Resolve passwords / hashes safely
  const password = typeof docData.password === 'string' && docData.password ? docData.password : undefined;
  const passwordHash = typeof docData.passwordHash === 'string' && docData.passwordHash
    ? docData.passwordHash
    : typeof docData.password_hash === 'string' && docData.password_hash
    ? docData.password_hash
    : null;

  return {
    ...docData,
    uid,
    username,
    usernameLower,
    displayName,
    fullName,
    email,
    authEmail: docData.authEmail || (email ? email : `${usernameLower}@torrentfitness.app`),
    phone,
    mobileNumber: phone,
    photoUrl,
    role: resolvedRole,
    status,
    membershipStatus,
    membershipPlan: docData.membershipPlan || docData.membershipPlanName || '',
    membershipStartDate: docData.membershipStartDate || '',
    membershipExpiryDate: docData.membershipExpiryDate || docData.membershipEndDate || docData.planExpiryDate || '',
    planExpiryDate: docData.planExpiryDate || docData.membershipEndDate || docData.membershipExpiryDate || null,
    dob: docData.dob || '2000-01-01',
    gender: docData.gender || 'Male',
    password,
    passwordHash,
    isSelfDeleted: Boolean(docData.isSelfDeleted),
    createdAt: docData.createdAt || new Date().toISOString()
  };
}

/**
 * Resilient schema normalization for client profile documents.
 */
export function normalizeClientProfile(docData: any, docId?: string): ClientProfile {
  const user = normalizeUserDoc(docData, docId);
  const expiry = docData?.planExpiryDate || docData?.membershipEndDate || docData?.membershipExpiryDate || user.membershipExpiryDate;
  const isFuture = expiry ? new Date(expiry).getTime() > Date.now() : false;
  const rawStatus = String(docData?.membershipStatus || user.membershipStatus || '').toLowerCase();
  const membershipStatus: 'active' | 'inactive' | 'ACTIVE' = (rawStatus === 'active' || isFuture) ? 'active' : 'inactive';

  return {
    userId: user.uid,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    email: user.email,
    phone: user.phone,
    dob: user.dob,
    gender: user.gender,
    membershipStatus,
    membershipPlan: docData?.membershipPlan || user.membershipPlan || '',
    membershipPlanId: docData?.membershipPlanId || '',
    membershipPlanName: docData?.membershipPlanName || docData?.membershipPlan || user.membershipPlan || '',
    membershipStartDate: docData?.membershipStartDate || user.membershipStartDate || '',
    membershipEndDate: expiry || '',
    membershipExpiryDate: expiry || '',
    planExpiryDate: expiry || null,
    ptStatus: docData?.ptStatus || 'none',
    assignedTrainerId: docData?.assignedTrainerId || null,
    assignedTrainerName: docData?.assignedTrainerName || null,
    isSelfDeleted: Boolean(docData?.isSelfDeleted || user.isSelfDeleted),
    createdAt: docData?.createdAt || user.createdAt
  };
}
