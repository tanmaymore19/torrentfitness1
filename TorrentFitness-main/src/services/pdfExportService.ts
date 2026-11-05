import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ClientProfile, UserAccount, AttendanceRecord, MembershipRecord } from '../types';

export interface PdfExportOptions {
  clients: ClientProfile[];
  users: UserAccount[];
  memberships?: MembershipRecord[];
  gymName?: string;
}

export interface IndividualAttendancePdfOptions {
  client: ClientProfile;
  user?: UserAccount | null;
  attendanceRecords: AttendanceRecord[];
  filterLabel: string;
  gymName?: string;
}

let cachedLogoBase64: string | null = null;

export async function getBrandLogoBase64(): Promise<string | null> {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    let res = await fetch('/gym-logo-v2.png?v=20261025_2');
    if (!res.ok) {
      res = await fetch('/assets/aistudio/WhatsApp_Image_2026-10-25_at_3.56.48_PM_95897f92.jpeg');
    }
    if (!res.ok) {
      res = await fetch('/brand-logo.png');
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        cachedLogoBase64 = reader.result as string;
        resolve(cachedLogoBase64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Generates and downloads a clean, professional PDF containing complete client records:
 * Full name, Phone number, Date of Birth (DOB), User ID, and detailed membership history (active & previous).
 */
export const exportClientRecordsToPdf = async ({
  clients,
  users,
  memberships = [],
  gymName = 'TORRENT FITNESS'
}: PdfExportOptions): Promise<boolean> => {
  try {
    // Create portrait A4 document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Color definitions
    const primarySky = [2, 132, 199]; // #0284c7
    const darkSlate = [15, 23, 42]; // #0f172a
    const mutedSlate = [100, 116, 139]; // #64748b

    // Document Header
    doc.setFillColor(15, 23, 42); // dark navy bar
    doc.rect(0, 0, 210, 30, 'F');

    // Brand accent line
    doc.setFillColor(2, 132, 199); // sky accent
    doc.rect(0, 29, 210, 1.5, 'F');

    // Brand Logo
    const logoBase64 = await getBrandLogoBase64();
    let textStartX = 14;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 4, 22, 22);
        textStartX = 40;
      } catch (err) {
        console.warn('Could not render logo in client records PDF:', err);
      }
    }

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(gymName.toUpperCase(), textStartX, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(186, 230, 253);
    doc.text('OFFICIAL CLIENT ROSTER & MEMBERSHIP HISTORY DIRECTORY', textStartX, 19);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${formattedDate} at ${formattedTime} | Master Admin Export`, textStartX, 24);

    // Summary KPI Block
    const totalClients = clients.length;
    const activeMembers = clients.filter(c => c.membershipStatus === 'active').length;
    const inactiveMembers = totalClients - activeMembers;
    const activePtClients = clients.filter(c => c.ptStatus === 'active').length;

    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(14, 34, 182, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

    doc.text(`Total Clients: ${totalClients}`, 20, 41.5);
    doc.setTextColor(16, 149, 193);
    doc.text(`•  Active Plans: ${activeMembers}`, 65, 41.5);
    doc.setTextColor(225, 29, 72);
    doc.text(`•  Expired/Inactive: ${inactiveMembers}`, 115, 41.5);
    doc.setTextColor(13, 148, 136);
    doc.text(`•  1-on-1 PT Enrolled: ${activePtClients}`, 160, 41.5);

    // Prepare table row data with comprehensive membership history
    const tableRows = clients.map((client, index) => {
      const user = users.find(u => u.uid === client.userId);

      // Phone resolution
      const phone = client.phone || (user as any)?.phone || 'Not on file';

      // DOB resolution
      const dob = client.dob || user?.dob || (client as any)?.age ? `Age ${client.age}` : 'Not Specified';

      // Membership records matching this client
      const clientMems = memberships.filter(m => m.clientId === client.userId);
      const activeMem = clientMems.find(m => m.status === 'active');
      const expiredMems = clientMems.filter(m => m.status !== 'active');

      const currentActiveStr = activeMem 
        ? `Active: ${activeMem.planName} (${activeMem.startDate} → ${activeMem.endDate})`
        : `Status: ${(client.membershipStatus || 'inactive').toUpperCase()}`;

      const previousHistoryStr = expiredMems.length > 0
        ? expiredMems.map(m => `• ${m.planName} [${m.startDate} to ${m.endDate}]`).join('\n')
        : (client.membershipPlanName ? `Current/Last: ${client.membershipPlanName} (${client.membershipEndDate || 'N/A'})` : 'No previous history');

      const ptInfo = client.ptStatus === 'active' 
        ? `PT: ${client.assignedTrainerName || 'Assigned'}` 
        : 'General Gym';

      const selfDeletedTag = client.isSelfDeleted ? '\n[USER SELF-DELETED]' : '';

      return [
        (index + 1).toString(),
        `${client.displayName || 'Unnamed Member'}${selfDeletedTag}`,
        phone,
        dob,
        `@${client.userId}`,
        currentActiveStr,
        previousHistoryStr,
        ptInfo
      ];
    });

    // Generate table with autoTable
    autoTable(doc, {
      startY: 51,
      head: [
        [
          '#',
          'Full Name & ID',
          'Mobile Number',
          'Date of Birth',
          'User ID',
          'Current Active Membership',
          'Previous / Expired Memberships',
          'Coaching / PT'
        ]
      ],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [2, 132, 199], // sky-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        valign: 'middle',
        cellPadding: 2.5
      },
      styles: {
        font: 'helvetica',
        fontSize: 7,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        cellPadding: 2.2,
        valign: 'middle'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // light alternating rows
      },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' }, // index
        1: { cellWidth: 28, fontStyle: 'bold' }, // full name
        2: { cellWidth: 24 }, // phone
        3: { cellWidth: 20 }, // DOB
        4: { cellWidth: 20, textColor: [3, 105, 161] }, // user ID
        5: { cellWidth: 32 }, // current active membership
        6: { cellWidth: 33 }, // previous expired memberships
        7: { cellWidth: 18 }  // PT
      },
      didDrawPage: (data) => {
        // Footer on every page
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageNumber = data.pageNumber;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);

        doc.text(
          `Page ${pageNumber} of ${pageCount} • Confidential Document • Torrent Fitness Gym Operations`,
          14,
          290
        );

        doc.text(
          'Automated Executive Export',
          196,
          290,
          { align: 'right' }
        );
      }
    });

    // Save and trigger download
    const cleanDateStr = now.toISOString().split('T')[0];
    doc.save(`TorrentFitness_Client_Records_Detailed_${cleanDateStr}.pdf`);
    return true;
  } catch (err) {
    console.error('Failed to export PDF:', err);
    throw err;
  }
};

/**
 * Generates and downloads a clean, professional individual attendance report PDF
 * with gym branding, client metadata, selected timeframe, KPI metrics, and session logs.
 */
export const exportIndividualAttendancePdf = async ({
  client,
  user,
  attendanceRecords,
  filterLabel,
  gymName = 'TORRENT FITNESS'
}: IndividualAttendancePdfOptions): Promise<boolean> => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Color definitions
    const primarySky = [2, 132, 199];
    const darkSlate = [15, 23, 42];
    const mutedSlate = [100, 116, 139];

    // Document Header Bar
    doc.setFillColor(15, 23, 42); // dark navy
    doc.rect(0, 0, 210, 28, 'F');

    // Sky blue accent line
    doc.setFillColor(2, 132, 199);
    doc.rect(0, 27, 210, 1.5, 'F');

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(gymName.toUpperCase(), 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(186, 230, 253);
    doc.text('OFFICIAL MEMBER ATTENDANCE & WORKOUT REPORT', 14, 19);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${formattedDate} at ${formattedTime} | Master Admin Record`, 14, 24);

    // Client Details Card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 33, 182, 25, 2, 2, 'FD');

    // Left Column: Member details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(`Member: ${client.displayName}`, 18, 40);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
    doc.text(`Member ID: ${client.userId}`, 18, 46);
    doc.text(`Mobile: ${user?.phone || client.phone || 'Not Registered'}`, 18, 52);

    // Right Column: Membership & Report Scope
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primarySky[0], primarySky[1], primarySky[2]);
    doc.text(`Report Scope: ${filterLabel}`, 105, 40);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);
    doc.text(`Membership Status: ${client.membershipStatus.toUpperCase()} (${client.membershipPlanName || 'Active Tier'})`, 105, 46);
    doc.text(`DOB: ${user?.dob || client.dob || 'N/A'}${client.age ? ` (Age: ${client.age})` : ''}`, 105, 52);

    // Summary KPI Block
    const totalSessions = attendanceRecords.length;
    let totalMinutes = 0;
    attendanceRecords.forEach(a => {
      totalMinutes += a.sessionDurationMinutes || (a.sessionStatus === 'active' ? 45 : 90);
    });
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMins = totalMinutes % 60;
    const avgDurationMins = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
    const avgHours = Math.floor(avgDurationMins / 60);
    const avgMins = avgDurationMins % 60;
    const avgDurationStr = avgHours > 0 ? `${avgHours}h ${avgMins}m` : `${avgMins}m`;

    doc.setFillColor(241, 245, 249); // slate-100
    doc.roundedRect(14, 62, 182, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

    doc.text(`Total Sessions: ${totalSessions} Visits`, 18, 70.5);
    doc.text(`Total Time Spent: ${totalHours}h ${remainingMins}m`, 68, 70.5);
    doc.text(`Avg Duration: ${avgDurationStr}`, 124, 70.5);
    doc.text(`Completion: ${totalSessions > 0 ? '100%' : '0%'}`, 164, 70.5);

    // Table of Attendance Logs
    const tableRows = attendanceRecords.map((rec, idx) => {
      // Parse date and day of week
      let dayName = '';
      let dateDisplay = rec.entryDate;
      try {
        const d = new Date(rec.entryDate + 'T12:00:00');
        dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        dateDisplay = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch (e) {
        dayName = '--';
      }

      // Check-in time
      const checkIn = rec.entryTime || '--:--';

      // Check-out time
      let checkOut = rec.exitTime || '';
      if (!checkOut) {
        checkOut = rec.sessionStatus === 'active' ? 'Active On-Floor' : 'Auto-closed';
      }

      // Duration
      let durStr = '';
      if (rec.sessionStatus === 'active' && !rec.exitTime) {
        durStr = 'In-Progress';
      } else if (rec.sessionDurationMinutes) {
        const h = Math.floor(rec.sessionDurationMinutes / 60);
        const m = rec.sessionDurationMinutes % 60;
        durStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      } else {
        durStr = '1h 30m';
      }

      // Status
      let statusStr = 'Completed';
      if (rec.sessionStatus === 'active') {
        statusStr = 'In-Progress';
      } else if (rec.sessionStatus === 'auto-closed') {
        statusStr = 'Auto-closed (2h)';
      }

      return [
        (idx + 1).toString(),
        dateDisplay,
        dayName,
        checkIn,
        checkOut,
        durStr,
        statusStr
      ];
    });

    autoTable(doc, {
      startY: 81,
      head: [
        [
          '#',
          'Date',
          'Day',
          'Check-in (Start)',
          'Check-out (End)',
          'Duration',
          'Session Status'
        ]
      ],
      body: tableRows.length > 0 ? tableRows : [['-', 'No attendance records logged for this selected timeframe.', '', '', '', '', '']],
      theme: 'grid',
      headStyles: {
        fillColor: [2, 132, 199], // sky-600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        valign: 'middle',
        cellPadding: 2.5
      },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        cellPadding: 2.2,
        valign: 'middle'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, // index
        1: { cellWidth: 28, fontStyle: 'bold' }, // Date
        2: { cellWidth: 16 }, // Day
        3: { cellWidth: 32, textColor: [3, 105, 161] }, // Check-in
        4: { cellWidth: 34 }, // Check-out
        5: { cellWidth: 26, fontStyle: 'bold' }, // Duration
        6: { cellWidth: 38 }  // Status
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageNumber = data.pageNumber;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);

        doc.text(
          `Page ${pageNumber} of ${pageCount} • Official Attendance Log • Torrent Fitness Gym Operations`,
          14,
          290
        );

        doc.text(
          'Automated Member Record Export',
          196,
          290,
          { align: 'right' }
        );
      }
    });

    const cleanMemberName = client.displayName.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanDateStr = now.toISOString().split('T')[0];
    doc.save(`TorrentFitness_Attendance_${cleanMemberName}_${cleanDateStr}.pdf`);
    return true;
  } catch (err) {
    console.error('Failed to export Individual Attendance PDF:', err);
    throw err;
  }
};

