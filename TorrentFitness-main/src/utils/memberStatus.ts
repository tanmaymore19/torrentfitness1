/**
 * Shared Membership & Attendance Status Utility
 * Consistently determines whether a client membership or aerobics enrollment is active across both Client and Admin apps.
 * Implements strict canonical unlock rules for QR Attendance Scanner.
 */

export function isClientActiveMembership(c: any): boolean {
  if (!c || c.isSelfDeleted || c.isDeletedByAdmin || c.status === 'archived' || c.status === 'deleted') return false;

  // Explicit false flags
  if (c.isActive === false) return false;

  // Status string normalization
  const memStatus = String(c.membershipStatus || '').trim().toUpperCase();
  const accStatus = String(c.status || '').trim().toUpperCase();

  // If explicitly inactive, rejected, expired, or cancelled, membership is strictly not active
  if (
    memStatus === 'INACTIVE' ||
    memStatus === 'REJECTED' ||
    memStatus === 'EXPIRED' ||
    memStatus === 'CANCELLED' ||
    memStatus === 'NONE' ||
    memStatus === 'PENDING' ||
    accStatus === 'INACTIVE' ||
    accStatus === 'REJECTED'
  ) {
    return false;
  }

  // 1. Explicit membership status ACTIVE
  if (memStatus === 'ACTIVE') {
    // If an expiry date is set, ensure it hasn't passed
    const expiry = c.planExpiryDate || c.membershipEndDate || c.membershipExpiryDate;
    if (expiry && expiry !== '-') {
      const todayStr = new Date().toISOString().split('T')[0];
      if (expiry < todayStr) return false;
    }
    return true;
  }

  // 2. Explicit boolean flag if membershipStatus is not inactive
  if (c.isActive === true) return true;

  // 3. Expiry date check if not explicitly inactive or expired
  const expiry = c.planExpiryDate || c.membershipEndDate || c.membershipExpiryDate;
  if (expiry && expiry !== '-') {
    const todayStr = new Date().toISOString().split('T')[0];
    if (expiry >= todayStr) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether a client has an active Aerobics studio enrollment.
 */
export function isClientActiveAerobics(c: any): boolean {
  if (!c || c.isSelfDeleted || c.isDeletedByAdmin || c.status === 'archived' || c.status === 'deleted') return false;

  const status = String(c.aerobicsStatus || '').trim().toLowerCase();
  if (
    status === 'inactive' ||
    status === 'rejected' ||
    status === 'expired' ||
    status === 'cancelled' ||
    status === 'none' ||
    status === 'pending'
  ) {
    return false;
  }
  if (status === 'active') {
    const expiry = c.aerobicsEndDate || c.aerobicsExpiryDate;
    if (expiry && expiry !== '-') {
      const todayStr = new Date().toISOString().split('T')[0];
      if (expiry < todayStr) return false;
    }
    return true;
  }

  const expiry = c.aerobicsEndDate || c.aerobicsExpiryDate;
  if (expiry && expiry !== '-') {
    const todayStr = new Date().toISOString().split('T')[0];
    if (expiry >= todayStr) {
      return true;
    }
  }

  return false;
}

export interface QrUnlockResult {
  unlocked: boolean;
  reason?: string;
  isFemale: boolean;
  hasActiveGym: boolean;
  hasActiveAerobics: boolean;
}

/**
 * CANONICAL QR ATTENDANCE SCANNER UNLOCK RULES:
 * - Male Clients: Unlocked ONLY if valid unexpired Gym Membership is ACTIVE.
 * - Female Clients: Unlocked if EITHER Gym Membership is ACTIVE OR Aerobics Batch is ACTIVE.
 */
export function isQrScannerUnlocked(profile: any, user?: any): QrUnlockResult {
  const gender = (profile?.gender || user?.gender || '').trim().toLowerCase();
  const isFemale = gender === 'female';

  const hasActiveGym = isClientActiveMembership(profile) || isClientActiveMembership(user);
  const hasActiveAerobics = isClientActiveAerobics(profile) || isClientActiveAerobics(user);

  if (isFemale) {
    if (hasActiveGym || hasActiveAerobics) {
      return {
        unlocked: true,
        isFemale: true,
        hasActiveGym,
        hasActiveAerobics
      };
    }
    return {
      unlocked: false,
      reason: 'QR Scanner Locked: An active Gym Membership or Aerobics Batch is required to mark attendance.',
      isFemale: true,
      hasActiveGym: false,
      hasActiveAerobics: false
    };
  } else {
    if (hasActiveGym) {
      return {
        unlocked: true,
        isFemale: false,
        hasActiveGym: true,
        hasActiveAerobics: false
      };
    }
    return {
      unlocked: false,
      reason: 'QR Scanner Locked: An active Gym Membership is required to mark attendance.',
      isFemale: false,
      hasActiveGym: false,
      hasActiveAerobics: false
    };
  }
}
