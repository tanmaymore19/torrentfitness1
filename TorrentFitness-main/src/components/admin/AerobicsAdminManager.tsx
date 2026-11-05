import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  AerobicsBatch,
  AerobicsSubscription,
  AerobicsCategory,
  AerobicsIntensity,
  ClientProfile,
  TrainerProfile
} from '../../types';
import { INITIAL_AEROBICS_BATCHES, INITIAL_TRAINERS } from '../../services/db';
import { GlobalDeleteConfirmModal } from '../common/GlobalDeleteConfirmModal';
import {
  Music,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  Sparkles,
  CheckCircle,
  X,
  Save,
  Users,
  UserCheck,
  CreditCard,
  QrCode,
  UserPlus,
  UserMinus
} from 'lucide-react';

const CATEGORIES: AerobicsCategory[] = [
  'Zumba / Dance Cardio',
  'Step Aerobics',
  'HIIT Aerobics',
  'Low-Impact Tone'
];

const INTENSITIES: AerobicsIntensity[] = ['Low', 'Moderate', 'High', 'Peak Burn'];

export const AerobicsAdminManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'batches' | 'enrollments' | 'ledger'>('batches');
  const [batches, setBatches] = useState<AerobicsBatch[]>(INITIAL_AEROBICS_BATCHES);
  const [subscriptions, setSubscriptions] = useState<AerobicsSubscription[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [trainers, setTrainers] = useState<TrainerProfile[]>(INITIAL_TRAINERS);
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{
    title: string;
    itemName: string;
    itemType: string;
    description: string;
    warningNote?: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Batch Create / Edit Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [batchTitle, setBatchTitle] = useState<string>('');
  const [batchCategory, setBatchCategory] = useState<AerobicsCategory>('Zumba / Dance Cardio');
  const [batchInstructorId, setBatchInstructorId] = useState<string>('trainer_pooja_sharma');
  const [batchInstructorName, setBatchInstructorName] = useState<string>('Pooja Sharma');
  const [batchDays, setBatchDays] = useState<string>('Mon - Sat');
  const [batchTime, setBatchTime] = useState<string>('Morning 07:00 AM - 08:00 AM');
  const [batchStudio, setBatchStudio] = useState<string>('Rose Aurora Studio A (Women Only)');
  const [batchIntensity, setBatchIntensity] = useState<AerobicsIntensity>('High');
  const [batchCapacity, setBatchCapacity] = useState<number>(25);
  const [batchMonthlyPrice, setBatchMonthlyPrice] = useState<number>(1499);
  const [batchQuarterlyPrice, setBatchQuarterlyPrice] = useState<number>(3999);
  const [batchActive, setBatchActive] = useState<boolean>(true);

  // Manual Female Client Enrollment Form State
  const [selectedFemaleClientId, setSelectedFemaleClientId] = useState<string>('');
  const [selectedEnrollBatchId, setSelectedEnrollBatchId] = useState<string>('');
  const [selectedEnrollDuration, setSelectedEnrollDuration] = useState<'monthly' | 'quarterly'>('monthly');

  useEffect(() => {
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
          if (!selectedEnrollBatchId && list.length > 0) {
            setSelectedEnrollBatchId(list[0].id);
          }
        }
      },
      (err) => console.warn('Aerobics batches listener note:', err)
    );

    const unsubSubs = onSnapshot(
      collection(db, 'aerobicsSubscriptions'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AerobicsSubscription));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSubscriptions(list);
      },
      (err) => console.warn('Aerobics subscriptions listener note:', err)
    );

    const unsubClients = onSnapshot(
      collection(db, 'clientProfiles'),
      (snap) => {
        const list = snap.docs.map((d) => ({ userId: d.id, ...d.data() } as ClientProfile));
        setClients(list);
      },
      (err) => console.warn('Aerobics clients listener note:', err)
    );

    const unsubTrainers = onSnapshot(
      collection(db, 'trainerProfiles'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ trainerId: d.id, ...d.data() } as TrainerProfile));
          setTrainers(list);
        }
      },
      (err) => console.warn('Aerobics trainers listener note:', err)
    );

    return () => {
      unsubBatches();
      unsubSubs();
      unsubClients();
      unsubTrainers();
    };
  }, []);

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(''), 4500);
  };

  // Filter strictly Female Clients and Female Trainers
  const femaleClients = clients.filter(
    (c) => (c.gender || '').trim().toLowerCase() === 'female' && !c.isSelfDeleted
  );
  const femaleTrainers = trainers.filter(
    (t) =>
      (t.gender || '').trim().toLowerCase() === 'female' ||
      t.trainerId.toLowerCase().includes('pooja')
  );

  const openCreateBatchModal = () => {
    setEditingBatchId(null);
    setBatchTitle('');
    setBatchCategory('Zumba / Dance Cardio');
    const defaultFemTrainer = femaleTrainers[0];
    setBatchInstructorId(defaultFemTrainer?.trainerId || 'trainer_pooja_sharma');
    setBatchInstructorName(defaultFemTrainer?.displayName || 'Pooja Sharma');
    setBatchDays('Mon - Sat');
    setBatchTime('Morning 07:00 AM - 08:00 AM');
    setBatchStudio('Rose Aurora Studio A (Women Only)');
    setBatchIntensity('High');
    setBatchCapacity(25);
    setBatchMonthlyPrice(1499);
    setBatchQuarterlyPrice(3999);
    setBatchActive(true);
    setIsBatchModalOpen(true);
  };

  const openEditBatchModal = (batch: AerobicsBatch) => {
    setEditingBatchId(batch.id);
    setBatchTitle(batch.title);
    setBatchCategory(batch.category);
    setBatchInstructorId(batch.instructorId || 'trainer_pooja_sharma');
    setBatchInstructorName(batch.instructorName || 'Pooja Sharma');
    setBatchDays(batch.daysOfWeek);
    setBatchTime(batch.timeSlot);
    setBatchStudio(batch.studioZone);
    setBatchIntensity(batch.intensity);
    setBatchCapacity(batch.maxCapacity);
    setBatchMonthlyPrice(batch.monthlyPrice || 1499);
    setBatchQuarterlyPrice(batch.quarterlyPrice || 3999);
    setBatchActive(batch.active !== false);
    setIsBatchModalOpen(true);
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchTitle.trim()) return;

    const id = editingBatchId || `batch_${Date.now()}`;
    const existingBatch = batches.find((b) => b.id === id);

    const payload: AerobicsBatch = {
      id,
      title: batchTitle.trim(),
      category: batchCategory,
      instructorId: batchInstructorId,
      instructorName: batchInstructorName.trim() || 'Pooja Sharma',
      daysOfWeek: batchDays.trim() || 'Mon - Sat',
      timeSlot: batchTime.trim() || 'Morning 07:00 AM - 08:00 AM',
      studioZone: batchStudio.trim() || 'Rose Aurora Studio A (Women Only)',
      intensity: batchIntensity,
      maxCapacity: Math.max(1, Number(batchCapacity) || 25),
      monthlyPrice: Math.max(0, Number(batchMonthlyPrice) || 1499),
      quarterlyPrice: Math.max(0, Number(batchQuarterlyPrice) || 3999),
      enrolledClientIds: existingBatch?.enrolledClientIds || [],
      active: batchActive,
      createdAt: existingBatch?.createdAt || new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'aerobicsBatches', id), payload, { merge: true });
      setIsBatchModalOpen(false);
      showToast(
        editingBatchId
          ? `Updated Aerobics batch "${payload.title}"!`
          : `Created new Aerobics batch "${payload.title}"!`
      );
    } catch (err: any) {
      showToast('Error saving batch: ' + err.message);
    }
  };

  const handleToggleBatchActive = async (batch: AerobicsBatch) => {
    try {
      await updateDoc(doc(db, 'aerobicsBatches', batch.id), {
        active: !batch.active
      });
      showToast(`Batch "${batch.title}" set to ${!batch.active ? 'ACTIVE' : 'HIDDEN'}.`);
    } catch (err: any) {
      showToast('Failed to update batch status: ' + err.message);
    }
  };

  const handleDeleteBatch = (batch: AerobicsBatch) => {
    setPendingDeleteAction({
      title: 'Delete Aerobics Batch',
      itemName: `${batch.title} (${batch.timeSlot})`,
      itemType: 'Aerobics Studio Batch',
      description: 'Are you sure you want to permanently delete this Aerobics studio batch?',
      warningNote: 'This batch will be removed from the Female Client Portal and Trainer schedule immediately.',
      confirmLabel: 'Yes, Delete Batch',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'aerobicsBatches', batch.id));
        setBatches((prev) => prev.filter((b) => b.id !== batch.id));
        showToast(`Deleted Aerobics batch "${batch.title}".`);
      }
    });
  };

  // Manual Admin Enrollment of a Female Client into an Aerobics Batch
  const handleManualEnrollFemaleClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFemaleClientId || !selectedEnrollBatchId) return;

    const client = femaleClients.find((c) => c.userId === selectedFemaleClientId);
    const batch = batches.find((b) => b.id === selectedEnrollBatchId);
    if (!client || !batch) return;

    const now = new Date();
    const startDateStr = now.toISOString().split('T')[0];
    const months = selectedEnrollDuration === 'quarterly' ? 3 : 1;
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + months);
    const endDateStr = endDate.toISOString().split('T')[0];
    const amountPaid =
      selectedEnrollDuration === 'quarterly'
        ? batch.quarterlyPrice || 3999
        : batch.monthlyPrice || 1499;

    try {
      // 1. Add client to batch.enrolledClientIds
      const enrolled = Array.isArray(batch.enrolledClientIds) ? batch.enrolledClientIds : [];
      const updatedEnrolled = enrolled.includes(client.userId)
        ? enrolled
        : [...enrolled, client.userId];
      await setDoc(
        doc(db, 'aerobicsBatches', batch.id),
        { enrolledClientIds: updatedEnrolled },
        { merge: true }
      );

      // 2. Update ClientProfile with active Aerobics subscription
      await setDoc(
        doc(db, 'clientProfiles', client.userId),
        {
          aerobicsStatus: 'active',
          aerobicsBatchId: batch.id,
          aerobicsBatchName: batch.title,
          aerobicsSlotTiming: batch.timeSlot,
          aerobicsPlanType: selectedEnrollDuration,
          aerobicsStartDate: startDateStr,
          aerobicsEndDate: endDateStr
        },
        { merge: true }
      );

      // 3. Create AerobicsSubscription record
      const subId = `aerosub_${client.userId}_${Date.now()}`;
      const newSub: AerobicsSubscription = {
        id: subId,
        clientId: client.userId,
        clientName: client.displayName,
        clientPhone: client.phone,
        batchId: batch.id,
        batchName: batch.title,
        slotTiming: batch.timeSlot,
        instructorName: batch.instructorName,
        planDuration: selectedEnrollDuration,
        durationMonths: months,
        amountPaid,
        paymentMode: 'cash',
        status: 'active',
        startDate: startDateStr,
        endDate: endDateStr,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'aerobicsSubscriptions', subId), newSub);

      setSelectedFemaleClientId('');
      showToast(
        `Enrolled ${client.displayName} in "${batch.title}" (${selectedEnrollDuration.toUpperCase()}). Reception QR will now display the AEROBICS badge!`
      );
    } catch (err: any) {
      showToast('Failed to enroll client: ' + err.message);
    }
  };

  // Remove / Revoke a Female Client's Aerobics Enrollment
  const handleRevokeClientAerobics = (client: ClientProfile, batchId?: string) => {
    setPendingDeleteAction({
      title: 'Revoke Aerobics Subscription',
      itemName: `${client.displayName} (@${client.userId})`,
      itemType: 'Aerobics Enrollment',
      description: `Are you sure you want to revoke ${client.displayName}'s active Aerobics enrollment?`,
      warningNote: 'The ✨ AEROBICS badge will be removed from their QR check-ins and profile.',
      confirmLabel: 'Yes, Revoke Aerobics',
      onConfirm: async () => {
        if (batchId) {
          const targetBatch = batches.find((b) => b.id === batchId);
          if (targetBatch) {
            const updatedIds = (targetBatch.enrolledClientIds || []).filter(
              (id) => id !== client.userId
            );
            await setDoc(
              doc(db, 'aerobicsBatches', targetBatch.id),
              { enrolledClientIds: updatedIds },
              { merge: true }
            );
          }
        } else {
          for (const b of batches) {
            if ((b.enrolledClientIds || []).includes(client.userId)) {
              await setDoc(
                doc(db, 'aerobicsBatches', b.id),
                {
                  enrolledClientIds: b.enrolledClientIds.filter((id) => id !== client.userId)
                },
                { merge: true }
              );
            }
          }
        }

        await setDoc(
          doc(db, 'clientProfiles', client.userId),
          {
            aerobicsStatus: 'inactive',
            aerobicsBatchId: '',
            aerobicsBatchName: '',
            aerobicsSlotTiming: ''
          },
          { merge: true }
        );

        showToast(`Revoked Aerobics subscription for ${client.displayName}.`);
      }
    });
  };

  const activeAerobicsMembersCount = femaleClients.filter(
    (c) =>
      c.aerobicsStatus === 'active' ||
      batches.some((b) => b.active && (b.enrolledClientIds || []).includes(c.userId))
  ).length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-rose-50/95 via-white/95 to-fuchsia-50/90 border border-rose-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-pink-500 text-white flex items-center justify-center shadow-md shrink-0">
            <Music className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                Women-Exclusive Studio Control
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200">
                {batches.length} Batches • {activeAerobicsMembersCount} Enrolled Female Members
              </span>
            </div>
            <h3 className="text-base font-black text-slate-900 mt-1">
              Aerobics Batches, Pricing &amp; Enrollment Manager
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Configure Morning &amp; Evening studio batches, Monthly/Quarterly pricing, assign Female Trainers, and manage enrolled female members.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('batches')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'batches'
                ? 'bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-rose-50'
            }`}
          >
            Batches &amp; Pricing ({batches.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('enrollments')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'enrollments'
                ? 'bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-rose-50'
            }`}
          >
            Enrolled Female Roster ({activeAerobicsMembersCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'ledger'
                ? 'bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-rose-50'
            }`}
          >
            Subscriptions Ledger ({subscriptions.length})
          </button>
        </div>
      </div>

      {/* Status Toast */}
      {statusBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner('')}
            className="text-emerald-600 hover:text-emerald-900 font-black"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: BATCHES & PRICING CATALOG */}
      {activeTab === 'batches' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/90 p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
            <div className="text-xs text-slate-600 font-medium">
              All active batches below are displayed exclusively in the{' '}
              <strong className="text-rose-700">Female Client Portal</strong> for direct enrollment and in the{' '}
              <strong className="text-fuchsia-700">Female Trainer Portal</strong>.
            </div>
            <button
              type="button"
              onClick={openCreateBatchModal}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-600 hover:from-rose-600 hover:to-fuchsia-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Aerobics Batch</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {batches.map((batch) => {
              const enrolledIds = Array.isArray(batch.enrolledClientIds) ? batch.enrolledClientIds : [];
              const enrolledProfiles = clients.filter((c) => enrolledIds.includes(c.userId));

              return (
                <div
                  key={batch.id}
                  className={`p-5 rounded-3xl border bg-white/95 shadow-xs flex flex-col justify-between space-y-4 ${
                    batch.active ? 'border-rose-200/90' : 'border-slate-200 opacity-75'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200">
                            {batch.category}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                              batch.active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {batch.active ? 'ACTIVE BATCH' : 'HIDDEN'}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 mt-1.5">{batch.title}</h4>
                        <p className="text-xs text-slate-600 font-semibold mt-0.5">
                          Assigned Female Trainer:{' '}
                          <strong className="text-rose-700">{batch.instructorName}</strong> •{' '}
                          {batch.studioZone}
                        </p>
                      </div>
                    </div>

                    {/* Slot Timing & Pricing Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Slot Timing &amp; Days
                        </span>
                        <span className="font-black text-slate-900 mt-0.5 block">
                          {batch.timeSlot}
                        </span>
                        <span className="text-[11px] text-slate-600 font-semibold block">
                          {batch.daysOfWeek}
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-200/80">
                        <span className="text-[10px] font-bold uppercase text-rose-700 block">
                          Batch Pricing
                        </span>
                        <span className="font-black text-slate-900 mt-0.5 block">
                          ₹{(batch.monthlyPrice || 1499).toLocaleString('en-IN')}{' '}
                          <span className="text-[10px] font-normal text-slate-500">/ Monthly</span>
                        </span>
                        <span className="font-black text-fuchsia-700 block">
                          ₹{(batch.quarterlyPrice || 3999).toLocaleString('en-IN')}{' '}
                          <span className="text-[10px] font-normal text-slate-500">/ Quarterly</span>
                        </span>
                      </div>
                    </div>

                    {/* Capacity & Enrolled Members Preview */}
                    <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-rose-600" />
                          <span>Enrolled Female Clients:</span>
                        </span>
                        <span className="font-black text-slate-900">
                          {enrolledIds.length} / {batch.maxCapacity} Seats
                        </span>
                      </div>
                      {enrolledProfiles.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {enrolledProfiles.map((c) => (
                            <span
                              key={c.userId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-[10px] font-bold text-slate-800"
                            >
                              <span>{c.displayName}</span>
                              <button
                                type="button"
                                onClick={() => handleRevokeClientAerobics(c, batch.id)}
                                className="text-rose-500 hover:text-rose-700 ml-1 font-black"
                                title="Remove from batch"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400">No clients enrolled in this slot yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Admin Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleBatchActive(batch)}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1"
                    >
                      {batch.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{batch.active ? 'Hide Batch' : 'Show Batch'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditBatchModal(batch)}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit Pricing / Slot</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(batch)}
                        className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200"
                        title="Delete Batch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: ENROLLED FEMALE ROSTER & MANUAL ASSIGNMENT */}
      {activeTab === 'enrollments' && (
        <div className="space-y-5">
          {/* Manual Cash Desk / Admin Aerobics Enrollment Form */}
          <form
            onSubmit={handleManualEnrollFemaleClient}
            className="p-5 rounded-3xl bg-white/95 border border-rose-200/90 shadow-xs space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-rose-600" />
                  <span>Enroll Female Client in Aerobics Batch (Reception / Cash Desk)</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Activate an Aerobics subscription for any registered female member. Automatically enables the{' '}
                  <strong className="text-rose-700">AEROBICS</strong> badge on their QR check-ins.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Select Female Member *
                </label>
                <select
                  required
                  value={selectedFemaleClientId}
                  onChange={(e) => setSelectedFemaleClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                >
                  <option value="">-- Choose Female Client --</option>
                  {femaleClients.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.displayName} (@{c.userId}) —{' '}
                      {c.aerobicsStatus === 'active' ? 'AEROBICS ACTIVE' : 'Not Enrolled'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Select Aerobics Batch *
                </label>
                <select
                  required
                  value={selectedEnrollBatchId}
                  onChange={(e) => setSelectedEnrollBatchId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                >
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.timeSlot})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Plan Duration *
                </label>
                <select
                  value={selectedEnrollDuration}
                  onChange={(e) =>
                    setSelectedEnrollDuration(e.target.value as 'monthly' | 'quarterly')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                >
                  <option value="monthly">Monthly Plan (1 Month)</option>
                  <option value="quarterly">Quarterly Plan (3 Months)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white font-bold text-xs shadow-md"
              >
                + Activate Aerobics Enrollment
              </button>
            </div>
          </form>

          {/* Female Clients Aerobics Status Roster */}
          <div className="p-5 rounded-3xl bg-white/95 border border-slate-200/90 shadow-xs space-y-3">
            <h4 className="text-sm font-black text-slate-900">
              Registered Female Clients &amp; Aerobics Tag Status ({femaleClients.length})
            </h4>
            <div className="space-y-2.5">
              {femaleClients.map((client) => {
                const enrolledBatch = batches.find(
                  (b) =>
                    b.id === client.aerobicsBatchId ||
                    (b.enrolledClientIds || []).includes(client.userId)
                );
                const isAeroActive =
                  client.aerobicsStatus === 'active' || Boolean(enrolledBatch);

                return (
                  <div
                    key={client.userId}
                    className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={client.photoUrl}
                        alt={client.displayName}
                        className="w-10 h-10 rounded-xl object-cover border border-rose-200"
                      />
                      <div>
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-black text-slate-900">{client.displayName}</span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            @{client.userId}
                          </span>
                          {isAeroActive ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white shadow-2xs">
                              ✨ AEROBICS
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                              Standard Gym Only
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {isAeroActive
                            ? `Batch: ${client.aerobicsBatchName || enrolledBatch?.title || 'Enrolled'} • ${
                                client.aerobicsSlotTiming || enrolledBatch?.timeSlot || ''
                              } • Valid till ${client.aerobicsEndDate || 'Active'}`
                            : 'Not enrolled in an Aerobics batch yet'}
                        </p>
                      </div>
                    </div>

                    {isAeroActive && (
                      <button
                        type="button"
                        onClick={() => handleRevokeClientAerobics(client, enrolledBatch?.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 shrink-0"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>Revoke Aerobics</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AEROBICS SUBSCRIPTIONS LEDGER */}
      {activeTab === 'ledger' && (
        <div className="p-5 rounded-3xl bg-white/95 border border-slate-200/90 shadow-xs space-y-4">
          <div>
            <h4 className="text-sm font-black text-slate-900">
              Aerobics Batch Subscriptions Ledger ({subscriptions.length})
            </h4>
            <p className="text-xs text-slate-600">
              Complete log of Monthly and Quarterly Aerobics batch enrollments by female members.
            </p>
          </div>

          {subscriptions.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500">
              No Aerobics batch subscription transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-700">
                    <th className="py-2.5 px-3">Female Member</th>
                    <th className="py-2.5 px-3">Batch &amp; Timing</th>
                    <th className="py-2.5 px-3">Plan</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Validity</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 bg-white">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-rose-50/30">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {sub.clientName}{' '}
                        <span className="text-[10px] font-mono text-slate-400">
                          (@{sub.clientId})
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-800 block">{sub.batchName}</span>
                        <span className="text-[10px] text-rose-700 font-semibold">
                          {sub.slotTiming}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 uppercase font-bold text-fuchsia-700">
                        {sub.planDuration} ({sub.durationMonths}M)
                      </td>
                      <td className="py-2.5 px-3 font-black text-slate-900">
                        ₹{sub.amountPaid.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {sub.startDate} → {sub.endDate}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                          {sub.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT AEROBICS BATCH MODAL */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="w-full max-w-xl bg-white rounded-3xl border border-rose-200 shadow-2xl overflow-hidden my-8">
            <div className="p-4 bg-gradient-to-r from-rose-500 via-fuchsia-600 to-pink-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <h3 className="text-sm font-black">
                  {editingBatchId ? 'Edit Aerobics Batch & Pricing' : 'Create New Aerobics Studio Batch'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBatch} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Batch Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchTitle}
                    onChange={(e) => setBatchTitle(e.target.value)}
                    placeholder="e.g. Morning Sunshine Zumba & Dance Cardio"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Batch Category *
                  </label>
                  <select
                    value={batchCategory}
                    onChange={(e) => setBatchCategory(e.target.value as AerobicsCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Assigned Female Trainer *
                  </label>
                  <select
                    value={batchInstructorId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setBatchInstructorId(id);
                      const tr = femaleTrainers.find((t) => t.trainerId === id);
                      if (tr) setBatchInstructorName(tr.displayName);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                  >
                    {femaleTrainers.map((tr) => (
                      <option key={tr.trainerId} value={tr.trainerId}>
                        {tr.displayName} (@{tr.trainerId})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Slot Timings *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchTime}
                    onChange={(e) => setBatchTime(e.target.value)}
                    placeholder="Morning 07:00 AM - 08:00 AM"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Days of Week *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchDays}
                    onChange={(e) => setBatchDays(e.target.value)}
                    placeholder="Mon - Sat"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-rose-700 mb-1">
                    Monthly Price (₹ / 1 Month) *
                  </label>
                  <input
                    type="number"
                    min={100}
                    required
                    value={batchMonthlyPrice}
                    onChange={(e) => setBatchMonthlyPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-rose-50/60 border border-rose-200 font-black text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-fuchsia-700 mb-1">
                    Quarterly Price (₹ / 3 Months) *
                  </label>
                  <input
                    type="number"
                    min={100}
                    required
                    value={batchQuarterlyPrice}
                    onChange={(e) => setBatchQuarterlyPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-fuchsia-50/60 border border-fuchsia-200 font-black text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Batch Seat Capacity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    required
                    value={batchCapacity}
                    onChange={(e) => setBatchCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Intensity Level
                  </label>
                  <select
                    value={batchIntensity}
                    onChange={(e) => setBatchIntensity(e.target.value as AerobicsIntensity)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                  >
                    {INTENSITIES.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Studio Zone / Room
                  </label>
                  <input
                    type="text"
                    value={batchStudio}
                    onChange={(e) => setBatchStudio(e.target.value)}
                    placeholder="Rose Aurora Studio A (Women Only)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white font-bold shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingBatchId ? 'Save Batch Changes' : 'Publish Aerobics Batch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteConfirmModal
        isOpen={!!pendingDeleteAction}
        title={pendingDeleteAction?.title || 'Confirm Permanent Deletion'}
        itemName={pendingDeleteAction?.itemName || ''}
        itemType={pendingDeleteAction?.itemType}
        description={pendingDeleteAction?.description || ''}
        warningNote={pendingDeleteAction?.warningNote}
        confirmLabel={pendingDeleteAction?.confirmLabel}
        onClose={() => setPendingDeleteAction(null)}
        onConfirm={async () => {
          if (pendingDeleteAction) {
            await pendingDeleteAction.onConfirm();
            setPendingDeleteAction(null);
          }
        }}
      />
    </div>
  );
};
