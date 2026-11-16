import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  increment,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { DirectMessage } from '../types';

export interface PtChatSummary {
  chatId: string;
  trainerId: string;
  clientId: string;
  trainerName?: string;
  clientName?: string;
  lastMessageText?: string;
  lastMessageTime?: any;
  lastSenderRole?: 'TRAINER' | 'CLIENT';
  unreadForTrainer?: number;
  unreadForClient?: number;
}

/**
 * Deterministic chat conversation ID between a trainer and a client
 * Format strictly: `${trainerId}_${clientId}`
 */
export const getPtChatId = (trainerId: string, clientId: string): string => {
  const cleanTrainer = (trainerId || '').trim();
  const cleanClient = (clientId || '').trim();
  return `${cleanTrainer}_${cleanClient}`;
};

/**
 * Legacy alias mapping to standard format
 */
export const getDirectChatId = (clientId: string, trainerId: string): string => {
  return getPtChatId(trainerId, clientId);
};

/**
 * Role-gating removed as per Task 2 requirements:
 * All certified personal trainers and clients have full 2-way live chat access.
 */
export const isStaffOwnerOrCoManager = (_trainer?: any): boolean => {
  return true;
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
 * Subscribe in real-time to direct messages between a trainer and client under:
 * pt_chats/{chatId}/messages
 */
export const subscribeToPtChatMessages = (
  chatId: string,
  callback: (messages: DirectMessage[]) => void
) => {
  if (!chatId) return () => {};

  const messagesCol = collection(db, 'pt_chats', chatId, 'messages');

  return onSnapshot(
    messagesCol,
    (snapshot) => {
      const msgs = snapshot.docs.map((d) => {
        const data = d.data();
        let ts = data.timestamp;
        if (!ts && data.createdAt) {
          if (typeof data.createdAt.toMillis === 'function') {
            ts = data.createdAt.toMillis();
          } else if (typeof data.createdAt === 'string') {
            ts = new Date(data.createdAt).getTime();
          }
        }
        return {
          id: d.id,
          chatId,
          senderId: data.senderId || '',
          senderName: data.senderName || '',
          senderRole: (data.senderRole || 'client').toLowerCase() as 'client' | 'trainer',
          recipientId: data.recipientId || '',
          recipientName: data.recipientName || '',
          text: data.text || '',
          mediaUrl: data.mediaUrl || '',
          createdAt: data.createdAt || new Date().toISOString(),
          timestamp: ts || Date.now(),
          readByRecipient: !!data.readByRecipient
        } as DirectMessage;
      });

      msgs.sort((a, b) => a.timestamp - b.timestamp);
      callback(msgs);
    },
    (err) => {
      console.warn('Real-time PT chat subscription warning:', err);
    }
  );
};

/**
 * Alias for subscribeToPtChatMessages
 */
export const subscribeToDirectChat = (
  chatId: string,
  callback: (messages: DirectMessage[]) => void
) => {
  return subscribeToPtChatMessages(chatId, callback);
};

/**
 * Send a direct message in a conversation under pt_chats/{chatId}/messages/{msgId}
 * and atomically updates parent pt_chats/{chatId} with unread counters.
 */
export const sendPtChatMessage = async ({
  chatId,
  trainerId,
  clientId,
  senderId,
  senderName,
  senderRole,
  recipientId,
  recipientName,
  text,
  mediaUrl
}: {
  chatId: string;
  trainerId?: string;
  clientId?: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'trainer' | 'CLIENT' | 'TRAINER';
  recipientId: string;
  recipientName: string;
  text: string;
  mediaUrl?: string;
}): Promise<DirectMessage> => {
  const trimmed = text.trim();
  if (!trimmed && !mediaUrl) {
    throw new Error('Message cannot be empty.');
  }

  const roleNormalized = senderRole.toLowerCase() === 'trainer' ? 'TRAINER' : 'CLIENT';
  const roleSmall = roleNormalized.toLowerCase() as 'client' | 'trainer';

  // Extract trainer and client ids if not provided
  let effectiveTrainerId = trainerId;
  let effectiveClientId = clientId;

  if (!effectiveTrainerId || !effectiveClientId) {
    const parts = chatId.split('_');
    if (parts.length >= 2) {
      effectiveTrainerId = effectiveTrainerId || parts[0];
      effectiveClientId = effectiveClientId || parts.slice(1).join('_');
    } else {
      if (roleNormalized === 'TRAINER') {
        effectiveTrainerId = senderId;
        effectiveClientId = recipientId;
      } else {
        effectiveClientId = senderId;
        effectiveTrainerId = recipientId;
      }
    }
  }

  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowMs = Date.now();

  const newMsgData = {
    id: msgId,
    chatId,
    senderId,
    senderName,
    senderRole: roleNormalized,
    recipientId,
    recipientName: recipientName || '',
    text: trimmed,
    mediaUrl: mediaUrl || '',
    createdAt: serverTimestamp(),
    timestamp: nowMs,
    readByRecipient: false
  };

  // 1. Write the message document
  await setDoc(doc(db, 'pt_chats', chatId, 'messages', msgId), newMsgData);

  // 2. Update parent conversation metadata
  const chatDocRef = doc(db, 'pt_chats', chatId);
  const parentUpdate: any = {
    chatId,
    trainerId: effectiveTrainerId,
    clientId: effectiveClientId,
    lastMessageText: trimmed || (mediaUrl ? '📷 Image' : ''),
    lastMessageTime: serverTimestamp(),
    lastSenderRole: roleNormalized,
    updatedAt: serverTimestamp()
  };

  if (roleNormalized === 'TRAINER') {
    parentUpdate.trainerName = senderName;
    if (recipientName) parentUpdate.clientName = recipientName;
    parentUpdate.unreadForClient = increment(1);
  } else {
    parentUpdate.clientName = senderName;
    if (recipientName) parentUpdate.trainerName = recipientName;
    parentUpdate.unreadForTrainer = increment(1);
  }

  await setDoc(chatDocRef, parentUpdate, { merge: true });

  return {
    id: msgId,
    chatId,
    senderId,
    senderName,
    senderRole: roleSmall,
    recipientId,
    recipientName,
    text: trimmed,
    mediaUrl,
    createdAt: new Date().toISOString(),
    timestamp: nowMs,
    readByRecipient: false
  };
};

/**
 * Send direct message wrapper
 */
export const sendDirectMessage = async (params: {
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'trainer' | 'CLIENT' | 'TRAINER';
  recipientId: string;
  recipientName: string;
  text: string;
  mediaUrl?: string;
  trainerId?: string;
  clientId?: string;
}): Promise<DirectMessage> => {
  return sendPtChatMessage(params);
};

/**
 * Mark all incoming messages in a chat as read by the recipient
 */
export const markPtMessagesAsRead = async (
  chatId: string,
  readerRole: 'trainer' | 'client' | 'TRAINER' | 'CLIENT',
  readerId: string
) => {
  if (!chatId) return;
  const isTrainer = readerRole.toLowerCase() === 'trainer';

  try {
    // 1. Reset unread badge on parent chat doc
    const chatDocRef = doc(db, 'pt_chats', chatId);
    await setDoc(
      chatDocRef,
      isTrainer ? { unreadForTrainer: 0 } : { unreadForClient: 0 },
      { merge: true }
    );

    // 2. Update unread messages in subcollection
    const messagesCol = collection(db, 'pt_chats', chatId, 'messages');
    const targetSenderRole = isTrainer ? 'CLIENT' : 'TRAINER';
    const qUnread = query(
      messagesCol,
      where('senderRole', '==', targetSenderRole),
      where('readByRecipient', '==', false)
    );

    const snap = await getDocs(qUnread);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        batch.update(d.ref, { readByRecipient: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('Error marking PT messages as read:', err);
  }
};

/**
 * Subscribe to live chat summaries and unread counts for a Trainer
 */
export const subscribeToTrainerChats = (
  trainerId: string,
  callback: (chats: PtChatSummary[], totalUnread: number, unreadByClient: Record<string, number>) => void
) => {
  if (!trainerId) return () => {};

  const q = query(
    collection(db, 'pt_chats'),
    where('trainerId', '==', trainerId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const chats: PtChatSummary[] = [];
      let totalUnread = 0;
      const unreadByClient: Record<string, number> = {};

      snap.docs.forEach((d) => {
        const data = d.data() as PtChatSummary;
        const unread = Number(data.unreadForTrainer) || 0;
        chats.push({ ...data, chatId: d.id });
        if (unread > 0) {
          totalUnread += unread;
          if (data.clientId) {
            unreadByClient[data.clientId] = (unreadByClient[data.clientId] || 0) + unread;
          }
        }
      });

      callback(chats, totalUnread, unreadByClient);
    },
    (err) => console.warn('Trainer chats subscription note:', err)
  );
};

/**
 * Subscribe to live chat summaries and unread counts for a Client
 */
export const subscribeToClientChats = (
  clientId: string,
  callback: (chats: PtChatSummary[], totalUnread: number, unreadByTrainer: Record<string, number>) => void
) => {
  if (!clientId) return () => {};

  const q = query(
    collection(db, 'pt_chats'),
    where('clientId', '==', clientId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const chats: PtChatSummary[] = [];
      let totalUnread = 0;
      const unreadByTrainer: Record<string, number> = {};

      snap.docs.forEach((d) => {
        const data = d.data() as PtChatSummary;
        const unread = Number(data.unreadForClient) || 0;
        chats.push({ ...data, chatId: d.id });
        if (unread > 0) {
          totalUnread += unread;
          if (data.trainerId) {
            unreadByTrainer[data.trainerId] = (unreadByTrainer[data.trainerId] || 0) + unread;
          }
        }
      });

      callback(chats, totalUnread, unreadByTrainer);
    },
    (err) => console.warn('Client chats subscription note:', err)
  );
};
