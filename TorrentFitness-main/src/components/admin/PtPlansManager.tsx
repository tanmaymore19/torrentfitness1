import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { PtPlan } from '../../types';
import { GlobalDeleteConfirmModal } from '../common/GlobalDeleteConfirmModal';
import {
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  Award,
  Sparkles,
  Clock,
  Calendar,
  Check,
  X,
  UserCheck,
  Percent,
  Banknote,
  Eye,
  EyeOff
} from 'lucide-react';

export const INITIAL_PT_PLANS: PtPlan[] = [
  {
    id: 'pt_1m',
    name: '1 Month 1-on-1 PT',
    durationMonths: 1,
    sessions: 12,
    mrpPrice: 4000,
    offerPrice: 3500,
    savings: 'Save ₹500 (12% OFF)',
    badge: '12 SESSIONS • STARTER',
    benefits: [
      '12 Dedicated 1-on-1 Personal Training sessions',
      'Personalized biometric posture analysis',
      'Weekly body weight and muscle progress tracking',
      'Gym floor direct coach guidance'
    ],
    active: true,
    popular: false
  },
  {
    id: 'pt_3m',
    name: '3 Months Transformation PT',
    durationMonths: 3,
    sessions: 36,
    mrpPrice: 10500,
    offerPrice: 9500,
    savings: 'Save ₹1,000 (10% OFF)',
    badge: '36 SESSIONS • BESTSELLER',
    benefits: [
      '36 Private 1-on-1 training sessions',
      'Complete tailored nutritional meal & macro breakdown',
      'Continuous form correction and progressive overload plan',
      'Direct messaging & check-ins with gym management',
      'Guaranteed body recomposition milestone review'
    ],
    active: true,
    popular: true
  },
  {
    id: 'pt_6m',
    name: '6 Months Elite Athlete PT',
    durationMonths: 6,
    sessions: 72,
    mrpPrice: 21000,
    offerPrice: 18000,
    savings: 'Save ₹3,000 (15% OFF)',
    badge: '72 SESSIONS • MAXIMUM VALUE',
    benefits: [
      '72 Full Private coaching sessions',
      'Elite body conditioning & athletic performance programming',
      'Advanced macro & supplement protocol design',
      'Priority PT slot reservation at any gym hour',
      'Complimentary Torrent Fitness shaker & gym bag'
    ],
    active: true,
    popular: false
  }
];

