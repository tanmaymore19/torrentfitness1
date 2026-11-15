import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  doc,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  arrayRemove
} from 'firebase/firestore';
import { AlertTriangle, Trash2, X, Loader2, ArrowRight, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { getCachedData, setCachedData } from '../../services/cacheService';

export interface DeleteAccountTarget {
  uid: string;
  displayName: string;
  role: 'client' | 'trainer' | 'admin' | string;
  email?: string;
  username?: string;
}

interface DeleteAccountModalProps {
  isOpen: boolean;
  target: DeleteAccountTarget | null;
  onClose: () => void;
  onDeleted: (uid: string) => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  target,
  onClose,
  onDeleted
}) => {
  // 2-step confirmation state: 1 = Summary & Warning, 2 = Type 'DELETE' confirmation
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset modal state on open/target change
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setConfirmationInput('');
      setIsDeleting(false);
      setErrorMsg(null);
    }
  }, [isOpen, target]);

  if (!isOpen || !target) return null;

  const handlePermanentDeleteUser = async () => {
    if (step === 2 && confirmationInput.trim().toUpperCase() !== 'DELETE') {
      setErrorMsg('Please type DELETE exactly to confirm deletion.');
      return;
    }

    setIsDeleting(true);
    setErrorMsg(null);

    try {
      const uid = target.uid;

      // Master admin protection check
      const protectedAdminIds = ['admin', 'admintorrentfitness1', 'admin_master_1', 'torrent_admin_master'];
      if (
        target.role === 'admin' ||
        protectedAdminIds.includes(uid.toLowerCase()) ||
        uid.toLowerCase().includes('hitesh')
      ) {
        setErrorMsg('The Master Admin / Owner account cannot be deleted.');
        setIsDeleting(false);
        return;
      }

      // 1. Resolve exact registered username for index deletion
      let registeredUsername = target.username || '';
      try {
        const uSnap = await getDoc(doc(db, 'users', uid));
        if (uSnap.exists()) {
          const uData = uSnap.data();
          if (uData.username) {
            registeredUsername = uData.username;
          }
        }
      } catch (e) {
        console.warn('User doc lookup note:', e);
      }

      const rawUsername = registeredUsername || target.username || target.displayName || uid;
      const cleanUsername = rawUsername.toLowerCase().replace(/[@\s]/g, '').trim();

      // 2. Initialize atomic batch
      const batch = writeBatch(db);

      // Audit tombstone record in deleted_users so background seed scripts never revive this account
      const tombstoneRef = doc(db, 'deleted_users', uid);
      batch.set(
        tombstoneRef,
        {
          uid,
          role: target.role,
          displayName: target.displayName || '',
          email: target.email || '',
          deletedAt: new Date().toISOString(),
          deletedBy: 'admintorrentfitness1'
        },
        { merge: true }
      );

      // Delete from core users collection
      batch.delete(doc(db, 'users', uid));

      // Clean username index so the username handle becomes reusable
      if (cleanUsername) {
        batch.delete(doc(db, 'usernames', cleanUsername));
      }
      if (registeredUsername && registeredUsername.toLowerCase().trim() !== cleanUsername) {
        batch.delete(doc(db, 'usernames', registeredUsername.toLowerCase().trim()));
      }
      if (uid.toLowerCase() !== cleanUsername) {
        batch.delete(doc(db, 'usernames', uid.toLowerCase().trim()));
      }

      // Handle Role-Specific Deletion & Reference Cleanup
      if (target.role === 'client') {
        // Client-specific collections
        batch.delete(doc(db, 'clientProfiles', uid));
        batch.delete(doc(db, 'members', uid));

        // Clean up any pending PT bookings/requests linked to this client
        try {
          const ptSnap = await getDocs(
            query(collection(db, 'ptRequests'), where('clientId', '==', uid))
          );
          ptSnap.forEach((ptDoc) => {
            batch.delete(ptDoc.ref);
          });
        } catch (err) {
          console.warn('PT request cleanup note:', err);
        }

        // Remove client UID from assigned trainers' client arrays (both assignedClientIds and assignedClients)
        try {
          const trainerQuery = query(
            collection(db, 'trainerProfiles'),
            where('assignedClientIds', 'array-contains', uid)
          );
          const trSnap = await getDocs(trainerQuery);
          trSnap.forEach((trDoc) => {
            batch.update(trDoc.ref, {
              assignedClientIds: arrayRemove(uid)
            });
          });
        } catch (err) {
          console.warn('Trainer client list cleanup note:', err);
        }

        try {
          const trainerQuery2 = query(
            collection(db, 'trainers'),
            where('assignedClients', 'array-contains', uid)
          );
          const trSnap2 = await getDocs(trainerQuery2);
          trSnap2.forEach((trDoc) => {
            batch.update(trDoc.ref, {
              assignedClients: arrayRemove(uid)
            });
          });
        } catch (err) {
          console.warn('Trainers assignedClients cleanup note:', err);
        }
      } else if (target.role === 'trainer') {
        // Trainer-specific collections
        batch.delete(doc(db, 'trainerProfiles', uid));
        batch.delete(doc(db, 'trainers', uid));

        // Unassign this trainer from any clients so clients aren't left stranded
        try {
          const clientSnap = await getDocs(
            query(collection(db, 'clientProfiles'), where('assignedTrainerId', '==', uid))
          );
          clientSnap.forEach((clDoc) => {
            batch.update(clDoc.ref, {
              assignedTrainerId: null,
              ptTrainerId: null,
              ptTrainerName: null,
              ptStatus: 'PENDING_ADMIN_ALLOCATION'
            });
          });
        } catch (err) {
          console.warn('Client trainer unassign note:', err);
        }
      }

      // 3. Commit atomic batch across all Firestore collections
      await batch.commit();

      // 4. Update localStorage tombstones so client-side cache and reloads never revive
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`tf_deleted_${uid}`, 'true');
          sessionStorage.setItem(`tf_deleted_${uid}`, 'true');
          if (uid === 'tanmay1_19') {
            localStorage.setItem('tf_deleted_tanmay1_19', 'true');
          }
        } catch {}
      }

      // 5. Update local cache services
      try {
        if (target.role === 'client') {
          const cachedClients = getCachedData<any[]>('admin_clients', []);
          setCachedData('admin_clients', cachedClients.filter((c: any) => c.userId !== uid && c.uid !== uid));
        } else if (target.role === 'trainer') {
          const cachedTrainers = getCachedData<any[]>('admin_trainers', []);
          setCachedData('admin_trainers', cachedTrainers.filter((t: any) => t.trainerId !== uid && t.uid !== uid));
        }
        const cachedUsers = getCachedData<any[]>('admin_users', []);
        setCachedData('admin_users', cachedUsers.filter((u: any) => u.uid !== uid));
      } catch (cacheErr) {
        console.warn('Cache purge note:', cacheErr);
      }

      // 6. Trigger success callback to update React state immediately
      onDeleted(uid);
      onClose();
    } catch (err: any) {
      console.error('handlePermanentDeleteUser error:', err);
      setErrorMsg('Error deleting account: ' + (err.message || 'Please check admin permissions.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md vision-surface border border-rose-300/40 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-5 relative overflow-hidden">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon & Title */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 shadow-sm">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                Step {step} of 2
              </span>
              <span className="text-xs text-slate-500 font-semibold">Master Admin Access</span>
            </div>
            <h3 className="text-base font-black text-slate-900 mt-1">
              {step === 1 ? 'Permanent Account Deletion' : 'Confirm Permanent Deletion'}
            </h3>
          </div>
        </div>

        {/* Step 1: Summary of Account & Initial Warning */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              You are about to permanently delete this {target.role} account from the Torrent Fitness database.
            </p>

            {/* Account Summary Banner */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs shadow-inner">
              <div className="flex justify-between">
                <span className="text-slate-500">Account Name:</span>
                <strong className="text-slate-900 font-bold">{target.displayName}</strong>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-slate-500">User ID:</span>
                <span className="text-indigo-700 font-bold">@{target.uid}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Role:</span>
                <span className="uppercase text-amber-700 font-bold">{target.role}</span>
              </div>
              {target.email && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="text-slate-700 font-medium">{target.email}</span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-700">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Multi-Collection Purge Impact</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-800">
                This operation atomically removes the user document, member/trainer profiles, username reservations, and clears all linked personal trainer assignments.
              </p>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-100 border border-rose-300 text-xs font-bold text-rose-900">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-slate-200 shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md active:scale-95"
              >
                <span>Proceed to Confirm</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Verification Input Check */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-800 space-y-1">
              <p className="font-bold text-rose-900">Final Security Verification</p>
              <p className="text-[11px]">
                To prevent accidental deletion of <strong className="font-bold">{target.displayName}</strong> (@{target.uid}), please type <span className="font-mono font-bold text-rose-700 bg-rose-100 px-1 py-0.5 rounded">DELETE</span> below.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Type <span className="text-rose-600 font-mono">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                autoFocus
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3.5 py-2.5 text-xs bg-white text-slate-900 border-2 border-rose-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono font-bold uppercase tracking-wider"
              />
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-100 border border-rose-300 text-xs font-bold text-rose-900">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setStep(1)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-slate-200 shadow-sm"
              >
                Back
              </button>
              <button
                type="button"
                disabled={isDeleting || confirmationInput.trim().toUpperCase() !== 'DELETE'}
                onClick={handlePermanentDeleteUser}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Purging Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
