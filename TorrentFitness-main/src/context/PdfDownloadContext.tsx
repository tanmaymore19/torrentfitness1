import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { FileText, Download, CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';

export interface RequestPdfDownloadOptions {
  portalType?: 'admin' | 'client';
  documentName?: string;
  customTitle?: string;
  customMessage?: string;
  onConfirm: () => Promise<boolean | void>;
}

interface PdfDownloadContextType {
  requestPdfDownload: (options: RequestPdfDownloadOptions) => void;
  showDownloadCompleteNotice: (message?: string) => void;
  showDownloadFailedNotice: (message?: string) => void;
}

const PdfDownloadContext = createContext<PdfDownloadContextType | undefined>(undefined);

export const usePdfDownload = (): PdfDownloadContextType => {
  const context = useContext(PdfDownloadContext);
  if (!context) {
    throw new Error('usePdfDownload must be used within a PdfDownloadProvider');
  }
  return context;
};

export const PdfDownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Confirmation Modal State
  const [activeRequest, setActiveRequest] = useState<RequestPdfDownloadOptions | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Feedback Notification States
  const [showSuccessToast, setShowSuccessToast] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>(
    'Your PDF document has been downloaded successfully to your device.'
  );

  const [showErrorToast, setShowErrorToast] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('Download Failed. Please try again.');

  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  const showDownloadCompleteNotice = useCallback(
    (customMsg?: string) => {
      clearTimers();
      setShowErrorToast(false);
      setSuccessMessage(
        customMsg || 'Your PDF document has been downloaded successfully to your device.'
      );
      setShowSuccessToast(true);

      // Auto dismiss after 3.5 seconds (strictly 3-4s requirement)
      successTimerRef.current = setTimeout(() => {
        setShowSuccessToast(false);
      }, 3500);
    },
    [clearTimers]
  );

  const showDownloadFailedNotice = useCallback(
    (customMsg?: string) => {
      clearTimers();
      setShowSuccessToast(false);
      setErrorMessage(customMsg || 'Download Failed. Please try again.');
      setShowErrorToast(true);

      errorTimerRef.current = setTimeout(() => {
        setShowErrorToast(false);
      }, 4000);
    },
    [clearTimers]
  );

  const requestPdfDownload = useCallback(
    (options: RequestPdfDownloadOptions) => {
      setActiveRequest(options);
      setIsGenerating(false);
    },
    []
  );

  const handleCancelModal = () => {
    if (isGenerating) return;
    setActiveRequest(null);
  };

  const handleConfirmDownload = async () => {
    if (!activeRequest || isGenerating) return;
    setIsGenerating(true);

    try {
      const result = await activeRequest.onConfirm();
      // If the function explicitly returned false, treat as failure
      if (result === false) {
        setActiveRequest(null);
        setIsGenerating(false);
        showDownloadFailedNotice();
        return;
      }

      // Success! Close confirmation modal and display success feedback popup
      setActiveRequest(null);
      setIsGenerating(false);
      showDownloadCompleteNotice();
    } catch (err: any) {
      console.error('PDF Download failed:', err);
      setActiveRequest(null);
      setIsGenerating(false);
      showDownloadFailedNotice(err?.message ? `⚠️ ${err.message}` : undefined);
    }
  };

  // Determine modal labels based on client vs admin
  const isClient = activeRequest?.portalType === 'client';
  const modalTitle = activeRequest?.customTitle || (isClient ? 'Download Invoice' : 'Confirm PDF Download');
  const modalMessage =
    activeRequest?.customMessage ||
    (isClient
      ? 'Do you want to download the official payment receipt for this transaction?'
      : `Are you sure you want to download and export this ${
          activeRequest?.documentName || 'Document / Report'
        } as a PDF?`);
  const confirmButtonLabel = isClient ? 'Yes, Download' : 'Download';

  return (
    <PdfDownloadContext.Provider
      value={{
        requestPdfDownload,
        showDownloadCompleteNotice,
        showDownloadFailedNotice
      }}
    >
      {children}

      {/* 2-Step Confirmation Modal */}
      {activeRequest && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in"
        >
          <div
            className={`w-full max-w-md overflow-hidden transform transition-all animate-scale-up ${
              isClient
                ? 'vision-surface border border-white/80 rounded-3xl shadow-2xl p-6 text-slate-800'
                : 'bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 text-slate-800'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-start gap-3.5 mb-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  isClient
                    ? 'bg-gradient-to-tr from-indigo-500 to-sky-400 text-white shadow-md shadow-indigo-200'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                }`}
              >
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <h3 className="text-lg font-black tracking-tight text-slate-900">
                  {modalTitle}
                </h3>
                {activeRequest.documentName && (
                  <p className="text-xs font-semibold text-indigo-600 mt-0.5 truncate">
                    {activeRequest.documentName}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleCancelModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mb-6">
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                {modalMessage}
              </p>
            </div>

            {/* Modal Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleCancelModal}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleConfirmDownload}
                className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-60 ${
                  isClient
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 shadow-indigo-200 active:scale-98'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 active:scale-98'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>{confirmButtonLabel}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Download Complete ✅" Post-Download Pop-Up (Auto-dismisses in 3-4s, with manual close) */}
      {showSuccessToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[10001] w-full max-w-md px-4 pointer-events-none animate-slide-down"
        >
          <div className="pointer-events-auto bg-slate-900/95 text-white p-4 rounded-2xl shadow-2xl border border-emerald-500/40 backdrop-blur-xl flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5">
                Download Complete ✅
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 font-medium leading-relaxed">
                {successMessage}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowSuccessToast(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error Toast Notification: "⚠️ Download Failed. Please try again." */}
      {showErrorToast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[10001] w-full max-w-md px-4 pointer-events-none animate-slide-down"
        >
          <div className="pointer-events-auto bg-rose-950/95 text-white p-4 rounded-2xl shadow-2xl border border-rose-500/40 backdrop-blur-xl flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="text-sm font-black text-rose-200 tracking-tight flex items-center gap-1.5">
                ⚠️ Download Failed
              </h4>
              <p className="text-xs text-rose-300/90 mt-0.5 font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowErrorToast(false)}
              className="text-rose-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              aria-label="Dismiss error notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </PdfDownloadContext.Provider>
  );
};
