import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Dumbbell, Bell } from 'lucide-react';
import { GymLogo } from './GymLogo';

interface HeaderProps {
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
  isProfileActive?: boolean;
  activeAnnouncementCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNotifications,
  onOpenProfile,
  isProfileActive = false,
  activeAnnouncementCount = 0
}) => {
  const { currentUser, trainerProfile } = useAuth();

  const getTrainerBadge = () => {
    if (trainerProfile?.badge) return trainerProfile.badge;
    if (currentUser?.uid.includes('hitesh')) return 'crown';
    if (currentUser?.uid.includes('bhavesh')) return 'shield';
    return 'none';
  };

  return (
    <header className="shrink-0 sticky top-0 z-40 w-full bg-[#EEF2F6]/95 backdrop-blur-md px-4 pt-3 pb-2 border-b border-slate-200/80 shadow-xs">
      <div className="w-full flex items-center justify-between">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 select-none">
          <GymLogo size="md" />
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-black tracking-tight text-slate-800 leading-none">
                TORRENT <span className="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent font-black">FITNESS</span>
              </h1>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mt-1">
              BE MORE DO MORE
            </p>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-2">
          {currentUser && (
            <>
              {/* Notification icon with dynamic numerical counter badge */}
              {onOpenNotifications && (
                <button
                  type="button"
                  onClick={onOpenNotifications}
                  className="relative p-2 text-slate-600 hover:text-indigo-600 rounded-xl transition-all vision-card cursor-pointer"
                  title="Gym Announcements & Notices"
                  aria-label={`Gym Announcements (${activeAnnouncementCount} unread)`}
                >
                  <Bell className="w-4 h-4" strokeWidth={2} />
                  {activeAnnouncementCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-rose-600 to-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white shadow-sm shadow-rose-600/30 animate-scale-up">
                      {activeAnnouncementCount > 9 ? '9+' : activeAnnouncementCount}
                    </span>
                  )}
                </button>
              )}

              {/* User Avatar & Badge (Interactive - opens User Profile & Settings) */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200/80">
                <button
                  type="button"
                  onClick={onOpenProfile}
                  title="Open User Profile & Account Settings"
                  aria-label="Open User Profile & Account Settings"
                  className={`relative p-0.5 rounded-full transition-all group focus:outline-none ${
                    onOpenProfile ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
                  } ${
                    isProfileActive
                      ? 'ring-2 ring-indigo-600 shadow-[0_0_12px_rgba(99,102,241,0.35)]'
                      : 'hover:ring-2 hover:ring-indigo-400/60'
                  }`}
                >
                  <img
                    src={
                      currentUser.photoUrl ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
                    }
                    alt={currentUser.displayName}
                    className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm ring-1 ring-slate-200"
                  />
                  {currentUser.role === 'trainer' && (
                    <span className="absolute -bottom-1 -right-1 text-xs">
                      {getTrainerBadge() === 'crown' ? '👑' : getTrainerBadge() === 'shield' ? '🛡️' : '💪'}
                    </span>
                  )}
                  {currentUser.role === 'admin' && (
                    <span className="absolute -bottom-1 -right-1 text-[9px] bg-gradient-to-r from-indigo-500 to-sky-400 text-white font-bold rounded-full px-1 border border-white/40 shadow-xs">
                      ADM
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
