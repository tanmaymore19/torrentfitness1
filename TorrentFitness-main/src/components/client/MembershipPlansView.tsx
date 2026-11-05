import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  limit,
  onSnapshot
} from 'firebase/firestore';
import {
  MembershipPlan,
  TrainerProfile,
  PaymentGateway,
  PaymentTransaction
} from '../../types';
import { DEFAULT_MEMBERSHIP_PLANS, INITIAL_TRAINERS } from '../../services/db';
import { getCachedData, setCachedData } from '../../services/cacheService';
import { TrainerIdentityBadge } from '../common/Badge';
import { RazorpayCheckoutModal } from '../common/RazorpayCheckoutModal';
import { exportSinglePaymentInvoicePdf } from '../../services/pdfExportService';
import { usePdfDownload } from '../../context/PdfDownloadContext';
import {
  getPaymentGateways,
  getActiveOnlineGateway,
  submitOfflinePaymentRequest,
  validatePromoCouponCode,
  calculateCheckoutAmountsWithCoupon,
  ONLINE_PROVIDERS
} from '../../services/paymentService';
import {
  Check,
  ShieldCheck,
  CreditCard,
  Banknote,
  Tag,
  ArrowRight,
  ArrowLeft,
  Clock,
  XCircle,
  CheckCircle2,
  X,
  Download,
  Home
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface MembershipPlansViewProps {
  onSuccessPurchase?: () => void;
}

export const MembershipPlansView: React.FC<MembershipPlansViewProps> = ({ onSuccessPurchase }) => {
  const { currentUser, clientProfile, refreshUserData } = useAuth();
  const { requestPdfDownload } = usePdfDownload();
  const [plans, setPlans] = useState<MembershipPlan[]>(() =>
    getCachedData<MembershipPlan[]>('membership_plans', DEFAULT_MEMBERSHIP_PLANS)
  );
  const [trainers, setTrainers] = useState<TrainerProfile[]>(() =>
    getCachedData<TrainerProfile[]>('trainers_active', INITIAL_TRAINERS)
  );
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);

  // 2-Step Checkout Modal state triggered by clicking "Buy Now" on a plan card
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlan | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState<boolean>(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);

  const [addPt, setAddPt] = useState<boolean>(false);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>(() => {
    const cachedT = getCachedData<TrainerProfile[]>('trainers_active', INITIAL_TRAINERS);
    return cachedT[0]?.trainerId || '';
  });
  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedCouponCode, setAppliedCouponCode] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [couponError, setCouponError] = useState<string>('');
  const [couponSuccess, setCouponSuccess] = useState<string>('');

  // Strictly TWO payment methods in Step 2: 'online' or 'offline_cash'
  const [paymentTier, setPaymentTier] = useState<'online' | 'offline_cash'>('online');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Client's Pending / Recent Offline Requests
  const [myOfflineRequests, setMyOfflineRequests] = useState<PaymentTransaction[]>([]);

  // Online Gateway Modal & Post-Payment Success Confirmation Modal
  const [isOnlineModalOpen, setIsOnlineModalOpen] = useState<boolean>(false);
  const [activatedSuccessTxn, setActivatedSuccessTxn] = useState<PaymentTransaction | null>(null);
  const [isDownloadingSuccessPdf, setIsDownloadingSuccessPdf] = useState<boolean>(false);

  const PT_MONTHLY_RATE = 3500;

  useEffect(() => {
    async function loadData() {
      try {
        const tSnap = await getDocs(query(collection(db, 'trainerProfiles'), limit(20)));
        if (!tSnap.empty) {
          const loadedT = tSnap.docs
            .map((d) => ({ trainerId: d.id, ...d.data() } as TrainerProfile))
            .filter((t) => t.status === 'active' && t.ptAvailable);
          setTrainers(loadedT);
          setCachedData('trainers_active', loadedT);
          if (loadedT.length > 0) {
            setSelectedTrainerId((prev) => prev || loadedT[0].trainerId);
          }
        }

        const loadedGateways = await getPaymentGateways();
        setGateways(loadedGateways);
      } catch (err) {
        console.warn('Error loading membership data:', err);
      }
    }
    loadData();

    // Real-time listener for Membership Plans so deleted/archived plans disappear immediately
    const unsubPlans = onSnapshot(
      query(collection(db, 'membershipPlans'), limit(25)),
      (snap) => {
        if (!snap.empty) {
          const loaded = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as MembershipPlan))
            .filter((p) => p.active !== false)
            .sort((a, b) => a.durationMonths - b.durationMonths);
          setPlans(loaded);
          setCachedData('membership_plans', loaded);
          setSelectedPlan((prev) => {
            if (prev && loaded.some((p) => p.id === prev.id)) {
              return loaded.find((p) => p.id === prev.id) || null;
            }
            return null;
          });
        }
      },
      (err) => console.warn('Plans listener note:', err)
    );

    let unsubTx: (() => void) | undefined;
    if (currentUser?.uid) {
      const qTx = query(
        collection(db, 'paymentTransactions'),
        where('clientId', '==', currentUser.uid),
        limit(25)
      );
      unsubTx = onSnapshot(
        qTx,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as PaymentTransaction))
            .filter((t) => t.paymentMode === 'cash' || t.gatewayProvider === 'offline_cash')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setMyOfflineRequests(list);
        },
        (err) => console.warn('Offline requests listener note:', err)
      );
    }

    return () => {
      unsubPlans();
      if (unsubTx) unsubTx();
    };
  }, [currentUser?.uid]);

  const handleOpenBuyNowModal = (plan: MembershipPlan) => {
    setSelectedPlan(plan);
    setCheckoutStep(1);
    setAddPt(false);
    setCouponCode('');
    setAppliedCouponCode('');
    setDiscountPercent(0);
    setCouponError('');
    setCouponSuccess('');
    setPaymentTier('online');
    setStatusFeedback(null);
    setIsCheckoutModalOpen(true);
  };

  const handleCloseBuyNowModal = () => {
    if (isProcessing) return;
    setIsCheckoutModalOpen(false);
  };

  const handleApplyCoupon = async () => {
    setCouponError('');
    setCouponSuccess('');
    if (!couponCode.trim()) return;

    const result = await validatePromoCouponCode(couponCode, { addPt, planId: selectedPlan?.id });
    if (!result.valid) {
      setDiscountPercent(0);
      setAppliedCouponCode('');
      setCouponError(result.error || 'Invalid or expired coupon code.');
      return;
    }

    const pct = Number(result.discountPercent || 0);
    const cleanCode = result.code || couponCode.trim().toUpperCase();
    setDiscountPercent(pct);
    setAppliedCouponCode(cleanCode);
    setCouponCode(cleanCode);

    if (pct >= 100) {
      setCouponSuccess(
        '100% Discount applied! A nominal ₹1 token fee is required to verify and activate your membership record.'
      );
    } else {
      setCouponSuccess(
        `${pct}% OFF (${result.offer?.title || cleanCode}) Applied!`
      );
    }
  };

  const handleClearCoupon = () => {
    setCouponCode('');
    setAppliedCouponCode('');
    setDiscountPercent(0);
    setCouponError('');
    setCouponSuccess('');
  };

  const getEffectivePlanPrice = (plan: MembershipPlan): number => {
    if (plan.isDiscountActive && plan.discountPercent) {
      return Math.round(plan.price * (1 - plan.discountPercent / 100));
    }
    if (plan.isDiscountActive && plan.discountAmount) {
      return Math.max(0, plan.price - plan.discountAmount);
    }
    return plan.price;
  };

  const calculateSubtotal = (): number => {
    if (!selectedPlan) return 0;
    const basePlanPrice = getEffectivePlanPrice(selectedPlan);
    const ptFee = addPt ? PT_MONTHLY_RATE * selectedPlan.durationMonths : 0;
    return basePlanPrice + ptFee;
  };

  const calculateDiscountAmount = (): number => {
    const amounts = calculateCheckoutAmountsWithCoupon(
      calculateSubtotal(),
      discountPercent,
      appliedCouponCode
    );
    return amounts.discountAmount;
  };

  const calculateTotal = (): number => {
    const amounts = calculateCheckoutAmountsWithCoupon(
      calculateSubtotal(),
      discountPercent,
      appliedCouponCode
    );
    return amounts.finalAmount;
  };

  const activeOnlineGateway = getActiveOnlineGateway(gateways);

  const handleCompleteCheckout = async () => {
    if (!selectedPlan || !currentUser || isProcessing) return;
    setStatusFeedback(null);

    // Re-validate applied coupon limit right before checkout
    if (appliedCouponCode) {
      const checkRes = await validatePromoCouponCode(appliedCouponCode, { addPt, planId: selectedPlan?.id });
      if (!checkRes.valid) {
        setDiscountPercent(0);
        setAppliedCouponCode('');
        setCouponSuccess('');
        setCouponError(
          checkRes.error || 'Coupon limit reached. This promo code is no longer available.'
        );
        setCheckoutStep(1);
        return;
      }
    }

    if (paymentTier === 'online') {
      if (!activeOnlineGateway) {
        setStatusFeedback({
          type: 'error',
          text: 'Online gateway is currently disabled by Admin. Please select Offline Cash Desk Request.'
        });
        return;
      }
      setIsCheckoutModalOpen(false);
      setIsOnlineModalOpen(true);
      return;
    }

    // Method A: Offline / Cash Payment via Admin Approval Request
    setIsProcessing(true);
    try {
      const chosenTrainer = trainers.find((t) => t.trainerId === selectedTrainerId);
      const itemLabel = `${selectedPlan.name} (${selectedPlan.durationMonths}m)${addPt ? ' + PT' : ''}`;

      const { transaction } = await submitOfflinePaymentRequest({
        clientId: currentUser.uid,
        clientName: clientProfile?.displayName || currentUser.displayName,
        clientPhone: clientProfile?.phone || currentUser.phone,
        clientEmail: clientProfile?.email || currentUser.email,
        purpose: clientProfile?.membershipStatus === 'active' ? 'renewal' : 'membership',
        itemTitle: itemLabel,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        durationMonths: selectedPlan.durationMonths,
        originalPrice: calculateSubtotal(),
        couponCode: appliedCouponCode || '',
        discountPercent,
        discountAmount: calculateDiscountAmount(),
        finalAmount: calculateTotal(),
        ptIncluded: addPt,
        ptTrainerId: addPt ? selectedTrainerId : undefined,
        ptTrainerName: addPt ? chosenTrainer?.displayName : undefined
      });

      handleClearCoupon();
      setIsCheckoutModalOpen(false);
      setStatusFeedback({
        type: 'info',
        text: `Offline Cash Request (${transaction.referenceId}) submitted! Please hand over ₹${calculateTotal().toLocaleString(
          'en-IN'
        )} at the reception desk. Your membership will automatically activate once the Admin approves it.`
      });
    } catch (err: any) {
      console.warn('[Offline Payment Request Submission Warning]:', err);
      setStatusFeedback({
        type: 'error',
        text: 'Failed to submit offline payment request: ' + (err.message || 'Please try again')
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Instant Auto-Activation upon Online Gateway Success
  const handleOnlinePaymentSuccess = async (transaction: PaymentTransaction) => {
    try {
      setIsOnlineModalOpen(false);
      setIsCheckoutModalOpen(false);
      setIsProcessing(false);
      handleClearCoupon();
      setActivatedSuccessTxn(transaction);

      await refreshUserData();

      try {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      } catch {}
    } catch (err: any) {
      console.warn('[Post-Payment UI State Sync Warning]:', err);
      const payId =
        transaction?.paymentId ||
        transaction?.razorpayPaymentId ||
        transaction?.referenceId ||
        transaction?.id;
      setStatusFeedback({
        type: 'error',
        text: `Payment verified (Payment ID: ${payId}), but UI refresh encountered an issue: ${
          err?.message || 'Please refresh page'
        }`
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSuccessInvoice = () => {
    if (!activatedSuccessTxn) return;

    requestPdfDownload({
      portalType: 'client',
      documentName: `Invoice #${activatedSuccessTxn.receiptNumber} (${
        activatedSuccessTxn.planName || activatedSuccessTxn.itemTitle || 'Membership Plan'
      })`,
      customTitle: 'Download Invoice',
      customMessage: 'Do you want to download the official payment receipt for this transaction?',
      onConfirm: async () => {
        setIsDownloadingSuccessPdf(true);
        try {
          await exportSinglePaymentInvoicePdf({
            id: activatedSuccessTxn.id,
            receiptNumber: activatedSuccessTxn.receiptNumber,
            referenceId:
              activatedSuccessTxn.paymentId ||
              activatedSuccessTxn.razorpayPaymentId ||
              activatedSuccessTxn.referenceId ||
              activatedSuccessTxn.id,
            clientId: activatedSuccessTxn.clientId,
            clientName: activatedSuccessTxn.clientName,
            clientPhone: activatedSuccessTxn.clientPhone || '',
            planName: activatedSuccessTxn.planName || activatedSuccessTxn.itemTitle,
            validityPeriod: `${activatedSuccessTxn.startDate || 'Now'} → ${
              activatedSuccessTxn.endDate || 'Active'
            }`,
            paymentModeLabel: `${activatedSuccessTxn.gatewayName || 'Razorpay'} Online`,
            paymentModeType: 'online',
            timestamp: new Date(
              activatedSuccessTxn.timestamp || activatedSuccessTxn.createdAt
            ).toLocaleString('en-IN'),
            rawDate: activatedSuccessTxn.createdAt,
            originalPrice:
              activatedSuccessTxn.originalPrice ?? activatedSuccessTxn.amount,
            couponCode: activatedSuccessTxn.couponCode || 'NONE',
            discountPercent: activatedSuccessTxn.discountPercent || 0,
            discountAmount: activatedSuccessTxn.discountAmount || 0,
            finalAmount:
              activatedSuccessTxn.finalAmount ?? activatedSuccessTxn.amount,
            status: 'ACTIVE',
            verificationStatus: 'ACTIVE'
          });
        } finally {
          setIsDownloadingSuccessPdf(false);
        }
      }
    });
  };

  const pendingOfflineReq = myOfflineRequests.find((r) => r.status === 'pending');
  const latestRejectedOfflineReq =
    !pendingOfflineReq && clientProfile?.offlineRequestStatus === 'rejected'
      ? myOfflineRequests.find((r) => r.status === 'rejected')
      : null;

  const handleDismissRejection = async () => {
    if (!currentUser?.uid) return;
    try {
      await updateDoc(doc(db, 'clientProfiles', currentUser.uid), {
        offlineRequestStatus: 'none',
        offlineRejectionReason: ''
      });
    } catch {}
  };

  return (
    <div className="space-y-4 pb-20 text-slate-800 animate-fade-in">
      {/* Header and Active Status Card */}
      <div className="vision-surface rounded-3xl p-5 border border-white/80 shadow-xl relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-indigo-700 block">
              Membership Catalog
            </span>
            <h2 className="text-xl font-black mt-0.5 tracking-tight text-slate-900">
              Torrent Gym Plans
            </h2>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">Status</span>
            <span
              className={`inline-block px-3 py-1 rounded-lg text-xs font-bold border ${
                String(clientProfile?.membershipStatus || '').toLowerCase() === 'active'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                  : pendingOfflineReq
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {String(clientProfile?.membershipStatus || '').toLowerCase() === 'active'
                ? 'ACTIVE MEMBER'
                : pendingOfflineReq
                ? 'PENDING CASH APPROVAL'
                : 'INACTIVE'}
            </span>
          </div>
        </div>

        {String(clientProfile?.membershipStatus || '').toLowerCase() === 'active' && (
          <div className="mt-3.5 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 relative z-10 tabular-nums">
            <span>
              Plan:{' '}
              <strong className="text-slate-900">
                {clientProfile?.membershipPlanName || clientProfile?.membershipPlan || 'Active'}
              </strong>
            </span>
            <span>
              Valid: <strong className="text-slate-900">{clientProfile?.membershipStartDate || 'Now'}</strong> →{' '}
              <strong className="text-indigo-600 font-bold">
                {clientProfile?.membershipEndDate || clientProfile?.membershipExpiryDate}
              </strong>
            </span>
          </div>
        )}

        {/* Seamless Membership Stacking Badge */}
        {clientProfile?.queuedPlanName && clientProfile?.queuedStartDate && (
          <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl shadow-xs">
            <span className="text-xs font-black text-indigo-950 block">
              Current Plan: Active until {clientProfile?.membershipEndDate || clientProfile?.membershipExpiryDate} | Next Plan: Queued to start on {clientProfile.queuedStartDate}
            </span>
            <span className="text-[11px] text-indigo-700 font-semibold block mt-0.5">
              Queued Plan: {clientProfile.queuedPlanName} ({clientProfile.queuedDurationMonths || 1}M) - Automatically stacks and begins without losing any days!
            </span>
          </div>
        )}
      </div>

      {/* Live Method A Pending Offline Verification Banner */}
      {pendingOfflineReq && (
        <div className="p-4 rounded-2xl bg-amber-50/95 border border-amber-300 text-amber-950 shadow-sm space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                Pending Offline Cash Verification
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-200/70 text-amber-900">
              {pendingOfflineReq.referenceId || pendingOfflineReq.receiptNumber}
            </span>
          </div>
          <p className="text-xs text-amber-900 font-medium leading-relaxed">
            Your offline payment request is in the Admin Panel&apos;s <strong>Pending Offline Approvals</strong> queue.
            Your membership activates once reception verifies your cash payment.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] bg-white/80 p-2.5 rounded-xl border border-amber-200/80 tabular-nums">
            <div>
              <span className="text-[10px] text-slate-500 block font-semibold">Plan Chosen</span>
              <strong className="text-slate-900">{pendingOfflineReq.planName || pendingOfflineReq.itemTitle}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block font-semibold">Final Price</span>
              <strong className="text-emerald-700 font-black">
                ₹{(pendingOfflineReq.finalAmount ?? pendingOfflineReq.amount).toLocaleString('en-IN')}
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block font-semibold">Applied Coupon</span>
              <strong className="text-indigo-700 font-mono">{pendingOfflineReq.couponCode || 'NONE'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block font-semibold">Requested On</span>
              <strong className="text-slate-800">
                {new Date(pendingOfflineReq.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Rejected Offline Request Notification */}
      {(latestRejectedOfflineReq || clientProfile?.offlineRequestStatus === 'rejected') && (
        <div className="p-4 rounded-2xl bg-rose-50/95 border border-rose-300 text-rose-950 shadow-sm flex items-start justify-between gap-3 animate-fade-in">
          <div className="flex items-start gap-2.5">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <span className="font-black uppercase tracking-wider text-rose-900 block">
                Offline Cash Payment Request Declined
              </span>
              <p className="text-rose-800 font-medium">
                {clientProfile?.offlineRejectionReason ||
                  latestRejectedOfflineReq?.rejectionReason ||
                  'Your offline cash request was cancelled by the Admin desk. Please pay online for instant activation or check with reception.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissRejection}
            className="p-1 rounded-lg hover:bg-rose-200/60 text-rose-700"
            title="Dismiss Notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Inline Status Feedback */}
      {statusFeedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            statusFeedback.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-sky-50 border-sky-300 text-sky-950'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-600" />
            <span>{statusFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="p-1 text-slate-500 hover:text-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Membership Plan Catalog Cards with Direct "Buy Now" Buttons */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            Available Membership Plans
          </h3>
          <span className="text-xs font-semibold text-slate-500 tabular-nums">
            {plans.length} {plans.length === 1 ? 'Tier' : 'Tiers'}
          </span>
        </div>

        <div className="space-y-3">
          {plans.map((plan) => {
            const effectivePrice = getEffectivePlanPrice(plan);
            return (
              <div
                key={plan.id}
                className={`relative p-5 rounded-3xl border transition-all vision-surface ${
                  plan.popular
                    ? 'border-indigo-400/90 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/20'
                    : 'border-white/85 shadow-sm hover:border-indigo-300'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 right-5 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white shadow-xs">
                    Most Popular
                  </span>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">
                      {plan.name}
                    </h4>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      {plan.durationMonths} {plan.durationMonths === 1 ? 'Month' : 'Months'} · Full Gym Access
                    </p>
                  </div>

                  <div className="text-right tabular-nums shrink-0">
                    {plan.isDiscountActive && (plan.discountPercent || plan.discountAmount) ? (
                      <>
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-[10px] font-black text-emerald-700">
                            {plan.discountTag ||
                              (plan.discountPercent ? `${plan.discountPercent}% OFF` : `₹${plan.discountAmount} OFF`)}
                          </span>
                          <span className="text-xl font-black text-indigo-700">
                            ₹{effectivePrice.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 line-through">
                          ₹{plan.price.toLocaleString('en-IN')}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xl font-black text-slate-900">
                          ₹{plan.price.toLocaleString('en-IN')}
                        </div>
                        {plan.originalPrice && (
                          <div className="text-[11px] text-slate-400 line-through">
                            ₹{plan.originalPrice.toLocaleString('en-IN')}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Benefits */}
                <div className="mt-3.5 pt-3 border-t border-slate-200/70 grid grid-cols-1 gap-1.5 text-xs text-slate-700 font-medium">
                  {plan.benefits.map((b, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-600 font-bold shrink-0" />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>

                {/* Direct "Buy Now" Action Button */}
                <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                    Effective: <strong className="text-slate-900">₹{effectivePrice.toLocaleString('en-IN')}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenBuyNowModal(plan)}
                    className="py-2.5 px-5 vision-btn-aurora text-white text-xs font-black rounded-xl shadow-md hover:opacity-95 active:scale-[0.98] transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <span>Buy Now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2-STEP CHECKOUT MODAL UPON CLICKING "BUY NOW" */}
      {isCheckoutModalOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface rounded-3xl border border-white/90 shadow-2xl overflow-hidden text-slate-800 max-h-[90vh] flex flex-col">
            {/* Modal Header with 2-Step Progress Indicator */}
            <div className="p-5 bg-white/90 border-b border-slate-200/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-700">
                  <span>Step {checkoutStep} of 2</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {checkoutStep === 1 ? 'Plan Summary & Coupon' : 'Select Payment Method'}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 tracking-tight mt-0.5">
                  {selectedPlan.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseBuyNowModal}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                title="Close Checkout"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step Progress Bar */}
            <div className="grid grid-cols-2 gap-1 px-5 pt-3 bg-white/60">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  checkoutStep >= 1 ? 'bg-indigo-600' : 'bg-slate-200'
                }`}
              />
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  checkoutStep === 2 ? 'bg-indigo-600' : 'bg-slate-200'
                }`}
              />
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {checkoutStep === 1 ? (
                /* STEP 1: PLAN SUMMARY, OPTIONAL PT & APPLY COUPON CODE */
                <>
                  {/* Selected Plan Overview */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 space-y-2 tabular-nums">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block">
                          Selected Membership Tier
                        </span>
                        <h4 className="text-sm font-black text-slate-900">
                          {selectedPlan.name} ({selectedPlan.durationMonths}{' '}
                          {selectedPlan.durationMonths === 1 ? 'Month' : 'Months'})
                        </h4>
                      </div>
                      <span className="text-base font-black text-indigo-700">
                        ₹{getEffectivePlanPrice(selectedPlan).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  {/* Seamless Stacking Notice if active member */}
                  {String(clientProfile?.membershipStatus || '').toLowerCase() === 'active' &&
                    clientProfile?.membershipEndDate &&
                    new Date(clientProfile.membershipEndDate) >= new Date() && (
                      <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-xl text-xs text-indigo-950 font-medium space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Seamless Plan Stacking Active</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-indigo-800">
                          Your current membership is valid until{' '}
                          <strong>{clientProfile.membershipEndDate}</strong>. This new purchase will
                          be safely <strong>Queued</strong> to begin on{' '}
                          <strong>
                            {(() => {
                              const d = new Date(`${clientProfile.membershipEndDate}T00:00:00`);
                              d.setDate(d.getDate() + 1);
                              return d.toISOString().split('T')[0];
                            })()}
                          </strong>
                          , ensuring zero loss of remaining days!
                        </p>
                      </div>
                    )}

                  {/* Optional PT Add-on */}
                  <div className="p-3.5 rounded-2xl bg-white/90 border border-slate-200/90 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="checkoutAddPtCheck"
                        className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          id="checkoutAddPtCheck"
                          checked={addPt}
                          onChange={(e) => setAddPt(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>Add 1-on-1 Personal Trainer (PT)</span>
                      </label>
                      <span className="text-xs font-bold text-indigo-600 tabular-nums">
                        +₹{(PT_MONTHLY_RATE * selectedPlan.durationMonths).toLocaleString('en-IN')}
                      </span>
                    </div>

                    {addPt && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-2">
                        <label className="block text-[11px] font-semibold text-slate-600">
                          Choose Certified Coach:
                        </label>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {trainers.map((tr) => (
                            <div
                              key={tr.trainerId}
                              onClick={() => setSelectedTrainerId(tr.trainerId)}
                              className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all ${
                                selectedTrainerId === tr.trainerId
                                  ? 'border-indigo-500 bg-indigo-50/50'
                                  : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <img
                                  src={tr.photoUrl}
                                  alt={tr.displayName}
                                  referrerPolicy="no-referrer"
                                  className="w-7 h-7 rounded-full object-cover border border-slate-200"
                                />
                                <div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-slate-900">
                                      {tr.displayName}
                                    </span>
                                    <TrainerIdentityBadge badge={tr.badge} showLabel={false} />
                                  </div>
                                </div>
                              </div>
                              <span className="text-[11px] font-bold text-amber-600">
                                ★ {(tr.rating || 5.0).toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Apply Coupon Code Box */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Apply Coupon Code</span>
                      </label>
                      {appliedCouponCode && (
                        <button
                          type="button"
                          onClick={handleClearCoupon}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-800 underline"
                        >
                          Remove ({appliedCouponCode})
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter Promo Code (e.g. TORRENT10, VIP100)"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs uppercase bg-slate-50 text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25 font-mono font-bold"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-2xs whitespace-nowrap"
                      >
                        Apply
                      </button>
                    </div>

                    {couponSuccess && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-bold flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{couponSuccess}</span>
                      </div>
                    )}
                    {couponError && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-bold flex items-start gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span>{couponError}</span>
                      </div>
                    )}
                  </div>

                  {/* Step 1 Price Breakdown */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5 tabular-nums text-xs">
                    <div className="flex items-center justify-between gap-3 text-slate-600 font-medium">
                      <span className="flex-1 text-left">Base Plan Price</span>
                      <span className="shrink-0 text-right font-bold text-slate-900">
                        ₹{getEffectivePlanPrice(selectedPlan).toLocaleString('en-IN')}
                      </span>
                    </div>
                    {addPt && (
                      <div className="flex items-center justify-between gap-3 text-indigo-700 font-bold">
                        <span className="flex-1 text-left">1-on-1 Personal Trainer ({selectedPlan.durationMonths}m)</span>
                        <span className="shrink-0 text-right">+₹{(PT_MONTHLY_RATE * selectedPlan.durationMonths).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {discountPercent > 0 && (
                      <div className="flex items-center justify-between gap-3 text-emerald-700 font-bold leading-snug">
                        <span className="flex-1 text-left min-w-0 truncate">
                          Coupon Discount ({appliedCouponCode})
                        </span>
                        <span className="shrink-0 text-right font-mono font-black whitespace-nowrap min-w-[80px]">
                          - ₹{calculateDiscountAmount().toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}

                    {discountPercent >= 100 && (
                      <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-950 font-bold flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                        <span className="flex-1 text-left leading-relaxed">
                          100% Discount Rule: A mandatory ₹1 token payment is required to verify and activate your membership.
                        </span>
                      </div>
                    )}

                    <div className="pt-3 mt-1.5 border-t border-slate-200 flex items-center justify-between gap-3">
                      <span className="flex-1 text-left text-xs font-bold text-slate-700">
                        {discountPercent >= 100 ? 'Total Amount Paid (Token):' : 'Total Amount Paid:'}
                      </span>
                      <span className="shrink-0 text-right text-lg font-black text-slate-900 font-mono">
                        ₹{calculateTotal().toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  {/* Continue to Step 2 CTA */}
                  <button
                    type="button"
                    onClick={() => setCheckoutStep(2)}
                    className="w-full py-3.5 px-4 vision-btn-aurora text-white text-xs font-black rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                  >
                    <span>Continue to Payment Method</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                /* STEP 2: SELECT PAYMENT METHOD (Online Gateway vs Offline Cash Desk) */
                <>
                  {/* Compact Payable Summary Bar */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 flex items-center justify-between tabular-nums">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 block">
                        {selectedPlan.name}
                        {appliedCouponCode ? ` · Coupon ${appliedCouponCode}` : ''}
                      </span>
                      <span className="text-base font-black text-slate-900">
                        Payable: ₹{calculateTotal().toLocaleString('en-IN')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCheckoutStep(1)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Edit Plan / Coupon</span>
                    </button>
                  </div>

                  {/* Two Payment Options */}
                  <div className="space-y-2.5">
                    <label className="block text-xs font-black text-slate-800">
                      Choose Your Payment Option
                    </label>

                    {/* Option 1: Online Gateway (Razorpay / Integrated Gateway) */}
                    <button
                      type="button"
                      onClick={() => setPaymentTier('online')}
                      className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                        paymentTier === 'online'
                          ? 'border-indigo-600 bg-white shadow-sm ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white/80 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shrink-0 text-white shadow-xs">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center flex-wrap gap-1.5">
                            <span className="text-xs font-black text-slate-900">
                              Online Gateway ({activeOnlineGateway?.name.split(' ')[0] || 'Razorpay'})
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700">
                              · Instant Activation
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Pay via UPI, QR, Cards, or NetBanking. Membership activates immediately.
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 pl-2">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            paymentTier === 'online'
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {paymentTier === 'online' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                      </div>
                    </button>

                    {/* Option 2: Offline Cash Desk Request */}
                    <button
                      type="button"
                      onClick={() => setPaymentTier('offline_cash')}
                      className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                        paymentTier === 'offline_cash'
                          ? 'border-amber-500 bg-white shadow-sm ring-2 ring-amber-500/20'
                          : 'border-slate-200 bg-white/80 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shrink-0 text-white shadow-xs">
                          <Banknote className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center flex-wrap gap-1.5">
                            <span className="text-xs font-black text-slate-900">
                              Offline Cash Desk Request
                            </span>
                            <span className="text-[10px] font-bold text-amber-700">
                              · Admin Approval
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Creates a pending cash approval request for reception. Activates upon Admin verification.
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 pl-2">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            paymentTier === 'offline_cash'
                              ? 'border-amber-600 bg-amber-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {paymentTier === 'offline_cash' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Step 2 Final Submit Button */}
                  <button
                    type="button"
                    onClick={handleCompleteCheckout}
                    disabled={isProcessing || isOnlineModalOpen}
                    className={`w-full py-3.5 px-5 text-white text-xs font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] tabular-nums ${
                      paymentTier === 'online'
                        ? 'vision-btn-aurora'
                        : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'
                    }`}
                  >
                    {isProcessing ? (
                      'Processing Request...'
                    ) : (
                      <>
                        <span>
                          {paymentTier === 'online'
                            ? `Pay ₹${calculateTotal().toLocaleString('en-IN')} Online Now`
                            : `Submit ₹${calculateTotal().toLocaleString('en-IN')} Cash Desk Request`}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UNIVERSAL ONLINE GATEWAY CHECKOUT MODAL */}
      <RazorpayCheckoutModal
        isOpen={isOnlineModalOpen}
        onClose={() => setIsOnlineModalOpen(false)}
        gateway={activeOnlineGateway}
        amount={calculateTotal()}
        originalPrice={calculateSubtotal()}
        couponCode={appliedCouponCode}
        discountAmount={calculateDiscountAmount()}
        discountPercent={discountPercent}
        durationMonths={selectedPlan?.durationMonths || 1}
        itemTitle={`${selectedPlan?.name || 'Membership'} (${selectedPlan?.durationMonths || 1}m)${addPt ? ' + PT' : ''}`}
        planId={selectedPlan?.id}
        planName={selectedPlan?.name}
        clientId={currentUser?.uid || ''}
        clientName={clientProfile?.displayName || currentUser?.displayName || 'Member'}
        clientPhone={clientProfile?.phone || currentUser?.phone}
        clientEmail={clientProfile?.email || currentUser?.email}
        ptIncluded={addPt}
        ptTrainerId={addPt ? selectedTrainerId : undefined}
        ptTrainerName={addPt ? trainers.find((t) => t.trainerId === selectedTrainerId)?.displayName : undefined}
        purpose={String(clientProfile?.membershipStatus || '').toLowerCase() === 'active' ? 'renewal' : 'membership'}
        onSuccess={handleOnlinePaymentSuccess}
      />

      {/* POST-PAYMENT SUCCESS CONFIRMATION MODAL ("Payment Successful! Membership Activated") */}
      {activatedSuccessTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface rounded-3xl p-6 border border-white/90 shadow-2xl text-slate-800 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-700 block">
                    Instant Verification Complete
                  </span>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Payment Successful! Membership Activated
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivatedSuccessTxn(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-white border border-slate-200/90 text-xs tabular-nums">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Plan Activated
                </span>
                <strong className="text-slate-900 font-black block mt-0.5">
                  {activatedSuccessTxn.planName || activatedSuccessTxn.itemTitle}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Amount Paid
                </span>
                <strong className="text-emerald-700 font-black block mt-0.5">
                  ₹{(activatedSuccessTxn.finalAmount ?? activatedSuccessTxn.amount).toLocaleString('en-IN')}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Payment ID
                </span>
                <strong className="text-indigo-700 font-mono font-bold block mt-0.5 break-all">
                  {activatedSuccessTxn.paymentId ||
                    activatedSuccessTxn.razorpayPaymentId ||
                    activatedSuccessTxn.referenceId}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Validity Period
                </span>
                <strong className="text-slate-800 font-mono block mt-0.5">
                  {activatedSuccessTxn.startDate} → {activatedSuccessTxn.endDate}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={isDownloadingSuccessPdf}
                onClick={handleDownloadSuccessInvoice}
                className="py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloadingSuccessPdf ? 'Generating PDF...' : 'Download Invoice (PDF)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActivatedSuccessTxn(null);
                  if (onSuccessPurchase) {
                    onSuccessPurchase();
                  }
                }}
                className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all whitespace-nowrap"
              >
                <Home className="w-4 h-4" />
                <span>Go to Home</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
