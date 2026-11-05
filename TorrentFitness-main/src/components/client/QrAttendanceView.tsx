import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { AttendanceRecord } from '../../types';
import { getCachedData, setCachedData } from '../../services/cacheService';
import { QRScannerModal } from '../common/QRScannerModal';
import {
  closeAttendanceSession,
  isSessionExpired,
  getSessionRemainingMs,
  formatSessionRemainingTime
} from '../../services/attendanceService';
import {
  QrCode,
  Clock,
  ShieldCheck,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Zap,
  Sparkles,
  LogOut,
  Plus,
  Lock
} from 'lucide-react';

interface QrAttendanceViewProps {
  onOpenScanner?: () => void;
}

export const QrAttendanceView: React.FC<QrAttendanceViewProps> = ({ onOpenScanner }) => {
  const { currentUser, clientProfile } = useAuth();
  const [history, setHistory] = useState<AttendanceRecord[]>(() =>
    currentUser?.uid ? getCachedData<AttendanceRecord[]>(`attendance_${currentUser.uid}`, []) : []
  );
  const [activeSession, setActiveSession] = useState<AttendanceRecord | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string>('');
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [sessionClosedNotice, setSessionClosedNotice] = useState<string>('');

  const handleTriggerScanner = () => {
    if (onOpenScanner) {
      onOpenScanner();
    } else {
      setIsScannerOpen(true);
    }
  };

  useEffect(() => {
    if (!currentUser?.uid) return;

    const mergeRecords = (newRecs: AttendanceRecord[]) => {
      setHistory((prev) => {
        const map = new Map<string, AttendanceRecord>();
        prev.forEach((r) => map.set(r.id, r));
        newRecs.forEach((r) => map.set(r.id, { ...map.get(r.id), ...r }));
        const list = Array.from(map.values());
        list.sort(
          (a, b) =>
            new Date(b.createdAt || (b as any).timestamp || 0).getTime() -
            new Date(a.createdAt || (a as any).timestamp || 0).getTime()
        );
        setCachedData(`attendance_${currentUser.uid}`, list);
        return list;
      });
    };

    // 1. Listen on 'attendance' collection
    const unsub1 = onSnapshot(
      query(
        collection(db, 'attendance'),
        where('clientId', '==', currentUser.uid),
        limit(30)
      ),
      (snap) => {
        const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
        mergeRecords(records);

        const currentActive = records.find((r) => r.sessionStatus === 'active');
        if (currentActive) {
          if (isSessionExpired(currentActive)) {
            closeAttendanceSession(currentActive);
            setActiveSession(null);
          } else {
            setActiveSession(currentActive);
          }
        } else {
          setActiveSession(null);
        }
      },
      (err) => console.warn('Attendance listener note:', err)
    );

    // 2. Listen simultaneously on 'attendance_logs' collection for instant dual-sync
    const unsub2 = onSnapshot(
      query(
        collection(db, 'attendance_logs'),
        where('clientId', '==', currentUser.uid),
        limit(30)
      ),
      (snap) => {
        const records = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            clientId: data.clientId,
            clientName: data.clientName || data.memberName || 'Member',
            entryDate: data.date || data.entryDate,
            entryTime: data.time || data.checkInTime || data.entryTime,
            sessionStatus: data.sessionStatus || 'completed',
            createdAt: data.timestamp || data.createdAt,
            timestamp: data.timestamp,
            badge: data.badge,
            isAerobicsMember: data.isAerobics || data.isAerobicsMember
          } as AttendanceRecord;
        });
        mergeRecords(records);
      },
      (err) => console.warn('Attendance logs listener note:', err)
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentUser?.uid]);

  // Handle explicit manual close of active workout session
  const handleCloseSession = async () => {
    if (!activeSession) return;
    setIsClosingSession(true);
    try {
      const elapsedMinutes = await closeAttendanceSession(activeSession);
      setActiveSession(null);
      setSessionClosedNotice(
        `Workout session finished! Total duration: ${elapsedMinutes} mins. Reception scanning is now unlocked.`
      );
      setTimeout(() => setSessionClosedNotice(''), 6000);
    } catch (err: any) {
      setSessionClosedNotice('Error closing workout session: ' + (err.message || 'Try again.'));
    } finally {
      setIsClosingSession(false);
    }
  };

  // 2-hour window countdown timer ticker
  useEffect(() => {
    if (!activeSession) {
      setRemainingTime('');
      return;
    }

    const checkCountdown = () => {
      if (isSessionExpired(activeSession)) {
        closeAttendanceSession(activeSession);
        setActiveSession(null);
        setRemainingTime('00:00:00');
        return;
      }
      const diffMs = getSessionRemainingMs(activeSession);
      setRemainingTime(formatSessionRemainingTime(diffMs));
    };

    checkCountdown();
    const interval = setInterval(checkCountdown, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  return (
    <div className="space-y-4 pb-20 text-slate-700">
      {/* Header Info Banner */}
      <div className="bg-gradient-to-r from-[#111827] via-[#141C2E] to-[#0F172A] rounded-3xl p-5 text-slate-800 border border-white/80 shadow-xl shadow-cyan-950/20 relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 font-bold bg-cyan-500/15 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
              Attendance & Floor Entry
            </span>
            <h2 className="text-base font-black text-slate-800 mt-1">QR Code Check-In</h2>
            <p className="text-xs text-slate-700">
              Scan the gym QR gate to begin your session. No daily limit on workouts.
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#E2EAF3] border border-cyan-500/30 text-orange-500 font-bold flex items-center justify-center shrink-0 shadow-md">
            <QrCode className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Closed Session Toast Notice */}
      {sessionClosedNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-3xl text-emerald-800 text-xs flex items-center gap-2.5 shadow-sm animate-scale-up">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="flex-1 font-semibold">{sessionClosedNotice}</div>
        </div>
      )}

      {/* Active Workout Session Banner if in gym */}
      {activeSession ? (
        <div className="bg-gradient-to-tr from-emerald-500/15 via-teal-500/10 to-sky-500/15 backdrop-blur-xl rounded-3xl p-5 text-slate-800 border border-emerald-400/40 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              LIVE GYM SESSION IN PROGRESS
            </span>
            <span className="text-xs text-slate-500 font-mono">Entered: {activeSession.entryTime}</span>
          </div>

          <div className="my-3 text-center">
            <span className="text-[11px] text-emerald-600 uppercase tracking-widest block font-bold">
              Time Remaining in 2-Hour Window
            </span>
            <div className="text-4xl font-mono font-black text-slate-800 tracking-wider my-1 drop-shadow-sm">
              {remainingTime || '02:00:00'}
            </div>
            <p className="text-[11px] text-slate-500">
              Auto-ends after 2 hours. Tap below anytime to close your session early!
            </p>
          </div>

          {/* Action buttons: Close Session or Info Notice */}
          {/* Action buttons: Close Session or Scan Another Session */}
          <div className="pt-3 border-t border-white/80 space-y-2.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTriggerScanner}
                className="flex-1 py-3 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <QrCode className="w-4 h-4" />
                <span>Scan New Punch (Evening / Extra)</span>
              </button>

              <button
                type="button"
                onClick={handleCloseSession}
                disabled={isClosingSession}
                className="py-3 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>{isClosingSession ? 'Closing...' : 'Close Session'}</span>
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-600 bg-white/70 py-1.5 px-3 rounded-xl border border-white/80 text-center font-medium">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Multiple daily visits supported. Morning & evening workouts logged seamlessly.</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="clay-surface rounded-3xl p-6 border border-white/80 shadow-xl text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-cyan-950/60 border border-cyan-500/30 text-orange-500 font-bold flex items-center justify-center mx-auto shadow-inner">
            <QrCode className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Arrived at Torrent Fitness?</h3>
            <p className="text-xs text-slate-600 max-w-xs mx-auto mt-1 leading-relaxed">
              Scan the official QR standee at the gym entry gate to record attendance. No daily scan limits.
            </p>
          </div>
          <button
            onClick={handleTriggerScanner}
            className="w-full py-3.5 px-4 clay-btn-sunset text-white hover:from-cyan-400 hover:to-blue-500 text-sm font-bold rounded-2xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <QrCode className="w-5 h-5" />
            <span>Open QR Scanner</span>
          </button>
        </div>
      )}

      {/* Attendance History Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-500 font-bold" />
            <h3 className="text-sm font-bold text-slate-800">
              Personal Attendance Logs
            </h3>
            {history.filter((h) => {
              const today = new Date().toISOString().split('T')[0];
              return (
                h.entryDate === today ||
                (h.timestamp && String(h.timestamp).startsWith(today)) ||
                (h.createdAt && String(h.createdAt).startsWith(today))
              );
            }).length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                Today:{' '}
                {
                  history.filter((h) => {
                    const today = new Date().toISOString().split('T')[0];
                    return (
                      h.entryDate === today ||
                      (h.timestamp && String(h.timestamp).startsWith(today)) ||
                      (h.createdAt && String(h.createdAt).startsWith(today))
                    );
                  }).length
                }{' '}
                punches
              </span>
            )}
          </div>
          <span className="text-xs text-slate-600 font-mono">{history.length} check-ins</span>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center clay-surface rounded-2xl border border-white/80">
            <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">No attendance records yet</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Scan the gym QR gate on your next visit to begin logging your streaks!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((record) => (
              <div
                key={record.id}
                className="p-3.5 clay-surface rounded-2xl border border-white/80 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-orange-500 font-bold flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">{record.entryDate}</span>
                    <span className="text-[11px] text-slate-600">
                      Check-in: <strong className="text-amber-600 font-bold font-mono">{record.entryTime}</strong>
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      record.sessionStatus === 'active'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
                        : 'bg-[#E2EAF3] text-slate-600 border-white/80'
                    }`}
                  >
                    {record.sessionStatus === 'active' ? 'Active Session' : 'Completed'}
                  </span>
                  <span className="text-[10px] text-slate-600 font-mono block mt-0.5">
                    {record.sessionDurationMinutes} min session
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fallback QR Scanner Modal strictly mounted on user click */}
      {!onOpenScanner && currentUser && isScannerOpen && (
        <QRScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          clientId={currentUser.uid}
          clientName={currentUser.displayName}
          clientPhotoUrl={currentUser.photoUrl}
          onScanSuccess={(record) => {
            setActiveSession(record);
          }}
        />
      )}
    </div>
  );
};