export interface BulkAttendancePdfOptions {
  clients: ClientProfile[];
  users: UserAccount[];
  attendanceRecords: AttendanceRecord[];
  filterLabel: string;
  gymName?: string;
}

/**
 * Generates and downloads a comprehensive bulk attendance report PDF for all members
 * with Torrent Fitness branding, member details, membership plan status, and consolidated attendance metrics.
 */
export const exportAllMembersAttendancePdf = async ({
  clients,
  users,
  attendanceRecords,
  filterLabel,
  gymName = 'TORRENT FITNESS'
}: BulkAttendancePdfOptions): Promise<boolean> => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const primarySky = [2, 132, 199];
    const darkSlate = [15, 23, 42];
    const mutedSlate = [100, 116, 139];

    // Document Header Bar
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');

    doc.setFillColor(2, 132, 199);
    doc.rect(0, 27, 210, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(gymName.toUpperCase(), 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(186, 230, 253);
    doc.text('OFFICIAL BULK ATTENDANCE & CONSOLIDATED MEMBER REPORT', 14, 19);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${formattedDate} at ${formattedTime} | Scope: ${filterLabel}`, 14, 24);

    // Summary KPI Block
    const totalMembers = clients.length;
    const totalVisits = attendanceRecords.length;
    let totalMinutesAll = 0;
    attendanceRecords.forEach(a => {
      totalMinutesAll += a.sessionDurationMinutes || 90;
    });
    const totalHoursAll = Math.floor(totalMinutesAll / 60);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 33, 182, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

    doc.text(`Total Members: ${totalMembers}`, 18, 41.5);
    doc.text(`Total Recorded Visits: ${totalVisits}`, 70, 41.5);
    doc.text(`Total Gym Hours: ${totalHoursAll}h`, 130, 41.5);
    doc.text(`Scope: ${filterLabel}`, 160, 41.5);

    // Prepare table rows for all members
    const tableRows = clients.map((client, idx) => {
      const user = users.find(u => u.uid === client.userId);
      const phone = client.phone || (user as any)?.phone || 'N/A';
      const dob = client.dob || user?.dob || 'N/A';
      const planName = client.membershipPlanName || 'Standard';
      const status = (client.membershipStatus || 'inactive').toUpperCase();

      // Attendance records for this specific client
      const clientRecords = attendanceRecords.filter(a => a.clientId === client.userId || a.clientName?.toLowerCase() === client.displayName.toLowerCase());
      const visitsCount = clientRecords.length;

      let clientMins = 0;
      clientRecords.forEach(r => {
        clientMins += r.sessionDurationMinutes || 90;
      });
      const clientHours = Math.floor(clientMins / 60);
      const clientRemMins = clientMins % 60;
      const durationStr = clientMins > 0 ? `${clientHours}h ${clientRemMins}m` : '0m';

      const lastVisit = clientRecords.length > 0 ? clientRecords[0].entryDate : 'No visits';

      return [
        (idx + 1).toString(),
        `${client.displayName}\n(@${client.userId})`,
        `${phone}\nDOB: ${dob}`,
        `${planName}\n(${status})`,
        visitsCount.toString(),
        durationStr,
        lastVisit
      ];
    });

    autoTable(doc, {
      startY: 51,
      head: [
        [
          '#',
          'Member Name & ID',
          'Contact & DOB',
          'Membership Plan',
          'Visits',
          'Total Hours',
          'Last Visit'
        ]
      ],
      body: tableRows.length > 0 ? tableRows : [['-', 'No members found', '', '', '', '', '']],
      theme: 'grid',
      headStyles: {
        fillColor: [2, 132, 199],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
        valign: 'middle',
        cellPadding: 2.5
      },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        cellPadding: 2.2,
        valign: 'middle'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 36, fontStyle: 'bold' },
        2: { cellWidth: 32 },
        3: { cellWidth: 30 },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 26, fontStyle: 'bold' },
        6: { cellWidth: 34 }
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const pageNumber = data.pageNumber;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(mutedSlate[0], mutedSlate[1], mutedSlate[2]);

        doc.text(
          `Page ${pageNumber} of ${pageCount} • Bulk Attendance Report • Torrent Fitness Gym Operations`,
          14,
          290
        );

        doc.text(
          'Master Admin Export',
          196,
          290,
          { align: 'right' }
        );
      }
    });

    const cleanDateStr = now.toISOString().split('T')[0];
    doc.save(`TorrentFitness_All_Members_Attendance_${cleanDateStr}.pdf`);
    return true;
  } catch (err) {
    console.error('Failed to export Bulk Attendance PDF:', err);
    throw err;
  }
};

export interface MultipleAttendancePdfOptions {
  clients: ClientProfile[];
  users: UserAccount[];
  attendanceRecords: AttendanceRecord[];
  filterLabel: string;
  gymName?: string;
}

/**
 * Generates and downloads a combined PDF report for multiple selected clients.
 */
export const exportMultipleAttendancePdf = async ({
  clients,
  users,
  attendanceRecords,
  filterLabel,
  gymName = 'TORRENT FITNESS'
}: MultipleAttendancePdfOptions): Promise<boolean> => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    // Document Header Bar
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setFillColor(2, 132, 199);
    doc.rect(0, 27, 210, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(gymName.toUpperCase(), 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(186, 230, 253);
    doc.text('SELECTED CLIENTS ATTENDANCE & SESSION REPORT', 14, 19);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${formattedDate} at ${formattedTime} | Selected Clients: ${clients.length} | Scope: ${filterLabel}`, 14, 24);

    // Summary KPI Block
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 33, 182, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Selected Clients: ${clients.length}`, 18, 41.5);
    doc.text(`Scope: ${filterLabel}`, 90, 41.5);

    const clientIds = clients.map(c => c.userId);
    const filteredRecords = attendanceRecords.filter(a => clientIds.includes(a.clientId));

    const tableRows = filteredRecords.map((rec, idx) => {
      const clientObj = clients.find(c => c.userId === rec.clientId);
      const name = clientObj?.displayName || rec.clientName || 'Member';
      let dateDisplay = rec.entryDate;
      try {
        const d = new Date(rec.entryDate + 'T12:00:00');
        dateDisplay = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch (e) {}

      const checkIn = rec.entryTime || '--:--';
      const checkOut = rec.exitTime || (rec.sessionStatus === 'active' ? 'Active On-Floor' : 'Closed');
      const durMins = rec.sessionDurationMinutes || 90;
      const h = Math.floor(durMins / 60);
      const m = durMins % 60;
      const durStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

      return [
        (idx + 1).toString(),
        name,
        dateDisplay,
        checkIn,
        checkOut,
        durStr,
        rec.sessionStatus.toUpperCase()
      ];
    });

    autoTable(doc, {
      startY: 51,
      head: [
        [
          '#',
          'Client Name',
          'Date',
          'Check-in',
          'Check-out',
          'Duration',
          'Status'
        ]
      ],
      body: tableRows.length > 0 ? tableRows : [['-', 'No attendance records found for selected clients.', '', '', '', '', '']],
      theme: 'grid',
      headStyles: {
        fillColor: [2, 132, 199],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 2.5
      },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        textColor: [30, 41, 59],
        cellPadding: 2.2
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Page ${data.pageNumber} of ${pageCount} • Selected Clients Attendance • Torrent Fitness`, 14, 290);
      }
    });

    const cleanDateStr = now.toISOString().split('T')[0];
    doc.save(`TorrentFitness_Selected_Clients_Attendance_${cleanDateStr}.pdf`);
    return true;
  } catch (err) {
    console.error('Failed to export multiple attendance PDF:', err);
    throw err;
  }
};

