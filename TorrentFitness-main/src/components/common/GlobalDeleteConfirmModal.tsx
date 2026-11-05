import React, { useState } from 'react';
import { AlertTriangle, Trash2, Loader2, X } from 'lucide-react';

export interface GlobalDeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  itemName: string;
  itemType?: string;
  description?: string;
  warningText?: string;
  warningNote?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export const GlobalDeleteConfirmModal: React.FC<GlobalDeleteConfirmModalProps> = ({
  isOpen,
  title,
  itemName,
  itemType = 'Record',
  description = 'This action will permanently remove this item and sync changes across all connected portals immediately.',
  warningText,
  warningNote,
  confirmLabel = 'Yes, Delete Permanently',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose
}) => {
  const effectiveWarningText =
    warningText || warningNote || 'Irreversible action: Once deleted, this record cannot be recovered.';
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete item. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md vision-surface bg-white/95 border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 shadow-2xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                Mandatory Delete Confirmation
              </span>
              <h3 className="text-base font-black text-slate-900 mt-1">{title}</h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Summary Box */}
        <div className="p-3.5 bg-slate-50/95 rounded-2xl border border-slate-200/90 space-y-1.5 text-xs shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 font-semibold">Target {itemType}:</span>
            <strong className="text-slate-900 font-black text-right">{itemName}</strong>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 font-semibold">Action Scope:</span>
            <span className="text-rose-700 font-bold uppercase text-[10px]">
              Permanent Removal &amp; Live State Sync
            </span>
          </div>
        </div>

        {/* Warning Notice */}
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-900 font-medium leading-relaxed">
          ⚠️ <strong>Warning:</strong> {effectiveWarningText}
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-100 border border-rose-300 text-xs font-bold text-rose-900">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 pt-2 border-t border-slate-200/80">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors border border-slate-200"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleConfirm}
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
                <span>{confirmLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
