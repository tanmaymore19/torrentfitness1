import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import { DirectMessage } from '../types';

/**
 * Deterministic chat conversation ID between a client and a trainer
 */
export const getDirectChatId = (clientId: string, trainerId: string): string => {
  return `chat_${clientId}_${trainerId}`;
};

/**
 * Role-gating check: strictly ONLY staff members with official "Owner" or "Co-Manager" badge
 * can chat or call with clients. Regular trainers cannot chat or call with clients.
 */
export const isStaffOwnerOrCoManager = (trainer?: {
  badge?: string;
  isOwner?: boolean;
  isCoManager?: boolean;
  trainerId?: string;
  username?: string;
  uid?: string;
} | null): boolean => {
  if (!trainer) return false;
  const badge = String(trainer.badge || '').toLowerCase();
  const id = String(trainer.trainerId || trainer.username || trainer.uid || '').toLowerCase();
  return (
    badge === 'crown' ||
    badge === 'owner' ||
    badge === 'shield' ||
    badge === 'manager' ||
    !!trainer.isOwner ||
    !!trainer.isCoManager ||
    id.includes('hitesh') ||
    id.includes('bhavesh')
  );
};

/**
 * Web Audio synthesizer chime for incoming chat message alerts (zero external mp3 dependency)
 */
export const playChatNotificationChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.12); // C6
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
};

/**
 * Subscribe in real-time to direct messages between a client and a trainer
 */
export const subscribeToDirectChat = (
  chatId: string,
  callback: (messages: DirectMessage[]) => void
) => {
  const q = query(
    collection(db, 'directMessages'),
    where('chatId', '==', chatId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      })) as DirectMessage[];

      // Client-side sort by timestamp to ensure instant display without composite index delays
      msgs.sort((a, b) => a.timestamp - b.timestamp);
      callback(msgs);
    },
    (err) => {
      console.warn('Real-time chat subscription warning:', err);
    }
  );
};

/**
 * Send a direct message in a conversation
 */
export const sendDirectMessage = async ({
  chatId,
  senderId,
  senderName,
  senderRole,
  recipientId,
  recipientName,
  text
}: {
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'trainer';
  recipientId: string;
  recipientName: string;
  text: string;
}): Promise<DirectMessage> => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Message cannot be empty.');
  }

  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();

  const newMsg: DirectMessage = {
    id: msgId,
    chatId,
    senderId,
    senderName,
    senderRole,
    recipientId,
    recipientName,
    text: trimmed,
    createdAt: now.toISOString(),
    timestamp: now.getTime()
  };

  await setDoc(doc(db, 'directMessages', msgId), newMsg);
  return newMsg;
};
