import React from 'react';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface TrainerIdentityBadgeProps {
  badge?: 'crown' | 'shield' | 'none' | 'owner' | 'manager' | 'trainer' | string;
  showLabel?: boolean;
}

export const TrainerIdentityBadge: React.FC<TrainerIdentityBadgeProps> = ({
  badge = 'none',
  showLabel = true
}) => {
  const normalized = (badge || 'none').toLowerCase().trim();

  if (normalized === 'crown' || normalized === 'owner') {
    return (
      <span
        title="Gym Owner & Head Coach"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-xs"
      >
        <span className="text-sm">👑</span>
        {showLabel && <span>Owner / Coach</span>}
      </span>
    );
  }

  if (normalized === 'shield' || normalized === 'manager') {
    return (
      <span
        title="Co-Manager & Senior Trainer"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-xs"
      >
        <span className="text-sm">🛡️</span>
        {showLabel && <span>Co-Manager / Coach</span>}
      </span>
    );
  }

  if (normalized === 'trainer') {
    return (
      <span
        title="Verified Gym Coach"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs"
      >
        <span className="text-sm">🏋️</span>
        {showLabel && <span>Verified Coach</span>}
      </span>
    );
  }

  return null;
};

interface StatusPillProps {
  status?: 'active' | 'inactive' | 'pending' | 'pending_verification' | 'expired' | 'rejected' | string;
  type?: 'membership' | 'trainer' | 'pt';
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const norm = (status || 'inactive').toLowerCase();
  switch (norm) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Active
        </span>
      );
    case 'pending':
    case 'pending_verification':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Pending
        </span>
      );
    case 'inactive':
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
          Inactive
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          Rejected
        </span>
      );
    default:
      return null;
  }
};
