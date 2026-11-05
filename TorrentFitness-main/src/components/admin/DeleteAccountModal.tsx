import React, { useState } from 'react';
import { db } from '../../firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

export interface DeleteAccountTarget {
  uid: string;
  displayName: string;
  role: 'client' | 'trainer' | 'admin' | string;
  email?: string;
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !target) return null;

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      const uid = target.uid;

      if (target.role === 'admin' || uid === 'admintorrentfitness1' || uid === 'admin' || uid.includes('hitesh')) {
        setErrorMsg('The Master Admin / Owner account cannot be deleted.');
        setIsDeleting(false);
        return;
      }

      // 1. Delete from users collection
      await deleteDoc(doc(db, 'users', uid));

      // 2. Delete role-specific profile collection
      if (target.role === 'client') {
        await deleteDoc(doc(db, 'clientProfiles', uid));
      } else if (target.role === 'trainer') {
        await deleteDoc(doc(db, 'trainerProfiles', uid));
      }

      onDeleted(uid);
      onClose();
    } catch (err: any) {
      setErrorMsg('Error deleting account: ' + (err.message || 'Please try again.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-5">
        {/* Header Icon & Title */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 shadow-2xs">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">
              Are you sure you want to delete this account?
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              This will permanently delete all records, fitness profiles, and authentication credentials for this user.
            </p>
          </div>
        </div>

        {/* Account Summary Banner */}
        <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs shadow-2xs">
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

        <p className="text-[11px] text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200 shadow-2xs">
          ⚠️ <strong>Irreversible action:</strong> The member or trainer will no longer be able to log in, and all associated personal data will be erased immediately.
        </p>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-100 border border-rose-300 text-xs font-bold text-rose-900">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons: Yes / No */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-slate-200 shadow-2xs"
          >
            No
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleConfirmDelete}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Yes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
