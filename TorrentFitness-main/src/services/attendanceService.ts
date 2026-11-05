import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { AttendanceRecord } from '../types';

export const DEFAULT_SESSION_DURATION_MINUTES = 120; // 2-hour gym workout session

/**
 * Checks whether an attendance session has completed or exceeded its duration.
 */
export function isSessionExpired(record: AttendanceRecord): boolean {
  if (record.sessionStatus === 'completed') return true;
  const createdMs = new Date(record.createdAt).getTime();
  if (isNaN(createdMs)) return false;
  const durationMs = (record.sessionDurationMinutes || DEFAULT_SESSION_DURATION_MINUTES) * 60 * 1000;
  return Date.now() >= createdMs + durationMs;
}

/**
 * Gets remaining milliseconds before the active session expires.
 */
export function getSessionRemainingMs(record: AttendanceRecord): number {
  if (record.sessionStatus === 'completed') return 0;
  const createdMs = new Date(record.createdAt).getTime();
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
 * Ends/closes an active gym attendance session with accurate elapsed duration.
 */
export async function closeAttendanceSession(record: AttendanceRecord): Promise<number> {
  const exitDate = new Date();
  const exitTimeStr = exitDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const entryDateObj = new Date(record.createdAt);
  const rawElapsed = Math.max(
    1,
    Math.round((exitDate.getTime() - entryDateObj.getTime()) / (1000 * 60))
  );
  // Cap recorded duration at configured window (120 min max)
  const maxMins = record.sessionDurationMinutes || DEFAULT_SESSION_DURATION_MINUTES;
  const elapsedMinutes = Math.min(rawElapsed, maxMins);

  try {
    const attRef = doc(db, 'attendance', record.id);
    await updateDoc(attRef, {
      sessionStatus: 'completed',
      exitTime: exitTimeStr,
      sessionDurationMinutes: elapsedMinutes,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Error updating attendance document:', err);
  }

  return elapsedMinutes;
}

/**
 * Checks for any currently open/active sessions for this client.
 * If an active session's time has already expired (past 2-hour window), it is automatically
 * marked as completed in Firestore and returns null so the client is allowed to scan again.
 */
export async function getActiveClientSession(clientId: string): Promise<AttendanceRecord | null> {
  if (!clientId) return null;

  try {
    const attQuery = query(
      collection(db, 'attendance'),
      where('clientId', '==', clientId),
      where('sessionStatus', '==', 'active')
    );
    const snap = await getDocs(attQuery);
    if (snap.empty) return null;

    for (const docSnap of snap.docs) {
      const record = { id: docSnap.id, ...docSnap.data() } as AttendanceRecord;
      if (isSessionExpired(record)) {
        // Automatically close the expired session in Firestore
        await closeAttendanceSession(record);
      } else {
        // Active and unexpired session
        return record;
      }
    }
  } catch (err) {
    console.warn('Error checking active client session:', err);
  }

  return null;
}

