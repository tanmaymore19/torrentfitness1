import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { doc, setDoc, updateDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import {
  MembershipPlan,
  MembershipRecord,
  ClientProfile,
  PromotionalOffer,
  PaymentTransaction
} from '../../types';
import {
  approveOfflinePaymentRequest,
  rejectOfflinePaymentRequest,
  calculateExpiryFromPaymentDate
} from '../../services/paymentService';
import {
  PaymentLedgerExportItem,
  exportSinglePaymentInvoicePdf,
  exportSelectedPaymentsLedgerPdf,
  exportBulkPaymentsLedgerPdf
} from '../../services/pdfExportService';
import { usePdfDownload } from '../../context/PdfDownloadContext';
import { GlobalDeleteConfirmModal } from '../common/GlobalDeleteConfirmModal';
import {
  CreditCard,
  Tag,
  Plus,
  Percent,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit2,
  UserCheck,
  Search,
  RotateCcw,
  Check,
  X,
  Clock,
  Download,
  FileText,
  Calendar,
  CheckSquare,
  Square,
  Loader2,
  Trash2,
  Banknote,
  Archive
} from 'lucide-react';

export type Domain04SubView = 'pricing' | 'cash_desk' | 'coupons' | 'ledger' | 'management';

interface UnifiedMembershipManagerProps {
  clients: ClientProfile[];
  plans: MembershipPlan[];
  memberships: MembershipRecord[];
  offers?: PromotionalOffer[];
  defaultSubTab?: Domain04SubView;
  hideInternalTabs?: boolean;
  onSelectClientForDetail?: (client: ClientProfile) => void;
}

export const UnifiedMembershipManager: React.FC<UnifiedMembershipManagerProps> = ({
  clients,
  plans,
  memberships,
  offers = [],
  defaultSubTab = 'pricing',
  hideInternalTabs = false,
  onSelectClientForDetail
}) => {
  const { currentUser } = useAuth();
  const { requestPdfDownload } = usePdfDownload();
  const [activeSubTab, setActiveSubTab] = useState<Domain04SubView>(
    defaultSubTab === 'management' ? 'cash_desk' : defaultSubTab
  );

  // Live Payment Transactions from Firestore
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Enhanced Offline Payment Approval Modal State
  const [approvingOfflineTx, setApprovingOfflineTx] = useState<PaymentTransaction | null>(null);
  const [approvalAmountInput, setApprovalAmountInput] = useState<number>(0);
  const [approvalDateInput, setApprovalDateInput] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Global Delete Confirmation Targets
  const [planToDelete, setPlanToDelete] = useState<MembershipPlan | null>(null);
  const [couponToDelete, setCouponToDelete] = useState<PromotionalOffer | null>(null);

  // Ledger Filters & Selection State
  const [ledgerModeFilter, setLedgerModeFilter] = useState<'all' | 'online' | 'cash'>('all');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'all' | 'success' | 'pending' | 'rejected'>('all');
  const [dateRangePreset, setDateRangePreset] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [membershipSearch, setMembershipSearch] = useState('');
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<string[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  useEffect(() => {
    setActiveSubTab(defaultSubTab === 'management' ? 'cash_desk' : defaultSubTab);
  }, [defaultSubTab]);

  useEffect(() => {
    const unsubTx = onSnapshot(
      collection(db, 'paymentTransactions'),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentTransaction));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTransactions(list);
      },
      (err) => console.warn('UnifiedMembershipManager paymentTransactions listener note:', err)
    );
    return () => unsubTx();
  }, []);

  // Cancellation Modal State
  const [cancellingMembership, setCancellingMembership] = useState<MembershipRecord | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Coupon Management State
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponTitle, setNewCouponTitle] = useState('');
  const [newCouponDiscount, setNewCouponDiscount] = useState<number>(15);
  const [newCouponDays, setNewCouponDays] = useState<number>(30);
  const [newCouponMaxLimit, setNewCouponMaxLimit] = useState<number>(10);
  const [newCouponDesc, setNewCouponDesc] = useState('');
  const [newCouponApplicableTarget, setNewCouponApplicableTarget] = useState<'all' | 'specific'>('all');
  const [newCouponPlanIds, setNewCouponPlanIds] = useState<string[]>([]);
  const [isCreatingCoupon, setIsCreatingCoupon] = useState(false);

  // Coupon Edit Modal State
  const [editingCoupon, setEditingCoupon] = useState<PromotionalOffer | null>(null);
  const [editCouponDiscount, setEditCouponDiscount] = useState<number>(15);
  const [editCouponMaxLimit, setEditCouponMaxLimit] = useState<number>(10);
  const [editCouponDays, setEditCouponDays] = useState<number>(30);
  const [editCouponDate, setEditCouponDate] = useState<string>('');
  const [editCouponApplicableTarget, setEditCouponApplicableTarget] = useState<'all' | 'specific'>('all');
  const [editCouponPlanIds, setEditCouponPlanIds] = useState<string[]>([]);
  const [isSavingCouponEdit, setIsSavingCouponEdit] = useState(false);

  // Auto-lock any coupon in Firestore whose real-time usage has reached or exceeded maxUsageLimit
  useEffect(() => {
    offers.forEach((off) => {
      const used = Number(off.timesUsed || 0);
      const limit = Number(off.maxUsageLimit || 0);
      if (limit > 0 && used >= limit && off.active) {
        updateDoc(doc(db, 'offers', off.id), {
          active: false,
          deactivatedAt: new Date().toISOString()
        }).catch(() => {});
      }
    });
  }, [offers]);

  // Plan Edit Modal
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editOriginalPrice, setEditOriginalPrice] = useState<number>(0);
  const [editName, setEditName] = useState<string>('');
  const [editDuration, setEditDuration] = useState<number>(1);
  const [editBenefits, setEditBenefits] = useState<string>('');
  const [editPopular, setEditPopular] = useState<boolean>(false);
  const [editActive, setEditActive] = useState<boolean>(true);

  // Custom Discount Modal
  const [discountingPlan, setDiscountingPlan] = useState<MembershipPlan | null>(null);
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(15);
  const [discountTag, setDiscountTag] = useState<string>('Special Promo');
  const [isSavingDiscount, setIsSavingDiscount] = useState<boolean>(false);

  // Add new plan modal
  const [isAddingNewPlan, setIsAddingNewPlan] = useState<boolean>(false);
  const [newPlanName, setNewPlanName] = useState<string>('');
  const [newPlanDuration, setNewPlanDuration] = useState<number>(3);
  const [newPlanPrice, setNewPlanPrice] = useState<number>(3500);

  const getEffectivePrice = (plan: MembershipPlan) => {
    let p = plan.price;
    if (plan.isDiscountActive && plan.discountPercent && plan.discountPercent > 0) {
      p = Math.round(p * (1 - plan.discountPercent / 100));
    } else if (plan.isDiscountActive && plan.discountAmount && plan.discountAmount > 0) {
      p = Math.max(0, p - plan.discountAmount);
    }
    return p;
  };

  // Method A: Open Enhanced Offline Approval Modal (Strict Admin Verification)
  const openApproveOfflineModal = (tx: PaymentTransaction) => {
    setApprovingOfflineTx(tx);
    setApprovalAmountInput(tx.finalAmount ?? tx.amount ?? 0);
    setApprovalDateInput(new Date().toISOString().split('T')[0]);
  };

  // Method A: Confirm & Activate Offline Payment with Custom Amount & Payment Received Date
  const handleConfirmApproveOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingOfflineTx) return;
    const tx = approvingOfflineTx;
    setProcessingApprovalId(tx.id);
    try {
      const startDateStr = approvalDateInput || new Date().toISOString().split('T')[0];
      const { expiryDate } = calculateExpiryFromPaymentDate(
        startDateStr,
        tx.durationMonths || 1
      );
      await approveOfflinePaymentRequest(tx.id, {
        amountReceived: Number(approvalAmountInput),
        paymentReceivedDate: startDateStr,
        approvedByAdminId: currentUser?.uid || 'admin_master',
        approvedByAdminName: currentUser?.displayName || 'Master Admin'
      });
      setApprovingOfflineTx(null);
      setFeedbackBanner({
        type: 'success',
        text: `Approved & Activated ${tx.clientName}'s membership (${
          tx.planName || tx.itemTitle
        })! Recorded ₹${Number(approvalAmountInput).toLocaleString(
          'en-IN'
        )} • Validity: ${startDateStr} → ${expiryDate}`
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: 'Failed to approve request: ' + (err.message || 'Unknown error')
      });
    } finally {
      setProcessingApprovalId(null);
    }
  };

  const handleRejectOfflineRequest = async (tx: PaymentTransaction) => {
    setProcessingApprovalId(tx.id);
    try {
      await rejectOfflinePaymentRequest(tx.id, 'Declined by Admin at Offline Approval Queue');
      setFeedbackBanner({
        type: 'success',
        text: `Rejected offline cash request from ${tx.clientName} and notified the member.`
      });
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: 'Failed to reject request: ' + (err.message || 'Unknown error')
      });
    } finally {
      setProcessingApprovalId(null);
    }
  };

  const pendingOfflineQueue = useMemo(() => {
    return transactions.filter(
      t => (t.paymentMode === 'cash' || t.gatewayProvider === 'offline_cash') && t.status === 'pending'
    );
  }, [transactions]);

  // Build Unified Master Payment Ledger combining PaymentTransactions + Historical MembershipRecords
  const masterLedgerEntries: PaymentLedgerExportItem[] = useMemo(() => {
    const items: PaymentLedgerExportItem[] = [];
    const seenMembershipIds = new Set<string>();

    for (const tx of transactions) {
      if (tx.membershipId) seenMembershipIds.add(tx.membershipId);
      const matchingMem = memberships.find(
        m => m.id === tx.membershipId || m.transactionId === tx.id
      );
      if (matchingMem) seenMembershipIds.add(matchingMem.id);

      const isCash =
        tx.paymentMode === 'cash' ||
        tx.gatewayProvider === 'offline_cash' ||
        tx.gatewayProvider === 'cash';

      const gwLabel = isCash
        ? tx.status === 'pending'
          ? 'Offline Cash (Pending Approval)'
          : tx.status === 'rejected'
          ? 'Offline Cash (Rejected)'
          : 'Offline Cash Approved'
        : `Online via ${
            tx.gatewayName ||
            (tx.gatewayProvider === 'cashfree'
              ? 'Cashfree'
              : tx.gatewayProvider === 'phonepe'
              ? 'PhonePe PG'
              : tx.gatewayProvider === 'paypal'
              ? 'PayPal'
              : 'Razorpay')
          }`;

      const sDate = tx.startDate || matchingMem?.startDate || tx.createdAt.split('T')[0];
      const eDate = tx.endDate || matchingMem?.endDate || 'Active Term';
      const validity = eDate !== 'Active Term' ? `${sDate} → ${eDate}` : sDate;

      const formattedTime = new Date(tx.createdAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const finalPaid = tx.finalAmount ?? tx.amount ?? 0;
      const origPrice = tx.originalPrice ?? matchingMem?.originalPrice ?? finalPaid;
      const discAmt = tx.discountAmount ?? matchingMem?.discountAmount ?? Math.max(0, origPrice - finalPaid);
      const rawCode = (tx.couponCode || matchingMem?.couponCode || '').trim().toUpperCase();
      const matchedOffer = rawCode ? offers.find(o => o.code.toUpperCase() === rawCode) : undefined;
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
        clientName: tx.clientName,
        clientPhone: tx.clientPhone,
        planName: tx.planName || matchingMem?.planName || tx.itemTitle,
        validityPeriod: validity,
        paymentModeLabel: gwLabel,
        paymentModeType: isCash ? 'cash' : 'online',
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
            : 'Failed'
      });
    }

    // Include any seeded/legacy memberships that didn't have a separate paymentTransaction document
    for (const m of memberships) {
      if (seenMembershipIds.has(m.id)) continue;
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
      const matchedOffer = rawCode ? offers.find(o => o.code.toUpperCase() === rawCode) : undefined;
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
        clientName: m.clientName,
        planName: `${m.planName} (${m.durationMonths}M)`,
        validityPeriod: `${m.startDate} → ${m.endDate}`,
        paymentModeLabel: isCash
          ? m.status === 'pending'
            ? 'Offline Cash (Pending Approval)'
            : 'Offline Cash Approved'
          : `Online via ${m.gatewayName || 'Razorpay'}`,
        paymentModeType: isCash ? 'cash' : 'online',
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
  }, [transactions, memberships, offers]);

  // Filtered Master Ledger Entries
  const filteredLedgerEntries = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return masterLedgerEntries.filter((entry) => {
      if (ledgerModeFilter !== 'all' && entry.paymentModeType !== ledgerModeFilter) {
        return false;
      }

      if (ledgerStatusFilter !== 'all' && entry.status.toLowerCase() !== ledgerStatusFilter) {
        return false;
      }

      // Date Range Filter
      const entryDate = new Date(entry.rawDate);
      const entryDateStr = entry.rawDate.split('T')[0];

      if (dateRangePreset === 'today' && entryDateStr !== todayStr) {
        return false;
      }
      if (dateRangePreset === 'week' && entryDate < weekAgo) {
        return false;
      }
      if (dateRangePreset === 'month' && entryDate < monthStart) {
        return false;
      }
      if (dateRangePreset === 'custom') {
        if (customStartDate && entryDateStr < customStartDate) return false;
        if (customEndDate && entryDateStr > customEndDate) return false;
      }

      // Search query
      if (membershipSearch.trim()) {
        const q = membershipSearch.toLowerCase();
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
  }, [
    masterLedgerEntries,
    ledgerModeFilter,
    ledgerStatusFilter,
    dateRangePreset,
    customStartDate,
    customEndDate,
    membershipSearch
  ]);

  const getDateRangeLabel = (): string => {
    switch (dateRangePreset) {
      case 'today':
        return `Today (${new Date().toISOString().split('T')[0]})`;
      case 'week':
        return 'This Week (Last 7 Days)';
      case 'month':
        return 'This Month';
      case 'custom':
        return `Custom Range (${customStartDate || 'Start'} to ${customEndDate || 'Now'})`;
      default:
        return 'All Time';
    }
  };

  // Checkbox Multi-Select Handlers
  const toggleSelectLedgerRow = (id: string) => {
    setSelectedLedgerIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    const allFilteredIds = filteredLedgerEntries.map(e => e.id);
    const allSelected =
      allFilteredIds.length > 0 && allFilteredIds.every(id => selectedLedgerIds.includes(id));
    if (allSelected) {
      setSelectedLedgerIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedLedgerIds(Array.from(new Set([...selectedLedgerIds, ...allFilteredIds])));
    }
  };

  // PDF Export Handlers
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

  const handleDownloadSelectedPdf = () => {
    const selectedItems = masterLedgerEntries.filter(e => selectedLedgerIds.includes(e.id));
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

  const handleDownloadBulkPdf = () => {
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

  // Plan Edit & Discount Handlers
  const handleOpenEditPlan = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    setEditName(plan.name);
    setEditPrice(plan.price);
    setEditOriginalPrice(plan.originalPrice || plan.price);
    setEditDuration(plan.durationMonths);
    setEditBenefits(plan.benefits ? plan.benefits.join('\n') : '');
    setEditPopular(!!plan.popular);
    setEditActive(plan.active !== false);
  };

  const handleSavePlanEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    try {
      const planRef = doc(db, 'membershipPlans', editingPlan.id);
      const benefitsArr = editBenefits
        .split('\n')
        .map(b => b.trim())
        .filter(b => b.length > 0);

      await updateDoc(planRef, {
        name: editName.trim(),
        price: Number(editPrice),
        originalPrice: Number(editOriginalPrice),
        durationMonths: Number(editDuration),
        benefits: benefitsArr.length > 0 ? benefitsArr : editingPlan.benefits,
        popular: editPopular,
        active: editActive
      });

      setFeedbackBanner({
        type: 'success',
        text: `Plan "${editName}" updated! New price: ₹${Number(editPrice).toLocaleString('en-IN')}`
      });
      setEditingPlan(null);
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error updating plan: ' + err.message });
    }
  };

  const handleApplyCustomDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountingPlan) return;
    setIsSavingDiscount(true);

    try {
      const planRef = doc(db, 'membershipPlans', discountingPlan.id);
      const isPercent = discountType === 'percent';

      await updateDoc(planRef, {
        isDiscountActive: true,
        discountPercent: isPercent ? Number(discountValue) : 0,
        discountAmount: !isPercent ? Number(discountValue) : 0,
        discountTag: discountTag.trim() || `${discountValue}${isPercent ? '%' : '₹'} OFF`
      });

      setFeedbackBanner({
        type: 'success',
        text: `Custom discount applied to ${discountingPlan.name}!`
      });
      setDiscountingPlan(null);
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error applying discount: ' + err.message });
    } finally {
      setIsSavingDiscount(false);
    }
  };

  const handleRevokeDiscount = async (plan: MembershipPlan) => {
    try {
      const planRef = doc(db, 'membershipPlans', plan.id);
      await updateDoc(planRef, {
        isDiscountActive: false,
        discountPercent: 0,
        discountAmount: 0,
        discountTag: ''
      });

      setFeedbackBanner({
        type: 'success',
        text: `Discount revoked on "${plan.name}". Standard pricing restored.`
      });
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error revoking discount: ' + err.message });
    }
  };

  const handleCreateNewPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanName.trim()) return;

    try {
      const planId = `plan_${newPlanDuration}m_${Date.now()}`;
      const newPlan: MembershipPlan = {
        id: planId,
        name: newPlanName.trim(),
        durationMonths: Number(newPlanDuration),
        price: Number(newPlanPrice),
        originalPrice: Math.round(Number(newPlanPrice) * 1.25),
        active: true,
        popular: false,
        benefits: [
          'Full Gym & Cardio Floor Access',
          'Free Locker & Changing Room',
          'Fitness App Progress Tracking'
        ]
      };

      await setDoc(doc(db, 'membershipPlans', planId), newPlan);
      setFeedbackBanner({ type: 'success', text: `New plan "${newPlanName}" created!` });
      setIsAddingNewPlan(false);
      setNewPlanName('');
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error creating plan: ' + err.message });
    }
  };

  // Delete Membership Plan permanently from Firestore (instant removal from Client Checkout)
  const handleDeletePlan = async (plan: MembershipPlan) => {
    await deleteDoc(doc(db, 'membershipPlans', plan.id));
    setFeedbackBanner({
      type: 'success',
      text: `Deleted membership plan "${plan.name}". Removed from Client Checkout immediately.`
    });
  };

  // Archive / Restore Membership Plan visibility in Client Checkout
  const handleTogglePlanArchive = async (plan: MembershipPlan) => {
    try {
      const nextActive = plan.active === false ? true : false;
      await updateDoc(doc(db, 'membershipPlans', plan.id), {
        active: nextActive,
        updatedAt: new Date().toISOString()
      });
      setFeedbackBanner({
        type: 'success',
        text: nextActive
          ? `Restored "${plan.name}" to Client Checkout.`
          : `Archived "${plan.name}". Hidden from Client Checkout immediately.`
      });
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error updating plan status: ' + err.message });
    }
  };

  // Delete Promo Coupon permanently
  const handleDeleteCoupon = async (coupon: PromotionalOffer) => {
    await deleteDoc(doc(db, 'offers', coupon.id));
    setFeedbackBanner({
      type: 'success',
      text: `Deleted promo coupon "${coupon.code}".`
    });
  };

  const handleCancelMembership = async (record: MembershipRecord) => {
    setIsCancelling(true);
    try {
      await updateDoc(doc(db, 'memberships', record.id), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancellationReason: 'Admin manual revocation'
      });

      await updateDoc(doc(db, 'clientProfiles', record.clientId), {
        membershipStatus: 'inactive',
        updatedAt: new Date().toISOString()
      });

      setFeedbackBanner({
        type: 'success',
        text: `Membership for ${record.clientName} has been revoked.`
      });
      setCancellingMembership(null);
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Failed to cancel membership: ' + err.message });
    } finally {
      setIsCancelling(false);
    }
  };

  // Coupon Handlers
  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) return;

    setIsCreatingCoupon(true);
    try {
      const offerId = `offer_${Date.now()}`;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + Number(newCouponDays));
      const expiryStr = expiryDate.toISOString().split('T')[0];
      const pct = Math.min(100, Math.max(1, Number(newCouponDiscount) || 15));
      const limitCount = Math.max(1, Number(newCouponMaxLimit) || 10);

      const newOffer: PromotionalOffer = {
        id: offerId,
        code: newCouponCode.trim().toUpperCase(),
        title:
          newCouponTitle.trim() ||
          (pct === 100
            ? `${newCouponCode.trim().toUpperCase()} 100% Promo (₹1 Token)`
            : `${newCouponCode.trim().toUpperCase()} Promo`),
        discountPercent: pct,
        description:
          newCouponDesc.trim() ||
          (pct === 100
            ? `100% Discount Promo (Nominal ₹1 verification token fee applies)`
            : `${pct}% OFF Promo Coupon`),
        active: true,
        validityDays: Number(newCouponDays),
        validUntil: expiryStr,
        maxUsageLimit: limitCount,
        timesUsed: 0,
        applicableTarget: newCouponApplicableTarget,
        applicablePlanIds: newCouponApplicableTarget === 'specific' ? newCouponPlanIds : [],
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'offers', offerId), newOffer);
      setFeedbackBanner({
        type: 'success',
        text: `Coupon "${newOffer.code}" (${pct}% OFF • Limit: ${limitCount} redemptions) created! Valid until ${expiryStr}.`
      });
      setNewCouponCode('');
      setNewCouponTitle('');
      setNewCouponDiscount(15);
      setNewCouponDays(30);
      setNewCouponMaxLimit(10);
      setNewCouponDesc('');
      setNewCouponApplicableTarget('all');
      setNewCouponPlanIds([]);
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error creating coupon: ' + err.message });
    } finally {
      setIsCreatingCoupon(false);
    }
  };

  const handleSaveCouponEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon) return;

    setIsSavingCouponEdit(true);
    try {
      const offerRef = doc(db, 'offers', editingCoupon.id);
      let expiryStr = editCouponDate;
      if (!expiryStr) {
        const d = new Date();
        d.setDate(d.getDate() + Number(editCouponDays));
        expiryStr = d.toISOString().split('T')[0];
      }

      const pct = Math.min(100, Math.max(1, Number(editCouponDiscount) || editingCoupon.discountPercent));
      const updatedMaxLimit = Math.max(1, Number(editCouponMaxLimit) || 10);
      const currentUsed = Number(editingCoupon.timesUsed || 0);
      const shouldBeActive = currentUsed < updatedMaxLimit;

      await updateDoc(offerRef, {
        discountPercent: pct,
        maxUsageLimit: updatedMaxLimit,
        validityDays: Number(editCouponDays),
        validUntil: expiryStr,
        applicableTarget: editCouponApplicableTarget,
        applicablePlanIds: editCouponApplicableTarget === 'specific' ? editCouponPlanIds : [],
        active: shouldBeActive
      });

      setFeedbackBanner({
        type: 'success',
        text: `Coupon "${editingCoupon.code}" updated (${pct}% OFF • Limit: ${currentUsed}/${updatedMaxLimit} used)!`
      });
      setEditingCoupon(null);
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error updating coupon: ' + err.message });
    } finally {
      setIsSavingCouponEdit(false);
    }
  };

  const handleDeactivateCoupon = async (coupon: PromotionalOffer) => {
    try {
      await updateDoc(doc(db, 'offers', coupon.id), {
        active: false,
        deactivatedAt: new Date().toISOString()
      });
      setFeedbackBanner({ type: 'success', text: `Coupon "${coupon.code}" deactivated.` });
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error deactivating coupon: ' + err.message });
    }
  };

  const handleReactivateCoupon = async (coupon: PromotionalOffer) => {
    try {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      const expiryStr = d.toISOString().split('T')[0];
      const used = Number(coupon.timesUsed || 0);
      const currentLimit = Number(coupon.maxUsageLimit || 10);
      const nextLimit = used >= currentLimit ? used + 10 : currentLimit;

      await updateDoc(doc(db, 'offers', coupon.id), {
        active: true,
        validityDays: 30,
        validUntil: expiryStr,
        maxUsageLimit: nextLimit
      });

      setFeedbackBanner({
        type: 'success',
        text: `Coupon "${coupon.code}" re-activated until ${expiryStr} (Limit: ${used}/${nextLimit}).`
      });
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: 'Error re-activating coupon: ' + err.message });
    }
  };

  const getCouponStatus = (coupon: PromotionalOffer) => {
    const now = new Date();
    const validUntilDate = new Date(coupon.validUntil);
    const diffMs = validUntilDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isExpired = diffMs <= 0;
    const used = Number(coupon.timesUsed || 0);
    const limit = Number(coupon.maxUsageLimit || 0);
    const isLimitReached = limit > 0 && used >= limit;

    if (isLimitReached) {
      return {
        status: 'limit_reached',
        label: 'LIMIT REACHED (LOCKED)',
        badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300',
        daysText: `${used}/${limit} Redeemed`
      };
    }

    if (!coupon.active) {
      return {
        status: 'deactivated',
        label: 'DEACTIVATED',
        badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
        daysText: 'Deactivated'
      };
    }

    if (isExpired) {
      return {
        status: 'expired',
        label: 'EXPIRED',
        badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
        daysText: 'Validity Expired'
      };
    }

    return {
      status: 'active',
      label: 'ACTIVE',
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      daysText: daysRemaining === 1 ? '1 day left' : `${daysRemaining} days left`
    };
  };

  const filteredMemberships = memberships.filter(m => {
    const q = membershipSearch.toLowerCase();
    return (
      m.clientName.toLowerCase().includes(q) ||
      m.clientId.toLowerCase().includes(q) ||
      m.planName.toLowerCase().includes(q)
    );
  });

  // Financial KPI Totals from Master Ledger
  const settledLedger = masterLedgerEntries.filter(e => e.status === 'Success');
  const totalSettledRevenue = settledLedger.reduce((sum, e) => sum + e.finalAmount, 0);
  const onlineGatewayRevenue = settledLedger
    .filter(e => e.paymentModeType === 'online')
    .reduce((sum, e) => sum + e.finalAmount, 0);
  const offlineApprovedRevenue = settledLedger
    .filter(e => e.paymentModeType === 'cash')
    .reduce((sum, e) => sum + e.finalAmount, 0);

  return (
    <div className="space-y-5">
      {/* Optional Internal Switcher */}
      {!hideInternalTabs && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900">
                Plans, Offline Approvals &amp; Master Payment Ledger
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-pink-50 text-pink-700 border border-pink-200 shadow-2xs">
                DOMAIN 04
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              2-Tier Enterprise Billing: Plans catalog, Pending Offline Approvals queue, coupons, and Master Payment Ledger with PDF Export Suite.
            </p>
          </div>

          <div className="flex flex-wrap p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/90 self-start sm:self-auto gap-1 shadow-2xs">
            {[
              { key: 'pricing', label: '1. Plans Catalog', icon: Tag },
              {
                key: 'cash_desk',
                label: `2. Pending Offline Approvals (${pendingOfflineQueue.length})`,
                icon: UserCheck
              },
              { key: 'coupons', label: '3. Promos & Coupons', icon: Percent },
              { key: 'ledger', label: '4. Master Ledger & PDF Export', icon: CreditCard }
            ].map(tab => {
              const IconT = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveSubTab(tab.key as Domain04SubView)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeSubTab === tab.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <IconT className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
      {/* SUB-FEATURE 2: PENDING OFFLINE APPROVALS QUEUE & MEMBERSHIP CONTROL       */}
      {/* ========================================================================= */}
      {(activeSubTab === 'cash_desk' || activeSubTab === 'management') && (
        <div className="space-y-5 animate-fade-in">
          {/* METHOD A: PENDING OFFLINE APPROVALS QUEUE */}
          <div className="p-5 vision-surface rounded-3xl border border-white/90 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shadow-2xs">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Pending Offline Approvals Queue ({pendingOfflineQueue.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Method A (Client → Admin Verification): Memberships remain locked until physical cash is verified and approved below.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-amber-50 text-amber-800 border border-amber-200 self-start sm:self-auto">
                {pendingOfflineQueue.length} Awaiting Cash Verification
              </span>
            </div>

            {pendingOfflineQueue.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-50/80 border border-slate-200/80 text-center space-y-1">
                <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-slate-800">All Offline Cash Requests Cleared!</p>
                <p className="text-[11px] text-slate-500">
                  When a member selects &quot;Pay via Cash / Offline Desk&quot; in the Client App, their request lands here immediately for one-click approval.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingOfflineQueue.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-200 text-amber-950">
                          PENDING VERIFICATION
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {req.referenceId || req.receiptNumber}
                        </span>
                        <span className="text-slate-500 font-medium">
                          • Requested on{' '}
                          {new Date(req.createdAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      <div className="text-sm font-black text-slate-900">
                        {req.clientName}{' '}
                        <span className="font-mono text-indigo-700 text-xs">(@{req.clientId})</span>
                        <span className="mx-2 text-slate-400">•</span>
                        <span className="text-indigo-900">{req.planName || req.itemTitle}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-700 tabular-nums">
                        <span>
                          Original Price:{' '}
                          <strong>₹{(req.originalPrice ?? req.amount).toLocaleString('en-IN')}</strong>
                        </span>
                        <span>
                          Applied Coupon:{' '}
                          <strong className="font-mono text-indigo-700">{req.couponCode || 'NONE'}</strong>
                        </span>
                        <span>
                          Discount:{' '}
                          <strong className="text-emerald-700">
                            -₹{(req.discountAmount || 0).toLocaleString('en-IN')}
                          </strong>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-800 font-black text-xs">
                          Final Cash to Collect: ₹{(req.finalAmount ?? req.amount).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={processingApprovalId === req.id}
                        onClick={() => openApproveOfflineModal(req)}
                        className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {processingApprovalId === req.id ? 'Activating...' : 'Approve & Verify Cash'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={processingApprovalId === req.id}
                        onClick={() => handleRejectOfflineRequest(req)}
                        className="px-3.5 py-2.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Memberships Revocation & Validity Control List */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Active Memberships &amp; Revocation Control (
                  {memberships.filter(m => m.status === 'active').length} Active)
                </h3>
                <p className="text-[11px] text-slate-600">
                  Inspect active member subscriptions, adjust validity dates, or revoke memberships
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search member, ID, plan..."
                  value={membershipSearch}
                  onChange={(e) => setMembershipSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200/90 rounded-xl text-xs text-slate-800 placeholder-slate-400 shadow-2xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="vision-surface rounded-2xl border border-white/90 overflow-hidden shadow-xs">
              {filteredMemberships.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No membership records found matching your search.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-slate-50/90 text-slate-700 uppercase text-[10px] font-bold tracking-wider">
                        <th className="py-2.5 px-3">Member</th>
                        <th className="py-2.5 px-3">Plan</th>
                        <th className="py-2.5 px-3">Validity Period</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Revocation / Validity Controls</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 bg-white/70">
                      {filteredMemberships.map((m) => {
                        const targetClient = clients.find(c => c.userId === m.clientId);
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 block">{m.clientName}</span>
                              <span className="text-[10px] text-indigo-700 font-mono font-bold">
                                @{m.clientId}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-slate-800">{m.planName}</span>
                              <span className="text-[10px] text-slate-500 block">
                                {m.durationMonths} Months
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 text-[11px]">
                              <span>{m.startDate}</span>
                              <span className="text-slate-400 mx-1">→</span>
                              <strong className="text-slate-900 font-mono font-bold">{m.endDate}</strong>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  m.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : m.status === 'pending'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : m.status === 'cancelled' || m.status === 'rejected'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {m.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {targetClient && onSelectClientForDetail && (
                                  <button
                                    type="button"
                                    onClick={() => onSelectClientForDetail(targetClient)}
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all shadow-2xs"
                                  >
                                    Adjust Validity
                                  </button>
                                )}

                                {m.status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => setCancellingMembership(m)}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                                  >
                                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Revoke / Cancel</span>
                                  </button>
                                )}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-FEATURE 4: MASTER PAYMENT LEDGER & BULK / SELECTED PDF EXPORT SUITE   */}
      {/* ========================================================================= */}
      {activeSubTab === 'ledger' && (
        <div className="space-y-4 animate-fade-in">
          {/* Financial Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
            <div className="p-4 vision-surface rounded-2xl border border-white/90 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Net Settled Revenue
              </span>
              <div className="text-2xl font-black text-slate-900">
                ₹{totalSettledRevenue.toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-emerald-700 font-semibold block">
                {settledLedger.length} Verified Transactions
              </span>
            </div>
            <div className="p-4 vision-surface rounded-2xl border border-white/90 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Online Gateways Revenue
              </span>
              <div className="text-2xl font-black text-indigo-700">
                ₹{onlineGatewayRevenue.toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-slate-600 font-medium block">
                {settledLedger.filter(e => e.paymentModeType === 'online').length} Online Settlements
              </span>
            </div>
            <div className="p-4 vision-surface rounded-2xl border border-white/90 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Offline Cash Approved
              </span>
              <div className="text-2xl font-black text-emerald-700">
                ₹{offlineApprovedRevenue.toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-slate-600 font-medium block">
                {settledLedger.filter(e => e.paymentModeType === 'cash').length} Cash Approvals
              </span>
            </div>
            <div className="p-4 vision-surface rounded-2xl border border-white/90 shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Pending Offline Queue
              </span>
              <div className="text-2xl font-black text-amber-600">
                {pendingOfflineQueue.length}
              </div>
              <span className="text-[11px] text-slate-600 font-medium block">
                {masterLedgerEntries.length} Total Ledger Records
              </span>
            </div>
          </div>

          {/* PDF Export Suite & Date Range Filter Bar */}
          <div className="p-4 vision-surface rounded-2xl border border-white/90 space-y-3 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-600" />
                  <span>Master Payment Ledger &amp; PDF Export Suite</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Download individual member tax invoices, selective multi-payment summary PDFs, or bulk date-filtered financial ledgers.
                </p>
              </div>

              {/* Bulk & Selective PDF Export Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedLedgerIds.length > 0 && (
                  <button
                    type="button"
                    disabled={isExportingPdf}
                    onClick={handleDownloadSelectedPdf}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isExportingPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download Selected PDF ({selectedLedgerIds.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={handleDownloadBulkPdf}
                  className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {isExportingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Export All Payments (PDF)</span>
                </button>
              </div>
            </div>

            {/* Date-Range Presets + Custom Date Picker + Mode & Status Filters */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-slate-500 mr-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-indigo-600" />
                  Date Range:
                </span>
                {[
                  { key: 'all', label: 'All Time' },
                  { key: 'today', label: 'Today' },
                  { key: 'week', label: 'This Week' },
                  { key: 'month', label: 'This Month' },
                  { key: 'custom', label: 'Custom Range' }
                ].map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDateRangePreset(d.key as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      dateRangePreset === d.key
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/90'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Payment Mode Filter */}
                <select
                  value={ledgerModeFilter}
                  onChange={(e) => setLedgerModeFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700"
                >
                  <option value="all">All Payment Modes</option>
                  <option value="online">Online Gateways Only</option>
                  <option value="cash">Offline Cash Only</option>
                </select>

                {/* Status Filter */}
                <select
                  value={ledgerStatusFilter}
                  onChange={(e) => setLedgerStatusFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-white border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">Success / Active</option>
                  <option value="pending">Pending Approval</option>
                  <option value="rejected">Rejected</option>
                </select>

                {/* Search Input */}
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                  <input
                    type="text"
                    placeholder="Search member, ID, ref, coupon..."
                    value={membershipSearch}
                    onChange={(e) => setMembershipSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200/90 rounded-xl text-xs text-slate-800 placeholder-slate-400 font-medium"
                  />
                </div>
              </div>
            </div>

            {dateRangePreset === 'custom' && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200/60 text-xs">
                <div className="flex items-center gap-2">
                  <label className="text-slate-600 font-bold">From:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-slate-600 font-bold">To:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Complete Master Transaction Ledger Table */}
          <div className="vision-surface rounded-2xl border border-white/90 overflow-hidden shadow-xs">
            {filteredLedgerEntries.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No payment ledger entries match the current filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/90 text-slate-700 uppercase text-[10px] font-bold tracking-wider">
                      <th className="py-2.5 px-3 w-8">
                        <button
                          type="button"
                          onClick={toggleSelectAllFiltered}
                          className="text-slate-600 hover:text-indigo-600 flex items-center"
                          title="Select / Deselect All"
                        >
                          {filteredLedgerEntries.length > 0 &&
                          filteredLedgerEntries.every(e => selectedLedgerIds.includes(e.id)) ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-2.5 px-3">Member Name &amp; ID</th>
                      <th className="py-2.5 px-3">Plan &amp; Validity Period</th>
                      <th className="py-2.5 px-3">Payment Mode</th>
                      <th className="py-2.5 px-3">Exact Timestamp</th>
                      <th className="py-2.5 px-3 text-right">Original</th>
                      <th className="py-2.5 px-3 text-center">Coupon</th>
                      <th className="py-2.5 px-3 text-right">Discount</th>
                      <th className="py-2.5 px-3 text-right">Final Paid</th>
                      <th className="py-2.5 px-3">Ref ID &amp; Status</th>
                      <th className="py-2.5 px-3 text-right">Invoice PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 bg-white/70">
                    {filteredLedgerEntries.map((item) => {
                      const isSelected = selectedLedgerIds.includes(item.id);
                      const statusLower = item.status.toLowerCase();

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => toggleSelectLedgerRow(item.id)}
                              className="text-slate-500 hover:text-indigo-600 flex items-center"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 block">{item.clientName}</span>
                            <span className="text-[10px] text-indigo-700 font-mono font-bold">
                              @{item.clientId}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-800 block">{item.planName}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {item.validityPeriod}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-block ${
                                item.paymentModeType === 'cash'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {item.paymentModeLabel}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-600 font-medium">
                            {item.timestamp}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600 font-medium">
                            ₹{item.originalPrice.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {item.couponCode && item.couponCode !== 'NONE' ? (
                              <span
                                className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded inline-block border ${
                                  item.discountPercent && item.discountPercent >= 100
                                    ? 'bg-purple-50 text-purple-800 border-purple-300'
                                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                }`}
                              >
                                {item.couponCode}
                              </span>
                            ) : (
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                NONE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                            {item.discountAmount > 0
                              ? `-₹${item.discountAmount.toLocaleString('en-IN')}`
                              : '₹0'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="font-black text-slate-900 block">
                              ₹{item.finalAmount.toLocaleString('en-IN')}
                            </span>
                            {item.finalAmount === 1 && item.originalPrice > 1 && (
                              <span className="text-[9px] font-black uppercase text-purple-700 bg-purple-50 border border-purple-200 px-1 py-0.2 rounded inline-block mt-0.5">
                                ₹1 Token Audit
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[10px] font-bold text-slate-700 block">
                              {item.referenceId}
                            </span>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span
                                className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-black uppercase border ${
                                  statusLower === 'success'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : statusLower === 'pending'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {item.status}
                              </span>
                              {statusLower === 'success' && (
                                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-sky-50 text-sky-800 border border-sky-200">
                                  Verification: {item.verificationStatus || 'Active'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDownloadSinglePdf(item)}
                              className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1 shadow-2xs"
                              title="Download Individual Member Invoice PDF"
                            >
                              <Download className="w-3 h-3 text-sky-600" />
                              <span>PDF</span>
                            </button>
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
      {/* SUB-FEATURE 1: MEMBERSHIP PRICING & DISCOUNTS                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'pricing' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Membership Plans &amp; Pricing Master</h3>
              <p className="text-xs text-slate-600">
                Directly edit plan prices, apply custom discounts, or revoke applied discounts with one click.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddingNewPlan(true)}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Plan</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {plans.map((plan) => {
              const effPrice = getEffectivePrice(plan);
              const isDiscounted = plan.isDiscountActive && (plan.discountPercent || plan.discountAmount);

              return (
                <div
                  key={plan.id}
                  className="p-4 vision-surface rounded-2xl border border-white/90 space-y-3 relative overflow-hidden shadow-xs"
                >
                  {plan.popular && (
                    <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                      Popular Plan
                    </span>
                  )}

                  <div>
                    <h4 className="text-sm font-black text-slate-900">{plan.name}</h4>
                    <span className="text-xs text-slate-500 font-medium">
                      Duration:{' '}
                      <strong className="text-slate-800">
                        {plan.durationMonths} {plan.durationMonths === 1 ? 'Month' : 'Months'}
                      </strong>
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 flex items-center justify-between shadow-2xs tabular-nums">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">
                        Standard Price
                      </span>
                      <div className="text-base font-black text-slate-900">
                        ₹{plan.price.toLocaleString('en-IN')}
                      </div>
                      {plan.originalPrice && plan.originalPrice > plan.price && (
                        <span className="text-[10px] text-slate-400 line-through">
                          MRP ₹{plan.originalPrice.toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      {isDiscounted ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                            <Percent className="w-3 h-3" />
                            {plan.discountTag ||
                              (plan.discountPercent
                                ? `${plan.discountPercent}% OFF`
                                : `₹${plan.discountAmount} OFF`)}
                          </span>
                          <div className="text-lg font-black text-emerald-700 mt-0.5">
                            ₹{effPrice.toLocaleString('en-IN')}
                          </div>
                          <span className="text-[10px] text-emerald-600 font-semibold block">
                            Discount Live in App
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 font-medium">No discount applied</span>
                      )}
                    </div>
                  </div>

                  {plan.benefits && plan.benefits.length > 0 && (
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      {plan.benefits.slice(0, 2).map((b, i) => (
                        <div key={i} className="flex items-center gap-1.5 truncate">
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{b}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditPlan(plan)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <Edit2 className="w-3 h-3 text-indigo-600" />
                        <span>Edit Price &amp; Plan</span>
                      </button>

                      {!isDiscounted ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDiscountingPlan(plan);
                            setDiscountType('percent');
                            setDiscountValue(15);
                            setDiscountTag('Special Offer');
                          }}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                        >
                          <Tag className="w-3 h-3 text-emerald-600" />
                          <span>Apply Custom Discount</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRevokeDiscount(plan)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-600" />
                          <span>Revoke Discount</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleTogglePlanArchive(plan)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 shadow-2xs ${
                          plan.active === false
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                        title={plan.active === false ? 'Restore Plan to Client Checkout' : 'Archive Plan from Client Checkout'}
                      >
                        <Archive className="w-3 h-3" />
                        <span>{plan.active === false ? 'Restore' : 'Archive'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPlanToDelete(plan)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition-all flex items-center gap-1 shadow-2xs"
                        title="Delete Plan Permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Delete Plan</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: EDIT PLAN PRICE & DETAILS                                        */}
      {/* ========================================================================= */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                <span>Edit Membership Plan Pricing</span>
              </h3>
              <button onClick={() => setEditingPlan(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlanEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Plan Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">Standard Price (₹) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editPrice}
                    onChange={(e) => setEditPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">MRP / Strikethrough (₹)</label>
                  <input
                    type="number"
                    value={editOriginalPrice}
                    onChange={(e) => setEditOriginalPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Duration (Months)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Benefits (One per line)</label>
                <textarea
                  rows={3}
                  value={editBenefits}
                  onChange={(e) => setEditBenefits(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800 resize-none"
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPopular}
                    onChange={(e) => setEditPopular(e.target.checked)}
                    className="rounded text-amber-500"
                  />
                  <span className="text-slate-800 font-semibold">Mark as Popular</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span className="text-slate-800 font-semibold">Active in App</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: APPLY CUSTOM DISCOUNT MODAL                                      */}
      {/* ========================================================================= */}
      {discountingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                <span>Apply Custom Discount to {discountingPlan.name}</span>
              </h3>
              <button onClick={() => setDiscountingPlan(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyCustomDiscount} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Discount Calculation Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`py-2 px-3 rounded-xl font-bold border ${
                      discountType === 'percent'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Percentage (%) Off
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('flat')}
                    className={`py-2 px-3 rounded-xl font-bold border ${
                      discountType === 'flat'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Flat Amount (₹) Off
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">
                  {discountType === 'percent' ? 'Discount Percentage (%)' : 'Flat Discount Amount (₹)'}
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={discountType === 'percent' ? 90 : discountingPlan.price - 100}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Campaign / Promo Tag</label>
                <input
                  type="text"
                  value={discountTag}
                  onChange={(e) => setDiscountTag(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setDiscountingPlan(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDiscount}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold"
                >
                  Apply Discount Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE NEW PLAN MODAL                                            */}
      {/* ========================================================================= */}
      {isAddingNewPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Create New Gym Membership Plan</span>
              </h3>
              <button onClick={() => setIsAddingNewPlan(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewPlan} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Plan Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Platinum 8 Months Plan"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">Duration (Months) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newPlanDuration}
                    onChange={(e) => setNewPlanDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">Base Price (₹) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newPlanPrice}
                    onChange={(e) => setNewPlanPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setIsAddingNewPlan(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-FEATURE 3: DISCOUNT RULES & PROMOS (COUPONS)                          */}
      {/* ========================================================================= */}
      {activeSubTab === 'coupons' && (
        <div className="space-y-5 animate-fade-in">
          <form
            onSubmit={handleCreateCoupon}
            className="p-5 vision-surface rounded-3xl border border-white/90 space-y-4 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center shadow-2xs">
                  <Percent className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-800">
                    Create New Promo Coupon &amp; Redemption Limit Rule
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Set coupon code, discount rate (up to 100%), total redemptions allowed, and validity days
                  </p>
                </div>
              </div>

              {/* Quick Discount Rate Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-slate-500">Quick Rate:</span>
                {[10, 20, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setNewCouponDiscount(pct)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black border transition-all ${
                      newCouponDiscount === pct
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-purple-50'
                    }`}
                  >
                    {pct === 100 ? '100% (₹1 Token)' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] text-slate-700 mb-1 font-bold">Coupon Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TORRENT20 or VIP100"
                  value={newCouponCode}
                  onChange={(e) => setNewCouponCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200/90 rounded-xl text-slate-800 font-mono uppercase font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-700 mb-1 font-bold">Campaign Title</label>
                <input
                  type="text"
                  placeholder="e.g. Summer Special / VIP 100%"
                  value={newCouponTitle}
                  onChange={(e) => setNewCouponTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-700 mb-1 font-bold">
                  Discount Percentage (1–100%) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={100}
                  value={newCouponDiscount}
                  onChange={(e) => setNewCouponDiscount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200/90 rounded-xl text-emerald-700 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-700 mb-1 font-bold">
                  Usage Limit (Total Redemptions) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={10000}
                  value={newCouponMaxLimit}
                  onChange={(e) => setNewCouponMaxLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200/90 rounded-xl text-purple-700 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-700 mb-1 font-bold">
                  Validity Duration (Days) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={365}
                  value={newCouponDays}
                  onChange={(e) => setNewCouponDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200/90 rounded-xl text-indigo-700 font-bold"
                />
              </div>
            </div>

            {newCouponDiscount >= 100 && (
              <div className="p-3 rounded-2xl bg-purple-50/90 border border-purple-200 text-[11px] text-purple-950 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  100% Discount Rule Active: Checkout will automatically override the payable amount to strictly ₹1 (One Rupee) as a mandatory token payment for financial audit and membership record verification.
                </span>
              </div>
            )}

            <div>
              <label className="block text-[11px] text-slate-700 mb-1 font-bold">
                Coupon Instructions / Description
              </label>
              <input
                type="text"
                placeholder="Applicable on all gym plans..."
                value={newCouponDesc}
                onChange={(e) => setNewCouponDesc(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200/90 rounded-xl text-slate-800"
              />
            </div>

            {/* Applicable Memberships Selector */}
            <div className="space-y-2 p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="block text-[11px] text-slate-800 font-bold">
                    Applicable Memberships *
                  </label>
                  <p className="text-[10px] text-slate-500">
                    Choose whether this coupon applies globally or strictly to specific plans.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setNewCouponApplicableTarget('all');
                      setNewCouponPlanIds([]);
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      newCouponApplicableTarget === 'all'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Membership Plans
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCouponApplicableTarget('specific');
                      if (newCouponPlanIds.length === 0 && plans.length > 0) {
                        setNewCouponPlanIds([plans[0].id]);
                      }
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      newCouponApplicableTarget === 'specific'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Specific Selected Plans Only
                  </button>
                </div>
              </div>

              {newCouponApplicableTarget === 'specific' && (
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-purple-800 uppercase tracking-wider">
                      Select Eligible Plans ({newCouponPlanIds.length} Selected):
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNewCouponPlanIds(plans.map(p => p.id))}
                        className="text-purple-600 hover:underline font-bold"
                      >
                        Select All
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setNewCouponPlanIds([])}
                        className="text-slate-500 hover:underline font-bold"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {plans.map(p => {
                      const isSelected = newCouponPlanIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-purple-50 border-purple-300 text-purple-950 font-bold'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewCouponPlanIds(prev => [...prev, p.id]);
                              } else {
                                setNewCouponPlanIds(prev => prev.filter(id => id !== p.id));
                              }
                            }}
                            className="rounded text-purple-600"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate">{p.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">₹{p.price.toLocaleString('en-IN')} • {p.durationMonths}m</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {newCouponPlanIds.length === 0 && (
                    <p className="text-[10px] text-rose-600 font-bold">
                      ⚠️ Please select at least one plan for specific targeting.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-slate-500 font-medium flex flex-wrap items-center gap-3">
                <span>
                  Auto expiry:{' '}
                  <strong className="text-slate-900 font-mono font-bold">
                    {new Date(Date.now() + newCouponDays * 86400000).toISOString().split('T')[0]}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Auto-locks after first{' '}
                  <strong className="text-purple-700 font-bold">{newCouponMaxLimit}</strong> completed payments
                </span>
              </div>

              <button
                type="submit"
                disabled={isCreatingCoupon || !newCouponCode.trim()}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{isCreatingCoupon ? 'Creating...' : 'Create & Publish Coupon'}</span>
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-black text-slate-900">
              Active &amp; Locked Discount Coupons ({offers.length})
            </h3>

            {offers.length === 0 ? (
              <div className="p-8 vision-surface rounded-2xl border border-white/90 text-center text-xs text-slate-500">
                No promo coupons created yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {offers.map((off) => {
                  const statusInfo = getCouponStatus(off);
                  const timesUsed = Number(off.timesUsed || 0);
                  const maxUsageLimit = Number(off.maxUsageLimit || 25);
                  const usagePct = Math.min(100, Math.round((timesUsed / Math.max(1, maxUsageLimit)) * 100));
                  const isLimitReached = timesUsed >= maxUsageLimit;

                  return (
                    <div
                      key={off.id}
                      className="p-4 vision-surface rounded-2xl border border-white/90 space-y-3 relative overflow-hidden shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="px-2.5 py-1 bg-slate-100/90 text-indigo-700 font-mono font-black text-sm rounded-lg border border-slate-200/90">
                              {off.code}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                off.discountPercent >= 100
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}
                            >
                              {off.discountPercent >= 100 ? '100% PROMO (₹1 TOKEN)' : `${off.discountPercent}% OFF`}
                            </span>
                            {off.applicableTarget === 'specific' && off.applicablePlanIds && off.applicablePlanIds.length > 0 ? (
                              <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                title={`Applicable to: ${off.applicablePlanIds.map(id => plans.find(p => p.id === id)?.name || id).join(', ')}`}
                              >
                                🎯 {off.applicablePlanIds.length} Targeted Plan{off.applicablePlanIds.length > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                🌐 All Membership Plans
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 mt-1.5">{off.title}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">{off.description}</p>
                          {off.applicableTarget === 'specific' && off.applicablePlanIds && off.applicablePlanIds.length > 0 && (
                            <p className="text-[10px] text-indigo-600 font-medium mt-1 truncate max-w-sm">
                              Valid for: {off.applicablePlanIds.map(id => plans.find(p => p.id === id)?.name || id).join(', ')}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0 space-y-1">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold block ${statusInfo.badgeClass}`}>
                            {statusInfo.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 block font-mono">
                            {statusInfo.daysText}
                          </span>
                        </div>
                      </div>

                      {/* Real-Time Usage Counter & Progress Bar */}
                      <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-1.5 tabular-nums">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-700">
                            Redemptions Used:{' '}
                            <strong className={isLimitReached ? 'text-rose-700' : 'text-indigo-700'}>
                              {timesUsed} / {maxUsageLimit}
                            </strong>
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">
                            {isLimitReached
                              ? 'Max Limit Reached — Locked'
                              : `${Math.max(0, maxUsageLimit - timesUsed)} Redemptions Left`}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isLimitReached
                                ? 'bg-rose-600'
                                : usagePct >= 80
                                ? 'bg-amber-500'
                                : 'bg-gradient-to-r from-indigo-500 to-purple-600'
                            }`}
                            style={{ width: `${usagePct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/80">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCoupon(off);
                            setEditCouponDiscount(off.discountPercent || 15);
                            setEditCouponMaxLimit(off.maxUsageLimit || 25);
                            setEditCouponDays(off.validityDays || 30);
                            setEditCouponDate(off.validUntil || '');
                            setEditCouponApplicableTarget(off.applicableTarget || 'all');
                            setEditCouponPlanIds(Array.isArray(off.applicablePlanIds) ? off.applicablePlanIds : []);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Edit Limit &amp; Validity</span>
                        </button>

                        {off.active && !isLimitReached ? (
                          <button
                            type="button"
                            onClick={() => handleDeactivateCoupon(off)}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Lock</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReactivateCoupon(off)}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Re-activate</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setCouponToDelete(off)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1"
                          title="Delete Promo Coupon"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ENHANCED APPROVE OFFLINE PAYMENT CONFIRMATION DIALOG               */}
      {/* ========================================================================= */}
      {approvingOfflineTx && (() => {
        const durationMonths = approvingOfflineTx.durationMonths || 1;
        const { expiryDate: previewExpiryDate, durationDays } = calculateExpiryFromPaymentDate(
          approvalDateInput,
          durationMonths
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-md vision-surface bg-white/95 border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
              <div className="flex items-start justify-between border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Method A • Admin Cash Verification
                    </span>
                    <h3 className="text-sm font-black text-slate-900 mt-0.5">
                      Approve Offline Payment
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setApprovingOfflineTx(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Member & Plan Request Summary */}
              <div className="p-3.5 bg-slate-50/95 rounded-2xl border border-slate-200/90 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Member Name:</span>
                  <strong className="text-slate-900 font-black">
                    {approvingOfflineTx.clientName} (@{approvingOfflineTx.clientId})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Plan Requested:</span>
                  <strong className="text-indigo-700 font-bold">
                    {approvingOfflineTx.planName || approvingOfflineTx.itemTitle} ({durationMonths}M)
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Base Price / Coupon:</span>
                  <span className="font-mono text-slate-700 font-bold">
                    ₹{(approvingOfflineTx.originalPrice ?? approvingOfflineTx.amount).toLocaleString('en-IN')}{' '}
                    • {approvingOfflineTx.couponCode || 'NONE'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/80">
                  <span className="text-slate-600 font-bold">Requested Payable Amount:</span>
                  <strong className="text-emerald-700 font-black">
                    ₹{(approvingOfflineTx.finalAmount ?? approvingOfflineTx.amount).toLocaleString('en-IN')}
                  </strong>
                </div>
              </div>

              <form onSubmit={handleConfirmApproveOffline} className="space-y-3.5 text-xs">
                {/* Mandatory Field 1: Amount Received (₹) */}
                <div>
                  <label className="block text-slate-800 mb-1 font-black">
                    1. Amount Received (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="1"
                    value={approvalAmountInput}
                    onChange={(e) => setApprovalAmountInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-emerald-300 focus:border-emerald-600 rounded-xl text-slate-900 font-black text-sm focus:outline-none tabular-nums"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Pre-filled with total payable amount. Editable if partial/adjusted cash was collected.
                  </span>
                </div>

                {/* Mandatory Field 2: Payment Received Date */}
                <div>
                  <label className="block text-slate-800 mb-1 font-black">
                    2. Payment Received Date (Official Start Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={approvalDateInput}
                    onChange={(e) => setApprovalDateInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-indigo-200 focus:border-indigo-600 rounded-xl text-slate-900 font-mono font-bold text-xs focus:outline-none"
                  />
                </div>

                {/* Automatic Activation & Expiry Preview */}
                <div className="p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200 space-y-1.5 text-[11px]">
                  <div className="font-black text-emerald-950 uppercase tracking-wider text-[10px]">
                    Automatic Membership Activation Preview
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-800">Official Start Date:</span>
                    <strong className="font-mono text-slate-900">{approvalDateInput}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-800">Calculated Expiry (+{durationDays} Days):</span>
                    <strong className="font-mono text-emerald-900 font-black">{previewExpiryDate}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-800">Approving Admin ID:</span>
                    <strong className="font-mono text-indigo-700">
                      @{currentUser?.uid || 'admin_master'}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/80">
                  <button
                    type="button"
                    disabled={processingApprovalId === approvingOfflineTx.id}
                    onClick={() => setApprovingOfflineTx(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={processingApprovalId === approvingOfflineTx.id}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-black flex items-center gap-1.5 shadow-md disabled:opacity-50"
                  >
                    {processingApprovalId === approvingOfflineTx.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Activating...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm &amp; Activate Membership</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL: MEMBERSHIP CANCELLATION CONFIRMATION                               */}
      {/* ========================================================================= */}
      {cancellingMembership && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h3 className="text-sm font-black text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Cancel Active Membership</span>
              </h3>
              <button onClick={() => setCancellingMembership(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-700 font-semibold">
                Are you sure you want to cancel this member&apos;s active membership?
              </p>

              <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1.5 text-slate-700">
                <div>
                  Member Name: <strong className="text-slate-900">{cancellingMembership.clientName}</strong>
                </div>
                <div>
                  Plan: <strong className="text-indigo-700 font-bold">{cancellingMembership.planName}</strong>
                </div>
                <div>
                  Validity:{' '}
                  <strong className="text-slate-800">
                    {cancellingMembership.startDate} → {cancellingMembership.endDate}
                  </strong>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => setCancellingMembership(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Keep Active
                </button>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => handleCancelMembership(cancellingMembership)}
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>{isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT COUPON LIMIT, DISCOUNT & DURATION                             */}
      {/* ========================================================================= */}
      {editingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md vision-surface border border-white/90 rounded-3xl p-6 shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Edit Coupon Rule ({editingCoupon.code})</span>
              </h3>
              <button onClick={() => setEditingCoupon(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCouponEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">
                    Discount Percentage (1–100%)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={editCouponDiscount}
                    onChange={(e) => setEditCouponDiscount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-emerald-700 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">
                    Usage Limit (Max Redemptions)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={10000}
                    value={editCouponMaxLimit}
                    onChange={(e) => setEditCouponMaxLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-purple-700 font-bold"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-center justify-between">
                <span>Current Redemptions Used:</span>
                <strong className="font-mono text-slate-900">
                  {editingCoupon.timesUsed || 0} / {editCouponMaxLimit}
                </strong>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">
                  Active Duration (Days from Today)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={365}
                  value={editCouponDays}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    setEditCouponDays(days);
                    const d = new Date();
                    d.setDate(d.getDate() + days);
                    setEditCouponDate(d.toISOString().split('T')[0]);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-indigo-700 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Specific Expiry Date</label>
                <input
                  type="date"
                  required
                  value={editCouponDate}
                  onChange={(e) => setEditCouponDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              {/* Applicable Memberships Selector in Edit Modal */}
              <div className="space-y-2 p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-800 font-bold">
                      Applicable Memberships *
                    </label>
                    <p className="text-[10px] text-slate-500">
                      Target this coupon to all plans or specific plans only.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setEditCouponApplicableTarget('all');
                        setEditCouponPlanIds([]);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        editCouponApplicableTarget === 'all'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All Plans
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditCouponApplicableTarget('specific');
                        if (editCouponPlanIds.length === 0 && plans.length > 0) {
                          setEditCouponPlanIds([plans[0].id]);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        editCouponApplicableTarget === 'specific'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Specific Only
                    </button>
                  </div>
                </div>

                {editCouponApplicableTarget === 'specific' && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-purple-800 uppercase tracking-wider">
                        Eligible Plans ({editCouponPlanIds.length} Selected):
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditCouponPlanIds(plans.map(p => p.id))}
                          className="text-purple-600 hover:underline font-bold"
                        >
                          Select All
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => setEditCouponPlanIds([])}
                          className="text-slate-500 hover:underline font-bold"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                      {plans.map(p => {
                        const isSelected = editCouponPlanIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className={`flex items-center gap-2 p-1.5 rounded-xl border text-[11px] cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-purple-50 border-purple-300 text-purple-950 font-bold'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditCouponPlanIds(prev => [...prev, p.id]);
                                } else {
                                  setEditCouponPlanIds(prev => prev.filter(id => id !== p.id));
                                }
                              }}
                              className="rounded text-purple-600"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="block truncate font-bold">{p.name}</span>
                              <span className="text-[9px] text-slate-500 font-mono">₹{p.price.toLocaleString('en-IN')}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setEditingCoupon(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCouponEdit}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold"
                >
                  {isSavingCouponEdit ? 'Saving...' : 'Save Coupon Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GLOBAL DELETE CONFIRMATION MODALS (PLANS & COUPONS)                       */}
      {/* ========================================================================= */}
      <GlobalDeleteConfirmModal
        isOpen={!!planToDelete}
        title="Delete Membership Plan?"
        itemName={
          planToDelete
            ? `${planToDelete.name} (${planToDelete.durationMonths}M — ₹${planToDelete.price.toLocaleString('en-IN')})`
            : ''
        }
        itemType="Membership Plan Tier"
        description="This will permanently delete this membership tier from the catalog and remove it from the Client Checkout view immediately."
        onConfirm={async () => {
          if (planToDelete) {
            await handleDeletePlan(planToDelete);
            setPlanToDelete(null);
          }
        }}
        onClose={() => setPlanToDelete(null)}
      />

      <GlobalDeleteConfirmModal
        isOpen={!!couponToDelete}
        title="Delete Promo Coupon?"
        itemName={
          couponToDelete
            ? `${couponToDelete.code} (${couponToDelete.discountPercent}% OFF)`
            : ''
        }
        itemType="Promo Coupon"
        description="This will permanently delete this promo coupon code so it can no longer be redeemed at checkout."
        onConfirm={async () => {
          if (couponToDelete) {
            await handleDeleteCoupon(couponToDelete);
            setCouponToDelete(null);
          }
        }}
        onClose={() => setCouponToDelete(null)}
      />
    </div>
  );
};
