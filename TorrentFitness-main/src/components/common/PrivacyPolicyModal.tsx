import React from 'react';
import { X, ShieldCheck, Lock, FileText, CheckCircle2, ChevronRight } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-xl max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col border border-slate-100 overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">Privacy Policy</h3>
              <p className="text-[11px] text-slate-300 font-medium">Torrent Fitness Club • Last Updated Nov 2026</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-700 text-xs leading-relaxed">
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-start gap-3 text-indigo-900">
            <Lock className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="font-semibold text-[11px]">
              At Torrent Fitness Club, your privacy and data security are our top priority. We do not sell, rent, or trade your personal or fitness information to any third parties.
            </p>
          </div>

          <section className="space-y-1.5">
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full" />
              1. Information We Collect
            </h4>
            <p>To provide safe and personalized fitness services, we collect:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li><strong>Member Account Data:</strong> Name, phone number, email address, date of birth, gender, and profile photo.</li>
              <li><strong>Fitness & Health Details:</strong> Height, weight, fitness goals, and trainer assignments for tailored workout routines.</li>
              <li><strong>Gym Check-In & Attendance:</strong> Timestamps of entry via reception desk QR scans and active workout durations (capped at standard 2-hour workout windows).</li>
              <li><strong>Transaction Records:</strong> Online membership invoice IDs, purchase date, and amount paid. We <em>never</em> store raw card numbers, CVVs, or UPI PINs.</li>
            </ul>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full" />
              2. How We Use Your Information
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>To manage gym access and verify valid active memberships at the entrance turnstile.</li>
              <li>To prevent duplicate or overlapping check-ins during your active 2-hour workout session.</li>
              <li>To issue official GST-compliant tax invoices and renewal alerts for your membership plans.</li>
              <li>To facilitate personal trainer scheduling and progress tracking.</li>
            </ul>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full" />
              3. Data Security & Storage
            </h4>
            <p>
              Your data is stored securely using cloud infrastructure backed by Google Firebase with strict role-based access rules. All data in transit is encrypted using modern TLS/HTTPS encryption. Session persistence on your personal device keeps your app safely logged in without exposing credentials.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full" />
              4. Third-Party Payment Partners
            </h4>
            <p>
              Online dues are processed through PCI-DSS Level 1 certified gateways including Razorpay and PayU. Your financial information is handled directly on their encrypted payment rails in accordance with Reserve Bank of India (RBI) guidelines.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full" />
              5. Your Rights & Account Deletion
            </h4>
            <p>
              You may view your full attendance logs and membership history at any time. You can update your profile information or request account deactivation/deletion directly from your profile settings or by speaking with the gym desk management.
            </p>
          </section>

          <section className="space-y-1.5">
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full" />
              6. Contact Us
            </h4>
            <p className="text-slate-600">
              Torrent Fitness Club<br />
              Punjab, India • Reception Desk Support<br />
              For queries or data requests, contact our reception team or email us at <strong>support@torrentfitness.in</strong>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">© 2026 Torrent Fitness Club. All rights reserved.</span>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
