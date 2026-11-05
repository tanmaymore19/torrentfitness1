import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, query, limit, onSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';
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
    getCachedData<PaymentTransaction[]>('admin_payment_tx', [])
  );
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
    const mergeTx = (newDocs: PaymentTransaction[]) => {
      setTransactions((prev) => {
        const map = new Map<string, PaymentTransaction>();
        prev.forEach((t) => map.set(t.id, t));
        newDocs.forEach((t) => map.set(t.id, { ...map.get(t.id), ...t }));
        const list = Array.from(map.values()).sort(
          (a, b) =>
            new Date(b.createdAt || b.timestamp || 0).getTime() -
            new Date(a.createdAt || a.timestamp || 0).getTime()
        );
        setCachedData('admin_payment_tx', list);
        return list;
      });
    };

    const unsubTx = onSnapshot(
      query(collection(db, 'paymentTransactions'), limit(100)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentTransaction));
        mergeTx(list);
      },
      (err) => console.warn('BillingPaymentsHub transactions listener note:', err)
    );

    const unsubTx2 = onSnapshot(
      query(collection(db, 'transactions'), limit(100)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentTransaction));
        mergeTx(list);
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

      const gwLabel = isCash
        ? tx.status === 'pending'
          ? 'Cash / Offline (Pending Approval)'
          : tx.status === 'rejected'
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

      const sDate = tx.startDate || matchingMem?.startDate || tx.createdAt.split('T')[0];
      const eDate = tx.endDate || matchingMem?.endDate || 'Active Term';
      const validity = eDate !== 'Active Term' ? `${sDate} to ${eDate}` : sDate;

      const formattedTime = new Date(tx.createdAt).toLocaleString('en-IN', {
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
          tx.status === 'success'
            ? 'Active'
            : tx.status === 'pending'
            ? 'Pending Approval'
            : 'Inactive',
        status:
          tx.status === 'success'
            ? 'Success'
            : tx.status === 'pending'
            ? 'Pending'
            : tx.status === 'rejected'
            ? 'Rejected'
            : tx.status === 'refunded'
            ? 'Refunded'
            : 'Failed',
        rawTx: tx
      });
    }

    // Include verified historical memberships without a separate paymentTransaction doc (excluding dummy test accounts)
    for (const m of memberships) {
      if (seenMembershipIds.has(m.id)) continue;
      if (m.clientId?.includes('demo') || m.clientId?.includes('ananya')) continue;
      const clientProfile = clients.find((c) => c.userId === m.clientId);
      const avatarUrl =
        clientProfile?.photoUrl ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';

      const isCash = m.paymentMode === 'cash';
      const rawCreated = m.createdAt || `${m.startDate}T10:00:00.000Z`;
      const formattedTime = new Date(rawCreated).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const finalPaid = m.amountPaid || 0;
      const origPrice = m.originalPrice ?? finalPaid;
      const discAmt = m.discountAmount ?? Math.max(0, origPrice - finalPaid);
      const rawCode = (m.couponCode || '').trim().toUpperCase();
      const matchedOffer = rawCode
        ? offers.find((o) => o.code.toUpperCase() === rawCode)
        : undefined;
      const resolvedPct =
        m.discountPercent ||
        matchedOffer?.discountPercent ||
        (rawCode && finalPaid === 1 && origPrice > 1 ? 100 : 0);

      const formattedCoupon =
        rawCode && rawCode !== 'NONE'
          ? resolvedPct > 0
            ? `${rawCode} (${resolvedPct}% PROMO)`
            : rawCode
          : 'NONE';

      items.push({
        id: m.id,
        receiptNumber: m.receiptNumber || `TF-MEM-${m.id.slice(-6).toUpperCase()}`,
        referenceId: m.referenceId || m.id.toUpperCase(),
        clientId: m.clientId,
        clientName: m.clientName || clientProfile?.displayName || 'Member',
        clientPhone: clientProfile?.phone,
        avatarUrl,
        planName: `${m.planName} (${m.durationMonths}M)`,
        validityPeriod: `${m.startDate} to ${m.endDate}`,
        paymentModeLabel: isCash
          ? m.status === 'pending'
            ? 'Cash / Offline (Pending Approval)'
            : 'Cash / Offline Approved'
          : `${m.gatewayName || 'Razorpay Online'}`,
        paymentModeType: isCash ? 'cash' : 'online',
        gatewayProviderKey: isCash ? 'cash' : 'razorpay',
        timestamp: formattedTime,
        rawDate: rawCreated,
        originalPrice: origPrice,
        couponCode: formattedCoupon,
        discountPercent: resolvedPct,
        discountAmount: discAmt,
        finalAmount: finalPaid,
        verificationStatus:
          m.status === 'active'
            ? 'Active'
            : m.status === 'pending'
            ? 'Pending Approval'
            : 'Inactive',
        status:
          m.status === 'active'
            ? 'Success'
            : m.status === 'pending'
            ? 'Pending'
            : m.status === 'rejected'
            ? 'Rejected'
            : 'Refunded'
      });
    }

    return items.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
  }, [transactions, memberships, offers, clients]);

  // Advanced Date-Filtered Entries
  const dateFilteredEntries = useMemo(() => {
    return masterLedgerEntries.filter((entry) => {
      const d = new Date(entry.rawDate);
      const dateStr = entry.rawDate.split('T')[0];

      if (datePresetFilter === 'today') {
        return d.toDateString() === now.toDateString();
      }

      if (datePresetFilter === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return d >= startOfWeek;
      }

      if (datePresetFilter === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }

      if (datePresetFilter === 'last_month') {
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return d.getMonth() === lastMonth && d.getFullYear() === targetYear;
      }

      if (datePresetFilter === 'quarter') {
        const currQ = Math.floor(now.getMonth() / 3);
        const entryQ = Math.floor(d.getMonth() / 3);
        return entryQ === currQ && d.getFullYear() === now.getFullYear();
      }

      if (datePresetFilter === 'year') {
        return d.getFullYear() === now.getFullYear();
      }

      if (datePresetFilter === 'custom') {
        if (customStartDate && dateStr < customStartDate) return false;
        if (customEndDate && dateStr > customEndDate) return false;
      }

      return true;
    });
  }, [masterLedgerEntries, datePresetFilter, customStartDate, customEndDate]);

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
  const settledMetricsEntries = metricsSource.filter((e) => e.status === 'Success');
  const settledThisMonthEntries = currentMonthEntries.filter((e) => e.status === 'Success');

  const totalRevenueFiltered = settledMetricsEntries.reduce((sum, e) => sum + e.finalAmount, 0);
  const totalRevenueThisMonth = settledThisMonthEntries.reduce((sum, e) => sum + e.finalAmount, 0);

  const totalActivePaidClients = clients.filter(
    (c) => c.membershipStatus === 'active' && !c.isSelfDeleted
  ).length;

  const totalDiscountGiven = settledMetricsEntries.reduce((sum, e) => sum + e.discountAmount, 0);
  const pendingOfflineQueue = useMemo(() => {
    return transactions.filter(
      (t) =>
        (t.paymentMode === 'cash' || t.gatewayProvider === 'offline_cash') &&
        t.status === 'pending'
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
    item: PaymentLedgerExportItem & { rawTx?: PaymentTransaction }
  ) => {
    setTxToDelete(item);
  };

  const confirmDeleteTransaction = async () => {
    if (!txToDelete) return;
    try {
      // 1. Delete from paymentTransactions collection
      await deleteDoc(doc(db, 'paymentTransactions', txToDelete.id));

      // 2. If it was linked to a membership record or is a membership id, delete as well
      if (txToDelete.rawTx?.membershipId) {
        try {
          await deleteDoc(doc(db, 'memberships', txToDelete.rawTx.membershipId));
        } catch {}
      } else {
        try {
          await deleteDoc(doc(db, 'memberships', txToDelete.id));
        } catch {}
      }

      // 3. Immediately update local transactions state so all KPIs dynamically recalculate instantly
      setTransactions((prev) => prev.filter((t) => t.id !== txToDelete.id));
      setSelectedLedgerIds((prev) => prev.filter((id) => id !== txToDelete.id));

      setFeedbackBanner({
        type: 'success',
        text: `Transaction ${txToDelete.receiptNumber} (${txToDelete.clientName}) voided & permanently deleted. Revenue metrics updated.`
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: `Error deleting transaction: ${err.message}`
      });
    } finally {
      setTxToDelete(null);
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
                  Try switching the Billing Period Filter to &quot;All Time&quot; or clearing your search query.
                </p>
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
                                onClick={() => handleDeleteTransaction(item)}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1 shadow-2xs"
                                title="Delete / Void Transaction"
                              >
                                <Trash2 className="w-3 h-3 text-rose-600" />
                                <span>Void</span>
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
        title="Delete / Void Transaction"
        itemName={
          txToDelete
            ? `${txToDelete.receiptNumber} (${txToDelete.clientName} - ₹${txToDelete.finalAmount})`
            : ''
        }
        itemType="Financial Transaction"
        description="Are you sure you want to permanently delete and void this payment record from the ledger?"
        warningNote="Revenue totals and financial ledger metrics will be dynamically recalculated immediately."
        confirmLabel="Yes, Void & Delete"
        onClose={() => setTxToDelete(null)}
        onConfirm={confirmDeleteTransaction}
      />
    </div>
  );
};
