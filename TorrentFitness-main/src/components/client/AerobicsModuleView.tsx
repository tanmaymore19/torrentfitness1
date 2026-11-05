import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import {
  AerobicsBatch,
  AerobicsSubscription,
  PaymentGateway,
  PaymentTransaction
} from '../../types';
import { INITIAL_AEROBICS_BATCHES } from '../../services/db';
import {
  getPaymentGateways,
  getActiveOnlineGateway,
  submitOfflinePaymentRequest,
  validatePromoCouponCode,
  calculateCheckoutAmountsWithCoupon,
  ONLINE_PROVIDERS
} from '../../services/paymentService';
import { RazorpayCheckoutModal } from '../common/RazorpayCheckoutModal';
import { PaymentReceiptModal } from '../common/PaymentReceiptModal';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  Clock,
  Music,
  Calendar,
  CheckCircle2,
  Users,
  ShieldCheck,
  CreditCard,
  Banknote,
  QrCode,
  ArrowRight,
  UserCheck,
  X
} from 'lucide-react';

export const AerobicsModuleView: React.FC = () => {
  const { currentUser, clientProfile, updateClientProfile } = useAuth();

  // Strict Female-Only Access Guard (Male or Other profiles must NEVER see or access this module)
  const memberGender = (clientProfile?.gender || currentUser?.gender || '').trim().toLowerCase();
  const isFemaleClient = currentUser?.role === 'client' && memberGender === 'female';

  const [batches, setBatches] = useState<AerobicsBatch[]>(INITIAL_AEROBICS_BATCHES);
  const [mySubscriptions, setMySubscriptions] = useState<AerobicsSubscription[]>([]);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [paymentTier, setPaymentTier] = useState<'online' | 'offline_cash'>('online');

  // Selected plan duration per batch card ('monthly' | 'quarterly')
  const [batchPlanDurationMap, setBatchPlanDurationMap] = useState<Record<string, 'monthly' | 'quarterly'>>({});

  // Enrollment Checkout Modal State
  const [checkoutBatch, setCheckoutBatch] = useState<AerobicsBatch | null>(null);
  const [checkoutDuration, setCheckoutDuration] = useState<'monthly' | 'quarterly'>('monthly');
  const [aeroCouponInput, setAeroCouponInput] = useState<string>('');
  const [appliedAeroCoupon, setAppliedAeroCoupon] = useState<string>('');
  const [aeroDiscountPct, setAeroDiscountPct] = useState<number>(0);
  const [aeroCouponSuccess, setAeroCouponSuccess] = useState<string>('');
  const [aeroCouponError, setAeroCouponError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isRazorpayOpen, setIsRazorpayOpen] = useState<boolean>(false);
  const [completedTxn, setCompletedTxn] = useState<PaymentTransaction | null>(null);
  const [enrollmentBanner, setEnrollmentBanner] = useState<string>('');

  useEffect(() => {
    if (!isFemaleClient || !currentUser) return;

    const unsubBatches = onSnapshot(
      collection(db, 'aerobicsBatches'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            monthlyPrice: d.data().monthlyPrice || 1499,
            quarterlyPrice: d.data().quarterlyPrice || 3999
          } as AerobicsBatch));
          setBatches(list);
        }
      },
      (err) => console.warn('Aerobics batches listener note:', err)
    );

    const subQuery = query(
      collection(db, 'aerobicsSubscriptions'),
      where('clientId', '==', currentUser.uid)
    );
    const unsubSubs = onSnapshot(
      subQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AerobicsSubscription));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setMySubscriptions(list);
      },
      (err) => console.warn('Aerobics subscriptions listener note:', err)
    );

    getPaymentGateways().then((loaded) => {
      setGateways(loaded);
    });

    return () => {
      unsubBatches();
      unsubSubs();
    };
  }, [isFemaleClient, currentUser]);

  // Hard security guard: never render for non-female clients
  if (!isFemaleClient || !currentUser) {
    return null;
  }

  const activeBatches = batches.filter((b) => b.active !== false);

  // Determine if client has an active Aerobics enrollment
  const enrolledBatch = activeBatches.find(
    (b) =>
      b.id === clientProfile?.aerobicsBatchId ||
      (Array.isArray(b.enrolledClientIds) && b.enrolledClientIds.includes(currentUser.uid))
  );

  const isAerobicsActive =
    clientProfile?.aerobicsStatus === 'active' || Boolean(enrolledBatch);

  const getSelectedDurationForBatch = (batchId: string): 'monthly' | 'quarterly' => {
    return batchPlanDurationMap[batchId] || 'monthly';
  };

  const getBatchPrice = (batch: AerobicsBatch, duration: 'monthly' | 'quarterly'): number => {
    return duration === 'quarterly'
      ? batch.quarterlyPrice || 3999
      : batch.monthlyPrice || 1499;
  };

  const handleOpenEnrollModal = (batch: AerobicsBatch) => {
    const chosenDuration = getSelectedDurationForBatch(batch.id);
    setCheckoutBatch(batch);
    setCheckoutDuration(chosenDuration);
    setAeroCouponInput('');
    setAppliedAeroCoupon('');
    setAeroDiscountPct(0);
    setAeroCouponSuccess('');
    setAeroCouponError('');
  };

  const handleApplyAeroCoupon = async () => {
    setAeroCouponError('');
    setAeroCouponSuccess('');
    if (!aeroCouponInput.trim()) return;

    const res = await validatePromoCouponCode(aeroCouponInput, { planId: checkoutBatch?.id });
    if (!res.valid) {
      setAeroDiscountPct(0);
      setAppliedAeroCoupon('');
      setAeroCouponError(res.error || 'Invalid or expired coupon code.');
      return;
    }

    const pct = Number(res.discountPercent || 0);
    const code = res.code || aeroCouponInput.trim().toUpperCase();
    setAeroDiscountPct(pct);
    setAppliedAeroCoupon(code);
    setAeroCouponInput(code);

    if (pct >= 100) {
      setAeroCouponSuccess(
        '100% Discount applied! A nominal ₹1 token fee is required to verify and activate your membership record.'
      );
    } else {
      setAeroCouponSuccess(`${pct}% OFF (${res.offer?.title || code}) Applied!`);
    }
  };

  const getAeroCheckoutAmounts = (batch: AerobicsBatch, duration: 'monthly' | 'quarterly') => {
    const basePrice = getBatchPrice(batch, duration);
    return calculateCheckoutAmountsWithCoupon(basePrice, aeroDiscountPct, appliedAeroCoupon);
  };

  const finalizeBatchSubscription = async (
    batch: AerobicsBatch,
    _duration: 'monthly' | 'quarterly',
    _amountPaid: number,
    _paymentMode: 'online' | 'cash',
    existingTxn: PaymentTransaction
  ) => {
    try {
      setIsRazorpayOpen(false);
      setIsProcessing(false);
      setCompletedTxn(existingTxn);
      setCheckoutBatch(null);
      setEnrollmentBanner(
        `🎉 Payment Successful (${
          existingTxn.paymentId || existingTxn.razorpayPaymentId || existingTxn.referenceId
        })! Enrolled in "${batch.title}" (${batch.timeSlot}). Your QR Attendance now carries the official AEROBICS badge.`
      );
      setTimeout(() => setEnrollmentBanner(''), 8000);

      try {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      } catch {}
    } catch (err: any) {
      console.error('[Aerobics Post-Payment Sync Error]:', err);
      setEnrollmentBanner(
        `Payment verified (ID: ${
          existingTxn.paymentId || existingTxn.razorpayPaymentId || existingTxn.referenceId
        }), please refresh if status does not update immediately.`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const activeGateway = getActiveOnlineGateway(gateways);

  const handleProceedPayment = async () => {
    if (!checkoutBatch || isProcessing) return;

    if (appliedAeroCoupon) {
      const checkRes = await validatePromoCouponCode(appliedAeroCoupon, { planId: checkoutBatch?.id });
      if (!checkRes.valid) {
        setAeroDiscountPct(0);
        setAppliedAeroCoupon('');
        setAeroCouponSuccess('');
        setAeroCouponError(
          checkRes.error || 'Coupon limit reached. This promo code is no longer available.'
        );
        return;
      }
    }

    if (paymentTier === 'online') {
      setIsRazorpayOpen(true);
      return;
    }

    // Method A: Offline Cash Payment Request -> Admin Approval Queue
    setIsProcessing(true);
    try {
      const amounts = getAeroCheckoutAmounts(checkoutBatch, checkoutDuration);
      const months = checkoutDuration === 'quarterly' ? 3 : 1;
      const { transaction } = await submitOfflinePaymentRequest({
        clientId: currentUser.uid,
        clientName: clientProfile?.displayName || currentUser.displayName,
        clientPhone: clientProfile?.phone || currentUser.phone,
        clientEmail: clientProfile?.email || currentUser.email,
        purpose: 'aerobics',
        itemTitle: `Aerobics Batch: ${checkoutBatch.title} (${checkoutDuration === 'quarterly' ? '3 Months' : '1 Month'})`,
        planId: checkoutBatch.id,
        planName: `Aerobics: ${checkoutBatch.title}`,
        durationMonths: months,
        originalPrice: amounts.originalPrice,
        couponCode: appliedAeroCoupon || '',
        discountPercent: aeroDiscountPct,
        discountAmount: amounts.discountAmount,
        finalAmount: amounts.finalAmount,
        metadata: {
          batchId: checkoutBatch.id,
          batchName: checkoutBatch.title,
          slotTiming: checkoutBatch.timeSlot,
          instructorName: checkoutBatch.instructorName,
          planDuration: checkoutDuration
        }
      });

      setCheckoutBatch(null);
      setEnrollmentBanner(
        `Offline Cash Request (${transaction.referenceId}) submitted for "${checkoutBatch.title}". Your Aerobics batch will activate immediately once Admin approves your cash payment.`
      );
    } catch (err: any) {
      console.error('[Aerobics Offline Payment Request Error]:', err);
      setEnrollmentBanner('Error submitting request: ' + (err.message || 'Please try again.'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 pb-8 text-slate-800 animate-fade-in">
      {/* Women-Exclusive Aerobics Batches & Membership Header */}
      <div className="rounded-3xl p-5 bg-gradient-to-tr from-rose-500/18 via-fuchsia-500/14 to-amber-400/15 border border-rose-300/80 backdrop-blur-xl shadow-[0_14px_34px_rgba(244,63,94,0.12),inset_0_1px_2px_rgba(255,255,255,0.9)] relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-36 h-36 bg-rose-400/20 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-xs">
                <Sparkles className="w-3 h-3" />
                Women-Only Studio Batches
              </span>
              {isAerobicsActive && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  AEROBICS SUBSCRIPTION ACTIVE
                </span>
              )}
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Aerobics Batches &amp; Membership
            </h2>
            <p className="text-xs text-slate-700 font-medium leading-relaxed">
              Select your preferred studio batch slot below and enroll with Monthly or Quarterly membership. Your regular Gym QR check-in automatically tags your Aerobics status.
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-pink-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/25 shrink-0 border border-white/70">
            <Music className="w-6 h-6" strokeWidth={1.75} />
          </div>
        </div>
      </div>

      {/* Enrollment Toast Notice */}
      {enrollmentBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{enrollmentBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setEnrollmentBanner('')}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-black px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Aerobics Enrollment Pass (Shown if Female Client has an active Aerobics subscription) */}
      {isAerobicsActive && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-rose-50/95 via-white/95 to-fuchsia-50/95 border-2 border-rose-300/90 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-rose-600 to-fuchsia-600 text-white shadow-2xs">
                ✨ AEROBICS PASS ACTIVE
              </span>
              <span className="text-[11px] font-bold text-slate-600">
                {(clientProfile?.aerobicsPlanType || 'monthly').toUpperCase()} PLAN
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
              <QrCode className="w-3 h-3" />
              QR Attendance Tagged
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div className="p-3 rounded-2xl bg-white border border-rose-200/80">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Enrolled Studio Batch</span>
              <span className="text-xs font-black text-slate-900 mt-0.5 block">
                {clientProfile?.aerobicsBatchName || enrolledBatch?.title || 'Morning Sunshine Zumba & Dance Cardio'}
              </span>
              <span className="text-[11px] font-bold text-rose-700 mt-0.5 block">
                {clientProfile?.aerobicsSlotTiming || enrolledBatch?.timeSlot || 'Morning 07:00 AM - 08:00 AM'}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-white border border-rose-200/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Coach &amp; Validity</span>
                <span className="text-xs font-black text-slate-900 mt-0.5 block">
                  Coach: {enrolledBatch?.instructorName || 'Pooja Sharma'}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-600 mt-0.5 block font-mono">
                Valid: {clientProfile?.aerobicsStartDate || '2026-10-01'} → {clientProfile?.aerobicsEndDate || '2026-11-01'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Available Aerobics Batches Catalog */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              Available Studio Batches ({activeBatches.length})
            </h3>
            <p className="text-[11px] text-slate-600">
              Choose Morning or Evening batch timings with Monthly or Quarterly pricing
            </p>
          </div>
        </div>

        {activeBatches.map((batch) => {
          const enrolledIds = Array.isArray(batch.enrolledClientIds) ? batch.enrolledClientIds : [];
          const isCurrentlyEnrolled =
            enrolledIds.includes(currentUser.uid) || clientProfile?.aerobicsBatchId === batch.id;
          const spotsLeft = Math.max(0, batch.maxCapacity - enrolledIds.length);
          const occupancyPct = Math.min(100, Math.round((enrolledIds.length / Math.max(1, batch.maxCapacity)) * 100));
          const selectedDuration = getSelectedDurationForBatch(batch.id);
          const monthlyPrice = batch.monthlyPrice || 1499;
          const quarterlyPrice = batch.quarterlyPrice || 3999;
          const activePrice = selectedDuration === 'quarterly' ? quarterlyPrice : monthlyPrice;
          const quarterlySavings = Math.max(0, monthlyPrice * 3 - quarterlyPrice);

          return (
            <div
              key={batch.id}
              className={`rounded-3xl p-5 border transition-all space-y-4 ${
                isCurrentlyEnrolled
                  ? 'bg-gradient-to-br from-rose-50/90 via-white to-fuchsia-50/90 border-2 border-rose-400 shadow-md'
                  : 'vision-card border-white/90 hover:border-rose-300 shadow-sm'
              }`}
            >
              {/* Batch Header & Category Badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">
                      {batch.category}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200">
                      {batch.intensity} Intensity
                    </span>
                    {isCurrentlyEnrolled && (
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-emerald-600 text-white">
                        ✓ ENROLLED BATCH
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-black text-slate-900 tracking-tight pt-0.5">
                    {batch.title}
                  </h4>
                  <p className="text-xs text-slate-600 font-semibold flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-rose-600" />
                    <span>Female Coach: <strong className="text-slate-900">{batch.instructorName}</strong></span>
                    <span className="text-slate-300">•</span>
                    <span>{batch.studioZone}</span>
                  </p>
                </div>
              </div>

              {/* Slot Timing, Days & Capacity Metrics */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-rose-500" />
                    Batch Slot Timing
                  </span>
                  <span className="text-xs font-black text-slate-900 block">
                    {batch.timeSlot}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-fuchsia-600" />
                    {batch.daysOfWeek}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                      <Users className="w-3 h-3 text-fuchsia-600" />
                      Batch Capacity
                    </span>
                    <span className="text-[10px] font-black text-rose-700">
                      {spotsLeft} spots left
                    </span>
                  </div>
                  <div className="text-xs font-black text-slate-900">
                    {enrolledIds.length} / {batch.maxCapacity} Enrolled
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 to-fuchsia-600 rounded-full transition-all"
                      style={{ width: `${occupancyPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Monthly vs Quarterly Pricing Selector */}
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Select Subscription Plan
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setBatchPlanDurationMap((prev) => ({ ...prev, [batch.id]: 'monthly' }))
                    }
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      selectedDuration === 'monthly'
                        ? 'bg-rose-50/95 border-2 border-rose-500 shadow-xs'
                        : 'bg-white border-slate-200/90 hover:border-rose-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-slate-800 uppercase">Monthly</span>
                      <span className="text-[10px] font-bold text-slate-500">1 Month</span>
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      ₹{monthlyPrice.toLocaleString('en-IN')}
                      <span className="text-[10px] font-semibold text-slate-500">/mo</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setBatchPlanDurationMap((prev) => ({ ...prev, [batch.id]: 'quarterly' }))
                    }
                    className={`p-3 rounded-2xl border text-left transition-all relative ${
                      selectedDuration === 'quarterly'
                        ? 'bg-fuchsia-50/95 border-2 border-fuchsia-600 shadow-xs'
                        : 'bg-white border-slate-200/90 hover:border-fuchsia-300'
                    }`}
                  >
                    {quarterlySavings > 0 && (
                      <span className="absolute -top-2 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-2xs">
                        Save ₹{quarterlySavings}
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-slate-800 uppercase">Quarterly</span>
                      <span className="text-[10px] font-bold text-slate-500">3 Months</span>
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      ₹{quarterlyPrice.toLocaleString('en-IN')}
                      <span className="text-[10px] font-semibold text-slate-500">/3mo</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Direct Buy / Enroll Action Button */}
              <div className="pt-1 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Selected: <strong className="text-slate-900 font-black">₹{activePrice.toLocaleString('en-IN')}</strong> ({selectedDuration === 'quarterly' ? '3 Months' : '1 Month'})
                </div>
                <button
                  type="button"
                  disabled={! isCurrentlyEnrolled && spotsLeft === 0}
                  onClick={() => handleOpenEnrollModal(batch)}
                  className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 shadow-md active:scale-95 ${
                    isCurrentlyEnrolled
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                      : spotsLeft === 0
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-rose-500 via-fuchsia-600 to-pink-600 hover:from-rose-600 hover:to-fuchsia-700 text-white shadow-rose-500/25'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {isCurrentlyEnrolled
                      ? 'Renew / Extend Batch'
                      : spotsLeft === 0
                      ? 'Batch Full'
                      : 'Buy / Enroll in Batch'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Direct Batch Checkout Confirmation Modal */}
      {checkoutBatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl border border-rose-200 shadow-2xl overflow-hidden text-slate-800">
            <div className="p-4 bg-gradient-to-r from-rose-500 via-fuchsia-600 to-pink-600 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-100 block">
                  Women&apos;s Studio Batch Enrollment
                </span>
                <h3 className="text-sm font-black">{checkoutBatch.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutBatch(null)}
                className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-rose-50/80 border border-rose-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Batch Timing:</span>
                  <span className="font-black text-slate-900">{checkoutBatch.timeSlot}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Schedule Days:</span>
                  <span className="font-bold text-slate-800">{checkoutBatch.daysOfWeek}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Female Instructor:</span>
                  <span className="font-bold text-rose-700">{checkoutBatch.instructorName}</span>
                </div>
              </div>

              {/* Duration switcher inside modal */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-black uppercase text-slate-600">
                  Choose Subscription Duration
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCheckoutDuration('monthly')}
                    className={`p-3 rounded-2xl border text-left ${
                      checkoutDuration === 'monthly'
                        ? 'bg-rose-50 border-2 border-rose-500'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span className="font-black text-slate-900 block">Monthly (1M)</span>
                    <span className="text-sm font-black text-rose-600 mt-0.5 block">
                      ₹{(checkoutBatch.monthlyPrice || 1499).toLocaleString('en-IN')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutDuration('quarterly')}
                    className={`p-3 rounded-2xl border text-left ${
                      checkoutDuration === 'quarterly'
                        ? 'bg-fuchsia-50 border-2 border-fuchsia-600'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span className="font-black text-slate-900 block">Quarterly (3M)</span>
                    <span className="text-sm font-black text-fuchsia-700 mt-0.5 block">
                      ₹{(checkoutBatch.quarterlyPrice || 3999).toLocaleString('en-IN')}
                    </span>
                  </button>
                </div>
              </div>

              {/* 2-Tier Payment Method Selector */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-black uppercase text-slate-600">
                  Select Payment Method (2-Tier Verified System)
                </label>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentTier('online')}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between ${
                      paymentTier === 'online'
                        ? 'bg-indigo-50/90 border-indigo-500 font-bold'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      <span>Online Gateway ({activeGateway?.name.split(' ')[0] || 'Razorpay'})</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-emerald-700">
                      Instant Activation
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentTier('offline_cash')}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between ${
                      paymentTier === 'offline_cash'
                        ? 'bg-amber-50/90 border-amber-500 font-bold'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-amber-600" />
                      <span>Pay via Cash / Offline Desk</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-amber-700">
                      Admin Approval
                    </span>
                  </button>
                </div>
              </div>

              {/* Promo Code / Gym Coupon inside Aerobics Modal */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <label className="block text-[11px] font-black uppercase text-slate-600">
                  Promo Code / Coupon
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter Promo Code (e.g. TORRENT10 / VIP100)"
                    value={aeroCouponInput}
                    onChange={(e) => setAeroCouponInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs uppercase bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleApplyAeroCoupon}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs"
                  >
                    Apply
                  </button>
                </div>
                {aeroCouponSuccess && (
                  <p className="text-[11px] text-emerald-700 font-bold">{aeroCouponSuccess}</p>
                )}
                {aeroCouponError && (
                  <p className="text-[11px] text-rose-600 font-bold">{aeroCouponError}</p>
                )}
              </div>

              {aeroDiscountPct >= 100 && (
                <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-950 font-bold flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span>
                    100% Discount applied! A nominal ₹1 token fee is required to verify and activate your membership record.
                  </span>
                </div>
              )}

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 flex items-center gap-2 font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  {paymentTier === 'online'
                    ? 'Instant Activation: Your regular QR check-in will automatically display the AEROBICS badge at reception.'
                    : 'Offline Cash Request: Your batch enrollment will activate once Admin verifies your cash payment at reception.'}
                </span>
              </div>

              <button
                type="button"
                disabled={isProcessing || isRazorpayOpen}
                onClick={handleProceedPayment}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 via-fuchsia-600 to-pink-600 hover:from-rose-600 hover:to-fuchsia-700 text-white font-black text-xs shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {paymentTier === 'online' ? <CreditCard className="w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                <span>
                  {isProcessing
                    ? 'Submitting...'
                    : paymentTier === 'online'
                    ? `Pay ₹${getAeroCheckoutAmounts(checkoutBatch, checkoutDuration).finalAmount.toLocaleString('en-IN')} Online & Activate`
                    : `Submit ₹${getAeroCheckoutAmounts(checkoutBatch, checkoutDuration).finalAmount.toLocaleString('en-IN')} Offline Cash Request`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Online Gateway Checkout Modal */}
      {checkoutBatch && (
        <RazorpayCheckoutModal
          isOpen={isRazorpayOpen}
          onClose={() => setIsRazorpayOpen(false)}
          gateway={activeGateway}
          amount={getAeroCheckoutAmounts(checkoutBatch, checkoutDuration).finalAmount}
          originalPrice={getAeroCheckoutAmounts(checkoutBatch, checkoutDuration).originalPrice}
          couponCode={appliedAeroCoupon}
          discountAmount={getAeroCheckoutAmounts(checkoutBatch, checkoutDuration).discountAmount}
          discountPercent={aeroDiscountPct}
          durationMonths={checkoutDuration === 'quarterly' ? 3 : 1}
          itemTitle={`Aerobics Batch: ${checkoutBatch.title} (${checkoutDuration === 'quarterly' ? '3 Months' : '1 Month'})`}
          planName={`Aerobics: ${checkoutBatch.title}`}
          purpose="aerobics"
          planId={checkoutBatch.id}
          clientId={currentUser.uid}
          clientName={clientProfile?.displayName || currentUser.displayName}
          clientPhone={clientProfile?.phone || currentUser.phone}
          clientEmail={clientProfile?.email || currentUser.email}
          metadata={{
            batchId: checkoutBatch.id,
            batchName: checkoutBatch.title,
            slotTiming: checkoutBatch.timeSlot,
            instructorName: checkoutBatch.instructorName,
            planDuration: checkoutDuration
          }}
          onSuccess={async (txn) => {
            await finalizeBatchSubscription(
              checkoutBatch,
              checkoutDuration,
              txn.amount,
              'online',
              txn
            );
          }}
        />
      )}

      {/* Official Payment Receipt Modal */}
      <PaymentReceiptModal
        isOpen={!!completedTxn}
        transaction={completedTxn}
        onClose={() => setCompletedTxn(null)}
      />
    </div>
  );
};