export interface PaymentLedgerExportItem {
  id: string;
  receiptNumber: string;
  referenceId: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  planName: string;
  validityPeriod: string;
  paymentModeLabel: string;
  paymentModeType: 'online' | 'cash';
  timestamp: string;
  rawDate: string;
  originalPrice: number;
  couponCode: string;
  discountPercent?: number;
  discountAmount: number;
  finalAmount: number;
  status: string;
  verificationStatus?: string;
  gymGst?: string;
  gymAddress?: string;
}

/**
 * Helper to cleanly format validity period dates (DD MMM YYYY to DD MMM YYYY)
 * strictly without Unicode arrows, stray quotes, exclamation marks or corrupted characters.
 */
export function formatCleanValidityDates(raw?: string): string {
  if (!raw) return 'Active Term';
  const sanitized = String(raw).replace(/[!'"\u2192]/g, ' ').replace(/\s+/g, ' ').trim();
  const dateMatches = sanitized.match(/\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4}/g);
  if (dateMatches && dateMatches.length >= 2) {
    const d1 = new Date(dateMatches[0]);
    const d2 = new Date(dateMatches[1]);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      const f1 = d1.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const f2 = d2.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${f1} to ${f2}`;
    }
  }
  return sanitized.replace(/\s*to\s*/i, ' to ');
}

/**
 * 1. SINGLE MEMBER DOWNLOAD: Professional, High-End Official Payment Invoice / Receipt PDF
 */
export const exportSinglePaymentInvoicePdf = async (
  item: PaymentLedgerExportItem,
  gymName = 'TORRENT FITNESS CLUB'
): Promise<boolean> => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const now = new Date();
    const generatedAt = `${now.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;

    const gymAddress =
      item.gymAddress || 'Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001';
    const gymEmail = 'billing@torrentfitness.club';
    const gymPhone = '+91 8208002585';
    const clientEmail =
      item.clientEmail || `${item.clientId.toLowerCase().replace(/[^a-z0-9]/g, '')}@torrentfitness.club`;

    // 1. TOP EXECUTIVE HEADER BANNER (Deep Slate Luxury Bar)
    doc.setFillColor(15, 23, 42); // #0F172A
    doc.rect(0, 0, 210, 48, 'F');

    // Accent line: Emerald Green
    doc.setFillColor(16, 185, 129); // #10B981
    doc.rect(0, 46.8, 210, 1.2, 'F');

    // High-Resolution Circular Brand Logo
    const logoBase64 = await getBrandLogoBase64();
    let textStartX = 14;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 5, 16, 16);
        textStartX = 34;
      } catch (err) {
        console.warn('Could not render logo in PDF invoice:', err);
      }
    }

    // Top Row: Left side displays Gym Logo + Gym Name ("TORRENT FITNESS CLUB") + Tagline ("BE MORE DO MORE")
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.text(gymName.toUpperCase(), textStartX, 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(52, 211, 153); // #34D399 (Emerald)
    doc.text('BE MORE DO MORE', textStartX, 17.5);

    // Top Row: Right side displays "OFFICIAL INVOICE & RECEIPT" + "ORIGINAL FOR RECIPIENT"
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(255, 255, 255);
    doc.text('OFFICIAL INVOICE & RECEIPT', 196, 12, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(186, 230, 253);
    doc.text('ORIGINAL FOR RECIPIENT', 196, 17, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(148, 163, 184);
    doc.text(`Invoice Ref: ${item.receiptNumber}`, 196, 22, { align: 'right' });

    // Subtle divider line between Top Row and Address Row
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.25);
    doc.line(14, 25, 196, 25);

    // Next Row: Print full Address clearly on its own line with distinct margin-top / Y-offset
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(226, 232, 240); // #E2E8F0
    doc.text(gymAddress, 14, 31, { maxWidth: 182 });

    // Next Row: Official Billing Email & Official Gym Phone
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(148, 163, 184); // #94A3B8
    doc.text(`Email: ${gymEmail}  |  Phone: ${gymPhone}`, 14, 39);

    // 2. METADATA 2-COLUMN LUXURY BOX
    const metaY = 52;
    // Left Box: Invoice & Transaction Details
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, metaY, 88, 36, 2.5, 2.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('INVOICE METADATA', 20, metaY + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Invoice Number:', 20, metaY + 13.5);
    doc.text('Date & Time:', 20, metaY + 19.5);
    doc.text('Payment Mode:', 20, metaY + 25.5);
    doc.text('Transaction ID:', 20, metaY + 31.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`INV-${item.receiptNumber}`, 50, metaY + 13.5);
    doc.text(`${item.timestamp || generatedAt}`, 50, metaY + 19.5);
    doc.text(`${item.paymentModeLabel}`, 50, metaY + 25.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`${item.referenceId}`, 50, metaY + 31.5);

    // Right Box: Billed Member Details
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(108, metaY, 88, 36, 2.5, 2.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('BILLED TO (MEMBER)', 114, metaY + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Member Name:', 114, metaY + 13.5);
    doc.text('Client ID:', 114, metaY + 19.5);
    doc.text('Contact Phone:', 114, metaY + 25.5);
    doc.text('Member Email:', 114, metaY + 31.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${item.clientName}`, 142, metaY + 13.5);
    doc.text(`@${item.clientId}`, 142, metaY + 19.5);
    doc.text(`${item.clientPhone || 'Verified Member'}`, 142, metaY + 25.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`${clientEmail}`, 142, metaY + 31.5);

    // 3. ITEMIZED BREAKDOWN TABLE
    autoTable(doc, {
      startY: 93,
      head: [
        [
          'Plan / Service Purchased',
          'Validity Period',
          'Base MRP',
          'Coupon Applied',
          'Discount',
          'Total Paid'
        ]
      ],
      body: [
        [
          item.planName,
          formatCleanValidityDates(item.validityPeriod),
          `Rs. ${item.originalPrice.toLocaleString('en-IN')}`,
          item.couponCode && item.couponCode !== 'NONE' ? item.couponCode : 'None',
          item.discountAmount > 0
            ? `- Rs. ${item.discountAmount.toLocaleString('en-IN')}`
            : 'Rs. 0',
          `Rs. ${item.finalAmount.toLocaleString('en-IN')}`
        ]
      ],
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        cellPadding: 4
      },
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: [15, 23, 42],
        cellPadding: 4,
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 36 },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 26, halign: 'center' },
        4: { cellWidth: 24, halign: 'right', textColor: [16, 185, 129] },
        5: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;

    // 4. SUMMARY & VERIFIED STAMP AREA
    // Left Box: Official "PAID" Stamp Badge & Note
    doc.setFillColor(240, 253, 244); // #F0FDF4
    doc.setDrawColor(187, 247, 208); // #BBF7D0
    doc.roundedRect(14, finalY, 88, 40, 2.5, 2.5, 'FD');

    // Emerald Green Verified Stamp (Clean ASCII "PAID" - strictly no corrupted quotes)
    doc.setFillColor(16, 185, 129); // #10B981
    doc.roundedRect(20, finalY + 8, 38, 14, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('PAID', 39, finalY + 17, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(22, 101, 52);
    doc.text('PAYMENT VERIFIED', 62, finalY + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(21, 128, 61);
    doc.text('Authorized & Settled', 62, finalY + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Thank you for training with Torrent Fitness Club!', 20, finalY + 30);
    doc.text('Your membership is active and recognized across turnstiles.', 20, finalY + 35);

    // Right Box: Financial Totals Breakdown
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(108, finalY, 88, 44, 2.5, 2.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Base Plan MRP:', 114, finalY + 8);
    doc.text(`Rs. ${item.originalPrice.toLocaleString('en-IN')}`, 190, finalY + 8, { align: 'right' });

    // Format clean coupon label to prevent any possible collision with the right amount column
    const rawCoupon = (item.couponCode || 'None').trim();
    const cleanCouponCode = rawCoupon.replace(/\s*\([^)]*\)/g, '').trim();
    const couponLabel = cleanCouponCode && cleanCouponCode !== 'None'
      ? (cleanCouponCode.length > 15 ? `Coupon (${cleanCouponCode.slice(0, 13)}..):` : `Coupon (${cleanCouponCode}):`)
      : 'Coupon Discount:';

    doc.text(couponLabel, 114, finalY + 15, { maxWidth: 44 });
    doc.setTextColor(16, 185, 129);
    doc.text(
      item.discountAmount > 0 ? `- Rs. ${item.discountAmount.toLocaleString('en-IN')}` : 'Rs. 0',
      190,
      finalY + 15,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Payment Status:', 114, finalY + 22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text('Settled & Verified', 190, finalY + 22, { align: 'right' });

    doc.setDrawColor(203, 213, 225);
    doc.line(114, finalY + 27, 190, finalY + 27);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Total Amount Paid:', 114, finalY + 36);
    doc.setTextColor(16, 185, 129);
    doc.text(`Rs. ${item.finalAmount.toLocaleString('en-IN')}`, 190, finalY + 36, { align: 'right' });

    // 5. DIGITAL SIGNATURE & AUTHORIZED SEAL
    const signY = finalY + 50;
    doc.setDrawColor(226, 232, 240);
    doc.line(14, signY, 196, signY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Terms & Conditions:', 14, signY + 6);
    doc.text('• Memberships and personal training bookings are non-refundable and non-transferable.', 14, signY + 10);
    doc.text('• Please present your digital member QR code at reception turnstiles upon every entry.', 14, signY + 14);

    // Digital Signature Line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Torrent Fitness Club', 196, signY + 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(16, 185, 129);
    doc.text('Authorized Digital Signatory', 196, signY + 15, { align: 'right' });

    // 6. BOTTOM FOOTER MICRO TEXT
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Official Computer Generated Payment Receipt & Invoice • Generated on ${generatedAt} • ${gymName}`,
      105,
      286,
      { align: 'center' }
    );

    const safeName = item.clientName.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`TorrentFitness_Invoice_${safeName}_${item.receiptNumber}.pdf`);
    return true;
  } catch (err) {
    console.error('Failed to export single payment invoice PDF:', err);
    throw err;
  }
};

/**
 * 2. SELECTIVE / MULTI-DOWNLOAD & 3. MASTER BULK EXPORT:
 * Shared engine for generating Landscape A4 Executive Payment Ledger PDFs
 */
const generateLedgerTablePdf = async (
  items: PaymentLedgerExportItem[],
  reportTitle: string,
  scopeSubtitle: string,
  fileNamePrefix: string,
  gymName = 'TORRENT FITNESS'
): Promise<boolean> => {
  try {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Header Bar (Landscape 297mm wide)
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 30, 'F');
    doc.setFillColor(2, 132, 199);
    doc.rect(0, 29, 297, 1.5, 'F');

    // Brand Logo
    const logoBase64 = await getBrandLogoBase64();
    let textStartX = 14;
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 4, 22, 22);
        textStartX = 40;
      } catch (err) {
        console.warn('Could not render logo in ledger report PDF:', err);
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(gymName.toUpperCase(), textStartX, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(186, 230, 253);
    doc.text(reportTitle.toUpperCase(), textStartX, 18.5);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${formattedDate} at ${formattedTime}  |  ${scopeSubtitle}`, textStartX, 24);

    // KPI Calculations
    const settledItems = items.filter(
      i => i.status.toLowerCase() === 'success' || i.status.toLowerCase() === 'active'
    );
    const totalNetCollected = settledItems.reduce((acc, i) => acc + i.finalAmount, 0);
    const totalDiscounts = settledItems.reduce((acc, i) => acc + i.discountAmount, 0);
    const onlineRevenue = settledItems
      .filter(i => i.paymentModeType === 'online')
      .reduce((acc, i) => acc + i.finalAmount, 0);
    const offlineCashRevenue = settledItems
      .filter(i => i.paymentModeType === 'cash')
      .reduce((acc, i) => acc + i.finalAmount, 0);

    // Summary KPI Bar
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 32, 269, 13, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Records Exported: ${items.length}`, 19, 40);

    doc.setTextColor(2, 132, 199);
    doc.text(`Net Settled Revenue: Rs. ${totalNetCollected.toLocaleString('en-IN')}`, 68, 40);

    doc.setTextColor(79, 70, 229);
    doc.text(`Online Gateways: Rs. ${onlineRevenue.toLocaleString('en-IN')}`, 140, 40);

    doc.setTextColor(16, 185, 129);
    doc.text(`Offline Cash Approved: Rs. ${offlineCashRevenue.toLocaleString('en-IN')}`, 202, 40);

    doc.setTextColor(225, 29, 72);
    doc.text(`Discounts: Rs. ${totalDiscounts.toLocaleString('en-IN')}`, 255, 40);

    const tableRows = items.map((item, idx) => [
      (idx + 1).toString(),
      `${item.clientName}\n(@${item.clientId})`,
      `${item.planName}\n${formatCleanValidityDates(item.validityPeriod)}`,
      item.paymentModeLabel,
      item.timestamp,
      `Rs. ${item.originalPrice.toLocaleString('en-IN')}`,
      item.couponCode || '—',
      item.discountAmount > 0 ? `- Rs. ${item.discountAmount.toLocaleString('en-IN')}` : 'Rs. 0',
      `Rs. ${item.finalAmount.toLocaleString('en-IN')}`,
      `${item.referenceId}\n[${item.status.toUpperCase()}]`
    ]);

    autoTable(doc, {
      startY: 49,
      head: [
        [
          '#',
          'Member Name & Client ID',
          'Plan Chosen & Validity Period',
          'Payment Mode',
          'Exact Timestamp',
          'Original Price',
          'Coupon',
          'Discount',
          'Final Paid',
          'Ref ID & Status'
        ]
      ],
      body:
        tableRows.length > 0
          ? tableRows
          : [['-', 'No transactions match the selected filter criteria.', '', '', '', '', '', '', '', '']],
      theme: 'grid',
      headStyles: {
        fillColor: [2, 132, 199],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 2.5,
        valign: 'middle'
      },
      styles: {
        font: 'helvetica',
        fontSize: 7,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        cellPadding: 2.2,
        valign: 'middle'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 38, fontStyle: 'bold' },
        2: { cellWidth: 46 },
        3: { cellWidth: 36 },
        4: { cellWidth: 30 },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 18, halign: 'center' },
        7: { cellWidth: 20, halign: 'right', textColor: [16, 185, 129] },
        8: { cellWidth: 23, halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199] },
        9: { cellWidth: 28 }
      },
      didDrawPage: (data) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount} • Official Financial Ledger Export • ${gymName}`,
          14,
          203
        );
        doc.text('Confidential Financial Record', 283, 203, { align: 'right' });
      }
    });

    const cleanDateStr = now.toISOString().split('T')[0];
    doc.save(`${fileNamePrefix}_${cleanDateStr}.pdf`);
    return true;
  } catch (err) {
    console.error('Failed to export ledger PDF:', err);
    throw err;
  }
};

export const exportSelectedPaymentsLedgerPdf = async (
  items: PaymentLedgerExportItem[],
  gymName = 'TORRENT FITNESS'
): Promise<boolean> => {
  return generateLedgerTablePdf(
    items,
    'SELECTED PAYMENTS SUMMARY & FINANCIAL LEDGER',
    `Selective Multi-Download (${items.length} Selected Transactions)`,
    'TorrentFitness_Selected_Payments_Summary',
    gymName
  );
};

export const exportBulkPaymentsLedgerPdf = async (
  items: PaymentLedgerExportItem[],
  dateRangeLabel: string,
  gymName = 'TORRENT FITNESS'
): Promise<boolean> => {
  return generateLedgerTablePdf(
    items,
    'MASTER PAYMENT LEDGER & FINANCIAL AUDIT REPORT',
    `Date Filter Scope: ${dateRangeLabel} (${items.length} Transactions)`,
    'TorrentFitness_Master_Payment_Ledger',
    gymName
  );
};



