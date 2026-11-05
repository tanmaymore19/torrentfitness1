import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DirectMessage } from '../../types';
import {
  getDirectChatId,
  subscribeToDirectChat,
  sendDirectMessage,
  isStaffOwnerOrCoManager,
  playChatNotificationChime
} from '../../services/chatService';
import { uploadMediaOrDataUrl } from '../../services/mediaUploadService';
import {
  Send,
  X,
  Phone,
  MessageSquare,
  Sparkles,
  CheckCheck,
  Clock,
  Shield,
  ShieldAlert,
  ArrowLeft,
  Volume2,
  VolumeX,
  Lock,
  Smile,
  Check,
  Paperclip,
  Image as ImageIcon
} from 'lucide-react';

interface DirectChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: 'client' | 'trainer';
  partnerId: string;
  partnerName: string;
  partnerRole: 'client' | 'trainer';
  partnerPhotoUrl?: string;
  partnerPhone?: string;
  partnerBadge?: string;
}

export const DirectChatModal: React.FC<DirectChatModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  currentUserName,
  currentUserRole,
  partnerId,
  partnerName,
  partnerRole,
  partnerPhotoUrl,
  partnerPhone,
  partnerBadge
}) => {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Manage body class to hide client navigation bar when chat modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('chat-modal-open');
    } else {
      document.body.classList.remove('chat-modal-open');
    }
    return () => {
      document.body.classList.remove('chat-modal-open');
    };
  }, [isOpen]);

  // Role-gating validation: strictly ONLY staff members with Owner (👑) or Co-Manager (🛡️) badge can chat or call with clients
  const isStaffPartnerUnauthorized =
    partnerRole === 'trainer' &&
    !isStaffOwnerOrCoManager({ badge: partnerBadge, trainerId: partnerId });

  const isCurrentTrainerUnauthorized =
    currentUserRole === 'trainer' &&
    !isStaffOwnerOrCoManager({ badge: partnerBadge, trainerId: currentUserId });

  const isRoleGated = isStaffPartnerUnauthorized || isCurrentTrainerUnauthorized;

  // Derive conversation ID (always clientId_trainerId)
  const clientId = currentUserRole === 'client' ? currentUserId : partnerId;
  const trainerId = currentUserRole === 'trainer' ? currentUserId : partnerId;
  const chatId = getDirectChatId(clientId, trainerId);

  // Clean phone number with official fallback: Hitesh Rajput = 8208002585, Bhavesh Rajput = 9607292842
  const resolvedPartnerPhone =
    partnerId.toLowerCase().includes('hitesh') || partnerName.toLowerCase().includes('hitesh')
      ? '8208002585'
      : partnerId.toLowerCase().includes('bhavesh') || partnerName.toLowerCase().includes('bhavesh')
      ? '9607292842'
      : partnerPhone || '8208002585';
  const cleanPhone = resolvedPartnerPhone.replace(/[^\d+]/g, '');

  useEffect(() => {
    if (!isOpen || !chatId || isRoleGated) return;

    // Real-time subscription to messages
    const unsubscribe = subscribeToDirectChat(chatId, (loaded) => {
      if (loaded.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
        const latest = loaded[loaded.length - 1];
        if (latest && latest.senderId !== currentUserId && !isMuted) {
          playChatNotificationChime();
        }
      }
      prevMsgCountRef.current = loaded.length;
      setMessages(loaded);
    });

    return () => unsubscribe();
  }, [isOpen, chatId, isRoleGated, currentUserId, isMuted]);

  useEffect(() => {
    // Auto scroll to bottom when messages update
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input automatically on open
  useEffect(() => {
    if (isOpen && !isRoleGated) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isOpen, isRoleGated]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      await sendDirectMessage({
        chatId,
        senderId: currentUserId,
        senderName: currentUserName,
        senderRole: currentUserRole,
        recipientId: partnerId,
        recipientName: partnerName,
        text
      });
      setInputText('');
      setShowEmojiPicker(false);
    } catch (err: any) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAddEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingMedia(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawDataUrl = reader.result as string;
        const uploadedUrl = await uploadMediaOrDataUrl(rawDataUrl, file.name);
        await sendDirectMessage({
          chatId,
          senderId: currentUserId,
          senderName: currentUserName,
          senderRole: currentUserRole,
          recipientId: partnerId,
          recipientName: partnerName,
          text: `[Photo] ${uploadedUrl}`
        });
      } catch (err: any) {
        console.error('Failed to send media in chat:', err);
      } finally {
        setIsUploadingMedia(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // Quick reply prompt chips
  const clientQuickChips = [
    "Can we review today's workout? 💪",
    "Are you free for PT tomorrow at 6 PM? ⏰",
    "Quick question about my meal plan 🥗",
    "Completed today's full session! 🔥"
  ];

  const trainerQuickChips = [
    "Great job on today's workout! 💥",
    "Reminder: Drink plenty of water today 💧",
    "How is your muscle soreness feeling? ⚡",
    "Updated your tailored workout plan 📋"
  ];

  const quickChips = currentUserRole === 'client' ? clientQuickChips : trainerQuickChips;

  const quickEmojis = ['💪', '🔥', '👍', '🏋️‍♂️', '🥗', '⚡', '🙌', '💯'];

  return createPortal(
    <div className="fixed inset-0 z-[9999] h-[100dvh] flex flex-col justify-between bg-slate-950 w-screen overflow-hidden select-none animate-fade-in text-slate-100">
      {/* 1. STANDALONE FULLSCREEN TOP BAR (WHATSAPP / INSTAGRAM DIRECT STYLE) */}
      <header className="shrink-0 w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-4 py-2.5 flex items-center justify-between z-30 shadow-md">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {/* Back Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 -ml-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition-all active:scale-90"
            title="Back to previous screen"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
          </button>

          {/* Avatar with Active Online Status Pulse */}
          <div className="relative shrink-0">
            <img
              src={
                partnerPhotoUrl ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
              }
              alt={partnerName}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover ring-2 ring-emerald-500/50 shadow-sm border border-slate-700"
            />
            <span
              className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-xs animate-pulse"
              title="Active Online"
            />
          </div>

          {/* Name & Management Credentials */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-xs sm:text-sm font-black text-white truncate max-w-[150px] sm:max-w-[240px]">
                {partnerName}
              </h2>
              {partnerBadge === 'crown' && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <span>👑</span>
                  <span className="hidden sm:inline">Owner</span>
                </span>
              )}
              {partnerBadge === 'shield' && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40">
                  <span>🛡️</span>
                  <span className="hidden sm:inline">Co-Manager</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">Active Online · Torrent Fitness Official</span>
            </div>
          </div>
        </div>

        {/* Top Right Controls (Direct Dialer & Audio Mute) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mute/Unmute Audio Chime */}
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            className={`p-2 rounded-full transition-colors ${
              isMuted
                ? 'text-slate-500 hover:text-slate-300 bg-slate-800'
                : 'text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 border border-indigo-800/50'
            }`}
            title={isMuted ? 'Notification sounds muted' : 'Notification chime active'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Native Phone Dialer (Authorized strictly for Owner & Co-Manager: 8208002585 / 9607292842) */}
          {!isRoleGated && cleanPhone && (
            <a
              href={`tel:${cleanPhone}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-full text-xs font-black shadow-md shadow-emerald-900/30 transition-all border border-emerald-500/50"
              title={`Call ${partnerName} directly via mobile dialer (${cleanPhone})`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Call</span>
            </a>
          )}
        </div>
      </header>

      {/* 2. GATED ACCESS RESTRICTION VIEW */}
      {isRoleGated ? (
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4 bg-slate-900/60 backdrop-blur-md">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-sm">
            <ShieldAlert className="w-8 h-8" strokeWidth={1.8} />
          </div>
          <div className="space-y-2 max-w-sm">
            <h3 className="text-base font-black text-white">
              Direct Communication Policy
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Strict Access Policy: Strictly ONLY staff members holding the official <strong className="text-white">Owner (👑)</strong> or <strong className="text-white">Co-Manager (🛡️)</strong> badge can initiate direct chat channels or phone calls with clients.
            </p>
            <p className="text-[11px] text-slate-400 pt-1">
              General trainers assist members on the gym floor in-person during daily workout hours.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold transition-all shadow-md active:scale-95"
          >
            Return to Dashboard
          </button>
        </div>
      ) : (
        <>
          {/* 3. MESSAGE FEED AREA (FLEX-1 OVERFLOW-Y-AUTO) */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 space-y-2.5 bg-slate-950 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] no-scrollbar">
            {/* End-to-end Privacy Reassurance Pill */}
            <div className="flex justify-center my-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 backdrop-blur-md text-[10px] font-bold text-slate-400 shadow-sm border border-slate-800">
                <Lock className="w-2.5 h-2.5 text-indigo-400" />
                <span>Private Channel with Torrent Fitness Management</span>
              </div>
            </div>

            {messages.length === 0 ? (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-14 h-14 rounded-3xl bg-indigo-950/80 border border-indigo-800/60 text-indigo-400 flex items-center justify-center shadow-md">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-white">Direct Management Chat</h4>
                  <p className="text-xs text-slate-400 max-w-xs leading-relaxed font-medium">
                    Send a message directly to Torrent Fitness leadership for PT schedules, workout queries, or membership support.
                  </p>
                </div>
                {cleanPhone && (
                  <a
                    href={`tel:${cleanPhone}`}
                    className="mt-2 px-4 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all active:scale-95"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Call Directly: {cleanPhone}</span>
                  </a>
                )}
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.senderId === currentUserId;
                const isPhoto = msg.text.startsWith('[Photo] ');
                const photoUrl = isPhoto ? msg.text.replace('[Photo] ', '').trim() : '';
                const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 text-xs sm:text-[13px] leading-relaxed shadow-md transition-all ${
                        isMine
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-xs shadow-indigo-600/20'
                          : 'bg-slate-900 text-slate-100 rounded-tl-xs border border-slate-800 shadow-sm'
                      }`}
                    >
                      {isPhoto ? (
                        <div className="space-y-1.5">
                          <img
                            src={photoUrl}
                            alt="Attachment"
                            className="rounded-xl max-h-60 w-auto object-cover border border-white/10"
                          />
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      )}
                      <div
                        className={`flex items-center justify-end gap-1 text-[10px] mt-1 font-mono ${
                          isMine ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      >
                        <Clock className="w-2.5 h-2.5 opacity-70" />
                        <span>{timeStr}</span>
                        {isMine && <CheckCheck className="w-3.5 h-3.5 text-indigo-200 ml-0.5" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 4. DEDICATED INPUT CONTAINER (STICKY BOTTOM-0 Z-30 BG-SLATE-900/90 BACKDROP-BLUR-MD) */}
          <footer className="sticky bottom-0 z-30 shrink-0 w-full bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 space-y-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
            {/* Quick Suggestion Prompt Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1 shrink-0 ml-0.5">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                Prompt:
              </span>
              {quickChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(chip)}
                  className="text-[11px] px-3 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white font-semibold rounded-full border border-slate-700 hover:border-indigo-500/60 transition-all whitespace-nowrap shadow-xs shrink-0"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Quick Emoji Picker Strip (Collapsible) */}
            {showEmojiPicker && (
              <div className="flex items-center gap-2 p-2 bg-slate-800/95 rounded-xl border border-slate-700 animate-fade-in overflow-x-auto no-scrollbar">
                {quickEmojis.map((e, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAddEmoji(e)}
                    className="p-1.5 text-base hover:scale-125 transition-transform"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}

            {/* Dedicated Input Form with Attachment, Text Input & Prominent Send Button */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAttachFile}
              />

              {/* Attachment / Media Icon Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingMedia || isSending}
                className="p-2.5 sm:p-3 bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-all shrink-0 flex items-center justify-center disabled:opacity-50"
                title="Attach photo or media"
              >
                <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Quick Emoji Toggle Button */}
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                className={`p-2.5 sm:p-3 rounded-xl border transition-all shrink-0 flex items-center justify-center ${
                  showEmojiPicker
                    ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300'
                    : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-400 border-slate-700'
                }`}
                title="Quick emojis"
              >
                <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Expanding Text Input */}
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                className="flex-1 min-w-0 px-4 py-2.5 sm:py-3 bg-slate-800/90 text-white placeholder-slate-400 border border-slate-700 focus:border-indigo-500 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all shadow-inner"
              />

              {/* Prominent Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || isSending || isUploadingMedia}
                className="px-4 py-2.5 sm:py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0 active:scale-95 transition-all"
                title="Send Message"
              >
                <Send className="w-4 h-4" />
                <span className="text-xs font-black">Send</span>
              </button>
            </form>
          </footer>
        </>
      )}
    </div>,
    document.body
  );
};
