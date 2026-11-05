import React, { useRef, useState } from 'react';
import { PaymentTransaction } from '../../types';
import { exportSinglePaymentInvoicePdf } from '../../services/pdfExportService';
import { usePdfDownload } from '../../context/PdfDownloadContext';
import { GymLogo } from './GymLogo';
import {
  CheckCircle2,
  Printer,
  X,
  Download,
  ShieldCheck,
  ArrowRight,
  Loader2
} from 'lucide-react';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: PaymentTransaction | null;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  transaction
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!isOpen || !transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(transaction.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const originalPrice = transaction.originalPrice ?? transaction.amount;
  const discountAmount = transaction.discountAmount ?? 0;
  const finalAmount = transaction.finalAmount ?? transaction.amount;
  const validityPeriod =
    transaction.startDate && transaction.endDate
      ? `${transaction.startDate} to ${transaction.endDate}`
      : 'Active Term';
  const gatewayLabel =
    transaction.paymentMode === 'cash' || transaction.gatewayProvider === 'offline_cash'
      ? 'Offline Cash Approved'
      : `Online via ${
          transaction.gatewayName ||
          (transaction.gatewayProvider === 'cashfree'
            ? 'Cashfree'
            : transaction.gatewayProvider === 'phonepe'
            ? 'PhonePe PG'
            : transaction.gatewayProvider === 'paypal'
            ? 'PayPal'
            : 'Razorpay')
        }`;

  const { requestPdfDownload } = usePdfDownload();

  const handleDownloadPdf = () => {
    requestPdfDownload({
      portalType: 'client',
      documentName: `Invoice #${transaction.receiptNumber} (${transaction.clientName})`,
      customTitle: 'Download Invoice',
      customMessage: 'Do you want to download the official payment receipt for this transaction?',
      onConfirm: async () => {
        setDownloadingPdf(true);
        try {
          await exportSinglePaymentInvoicePdf({
            id: transaction.id,
            receiptNumber: transaction.receiptNumber,
            referenceId: transaction.referenceId || transaction.razorpayPaymentId || transaction.id,
            clientId: transaction.clientId,
            clientName: transaction.clientName,
            clientPhone: transaction.clientPhone,
            planName: transaction.planName || transaction.itemTitle,
            validityPeriod,
            paymentModeLabel: gatewayLabel,
            paymentModeType: transaction.paymentMode === 'cash' ? 'cash' : 'online',
            timestamp: formattedDate,
            rawDate: transaction.createdAt,
            originalPrice,
            couponCode: transaction.couponCode || 'NONE',
            discountAmount,
            finalAmount,
            status: transaction.status.toUpperCase()
          });
        } finally {
          setDownloadingPdf(false);
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="vision-surface border border-white/90 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/90">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900">Official Tax Receipt</h3>
              <p className="text-[11px] text-slate-500 font-mono font-bold">{transaction.receiptNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              title="Print Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Receipt Printable Canvas */}
        <div className="p-6 overflow-y-auto space-y-5 bg-white/70" ref={receiptRef}>
          {/* Gym Header */}
          <div className="text-center pb-4 border-b border-dashed border-slate-200">
            <div className="flex justify-center mb-2">
              <GymLogo size="md" />
            </div>
            <h2 className="text-base font-black tracking-wider text-slate-900">TORRENT FITNESS</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600">BE MORE DO MORE</p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">Official Membership &amp; Billing Receipt</p>
            <p className="text-[10px] text-slate-400 mt-1 max-w-sm mx-auto leading-tight">
              Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001
            </p>
          </div>

          {/* Transaction Status Banner */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-2xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold uppercase tracking-wider">
                {transaction.status === 'pending' ? 'Pending Desk Verification' : 'Payment Verified & Active'}
              </span>
            </div>
            <span className="text-xs font-black tabular-nums">₹{finalAmount.toLocaleString('en-IN')}</span>
          </div>

          {/* Details Grid */}
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Receipt No:</span>
              <span className="font-mono font-bold text-indigo-700">{transaction.receiptNumber}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Exact Timestamp:</span>
              <span className="text-slate-800 font-semibold">{formattedDate}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Member Name & ID:</span>
              <span className="font-bold text-slate-900">
                {transaction.clientName} <span className="font-mono text-indigo-700">(@{transaction.clientId})</span>
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Plan Chosen:</span>
              <span className="font-bold text-slate-900">{transaction.planName || transaction.itemTitle}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Validity Period:</span>
              <span className="font-semibold text-slate-800">{validityPeriod}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Payment Mode:</span>
              <span className="font-bold text-sky-700">{gatewayLabel}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Reference / TXN ID:</span>
              <span className="font-mono text-[11px] text-slate-800 font-bold">
                {transaction.referenceId || transaction.razorpayPaymentId || transaction.id}
              </span>
            </div>
          </div>

          {/* Amount Breakdown */}
          <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2 text-xs shadow-2xs tabular-nums">
            <div className="flex items-center justify-between gap-3 text-slate-600 font-medium">
              <span className="flex-1 text-left">Original Plan Price:</span>
              <span className="shrink-0 text-right font-bold text-slate-900">₹{originalPrice.toLocaleString('en-IN')}</span>
            </div>
            {transaction.couponCode && (
              <div className="flex items-center justify-between gap-3 text-slate-600 font-medium">
                <span className="flex-1 text-left">Coupon Code:</span>
                <span className="shrink-0 text-right font-mono font-bold text-indigo-700">{transaction.couponCode}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 text-emerald-700 font-bold leading-snug">
              <span className="flex-1 text-left min-w-0 truncate">
                {transaction.couponCode ? `Coupon Discount (${transaction.couponCode})` : 'Discount Applied:'}
              </span>
              <span className="shrink-0 text-right font-mono font-black whitespace-nowrap min-w-[80px]">
                {discountAmount > 0 ? `- ₹${discountAmount.toLocaleString('en-IN')}` : '₹0'}
              </span>
            </div>
            <div className="pt-2.5 mt-2 border-t border-slate-200/80 flex items-center justify-between gap-3 font-bold text-slate-900 text-sm">
              <span className="flex-1 text-left">Total Amount Paid:</span>
              <span className="shrink-0 text-right text-emerald-700 font-black text-base font-mono">
                ₹{finalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-200/80 bg-slate-50/90 flex items-center justify-between gap-3">
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex-1 py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs"
          >
            {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-sky-600" />}
            <span>Download Invoice PDF</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>Done</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
