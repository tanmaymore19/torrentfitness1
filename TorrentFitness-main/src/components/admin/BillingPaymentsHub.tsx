import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../firebase';
import {
  collection,
  query,
  limit,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  setDoc,
  arrayRemove,
  where,
  serverTimestamp
} from 'firebase/firestore';
import {
  ClientProfile,
  MembershipPlan,
  MembershipRecord,
  PromotionalOffer,
  PaymentTransaction
} from '../../types';
import { getCachedData, setCachedData } from '../../services/cacheService';
import {
  PaymentLedgerExportItem,
  exportSinglePaymentInvoicePdf,
  exportSelectedPaymentsLedgerPdf,
  exportBulkPaymentsLedgerPdf
} from '../../services/pdfExportService';
import { usePdfDownload } from '../../context/PdfDownloadContext';
import {
  isClientActiveMembership,
  isValidRevenueTx,
  isDeletedTransaction,
  normalizeLedgerStatus,
  mergeTransactionLists
} from '../../utils/memberStatus';
import { PaymentGatewaysManager } from './PaymentGatewaysManager';
import { UnifiedMembershipManager } from './UnifiedMembershipManager';
import { PtPlansManager } from './PtPlansManager';
import { PaymentReceiptModal } from '../common/PaymentReceiptModal';
import { GlobalDeleteConfirmModal } from '../common/GlobalDeleteConfirmModal';
import {
  Wallet,
  CreditCard,
  Calendar,
  Download,
  FileText,
  Search,
  CheckSquare,
  Square,
  Clock,
  Tag,
  Users,
  TrendingUp,
  Sliders,
  Loader2,
  Receipt,
  FileSpreadsheet,
  UserCheck,
  Trash2,
  X,
  RotateCcw
} from 'lucide-react';

export type Domain02SubView =
  | 'd2_revenue_dashboard'
  | 'd2_transaction_ledger'
  | 'd2_payment_gateways'
  | 'd2_plans_catalog'
  | 'd2_pt_plans'
  | 'd2_promos_coupons'
  | 'd2_offline_approvals';

interface BillingPaymentsHubProps {
  clients: ClientProfile[];
  plans: MembershipPlan[];
  memberships: MembershipRecord[];
  offers?: PromotionalOffer[];
  activeSubFeature: string | null;
  onChangeSubFeature?: (subFeatureId: Domain02SubView) => void;
  onSelectClientForDetail?: (client: ClientProfile) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

export const BillingPaymentsHub: React.FC<BillingPaymentsHubProps> = ({
  clients,
  plans,
  memberships,
  offers = [],
  activeSubFeature,
  onChangeSubFeature,
  onSelectClientForDetail
}) => {
  const { requestPdfDownload } = usePdfDownload();
  const currentTab: Domain02SubView =
    activeSubFeature === 'd2_transaction_ledger'
      ? 'd2_transaction_ledger'
      : activeSubFeature === 'd2_payment_gateways'
      ? 'd2_payment_gateways'
      : activeSubFeature === 'd2_plans_catalog' || activeSubFeature === 'd4_plans_catalog'
      ? 'd2_plans_catalog'
      : activeSubFeature === 'd2_pt_plans'
      ? 'd2_pt_plans'
      : activeSubFeature === 'd2_promos_coupons' || activeSubFeature === 'd4_promos_coupons'
      ? 'd2_promos_coupons'
      : activeSubFeature === 'd2_offline_approvals' || activeSubFeature === 'd4_cash_desk'
      ? 'd2_offline_approvals'
      : 'd2_revenue_dashboard';

  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() =>
    getCachedData<PaymentTransaction[]>('admin_payment_tx', []).filter(
      (t) => !isDeletedTransaction(t)
    )
  );
  const deletedTxIdsRef = useRef<Set<string>>(new Set());
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Advanced Date Presets: "Today", "This Week", "This Month", "Last Month", "This Quarter", "This Year", "Custom Date Range", "All Time"
  const now = new Date();
  const [datePresetFilter, setDatePresetFilter] = useState<
    'all' | 'today' | 'week' | 'month' | 'last_month' | 'quarter' | 'year' | 'custom'
  >('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Category Filters: "All Transactions", "Membership Plans", "PT Packages", "Aerobics Batches"
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'memberships' | 'pt' | 'aerobics'
  >('all');

  // Mode Filters: "All Modes", "Online Gateways (Razorpay/UPI)", "Offline Cash Desk"
  const [modeFilter, setModeFilter] = useState<'all' | 'online' | 'cash'>('all');

  // Specific Gateway Provider Sub-Filter & Status Filter
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<
    'all' | 'online' | 'cash' | 'razorpay' | 'phonepe' | 'cashfree' | 'paypal'
  >('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'success' | 'pending' | 'refunded' | 'rejected'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<string[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<PaymentTransaction | null>(null);

  // 2-Step Transaction Deletion Target
  const [txToDelete, setTxToDelete] = useState<
    (PaymentLedgerExportItem & { rawTx?: PaymentTransaction }) | null
  >(null);

  useEffect(() => {
    let livePtList: PaymentTransaction[] = [];
    let liveTxList: PaymentTransaction[] = [];

    const syncCombinedTransactions = () => {
      const merged = mergeTransactionLists(livePtList, liveTxList).filter(
        (t) => !isDeletedTransaction(t) && !deletedTxIdsRef.current.has(t.id)
      );
      setTransactions(merged);
      setCachedData('admin_payment_tx', merged);
    };

    const unsubTx = onSnapshot(
      query(collection(db, 'paymentTransactions'), limit(100)),
      (snap) => {
        livePtList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentTransaction));
        syncCombinedTransactions();
      },
      (err) => console.warn('BillingPaymentsHub transactions listener note:', err)
    );

    const unsubTx2 = onSnapshot(
      query(collection(db, 'transactions'), limit(100)),
      (snap) => {
        liveTxList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentTransaction));
        syncCombinedTransactions();
      },
      (err) => console.warn('BillingPaymentsHub transactions alias listener note:', err)
    );

