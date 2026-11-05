import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
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
import { isStaffOwnerOrCoManager } from '../../services/chatService';
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
  MessageSquare
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

export const PtSectionView: React.FC = () => {
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

  // Razorpay & Receipt modals
  const [isRzpModalOpen, setIsRzpModalOpen] = useState(false);
  const [completedTxn, setCompletedTxn] = useState<PaymentTransaction | null>(null);

  // Direct Chat modal state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPartnerTrainer, setChatPartnerTrainer] = useState<TrainerProfile | null>(null);

  const selectedPackage =
    ptPackages.find((p) => p.id === selectedPackageId) || ptPackages[0] || PT_PACKAGES[0];
  const selectedTrainer =
    trainers.find((t) => t.trainerId === selectedTrainerId) || trainers[0];

  const hasActivePt = clientProfile?.ptStatus === 'active';

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

    // 2. Check client's PT requests
    const reqQuery = query(
      collection(db, 'ptRequests'),
      where('clientId', '==', currentUser.uid)
    );
    const unsubReq = onSnapshot(
      reqQuery,
      (snap) => {
        if (!snap.empty) {
          const sorted = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PtRequest));
          sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          setMyPtRequest(sorted[0]);
        } else {
          setMyPtRequest(null);
        }
      },
      (error) => {
        console.warn('ptRequests listener notice:', error);
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

  // Dual Checkout 1: Pay Online (Instant Gateway)
  const handlePayOnlineCheckout = () => {
    if (!currentUser) return;
    setIsRzpModalOpen(true);
  };

  // Dual Checkout 2: Pay via Offline Cash Desk
  const handleOfflineCashCheckout = async () => {
    if (!currentUser) return;
    setIsPaying(true);
    setPtNotice('');

    try {
      const chosenTrainer = selectedTrainer || trainers[0];
      const chosenPackage = selectedPackage;

      const { transaction } = await submitOfflinePaymentRequest({
        clientId: currentUser.uid,
        clientName: clientProfile?.displayName || currentUser.displayName,
        clientPhone: clientProfile?.phone || currentUser.phone,
        clientEmail: clientProfile?.email || currentUser.email,
        purpose: 'personal_training',
        itemTitle: `${chosenPackage.name} with ${chosenTrainer?.displayName || 'Coach'}`,
        planId: chosenPackage.id,
        planName: `${chosenPackage.name} (${chosenTrainer?.displayName || 'Personal Trainer'})`,
        durationMonths: chosenPackage.durationMonths,
        originalPrice: chosenPackage.price,
        finalAmount: chosenPackage.price,
        ptIncluded: true,
        ptTrainerId: chosenTrainer?.trainerId,
        ptTrainerName: chosenTrainer?.displayName,
        metadata: {
          packageId: chosenPackage.id,
          sessionsCount: chosenPackage.sessions,
          trainerId: chosenTrainer?.trainerId,
          trainerName: chosenTrainer?.displayName
        }
      });

      const reqId = myPtRequest?.id || `ptreq_${currentUser.uid}`;
      const newReqData: PtRequest = {
        id: reqId,
        clientId: currentUser.uid,
        clientName: clientProfile?.displayName || currentUser.displayName,
        clientPhotoUrl: currentUser.photoUrl || clientProfile?.photoUrl || '',
        trainerId: chosenTrainer?.trainerId || '',
        trainerName: chosenTrainer?.displayName || 'Coach',
        fee: chosenPackage.price,
        status: 'PENDING_CASH_CONFIRMATION',
        paymentMode: 'cash',
        paidStatus: 'pending',
        transactionId: transaction.id || transaction.referenceId,
        requestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'ptRequests', reqId), newReqData, { merge: true });
      await updateClientProfile({ ptStatus: 'pending' });

      setPtNotice(
        `Offline Cash Request (${transaction.referenceId}) submitted! Deposit ₹${chosenPackage.price.toLocaleString(
          'en-IN'
        )} at the gym desk. Once admin confirms offline cash receipt, your PT plan and trainer will become active!`
      );
    } catch (err: any) {
      setPtNotice('Error submitting offline PT cash request: ' + err.message);
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
      setCompletedTxn(transaction);

      const chosenTrainer = selectedTrainer || trainers[0];
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
            myPtRequest.status === 'PENDING_CASH_CONFIRMATION') ? (
            /* Existing Request Status Tracker */
            <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">Current PT Request Status</h3>

              <div className="p-4 bg-[#E2EAF3] border border-cyan-500/30 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Trainer Requested:</span>
                  <span className="text-xs font-bold text-slate-800">{myPtRequest.trainerName}</span>
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
                      : 'Pending Cash Desk Verification'}
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
                      Your payment of ₹{myPtRequest.fee.toLocaleString('en-IN')} has been verified. Master Admin will finalize your trainer allocation and assign <strong>{myPtRequest.trainerName}</strong> shortly.
                    </p>
                  </div>
                )}

                {myPtRequest.status === 'PENDING_CASH_CONFIRMATION' && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-orange-800">
                      <Clock className="w-4 h-4 text-orange-600" />
                      <span>Cash Request Pending Desk Verification</span>
                    </div>
                    <p className="text-[11px] text-orange-700 leading-relaxed">
                      Please deposit ₹{myPtRequest.fee.toLocaleString('en-IN')} at the gym front desk. Once reception verifies the cash receipt, Admin will activate your PT and confirm trainer allocation.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Full PT Package & Trainer Checkout Flow */
            <div className="clay-surface rounded-3xl p-5 border border-white/80 shadow-xl space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight">1. Choose Personal Training Package</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Select your 1-on-1 coaching term with custom meal plans &amp; weekly form assessments.
                </p>
              </div>

              {/* PT Package Tiers Grid (Admin Dynamic PtPlans Catalog) */}
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
                          : 'border-white/80 bg-white/70 hover:bg-white/90'
                      }`}
                    >
                      {pkg.badge && (
                        <div className="mb-2">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            pkg.popular ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
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

              {/* Step 2: Trainer Selection */}
              <div className="pt-2 border-t border-slate-200/80 space-y-2.5">
                <div>
                  <h3 className="text-sm font-black text-slate-800 tracking-tight">2. Select Your Personal Trainer</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Choose from our certified elite biomechanics and physique coaches.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {trainers.map((tr) => (
                    <div
                      key={tr.trainerId}
                      onClick={() => setSelectedTrainerId(tr.trainerId)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        selectedTrainerId === tr.trainerId
                          ? 'border-indigo-600 bg-indigo-50/80 shadow-md ring-2 ring-indigo-500/25'
                          : 'border-white/80 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={tr.photoUrl}
                          alt={tr.displayName}
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shrink-0 shadow-2xs"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-slate-900">{tr.displayName}</h4>
                            <TrainerIdentityBadge badge={tr.badge} />
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{tr.bio}</p>
                          <div className="flex flex-wrap items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-slate-200/80 text-[11px]">
                            <span className="text-indigo-700 font-bold">{tr.specializations}</span>
                            <div className="flex items-center gap-1.5">
                              {/* Native Phone Dialer trigger */}
                              {(() => {
                                const trPhone =
                                  tr.phone ||
                                  (tr.trainerId.includes('hitesh')
                                    ? '8208002585'
                                    : tr.trainerId.includes('bhavesh')
                                    ? '9607292842'
                                    : '9820345678');
                                return (
                                  <a
                                    href={`tel:${trPhone.replace(/[^\d+]/g, '')}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded-lg border border-emerald-300 font-bold transition-colors"
                                  >
                                    <Phone className="w-2.5 h-2.5" />
                                    <span>{trPhone}</span>
                                  </a>
                                );
                              })()}

                              {/* Direct Chat Trigger */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setChatPartnerTrainer(tr);
                                  setIsChatOpen(true);
                                }}
                                className="inline-flex items-center gap-1 text-[10px] text-indigo-800 bg-indigo-100 hover:bg-indigo-200 px-2 py-0.5 rounded-lg border border-indigo-300 font-bold transition-colors"
                              >
                                <MessageSquare className="w-2.5 h-2.5" />
                                <span>Chat</span>
                              </button>

                              <span className="font-bold text-amber-600">★ {tr.rating.toFixed(1)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Notice if present */}
              {ptNotice && (
                <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 text-xs font-bold animate-fade-in">
                  {ptNotice}
                </div>
              )}

              {/* Step 3: Dual Checkout Action Workflow */}
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Selected Package: <strong>{selectedPackage.name}</strong></span>
                  <span className="text-indigo-600 font-black text-sm">
                    Total: ₹{selectedPackage.price.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Option 1: Pay Online */}
                  <button
                    type="button"
                    onClick={handlePayOnlineCheckout}
                    disabled={isPaying || isRzpModalOpen || !selectedTrainerId}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Pay Online ({activeOnlineGateway?.name.split(' ')[0] || 'Gateway'})</span>
                  </button>

                  {/* Option 2: Pay Offline Cash */}
                  <button
                    type="button"
                    onClick={handleOfflineCashCheckout}
                    disabled={isPaying || isRzpModalOpen || !selectedTrainerId}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                  >
                    <Banknote className="w-4 h-4" />
                    <span>Pay via Offline Cash Desk</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* UNIVERSAL ONLINE GATEWAY CHECKOUT MODAL */}
      <RazorpayCheckoutModal
        isOpen={isRzpModalOpen}
        onClose={() => setIsRzpModalOpen(false)}
        gateway={activeOnlineGateway}
        amount={selectedPackage.price}
        originalPrice={selectedPackage.price}
        durationMonths={selectedPackage.durationMonths}
        itemTitle={`${selectedPackage.name} with ${selectedTrainer?.displayName || 'Coach'}`}
        planId={selectedPackage.id}
        planName={`${selectedPackage.name} (${selectedTrainer?.displayName || 'Personal Trainer'})`}
        clientId={currentUser?.uid || ''}
        clientName={clientProfile?.displayName || currentUser?.displayName || 'Member'}
        clientPhone={clientProfile?.phone || currentUser?.phone}
        clientEmail={clientProfile?.email || currentUser?.email}
        ptIncluded={true}
        ptTrainerId={selectedTrainer?.trainerId}
        ptTrainerName={selectedTrainer?.displayName}
        metadata={{
          packageId: selectedPackage.id,
          sessionsCount: selectedPackage.sessions,
          trainerId: selectedTrainer?.trainerId,
          trainerName: selectedTrainer?.displayName
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
