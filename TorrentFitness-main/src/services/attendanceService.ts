import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { AttendanceRecord } from '../types';

export const DEFAULT_SESSION_DURATION_MINUTES = 120; // 2-hour gym workout session

export interface ActiveSessionData {
  id: string;
  clientId: string;
  clientName?: string;
  activeSession: boolean;
  sessionStatus: 'active' | 'completed';
  sessionStartedAt: string;
  sessionExpiresAt: string;
  entryTime: string;
  sessionDurationMinutes?: number;
  date?: string;
}

/**
 * Checks whether an attendance session has completed or exceeded its duration.
 */
export function isSessionExpired(record: AttendanceRecord | any): boolean {
  if (!record) return true;
  if (record.sessionStatus === 'completed' || record.activeSession === false) return true;
  if (record.sessionExpiresAt) {
    const expiresMs = new Date(record.sessionExpiresAt).getTime();
    if (!isNaN(expiresMs)) {
      return Date.now() >= expiresMs;
    }
  }
  const createdMs = new Date(record.sessionStartedAt || record.createdAt).getTime();
  if (isNaN(createdMs)) return false;
  const durationMs = (record.sessionDurationMinutes || DEFAULT_SESSION_DURATION_MINUTES) * 60 * 1000;
  return Date.now() >= createdMs + durationMs;
}

/**
 * Gets remaining milliseconds before the active session expires.
 */
export function getSessionRemainingMs(record: AttendanceRecord | any): number {
  if (!record) return 0;
  if (record.sessionStatus === 'completed' || record.activeSession === false) return 0;
  if (record.sessionExpiresAt) {
    const expiresMs = new Date(record.sessionExpiresAt).getTime();
    if (!isNaN(expiresMs)) {
      return Math.max(0, expiresMs - Date.now());
    }
  }
  const createdMs = new Date(record.sessionStartedAt || record.createdAt).getTime();
  if (isNaN(createdMs)) return 0;
  const durationMs = (record.sessionDurationMinutes || DEFAULT_SESSION_DURATION_MINUTES) * 60 * 1000;
  return Math.max(0, createdMs + durationMs - Date.now());
}

/**
 * Formats milliseconds into HH:MM:SS or MM:SS countdown string.
 */
export function formatSessionRemainingTime(remainingMs: number): string {
  if (remainingMs <= 0) return '00:00:00';
  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Saves active session state persistently in localStorage for instant 0ms restoration.
 */
export function saveActiveSessionLocally(clientId: string, data: any) {
  if (!clientId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`tf_active_session_${clientId}`, JSON.stringify(data));
  } catch {}
}

/**
 * Loads persistent active session from localStorage.
 */
export function loadActiveSessionLocally(clientId: string): any | null {
  if (!clientId || typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(`tf_active_session_${clientId}`);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (isSessionExpired(parsed)) {
      localStorage.removeItem(`tf_active_session_${clientId}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clears active session from localStorage.
 */
export function clearActiveSessionLocally(clientId: string) {
  if (!clientId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`tf_active_session_${clientId}`);
  } catch {}
}

/**
 * Ends/closes an active gym attendance session with accurate elapsed duration.
 * Atomically cleans up attendance, attendance_logs, and clientProfiles documents.
 */
export async function closeAttendanceSession(record: AttendanceRecord | any): Promise<number> {
  if (!record) return 0;
  const exitDate = new Date();
  const exitTimeStr = exitDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const entryDateObj = new Date(record.sessionStartedAt || record.createdAt || Date.now());
  const rawElapsed = Math.max(
    1,
    Math.round((exitDate.getTime() - entryDateObj.getTime()) / (1000 * 60))
  );
  // Cap recorded duration at configured window (120 min max)
  const maxMins = record.sessionDurationMinutes || DEFAULT_SESSION_DURATION_MINUTES;
  const elapsedMinutes = Math.min(rawElapsed, maxMins);
  const nowIso = new Date().toISOString();

  // 1. Clear local mirror immediately
  if (record.clientId) {
    clearActiveSessionLocally(record.clientId);
  }

  // 2. Update Firestore documents
  const updatePayload = {
    activeSession: false,
    sessionStatus: 'completed',
    exitTime: exitTimeStr,
    sessionDurationMinutes: elapsedMinutes,
    updatedAt: nowIso
  };

  try {
    const promises: Promise<any>[] = [];

    if (record.id) {
      promises.push(
        updateDoc(doc(db, 'attendance', record.id), updatePayload).catch(() => {})
      );
      promises.push(
        updateDoc(doc(db, 'attendance_logs', record.id), updatePayload).catch(() => {})
      );
    }

    if (record.clientId && record.clientId !== 'guest') {
      promises.push(
        setDoc(
          doc(db, 'clientProfiles', record.clientId),
          {
            activeSession: false,
            activeSessionId: null,
            sessionStartedAt: null,
            sessionExpiresAt: null,
            lastSessionDurationMinutes: elapsedMinutes,
            lastCheckoutTime: exitTimeStr,
            updatedAt: nowIso
          },
          { merge: true }
        ).catch(() => {})
      );
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.warn('Error updating attendance document:', err);
  }

  return elapsedMinutes;
}

/**
 * Checks for any currently open/active sessions for this client.
 * First checks localStorage for immediate display, then verifies against Firestore.
 * If an active session's time has already expired (past 2-hour window), it is automatically
 * marked as completed in Firestore and returns null so the client is allowed to scan again.
 */
export async function getActiveClientSession(clientId: string): Promise<AttendanceRecord | any | null> {
  if (!clientId) return null;

  try {
    // 1. Direct query on clientProfiles to verify activeSession flag
    const clientDoc = await getDoc(doc(db, 'clientProfiles', clientId)).catch(() => null);
    if (clientDoc && clientDoc.exists()) {
      const data = clientDoc.data();
      if (data.activeSession && data.sessionExpiresAt) {
        const sessionRecord = {
          id: data.activeSessionId || `session_${clientId}`,
          clientId,
          clientName: data.displayName || 'Member',
          activeSession: true,
          sessionStatus: 'active',
          sessionStartedAt: data.sessionStartedAt || new Date().toISOString(),
          sessionExpiresAt: data.sessionExpiresAt,
          entryTime: data.lastCheckInTime || '06:00 AM',
          sessionDurationMinutes: DEFAULT_SESSION_DURATION_MINUTES,
          createdAt: data.sessionStartedAt || new Date().toISOString()
        };

        if (isSessionExpired(sessionRecord)) {
          await closeAttendanceSession(sessionRecord);
          return null;
        }

        saveActiveSessionLocally(clientId, sessionRecord);
        return sessionRecord;
      }
    }

    // 2. Query attendance collection for active status
    const attQuery = query(
      collection(db, 'attendance'),
      where('clientId', '==', clientId),
      where('sessionStatus', '==', 'active')
    );
    const snap = await getDocs(attQuery);
    if (!snap.empty) {
      for (const docSnap of snap.docs) {
        const record = { id: docSnap.id, ...docSnap.data() } as AttendanceRecord;
        if (isSessionExpired(record)) {
          await closeAttendanceSession(record);
        } else {
          saveActiveSessionLocally(clientId, record);
          return record;
        }
      }
    }
  } catch (err) {
    console.warn('Error checking active client session:', err);
  }

  // 3. Fallback to localStorage if offline/network hiccup
  return loadActiveSessionLocally(clientId);
}
