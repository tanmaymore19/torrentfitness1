import React, { useState, useMemo } from 'react';
import { ClientProfile, UserAccount, AttendanceRecord } from '../../types';
import { exportIndividualAttendancePdf } from '../../services/pdfExportService';
import { usePdfDownload } from '../../context/PdfDownloadContext';
import {
  Calendar,
  Clock,
  FileText,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertCircle,
  Timer,
  Search,
  Filter,
  Download,
  RotateCcw,
  Sparkles
} from 'lucide-react';

export type AttendanceFilterType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

interface ClientAttendanceAnalyticsProps {
  client: ClientProfile;
  user?: UserAccount | null;
  attendanceRecords: AttendanceRecord[];
  gymName?: string;
}

export const ClientAttendanceAnalytics: React.FC<ClientAttendanceAnalyticsProps> = ({
  client,
  user,
  attendanceRecords,
  gymName = 'Torrent Fitness'
}) => {
  const { requestPdfDownload } = usePdfDownload();
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filter State
  const [filterType, setFilterType] = useState<AttendanceFilterType>('monthly');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr); // for daily & week anchoring
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);
  const [searchTableQuery, setSearchTableQuery] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper: compute start & end of week (Monday to Sunday) for selectedDate
  const weekRange = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    const day = d.getDay(); // 0 is Sunday, 1 is Monday
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startStr = monday.toISOString().split('T')[0];
    const endStr = sunday.toISOString().split('T')[0];

    const display = `${monday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${sunday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return { startStr, endStr, display };
  }, [selectedDate]);

  // Generate Filter Scope Label
  const filterScopeLabel = useMemo(() => {
    if (filterType === 'daily') {
      try {
        const d = new Date(selectedDate + 'T12:00:00');
        return `Daily Attendance (${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })})`;
      } catch {
        return `Daily Attendance (${selectedDate})`;
      }
    }
    if (filterType === 'weekly') {
      return `Weekly Attendance (${weekRange.display})`;
    }
    if (filterType === 'monthly') {
      return `Monthly Attendance (${monthNames[selectedMonth - 1]} ${selectedYear})`;
    }
    if (filterType === 'yearly') {
      return `Yearly Attendance (${selectedYear})`;
    }
    if (filterType === 'custom') {
      return `Custom Scope (${customStartDate} to ${customEndDate})`;
    }
    return 'Attendance History';
  }, [filterType, selectedDate, weekRange, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // Filter Attendance Records
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter((rec) => {
      const recDate = rec.entryDate;
      if (!recDate) return false;

      if (filterType === 'daily') {
        return recDate === selectedDate;
      }
      if (filterType === 'weekly') {
        return recDate >= weekRange.startStr && recDate <= weekRange.endStr;
      }
      if (filterType === 'monthly') {
        const [y, m] = recDate.split('-');
        return Number(y) === selectedYear && Number(m) === selectedMonth;
      }
      if (filterType === 'yearly') {
        return recDate.startsWith(String(selectedYear));
      }
      if (filterType === 'custom') {
        return recDate >= customStartDate && recDate <= customEndDate;
      }
      return true;
    }).sort((a, b) => {
      const timeA = new Date(`${a.entryDate}T${a.entryTime || '00:00:00'}`).getTime();
      const timeB = new Date(`${b.entryDate}T${b.entryTime || '00:00:00'}`).getTime();
      return timeB - timeA;
    });
  }, [attendanceRecords, filterType, selectedDate, weekRange, selectedMonth, selectedYear, customStartDate, customEndDate]);

  // Apply search query within filtered records
  const displayRecords = useMemo(() => {
    if (!searchTableQuery.trim()) return filteredRecords;
    const q = searchTableQuery.toLowerCase().trim();
    return filteredRecords.filter(r => 
      r.entryDate.includes(q) ||
      (r.entryTime && r.entryTime.toLowerCase().includes(q)) ||
      (r.exitTime && r.exitTime.toLowerCase().includes(q)) ||
      (r.sessionStatus && r.sessionStatus.toLowerCase().includes(q))
    );
  }, [filteredRecords, searchTableQuery]);

  // Metrics computation
  const metrics = useMemo(() => {
    const totalSessions = filteredRecords.length;
    let totalMinutes = 0;
    let completedCount = 0;
    let autoClosedCount = 0;
    let inProgressCount = 0;

    filteredRecords.forEach((r) => {
      if (r.sessionStatus === 'active') {
        inProgressCount++;
        totalMinutes += r.sessionDurationMinutes || 45;
      } else if (r.sessionStatus === 'auto-closed') {
        autoClosedCount++;
        totalMinutes += r.sessionDurationMinutes || 120;
      } else {
        completedCount++;
        totalMinutes += r.sessionDurationMinutes || 90;
      }
    });

    const totalHours = Math.floor(totalMinutes / 60);
    const remMinutes = totalMinutes % 60;
    const avgDurationMins = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
    const avgHours = Math.floor(avgDurationMins / 60);
    const avgMins = avgDurationMins % 60;
    const avgDurationFormatted = avgHours > 0 ? `${avgHours}h ${avgMins}m` : `${avgMins}m`;

    return {
      totalSessions,
      totalHours,
      remMinutes,
      avgDurationFormatted,
      completedCount,
      autoClosedCount,
      inProgressCount
    };
  }, [filteredRecords]);

  // Date Navigation Handlers
  const handleShiftDate = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleShiftMonth = (months: number) => {
    let nextMonth = selectedMonth + months;
    let nextYear = selectedYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    setSelectedMonth(nextMonth);
    setSelectedYear(nextYear);
  };

  const handleShiftYear = (years: number) => {
    setSelectedYear(prev => prev + years);
  };

  // Export PDF Handler
  const handleExportPdf = () => {
    const memberName = client.displayName || user?.displayName || 'Member';
    const reportName = `${memberName} Attendance Report (${filterScopeLabel})`;

    requestPdfDownload({
      portalType: 'admin',
      documentName: reportName,
      customTitle: 'Confirm PDF Download',
      customMessage: `Are you sure you want to download and export this ${reportName} as a PDF?`,
      onConfirm: async () => {
        setIsExportingPdf(true);
        try {
          await exportIndividualAttendancePdf({
            client,
            user,
            attendanceRecords: filteredRecords,
            filterLabel: filterScopeLabel,
            gymName
          });
        } finally {
          setIsExportingPdf(false);
        }
      }
    });
  };

  // Helper formatting for session times
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const hour = parseInt(parts[0], 10);
      const min = parts[1];
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const formattedHour = hour % 12 === 0 ? 12 : hour % 12;
      return `${String(formattedHour).padStart(2, '0')}:${min} ${ampm}`;
    }
    return timeStr;
  };

  // Format Duration
  const formatDuration = (r: AttendanceRecord) => {
    if (r.sessionStatus === 'active' && !r.exitTime) {
      return 'In-Progress';
    }
    if (r.sessionDurationMinutes) {
      const h = Math.floor(r.sessionDurationMinutes / 60);
      const m = r.sessionDurationMinutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    return '1h 30m';
  };

  return (
    <div className="space-y-4 text-slate-700">
      {/* Top Header: Client Quick Summary & Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 clay-surface p-4 rounded-2xl border border-white/80 shadow-lg">
        <div className="flex items-center gap-3">
          <img
            src={client.photoUrl}
            alt={client.displayName}
            className="w-12 h-12 rounded-xl object-cover border border-slate-300 shrink-0 ring-1 ring-cyan-500/20 shadow-sm"
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">{client.displayName}</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950/80 text-orange-500 font-bold border border-cyan-500/30">
                ID: {client.userId}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                client.membershipStatus === 'active'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-600 border border-slate-100'
              }`}>
                {client.membershipStatus.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Phone: <strong className="text-slate-700">{user?.phone || client.phone || 'N/A'}</strong> • DOB: <strong className="text-slate-700">{user?.dob || client.dob || 'N/A'}</strong>
            </p>
          </div>
        </div>

        {/* Dedicated Individual Attendance PDF Export */}
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExportingPdf || filteredRecords.length === 0}
          className="px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-950/40 disabled:opacity-50 active:scale-95 shrink-0"
          title="Export this filtered attendance history as a branded PDF"
        >
          <FileText className="w-4 h-4" />
          <span>{isExportingPdf ? 'Generating PDF...' : 'Export Attendance Report (PDF)'}</span>
        </button>
      </div>

      {/* 1. Flexible Filter Views Toolbar */}
      <div className="clay-surface p-4 rounded-2xl border border-white/80 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Filter Type Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'daily', label: 'Daily' },
              { key: 'weekly', label: 'Weekly' },
              { key: 'monthly', label: 'Monthly' },
              { key: 'yearly', label: 'Yearly' },
              { key: 'custom', label: 'Custom Date Range' }
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterType(tab.key as AttendanceFilterType)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 ${
                  filterType === tab.key
                    ? 'clay-btn-emerald text-white text-slate-800 shadow-md shadow-cyan-500/25 border border-cyan-400/30'
                    : 'bg-[#E2EAF3] text-slate-600 hover:text-slate-800 hover:bg-[#1E293B] border border-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Quick Scope Indicator */}
          <div className="text-xs font-bold text-orange-500 font-bold flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-orange-500 font-bold" strokeWidth={1.75} />
            <span>{filterScopeLabel}</span>
          </div>
        </div>

        {/* Filter-Specific Date Pickers & Navigation Controls */}
        <div className="pt-3 border-t border-white/80 flex flex-wrap items-center justify-between gap-3">
          {/* Daily Mode Controls */}
          {filterType === 'daily' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleShiftDate(-1)}
                className="p-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 rounded-lg border border-white/80 transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 bg-[#E2EAF3] border border-white/80 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="button"
                onClick={() => handleShiftDate(1)}
                className="p-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 rounded-lg border border-white/80 transition-colors"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className="px-2.5 py-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 text-xs font-semibold rounded-xl border border-white/80 transition-colors"
              >
                Today
              </button>
            </div>
          )}

          {/* Weekly Mode Controls */}
          {filterType === 'weekly' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleShiftDate(-7)}
                className="p-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 rounded-lg border border-white/80 transition-colors"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-1.5 bg-[#E2EAF3] border border-white/80 rounded-xl text-xs font-mono text-slate-800">
                Week: <strong>{weekRange.display}</strong>
              </div>
              <button
                type="button"
                onClick={() => handleShiftDate(7)}
                className="p-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 rounded-lg border border-white/80 transition-colors"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className="px-2.5 py-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 text-xs font-semibold rounded-xl border border-white/80 transition-colors"
              >
                Current Week
              </button>
            </div>
          )}

          {/* Monthly Mode Controls */}
          {filterType === 'monthly' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleShiftMonth(-1)}
                className="p-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 rounded-lg border border-white/80 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-3 py-1.5 bg-[#E2EAF3] border border-white/80 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-cyan-500 font-medium"
              >
                {monthNames.map((name, idx) => (
                  <option key={idx} value={idx + 1} className="clay-card text-slate-800">
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-1.5 bg-[#E2EAF3] border border-white/80 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-cyan-500 font-mono"
              >
                {[2024, 2025, 2026, 2027].map((yr) => (
                  <option key={yr} value={yr} className="clay-card text-slate-800">
                    {yr}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleShiftMonth(1)}
                className="p-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 rounded-lg border border-white/80 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(new Date().getMonth() + 1);
                  setSelectedYear(new Date().getFullYear());
                }}
                className="px-2.5 py-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 text-xs font-semibold rounded-xl border border-white/80 transition-colors"
              >
                This Month
              </button>
            </div>
          )}

          {/* Yearly Mode Controls */}
          {filterType === 'yearly' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleShiftYear(-1)}
                className="p-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 rounded-lg border border-white/80 transition-colors"
                title="Previous Year"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-4 py-1.5 bg-[#E2EAF3] border border-white/80 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-cyan-500 font-mono"
              >
                {[2023, 2024, 2025, 2026, 2027].map((yr) => (
                  <option key={yr} value={yr} className="clay-card text-slate-800">
                    Year {yr}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleShiftYear(1)}
                className="p-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 rounded-lg border border-white/80 transition-colors"
                title="Next Year"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedYear(new Date().getFullYear())}
                className="px-2.5 py-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 text-xs font-semibold rounded-xl border border-white/80 transition-colors"
              >
                Current Year
              </button>
            </div>
          )}

          {/* Custom Date Range Controls */}
          {filterType === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-600">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#E2EAF3] border border-white/80 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-600">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#E2EAF3] border border-white/80 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 30);
                  setCustomStartDate(d.toISOString().split('T')[0]);
                  setCustomEndDate(todayStr);
                }}
                className="px-2.5 py-1.5 bg-[#E2EAF3] hover:bg-[#1E293B] text-slate-700 text-xs font-semibold rounded-xl border border-white/80 flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Last 30 Days</span>
              </button>
            </div>
          )}

          {/* Quick search input within the table */}
          <div className="relative w-full sm:w-56">
            <input
              type="text"
              placeholder="Search in records..."
              value={searchTableQuery}
              onChange={(e) => setSearchTableQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#E2EAF3] border border-white/80 rounded-xl focus:outline-none focus:border-cyan-500 text-slate-800 placeholder-slate-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-600 absolute left-2.5 top-2.5" />
          </div>
        </div>
      </div>

      {/* 2. Summary KPI Cards for Selected Scope */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 clay-card rounded-2xl border border-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Total Sessions</span>
            <Activity className="w-4 h-4 text-orange-500 font-bold" strokeWidth={1.75} />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-slate-800">{metrics.totalSessions}</span>
            <span className="text-[10px] text-slate-600">Visits</span>
          </div>
          <span className="text-[10px] text-slate-600 mt-0.5 block truncate">
            {metrics.completedCount} Completed
          </span>
        </div>

        <div className="p-4 clay-card rounded-2xl border border-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Total Workout Time</span>
            <Clock className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-emerald-400">
              {metrics.totalHours}h {metrics.remMinutes}m
            </span>
          </div>
          <span className="text-[10px] text-slate-600 mt-0.5 block">
            Time inside facility
          </span>
        </div>

        <div className="p-4 clay-card rounded-2xl border border-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Avg Workout Duration</span>
            <Timer className="w-4 h-4 text-indigo-400" strokeWidth={1.75} />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-indigo-400">
              {metrics.avgDurationFormatted}
            </span>
            <span className="text-[10px] text-slate-600">/ session</span>
          </div>
          <span className="text-[10px] text-slate-600 mt-0.5 block">
            Average per check-in
          </span>
        </div>

        <div className="p-4 clay-card rounded-2xl border border-white/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Session Status</span>
            <CheckCircle2 className="w-4 h-4 text-orange-500 font-bold" strokeWidth={1.75} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-800">
              {metrics.totalSessions > 0 ? `${Math.round((metrics.completedCount / metrics.totalSessions) * 100)}%` : '0%'}
            </span>
            <span className="text-[10px] text-slate-600">Completed</span>
          </div>
          <span className="text-[10px] text-slate-600 mt-0.5 block truncate">
            {metrics.inProgressCount > 0 ? `${metrics.inProgressCount} currently active` : 'All sessions closed'}
          </span>
        </div>
      </div>

      {/* 3. Detailed Session Logs Table */}
      <div className="clay-surface rounded-2xl border border-white/80 overflow-hidden shadow-xl">
        <div className="p-3.5 bg-[#E2EAF3]/80 border-b border-white/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Detailed Session Logs
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EFF4FA] text-slate-600 border border-white/80">
              {displayRecords.length} records shown
            </span>
          </div>
          <span className="text-[11px] text-slate-600">
            Scope: <strong className="text-orange-500 font-bold">{filterScopeLabel}</strong>
          </span>
        </div>

        {displayRecords.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-2">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              No attendance records found for this period.
            </p>
            <p className="text-xs text-slate-600 max-w-sm mx-auto">
              No gym check-in scans were recorded for {client.displayName} matching {filterScopeLabel}.
            </p>
            {filterType !== 'monthly' && (
              <button
                type="button"
                onClick={() => setFilterType('monthly')}
                className="mt-2 px-3.5 py-1.5 clay-btn-emerald text-white hover:from-cyan-400 hover:to-blue-500 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-500/20"
              >
                Switch to Monthly View
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/80 bg-[#E2EAF3] text-slate-600 uppercase text-[10px] font-bold sticky top-0 z-10 backdrop-blur-md">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Date & Day</th>
                  <th className="py-3 px-4">Session Start (Check-in)</th>
                  <th className="py-3 px-4">Session Close (Check-out)</th>
                  <th className="py-3 px-4">Total Duration Spent</th>
                  <th className="py-3 px-4">Session Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {displayRecords.map((r, idx) => {
                  let dayOfWeek = '';
                  let formattedDate = r.entryDate;
                  try {
                    const d = new Date(r.entryDate + 'T12:00:00');
                    dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short' });
                    formattedDate = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  } catch {
                    dayOfWeek = '--';
                  }

                  const isLive = r.sessionStatus === 'active';
                  const isAutoClosed = r.sessionStatus === 'auto-closed';

                  return (
                    <tr key={r.id || idx} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{formattedDate}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#EFF4FA] border border-white/80 text-[10px] font-mono text-slate-600">
                            {dayOfWeek}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-orange-500 font-bold font-bold">
                          <Clock className="w-3.5 h-3.5 text-orange-500 font-bold shrink-0" strokeWidth={1.75} />
                          <span>{formatTime(r.entryTime)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-slate-700">
                          {isLive ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-100 text-emerald-700 border border-emerald-2000"></span>
                              </span>
                              <span>Active Floor Session</span>
                            </span>
                          ) : r.exitTime ? (
                            <span>{formatTime(r.exitTime)}</span>
                          ) : (
                            <span className="text-purple-300 text-[11px] font-sans">
                              {isAutoClosed ? 'Auto-closed after 2h' : 'Completed (Auto-logged)'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-700">
                        <span className="px-2.5 py-1 rounded-lg bg-[#E2EAF3] border border-white/80 font-mono text-[11px] text-emerald-300">
                          {formatDuration(r)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isLive ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 w-max">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>IN-PROGRESS</span>
                          </span>
                        ) : isAutoClosed ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-500/30 w-max block">
                            AUTO-CLOSED
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EFF4FA] text-slate-700 border border-white/80 w-max block">
                            COMPLETED
                          </span>
                        )}
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
  );
};
