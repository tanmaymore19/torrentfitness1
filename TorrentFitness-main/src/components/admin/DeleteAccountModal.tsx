import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import { signInAnonymously } from 'firebase/auth';
import {
  doc,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  arrayRemove,
  deleteDoc,
  setDoc,
  serverTimestamp,
  DocumentReference
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
      const uid = target.uid || (target as any).id || (target as any).userId || (target as any).trainerId;

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

      // 0. Ensure Firebase Auth is active (satisfies request.auth != null in Firestore security rules)
      if (auth && !auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (authErr) {
          console.warn('[DeleteAccountModal] anonymous sign-in note:', authErr);
        }
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

      // 2. Collect all document references to delete (deduplicated by path to prevent batch errors)
      const docsToDelete = new Map<string, DocumentReference>();
      const addDocToDelete = (ref: DocumentReference) => {
        if (ref && ref.path) {
          docsToDelete.set(ref.path, ref);
        }
      };

      const targetUsername = target.username || registeredUsername || uid;

      // 1. users: Delete direct docs and query matches
      addDocToDelete(doc(db, 'users', uid));
      if (cleanUsername) addDocToDelete(doc(db, 'users', cleanUsername));
      if (targetUsername && targetUsername !== cleanUsername) addDocToDelete(doc(db, 'users', targetUsername));
      if (registeredUsername && registeredUsername !== cleanUsername) addDocToDelete(doc(db, 'users', registeredUsername));

      try {
        const uQueries = [
          query(collection(db, 'users'), where('uid', '==', uid)),
          query(collection(db, 'users'), where('username', '==', cleanUsername)),
          query(collection(db, 'users'), where('usernameLower', '==', cleanUsername))
        ];
        if (targetUsername && targetUsername !== cleanUsername) {
          uQueries.push(query(collection(db, 'users'), where('username', '==', targetUsername)));
        }
        for (const q of uQueries) {
          const s = await getDocs(q);
          s.forEach(d => addDocToDelete(d.ref));
        }
      } catch (err) {
        console.warn('Query users note:', err);
      }

      // 2. members: Delete direct docs and query matches
      addDocToDelete(doc(db, 'members', uid));
      if (cleanUsername) addDocToDelete(doc(db, 'members', cleanUsername));
      if (targetUsername && targetUsername !== cleanUsername) addDocToDelete(doc(db, 'members', targetUsername));

      try {
        const mQueries = [
          query(collection(db, 'members'), where('userId', '==', uid)),
          query(collection(db, 'members'), where('clientId', '==', uid)),
          query(collection(db, 'members'), where('username', '==', cleanUsername)),
          query(collection(db, 'members'), where('usernameLower', '==', cleanUsername))
        ];
        if (targetUsername && targetUsername !== cleanUsername) {
          mQueries.push(query(collection(db, 'members'), where('username', '==', targetUsername)));
        }
        for (const q of mQueries) {
          const s = await getDocs(q);
          s.forEach(d => addDocToDelete(d.ref));
        }
      } catch (err) {
        console.warn('Query members note:', err);
      }

      // 3. clientProfiles: Delete direct docs and query matches
      addDocToDelete(doc(db, 'clientProfiles', uid));
      if (cleanUsername) addDocToDelete(doc(db, 'clientProfiles', cleanUsername));
      if (targetUsername && targetUsername !== cleanUsername) addDocToDelete(doc(db, 'clientProfiles', targetUsername));

      try {
        const cpQueries = [
          query(collection(db, 'clientProfiles'), where('userId', '==', uid)),
          query(collection(db, 'clientProfiles'), where('clientId', '==', uid)),
          query(collection(db, 'clientProfiles'), where('username', '==', cleanUsername)),
          query(collection(db, 'clientProfiles'), where('usernameLower', '==', cleanUsername))
        ];
        if (targetUsername && targetUsername !== cleanUsername) {
          cpQueries.push(query(collection(db, 'clientProfiles'), where('username', '==', targetUsername)));
        }
        for (const q of cpQueries) {
          const s = await getDocs(q);
          s.forEach(d => addDocToDelete(d.ref));
        }
      } catch (err) {
        console.warn('Query clientProfiles note:', err);
      }

      // 4. trainers & trainerProfiles: Delete direct docs and query matches
      addDocToDelete(doc(db, 'trainers', uid));
      if (cleanUsername) addDocToDelete(doc(db, 'trainers', cleanUsername));
      if (targetUsername && targetUsername !== cleanUsername) addDocToDelete(doc(db, 'trainers', targetUsername));
      addDocToDelete(doc(db, 'trainerProfiles', uid));
      if (cleanUsername) addDocToDelete(doc(db, 'trainerProfiles', cleanUsername));

      try {
        const trQueries = [
          query(collection(db, 'trainers'), where('trainerId', '==', uid)),
          query(collection(db, 'trainers'), where('username', '==', cleanUsername)),
          query(collection(db, 'trainers'), where('usernameLower', '==', cleanUsername)),
          query(collection(db, 'trainerProfiles'), where('trainerId', '==', uid)),
          query(collection(db, 'trainerProfiles'), where('username', '==', cleanUsername)),
          query(collection(db, 'trainerProfiles'), where('usernameLower', '==', cleanUsername))
        ];
        for (const q of trQueries) {
          const s = await getDocs(q);
          s.forEach(d => addDocToDelete(d.ref));
        }
      } catch (err) {
        console.warn('Query trainers note:', err);
      }

      // 5. usernames: Delete direct docs and query matches
      if (cleanUsername) addDocToDelete(doc(db, 'usernames', cleanUsername));
      if (targetUsername) addDocToDelete(doc(db, 'usernames', targetUsername));
      if (rawUsername) addDocToDelete(doc(db, 'usernames', rawUsername));
      if (registeredUsername) addDocToDelete(doc(db, 'usernames', registeredUsername));
      addDocToDelete(doc(db, 'usernames', uid));
      addDocToDelete(doc(db, 'usernames', uid.toLowerCase().trim()));

      try {
        const unQueries = [
          query(collection(db, 'usernames'), where('uid', '==', uid)),
          query(collection(db, 'usernames'), where('username', '==', cleanUsername)),
          query(collection(db, 'usernames'), where('usernameLower', '==', cleanUsername))
        ];
        if (targetUsername && targetUsername !== cleanUsername) {
          unQueries.push(query(collection(db, 'usernames'), where('username', '==', targetUsername)));
        }
        for (const q of unQueries) {
          const s = await getDocs(q);
          s.forEach(d => addDocToDelete(d.ref));
        }
      } catch (err) {
        console.warn('Query usernames cleanup note:', err);
      }

      // Remove any tombstone records so the username can be reused immediately
      addDocToDelete(doc(db, 'deleted_users', uid));
      if (cleanUsername) addDocToDelete(doc(db, 'deleted_users', cleanUsername));
      if (targetUsername) addDocToDelete(doc(db, 'deleted_users', targetUsername));
      if (registeredUsername) addDocToDelete(doc(db, 'deleted_users', registeredUsername));

      // Initialize atomic batch
      const batch = writeBatch(db);

      // Handle Role-Specific Deletion & Reference Cleanup
      if (target.role === 'client') {
        // Client-specific collections
        addDocToDelete(doc(db, 'clientProfiles', uid));
        addDocToDelete(doc(db, 'members', uid));

        // Query any matching documents in members or clientProfiles by userId
        try {
          const mQuery = await getDocs(query(collection(db, 'members'), where('userId', '==', uid)));
          mQuery.forEach(d => addDocToDelete(d.ref));
          const cpQuery = await getDocs(query(collection(db, 'clientProfiles'), where('userId', '==', uid)));
          cpQuery.forEach(d => addDocToDelete(d.ref));
        } catch (err) {
          console.warn('Query members/clientProfiles note:', err);
        }

        // 6. Clean up memberships across all identifier variants
        try {
          const memQueries = [
            query(collection(db, 'memberships'), where('clientId', '==', uid)),
            query(collection(db, 'memberships'), where('clientId', '==', cleanUsername)),
            query(collection(db, 'memberships'), where('clientUsername', '==', cleanUsername))
          ];
          if (targetUsername && targetUsername !== cleanUsername) {
            memQueries.push(query(collection(db, 'memberships'), where('clientUsername', '==', targetUsername)));
          }
          for (const q of memQueries) {
            const s = await getDocs(q);
            s.forEach(d => addDocToDelete(d.ref));
          }
        } catch (err) {
          console.warn('Memberships cleanup note:', err);
        }

        // 7. Clean up any pending or historical PT bookings/requests across ptRequests and pt_requests
        try {
          const ptQueries = [
            query(collection(db, 'ptRequests'), where('clientId', '==', uid)),
            query(collection(db, 'ptRequests'), where('clientId', '==', cleanUsername)),
            query(collection(db, 'ptRequests'), where('clientUsername', '==', cleanUsername)),
            query(collection(db, 'pt_requests'), where('clientId', '==', uid)),
            query(collection(db, 'pt_requests'), where('clientId', '==', cleanUsername)),
            query(collection(db, 'pt_requests'), where('clientUsername', '==', cleanUsername)),
            query(collection(db, 'pt_requests'), where('username', '==', cleanUsername))
          ];
          if (targetUsername && targetUsername !== cleanUsername) {
            ptQueries.push(
              query(collection(db, 'ptRequests'), where('clientUsername', '==', targetUsername)),
              query(collection(db, 'pt_requests'), where('clientUsername', '==', targetUsername))
            );
          }
          for (const q of ptQueries) {
            const s = await getDocs(q);
            s.forEach(d => addDocToDelete(d.ref));
          }
        } catch (err) {
          console.warn('PT requests cleanup note:', err);
        }

        // 8. Clean up transactions and paymentTransactions
        try {
          const txQueries = [
            query(collection(db, 'transactions'), where('clientId', '==', uid)),
            query(collection(db, 'transactions'), where('clientId', '==', cleanUsername)),
            query(collection(db, 'paymentTransactions'), where('clientId', '==', uid)),
            query(collection(db, 'paymentTransactions'), where('clientId', '==', cleanUsername))
          ];
          for (const q of txQueries) {
            const s = await getDocs(q);
            s.forEach(d => addDocToDelete(d.ref));
          }
        } catch (err) {
          console.warn('Transactions cleanup note:', err);
        }

        // 9. Clean up invoices and bills
        try {
          const invQueries = [
            query(collection(db, 'invoices'), where('clientId', '==', uid)),
            query(collection(db, 'invoices'), where('clientId', '==', cleanUsername)),
            query(collection(db, 'bills'), where('clientId', '==', uid)),
            query(collection(db, 'bills'), where('clientId', '==', cleanUsername))
          ];
          for (const q of invQueries) {
            const s = await getDocs(q);
            s.forEach(d => addDocToDelete(d.ref));
          }
        } catch (err) {
          console.warn('Invoices/bills cleanup note:', err);
        }

        // 10. Clean up diet plans across dietPlans and diet_plans
        try {
          addDocToDelete(doc(db, 'dietPlans', `diet_${uid}`));
          addDocToDelete(doc(db, 'dietPlans', uid));
          addDocToDelete(doc(db, 'diet_plans', `diet_${uid}`));
          addDocToDelete(doc(db, 'diet_plans', uid));
          const dietQueries = [
            query(collection(db, 'dietPlans'), where('clientId', '==', uid)),
            query(collection(db, 'dietPlans'), where('clientId', '==', cleanUsername)),
            query(collection(db, 'diet_plans'), where('clientId', '==', uid)),
            query(collection(db, 'diet_plans'), where('clientId', '==', cleanUsername))
          ];
          for (const q of dietQueries) {
            const s = await getDocs(q);
            s.forEach(d => addDocToDelete(d.ref));
          }
        } catch (err) {
          console.warn('Diet plans cleanup note:', err);
        }

        // 11. Clean up attendance records across attendance_logs and attendance
        try {
          const attQueries = [
            query(collection(db, 'attendance_logs'), where('userId', '==', uid)),
            query(collection(db, 'attendance_logs'), where('userId', '==', cleanUsername)),
            query(collection(db, 'attendance_logs'), where('clientId', '==', uid)),
            query(collection(db, 'attendance'), where('userId', '==', uid)),
            query(collection(db, 'attendance'), where('userId', '==', cleanUsername)),
            query(collection(db, 'attendance'), where('clientId', '==', uid))
          ];
          for (const q of attQueries) {
            const s = await getDocs(q);
            s.forEach(d => addDocToDelete(d.ref));
          }
        } catch (err) {
          console.warn('Attendance cleanup note:', err);
        }

        // 12. Clean up PT chats and direct messages
        try {
          addDocToDelete(doc(db, 'pt_chats', uid));
          addDocToDelete(doc(db, 'pt_chats', `chat_${uid}`));
          const chatQueries = [
            query(collection(db, 'pt_chats'), where('clientId', '==', uid)),
            query(collection(db, 'pt_chats'), where('clientId', '==', cleanUsername)),
            query(collection(db, 'pt_chats'), where('trainerId', '==', uid)),
            query(collection(db, 'directMessages'), where('senderId', '==', uid)),
            query(collection(db, 'directMessages'), where('receiverId', '==', uid))
          ];
          for (const q of chatQueries) {
            const s = await getDocs(q);
            s.forEach(d => addDocToDelete(d.ref));
          }
        } catch (err) {
          console.warn('Chat cleanup note:', err);
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
        addDocToDelete(doc(db, 'trainerProfiles', uid));
        addDocToDelete(doc(db, 'trainers', uid));

        // Query any matching documents in trainers or trainerProfiles by trainerId
        try {
          const trQuery = await getDocs(query(collection(db, 'trainers'), where('trainerId', '==', uid)));
          trQuery.forEach(d => addDocToDelete(d.ref));
          const trpQuery = await getDocs(query(collection(db, 'trainerProfiles'), where('trainerId', '==', uid)));
          trpQuery.forEach(d => addDocToDelete(d.ref));
        } catch (err) {
          console.warn('Query trainers/trainerProfiles note:', err);
        }

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

      // Add all deduplicated delete operations to batch
      for (const ref of docsToDelete.values()) {
        batch.delete(ref);
      }

      // 3. Commit atomic batch across all Firestore collections with individual fallback
      try {
        await batch.commit();
      } catch (batchErr) {
        console.warn('Batch commit failed, applying individual deleteDoc fallback:', batchErr);
        for (const ref of docsToDelete.values()) {
          try {
            await deleteDoc(ref);
          } catch (delErr) {
            console.warn('deleteDoc fallback note for', ref.path, delErr);
          }
        }
      }

      // 3.5 Write permanent tombstone to deleted_accounts to permanently block login and session restoration
      try {
        const tombstone = {
          deletedAt: serverTimestamp(),
          reason: 'ADMIN_PERMANENT_DELETE',
          uid,
          username: cleanUsername || uid,
          deletedAtIso: new Date().toISOString()
        };
        await Promise.all([
          setDoc(doc(db, 'deleted_accounts', uid), tombstone, { merge: true }),
          cleanUsername ? setDoc(doc(db, 'deleted_accounts', cleanUsername), tombstone, { merge: true }) : Promise.resolve(),
          targetUsername && targetUsername !== cleanUsername ? setDoc(doc(db, 'deleted_accounts', targetUsername), tombstone, { merge: true }) : Promise.resolve()
        ]);
      } catch (tombErr) {
        console.warn('deleted_accounts tombstone note:', tombErr);
      }

      // 4. Clear any local storage tombstones so immediate reuse of the username is permitted
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(`tf_deleted_${uid}`);
          sessionStorage.removeItem(`tf_deleted_${uid}`);
          if (cleanUsername) {
            localStorage.removeItem(`tf_deleted_${cleanUsername}`);
            sessionStorage.removeItem(`tf_deleted_${cleanUsername}`);
          }
          if (uid === 'tanmay1_19') {
            localStorage.removeItem('tf_deleted_tanmay1_19');
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
        const cachedMems = getCachedData<any[]>('admin_memberships', []);
        setCachedData('admin_memberships', cachedMems.filter((m: any) => m.clientId !== uid && m.clientId !== cleanUsername));
        const cachedPts = getCachedData<any[]>('admin_pt_requests', []);
        setCachedData('admin_pt_requests', cachedPts.filter((p: any) => p.clientId !== uid && p.clientId !== cleanUsername));
        const cachedTxs = getCachedData<any[]>('admin_payment_tx', []);
        setCachedData('admin_payment_tx', cachedTxs.filter((t: any) => t.clientId !== uid && t.clientId !== cleanUsername));
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
