import React, { useEffect } from 'react';
import { LogOut, X, AlertTriangle } from 'lucide-react';

interface LogoutConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export const LogoutConfirmationModal: React.FC<LogoutConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in"
      aria-modal="true"
      role="dialog"
      aria-labelledby="logout-dialog-title"
    >
      <div className="relative w-full max-w-sm rounded-3xl p-6 bg-white border border-slate-200/90 shadow-2xl text-slate-800 text-center animate-scale-up overflow-hidden">
        {/* Subtle Ambient Accent */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button Top-Right */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          aria-label="Close dialog"
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Warning Icon Badge */}
        <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center shadow-inner text-rose-600">
          <LogOut className="w-7 h-7" strokeWidth={2} />
        </div>

        {/* Dialog Title */}
        <h3 id="logout-dialog-title" className="text-lg font-black text-slate-900 tracking-tight">
          Confirm Logout
        </h3>

        {/* Dialog Message */}
        <p className="text-xs text-slate-600 mt-2 font-medium leading-relaxed max-w-[280px] mx-auto">
          Are you sure you want to sign out of your Torrent Fitness account?
        </p>

        <p className="text-[11px] text-slate-400 mt-1 font-semibold">
          Your saved profile, workouts, and attendance records will remain secure.
        </p>

        {/* 2-Step Action Buttons */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 text-xs font-bold rounded-2xl transition-all shadow-xs disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 active:scale-[0.98] text-white text-xs font-bold rounded-2xl shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing out...
              </span>
            ) : (
              <span>Yes, Logout</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
