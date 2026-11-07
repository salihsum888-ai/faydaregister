"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Registration, RegistrationStatus, UserProfile } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Search,
  Filter,
  Trash2,
  FileDigit,
  Calendar,
  User,
  Phone,
  MapPin,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  FileText,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  RefreshCcw,
  X,
  Target,
  Activity,
  Plus,
  Eye,
  Copy,
  Check,
  SquarePen,
  Building2,
  AlertTriangle,
  AlertCircle,
  Clock,
  RotateCcw,
  ScanLine,
  Camera,
  Keyboard,
} from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/status-badge';
import {
  format,
  isWithinInterval,
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
} from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { RegistrationFormModal } from './registration-form-modal';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import {
  deleteDocumentNonBlocking,
  updateDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { logAuditAction } from '@/lib/audit';
import { cn } from '@/lib/utils';

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TablePagination } from '@/components/ui/table-pagination';

interface RegistrationsListProps {
  initialRegistrations: Registration[];
}

type SortKey = keyof Registration;
type SortDirection = 'asc' | 'desc';
type DatePreset = 'all' | 'today' | '7d' | 'month' | 'custom';

const PRESET_REASONS = [
  'Duplicate Biometric Entry',
  'Blurry Document Scan',
  'Invalid 29-Digit RID',
  'Biometric Mismatch',
  'Network Timeout During Sync',
  'Incomplete Applicant Data',
];

function getInstitutionLabel(reg: Registration): string {
  return (reg.institutionName || reg.schoolName || '').trim();
}

