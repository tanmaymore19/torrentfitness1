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

/**
 * Checks whether a transaction / membership / invoice / bill record was soft-deleted or archived.
 */
export function isDeletedTransaction(tx: any): boolean {
  if (!tx) return true;
  const st = String(tx.status || '').toUpperCase().trim();
  const ps = String(tx.paymentStatus || '').toUpperCase().trim();
  const vs = String(tx.verificationStatus || '').toUpperCase().trim();
  return (
    tx.isDeletedByAdmin === true ||
    tx.deleted === true ||
    tx.deletedByAdmin === true ||
    tx.transactionDeleted === true ||
    st === 'DELETED' ||
    st === 'ARCHIVED' ||
    ps === 'DELETED' ||
    vs === 'DELETED'
  );
}

/**
 * Strict whitelist check determining whether a transaction contributes real revenue.
 * Excludes FAILED, REJECTED, PENDING, CANCELLED, DELETED, VOID, ARCHIVED, REFUNDED, test, and admin-deleted records.
 */
export function isValidRevenueTx(tx: any): boolean {
  if (!tx || isDeletedTransaction(tx) || tx.isTest === true) return false;

  const status = String(tx.status || tx.paymentStatus || '').toUpperCase().trim();
  const paymentStatus = String(tx.paymentStatus || '').toUpperCase().trim();
  const verificationStatus = String(tx.verificationStatus || '').toUpperCase().trim();

  if (
    ['FAILED', 'REJECTED', 'PENDING', 'CANCELLED', 'CANCELED', 'DELETED', 'VOID', 'ARCHIVED', 'REFUNDED'].includes(status) ||
    ['FAILED', 'REJECTED', 'PENDING', 'CANCELLED', 'CANCELED', 'DELETED', 'VOID', 'ARCHIVED', 'REFUNDED'].includes(paymentStatus) ||
    ['DELETED', 'REJECTED', 'FAILED', 'VOID'].includes(verificationStatus)
  ) {
    return false;
  }

  return ['COMPLETED', 'SUCCESS', 'CAPTURED', 'PAID', 'APPROVED'].includes(status);
}

/**
 * Normalizes raw Firestore transaction status values (including uppercase aliases like COMPLETED/PAID/CAPTURED)
 * into canonical ledger UI display labels.
 */
export function normalizeLedgerStatus(
  tx: any
): 'Success' | 'Pending' | 'Rejected' | 'Refunded' | 'Failed' {
  if (!tx) return 'Failed';
  const st = String(tx.status || tx.paymentStatus || '').toUpperCase().trim();
  const ps = String(tx.paymentStatus || '').toUpperCase().trim();

  if (st === 'REFUNDED' || ps === 'REFUNDED') return 'Refunded';
  if (st === 'REJECTED' || ps === 'REJECTED') return 'Rejected';
  if (st === 'FAILED' || ps === 'FAILED' || st === 'CANCELLED' || st === 'CANCELED' || st === 'VOID') {
    return 'Failed';
  }
  if (
    st === 'PENDING' ||
    st === 'PENDING_ADMIN_APPROVAL' ||
    st === 'PENDING_CASH_CONFIRMATION' ||
    ps === 'PENDING' ||
    ps === 'PENDING_CASH_CONFIRMATION'
  ) {
    return 'Pending';
  }
  if (isValidRevenueTx(tx)) {
    return 'Success';
  }
  return 'Failed';
}

/**
 * Merges transaction snapshots from primary (`paymentTransactions`) and alias (`transactions`) collections,
 * ensuring terminal states (DELETED / FAILED / REJECTED) in either document take precedence over stale statuses.
 */
export function mergeTransactionLists<T extends { id: string }>(
  primaryList: T[],
  aliasList: T[]
): T[] {
  const map = new Map<string, any>();

  const applyRecord = (incoming: any) => {
    if (!incoming || !incoming.id) return;
    const prev = map.get(incoming.id);
    if (!prev) {
      map.set(incoming.id, incoming);
      return;
    }

    const merged = { ...prev, ...incoming };
    if (isDeletedTransaction(prev) || isDeletedTransaction(incoming)) {
      map.set(incoming.id, {
        ...merged,
        isDeletedByAdmin: true,
        deleted: true,
        status: 'DELETED',
        paymentStatus: 'DELETED',
        verificationStatus: 'DELETED',
        amount: 0,
        finalAmount: 0
      });
      return;
    }

    const prevStatus = String(prev.status || prev.paymentStatus || '').toUpperCase().trim();
    const incStatus = String(incoming.status || incoming.paymentStatus || '').toUpperCase().trim();
    const terminalBad = ['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED', 'VOID', 'REFUNDED'];

    if (terminalBad.includes(prevStatus) && !terminalBad.includes(incStatus)) {
      map.set(incoming.id, {
        ...merged,
        status: prev.status,
        paymentStatus: prev.paymentStatus || prev.status,
        verificationStatus: prev.verificationStatus || merged.verificationStatus,
        amount: 0,
        finalAmount: 0
      });
      return;
    }

    map.set(incoming.id, merged);
  };

  primaryList.forEach(applyRecord);
  aliasList.forEach(applyRecord);

  return Array.from(map.values()).sort((a, b) => {
    const tA = new Date(a.createdAt || a.timestamp || a.approvedAt || 0).getTime();
    const tB = new Date(b.createdAt || b.timestamp || b.approvedAt || 0).getTime();
    return tB - tA;
  });
}

/**
 * Determines whether an announcement document is active and not soft-deleted by Admin.
 */
export function isActiveAnnouncement(ann: any): boolean {
  if (!ann) return false;
  if (ann.isDeletedByAdmin === true || ann.deleted === true) return false;
  if (ann.isActive === false) return false;
  return true;
}

/**
 * Resolves numeric timestamp in milliseconds for sorting and rendering announcements
 * across Firestore Timestamp objects, serialized timestamps, and ISO strings.
 */
export function getAnnouncementTimeMs(annOrDate: any): number {
  const raw =
    annOrDate && typeof annOrDate === 'object' && ('createdAt' in annOrDate || 'createdAtIso' in annOrDate)
      ? annOrDate.createdAtIso || annOrDate.createdAt
      : annOrDate;
  if (!raw) return 0;
  if (typeof raw?.toDate === 'function') return raw.toDate().getTime();
  if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
  const parsed = new Date(raw).getTime();
  return isNaN(parsed) ? 0 : parsed;
}
