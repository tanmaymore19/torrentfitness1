/**
 * Shared Membership Status Utility
 * Consistently determines whether a client membership is active across both Client and Admin apps.
 * Recognizes membershipStatus ('ACTIVE' | 'active'), status ('ACTIVE' | 'active'), isActive === true,
 * and future planExpiryDate / membershipEndDate.
 */
export function isClientActiveMembership(c: any): boolean {
  if (!c || c.isSelfDeleted) return false;

  // 1. Explicit boolean flag
  if (c.isActive === true) return true;

  // 2. Status string normalization
  const memStatus = String(c.membershipStatus || '').trim().toUpperCase();
  const accStatus = String(c.status || '').trim().toUpperCase();

  if (memStatus === 'ACTIVE' || accStatus === 'ACTIVE') {
    return true;
  }

  // 3. Expiry date check if not explicitly inactive or expired
  const expiry = c.planExpiryDate || c.membershipEndDate || c.membershipExpiryDate;
  if (expiry && expiry !== '-') {
    const todayStr = new Date().toISOString().split('T')[0];
    if (
      expiry >= todayStr &&
      memStatus !== 'INACTIVE' &&
      memStatus !== 'EXPIRED' &&
      memStatus !== 'CANCELLED' &&
      accStatus !== 'INACTIVE' &&
      accStatus !== 'EXPIRED' &&
      accStatus !== 'CANCELLED'
    ) {
      return true;
    }
  }

  return false;
}