function calcExactRate(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

export function RegistrationsList({ initialRegistrations }: RegistrationsListProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<string>('ALL');
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
    key: 'submissionDate',
    direction: 'desc',
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isConfirmBulkDeleteDialogOpen, setIsConfirmBulkDeleteDialogOpen] = useState(false);

  // Inline & Bulk Status Reason Modal state
  const [isUpdatingStatusId, setIsUpdatingStatusId] = useState<string | null>(null);
  const [pendingStatusAction, setPendingStatusAction] = useState<{
    mode: 'single' | 'bulk';
    record?: Registration;
    newStatus: RegistrationStatus;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const itemsPerPage = 8;
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [registrationToDelete, setRegistrationToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [viewingRegistration, setViewingRegistration] = useState<Registration | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Step 3: 29-Digit RID Slip / Camera Scanner Modal state
  const [isRidScannerOpen, setIsRidScannerOpen] = useState(false);
  const [scannerTextInput, setScannerTextInput] = useState('');
  const [isCameraScanning, setIsCameraScanning] = useState(false);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);

  const stopScannerCamera = () => {
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((t) => t.stop());
      scannerStreamRef.current = null;
    }
    setIsCameraScanning(false);
  };

  const startScannerCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      scannerStreamRef.current = stream;
      setIsCameraScanning(true);
      setTimeout(() => {
        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = stream;
          scannerVideoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Camera Unavailable',
        description: 'Could not access camera. Paste or type the 29-digit slip text below instead.',
      });
    }
  };

  useEffect(() => {
    if (!isRidScannerOpen) {
      stopScannerCamera();
    }
  }, [isRidScannerOpen]);

  const extracted29DigitRids = useMemo(() => {
    const matches = scannerTextInput.replace(/\s+/g, '').match(/\d{29}/g);
    return matches ? Array.from(new Set(matches)) : [];
  }, [scannerTextInput]);

  const handleApplyScannedRid = (rid: string) => {
    setSearch(rid);
    setCurrentPage(1);
    setIsRidScannerOpen(false);
    const exactMatch = initialRegistrations.find((r) => (r.id || '').trim() === rid.trim());
    if (exactMatch) {
      setViewingRegistration(exactMatch);
      toast({
        title: '29-Digit RID Located',
        description: `Opened record for ${exactMatch.applicantName}.`,
      });
    } else {
      toast({
        title: 'Filtered by 29-Digit RID',
        description: `Applied search filter for RID ${rid}.`,
      });
    }
  };

  const handleCopyRid = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    toast({
      title: 'RID Copied',
      description: `Registration ID ${id} copied to clipboard.`,
    });
  };

  // Discover unique institution names for the Origin / Institution filter & Add modal
  const existingInstitutionNames = useMemo(() => {
    const namesMap = new Map<string, string>();
    initialRegistrations.forEach((r) => {
      const inst = getInstitutionLabel(r);
      if (inst) {
        const key = inst.toLowerCase();
        if (!namesMap.has(key)) namesMap.set(key, inst);
      }
    });
    return Array.from(namesMap.values()).sort((a, b) => a.localeCompare(b));
  }, [initialRegistrations]);

  // Duplicate 29-Digit RID detection ONLY (many citizens/family members can share the same phone number, so phone numbers are NEVER flagged as duplicates)
  const duplicateTracker = useMemo(() => {
    const ridCounts = new Map<string, number>();

    initialRegistrations.forEach((r) => {
      const cleanId = (r.id || '').trim();
      if (cleanId) {
        ridCounts.set(cleanId, (ridCounts.get(cleanId) || 0) + 1);
      }
    });

    const duplicateRecordIds = new Set<string>();
    const duplicateReasonById = new Map<string, string>();

    initialRegistrations.forEach((r) => {
      const cleanId = (r.id || '').trim();
      const dupId = cleanId.length > 0 && (ridCounts.get(cleanId) || 0) > 1;

      if (dupId) {
        duplicateRecordIds.add(r.id);
        duplicateReasonById.set(r.id, `Duplicate 29-Digit RID (${ridCounts.get(cleanId)}x)`);
      }
    });

    return {
      duplicateRecordIds,
      duplicateReasonById,
      totalDuplicates: duplicateRecordIds.size,
    };
  }, [initialRegistrations]);

  // Base filtered records (by search, origin/institution, date range, duplicate toggle — before status card click)
  const baseScopedRegistrations = useMemo(() => {
    return initialRegistrations.filter((reg) => {
      const instName = getInstitutionLabel(reg);
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        reg.applicantName.toLowerCase().includes(q) ||
        reg.id.toLowerCase().includes(q) ||
        (reg.phone || '').toLowerCase().includes(q) ||
        (reg.location || '').toLowerCase().includes(q) ||
        (reg.rejectionReason || '').toLowerCase().includes(q) ||
        instName.toLowerCase().includes(q);

      let matchesOrigin = true;
      if (originFilter === 'INDIVIDUAL_ONLY') {
        matchesOrigin = instName.length === 0 && !reg.isSchoolRegistration;
      } else if (originFilter === 'INSTITUTION_ONLY') {
        matchesOrigin = instName.length > 0 || Boolean(reg.isSchoolRegistration);
      } else if (originFilter.startsWith('INST:')) {
        const targetInst = originFilter.slice(5).toLowerCase();
        matchesOrigin = instName.toLowerCase() === targetInst;
      }

      let matchesDate = true;
      if (startDate || endDate) {
        try {
          const regDate = new Date(reg.submissionDate);
          const start = startDate ? startOfDay(new Date(startDate)) : new Date(0);
          const end = endDate ? endOfDay(new Date(endDate)) : new Date(8640000000000000);
          matchesDate = isWithinInterval(regDate, { start, end });
        } catch {
          matchesDate = true;
        }
      }

      const matchesDuplicate = !showDuplicatesOnly || duplicateTracker.duplicateRecordIds.has(reg.id);

      return matchesSearch && matchesOrigin && matchesDate && matchesDuplicate;
    });
  }, [initialRegistrations, search, originFilter, startDate, endDate, showDuplicatesOnly, duplicateTracker]);

  // Exact 5-Status Aggregates & Exact 2-Decimal Rates computed over baseScopedRegistrations
  const pulseStats = useMemo(() => {
    const processed = baseScopedRegistrations.filter((r) => r.status === 'Processed').length;
    const processing = baseScopedRegistrations.filter(
      (r) => r.status === 'Processing' || r.status === 'Pending Review'
    ).length;
    const rejected = baseScopedRegistrations.filter((r) => r.status === 'Rejected').length;
    const failed = baseScopedRegistrations.filter((r) => r.status === 'Failed').length;
    const exactTotal = processed + processing + rejected + failed;

    return {
      total: exactTotal,
      processed,
      processing,
      rejected,
      failed,
      successRate: calcExactRate(processed, exactTotal),
      processingRate: calcExactRate(processing, exactTotal),
      rejectionRate: calcExactRate(rejected, exactTotal),
      failedRate: calcExactRate(failed, exactTotal),
    };
  }, [baseScopedRegistrations]);

  // Apply Status Filter on top of baseScopedRegistrations
  const filteredRegistrations = useMemo(() => {
    if (statusFilter === 'all') return baseScopedRegistrations;
    return baseScopedRegistrations.filter((reg) => {
      if (statusFilter === 'Processing_Active') {
        return reg.status === 'Processing' || reg.status === 'Pending Review';
      }
      return reg.status === statusFilter;
    });
  }, [baseScopedRegistrations, statusFilter]);

  const sortedRegistrations = useMemo(() => {
    if (!sortConfig) return filteredRegistrations;

    const sorted = [...filteredRegistrations].sort((a, b) => {
      if (sortConfig.key === 'submissionDate') {
        const timeA = new Date(a.submissionDate).getTime();
        const timeB = new Date(b.submissionDate).getTime();
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
      }
      if (sortConfig.key === 'institutionName') {
        const instA = getInstitutionLabel(a);
        const instB = getInstitutionLabel(b);
        return sortConfig.direction === 'asc'
          ? instA.localeCompare(instB)
          : instB.localeCompare(instA);
      }
      const aValue = String(a[sortConfig.key] || '');
      const bValue = String(b[sortConfig.key] || '');
      return sortConfig.direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });
    return sorted;
  }, [filteredRegistrations, sortConfig]);

  const totalPages = Math.ceil(sortedRegistrations.length / itemsPerPage);
  const currentItems = sortedRegistrations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const allOnPageSelected =
    currentItems.length > 0 && currentItems.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      currentItems.forEach((r) => next.delete(r.id));
    } else {
      currentItems.forEach((r) => next.add(r.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Date Preset Handler
  const applyDatePreset = (preset: DatePreset) => {
    const now = new Date();
    setDatePreset(preset);
    setCurrentPage(1);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      const todayStr = format(now, 'yyyy-MM-dd');
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7d') {
      setStartDate(format(subDays(now, 6), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    } else if (preset === 'month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    }
  };

  // Single-Row Inline Status Change
  const commitSingleStatusChange = (
    record: Registration,
    newStatus: RegistrationStatus,
    reasonText?: string
  ) => {
    if (!db || !user) return;
    setIsUpdatingStatusId(record.id);

    const payload: Record<string, any> = {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    if (newStatus === 'Rejected' || newStatus === 'Failed') {
      payload.rejectionReason = (reasonText || '').trim() || `Marked as ${newStatus}`;
    } else {
      payload.rejectionReason = '';
    }

    updateDocumentNonBlocking(doc(db, 'registrations', record.id), payload);

    if (profile) {
      logAuditAction(
        db,
        user,
        profile.fullName,
        'STATUS_UPDATE',
        record.id,
        `Full Record Ledger: Updated ${record.applicantName} status to ${newStatus}${
          payload.rejectionReason ? ` (${payload.rejectionReason})` : ''
        }.`
      );
    }

    toast({
      title: `Status Updated to ${newStatus}`,
      description: `${record.applicantName} synchronized to ${newStatus}.`,
    });

    setTimeout(() => setIsUpdatingStatusId(null), 400);
  };

  const handleRowStatusSelect = (record: Registration, newStatus: RegistrationStatus) => {
    if (record.status === newStatus) return;
    if (newStatus === 'Rejected' || newStatus === 'Failed') {
      setReasonInput(record.rejectionReason || '');
      setPendingStatusAction({ mode: 'single', record, newStatus });
      return;
    }
    commitSingleStatusChange(record, newStatus);
  };

  // Bulk Status Update (supports Processed, Processing, Rejected, Failed)
  const executeBulkStatusUpdate = async (
    newStatus: RegistrationStatus,
    reasonText?: string
  ) => {
    if (!db || selectedIds.size === 0 || !user || !profile) return;

    setIsBulkProcessing(true);
    const batch = writeBatch(db);
    const count = selectedIds.size;
    const updatedAt = new Date().toISOString();
    const resolvedReason =
      newStatus === 'Rejected' || newStatus === 'Failed'
        ? (reasonText || '').trim() || `Bulk marked as ${newStatus}`
        : '';

    selectedIds.forEach((id) => {
      batch.update(doc(db, 'registrations', id), {
        status: newStatus,
        rejectionReason: resolvedReason,
        updatedAt,
      });
    });

    try {
      await batch.commit();

      logAuditAction(
        db,
        user,
        profile.fullName,
        'STATUS_UPDATE',
        'bulk_operation',
        `Bulk Triage: Updated ${count} records to ${newStatus}${
          resolvedReason ? ` — Reason: ${resolvedReason}` : ''
        }.`
      );

      toast({
        title: 'Bulk Triage Complete',
        description: `Successfully synchronized ${count} records to ${newStatus}.`,
      });
      setSelectedIds(new Set());
    } catch {
      toast({
        variant: 'destructive',
        title: 'Bulk Update Failed',
        description: 'Protocol error during mass status synchronization.',
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkStatusTrigger = (newStatus: RegistrationStatus) => {
    if (selectedIds.size === 0) return;
    if (newStatus === 'Rejected' || newStatus === 'Failed') {
      setReasonInput('');
      setPendingStatusAction({ mode: 'bulk', newStatus });
      return;
    }
    executeBulkStatusUpdate(newStatus);
  };

  const handleConfirmReasonModal = async () => {
    if (!pendingStatusAction) return;
    const { mode, record, newStatus } = pendingStatusAction;
    setPendingStatusAction(null);
    if (mode === 'single' && record) {
      commitSingleStatusChange(record, newStatus, reasonInput);
    } else if (mode === 'bulk') {
      await executeBulkStatusUpdate(newStatus, reasonInput);
    }
    setReasonInput('');
  };

  const handleBulkDelete = async () => {
    if (!db || selectedIds.size === 0 || !user || !profile) return;

    setIsBulkProcessing(true);
    const batch = writeBatch(db);
    const count = selectedIds.size;

    selectedIds.forEach((id) => {
      batch.delete(doc(db, 'registrations', id));
    });

    try {
      await batch.commit();

      logAuditAction(
        db,
        user,
        profile.fullName,
        'RECORD_DELETED',
        'bulk_operation',
        `Bulk Registry Purge: Permanently removed ${count} records.`
      );

      toast({
        title: 'Registry Purged',
        description: `Successfully removed ${count} records from the active ledger.`,
        variant: 'destructive',
      });
      setSelectedIds(new Set());
      setIsConfirmBulkDeleteDialogOpen(false);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Purge Failed',
        description: 'Clearance error during mass record deletion.',
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const getSortIcon = (key: SortKey) => {
    if (sortConfig?.key !== key)
      return (
        <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-30 group-hover:opacity-70 transition-opacity" />
      );
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-primary" />
    ) : (
      <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-primary" />
    );
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setOriginFilter('ALL');
    setShowDuplicatesOnly(false);
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
    setSortConfig({ key: 'submissionDate', direction: 'desc' });
  };

  const confirmDelete = async () => {
    if (!db || !registrationToDelete) return;

    setIsDeleting(true);
    try {
      deleteDocumentNonBlocking(doc(db, 'registrations', registrationToDelete.id));
      toast({
        title: 'Record Purged',
        description: `Successfully removed ${registrationToDelete.name} from the bureau registry.`,
        variant: 'destructive',
      });
      setIsDeleteDialogOpen(false);
    } catch {
      toast({
        title: 'Purge Failed',
        description: 'An error occurred while removing the record.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setRegistrationToDelete(null);
    }
  };

  const handleExportExcel = () => {
    if (filteredRegistrations.length === 0) {
      toast({
        title: 'Export Failed',
        description: 'No data available to export.',
        variant: 'destructive',
      });
      return;
    }
    const exportData = filteredRegistrations.map((reg, idx) => ({
      'No.': idx + 1,
      'Registration ID (29-Digit)': reg.id,
      'Applicant Name': reg.applicantName,
      'Origin / Institution': getInstitutionLabel(reg) || 'Individual Walk-In',
      'Submission Date': reg.submissionDate
        ? format(new Date(reg.submissionDate), 'yyyy-MM-dd HH:mm')
        : 'N/A',
      Status: reg.status === 'Pending Review' ? 'Processing' : reg.status,
      'Rejection / Failure Reason': reg.rejectionReason || 'N/A',
      Phone: reg.phone,
      Location: reg.location,
      Remarks: reg.remarks || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
    XLSX.writeFile(wb, `Bureau_Registrations_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    toast({
      title: 'Excel Export Complete',
      description: `Exported ${filteredRegistrations.length} records with institution and reason details.`,
    });
  };

  const handleExportPDF = () => {
    if (filteredRegistrations.length === 0) {
      toast({
        title: 'Export Failed',
        description: 'No data available to export.',
        variant: 'destructive',
      });
      return;
    }
    const docPdf = new jsPDF('l', 'mm', 'a4');
    docPdf.setFontSize(15);
    docPdf.text('Registration Bureau Official Full Ledger', 14, 15);
    docPdf.setFontSize(9);
    docPdf.text(
      `Records: ${filteredRegistrations.length} | Success Rate: ${pulseStats.successRate}% | Processing Rate: ${pulseStats.processingRate}% | Rejection Rate: ${pulseStats.rejectionRate}% | Failed Rate: ${pulseStats.failedRate}%`,
      14,
      22
    );

    const tableRows = filteredRegistrations.map((reg, idx) => [
      String(idx + 1),
      reg.id,
      reg.applicantName,
      getInstitutionLabel(reg) || 'Individual',
      format(new Date(reg.submissionDate), 'yyyy-MM-dd'),
      reg.phone,
      reg.status === 'Pending Review' ? 'Processing' : reg.status,
      reg.rejectionReason || '-',
    ]);
    autoTable(docPdf, {
      startY: 28,
      head: [
        [
          '#',
          '29-Digit Reg ID',
          'Applicant Name',
          'Origin / Institution',
          'Date',
          'Phone',
          'Status',
          'Reason / Detail',
        ],
      ],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
    });
    docPdf.save(`Bureau_Registrations_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    toast({
      title: 'PDF Export Complete',
      description: 'Official ledger document has been generated.',
    });
  };

  return (
    <div className="space-y-6">
      {/* Row 1: 5 Interactive Click-to-Filter KPI & Exact Rate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <PulseCard
          label="Total Records"
          subtitle="Click to show all records"
          value={pulseStats.total}
          rateText="100%"
          fractionText={`${pulseStats.total.toLocaleString()} / ${pulseStats.total.toLocaleString()}`}
          ringScore={100}
          ringColor="#6366f1"
          icon={Target}
          iconBg="bg-indigo-600 text-white"
          active={statusFilter === 'all'}
          onClick={() => {
            setStatusFilter('all');
            setCurrentPage(1);
          }}
        />
        <PulseCard
          label="Success Rate"
          subtitle="Processed Citizen IDs"
          value={pulseStats.processed}
          rateText={`${pulseStats.successRate}%`}
          fractionText={`${pulseStats.processed.toLocaleString()} / ${pulseStats.total.toLocaleString()}`}
          ringScore={pulseStats.successRate}
          ringColor="#10b981"
          icon={CheckCircle2}
          iconBg="bg-emerald-500 text-white"
          active={statusFilter === 'Processed'}
          onClick={() => {
            setStatusFilter((prev) => (prev === 'Processed' ? 'all' : 'Processed'));
            setCurrentPage(1);
          }}
        />
        <PulseCard
          label="Processing Rate"
          subtitle="Active Verification Queue"
          value={pulseStats.processing}
          rateText={`${pulseStats.processingRate}%`}
          fractionText={`${pulseStats.processing.toLocaleString()} / ${pulseStats.total.toLocaleString()}`}
          ringScore={pulseStats.processingRate}
          ringColor="#f59e0b"
          icon={Clock}
          iconBg="bg-amber-500 text-white"
          active={statusFilter === 'Processing_Active' || statusFilter === 'Processing'}
          onClick={() => {
            setStatusFilter((prev) =>
              prev === 'Processing_Active' ? 'all' : 'Processing_Active'
            );
            setCurrentPage(1);
          }}
        />
        <PulseCard
          label="Rejection Rate"
          subtitle="Protocol Rejections"
          value={pulseStats.rejected}
          rateText={`${pulseStats.rejectionRate}%`}
          fractionText={`${pulseStats.rejected.toLocaleString()} / ${pulseStats.total.toLocaleString()}`}
          ringScore={pulseStats.rejectionRate}
          ringColor="#ef4444"
          icon={ShieldAlert}
          iconBg="bg-rose-500 text-white"
          active={statusFilter === 'Rejected'}
          onClick={() => {
            setStatusFilter((prev) => (prev === 'Rejected' ? 'all' : 'Rejected'));
            setCurrentPage(1);
          }}
        />
        <PulseCard
          label="Failed Rate"
          subtitle="System / Sync Failures"
          value={pulseStats.failed}
          rateText={`${pulseStats.failedRate}%`}
          fractionText={`${pulseStats.failed.toLocaleString()} / ${pulseStats.total.toLocaleString()}`}
          ringScore={pulseStats.failedRate}
          ringColor="#64748b"
          icon={AlertCircle}
          iconBg="bg-slate-600 text-white"
          active={statusFilter === 'Failed'}
          onClick={() => {
            setStatusFilter((prev) => (prev === 'Failed' ? 'all' : 'Failed'));
            setCurrentPage(1);
          }}
        />
      </div>

      <Card className="p-4 sm:p-6 bg-card shadow-sm border-none rounded-2xl overflow-hidden relative">
        <div className="space-y-6">
          {/* Header & Primary Action Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-foreground font-headline">
                  Registration Ledger
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold tabular-nums">
                  {filteredRegistrations.length.toLocaleString()} Matching Records
                </span>
                {duplicateTracker.totalDuplicates > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDuplicatesOnly((prev) => !prev);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer border',
                      showDuplicatesOnly
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                    )}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {showDuplicatesOnly
                      ? `Showing ${duplicateTracker.totalDuplicates} Duplicate RIDs (Clear)`
                      : `${duplicateTracker.totalDuplicates} Duplicate 29-Digit RID Detected`}
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
                Exact Success: {pulseStats.successRate}% · Rejection: {pulseStats.rejectionRate}% · Processing: {pulseStats.processingRate}% · Failed: {pulseStats.failedRate}%
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {pulseStats.processing > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set('status', 'Processing');
                      if (originFilter.startsWith('INST:')) {
                        params.set('institution', originFilter.slice(5));
                      }
                      router.push(`/status-check?${params.toString()}`);
                    }}
                    className="flex-1 sm:flex-none border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-black text-[10px] uppercase tracking-widest h-11 bg-background"
                  >
                    <ShieldCheck className="mr-1.5 h-4 w-4" /> Verify Queue ({pulseStats.processing})
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setScannerTextInput('');
                    setIsRidScannerOpen(true);
                  }}
                  className="flex-1 sm:flex-none border-primary/30 text-primary hover:bg-primary/10 font-black text-[10px] uppercase tracking-widest h-11 bg-background"
                >
                  <ScanLine className="mr-1.5 h-4 w-4" /> Scan 29-Digit RID
                </Button>
                <Button
                  onClick={handleExportExcel}
                  variant="outline"
                  className="flex-1 sm:flex-none border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-black text-[10px] uppercase tracking-widest h-11 bg-background"
                >
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
                </Button>
                <Button
                  onClick={handleExportPDF}
                  variant="outline"
                  className="flex-1 sm:flex-none border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 font-black text-[10px] uppercase tracking-widest h-11 bg-background"
                >
                  <FileText className="mr-1.5 h-4 w-4" /> PDF
                </Button>
                <RegistrationFormModal
                  mode="add"
                  existingSchools={existingInstitutionNames}
                  defaultIsSchool={originFilter.startsWith('INST:') || originFilter === 'INSTITUTION_ONLY'}
                  defaultSchoolName={originFilter.startsWith('INST:') ? originFilter.slice(5) : ''}
                  trigger={
                    <Button className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-white font-black text-[10px] uppercase tracking-widest h-11 px-4 rounded-xl shadow-lg shadow-primary/10">
                      <Plus className="mr-1.5 h-4 w-4" /> Add Record
                    </Button>
                  }
                />
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                <Input
                  placeholder="Search Name, RID, Phone, Institution..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 h-11 bg-background border-border rounded-xl text-xs font-bold"
                />
              </div>
            </div>
          </div>

          {/* Filter Matrix with Origin/Institution Filter + Quick Date Presets */}
          <div className="p-5 bg-muted/20 rounded-2xl border border-dashed border-border space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">
                  Quick Horizon:
                </span>
                {(
                  [
                    { id: 'all', label: 'All Time' },
                    { id: 'today', label: 'Today' },
                    { id: '7d', label: 'Last 7 Days' },
                    { id: 'month', label: 'This Month' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyDatePreset(preset.id)}
                    className={cn(
                      'h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer',
                      datePreset === preset.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-background border border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {(statusFilter !== 'all' ||
                originFilter !== 'ALL' ||
                search.trim() !== '' ||
                startDate !== '' ||
                endDate !== '' ||
                showDuplicatesOnly) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-8 px-3 font-black text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10 rounded-lg"
                >
                  <RotateCcw className="mr-1.5 h-3 w-3" /> Reset All Filters
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 ml-1">
                  <Filter className="h-3 w-3" /> Status Gate
                </label>
                <Select
                  value={statusFilter}
                  onValueChange={(val) => {
                    setStatusFilter(val);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 bg-background border-border rounded-xl text-[10px] font-bold uppercase">
                    <SelectValue placeholder="All Records" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[10px] font-bold uppercase">
                      All Statuses ({pulseStats.total})
                    </SelectItem>
                    <SelectItem value="Processed" className="text-[10px] font-bold uppercase">
                      Processed ({pulseStats.processed})
                    </SelectItem>
                    <SelectItem
                      value="Processing_Active"
                      className="text-[10px] font-bold uppercase"
                    >
                      Processing ({pulseStats.processing})
                    </SelectItem>
                    <SelectItem value="Rejected" className="text-[10px] font-bold uppercase">
                      Rejected ({pulseStats.rejected})
                    </SelectItem>
                    <SelectItem value="Failed" className="text-[10px] font-bold uppercase">
                      Failed ({pulseStats.failed})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 ml-1">
                  <Building2 className="h-3 w-3" /> Origin / Institution
                </label>
                <Select
                  value={originFilter}
                  onValueChange={(val) => {
                    setOriginFilter(val);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 bg-background border-border rounded-xl text-[10px] font-bold uppercase">
                    <SelectValue placeholder="All Origins" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-[10px] font-bold uppercase">
                      All Records (Walk-In + Institutions)
                    </SelectItem>
                    <SelectItem value="INDIVIDUAL_ONLY" className="text-[10px] font-bold uppercase">
                      Individual / Walk-In Only
                    </SelectItem>
                    <SelectItem
                      value="INSTITUTION_ONLY"
                      className="text-[10px] font-bold uppercase"
                    >
                      All Institution Records Only
                    </SelectItem>
                    {existingInstitutionNames.map((inst) => (
                      <SelectItem
                        key={inst}
                        value={`INST:${inst}`}
                        className="text-[10px] font-bold"
                      >
                        Institution: {inst}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 ml-1">
                  <Calendar className="h-3 w-3" /> From Date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset('custom');
                    setCurrentPage(1);
                  }}
                  className="h-10 bg-background border-border rounded-xl text-[10px] font-bold uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 ml-1">
                  <Calendar className="h-3 w-3" /> To Date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset('custom');
                    setCurrentPage(1);
                  }}
                  className="h-10 bg-background border-border rounded-xl text-[10px] font-bold uppercase"
                />
              </div>
            </div>
          </div>

          {/* Data Table with Multi-Select Bulk Bar & Inline Status Dropdown */}
          <div className="rounded-2xl border border-border overflow-hidden shadow-sm relative min-h-[400px]">
            {selectedIds.size > 0 && (
              <div className="sticky top-0 left-0 right-0 z-30 min-h-[3.5rem] h-auto bg-primary text-primary-foreground flex flex-col sm:flex-row sm:items-center px-4 sm:px-6 py-3 sm:py-2 gap-3 sm:gap-4 animate-in slide-in-from-top duration-300 shadow-xl">
                <p className="text-[11px] font-black uppercase tracking-widest flex-1">
                  {selectedIds.size} {selectedIds.size === 1 ? 'Record' : 'Records'} Selected
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-[10px] font-black uppercase tracking-tighter hover:bg-white/10"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> Clear
                  </Button>
                  <div className="hidden sm:block w-px h-5 bg-white/20" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-[10px] font-black uppercase tracking-tighter hover:bg-emerald-500/30"
                    onClick={() => handleBulkStatusTrigger('Processed')}
                    disabled={isBulkProcessing}
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Processed
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-[10px] font-black uppercase tracking-tighter hover:bg-amber-500/30"
                    onClick={() => handleBulkStatusTrigger('Processing')}
                    disabled={isBulkProcessing}
                  >
                    <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Processing
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-[10px] font-black uppercase tracking-tighter hover:bg-rose-500/40"
                    onClick={() => handleBulkStatusTrigger('Rejected')}
                    disabled={isBulkProcessing}
                  >
                    <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Reject
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-[10px] font-black uppercase tracking-tighter hover:bg-slate-800/50"
                    onClick={() => handleBulkStatusTrigger('Failed')}
                    disabled={isBulkProcessing}
                  >
                    <AlertCircle className="mr-1 h-3.5 w-3.5" /> Failed
                  </Button>
                  <div className="hidden sm:block w-px h-5 bg-white/20" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-[10px] font-black uppercase tracking-tighter bg-red-600/80 hover:bg-red-600 text-white"
                    onClick={() => setIsConfirmBulkDeleteDialogOpen(true)}
                    disabled={isBulkProcessing}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Purge
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent h-14 border-border">
                    <TableHead className="w-12 pl-6">
                      <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    <TableHead
                      className="text-[10px] font-black uppercase tracking-widest cursor-pointer group hover:bg-muted/50 transition-colors text-muted-foreground whitespace-nowrap"
                      onClick={() => requestSort('id')}
                    >
                      <div className="flex items-center">
                        Registration ID {getSortIcon('id')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-[10px] font-black uppercase tracking-widest cursor-pointer group hover:bg-muted/50 transition-colors text-muted-foreground whitespace-nowrap"
                      onClick={() => requestSort('applicantName')}
                    >
                      <div className="flex items-center">
                        Applicant & Origin {getSortIcon('applicantName')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-[10px] font-black uppercase tracking-widest cursor-pointer group hover:bg-muted/50 transition-colors text-muted-foreground text-center whitespace-nowrap"
                      onClick={() => requestSort('submissionDate')}
                    >
                      <div className="flex items-center justify-center">
                        Date {getSortIcon('submissionDate')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-[10px] font-black uppercase tracking-widest cursor-pointer group hover:bg-muted/50 transition-colors text-muted-foreground text-center whitespace-nowrap hidden sm:table-cell"
                      onClick={() => requestSort('phone')}
                    >
                      <div className="flex items-center justify-center">
                        Phone {getSortIcon('phone')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-[10px] font-black uppercase tracking-widest cursor-pointer group hover:bg-muted/50 transition-colors text-muted-foreground text-center whitespace-nowrap"
                      onClick={() => requestSort('status')}
                    >
                      <div className="flex items-center justify-center">
                        Quick Status {getSortIcon('status')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest pr-6 text-muted-foreground">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems.length > 0 ? (
                    currentItems.map((reg) => {
                      const instName = getInstitutionLabel(reg);
                      const dupWarning = duplicateTracker.duplicateReasonById.get(reg.id);
                      const normalizedStatus: RegistrationStatus =
                        reg.status === 'Pending Review' ? 'Processing' : reg.status;

                      return (
                        <TableRow
                          key={reg.id}
                          className={cn(
                            'hover:bg-muted/20 transition-colors border-border group h-16',
                            selectedIds.has(reg.id) && 'bg-blue-50/40 dark:bg-blue-950/20'
                          )}
                        >
                          <TableCell className="pl-6">
                            <Checkbox
                              checked={selectedIds.has(reg.id)}
                              onCheckedChange={() => toggleSelectRow(reg.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => handleCopyRid(reg.id)}
                                title="Click to copy full RID"
                                className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap group/rid cursor-pointer"
                              >
                                <FileDigit className="h-3.5 w-3.5 text-slate-400 group-hover/rid:text-blue-600 dark:group-hover/rid:text-blue-400 shrink-0 transition-colors" />
                                <span>{reg.id.substring(0, 15)}...</span>
                                {copiedId === reg.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <Copy className="h-3 w-3 text-slate-400 group-hover/rid:text-blue-600 dark:group-hover/rid:text-blue-400 shrink-0 transition-colors" />
                                )}
                              </button>
                              {dupWarning && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-bold">
                                  <AlertTriangle className="h-2.5 w-2.5" /> {dupWarning}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-black text-foreground tracking-tight whitespace-nowrap">
                                {reg.applicantName}
                              </p>
                              {instName ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOriginFilter(`INST:${instName}`);
                                    setCurrentPage(1);
                                  }}
                                  title={`Filter by ${instName}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer"
                                >
                                  <Building2 className="h-3 w-3" />
                                  {instName}
                                </button>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[9px] font-bold uppercase tracking-wider">
                                  Individual
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tighter">
                                {(reg.location || 'Sector Unspecified').split(',')[0]}
                              </p>
                              {(reg.status === 'Rejected' || reg.status === 'Failed') &&
                                reg.rejectionReason && (
                                  <span className="text-[9px] font-bold text-rose-500 truncate max-w-[200px]">
                                    · {reg.rejectionReason}
                                  </span>
                                )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase whitespace-nowrap">
                              {reg.submissionDate
                                ? format(new Date(reg.submissionDate), 'MMM dd, yyyy')
                                : 'N/A'}
                            </p>
                          </TableCell>
                          <TableCell className="text-center hidden sm:table-cell">
                            <p className="text-xs font-bold text-muted-foreground tabular-nums">
                              {reg.phone}
                            </p>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="inline-flex items-center justify-center">
                              <Select
                                value={normalizedStatus}
                                disabled={isUpdatingStatusId === reg.id}
                                onValueChange={(val) =>
                                  handleRowStatusSelect(reg, val as RegistrationStatus)
                                }
                              >
                                <SelectTrigger className="h-8 w-[134px] border-none bg-transparent hover:bg-muted/60 rounded-lg px-2 py-0 focus:ring-0">
                                  <div className="flex items-center justify-center w-full">
                                    {isUpdatingStatusId === reg.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                    ) : (
                                      <StatusBadge
                                        status={normalizedStatus}
                                        className="scale-75 sm:scale-90 pointer-events-none"
                                      />
                                    )}
                                  </div>
                                </SelectTrigger>
                                <SelectContent align="center">
                                  <SelectItem value="Processed" className="text-xs font-bold">
                                    Processed
                                  </SelectItem>
                                  <SelectItem value="Processing" className="text-xs font-bold">
                                    Processing
                                  </SelectItem>
                                  <SelectItem
                                    value="Rejected"
                                    className="text-xs font-bold text-rose-600"
                                  >
                                    Rejected (Reason...)
                                  </SelectItem>
                                  <SelectItem
                                    value="Failed"
                                    className="text-xs font-bold text-slate-600"
                                  >
                                    Failed (Reason...)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                title="Verify in Status Check"
                                onClick={() =>
                                  router.push(`/status-check?id=${encodeURIComponent(reg.id)}`)
                                }
                                className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                title="View Record"
                                onClick={() => setViewingRegistration(reg)}
                                className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <RegistrationFormModal
                                registration={reg}
                                mode="edit"
                                existingSchools={existingInstitutionNames}
                                trigger={
                                  <button
                                    type="button"
                                    title="Edit Record"
                                    className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    <SquarePen className="h-4 w-4" />
                                  </button>
                                }
                              />
                              <button
                                type="button"
                                title="Delete Record"
                                onClick={() => {
                                  setRegistrationToDelete({
                                    id: reg.id,
                                    name: reg.applicantName,
                                  });
                                  setIsDeleteDialogOpen(true);
                                }}
                                className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-80 text-center">
                        <div className="flex flex-col items-center justify-center gap-4 opacity-20">
                          <Activity className="h-16 w-16 text-muted-foreground" />
                          <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">
                            Registry Scan Complete: Zero Matches
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showingCount={currentItems.length}
            totalCount={sortedRegistrations.length}
            itemLabel="records"
            className="px-0 pt-6 pb-0 border-t border-border bg-transparent"
          />
        </div>
      </Card>

      {/* Inline & Bulk Rejection / Failure Reason Modal */}
      <Dialog
        open={!!pendingStatusAction}
        onOpenChange={(open) => !open && setPendingStatusAction(null)}
      >
        <DialogContent className="sm:max-w-[500px] rounded-[28px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              Specify {pendingStatusAction?.newStatus} Reason
            </DialogTitle>
            <DialogDescription className="text-xs">
              {pendingStatusAction?.mode === 'bulk'
                ? `Provide the protocol reason for marking ${selectedIds.size} selected records as ${pendingStatusAction?.newStatus}.`
                : `Provide the protocol reason for marking ${pendingStatusAction?.record?.applicantName} as ${pendingStatusAction?.newStatus}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Quick Select Common Reason
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReasonInput(preset)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer',
                      reasonInput === preset
                        ? 'bg-rose-500 text-white border-rose-600'
                        : 'bg-muted/40 border-border text-foreground hover:bg-muted'
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Custom Protocol Note / Reason
              </Label>
              <Input
                placeholder={`Enter ${pendingStatusAction?.newStatus?.toLowerCase()} reason...`}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                className="h-11 rounded-xl font-semibold text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingStatusAction(null)}
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmReasonModal}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider"
            >
              Confirm {pendingStatusAction?.newStatus}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forensic Detail Dialog */}
      <Dialog
        open={!!viewingRegistration}
        onOpenChange={(open) => !open && setViewingRegistration(null)}
      >
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[650px] p-0 overflow-hidden rounded-[32px] border-none shadow-2xl bg-popover max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-6 sm:p-8 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-2xl hidden sm:block">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-lg sm:text-xl font-black text-foreground uppercase tracking-tighter leading-none mb-1">
                    Documentation Archive
                  </DialogTitle>
                  <DialogDescription className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Authorized Bureau Record
                  </DialogDescription>
                </div>
              </div>
              <StatusBadge status={viewingRegistration?.status || 'Processing'} />
            </div>
          </DialogHeader>

          <div className="p-6 sm:p-8 space-y-8 sm:space-y-10 bg-card relative overflow-hidden">
            {(viewingRegistration?.status === 'Rejected' ||
              viewingRegistration?.status === 'Failed') &&
              viewingRegistration.rejectionReason && (
                <div className="p-5 bg-rose-500/5 border border-rose-500/10 rounded-2xl relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="h-4 w-4 text-rose-500" />
                    <p className="text-[10px] font-black uppercase text-rose-600 tracking-widest">
                      Protocol {viewingRegistration.status} Reason
                    </p>
                  </div>
                  <p className="text-sm font-bold text-rose-700 leading-tight">
                    Detail: {viewingRegistration.rejectionReason}
                  </p>
                </div>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 relative z-10">
              <DetailItem
                label="Applicant Identity"
                value={viewingRegistration?.applicantName}
                icon={User}
              />
              <DetailItem
                label="Inbound Date"
                value={
                  viewingRegistration?.submissionDate
                    ? format(new Date(viewingRegistration.submissionDate), 'MMMM dd, yyyy')
                    : 'N/A'
                }
                icon={Calendar}
              />
              <DetailItem
                label="Communication Hub"
                value={viewingRegistration?.phone}
                icon={Phone}
              />
              <DetailItem
                label="Processing Sector"
                value={viewingRegistration?.location}
                icon={MapPin}
              />
              {viewingRegistration && getInstitutionLabel(viewingRegistration) && (
                <DetailItem
                  label="Registered Institution"
                  value={getInstitutionLabel(viewingRegistration)}
                  icon={Building2}
                />
              )}
            </div>

            <div className="space-y-6 relative z-10">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <RefreshCcw className="h-3 w-3" /> Audit Log & Remarks
                </p>
                <div className="p-5 sm:p-6 bg-muted/40 rounded-[24px] sm:rounded-[28px] border border-border/50">
                  <p className="text-sm text-foreground leading-relaxed italic font-medium">
                    &ldquo;{viewingRegistration?.remarks || 'No internal annotations detected.'}&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-primary/[0.02] border border-primary/5 rounded-2xl gap-4">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                    Full Protocol ID
                  </p>
                  <p className="text-[10px] sm:text-[11px] font-mono font-bold text-primary break-all">
                    {viewingRegistration?.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    viewingRegistration && handleCopyRid(viewingRegistration.id)
                  }
                  title="Copy Full RID"
                  className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-500/40 shrink-0 self-end sm:self-auto transition-colors"
                >
                  {viewingRegistration && copiedId === viewingRegistration.id ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Step 3: Rapid Triage Action Bar inside Forensic Detail Dialog */}
              {viewingRegistration && (
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Keyboard className="h-3.5 w-3.5 text-primary" /> Rapid Triage Actions
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground">
                      Instant Status Assignment
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={viewingRegistration.status === 'Processed' ? 'default' : 'outline'}
                      onClick={() => {
                        const rec = viewingRegistration;
                        setViewingRegistration({ ...rec, status: 'Processed' });
                        handleRowStatusSelect(rec, 'Processed');
                      }}
                      className="h-9 text-[10px] font-black uppercase tracking-wider border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Processed
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={viewingRegistration.status === 'Processing' ? 'default' : 'outline'}
                      onClick={() => {
                        const rec = viewingRegistration;
                        setViewingRegistration({ ...rec, status: 'Processing' });
                        handleRowStatusSelect(rec, 'Processing');
                      }}
                      className="h-9 text-[10px] font-black uppercase tracking-wider border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                    >
                      <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Processing
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={viewingRegistration.status === 'Rejected' ? 'default' : 'outline'}
                      onClick={() => {
                        const rec = viewingRegistration;
                        setViewingRegistration(null);
                        handleRowStatusSelect(rec, 'Rejected');
                      }}
                      className="h-9 text-[10px] font-black uppercase tracking-wider border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
                    >
                      <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Rejected
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={viewingRegistration.status === 'Failed' ? 'default' : 'outline'}
                      onClick={() => {
                        const rec = viewingRegistration;
                        setViewingRegistration(null);
                        handleRowStatusSelect(rec, 'Failed');
                      }}
                      className="h-9 text-[10px] font-black uppercase tracking-wider border-slate-500/30 text-slate-600 hover:bg-slate-500/10"
                    >
                      <AlertCircle className="mr-1 h-3.5 w-3.5" /> Failed
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 border-t border-border bg-muted/30 flex justify-between items-center gap-3">
            {viewingRegistration && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const id = viewingRegistration.id;
                  setViewingRegistration(null);
                  router.push(`/status-check?id=${encodeURIComponent(id)}`);
                }}
                className="h-11 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest"
              >
                <ShieldCheck className="mr-1.5 h-4 w-4 text-emerald-600" /> Verify in Status Check
              </Button>
            )}
            <Button
              onClick={() => setViewingRegistration(null)}
              className="w-full sm:w-auto h-11 px-8 rounded-xl font-black text-[10px] uppercase tracking-widest"
            >
              Close Record
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Step 3: 29-Digit RID Slip & Camera Scanner Modal */}
      <Dialog open={isRidScannerOpen} onOpenChange={setIsRidScannerOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-[28px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              29-Digit RID Slip & Camera Scanner
            </DialogTitle>
            <DialogDescription className="text-xs">
              Extract a 29-digit Registration ID from an enrollment slip, barcode scanner, or pasted text to immediately locate or inspect the record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-muted/40 border border-border">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground">Optical Camera Viewfinder</p>
                <p className="text-[10px] text-muted-foreground">
                  Use your device camera or USB barcode scanner to read the slip
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isCameraScanning ? 'destructive' : 'outline'}
                onClick={isCameraScanning ? stopScannerCamera : startScannerCamera}
                className="h-9 rounded-xl text-xs font-bold"
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                {isCameraScanning ? 'Stop Camera' : 'Start Camera'}
              </Button>
            </div>

            {isCameraScanning && (
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-primary/30">
                <video
                  ref={scannerVideoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-4/5 h-16 border-2 border-emerald-400/80 rounded-xl shadow-[0_0_24px_rgba(16,185,129,0.35)]" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Paste Enrollment Slip Text or Scan Barcode Output
              </Label>
              <Input
                placeholder="Paste raw slip text or 29-digit numeric RID here..."
                value={scannerTextInput}
                onChange={(e) => setScannerTextInput(e.target.value)}
                className="h-11 rounded-xl font-mono text-xs"
              />
            </div>

            {extracted29DigitRids.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Detected 29-Digit Registration IDs ({extracted29DigitRids.length})
                </p>
                <div className="space-y-1.5">
                  {extracted29DigitRids.map((rid) => {
                    const matchedRec = initialRegistrations.find(
                      (r) => (r.id || '').trim() === rid
                    );
                    return (
                      <div
                        key={rid}
                        className="flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-bold text-foreground truncate">
                            {rid}
                          </p>
                          <p className="text-[10px] font-semibold text-muted-foreground">
                            {matchedRec
                              ? `Match Found: ${matchedRec.applicantName} (${matchedRec.status})`
                              : 'Not yet in local view — click to filter ledger'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleApplyScannedRid(rid)}
                          className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider shrink-0"
                        >
                          {matchedRec ? 'Inspect Record' : 'Filter Ledger'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              scannerTextInput.trim().length > 0 && (
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Keep typing or paste a slip containing a 29-digit Registration ID ({scannerTextInput.replace(/\D/g, '').length}/29 digits detected).
                </p>
              )
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRidScannerOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              Close Scanner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Purge Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
            <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              {isDeleting ? (
                <Loader2 className="h-10 w-10 text-destructive animate-spin" />
              ) : (
                <Trash2 className="h-10 w-10 text-destructive" />
              )}
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                {isDeleting ? 'PURGING RECORD...' : 'PERMANENT DELETION'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                {isDeleting
                  ? `Removing registry documentation for ${registrationToDelete?.name}. Please wait...`
                  : `You are about to permanently purge the record for ${registrationToDelete?.name} from the bureau registry. This action is final and subject to administrative audit.`}
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="bg-muted/30 p-6 flex-col sm:flex-row gap-3">
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={isDeleting}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 transition-all active:scale-[0.98]"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Confirm Destruction'
              )}
            </AlertDialogAction>
            {!isDeleting && (
              <AlertDialogCancel className="w-full h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent hover:bg-card">
                Abort Protocol
              </AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Purge Confirmation */}
      <AlertDialog
        open={isConfirmBulkDeleteDialogOpen}
        onOpenChange={setIsConfirmBulkDeleteDialogOpen}
      >
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
            <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              {isBulkProcessing ? (
                <Loader2 className="h-10 w-10 text-destructive animate-spin" />
              ) : (
                <ShieldAlert className="h-10 w-10 text-destructive" />
              )}
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                {isBulkProcessing ? 'PURGING REGISTRY...' : 'MASS DELETION PROTOCOL'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                {isBulkProcessing
                  ? 'Executing bulk record destruction. Synchronizing with forensic ledger...'
                  : `You are about to permanently purge ${selectedIds.size} records from the bureau hub. This operation cannot be reversed.`}
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="bg-muted/30 p-6 flex-col sm:flex-row gap-3">
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBulkDelete();
              }}
              disabled={isBulkProcessing}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 active:scale-[0.98] transition-all"
            >
              {isBulkProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Confirm Destruction'
              )}
            </AlertDialogAction>
            {!isBulkProcessing && (
              <AlertDialogCancel className="w-full h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent hover:bg-card">
                Abort Mass Action
              </AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PulseCard({
  label,
  subtitle,
  value,
  rateText,
  fractionText,
  ringScore,
  ringColor,
  icon: Icon,
  iconBg,
  active,
  onClick,
}: any) {
  const dashOffset = 44 - (44 * Math.min(Math.max(ringScore || 0, 0), 100)) / 100;
  return (
    <Card
      onClick={onClick}
      className={cn(
        'rounded-[20px] border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-card shadow-[0_10px_30px_rgba(15,23,42,0.04)] hover:shadow-[0_14px_36px_rgba(15,23,42,0.07)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden cursor-pointer',
        active && 'ring-2 ring-primary shadow-[0_12px_30px_-8px_rgba(37,99,235,0.28)]'
      )}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'h-10 w-10 rounded-[12px] flex items-center justify-center shadow-sm shrink-0',
                iconBg
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight truncate">
                {label}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>
          {active && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider shrink-0">
              Active
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-2 pt-1">
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[22px] font-black tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
                {value.toLocaleString()}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold tabular-nums">
              {fractionText} records
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
              <svg className="h-3.5 w-3.5 -rotate-90" viewBox="0 0 18 18">
                <circle
                  cx="9"
                  cy="9"
                  r="7"
                  fill="none"
                  className="stroke-slate-200 dark:stroke-slate-700"
                  strokeWidth="2"
                />
                <circle
                  cx="9"
                  cy="9"
                  r="7"
                  fill="none"
                  stroke={ringColor || '#4f46e5'}
                  strokeWidth="2"
                  strokeDasharray="44"
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 tabular-nums">
                {rateText}
              </span>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
              Exact Rate
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailItem({ label, value, icon: Icon }: any) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
        <Icon className="h-3 w-3 text-primary/40" /> {label}
      </p>
      <p className="text-sm font-black text-foreground leading-none">{value || '-'}</p>
    </div>
  );
}