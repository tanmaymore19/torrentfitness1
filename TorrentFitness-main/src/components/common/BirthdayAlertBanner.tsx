import React, { useState, useMemo } from 'react';
import { ClientProfile, UserAccount } from '../../types';
import { Cake, MessageCircle, Eye, X, Sparkles, Check } from 'lucide-react';
import { db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';

interface BirthdayAlertBannerProps {
  clients: ClientProfile[];
  users?: UserAccount[];
  viewerRole: 'admin' | 'trainer' | 'client';
  viewerName?: string;
  viewerId?: string;
  onViewProfile?: (client: ClientProfile) => void;
}

/**
 * Checks whether a DOB string (YYYY-MM-DD, DD-MM-YYYY, or DD/MM/YYYY)
 * matches today's local month and day.
 */
export function isMemberBirthdayToday(dob?: string): boolean {
  if (!dob || typeof dob !== 'string') return false;
  const trimmed = dob.trim();
  if (!trimmed) return false;

  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1 - 12
  const currentDay = today.getDate(); // 1 - 31

  // Match YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    return month === currentMonth && day === currentDay;
  }

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    return month === currentMonth && day === currentDay;
  }

  // Fallback Date parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.getMonth() + 1 === currentMonth && parsed.getDate() === currentDay;
  }

  return false;
}

export const BirthdayAlertBanner: React.FC<BirthdayAlertBannerProps> = ({
  clients,
  users = [],
  viewerRole,
  viewerName = 'Torrent Fitness Team',
  viewerId = 'admin',
  onViewProfile
}) => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const todayKey = new Date().toISOString().split('T')[0];
      return sessionStorage.getItem(`tf_bday_dismissed_${viewerRole}_${todayKey}`) === 'true';
    } catch {
      return false;
    }
  });

  const [wishSentMap, setWishSentMap] = useState<Record<string, boolean>>({});

  // Strictly visible ONLY to Admins and Trainers
  if (viewerRole !== 'admin' && viewerRole !== 'trainer') {
    return null;
  }

  const birthdayMembers = useMemo(() => {
    return clients
      .filter((client) => {
        if (client.isSelfDeleted) return false;
        const linkedUser = users.find(
          (u) => u.uid === client.userId || u.username === client.userId
        );
        if (linkedUser?.isSelfDeleted) return false;
        const dob = client.dob || linkedUser?.dob;
        return isMemberBirthdayToday(dob);
      })
      .map((client) => {
        const linkedUser = users.find(
          (u) => u.uid === client.userId || u.username === client.userId
        );
        return {
          ...client,
          dob: client.dob || linkedUser?.dob,
          phone: client.phone || linkedUser?.phone || ''
        };
      });
  }, [clients, users]);

  // If no member has a birthday today or banner was dismissed for the session, render nothing
  if (dismissed || birthdayMembers.length === 0) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      const todayKey = new Date().toISOString().split('T')[0];
      sessionStorage.setItem(`tf_bday_dismissed_${viewerRole}_${todayKey}`, 'true');
    } catch {
      // Ignore storage errors
    }
  };

  const handleSendInAppWish = async (member: ClientProfile) => {
    try {
      const chatId =
        viewerRole === 'trainer' && viewerId
          ? `${viewerId}_${member.userId}`
          : `bday_${member.userId}_${Date.now()}`;
      const msgId = `msg_${Date.now()}`;
      await setDoc(doc(db, 'directMessages', msgId), {
        id: msgId,
        chatId,
        senderId: viewerId,
        senderName: viewerName,
        senderRole: viewerRole,
        receiverId: member.userId,
        text: `🎉 Happy Birthday ${member.displayName}! Wishing you an incredible year and a powerhouse workout today from ${viewerName} at Torrent Fitness! 💪🎂`,
        createdAt: new Date().toISOString()
      });
      setWishSentMap((prev) => ({ ...prev, [member.userId]: true }));
    } catch {
      setWishSentMap((prev) => ({ ...prev, [member.userId]: true }));
    }
  };

  const buildWhatsAppHref = (member: ClientProfile & { phone?: string }) => {
    const rawPhone = (member.phone || '').replace(/[^0-9]/g, '');
    const formattedPhone =
      rawPhone.length === 10 ? `91${rawPhone}` : rawPhone.length > 0 ? rawPhone : '';
    const message = encodeURIComponent(
      `🎉 Happy Birthday ${member.displayName}! Wishing you great health, strength, and an awesome workout today! — ${viewerName}, Torrent Fitness 💪🎂`
    );
    return formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${message}`
      : `https://wa.me/?text=${message}`;
  };

  const namesList = birthdayMembers.map((m) => m.displayName).join(', ');

  return (
    <div
      role="region"
      aria-label="Today's Member Birthday Alert"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-50/95 via-white/95 to-orange-50/90 backdrop-blur-2xl border border-amber-300/80 p-4 sm:p-5 shadow-[0_14px_34px_-10px_rgba(245,158,11,0.18),inset_0_1px_2px_rgba(255,255,255,0.95)] animate-fade-in"
    >
      {/* Subtle Ambient Celebratory Glow */}
      <div className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full bg-amber-300/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-orange-300/15 blur-2xl" />

      <div className="relative z-10 flex flex-col gap-3.5">
        {/* Top Row: Celebratory Header + Dismiss (X) */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0 border border-white/70">
              <Cake className="w-5 h-5" strokeWidth={2} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Celebration Alert</span>
                <span aria-hidden="true">·</span>
                <span>
                  {birthdayMembers.length === 1
                    ? '1 Member Birthday Today'
                    : `${birthdayMembers.length} Member Birthdays Today`}
                </span>
              </div>

              <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-snug mt-0.5">
                🎉 Today&apos;s Birthdays: <span className="text-amber-900">{namesList}</span> — Wish them a great workout!
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-xl bg-white/80 hover:bg-amber-100/80 text-slate-500 hover:text-slate-800 border border-amber-200/80 transition-colors shrink-0 shadow-2xs"
            title="Dismiss birthday alert for this session"
            aria-label="Dismiss birthday alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Member Row(s) with Avatar & Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          {birthdayMembers.map((member) => {
            const isWishSent = !!wishSentMap[member.userId];
            return (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-3 p-2.5 sm:px-3.5 sm:py-2.5 rounded-2xl bg-white/90 border border-amber-200/80 shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={
                      member.photoUrl ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
                    }
                    alt={member.displayName}
                    className="w-9 h-9 rounded-xl object-cover border border-amber-300 shadow-2xs shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-black text-slate-900 truncate">
                      {member.displayName}
                    </p>
                    <p className="text-[11px] font-medium text-slate-600 truncate">
                      {member.membershipPlanName || 'Gym Member'}
                      {member.age ? ` · Turning ${member.age}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={buildWhatsAppHref(member)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleSendInAppWish(member)}
                    className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-xs"
                    title={`Send Birthday Wish to ${member.displayName} on WhatsApp`}
                  >
                    {isWishSent ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Wished</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Send Wish / WhatsApp</span>
                      </>
                    )}
                  </a>

                  {onViewProfile && (
                    <button
                      type="button"
                      onClick={() => onViewProfile(member)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 border border-slate-200/90 text-[11px] font-bold transition-colors flex items-center gap-1"
                      title={`View ${member.displayName}'s Profile`}
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-700" />
                      <span className="hidden sm:inline">View Profile</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
