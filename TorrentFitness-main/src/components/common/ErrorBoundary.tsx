import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Trash2, Copy, Check } from 'lucide-react';
import { GymLogo } from './GymLogo';
import { copyToClipboard } from '../../utils/clipboard';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Global ErrorBoundary caught an error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetSession = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('torrent_fitness_user_session');
        localStorage.removeItem('auth_user');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('torrent_fitness_user_session');
        sessionStorage.removeItem('auth_user');
      }
    } catch (e) {
      console.warn('Failed clearing storages:', e);
    }
    window.location.href = '/';
  };

  private handleCopyDetails = () => {
    const text = `Torrent Fitness Crash Report\nError: ${this.state.error?.message || 'Unknown'}\nStack: ${this.state.error?.stack || ''}\nComponent Stack: ${this.state.errorInfo?.componentStack || ''}`;
    copyToClipboard(text).then((success) => {
      if (success) {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      }
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-800/90 border border-slate-700/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center">
            {/* Ambient background glow */}
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-4">
                <GymLogo size="lg" showGlow />
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-3">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Application Runtime Protection</span>
              </div>

              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                TORRENT FITNESS
              </h1>
              <p className="text-sm text-slate-300 mt-2 font-medium">
                An unexpected issue interrupted this view. Your account and records are safe.
              </p>

              {/* Error summary */}
              {this.state.error && (
                <div className="w-full mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-left font-mono text-xs text-rose-300 overflow-x-auto max-h-32">
                  <span className="font-bold text-rose-400">Error:</span> {this.state.error.message || 'Unknown runtime error'}
                </div>
              )}

              {/* Action buttons */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white text-sm font-bold rounded-xl transition shadow-lg shadow-indigo-600/30"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reload Page
                </button>
                <button
                  type="button"
                  onClick={this.handleResetSession}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-700/70 hover:bg-slate-700 active:scale-98 text-slate-200 text-sm font-bold rounded-xl transition border border-slate-600"
                >
                  <Trash2 className="w-4 h-4" />
                  Reset & Restart
                </button>
              </div>

              {/* Copy logs and toggle details */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={this.handleCopyDetails}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  {this.state.copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Copied details to clipboard</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy technical details</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition"
                >
                  <span>{this.state.showDetails ? 'Hide Stack Trace' : 'Show Diagnostic Trace'}</span>
                </button>
              </div>

              {/* Collapsible Diagnostic Trace for mobile debugging */}
              {this.state.showDetails && (
                <div className="w-full mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-left font-mono text-[10px] text-slate-400 overflow-x-auto max-h-48 whitespace-pre-wrap">
                  <div className="font-bold text-rose-400 mb-1">Stack Trace:</div>
                  {this.state.error?.stack || 'No stack trace available'}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      <div className="font-bold text-indigo-400 mt-2 mb-1">Component Stack:</div>
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
