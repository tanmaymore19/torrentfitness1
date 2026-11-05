import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { PaymentTransaction, MembershipRecord } from '../../types';
import { getCachedData, setCachedData } from '../../services/cacheService';
import { exportSinglePaymentInvoicePdf } from '../../services/pdfExportService';
import { usePdfDownload } from '../../context/PdfDownloadContext';
import {
  Receipt,
  Download,
  CreditCard,
  Banknote,
  Calendar,
  Clock,
  Tag,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  Lock
} from 'lucide-react';

interface UnifiedClientHistoryItem {
  id: string;
  receiptNumber: string;
  paymentId: string;
  planName: string;
  paymentDateTime: string;
  rawCreatedAt: string;
  sortTimestampMs: number;
  paymentModeLabel: string;
  paymentModeType: 'online' | 'cash';
  originalAmount: number;
  couponCode: string;
  discountPercent: number;
  discountAmount: number;
  finalPaidAmount: number;
  startDate: string;
  endDate: string;
  computedStatus: 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'REJECTED';
  isSuccessfulPayment: boolean;
  rawTransaction: PaymentTransaction;
}

export const ClientPaymentHistorySection: React.FC = () => {
  const { currentUser, clientProfile } = useAuth();
  const { requestPdfDownload } = usePdfDownload();
  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() =>
    currentUser?.uid ? getCachedData<PaymentTransaction[]>(`pay_tx_${currentUser.uid}`, []) : []
  );
  const [memberships, setMemberships] = useState<MembershipRecord[]>(() =>
    currentUser?.uid ? getCachedData<MembershipRecord[]>(`mem_rec_${currentUser.uid}`, []) : []
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'PENDING'>('ALL');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.uid) {
      setIsLoading(false);
      return;
    }

    const qTx = query(
      collection(db, 'paymentTransactions'),
      where('clientId', '==', currentUser.uid),
      limit(40)
    );
    const qMem = query(
      collection(db, 'memberships'),
      where('clientId', '==', currentUser.uid),
      limit(40)
    );

    const mergeTxList = (newItems: PaymentTransaction[]) => {
      setTransactions((prev) => {
        const map = new Map<string, PaymentTransaction>();
        prev.forEach((t) => map.set(t.id, t));
        newItems.forEach((t) => map.set(t.id, { ...map.get(t.id), ...t }));
        const list = Array.from(map.values()).sort((a, b) => {
          const tA = new Date(a.timestamp || a.approvedAt || a.createdAt || 0).getTime();
          const tB = new Date(b.timestamp || b.approvedAt || b.createdAt || 0).getTime();
          return tB - tA;
        });
        setCachedData(`pay_tx_${currentUser.uid}`, list);
        return list;
      });
      setIsLoading(false);
    };

    const unsubTx = onSnapshot(
      qTx,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentTransaction));
        mergeTxList(list);
      },
      (err) => {
        console.warn('Error loading client paymentTransactions:', err);
        setIsLoading(false);
      }
    );

    const qTx2 = query(
      collection(db, 'transactions'),
      where('clientId', '==', currentUser.uid),
      limit(40)
    );

    const unsubTx2 = onSnapshot(
      qTx2,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentTransaction));
        mergeTxList(list);
      },
      (err) => console.warn('Error loading client transactions alias:', err)
    );

    const unsubMem = onSnapshot(
      qMem,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as MembershipRecord))
          .sort(
            (a, b) =>
              new Date(b.createdAt || b.startDate || 0).getTime() -
              new Date(a.createdAt || a.startDate || 0).getTime()
          );
        setMemberships(list);
        setCachedData(`mem_rec_${currentUser.uid}`, list);
      },
      (err) => {
        console.warn('Error loading client memberships:', err);
      }
    );

    return () => {
      unsubTx();
      unsubTx2();
      unsubMem();
    };
  }, [currentUser?.uid]);

  const unifiedHistory: UnifiedClientHistoryItem[] = useMemo(() => {
    const items: UnifiedClientHistoryItem[] = [];
    const linkedMembershipIds = new Set<string>();
    const todayStr = new Date().toISOString().split('T')[0];

    const resolveStatus = (
      txStatus: string,
      endDateStr: string,
      memStatus?: string
    ): 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'REJECTED' => {
      const s = (txStatus || '').toLowerCase();
      const m = (memStatus || '').toLowerCase();
      if (s === 'pending' || m === 'pending') return 'PENDING';
      if (s === 'rejected' || s === 'failed' || m === 'rejected' || m === 'cancelled') {
        return 'REJECTED';
      }
      if (m === 'expired') return 'EXPIRED';
      if (endDateStr && endDateStr !== 'N/A' && endDateStr < todayStr) {
        return 'EXPIRED';
      }
      return 'ACTIVE';
    };

    for (const tx of transactions) {
      if (tx.membershipId) linkedMembershipIds.add(tx.membershipId);
      const matchingMem = memberships.find(
        (m) => m.id === tx.membershipId || m.transactionId === tx.id
      );
      if (matchingMem) linkedMembershipIds.add(matchingMem.id);

      const isCash =
        tx.paymentMode === 'cash' ||
        tx.gatewayProvider === 'offline_cash' ||
        tx.gatewayProvider === 'cash';

      const paymentModeLabel = isCash
        ? tx.status === 'pending'
          ? 'Offline Cash (Pending Approval)'
          : tx.status === 'rejected'
          ? 'Offline Cash (Declined)'
          : 'Offline Cash Approved'
        : `${
            tx.gatewayName ||
            (tx.gatewayProvider === 'cashfree'
              ? 'Cashfree'
              : tx.gatewayProvider === 'phonepe'
              ? 'PhonePe PG'
              : tx.gatewayProvider === 'paypal'
              ? 'PayPal'
              : 'Razorpay')
          } Online`;

      const startDate =
        tx.startDate || matchingMem?.startDate || (tx.createdAt || '').split('T')[0];
      let endDate = tx.endDate || matchingMem?.endDate || '';
      if (!endDate) {
        const d = new Date(tx.createdAt || Date.now());
        d.setMonth(d.getMonth() + (tx.durationMonths || 1));
        endDate = d.toISOString().split('T')[0];
      }

      const rawIso = tx.timestamp || tx.approvedAt || tx.createdAt || new Date().toISOString();
      const rawDateObj = new Date(rawIso);
      const sortTimestampMs = isNaN(rawDateObj.getTime()) ? 0 : rawDateObj.getTime();
      const paymentDateTime = rawDateObj.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const finalPaid = tx.finalAmount ?? tx.amount;
      const origPrice = tx.originalPrice ?? finalPaid;
      const discAmt =
        typeof tx.discountAmount === 'number'
          ? tx.discountAmount
          : Math.max(0, origPrice - finalPaid);
      const discPct = Number(tx.discountPercent || 0);

      const paymentId =
        tx.razorpayPaymentId ||
        tx.paymentId ||
        tx.referenceId ||
        matchingMem?.referenceId ||
        tx.id;

      const computedStatus = resolveStatus(tx.status, endDate, matchingMem?.status);
      const txStatusLower = String(tx.status || '').toLowerCase();
      const isSuccessfulPayment =
        (txStatusLower === 'success' ||
          txStatusLower === 'completed' ||
          txStatusLower === 'approved' ||
          computedStatus === 'ACTIVE' ||
          computedStatus === 'EXPIRED') &&
        computedStatus !== 'PENDING' &&
        computedStatus !== 'REJECTED';

      items.push({
        id: tx.id,
        receiptNumber: tx.receiptNumber || `TF-REC-${tx.id.slice(-6).toUpperCase()}`,
        paymentId,
        planName: tx.planName || matchingMem?.planName || tx.itemTitle,
        paymentDateTime,
        rawCreatedAt: rawIso,
        sortTimestampMs,
        paymentModeLabel,
        paymentModeType: isCash ? 'cash' : 'online',
        originalAmount: origPrice,
        couponCode: tx.couponCode || matchingMem?.couponCode || '',
        discountPercent: discPct,
        discountAmount: discAmt,
        finalPaidAmount: finalPaid,
        startDate,
        endDate,
        computedStatus,
        isSuccessfulPayment,
        rawTransaction: {
          ...tx,
          startDate,
          endDate,
          referenceId: paymentId
        }
      });
    }

    // Include any historical membership records that didn't have a separate paymentTransactions row
    for (const mem of memberships) {
      if (linkedMembershipIds.has(mem.id)) continue;

      const isCash = mem.paymentMode === 'cash';
      const paymentModeLabel = isCash
        ? mem.status === 'pending'
          ? 'Offline Cash (Pending Approval)'
          : 'Offline Cash Approved'
        : `${mem.gatewayName || 'Razorpay'} Online`;

      const rawIso = mem.createdAt || `${mem.startDate}T10:00:00.000Z`;
      const rawDateObj = new Date(rawIso);
      const sortTimestampMs = isNaN(rawDateObj.getTime()) ? 0 : rawDateObj.getTime();
      const paymentDateTime = rawDateObj.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const finalPaid = mem.amountPaid;
      const origPrice = mem.originalPrice ?? finalPaid;
      const discAmt =
        typeof mem.discountAmount === 'number'
          ? mem.discountAmount
          : Math.max(0, origPrice - finalPaid);
      const paymentId = mem.referenceId || mem.transactionId || mem.id;
      const receiptNumber =
        mem.receiptNumber || `TF-REC-${mem.id.slice(-6).toUpperCase()}`;

      const computedStatus = resolveStatus(mem.status, mem.endDate, mem.status);
      const isSuccessfulPayment =
        computedStatus !== 'PENDING' && computedStatus !== 'REJECTED';

      const syntheticTx: PaymentTransaction = {
        id: mem.transactionId || mem.id,
        receiptNumber,
        clientId: mem.clientId,
        clientName: mem.clientName,
        clientPhone: clientProfile?.phone || currentUser?.phone || '',
        purpose: 'membership',
        itemTitle: mem.planName,
        planId: mem.planId,
        planName: mem.planName,
        durationMonths: mem.durationMonths,
        startDate: mem.startDate,
        endDate: mem.endDate,
        originalPrice: origPrice,
        couponCode: mem.couponCode || '',
        discountAmount: discAmt,
        discountPercent: mem.discountPercent || 0,
        finalAmount: finalPaid,
        amount: finalPaid,
        currency: 'INR',
        status:
          mem.status === 'pending'
            ? 'pending'
            : mem.status === 'rejected'
            ? 'rejected'
            : 'success',
        paymentMode: mem.paymentMode,
        gatewayId: mem.gatewayId || (isCash ? 'gw_offline_cash' : 'gw_razorpay_main'),
        gatewayProvider: mem.gatewayProvider || (isCash ? 'offline_cash' : 'razorpay'),
        gatewayName: mem.gatewayName || (isCash ? 'Offline Cash Approved' : 'Razorpay'),
        paymentMethod: paymentModeLabel,
        paymentId,
        referenceId: paymentId,
        membershipId: mem.id,
        createdAt: rawIso
      };

      items.push({
        id: mem.id,
        receiptNumber,
        paymentId,
        planName: mem.planName,
        paymentDateTime,
        rawCreatedAt: rawIso,
        sortTimestampMs,
        paymentModeLabel,
        paymentModeType: isCash ? 'cash' : 'online',
        originalAmount: origPrice,
        couponCode: mem.couponCode || '',
        discountPercent: mem.discountPercent || 0,
        discountAmount: discAmt,
        finalPaidAmount: finalPaid,
        startDate: mem.startDate,
        endDate: mem.endDate,
        computedStatus,
        isSuccessfulPayment,
        rawTransaction: syntheticTx
      });
    }

    // Strictly sort descending by timestamp so index 0 of successful payments is reliably the latest bill
    return items.sort((a, b) => b.sortTimestampMs - a.sortTimestampMs);
  }, [transactions, memberships, clientProfile?.phone, currentUser?.phone]);

  // Identify the single MOST RECENT (latest successful) payment transaction ID
  const latestSuccessfulItemId = useMemo(() => {
    const latestSuccess = unifiedHistory.find((item) => item.isSuccessfulPayment);
    return latestSuccess?.id || null;
  }, [unifiedHistory]);

  const filteredItems = useMemo(() => {
    if (statusFilter === 'ALL') return unifiedHistory;
    return unifiedHistory.filter((item) => item.computedStatus === statusFilter);
  }, [unifiedHistory, statusFilter]);

  const handleDownloadInvoice = (item: UnifiedClientHistoryItem) => {
    // Client-side guard: strictly only allow downloading the latest successful invoice
    if (item.id !== latestSuccessfulItemId) return;

    requestPdfDownload({
      portalType: 'client',
      documentName: `Invoice #${item.receiptNumber} (${item.planName})`,
      customTitle: 'Download Invoice',
      customMessage: 'Do you want to download the official payment receipt for this transaction?',
      onConfirm: async () => {
        setDownloadingId(item.id);
        try {
          await exportSinglePaymentInvoicePdf({
            id: item.id,
            receiptNumber: item.receiptNumber,
            referenceId: item.paymentId,
            clientId: currentUser?.uid || item.rawTransaction.clientId,
            clientName:
              clientProfile?.displayName ||
              currentUser?.displayName ||
              item.rawTransaction.clientName,
            clientPhone: clientProfile?.phone || currentUser?.phone || '',
            planName: item.planName,
            validityPeriod: `${item.startDate} to ${item.endDate}`,
            paymentModeLabel: item.paymentModeLabel,
            paymentModeType: item.paymentModeType,
            timestamp: item.paymentDateTime,
            rawDate: item.rawCreatedAt,
            originalPrice: item.originalAmount,
            couponCode: item.couponCode
              ? item.discountPercent >= 100
                ? `${item.couponCode} (100% PROMO)`
                : item.couponCode
              : 'NONE',
            discountPercent: item.discountPercent,
            discountAmount: item.discountAmount,
            finalAmount: item.finalPaidAmount,
            status: item.computedStatus,
            verificationStatus: item.computedStatus
          });
        } finally {
          setDownloadingId(null);
        }
      }
    });
  };

  return (
    <div className="vision-surface rounded-3xl p-5 border border-white/85 shadow-xl space-y-4 text-slate-800 animate-fade-in">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-white flex items-center justify-center shadow-sm border border-white/60 shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-indigo-700 block">
              My Bills · Verified Payment History
            </span>
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              My Bills &amp; Invoices
            </h3>
          </div>
        </div>

        <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
          {unifiedHistory.length} {unifiedHistory.length === 1 ? 'Transaction' : 'Transactions'}
        </span>
      </div>

      {/* Policy Notice explaining Latest Invoice Download Rule */}
      <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-slate-700 flex items-center justify-between gap-2">
        <span>
          PDF tax invoice download is enabled for your <strong className="text-slate-900">most recent successful payment</strong>. Older bills remain available below as view-only records.
        </span>
      </div>

      {/* Filter Bar */}
      {unifiedHistory.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['ALL', 'ACTIVE', 'EXPIRED', 'PENDING'] as const).map((st) => {
            const count =
              st === 'ALL'
                ? unifiedHistory.length
                : unifiedHistory.filter((i) => i.computedStatus === st).length;
            const isSelected = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap border tabular-nums ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white/80 text-slate-600 border-slate-200 hover:bg-white'
                }`}
              >
                {st} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Loading / Empty / Populated States */}
      {isLoading ? (
        <div className="p-6 rounded-2xl bg-white/70 border border-slate-200/80 text-center space-y-2">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">
            Loading your bills &amp; payment history...
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-6 rounded-2xl bg-slate-50/90 border border-slate-200/80 text-center space-y-2">
          <FileText className="w-7 h-7 text-slate-400 mx-auto" />
          <p className="text-xs font-bold text-slate-700">
            No bills or payment records found
          </p>
          <p className="text-[11px] text-slate-500">
            When you purchase or renew a membership plan, your chronological billing history and latest downloadable PDF invoice will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isLatestDownloadable = item.id === latestSuccessfulItemId;
            const isDownloading = downloadingId === item.id;

            const statusColorText =
              item.computedStatus === 'ACTIVE'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-300'
                : item.computedStatus === 'PENDING'
                ? 'text-amber-800 bg-amber-50 border-amber-300'
                : item.computedStatus === 'REJECTED'
                ? 'text-rose-700 bg-rose-50 border-rose-300'
                : 'text-slate-600 bg-slate-100 border-slate-300';

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl bg-white/95 border shadow-xs space-y-3 transition-all tabular-nums ${
                  isLatestDownloadable
                    ? 'border-indigo-300 ring-1 ring-indigo-500/20'
                    : 'border-slate-200/90'
                }`}
              >
                {/* Row 1: Plan Name + Date + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center flex-wrap gap-2">
                      <h4 className="text-sm font-black text-slate-900">
                        {item.planName}
                      </h4>
                      {item.rawTransaction.ptIncluded && (
                        <span className="text-[11px] font-bold text-indigo-700">
                          · + 1-on-1 PT
                        </span>
                      )}
                      {isLatestDownloadable && (
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                          Latest Bill
                        </span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {item.paymentDateTime}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-600 font-semibold">
                        {item.receiptNumber}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border shrink-0 flex items-center gap-1 ${statusColorText}`}
                  >
                    {item.computedStatus === 'ACTIVE' && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    )}
                    {item.computedStatus === 'PENDING' && (
                      <Clock className="w-3 h-3 text-amber-600" />
                    )}
                    {item.computedStatus === 'REJECTED' && (
                      <AlertCircle className="w-3 h-3 text-rose-600" />
                    )}
                    {item.computedStatus}
                  </span>
                </div>

                {/* Row 2: Payment Mode, Transaction ID & Validity Window */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Payment Mode
                    </span>
                    <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                      {item.paymentModeType === 'online' ? (
                        <CreditCard className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      ) : (
                        <Banknote className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                      <span className="truncate">{item.paymentModeLabel}</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Transaction ID
                    </span>
                    <span className="font-mono font-bold text-indigo-700 text-[11px] block mt-0.5 break-all">
                      {item.paymentId}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Validity Period
                    </span>
                    <span className="font-mono font-bold text-slate-800 text-[11px] flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>
                        {item.startDate} → {item.endDate}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Row 3: Financial Breakdown (Original Amount, Coupon Applied, Discount, Final Paid) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-indigo-50/40 border border-indigo-100 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block">
                      Original Price
                    </span>
                    <span className="font-bold text-slate-800">
                      ₹{item.originalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block">
                      Coupon Applied
                    </span>
                    {item.couponCode ? (
                      <span className="inline-flex items-center gap-1 font-mono font-black text-indigo-700 text-[11px]">
                        <Tag className="w-3 h-3 text-indigo-600" />
                        {item.couponCode}
                        {item.discountPercent >= 100 && (
                          <span className="text-[9px] text-indigo-800 font-bold">
                            (100%)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px]">NONE</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block">
                      Discount
                    </span>
                    <span className="font-bold text-emerald-700">
                      {item.discountAmount > 0
                        ? `-₹${item.discountAmount.toLocaleString('en-IN')}`
                        : '₹0'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block">
                      Amount Paid
                    </span>
                    <span className="font-black text-slate-900 text-sm">
                      ₹{item.finalPaidAmount.toLocaleString('en-IN')}
                      {item.finalPaidAmount === 1 && item.discountPercent >= 100 && (
                        <span className="ml-1 text-[9px] font-bold text-indigo-700">
                          (Token)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Row 4: Strict Latest Invoice Download Rule (Clients Only) */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  {isLatestDownloadable ? (
                    <>
                      <span className="text-[11px] font-semibold text-emerald-700">
                        Most recent verified payment · Tax invoice ready
                      </span>
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownloadInvoice(item)}
                        className="py-2 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        {isDownloading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Download Invoice (PDF)</span>
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex items-center justify-between text-[11px] text-slate-500 py-0.5">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span>
                          {item.computedStatus === 'PENDING'
                            ? 'Pending Admin Approval — Invoice unlocks upon activation'
                            : item.computedStatus === 'REJECTED'
                            ? 'Declined Request — No invoice generated'
                            : 'Historical Record — View-only (PDF download available for latest bill only)'}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