    return () => {
      unsubTx();
      unsubTx2();
    };
  }, []);

  // Build Unified Master Payment Ledger combining PaymentTransactions + Historical MembershipRecords
  const masterLedgerEntries = useMemo(() => {
    const items: (PaymentLedgerExportItem & {
      avatarUrl: string;
      gatewayProviderKey: string;
      rawTx?: PaymentTransaction;
    })[] = [];
    const seenMembershipIds = new Set<string>();

    for (const tx of transactions) {
      if (isDeletedTransaction(tx) || deletedTxIdsRef.current.has(tx.id)) {
        continue;
      }
      if (tx.membershipId) seenMembershipIds.add(tx.membershipId);
      const matchingMem = memberships.find(
        (m) => m.id === tx.membershipId || m.transactionId === tx.id
      );
      if (matchingMem) seenMembershipIds.add(matchingMem.id);

      const clientProfile = clients.find(
        (c) =>
          c.userId === tx.clientId ||
          c.displayName.toLowerCase() === (tx.clientName || '').toLowerCase()
      );
      const avatarUrl =
        clientProfile?.photoUrl ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';

      const isCash =
        tx.paymentMode === 'cash' ||
        tx.gatewayProvider === 'offline_cash' ||
        tx.gatewayProvider === 'cash';

      const providerKey = isCash
        ? 'cash'
        : tx.gatewayProvider || 'razorpay';

      const normalizedStatus = normalizeLedgerStatus(tx);

      const gwLabel = isCash
        ? normalizedStatus === 'Pending'
          ? 'Cash / Offline (Pending Approval)'
          : normalizedStatus === 'Rejected'
          ? 'Cash / Offline (Rejected)'
          : 'Cash / Offline Approved'
        : tx.gatewayProvider === 'cashfree'
        ? 'Cashfree Online'
        : tx.gatewayProvider === 'phonepe'
        ? 'PhonePe PG Online'
        : tx.gatewayProvider === 'paypal'
        ? 'PayPal Online'
        : tx.gatewayName
        ? `${tx.gatewayName}`
        : 'Razorpay Online';

      const rawCreatedAt = tx.createdAt || (tx as any).timestamp || (tx as any).paidAt || new Date().toISOString();
      const sDate = tx.startDate || matchingMem?.startDate || (typeof rawCreatedAt === 'string' ? rawCreatedAt.split('T')[0] : new Date().toISOString().split('T')[0]);
      const eDate = tx.endDate || matchingMem?.endDate || 'Active Term';
      const validity = eDate !== 'Active Term' ? `${sDate} to ${eDate}` : sDate;

      const dateObj = new Date(rawCreatedAt);
      const formattedTime = isNaN(dateObj.getTime())
        ? new Date().toLocaleString('en-IN')
        : dateObj.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

      const finalPaid = tx.finalAmount ?? tx.amount ?? 0;
      const origPrice = tx.originalPrice ?? matchingMem?.originalPrice ?? finalPaid;
      const discAmt =
        tx.discountAmount ?? matchingMem?.discountAmount ?? Math.max(0, origPrice - finalPaid);
      const rawCode = (tx.couponCode || matchingMem?.couponCode || '').trim().toUpperCase();
      const matchedOffer = rawCode
        ? offers.find((o) => o.code.toUpperCase() === rawCode)
        : undefined;
      const resolvedPct =
        tx.discountPercent ||
        matchingMem?.discountPercent ||
        matchedOffer?.discountPercent ||
        (rawCode && finalPaid === 1 && origPrice > 1 ? 100 : 0);

      const formattedCoupon =
        rawCode && rawCode !== 'NONE'
          ? resolvedPct > 0
            ? `${rawCode} (${resolvedPct}% PROMO)`
            : rawCode
          : 'NONE';

      items.push({
        id: tx.id,
        receiptNumber: tx.receiptNumber || `TF-REC-${tx.id.slice(-6).toUpperCase()}`,
        referenceId: tx.referenceId || tx.razorpayPaymentId || tx.receiptNumber || tx.id,
        clientId: tx.clientId,
        clientName: tx.clientName || clientProfile?.displayName || 'Member',
        clientPhone: tx.clientPhone || clientProfile?.phone,
        avatarUrl,
        planName: tx.planName || matchingMem?.planName || tx.itemTitle || 'Gym Membership',
        validityPeriod: validity,
        paymentModeLabel: gwLabel,
        paymentModeType: isCash ? 'cash' : 'online',
        gatewayProviderKey: providerKey,
        timestamp: formattedTime,
        rawDate: tx.createdAt,
        originalPrice: origPrice,
        couponCode: formattedCoupon,
        discountPercent: resolvedPct,
        discountAmount: discAmt,
        finalAmount: finalPaid,
        verificationStatus:
          normalizedStatus === 'Success'
            ? 'Active'
            : normalizedStatus === 'Pending'
            ? 'Pending Approval'
            : normalizedStatus,
        status: normalizedStatus,
        rawTx: tx
      });
    }

    return items.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
  }, [transactions, offers, clients]);

  // Advanced Date-Filtered Entries
  const dateFilteredEntries = useMemo(() => {
    return masterLedgerEntries.filter((entry) => {
      if (datePresetFilter === 'all') return true;
      if (!entry.rawDate) return true;
      const d = new Date(entry.rawDate);
      if (isNaN(d.getTime())) return true;
      const dateStr = typeof entry.rawDate === 'string' ? entry.rawDate.split('T')[0] : '';
      const nowDate = new Date();

      if (datePresetFilter === 'today') {
        return d.toDateString() === nowDate.toDateString();
      }

      if (datePresetFilter === 'week') {
        const startOfWeek = new Date(nowDate);
        startOfWeek.setDate(nowDate.getDate() - nowDate.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return d >= startOfWeek;
      }

      if (datePresetFilter === 'month') {
        return d.getMonth() === nowDate.getMonth() && d.getFullYear() === nowDate.getFullYear();
      }

      if (datePresetFilter === 'last_month') {
        const lastMonth = nowDate.getMonth() === 0 ? 11 : nowDate.getMonth() - 1;
        const targetYear = nowDate.getMonth() === 0 ? nowDate.getFullYear() - 1 : nowDate.getFullYear();
        return d.getMonth() === lastMonth && d.getFullYear() === targetYear;
      }

      if (datePresetFilter === 'quarter') {
        const currQ = Math.floor(nowDate.getMonth() / 3);
        const entryQ = Math.floor(d.getMonth() / 3);
        return entryQ === currQ && d.getFullYear() === nowDate.getFullYear();
      }

      if (datePresetFilter === 'year') {
        return d.getFullYear() === nowDate.getFullYear();
      }

      if (datePresetFilter === 'custom') {
        if (customStartDate && dateStr < customStartDate) return false;
        if (customEndDate && dateStr > customEndDate) return false;
      }

      return true;
    });
  }, [masterLedgerEntries, datePresetFilter, customStartDate, customEndDate]);

  const handleResetFilters = () => {
    setDatePresetFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setCategoryFilter('all');
    setModeFilter('all');
    setPaymentMethodFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setSelectedLedgerIds([]);
  };

  // Full Filtered Ledger Entries (Date + Category + Mode + Gateway + Status + Search)
  const filteredLedgerEntries = useMemo(() => {
    return dateFilteredEntries.filter((entry) => {
      const planLower = (entry.planName || '').toLowerCase();

      // 1. Category Filter: "All Transactions", "Membership Plans", "PT Packages", "Aerobics Batches"
      if (categoryFilter === 'pt') {
        const isPt =
          planLower.includes('pt') ||
          planLower.includes('personal') ||
          planLower.includes('trainer') ||
          planLower.includes('coaching');
        if (!isPt) return false;
      } else if (categoryFilter === 'aerobics') {
        const isAerobics =
          planLower.includes('aerobic') ||
          planLower.includes('zumba') ||
          planLower.includes('batch') ||
          planLower.includes('group');
        if (!isAerobics) return false;
      } else if (categoryFilter === 'memberships') {
        const isPtOrAerobics =
          planLower.includes('pt') ||
          planLower.includes('personal') ||
          planLower.includes('trainer') ||
          planLower.includes('aerobic') ||
          planLower.includes('zumba');
        if (isPtOrAerobics) return false;
      }

      // 2. Mode Filter: "All Modes", "Online Gateways (Razorpay/UPI)", "Offline Cash Desk"
      if (modeFilter === 'online' && entry.paymentModeType !== 'online') return false;
      if (modeFilter === 'cash' && entry.paymentModeType !== 'cash') return false;

      // 3. Provider sub-filter
      if (paymentMethodFilter === 'online' && entry.paymentModeType !== 'online') return false;
      if (paymentMethodFilter === 'cash' && entry.paymentModeType !== 'cash') return false;
      if (
        ['razorpay', 'phonepe', 'cashfree', 'paypal'].includes(paymentMethodFilter) &&
        entry.gatewayProviderKey !== paymentMethodFilter
      ) {
        return false;
      }

      // 4. Status filter
      if (statusFilter !== 'all' && entry.status.toLowerCase() !== statusFilter) {
        return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          entry.clientName.toLowerCase().includes(q) ||
          entry.clientId.toLowerCase().includes(q) ||
          entry.planName.toLowerCase().includes(q) ||
          entry.referenceId.toLowerCase().includes(q) ||
          entry.couponCode.toLowerCase().includes(q) ||
          entry.paymentModeLabel.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [dateFilteredEntries, categoryFilter, modeFilter, paymentMethodFilter, statusFilter, searchQuery]);

  // Real-time Monthly & Filtered Metrics for Sub-section A
  const currentMonthEntries = useMemo(() => {
    const currM = now.getMonth();
    const currY = now.getFullYear();
    return masterLedgerEntries.filter((e) => {
      const d = new Date(e.rawDate);
      return d.getMonth() === currM && d.getFullYear() === currY;
    });
  }, [masterLedgerEntries]);

  const metricsSource = datePresetFilter === 'all' && categoryFilter === 'all' && modeFilter === 'all'
    ? masterLedgerEntries
    : filteredLedgerEntries;
  const settledMetricsEntries = metricsSource.filter((e) => isValidRevenueTx(e.rawTx));
  const settledThisMonthEntries = currentMonthEntries.filter((e) => isValidRevenueTx(e.rawTx));

  const totalRevenueFiltered = settledMetricsEntries.reduce(
    (sum, e) => sum + (Number(e.finalAmount) || 0),
    0
  );
  const totalRevenueThisMonth = settledThisMonthEntries.reduce(
    (sum, e) => sum + (Number(e.finalAmount) || 0),
    0
  );

  const totalActivePaidClients = clients.filter(
    (c) => isClientActiveMembership(c)
  ).length;

  const totalDiscountGiven = settledMetricsEntries.reduce((sum, e) => sum + e.discountAmount, 0);
  const pendingOfflineQueue = useMemo(() => {
    return transactions.filter(
      (t) =>
        !isDeletedTransaction(t) &&
        (t.paymentMode === 'cash' || t.gatewayProvider === 'offline_cash') &&
        String(t.status || '').toLowerCase() === 'pending'
    );
  }, [transactions]);

  const getDateRangeLabel = (): string => {
    switch (datePresetFilter) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'month':
        return 'This Month';
      case 'last_month':
        return 'Last Month';
      case 'quarter':
        return 'This Quarter';
      case 'year':
        return 'This Year';
      case 'custom':
        return `Custom (${customStartDate || 'Start'} to ${customEndDate || 'Now'})`;
      case 'all':
      default:
        return 'All Time';
    }
  };

  // Multi-Select Checkbox Handlers
  const toggleSelectRow = (id: string) => {
    setSelectedLedgerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    const allIds = filteredLedgerEntries.map((e) => e.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedLedgerIds.includes(id));
    if (allSelected) {
      setSelectedLedgerIds((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      setSelectedLedgerIds(Array.from(new Set([...selectedLedgerIds, ...allIds])));
    }
  };

  // PDF & CSV Export Handlers
  const handleExportAllPdf = () => {
    const reportName = `Master Financial Ledger & Revenue Report (${getDateRangeLabel()})`;
    requestPdfDownload({
      portalType: 'admin',
      documentName: reportName,
      customTitle: 'Confirm PDF Download',
      customMessage: `Are you sure you want to download and export this ${reportName} as a PDF?`,
      onConfirm: async () => {
        setIsExportingPdf(true);
        try {
          await exportBulkPaymentsLedgerPdf(filteredLedgerEntries, getDateRangeLabel());
        } finally {
          setIsExportingPdf(false);
        }
      }
    });
  };

  const handleExportSelectedPdf = () => {
    const selectedItems = masterLedgerEntries.filter((e) => selectedLedgerIds.includes(e.id));
    if (selectedItems.length === 0) return;
    const reportName = `${selectedItems.length} Selected Payments Financial Ledger`;
    requestPdfDownload({
      portalType: 'admin',
      documentName: reportName,
      customTitle: 'Confirm PDF Download',
      customMessage: `Are you sure you want to download and export this ${reportName} as a PDF?`,
      onConfirm: async () => {
        setIsExportingPdf(true);
        try {
          await exportSelectedPaymentsLedgerPdf(selectedItems);
        } finally {
          setIsExportingPdf(false);
        }
      }
    });
  };

  const handleDownloadSinglePdf = (entry: PaymentLedgerExportItem) => {
    const docName = `Invoice #${entry.receiptNumber} (${entry.clientName})`;
    requestPdfDownload({
      portalType: 'admin',
      documentName: docName,
      customTitle: 'Confirm PDF Download',
      customMessage: `Are you sure you want to download and export this ${docName} as a PDF?`,
      onConfirm: async () => {
        setIsExportingPdf(true);
        try {
          await exportSinglePaymentInvoicePdf(entry);
        } finally {
          setIsExportingPdf(false);
        }
      }
    });
  };

  const handleExportCsv = () => {
    const targetRows =
      selectedLedgerIds.length > 0
        ? masterLedgerEntries.filter((e) => selectedLedgerIds.includes(e.id))
        : filteredLedgerEntries;

    const headers = [
      'Receipt Number',
      'Reference ID',
      'Member Name',
      'Client ID',
      'Plan Purchased',
      'Validity Period',
      'Date & Timestamp',
      'Payment Method',
      'Base Price (INR)',
      'Promo Coupon Code',
      'Discount Amount (INR)',
      'Final Amount Received (INR)',
      'Status'
    ];

    const csvContent = [
      headers.join(','),
      ...targetRows.map((row) =>
        [
          `"${row.receiptNumber}"`,
          `"${row.referenceId}"`,
          `"${row.clientName.replace(/"/g, '""')}"`,
          `"@${row.clientId}"`,
          `"${row.planName.replace(/"/g, '""')}"`,
          `"${row.validityPeriod}"`,
          `"${row.timestamp}"`,
          `"${row.paymentModeLabel}"`,
          row.originalPrice,
          `"${row.couponCode}"`,
          row.discountAmount,
          row.finalAmount,
          `"${row.status}"`
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanDate = new Date().toISOString().split('T')[0];
    a.download = `TorrentFitness_Billing_Ledger_${cleanDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openReceiptPreview = (
    item: PaymentLedgerExportItem & { rawTx?: PaymentTransaction }
  ) => {
    if (item.rawTx) {
      setSelectedReceiptTx(item.rawTx);
      return;
    }
    const synthesizedTx: PaymentTransaction = {
      id: item.id,
      receiptNumber: item.receiptNumber,
      referenceId: item.referenceId,
      clientId: item.clientId,
      clientName: item.clientName,
      clientPhone: item.clientPhone,
      planName: item.planName,
      itemTitle: item.planName,
      purpose: 'membership',
      gatewayId: item.paymentModeType === 'cash' ? 'offline_cash' : 'gw_razorpay',
      paymentMethod: item.paymentModeLabel,
      paymentMode: item.paymentModeType,
      gatewayProvider: item.paymentModeType === 'cash' ? 'offline_cash' : 'razorpay',
      gatewayName: item.paymentModeLabel,
      originalPrice: item.originalPrice,
      couponCode: item.couponCode !== 'NONE' ? item.couponCode : undefined,
      discountPercent: item.discountPercent,
      discountAmount: item.discountAmount,
      finalAmount: item.finalAmount,
      amount: item.finalAmount,
      currency: 'INR',
      status:
        item.status.toLowerCase() === 'success'
          ? 'success'
          : item.status.toLowerCase() === 'pending'
          ? 'pending'
          : 'rejected',
      createdAt: item.rawDate
    };
    setSelectedReceiptTx(synthesizedTx);
  };

  const handleDeleteTransaction = (
    e: React.MouseEvent,
    item: PaymentLedgerExportItem & { rawTx?: PaymentTransaction }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setTxToDelete(item);
  };

  const confirmDeleteTransaction = async () => {
    if (!txToDelete) return;
    try {
      const txId = txToDelete.id;
      const raw: any = txToDelete.rawTx || {};
      const paymentId = String(raw.paymentId || raw.razorpayPaymentId || (txToDelete as any).paymentId || '').trim();
      const receiptNumber = String(txToDelete.receiptNumber || raw.receiptNumber || '').trim();
      const rawAmount = Number(raw.finalAmount ?? raw.amount ?? txToDelete.finalAmount ?? 0) || 0;
      const rawClientId = String(raw.clientId || raw.userId || raw.uid || txToDelete.clientId || '').trim();
      const matchedClient = clients.find(
        (c) =>
          c.userId === rawClientId ||
          (c as any).uid === rawClientId ||
          (c as any).username === rawClientId
      );
      const targetUids = Array.from(
        new Set([rawClientId, matchedClient?.userId].filter((v): v is string => Boolean(v)))
      );
      const primaryClientId = targetUids[0] || '';
      const nowIso = new Date().toISOString();

      const batch = writeBatch(db);

      // 1. Soft-Archive Transaction & Zero Out Revenue across all canonical & alias financial collections
      // (Preserves audit trail cleanly per zero-hard-delete rule)
      const archivePayload: Record<string, any> = {
        isDeletedByAdmin: true,
        deleted: true,
        deletedByAdmin: true,
        status: 'DELETED',
        paymentStatus: 'DELETED',
        verificationStatus: 'DELETED',
        amount: 0,
        finalAmount: 0,
        archivedAt: serverTimestamp(),
        deletedAt: serverTimestamp(),
        deletedBy: 'Master Admin',
        updatedAt: nowIso
      };

      const finCollections = [
        'transactions',
        'paymentTransactions',
        'payments',
        'invoices',
        'bills',
        'billing_history'
      ];
      finCollections.forEach((coll) => {
        batch.set(doc(db, coll, txId), archivePayload, { merge: true });
      });

      if (raw.membershipId) {
        batch.set(
          doc(db, 'memberships', raw.membershipId),
          { ...archivePayload, transactionDeleted: true, amountPaid: 0 },
          { merge: true }
        );
      }

      // Query & soft-archive linked memberships
      try {
        const memMatchSnap = await getDocs(
          query(collection(db, 'memberships'), where('transactionId', '==', txId))
        );
        memMatchSnap.docs.forEach((d) => {
          batch.set(
            d.ref,
            { ...archivePayload, transactionDeleted: true, amountPaid: 0 },
            { merge: true }
          );
        });
      } catch {}

      // 2. Query and Soft-Archive Generated Bills / Receipts in `invoices` and `bills`
      const matchesBillDoc = (docId: string, data: any): boolean => {
        if (docId === txId) return true;
        if (data?.transactionId && data.transactionId === txId) return true;
        if (paymentId && (data?.paymentId === paymentId || data?.referenceId === paymentId)) return true;
        if (receiptNumber && data?.receiptNumber === receiptNumber) return true;
        // Fallback match by clientId + amount ONLY if no conflicting foreign transactionId is present
        const hasForeignTxId =
          Boolean(data?.transactionId && data.transactionId !== txId) ||
          Boolean(paymentId && data?.paymentId && data.paymentId !== paymentId);
        if (!hasForeignTxId && rawAmount > 0) {
          const docAmt = Number(data?.finalAmount ?? data?.amount ?? 0);
          if (docAmt === rawAmount) return true;
        }
        return false;
      };

      try {
        const billCollections = ['invoices', 'bills'];
        const queryTasks: Promise<any>[] = [];
        for (const coll of billCollections) {
          queryTasks.push(getDocs(query(collection(db, coll), where('transactionId', '==', txId))));
          if (paymentId) {
            queryTasks.push(getDocs(query(collection(db, coll), where('paymentId', '==', paymentId))));
          }
          if (receiptNumber) {
            queryTasks.push(getDocs(query(collection(db, coll), where('receiptNumber', '==', receiptNumber))));
          }
          for (const uid of targetUids) {
            queryTasks.push(getDocs(query(collection(db, coll), where('clientId', '==', uid))));
          }
        }
        const results = await Promise.allSettled(queryTasks);
        const queuedRefs = new Set<string>();
        results.forEach((res) => {
          if (res.status === 'fulfilled' && res.value && !res.value.empty) {
            res.value.docs.forEach((d: any) => {
              const pathKey = d.ref.path;
              if (!queuedRefs.has(pathKey) && matchesBillDoc(d.id, d.data())) {
                queuedRefs.add(pathKey);
                batch.set(
                  d.ref,
                  {
                    isDeletedByAdmin: true,
                    deleted: true,
                    status: 'DELETED',
                    verificationStatus: 'DELETED',
                    amount: 0,
                    finalAmount: 0,
                    archivedAt: serverTimestamp(),
                    updatedAt: nowIso
                  },
                  { merge: true }
                );
              }
            });
          }
        });
      } catch (billErr) {
        console.warn('Linked bill lookup note:', billErr);
      }

      // 3. Cascade-Revoke Linked Service (MEMBERSHIP, PT, or AEROBICS) from Client Account
      const rawCat = String(raw.category || raw.categoryType || (txToDelete as any).category || '').toUpperCase();
      const planType = String(raw.planType || raw.type || '').toLowerCase();
      const planNameLower = String(txToDelete.planName || raw.planName || raw.itemTitle || '').toLowerCase();
      const purpose = String(raw.purpose || '').toLowerCase();

      const isAerobics =
        rawCat.includes('AEROBIC') ||
        purpose === 'aerobics' ||
        planType.includes('aerobic') ||
        planNameLower.includes('aerobic') ||
        planNameLower.includes('zumba') ||
        planNameLower.includes('dance cardio');

      const isPtTransaction =
        !isAerobics &&
        (rawCat === 'PT' ||
          rawCat === 'PERSONAL_TRAINING' ||
          rawCat.includes('PERSONAL') ||
          purpose === 'pt' ||
          purpose === 'personal_training' ||
          planType === 'pt' ||
          planType.includes('personal') ||
          /\bpt\b/.test(planNameLower) ||
          planNameLower.includes('personal train') ||
          planNameLower.includes('trainer') ||
          planNameLower.includes('coaching') ||
          planNameLower.includes('1-on-1'));

      const ptIncludedBundle = !isAerobics && !isPtTransaction && Boolean(raw.ptIncluded);

      if (targetUids.length > 0) {
        if (isAerobics) {
          const aerobicsRevocationPayload: Record<string, any> = {
            aerobicsStatus: 'INACTIVE',
            currentAerobicsBatch: null,
            aerobicsStartDate: null,
            aerobicsEndDate: null,
            aerobicsExpiryDate: null,
            aerobicsBatchId: null,
            aerobicsBatchName: null,
            queuedAerobicsBatch: null,
            queuedAerobicsBatchId: null,
            queuedAerobicsBatchName: null,
            queuedAerobicsStartDate: null,
            queuedAerobicsEndDate: null,
            pendingAerobicsRequest: false,
            aerobicsRequestStatus: 'inactive',
            pendingAerobicsRequestId: null,
            pendingAerobicsBatchId: null,
            updatedAt: nowIso
          };
          for (const uid of targetUids) {
            batch.set(doc(db, 'users', uid), aerobicsRevocationPayload, { merge: true });
            batch.set(doc(db, 'members', uid), aerobicsRevocationPayload, { merge: true });
            batch.set(doc(db, 'clientProfiles', uid), aerobicsRevocationPayload, { merge: true });
            batch.set(doc(db, 'aerobicsSubscriptions', `aero_sub_${uid}`), archivePayload, { merge: true });
          }
          batch.set(doc(db, 'aerobicsSubscriptions', txId), archivePayload, { merge: true });
          batch.set(doc(db, 'aerobics_requests', txId), archivePayload, { merge: true });
          batch.set(doc(db, 'aerobicsRequests', txId), archivePayload, { merge: true });

          try {
            const aeroLookupTasks: Promise<any>[] = [
              getDocs(query(collection(db, 'aerobics_requests'), where('transactionId', '==', txId))),
              getDocs(query(collection(db, 'aerobicsRequests'), where('transactionId', '==', txId))),
              getDocs(query(collection(db, 'aerobicsSubscriptions'), where('transactionId', '==', txId)))
            ];
            if (paymentId) {
              aeroLookupTasks.push(
                getDocs(query(collection(db, 'aerobics_requests'), where('transactionId', '==', paymentId))),
                getDocs(query(collection(db, 'aerobics_requests'), where('paymentId', '==', paymentId)))
              );
            }
            const aeroSnaps = await Promise.allSettled(aeroLookupTasks);
            aeroSnaps.forEach((res) => {
              if (res.status === 'fulfilled' && res.value && !res.value.empty) {
                res.value.docs.forEach((d: any) => batch.set(d.ref, archivePayload, { merge: true }));
              }
            });
          } catch {}

          const batchIdToClean = String(
            raw.metadata?.batchId || raw.planId || matchedClient?.aerobicsBatchId || ''
          ).trim();
          if (batchIdToClean) {
            try {
              const abRef = doc(db, 'aerobicsBatches', batchIdToClean);
              const abSnap = await getDoc(abRef);
              if (abSnap.exists()) {
                for (const uid of targetUids) {
                  batch.update(abRef, { enrolledClientIds: arrayRemove(uid) });
                }
              }
            } catch {}
          }
        } else {
          if (isPtTransaction || ptIncludedBundle) {
            const trId = String(
              raw.ptTrainerId || raw.trainerId || raw.assignedTrainerId || matchedClient?.assignedTrainerId || ''
            ).trim();
            const ptRevocationPayload: Record<string, any> = {
              ptStatus: 'NONE',
              assignedTrainerId: null,
              assignedTrainerName: null,
              ptApprovedByAdmin: false,
              ptStartDate: null,
              ptExpiryDate: null,
              ptPlanActive: false,
              pendingPtRequestId: null,
              updatedAt: nowIso
            };
            for (const uid of targetUids) {
              batch.set(doc(db, 'users', uid), ptRevocationPayload, { merge: true });
              batch.set(doc(db, 'members', uid), ptRevocationPayload, { merge: true });
              batch.set(doc(db, 'clientProfiles', uid), ptRevocationPayload, { merge: true });
            }
            batch.set(doc(db, 'pt_requests', txId), archivePayload, { merge: true });
            batch.set(doc(db, 'ptRequests', txId), archivePayload, { merge: true });

            try {
              const ptLookupTasks: Promise<any>[] = [
                getDocs(query(collection(db, 'pt_requests'), where('transactionId', '==', txId))),
                getDocs(query(collection(db, 'ptRequests'), where('transactionId', '==', txId)))
              ];
              if (paymentId) {
                ptLookupTasks.push(
                  getDocs(query(collection(db, 'pt_requests'), where('transactionId', '==', paymentId))),
                  getDocs(query(collection(db, 'pt_requests'), where('paymentId', '==', paymentId)))
                );
              }
              const ptReqSnaps = await Promise.allSettled(ptLookupTasks);
              ptReqSnaps.forEach((res) => {
                if (res.status === 'fulfilled' && res.value && !res.value.empty) {
                  res.value.docs.forEach((d: any) => batch.set(d.ref, archivePayload, { merge: true }));
                }
              });
            } catch {}

            if (trId) {
              for (const trColl of ['trainers', 'trainerProfiles']) {
                try {
                  const trRef = doc(db, trColl, trId);
                  const trSnap = await getDoc(trRef);
                  if (trSnap.exists()) {
                    for (const uid of targetUids) {
                      batch.update(trRef, {
                        assignedClients: arrayRemove(uid),
                        assignedClientIds: arrayRemove(uid)
                      });
                    }
                  }
                } catch {}
              }
            }
          }

          if (!isPtTransaction) {
            const membershipRevocationPayload: Record<string, any> = {
              membershipStatus: 'INACTIVE',
              status: 'INACTIVE',
              isActive: false,
              currentPlan: null,
              planName: null,
              planStartDate: null,
              planExpiryDate: null,
              membershipPlan: null,
              membershipPlanName: null,
              membershipPlanId: null,
              membershipStartDate: null,
              membershipEndDate: null,
              membershipExpiryDate: null,
              queuedPlan: null,
              queuedPlanId: null,
              queuedPlanName: null,
              queuedStartDate: null,
              queuedEndDate: null,
              pendingMembershipRequest: false,
              updatedAt: nowIso
            };
            for (const uid of targetUids) {
              batch.set(doc(db, 'users', uid), membershipRevocationPayload, { merge: true });
              batch.set(doc(db, 'members', uid), membershipRevocationPayload, { merge: true });
              batch.set(doc(db, 'clientProfiles', uid), membershipRevocationPayload, { merge: true });
            }
            batch.set(doc(db, 'membership_requests', txId), archivePayload, { merge: true });
            batch.set(doc(db, 'membershipRequests', txId), archivePayload, { merge: true });
          }
        }
      }

      // Execute atomic Firestore commit
      await batch.commit();

      // Best-effort secondary cleanup on optional collections / subcollections (never blocks core batch)
      await Promise.allSettled([
        setDoc(doc(db, 'paymentHistory', txId), archivePayload, { merge: true }).catch(() => null),
        ...targetUids.flatMap((uid) => [
          setDoc(doc(db, 'clientProfiles', uid, 'transactions', txId), archivePayload, { merge: true }).catch(() => null),
          setDoc(doc(db, 'clientProfiles', uid, 'invoices', txId), archivePayload, { merge: true }).catch(() => null),
          setDoc(doc(db, 'clientProfiles', uid, 'bills', txId), archivePayload, { merge: true }).catch(() => null),
          setDoc(doc(db, 'clientProfiles', uid, 'paymentHistory', txId), archivePayload, { merge: true }).catch(() => null)
        ])
      ]);

      try {
        const optPayHistSnap = await getDocs(
          query(collection(db, 'paymentHistory'), where('transactionId', '==', txId))
        );
        if (!optPayHistSnap.empty) {
          await Promise.allSettled(
            optPayHistSnap.docs.map((d) => setDoc(d.ref, archivePayload, { merge: true }).catch(() => null))
          );
        }
      } catch {}

      // 4. Immediately remove from local React state, ref guard, and localStorage caches
      deletedTxIdsRef.current.add(txId);
      setTransactions((prev) => {
        const updated = prev.filter((t) => t.id !== txId);
        setCachedData('admin_payment_transactions', updated);
        setCachedData('admin_payment_tx', updated);
        return updated;
      });
      setSelectedLedgerIds((prev) => prev.filter((id) => id !== txId));

      if (typeof window !== 'undefined') {
        try {
          for (const uid of targetUids) {
            localStorage.removeItem(`pay_tx_${uid}`);
            localStorage.removeItem(`mem_rec_${uid}`);
          }
          if (primaryClientId) {
            localStorage.removeItem(`pay_tx_${primaryClientId}`);
          }
        } catch {}
      }

      setTxToDelete(null);
      setFeedbackBanner({
        type: 'success',
        text: 'Transaction deleted. Revenue, client bill, and linked plan/service removed.'
      });
    } catch (err: any) {
      const errMessage = err?.message || String(err);
      alert('Delete failed: ' + errMessage);
      setFeedbackBanner({
        type: 'error',
        text: `Delete failed: ${errMessage}`
      });
      throw err;
    }
  };

  // Shared Date / Month / Category / Mode Filter Controls
  const renderDateFilterControls = () => (
    <div className="p-4 bg-white/95 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
      {/* Row 1: Date Range Presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span>Billing Period &amp; Date Range:</span>
          </span>
          <span className="text-[11px] font-bold text-indigo-700">
            {filteredLedgerEntries.length} transactions match filters
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'All Time' },
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'quarter', label: 'This Quarter' },
            { id: 'year', label: 'This Year' },
            { id: 'custom', label: 'Custom Date Range' }
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setDatePresetFilter(preset.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                datePresetFilter === preset.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers */}
        {datePresetFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs animate-fade-in bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-600">Start Date:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-600">End Date:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800"
              />
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Category Filter & Mode Filter */}
      <div className="pt-2 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Category Filters: "All Transactions", "Membership Plans", "PT Packages", "Aerobics Batches" */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
            Category Filter:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All Transactions' },
              { id: 'memberships', label: 'Membership Plans' },
              { id: 'pt', label: 'PT Packages' },
              { id: 'aerobics', label: 'Aerobics Batches' }
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                  categoryFilter === cat.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Filters: "All Modes", "Online Gateways (Razorpay/UPI)", "Offline Cash Desk" */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
            Payment Mode Filter:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All Modes' },
              { id: 'online', label: 'Online Gateways (Razorpay/UPI)' },
              { id: 'cash', label: 'Offline Cash Desk' }
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModeFilter(m.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                  modeFilter === m.id
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 text-slate-800">
      {/* Status Toast Banner */}
      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            feedbackBanner.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}
        >
          <span>{feedbackBanner.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MASTER BILLING & MONTHLY REVENUE DASHBOARD                                */}
      {/* ========================================================================= */}
      {currentTab === 'd2_revenue_dashboard' && (
        <div className="space-y-5 animate-fade-in">
          {/* Header & Period Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-black text-slate-900">
                Master Billing &amp; Monthly Revenue
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                Analytics &amp; KPIs
              </span>
            </div>
          </div>

          {renderDateFilterControls()}

          {/* 4 Required Real-Time Monthly Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
            {/* Card 1: Total Revenue Collected This Month (or Filtered Period) */}
            <div className="p-5 bg-white/95 rounded-3xl border border-slate-200/90 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  {datePresetFilter === 'all'
                    ? 'Total Revenue Collected'
                    : `Revenue (${getDateRangeLabel()})`}
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">
                ₹{totalRevenueFiltered.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-emerald-700 font-bold flex items-center justify-between pt-1 border-t border-slate-100">
                <span>This Month: ₹{totalRevenueThisMonth.toLocaleString('en-IN')}</span>
                <span>{settledMetricsEntries.length} Paid</span>
              </div>
            </div>

            {/* Card 2: Total Active Paid Clients */}
            <div className="p-5 bg-white/95 rounded-3xl border border-slate-200/90 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Total Active Paid Clients
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-indigo-700">
                {totalActivePaidClients}
              </div>
              <div className="text-[11px] text-slate-600 font-semibold flex items-center justify-between pt-1 border-t border-slate-100">
                <span>Out of {clients.length} Registered</span>
                <span className="text-emerald-700 font-bold">Verified Active</span>
              </div>
            </div>

            {/* Card 3: Total Discount Given */}
            <div className="p-5 bg-white/95 rounded-3xl border border-slate-200/90 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Total Discount Given
                </span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-purple-700">
                ₹{totalDiscountGiven.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-600 font-semibold flex items-center justify-between pt-1 border-t border-slate-100">
                <span>
                  {settledMetricsEntries.filter((e) => e.discountAmount > 0).length} Promo Redemptions
                </span>
                <span className="text-purple-700 font-bold">
                  {settledMetricsEntries.filter((e) => e.finalAmount === 1 && e.originalPrice > 1).length} × ₹1 Token
                </span>
              </div>
            </div>

            {/* Card 4: Pending Approvals */}
            <div className="p-5 bg-white/95 rounded-3xl border border-slate-200/90 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Pending Approvals
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-600">
                {pendingOfflineQueue.length}
              </div>
              <div className="text-[11px] text-slate-600 font-semibold flex items-center justify-between pt-1 border-t border-slate-100">
                <span>Offline Cash Requests</span>
                {onChangeSubFeature ? (
                  <button
                    type="button"
                    onClick={() => onChangeSubFeature('d2_offline_approvals')}
                    className="text-amber-700 hover:text-amber-900 font-black underline cursor-pointer"
                  >
                    {pendingOfflineQueue.length > 0 ? 'Open Approval Hub →' : 'View Hub →'}
                  </button>
                ) : (
                  <span className="text-amber-700 font-bold">
                    {pendingOfflineQueue.length > 0 ? 'Action Required' : 'All Cleared'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Payment Channel & Gateway Breakdown */}
          <div className="p-5 bg-white/90 rounded-3xl border border-slate-200/90 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Revenue Breakdown by Payment Gateway &amp; Mode ({getDateRangeLabel()})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Settled collections split across Online Gateways (Razorpay, PhonePe, Cashfree, PayPal) and Approved Offline Cash.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80">
                <span className="text-[10px] font-black uppercase text-indigo-700 block">
                  Online Gateways Settled
                </span>
                <span className="text-xl font-black text-indigo-950 mt-0.5 block">
                  ₹
                  {settledMetricsEntries
                    .filter((e) => e.paymentModeType === 'online')
                    .reduce((s, e) => s + e.finalAmount, 0)
                    .toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] text-indigo-700 font-semibold">
                  {settledMetricsEntries.filter((e) => e.paymentModeType === 'online').length} Online Transactions
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
                <span className="text-[10px] font-black uppercase text-emerald-700 block">
                  Cash / Offline Approved
                </span>
                <span className="text-xl font-black text-emerald-950 mt-0.5 block">
                  ₹
                  {settledMetricsEntries
                    .filter((e) => e.paymentModeType === 'cash')
                    .reduce((s, e) => s + e.finalAmount, 0)
                    .toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold">
                  {settledMetricsEntries.filter((e) => e.paymentModeType === 'cash').length} Cash Approvals
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90">
                <span className="text-[10px] font-black uppercase text-slate-600 block">
                  Gross Value Before Discounts
                </span>
                <span className="text-xl font-black text-slate-900 mt-0.5 block">
                  ₹
                  {settledMetricsEntries
                    .reduce((s, e) => s + e.originalPrice, 0)
                    .toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] text-slate-500 font-semibold">
                  Net Realized: ₹{totalRevenueFiltered.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-SECTION B: DETAILED TRANSACTION LEDGER & PAYMENT RECORDS              */}
      {/* ========================================================================= */}
      {currentTab === 'd2_transaction_ledger' && (
        <div className="space-y-4 animate-fade-in">
          {/* Header & Export Suite Toolbar */}
          <div className="p-4 sm:p-5 bg-white/95 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  Transaction Ledger &amp; PDF Export Suite
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {filteredLedgerEntries.length} Records
                </span>
              </div>

              {/* PDF & CSV Export Suite */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isExportingPdf || selectedLedgerIds.length === 0}
                  onClick={handleExportSelectedPdf}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all border ${
                    selectedLedgerIds.length > 0
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                >
                  {isExportingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Export Selected (PDF) ({selectedLedgerIds.length})</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingPdf || filteredLedgerEntries.length === 0}
                  onClick={handleExportAllPdf}
                  className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {isExportingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Export All (PDF)</span>
                </button>

                <button
                  type="button"
                  disabled={filteredLedgerEntries.length === 0}
                  onClick={handleExportCsv}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  <span>
                    Export CSV{selectedLedgerIds.length > 0 ? ` (${selectedLedgerIds.length})` : ''}
                  </span>
                </button>
              </div>
            </div>

            {/* Period Filter + Mode/Status/Search Filters */}
            {renderDateFilterControls()}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                >
                  <option value="all">All Payment Methods</option>
                  <option value="online">All Online Gateways</option>
                  <option value="razorpay">Razorpay Online</option>
                  <option value="phonepe">PhonePe PG</option>
                  <option value="cashfree">Cashfree</option>
                  <option value="paypal">PayPal</option>
                  <option value="cash">Cash / Offline Approved</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">Completed / Success</option>
                  <option value="pending">Pending Approval</option>
                  <option value="refunded">Refunded</option>
                  <option value="rejected">Rejected</option>
                </select>

                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer pointer-events-auto shrink-0 shadow-xs"
                  title="Reset all filters to default"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset Filters</span>
                </button>

                {selectedLedgerIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLedgerIds([])}
                    className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg"
                  >
                    Clear Selection ({selectedLedgerIds.length})
                  </button>
                )}
              </div>

              <div className="relative w-full md:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search member, ID, plan, ref ID, coupon..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Comprehensive Transaction Ledger Table */}
          <div className="bg-white/95 rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs">
            {filteredLedgerEntries.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Wallet className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">
                  No payment records match the selected filters.
                </p>
                <p className="text-[11px] text-slate-500">
                  Try switching the Billing Period Filter to &quot;All Time&quot; or resetting your active filters.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition-all cursor-pointer shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset All Filters</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200/90 bg-slate-50/95 text-slate-700 uppercase text-[10px] font-black tracking-wider">
                      <th className="py-3 px-3 w-9">
                        <button
                          type="button"
                          onClick={toggleSelectAllFiltered}
                          className="text-slate-600 hover:text-indigo-600 flex items-center"
                          title="Select / Deselect All Filtered"
                        >
                          {filteredLedgerEntries.length > 0 &&
                          filteredLedgerEntries.every((e) => selectedLedgerIds.includes(e.id)) ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-3">Member, Client ID &amp; Avatar</th>
                      <th className="py-3 px-3">Plan Purchased</th>
                      <th className="py-3 px-3">Date &amp; Exact Timestamp</th>
                      <th className="py-3 px-3">Payment Method</th>
                      <th className="py-3 px-3">Transaction / Ref ID</th>
                      <th className="py-3 px-3 text-right">Base Price</th>
                      <th className="py-3 px-3 text-center">Promo Coupon</th>
                      <th className="py-3 px-3 text-right">Discount</th>
                      <th className="py-3 px-3 text-right">Final Received</th>
                      <th className="py-3 px-3">Status Badge</th>
                      <th className="py-3 px-3 text-right">Invoice Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80">
                    {filteredLedgerEntries.map((item) => {
                      const isSelected = selectedLedgerIds.includes(item.id);
                      const statusLower = item.status.toLowerCase();

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isSelected ? 'bg-indigo-50/75' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              onClick={() => toggleSelectRow(item.id)}
                              className="text-slate-500 hover:text-indigo-600 flex items-center"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>

                          {/* Member Name, Client ID & Avatar */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={item.avatarUrl}
                                alt={item.clientName}
                                className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0 shadow-2xs"
                              />
                              <div>
                                <span className="font-black text-slate-900 block leading-tight">
                                  {item.clientName}
                                </span>
                                <span className="text-[10px] text-indigo-700 font-mono font-bold">
                                  @{item.clientId}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Plan Purchased & Validity */}
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-900 block">{item.planName}</span>
                            <span className="text-[10px] text-slate-500 font-mono block">
                              {item.validityPeriod}
                            </span>
                          </td>

                          {/* Date & Exact Timestamp */}
                          <td className="py-3 px-3 text-[11px] text-slate-700 font-medium whitespace-nowrap">
                            {item.timestamp}
                          </td>

                          {/* Payment Method */}
                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border inline-block ${
                                item.paymentModeType === 'cash'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {item.paymentModeLabel}
                            </span>
                          </td>

                          {/* Transaction / Payment Reference ID */}
                          <td className="py-3 px-3">
                            <span className="font-mono text-[11px] font-bold text-slate-800 block">
                              {item.referenceId}
                            </span>
                            <span className="font-mono text-[9px] text-slate-400 block">
                              {item.receiptNumber}
                            </span>
                          </td>

                          {/* Base Price */}
                          <td className="py-3 px-3 text-right text-slate-600 font-semibold">
                            ₹{item.originalPrice.toLocaleString('en-IN')}
                          </td>

                          {/* Promo Coupon Code Applied */}
                          <td className="py-3 px-3 text-center">
                            {item.couponCode && item.couponCode !== 'NONE' ? (
                              <span
                                className={`font-mono text-[10px] font-black px-2 py-0.5 rounded-md inline-block border ${
                                  item.discountPercent && item.discountPercent >= 100
                                    ? 'bg-purple-50 text-purple-800 border-purple-300'
                                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                }`}
                              >
                                {item.couponCode}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">
                                NONE
                              </span>
                            )}
                          </td>

                          {/* Discount Amount */}
                          <td className="py-3 px-3 text-right text-emerald-700 font-bold">
                            {item.discountAmount > 0
                              ? `-₹${item.discountAmount.toLocaleString('en-IN')}`
                              : '₹0'}
                          </td>

                          {/* Final Amount Received */}
                          <td className="py-3 px-3 text-right">
                            <span className="font-black text-slate-900 text-sm block">
                              ₹{item.finalAmount.toLocaleString('en-IN')}
                            </span>
                            {item.finalAmount === 1 && item.originalPrice > 1 && (
                              <span className="text-[9px] font-black uppercase text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded inline-block">
                                ₹1 Token Audit
                              </span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                statusLower === 'success'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : statusLower === 'pending'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : statusLower === 'refunded'
                                  ? 'bg-sky-50 text-sky-700 border-sky-300'
                                  : 'bg-rose-50 text-rose-700 border-rose-300'
                              }`}
                            >
                              {statusLower === 'success'
                                ? 'Completed / Success'
                                : statusLower === 'pending'
                                ? 'Pending Approval'
                                : item.status}
                            </span>
                          </td>

                          {/* Individual Invoice Receipt Actions */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openReceiptPreview(item)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1"
                                title="View & Print Slip"
                              >
                                <Receipt className="w-3 h-3" />
                                <span>Slip</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadSinglePdf(item)}
                                className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1 shadow-2xs"
                                title="Download Official Invoice PDF"
                              >
                                <Download className="w-3 h-3 text-sky-600" />
                                <span>PDF</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteTransaction(e, item)}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer pointer-events-auto"
                                title="Delete Transaction"
                              >
                                <Trash2 className="w-3 h-3 text-rose-600" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-SECTION C: UNIVERSAL PAYMENT GATEWAYS CONFIG                          */}
      {/* ========================================================================= */}
      {currentTab === 'd2_payment_gateways' && (
        <div className="animate-fade-in">
          <PaymentGatewaysManager />
        </div>
      )}

      {/* ========================================================================= */}
      {/* DEDICATED PERSONAL TRAINING (PT) PLANS & PRICING MANAGEMENT               */}
      {/* ========================================================================= */}
      {currentTab === 'd2_pt_plans' && (
        <div className="animate-fade-in">
          <PtPlansManager />
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONSOLIDATED FINANCIAL SUB-FEATURES (PLANS, COUPONS & OFFLINE APPROVALS) */}
      {/* ========================================================================= */}
      {(currentTab === 'd2_plans_catalog' ||
        currentTab === 'd2_promos_coupons' ||
        currentTab === 'd2_offline_approvals') && (
        <div className="animate-fade-in">
          <UnifiedMembershipManager
            clients={clients}
            plans={plans}
            memberships={memberships}
            offers={offers}
            hideInternalTabs={true}
            defaultSubTab={
              currentTab === 'd2_plans_catalog'
                ? 'pricing'
                : currentTab === 'd2_promos_coupons'
                ? 'coupons'
                : 'cash_desk'
            }
            onSelectClientForDetail={onSelectClientForDetail}
          />
        </div>
      )}

      {/* Printable / Interactive Receipt Modal */}
      {selectedReceiptTx && (
        <PaymentReceiptModal
          isOpen={true}
          transaction={selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
        />
      )}

      {/* 2-Step Transaction Deletion Confirmation Modal */}
      <GlobalDeleteConfirmModal
        isOpen={!!txToDelete}
        title="Confirm Permanent Deletion"
        itemName={
          txToDelete
            ? `${txToDelete.receiptNumber} (${txToDelete.clientName} - ₹${txToDelete.finalAmount})`
            : ''
        }
        itemType="Financial Transaction"
        description="Are you sure you want to permanently delete this transaction record? This will deduct the amount from Admin Revenue and remove it from the client's transaction history."
        confirmLabel="Yes, Permanently Delete"
        cancelLabel="Cancel"
        onClose={() => setTxToDelete(null)}
        onConfirm={confirmDeleteTransaction}
      />
      {/* Floating Global Action Toast (Always visible even when scrolled down long tables) */}
      {feedbackBanner &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{ zIndex: 9998 }}
            className={`fixed bottom-5 right-5 max-w-md px-4 py-3 rounded-2xl border shadow-2xl text-xs font-bold flex items-center justify-between gap-3 animate-fade-in ${
              feedbackBanner.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <span>{feedbackBanner.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};