export const PtPlansManager: React.FC = () => {
  const [plans, setPlans] = useState<PtPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PtPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<PtPlan | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [sessions, setSessions] = useState<number>(12);
  const [mrpPrice, setMrpPrice] = useState<number>(4000);
  const [offerPrice, setOfferPrice] = useState<number>(3500);
  const [badge, setBadge] = useState('');
  const [benefitsInput, setBenefitsInput] = useState('');
  const [active, setActive] = useState(true);
  const [popular, setPopular] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 4000);
  };

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'ptPlans'),
      async (snapshot) => {
        if (snapshot.empty) {
          // Seed defaults into Firestore
          for (const p of INITIAL_PT_PLANS) {
            await setDoc(doc(db, 'ptPlans', p.id), p);
          }
          setPlans(INITIAL_PT_PLANS);
        } else {
          const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PtPlan));
          list.sort((a, b) => a.durationMonths - b.durationMonths);
          setPlans(list);
        }
        setIsLoading(false);
      },
      (err) => {
        console.warn('ptPlans listener fallback:', err);
        setPlans(INITIAL_PT_PLANS);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const resetForm = () => {
    setName('');
    setDurationMonths(1);
    setSessions(12);
    setMrpPrice(4000);
    setOfferPrice(3500);
    setBadge('');
    setBenefitsInput('');
    setActive(true);
    setPopular(false);
    setEditingPlan(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: PtPlan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setDurationMonths(plan.durationMonths);
    setSessions(plan.sessions);
    setMrpPrice(plan.mrpPrice);
    setOfferPrice(plan.offerPrice);
    setBadge(plan.badge || '');
    setBenefitsInput(plan.benefits ? plan.benefits.join('\n') : '');
    setActive(plan.active !== false);
    setPopular(!!plan.popular);
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || sessions <= 0 || offerPrice <= 0) return;

    setIsSubmitting(true);
    try {
      const planId = editingPlan ? editingPlan.id : `pt_${Date.now()}`;
      const parsedBenefits = benefitsInput
        .split('\n')
        .map((b) => b.trim())
        .filter(Boolean);

      const savingsCalculated =
        mrpPrice > offerPrice
          ? `Save ₹${(mrpPrice - offerPrice).toLocaleString('en-IN')} (${Math.round(
              ((mrpPrice - offerPrice) / mrpPrice) * 100
            )}% OFF)`
          : undefined;

      const payload: PtPlan = {
        id: planId,
        name: name.trim(),
        durationMonths: Number(durationMonths),
        sessions: Number(sessions),
        mrpPrice: Number(mrpPrice),
        offerPrice: Number(offerPrice),
        savings: savingsCalculated,
        badge: badge.trim() || `${sessions} SESSIONS`,
        benefits: parsedBenefits.length > 0 ? parsedBenefits : [
          `${sessions} Dedicated 1-on-1 sessions`,
          'Custom diet & nutrition guidelines',
          'Weekly fitness tracking'
        ],
        active,
        popular,
        updatedAt: new Date().toISOString()
      };

      if (!editingPlan) {
        payload.createdAt = new Date().toISOString();
      }

      await setDoc(doc(db, 'ptPlans', planId), payload, { merge: true });
      setIsModalOpen(false);
      resetForm();
      showNotice(editingPlan ? `PT Plan "${name}" updated!` : `New PT Plan "${name}" created!`);
    } catch (err: any) {
      console.error('Failed to save PT plan:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (plan: PtPlan) => {
    try {
      const newStatus = plan.active === false ? true : false;
      await updateDoc(doc(db, 'ptPlans', plan.id), { active: newStatus });
      showNotice(`PT Plan "${plan.name}" is now ${newStatus ? 'ACTIVE' : 'INACTIVE'}.`);
    } catch (err: any) {
      console.error('Failed to toggle PT plan:', err);
    }
  };

  const confirmDeletePlan = async () => {
    if (!planToDelete) return;
    try {
      await deleteDoc(doc(db, 'ptPlans', planToDelete.id));
      showNotice(`PT Plan "${planToDelete.name}" deleted.`);
      setPlanToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete PT plan:', err);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {statusNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xs">
          <span>{statusNotice}</span>
          <button onClick={() => setStatusNotice(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 bg-white/90 rounded-3xl border border-white/90 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
            <UserCheck className="w-6 h-6" strokeWidth={1.9} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Personal Training (PT) Plans &amp; Pricing
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                {plans.filter((p) => p.active !== false).length} Active Tiers
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Admin-defined packages that dynamically populate the Client PT checkout screen
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-500 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Create New PT Package</span>
        </button>
      </div>

      {/* Grid of PT Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => {
          const discountPercent =
            p.mrpPrice > p.offerPrice
              ? Math.round(((p.mrpPrice - p.offerPrice) / p.mrpPrice) * 100)
              : 0;

          return (
            <div
              key={p.id}
              className={`rounded-3xl p-5 border shadow-sm transition-all flex flex-col justify-between space-y-4 ${
                p.active !== false
                  ? p.popular
                    ? 'bg-gradient-to-b from-amber-50/50 via-white to-white border-amber-300 ring-2 ring-amber-400/20'
                    : 'bg-white/95 border-slate-200/90 hover:border-amber-300'
                  : 'bg-slate-50/70 border-slate-200 opacity-60'
              }`}
            >
              <div className="space-y-3">
                {/* Top Badges */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-900 text-white">
                    {p.badge || `${p.sessions} SESSIONS`}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {p.popular && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-2xs">
                        POPULAR
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        p.active !== false
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-300'
                      }`}
                    >
                      {p.active !== false ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                </div>

                {/* Title & Key Stats */}
                <div>
                  <h4 className="text-base font-black text-slate-900 tracking-tight">{p.name}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-bold mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      {p.durationMonths} {p.durationMonths === 1 ? 'Month' : 'Months'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-amber-700">
                      <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                      {p.sessions} Sessions (₹{Math.round(p.offerPrice / p.sessions)}/session)
                    </span>
                  </div>
                </div>

                {/* Pricing Box */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">
                      ₹{p.offerPrice.toLocaleString('en-IN')}
                    </span>
                    {p.mrpPrice > p.offerPrice && (
                      <span className="text-xs text-slate-400 line-through font-bold">
                        ₹{p.mrpPrice.toLocaleString('en-IN')}
                      </span>
                    )}
                    {discountPercent > 0 && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                        {discountPercent}% OFF
                      </span>
                    )}
                  </div>
                  {p.savings && (
                    <span className="text-[10px] text-emerald-700 font-bold block">{p.savings}</span>
                  )}
                </div>

                {/* Benefits List */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Included Benefits:
                  </span>
                  {(p.benefits || []).slice(0, 4).map((b, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-slate-700">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="leading-snug">{b}</span>
                    </div>
                  ))}
                  {(p.benefits || []).length > 4 && (
                    <span className="text-[10px] text-slate-400 italic block pl-5">
                      +{(p.benefits || []).length - 4} more benefits
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleActive(p)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1 ${
                    p.active !== false
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}
                  title={p.active !== false ? 'Hide from client checkout' : 'Activate in client checkout'}
                >
                  {p.active !== false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{p.active !== false ? 'Deactivate' : 'Activate'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(p)}
                    className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors shadow-2xs"
                    title="Edit PT Package Details & Pricing"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlanToDelete(p)}
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors shadow-2xs"
                    title="Permanently Delete PT Plan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit PT Plan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg vision-surface rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/90 text-slate-800 max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-black text-slate-900">
                  {editingPlan ? 'Edit Personal Training Plan' : 'Create New PT Package'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-3.5">
              {/* Plan Title */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">PT Plan Title *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 1 Month 1-on-1 Transformation"
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 font-bold border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                />
              </div>

              {/* Duration and Sessions */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Duration (Months) *</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    required
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 font-bold border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Total Sessions *</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={sessions}
                    onChange={(e) => setSessions(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 font-bold border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* Pricing (MRP and Special Offer) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">MRP Base Price (₹)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={mrpPrice}
                    onChange={(e) => setMrpPrice(Number(e.target.value))}
                    placeholder="e.g. 4000"
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 font-bold border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Special Offer Price (₹) *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={offerPrice}
                    onChange={(e) => setOfferPrice(Number(e.target.value))}
                    placeholder="e.g. 3500"
                    className="w-full px-3 py-2 text-xs bg-white rounded-xl text-emerald-700 font-black border border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* Badge label */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Badge Label (Optional)</label>
                <input
                  type="text"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  placeholder="e.g. 12 SESSIONS • STARTER"
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold uppercase shadow-2xs"
                />
              </div>

              {/* Benefits checklist */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Included Benefits (One per line)
                </label>
                <textarea
                  rows={4}
                  value={benefitsInput}
                  onChange={(e) => setBenefitsInput(e.target.value)}
                  placeholder="12 Dedicated 1-on-1 sessions&#10;Complete nutritional macro plan&#10;Weekly body composition review"
                  className="w-full px-3 py-2 text-xs bg-white rounded-xl text-slate-900 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium shadow-2xs leading-relaxed"
                />
              </div>

              {/* Toggles: Active and Popular */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                  <span>Active &amp; Visible in Client PT Screen</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={popular}
                    onChange={(e) => setPopular(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                  <span>Mark as "Most Popular"</span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-500 text-white text-xs font-black rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingPlan ? 'Save Changes' : 'Publish PT Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteConfirmModal
        isOpen={!!planToDelete}
        title="Delete PT Plan &amp; Pricing Tier"
        itemName={planToDelete ? `${planToDelete.name} (₹${planToDelete.offerPrice})` : ''}
        itemType="Personal Training Plan"
        description="Are you sure you want to delete this PT plan? Clients will no longer be able to select or purchase this package."
        warningNote="Existing clients assigned to this plan will remain unaffected in the database."
        confirmLabel="Yes, Delete PT Plan"
        onClose={() => setPlanToDelete(null)}
        onConfirm={confirmDeletePlan}
      />
    </div>
  );
};

export default PtPlansManager;
