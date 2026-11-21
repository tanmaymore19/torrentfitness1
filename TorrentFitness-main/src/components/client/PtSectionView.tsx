import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, onSnapshot, serverTimestamp, addDoc } from 'firebase/firestore';
import { TrainerProfile, PtRequest, PtSchedule, DietPlan, PaymentGateway, PaymentTransaction } from '../../types';
import { TrainerIdentityBadge } from '../common/Badge';
import { RazorpayCheckoutModal } from '../common/RazorpayCheckoutModal';
import { PaymentReceiptModal } from '../common/PaymentReceiptModal';
import {
  getPaymentGateways,
  getActiveOnlineGateway,
  submitOfflinePaymentRequest,
  ONLINE_PROVIDERS
} from '../../services/paymentService';
import { DirectChatModal } from '../common/DirectChatModal';
import {
  isStaffOwnerOrCoManager,
  subscribeToClientChats,
  PtChatSummary,
  playChatNotificationChime
} from '../../services/chatService';
import {
  UserCheck,
  Calendar,
  Apple,
  Clock,
  CreditCard,
  Banknote,
  Send,
  CheckCircle,
  AlertCircle,
  Phone,
  MessageSquare,
  Sparkles,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface PtPackageTier {
  id: string;
  name: string;
  durationMonths: number;
  sessions: number;
  price: number;
  savings?: string;
  badge?: string;
  popular?: boolean;
}

export const PT_PACKAGES: PtPackageTier[] = [
  {
    id: 'pt_1m',
    name: '1 Month 1-on-1 PT',
    durationMonths: 1,
    sessions: 12,
    price: 3500,
    badge: '12 SESSIONS'
  },
  {
    id: 'pt_3m',
    name: '3 Months Transformation PT',
    durationMonths: 3,
    sessions: 36,
    price: 9500,
    savings: 'Save ₹1,000 (10% OFF)',
    badge: '36 SESSIONS • POPULAR',
    popular: true
  },
  {
    id: 'pt_6m',
    name: '6 Months Elite Athlete PT',
    durationMonths: 6,
    sessions: 72,
    price: 18000,
    savings: 'Save ₹3,000 (15% OFF)',
    badge: '72 SESSIONS • BEST VALUE'
  }
];

export interface PtSectionViewProps {
  onCheckoutModalToggle?: (isOpen: boolean) => void;
}

export const PtSectionView: React.FC<PtSectionViewProps> = ({ onCheckoutModalToggle }) => {
  const { currentUser, clientProfile, updateClientProfile } = useAuth();
  const [trainers, setTrainers] = useState<TrainerProfile[]>([]);
  const [myPtRequest, setMyPtRequest] = useState<PtRequest | null>(null);
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);
  const [ptSchedule, setPtSchedule] = useState<PtSchedule | null>(null);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);

  // Package & Trainer Selection
  const [ptPackages, setPtPackages] = useState<PtPackageTier[]>(PT_PACKAGES);
  const [selectedPackageId, setSelectedPackageId] = useState<string>('pt_1m');
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>('');
  const [isPaying, setIsPaying] = useState(false);
  const [ptNotice, setPtNotice] = useState<string>('');
  const [offlineToast, setOfflineToast] = useState<string | null>(null);

  // Razorpay & Receipt modals
  const [isRzpModalOpen, setIsRzpModalOpen] = useState(false);
  const [completedTxn, setCompletedTxn] = useState<PaymentTransaction | null>(null);

  // Direct Chat modal state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPartnerTrainer, setChatPartnerTrainer] = useState<TrainerProfile | null>(null);

  // Live Chat & Unread States for Client
  const [clientChatSummaries, setClientChatSummaries] = useState<PtChatSummary[]>([]);
  const [unreadByTrainer, setUnreadByTrainer] = useState<Record<string, number>>({});
  const [totalChatUnread, setTotalChatUnread] = useState<number>(0);
  const [incomingChatToast, setIncomingChatToast] = useState<{ trainerName: string; text: string } | null>(null);
  const prevClientUnreadRef = useRef<number>(-1);

  // Dedicated PT Plans Modal State (Trainer-First Flow)
  const [isPtPlansModalOpen, setIsPtPlansModalOpen] = useState<boolean>(false);
  const [modalTrainer, setModalTrainer] = useState<TrainerProfile | null>(null);

  // Lock body scroll and notify parent when dedicated PT modal is active
  useEffect(() => {
    if (isPtPlansModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('checkout-modal-open');
      onCheckoutModalToggle?.(true);
      return () => {
        document.body.style.overflow = '';
        document.body.classList.remove('checkout-modal-open');
        onCheckoutModalToggle?.(false);
      };
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('checkout-modal-open');
      onCheckoutModalToggle?.(false);
    }
  }, [isPtPlansModalOpen, onCheckoutModalToggle]);

  const selectedPackage =
    ptPackages.find((p) => p.id === selectedPackageId) || ptPackages[0] || PT_PACKAGES[0];
  const selectedTrainer =
    trainers.find((t) => t.trainerId === selectedTrainerId) || trainers[0];

  const hasActivePt = clientProfile?.ptStatus === 'active';

  const activeChats = React.useMemo(() => {
    return clientChatSummaries.filter((c) => {
      const hasSent = Boolean(
        (c as any).hasClientSentMessage ||
        ((c as any).totalClientMessages && (c as any).totalClientMessages > 0) ||
        (c as any).lastSenderRole === 'CLIENT' ||
        (c.lastMessageText && typeof window !== 'undefined' && localStorage.getItem(`tf_client_sent_msg_${currentUser?.uid}_${c.trainerId}`) === 'true') ||
        (c.lastMessageText && typeof window !== 'undefined' && localStorage.getItem(`tf_client_sent_msg_${currentUser?.uid}`) === 'true')
      );
      return hasSent;
    });
  }, [clientChatSummaries, currentUser?.uid]);

  useEffect(() => {
    async function loadData() {
      // 1. Load active trainers
      const tSnap = await getDocs(collection(db, 'trainerProfiles'));
      if (!tSnap.empty) {
        const list = tSnap.docs
          .map((d) => ({ trainerId: d.id, ...d.data() } as TrainerProfile))
          .filter((t) => t.status === 'active' && t.ptAvailable);
        setTrainers(list);
        if (list.length > 0 && !selectedTrainerId) {
          setSelectedTrainerId(list[0].trainerId);
        }
      }

      // Load gateways
      const loadedG = await getPaymentGateways();
      setGateways(loadedG);
    }
    loadData();

    if (!currentUser) return;

    // Real-time listener for admin-defined PT packages
    const unsubPtPlans = onSnapshot(
      collection(db, 'ptPlans'),
      (snap) => {
        if (!snap.empty) {
          const dynamicPlans = snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                name: data.name,
                durationMonths: data.durationMonths || 1,
                sessions: data.sessions || 12,
                price: data.offerPrice || data.price || 3500,
                savings: data.savings,
                badge: data.badge || `${data.sessions || 12} SESSIONS`,
                popular: !!data.popular,
                active: data.active
              } as PtPackageTier & { active?: boolean };
            })
            .filter((p) => p.active !== false);

          if (dynamicPlans.length > 0) {
            dynamicPlans.sort((a, b) => a.durationMonths - b.durationMonths);
            setPtPackages(dynamicPlans);
          }
        }
      },
      (error) => {
        console.warn('ptPlans listener notice:', error);
      }
    );

    // 2. Check client's PT requests (checks pt_requests and mirrors to ptRequests)
    const reqQuery = query(
      collection(db, 'pt_requests'),
      where('clientId', '==', currentUser.uid)
    );
    const unsubReq = onSnapshot(
      reqQuery,
      (snap) => {
        if (!snap.empty) {
          const sorted = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PtRequest));
          sorted.sort((a, b) => new Date((b as any).updatedAt || (b as any).requestedAt || 0).getTime() - new Date((a as any).updatedAt || (a as any).requestedAt || 0).getTime());
          setMyPtRequest(sorted[0]);
        } else {
          // Fallback check on legacy ptRequests
          getDocs(query(collection(db, 'ptRequests'), where('clientId', '==', currentUser.uid)))
            .then((legacySnap) => {
              if (!legacySnap.empty) {
                const legacySorted = legacySnap.docs.map((d) => ({ id: d.id, ...d.data() } as PtRequest));
                legacySorted.sort((a, b) => new Date((b as any).updatedAt || (b as any).requestedAt || 0).getTime() - new Date((a as any).updatedAt || (a as any).requestedAt || 0).getTime());
                setMyPtRequest(legacySorted[0]);
              } else {
                setMyPtRequest(null);
              }
            })
            .catch(() => setMyPtRequest(null));
        }
      },
      (error) => {
        console.warn('pt_requests listener notice:', error);
      }
    );

    // 3. Load PT Diet Plan if client has active PT
    const dietQuery = query(
      collection(db, 'dietPlans'),
      where('clientId', '==', currentUser.uid)
    );
    const unsubDiet = onSnapshot(
      dietQuery,
      (snap) => {
        if (!snap.empty) {
          setDietPlan({ id: snap.docs[0].id, ...snap.docs[0].data() } as DietPlan);
        } else {
          setDietPlan(null);
        }
      },
      (error) => {
        console.warn('dietPlans listener notice:', error);
      }
    );

    // 4. Load PT Regular Schedule if assigned
    const schedQuery = query(
      collection(db, 'ptSchedules'),
      where('clientId', '==', currentUser.uid)
    );
    const unsubSched = onSnapshot(
      schedQuery,
      (snap) => {
        if (!snap.empty) {
          setPtSchedule({ id: snap.docs[0].id, ...snap.docs[0].data() } as PtSchedule);
        } else {
          setPtSchedule(null);
        }
      },
      (error) => {
        console.warn('ptSchedules listener notice:', error);
      }
    );

    return () => {
      unsubPtPlans();
      unsubReq();
      unsubDiet();
      unsubSched();
    };
  }, [currentUser]);

  // Live Chat listener for Client
  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsub = subscribeToClientChats(currentUser.uid, (chats, totalUnread, unreadMap) => {
      setClientChatSummaries(chats);
      setUnreadByTrainer(unreadMap);
      setTotalChatUnread(totalUnread);

      if (prevClientUnreadRef.current >= 0 && totalUnread > prevClientUnreadRef.current && !isChatOpen) {
        playChatNotificationChime();
        const latestChat = chats.find((c) => (c.unreadForClient || 0) > 0);
        if (latestChat) {
          setIncomingChatToast({
            trainerName: latestChat.trainerName || 'Coach',
            text: latestChat.lastMessageText || 'Sent you a new message'
          });
          setTimeout(() => setIncomingChatToast(null), 5000);
        }
      }
      prevClientUnreadRef.current = totalUnread;
    });

    return () => unsub();
  }, [currentUser?.uid, isChatOpen]);

  // Dual Checkout 1: Pay Online (Instant Gateway)
  const handlePayOnlineCheckout = () => {
    if (!currentUser) return;
    setIsRzpModalOpen(true);
  };

  // Dual Checkout 2: Pay via Offline Cash Desk
  const handleOfflineCashCheckout = async () => {
    if (!currentUser) {
      alert('Please log in to submit a Personal Training request.');
      return;
    }

    // 1. Validate that no duplicate PENDING PT request already exists for this client
    if (
      (myPtRequest &&
        (myPtRequest.status === 'PENDING' ||
          myPtRequest.status === 'PENDING_ADMIN_APPROVAL' ||
          myPtRequest.status === 'PENDING_CASH_CONFIRMATION' ||
          myPtRequest.status === 'pending' ||
          myPtRequest.status === 'PAID_PENDING_TRAINER_ASSIGNMENT')) ||
      clientProfile?.ptStatus === 'PENDING' ||
      clientProfile?.ptStatus === 'pending'
    ) {
      alert('You already have a pending Personal Training request awaiting Admin approval.');
      setPtNotice('You already have a pending Personal Training request awaiting desk verification/Admin approval.');
      setOfflineToast('You already have a pending request awaiting verification.');
      setTimeout(() => setOfflineToast(null), 4000);
      return;
    }

    setIsPaying(true);
    setPtNotice('');

    try {
      const chosenTrainer = modalTrainer || selectedTrainer || trainers[0];
      const chosenPackage = selectedPackage;
      const nowIso = new Date().toISOString();

      const newRequestData = {
        status: 'PENDING',
        paymentMode: 'OFFLINE_CASH',
        paymentStatus: 'PENDING_DESK_VERIFICATION',
        clientId: currentUser.uid,
        clientName: (currentUser as any).fullName || currentUser.displayName || clientProfile?.displayName || 'Member',
        clientUsername: (currentUser as any).username || clientProfile?.username || '',
        clientPhone: currentUser.phone || (currentUser as any).mobileNumber || clientProfile?.phone || '',
        requestedTrainerId: chosenTrainer?.trainerId || (chosenTrainer as any)?.id || '',
        requestedTrainerName: (chosenTrainer as any)?.fullName || chosenTrainer?.displayName || (chosenTrainer as any)?.name || 'Personal Trainer',
        planName: chosenPackage.name,
        durationMonths: chosenPackage.durationMonths || 1,
        amount: Number(chosenPackage.price) || 0,
        rejectionSeenByClient: false,
        createdAt: serverTimestamp(),
        // Backwards compatibility fields for legacy views
        trainerId: chosenTrainer?.trainerId || (chosenTrainer as any)?.id || '',
        trainerName: (chosenTrainer as any)?.fullName || chosenTrainer?.displayName || (chosenTrainer as any)?.name || 'Personal Trainer',
        fee: Number(chosenPackage.price) || 0,
        paidStatus: 'pending',
        clientPhotoUrl: currentUser.photoUrl || clientProfile?.photoUrl || '',
        requestedAt: nowIso,
        updatedAt: nowIso
      };

      // 2. Write directly to pt_requests using addDoc
      const docRef = await addDoc(collection(db, 'pt_requests'), newRequestData);
      const generatedId = docRef.id;

      // Ensure id field is set
      await setDoc(docRef, { id: generatedId }, { merge: true });

      // Mirror to legacy ptRequests for full backward compatibility
      await setDoc(doc(db, 'ptRequests', generatedId), {
        ...newRequestData,
        id: generatedId,
        createdAt: nowIso
      }, { merge: true });

      // 3. Update clientProfiles/{clientId} and members/{clientId} ({ merge: true }) with ptStatus: 'PENDING'
      await setDoc(doc(db, 'clientProfiles', currentUser.uid), {
        ptStatus: 'PENDING',
        pendingPtRequestId: generatedId,
        updatedAt: nowIso
      }, { merge: true });

      await setDoc(doc(db, 'members', currentUser.uid), {
        ptStatus: 'PENDING',
        pendingPtRequestId: generatedId,
        updatedAt: nowIso
      }, { merge: true });

      try {
        await updateClientProfile({ ptStatus: 'PENDING' as any });
      } catch {}

      // 4. Show success toast and close modal cleanly
      setIsPtPlansModalOpen(false);
      setOfflineToast('Offline PT request sent to Gym Desk! Waiting for Admin approval.');
      setPtNotice('Offline PT request sent to Gym Desk! Waiting for Admin approval.');
      setTimeout(() => setOfflineToast(null), 6000);
    } catch (err: any) {
      console.error('Error submitting offline PT request:', err);
      alert('Error submitting request: ' + (err?.message || 'Permission denied or network failure.'));
      setPtNotice('Error submitting offline PT request: ' + err.message);
    } finally {
      setIsPaying(false);
    }
  };

  // Online Payment Success Handler -> Sets status to PAID_PENDING_TRAINER_ASSIGNMENT
  const handlePtPaymentSuccess = async (transaction: PaymentTransaction) => {
    if (!currentUser) return;
    setIsPaying(true);

    try {
      setIsRzpModalOpen(false);
      setIsPtPlansModalOpen(false);
      setCompletedTxn(transaction);

      const chosenTrainer = modalTrainer || selectedTrainer || trainers[0];
      const chosenPackage = selectedPackage;
      const reqId = myPtRequest?.id || `ptreq_${currentUser.uid}`;

      const newReqData: PtRequest = {
        id: reqId,
        clientId: currentUser.uid,
        clientName: clientProfile?.displayName || currentUser.displayName,
        clientPhotoUrl: currentUser.photoUrl || clientProfile?.photoUrl || '',
        trainerId: chosenTrainer?.trainerId || '',
        trainerName: chosenTrainer?.displayName || 'Coach',
        fee: chosenPackage.price,
        status: 'PAID_PENDING_TRAINER_ASSIGNMENT' as any,
        paymentMode: 'online',
        paidStatus: 'paid',
        transactionId: transaction.id || transaction.referenceId,
        requestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'ptRequests', reqId), newReqData, { merge: true });
      try {
        await setDoc(doc(db, 'pt_requests', reqId), newReqData, { merge: true });
      } catch {}
      await updateClientProfile({ ptStatus: 'pending' });

      setPtNotice(
        `Payment Successful (Payment ID: ${
          transaction.paymentId || transaction.razorpayPaymentId || transaction.referenceId
        })! Status set to PAID_PENDING_TRAINER_ASSIGNMENT for Master Admin coach assignment.`
      );

      try {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      } catch {}
    } catch (err: any) {
      console.error('[PT Post-Payment Sync Error]:', err);
      setPtNotice(
        `Payment verified (ID: ${
          transaction.paymentId || transaction.razorpayPaymentId || transaction.referenceId
        }): ` + (err.message || '')
      );
    } finally {
      setIsPaying(false);
    }
  };

  const activeOnlineGateway = getActiveOnlineGateway(gateways);

  return (
    <div className="space-y-4 pb-20 text-slate-700">
      {/* Header */}
      <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-1 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500 font-bold bg-cyan-500/15 border border-cyan-500/20 px-2.5 py-0.5 rounded-full">
              1-on-1 Coaching
            </span>
            <h2 className="text-lg font-black text-slate-800 mt-1.5 tracking-tight">Personal Training (PT)</h2>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-cyan-950/60 border border-cyan-500/30 text-orange-500 font-bold flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed mt-1">
          Tailored nutrition plans, dedicated workout assignment and reserved regular gym timing.
        </p>
      </div>

      {/* Offline PT Request Submitted Toast */}
      {offlineToast && (
        <div className="p-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl shadow-lg border border-white/20 flex items-center gap-3 animate-fade-in">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
          <div className="text-xs">
            <span className="font-black block">PT Request Sent!</span>
            <span className="text-white/90">{offlineToast}</span>
          </div>
        </div>
      )}

      {/* Incoming Live Chat Notification Toast */}
      {incomingChatToast && (
        <div
          onClick={() => {
            const matchedTr =
              trainers.find((t) => t.displayName === incomingChatToast.trainerName) || trainers[0];
            if (matchedTr) {
              setChatPartnerTrainer(matchedTr);
              setIsChatOpen(true);
            }
          }}
          className="p-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl shadow-lg border border-white/20 flex items-center justify-between gap-3 animate-bounce cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="text-xs">
              <span className="font-black block">New Message from {incomingChatToast.trainerName}</span>
              <span className="text-white/80 line-clamp-1">{incomingChatToast.text}</span>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] font-black uppercase shrink-0">
            Open Chat →
          </span>
        </div>
      )}

      {/* Case 1: Active PT Client View */}
      {hasActivePt ? (
        <div className="space-y-4">
          {/* Active Trainer Card with Badges & Native Dialer */}
          {(() => {
            const assignedTr = trainers.find(t => t.trainerId === clientProfile?.assignedTrainerId);
            const coachName = (clientProfile?.assignedTrainerName || assignedTr?.displayName || '').toLowerCase();
            const coachId = (clientProfile?.assignedTrainerId || assignedTr?.trainerId || '').toLowerCase();
            const coachPhone =
              coachId.includes('hitesh') || coachName.includes('hitesh')
                ? '8208002585'
                : coachId.includes('bhavesh') || coachName.includes('bhavesh')
                ? '9607292842'
                : assignedTr?.phone || '8208002585';
            const cleanCoachPhone = coachPhone.replace(/[^\d+]/g, '');
            const isCoachExecutive = isStaffOwnerOrCoManager(
              assignedTr || {
                trainerId: clientProfile?.assignedTrainerId,
                badge: clientProfile?.assignedTrainerId?.includes('hitesh')
                  ? 'crown'
                  : clientProfile?.assignedTrainerId?.includes('bhavesh')
                  ? 'shield'
                  : 'none'
              }
            );

            return (
              <div className="bg-gradient-to-tr from-[#111827] via-[#141C2E] to-[#0F172A] rounded-3xl p-5 text-slate-800 border border-cyan-500/30 shadow-2xl space-y-3.5 relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
                <div className="absolute -right-8 -top-8 w-40 h-40 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between relative z-10">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-orange-500 font-bold border border-cyan-500/30 px-2.5 py-0.5 rounded-full">
                    Assigned Personal Trainer
                  </span>
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Active Coaching
                  </span>
                </div>

                <div className="flex items-center gap-3 relative z-10">
                  <img
                    src={
                      assignedTr?.photoUrl ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
                    }
                    alt={clientProfile?.assignedTrainerName || 'Trainer'}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-white/30 shadow-md shrink-0 ring-1 ring-cyan-500/20"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-800">
                        {clientProfile?.assignedTrainerName || 'Trainer'}
                      </h3>
                      {clientProfile?.assignedTrainerId?.includes('hitesh') && (
                        <span className="text-sm" title="Hitesh Rajput — Gym Owner">👑</span>
                      )}
                      {clientProfile?.assignedTrainerId?.includes('bhavesh') && (
                        <span className="text-sm" title="Bhavesh Rajput — Co-Manager">🛡️</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 mt-0.5">
                      Certified Torrent Fitness Coach
                    </p>

                    {/* Coach Contact Policy: Strictly Owners & Co-Managers have direct Call/Chat buttons */}
                    {isCoachExecutive ? (
                      <div className="mt-2 flex items-center gap-2">
                        <a
                          href={`tel:${cleanCoachPhone}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 clay-btn-neutral hover:clay-btn-neutral text-slate-800 rounded-xl text-xs font-bold transition-all border border-white/90 backdrop-blur-xs"
                          title="Tap to trigger device native phone dialer"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-500" />
                          <span>{coachPhone}</span>
                          <span className="text-[10px] text-emerald-600 underline font-normal ml-0.5">Tap to Call</span>
                        </a>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        <span>Gym Floor In-Person Trainer</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct Contact Action Buttons (Role-Gated) */}
                <div className="pt-2 border-t border-slate-200/80 relative z-10">
                  {isCoachExecutive ? (
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`tel:${cleanCoachPhone}`}
                        className="py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98]"
                        title="Open device native phone dialer"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Call Coach</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          const trId = clientProfile?.assignedTrainerId || 'trainer_hitesh_more';
                          setChatPartnerTrainer(assignedTr || {
                            trainerId: trId,
                            displayName: clientProfile?.assignedTrainerName || 'Management Coach',
                            photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                            phone: coachPhone,
                            badge: trId.includes('hitesh') ? 'crown' : trId.includes('bhavesh') ? 'shield' : 'owner',
                            specializations: 'Personal Coaching',
                            ptAvailable: true,
                            status: 'active',
                            rating: 5.0,
                            createdAt: ''
                          });
                          setIsChatOpen(true);
                        }}
                        className="py-2.5 vision-btn-aurora text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-[0.98]"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Direct Chat</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800 block">Floor Trainer Guidance</span>
                          <span className="text-[11px] text-slate-500">In-person supervision on gym floor</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const ownerTr = trainers.find((t) => isStaffOwnerOrCoManager(t)) || {
                              trainerId: 'trainer_hitesh_more',
                              displayName: 'Hitesh More (Owner)',
                              photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                              phone: '8208002585',
                              badge: 'crown',
                              specializations: 'Gym Owner & Head Coach',
                              ptAvailable: true,
                              status: 'active'
                            };
                            setChatPartnerTrainer(ownerTr as any);
                            setIsChatOpen(true);
                          }}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs shrink-0"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Chat with Management</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* PT Recurring Schedule */}
          <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-500 font-bold" />
                Assigned PT Schedule
              </h3>
              <span className="text-[10px] text-slate-600 font-medium">Recurring</span>
            </div>

            {ptSchedule ? (
              <div className="p-3.5 bg-[#E2EAF3] border border-cyan-500/30 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-500 font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-orange-500 font-bold" />
                    {ptSchedule.recurringTime}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    {ptSchedule.daysOfWeek}
                  </span>
                </div>
                {ptSchedule.notes && (
                  <p className="text-[11px] text-slate-600 italic">
                    Note: "{ptSchedule.notes}"
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 bg-[#E2EAF3] rounded-2xl border border-white/50 text-center text-xs text-slate-600">
                Your trainer will assign your recurring gym training time shortly.
              </div>
            )}
          </div>

          {/* PT Diet Plan */}
          <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Apple className="w-4 h-4 text-emerald-400" />
                Personalized PT Diet Plan
              </h3>
              <span className="text-[10px] text-slate-600 font-medium">Nutrition Guidance</span>
            </div>

            {dietPlan ? (
              <div className="space-y-2.5">
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl">
                  <h4 className="text-xs font-bold text-emerald-300">{dietPlan.title}</h4>
                  <p className="text-[11px] text-emerald-200 mt-1 leading-relaxed">
                    {dietPlan.guidelines}
                  </p>
                </div>

                <div className="space-y-2">
                  {(dietPlan.meals || []).map((meal, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#E2EAF3] rounded-xl border border-white/80 flex items-start justify-between"
                    >
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500 font-bold">
                          {meal.mealTime}
                        </span>
                        <h5 className="text-xs font-bold text-slate-800 mt-0.5">{meal.mealName}</h5>
                        <p className="text-[11px] text-slate-600 mt-0.5">{meal.description}</p>
                      </div>
                      {meal.proteinApprox && (
                        <span className="text-[10px] font-mono font-bold text-slate-700 bg-[#E2EAF3] px-2 py-0.5 rounded-md border border-white/80">
                          {meal.proteinApprox}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-[#E2EAF3] rounded-2xl border border-white/50 text-center text-xs text-slate-600">
                No diet plan published yet. Your trainer will curate your meal strategy soon.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Case 2: Not Yet Active PT — Request Workflow */
        <div className="space-y-4">
          {myPtRequest &&
          (myPtRequest.status === 'PAID_PENDING_TRAINER_ASSIGNMENT' ||
            (myPtRequest.status as string) === 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT' ||
            myPtRequest.status === 'PENDING_CASH_CONFIRMATION' ||
            myPtRequest.status === 'PENDING_ADMIN_APPROVAL' ||
            myPtRequest.status === 'PENDING' ||
            myPtRequest.status === 'pending') ? (
            /* Existing Request Status Tracker */
            <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">Current PT Request Status</h3>

              <div className="p-4 bg-[#E2EAF3] border border-cyan-500/30 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Trainer Requested:</span>
                  <span className="text-xs font-bold text-slate-800">{(myPtRequest as any).requestedTrainerName || myPtRequest.trainerName}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Status:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      myPtRequest.status === 'PAID_PENDING_TRAINER_ASSIGNMENT' ||
                      (myPtRequest.status as string) === 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT'
                        ? 'bg-teal-100 text-teal-800 border-teal-300'
                        : 'bg-orange-100 text-orange-800 border-orange-300'
                    }`}
                  >
                    {myPtRequest.status === 'PAID_PENDING_TRAINER_ASSIGNMENT' ||
                    (myPtRequest.status as string) === 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT'
                      ? 'Paid — Awaiting Admin Coach Assignment'
                      : 'Pending Desk Verification & Admin Approval'}
                  </span>
                </div>

                {(myPtRequest.status === 'PAID_PENDING_TRAINER_ASSIGNMENT' ||
                  (myPtRequest.status as string) === 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT') && (
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-teal-800">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>Payment Verified Online (PAID_PENDING_TRAINER_ASSIGNMENT)</span>
                    </div>
                    <p className="text-[11px] text-teal-700 leading-relaxed">
                      Your payment of ₹{((myPtRequest as any).amount || myPtRequest.fee || 0).toLocaleString('en-IN')} has been verified. Master Admin will finalize your trainer allocation and assign <strong>{(myPtRequest as any).requestedTrainerName || myPtRequest.trainerName}</strong> shortly.
                    </p>
                  </div>
                )}

                {(myPtRequest.status === 'PENDING_CASH_CONFIRMATION' ||
                  myPtRequest.status === 'PENDING_ADMIN_APPROVAL' ||
                  myPtRequest.status === 'PENDING' ||
                  myPtRequest.status === 'pending') && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-orange-800">
                      <Clock className="w-4 h-4 text-orange-600" />
                      <span>Cash Request Pending Desk Verification</span>
                    </div>
                    <p className="text-[11px] text-orange-700 leading-relaxed">
                      Please deposit ₹{((myPtRequest as any).amount || myPtRequest.fee || 0).toLocaleString('en-IN')} at the gym front desk. Once reception verifies the cash receipt, Admin will activate your PT and confirm trainer allocation.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Trainer-First Discovery Flow */
            <div className="space-y-4">
              {/* Active Trainer Chats - Visible once >= 1 message sent */}
              {activeChats.length > 0 && (
                <div className="space-y-3 p-4 bg-white/95 rounded-3xl border border-indigo-100 shadow-sm animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900">Active Trainer Chats</h4>
                        <span className="text-[10px] text-slate-500 font-semibold">Your direct line to coaching staff</span>
                      </div>
                    </div>
                    {totalChatUnread > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                        {totalChatUnread} New
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeChats.map((chat) => {
                      const matchedTrainer = trainers.find((t) => t.trainerId === chat.trainerId);
                      const trainerName = chat.trainerName || matchedTrainer?.displayName || 'Coach';
                      const trainerPhoto =
                        matchedTrainer?.photoUrl ||
                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
                      const unread = Number(chat.unreadForClient) || 0;

                      return (
                        <div
                          key={chat.chatId}
                          onClick={() => {
                            const trObj: TrainerProfile = matchedTrainer || {
                              trainerId: chat.trainerId,
                              displayName: trainerName,
                              phone: '8208002585',
                              bio: 'Certified Trainer',
                              specializations: 'Personal Training',
                              photoUrl: trainerPhoto,
                              ptAvailable: true,
                              dob: '',
                              gender: 'Male',
                              badge: 'Coach'
                            };
                            setChatPartnerTrainer(trObj);
                            setIsChatOpen(true);
                          }}
                          className="p-3 bg-indigo-50/50 hover:bg-indigo-50/90 rounded-2xl border border-indigo-200/70 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs hover:shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={trainerPhoto}
                              alt={trainerName}
                              className="w-10 h-10 rounded-xl object-cover border border-indigo-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h5 className="text-xs font-bold text-slate-900 truncate">{trainerName}</h5>
                                {unread > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black animate-pulse">
                                    {unread} new
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                {chat.lastMessageText || 'Tap to chat...'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold shadow-xs shrink-0 flex items-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Open</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight">Certified Personal Trainers</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Explore our certified biomechanics and physique coaches. Call, chat directly, or view dedicated 1-on-1 PT Plans.
                </p>
              </div>

              {/* Status Notice if present */}
              {ptNotice && (
                <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs font-bold animate-fade-in">
                  {ptNotice}
                </div>
              )}

              {/* Trainer Cards List */}
              <div className="space-y-3">
                {trainers.map((tr) => {
                  const trPhone =
                    tr.phone ||
                    (tr.trainerId.includes('hitesh')
                      ? '8208002585'
                      : tr.trainerId.includes('bhavesh')
                      ? '9607292842'
                      : '8208002585');
                  const unreadCount = unreadByTrainer[tr.trainerId] || 0;

                  return (
                    <div
                      key={tr.trainerId}
                      className="p-4 rounded-3xl clay-surface border border-white/80 shadow-md space-y-3 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-start gap-3.5">
                        <img
                          src={tr.photoUrl}
                          alt={tr.displayName}
                          className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-200/90 shrink-0 shadow-2xs"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h4 className="text-xs font-black text-slate-900 truncate">{tr.displayName}</h4>
                              <TrainerIdentityBadge badge={tr.badge} />
                            </div>
                            <span className="font-bold text-amber-600 text-xs shrink-0">★ {tr.rating.toFixed(1)}</span>
                          </div>
                          <span className="text-[11px] text-indigo-700 font-bold block mt-0.5">
                            {tr.specializations}
                          </span>
                          <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                            {tr.bio}
                          </p>
                        </div>
                      </div>

                      {/* 3 Aligned Action Buttons */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80">
                        {/* 1. Call */}
                        <a
                          href={`tel:${trPhone.replace(/[^\d+]/g, '')}`}
                          className="py-2.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-300 transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                          title={`Call ${tr.displayName}`}
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Call</span>
                        </a>

                        {/* 2. Chat */}
                        <button
                          type="button"
                          onClick={() => {
                            setChatPartnerTrainer(tr);
                            setIsChatOpen(true);
                          }}
                          className="py-2.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors flex items-center justify-center gap-1.5 shadow-2xs relative"
                          title={`Chat with ${tr.displayName}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Chat</span>
                          {unreadCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black animate-pulse">
                              {unreadCount}
                            </span>
                          )}
                        </button>

                        {/* 3. PT Plans (Primary CTA) */}
                        <button
                          type="button"
                          onClick={() => {
                            setModalTrainer(tr);
                            setSelectedTrainerId(tr.trainerId);
                            setIsPtPlansModalOpen(true);
                          }}
                          className="py-2.5 px-2 vision-btn-aurora text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95"
                          title={`View PT Plans with ${tr.displayName}`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>PT Plans</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DEDICATED PT PLANS MODAL (PRE-LINKED TO CHOSEN TRAINER) */}
      {isPtPlansModalOpen && modalTrainer && createPortal(
        <div
          style={{ zIndex: 999999 }}
          className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in overscroll-none"
        >
          <div className="w-full max-w-lg max-h-[85dvh] sm:max-h-[88dvh] flex flex-col bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden text-slate-800 relative z-10">
            {/* Modal Header */}
            <div className="shrink-0 p-5 bg-white border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={modalTrainer.photoUrl}
                  alt={modalTrainer.displayName}
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-200 shadow-2xs"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-black text-slate-900">{modalTrainer.displayName}</h3>
                    <TrainerIdentityBadge badge={modalTrainer.badge} />
                  </div>
                  <span className="text-[11px] text-indigo-600 font-bold block">
                    {modalTrainer.specializations}
                  </span>
                  <span className="text-[10px] text-slate-500">1-on-1 Dedicated Personal Coaching Plans</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPtPlansModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Middle Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y p-5 space-y-4">
              {/* Packages Grid */}
              <div className="space-y-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-600 block">
                  Select Your PT Package
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {ptPackages.map((pkg) => {
                    const isSelected = selectedPackageId === pkg.id;
                    return (
                      <div
                        key={pkg.id}
                        onClick={() => setSelectedPackageId(pkg.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/90 shadow-md ring-2 ring-indigo-500/25'
                            : 'border-slate-200 bg-white/80 hover:bg-white'
                        }`}
                      >
                        {pkg.badge && (
                          <div className="mb-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                pkg.popular ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {pkg.badge}
                            </span>
                          </div>
                        )}
                        <div>
                          <h4 className="text-xs font-black text-slate-900">{pkg.name}</h4>
                          <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-lg font-black text-slate-900">
                              ₹{pkg.price.toLocaleString('en-IN')}
                            </span>
                            <span className="text-[10px] text-slate-500 font-bold">
                              / {pkg.sessions} Sessions
                            </span>
                          </div>
                          {pkg.savings && (
                            <p className="text-[10px] text-emerald-700 font-bold mt-0.5">{pkg.savings}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sticky Bottom Footer */}
            <div className="shrink-0 p-4 border-t border-slate-100 bg-white pb-safe pb-[max(env(safe-area-inset-bottom,16px),16px)] space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span>
                  Coaching with: <strong className="text-indigo-700">{modalTrainer.displayName}</strong>
                </span>
                <span className="text-indigo-600 font-black text-sm">
                  Total: ₹{selectedPackage.price.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handlePayOnlineCheckout}
                  disabled={isPaying || isRzpModalOpen}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Pay Online ({activeOnlineGateway?.name.split(' ')[0] || 'Gateway'})</span>
                </button>

                <button
                  type="button"
                  onClick={handleOfflineCashCheckout}
                  disabled={isPaying || isRzpModalOpen}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] pointer-events-auto cursor-pointer"
                >
                  <Banknote className="w-4 h-4" />
                  <span>Request Offline Desk PT</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-500 text-center italic">
                * Online payments and offline cash requests are reviewed and confirmed by Admin before activation.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* UNIVERSAL ONLINE GATEWAY CHECKOUT MODAL */}
      <RazorpayCheckoutModal
        isOpen={isRzpModalOpen}
        onClose={() => setIsRzpModalOpen(false)}
        gateway={activeOnlineGateway}
        amount={selectedPackage.price}
        originalPrice={selectedPackage.price}
        durationMonths={selectedPackage.durationMonths}
        itemTitle={`${selectedPackage.name} with ${modalTrainer?.displayName || selectedTrainer?.displayName || 'Coach'}`}
        planId={selectedPackage.id}
        planName={`${selectedPackage.name} (${modalTrainer?.displayName || selectedTrainer?.displayName || 'Personal Trainer'})`}
        clientId={currentUser?.uid || ''}
        clientName={clientProfile?.displayName || currentUser?.displayName || 'Member'}
        clientPhone={clientProfile?.phone || currentUser?.phone}
        clientEmail={clientProfile?.email || currentUser?.email}
        ptIncluded={true}
        ptTrainerId={modalTrainer?.trainerId || selectedTrainer?.trainerId}
        ptTrainerName={modalTrainer?.displayName || selectedTrainer?.displayName}
        metadata={{
          packageId: selectedPackage.id,
          sessionsCount: selectedPackage.sessions,
          trainerId: modalTrainer?.trainerId || selectedTrainer?.trainerId,
          trainerName: modalTrainer?.displayName || selectedTrainer?.displayName
        }}
        purpose="personal_training"
        onSuccess={handlePtPaymentSuccess}
      />

      {/* DIGITAL PAYMENT RECEIPT MODAL */}
      <PaymentReceiptModal
        isOpen={!!completedTxn}
        onClose={() => setCompletedTxn(null)}
        transaction={completedTxn}
      />

      {/* DIRECT CHAT MODAL */}
      {chatPartnerTrainer && (
        <DirectChatModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          currentUserId={currentUser?.uid || ''}
          currentUserName={clientProfile?.displayName || currentUser?.displayName || 'Client'}
          currentUserRole="client"
          partnerId={chatPartnerTrainer.trainerId}
          partnerName={chatPartnerTrainer.displayName}
          partnerRole="trainer"
          partnerPhotoUrl={chatPartnerTrainer.photoUrl}
          partnerPhone={chatPartnerTrainer.phone || (
            chatPartnerTrainer.trainerId.includes('hitesh')
              ? '8208002585'
              : chatPartnerTrainer.trainerId.includes('bhavesh')
              ? '9607292842'
              : '9820345678'
          )}
          partnerBadge={chatPartnerTrainer.badge}
        />
      )}
    </div>
  );
};
