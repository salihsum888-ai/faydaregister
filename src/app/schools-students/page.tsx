'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMemoFirebase, useCollection, useUser, useFirestore, useDoc } from '@/firebase';
import { collection, query, where, limit, doc, writeBatch } from 'firebase/firestore';
import {
  deleteDocumentNonBlocking,
  updateDocumentNonBlocking,
  addDocumentNonBlocking,
  setDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Users,
  CheckCircle2,
  Clock,
  Search,
  FileSpreadsheet,
  FileText,
  Plus,
  Loader2,
  Copy,
  Check,
  Eye,
  SquarePen,
  Trash2,
  RotateCcw,
  Sparkles,
  Building2,
  Phone,
  Calendar,
  User,
  FileDigit,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Smartphone,
  ShieldCheck,
  GitMerge,
  AlertTriangle,
  Target,
  Printer,
  Award,
} from 'lucide-react';
import { Registration, RegistrationStatus, DailyReport, UserProfile, SystemSettings } from '@/lib/types';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { RegistrationFormModal } from '@/components/registrations/registration-form-modal';
import { TablePagination } from '@/components/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InstitutionSummary {
  institutionName: string;
  totalRecords: number;
  processed: number;
  processing: number;
  pending: number;
  rejected: number;
  failed: number;
  dailyReportsCount: number;
  dailyIntakeTotal: number;
  dailyEthioTotal: number;
  dailySafaricomTotal: number;
  lastSubmissionDate: string;
  locations: string[];
}

type SortKey = 'applicantName' | 'institutionName' | 'id' | 'submissionDate' | 'status';
type SortDirection = 'asc' | 'desc';

const REJECTION_PRESETS = [
  'Biometric Mismatch',
  'Duplicate Registration (RID)',
  'Incomplete Demographics',
  'Packet Sync / Transmission Error',
  'Unreadable Photo / Document',
];

const getRecordInstitutionName = (reg: Registration): string =>
  (reg.institutionName || reg.schoolName || '').trim();

const getReportInstitutionName = (rep: DailyReport): string =>
  (rep.institutionName || rep.schoolName || '').trim();

export default function InstitutionsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [selectedInstitution, setSelectedInstitution] = useState<string>('ALL');
  const [institutionSearch, setInstitutionSearch] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'submissionDate',
    direction: 'desc',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedRecordForView, setSelectedRecordForView] = useState<Registration | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<Registration | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feature 1: Rename / Merge Institution Modal State
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [sourceInstitutionToRename, setSourceInstitutionToRename] = useState('');
  const [targetInstitutionNameInput, setTargetInstitutionNameInput] = useState('');
  const [isRenamingInstitution, setIsRenamingInstitution] = useState(false);

  // Feature 2: Quick Log Daily Institution Intake Modal State
  const [dailyIntakeDialogOpen, setDailyIntakeDialogOpen] = useState(false);
  const [dailyIntakeInstitution, setDailyIntakeInstitution] = useState('');
  const [dailyIntakeDate, setDailyIntakeDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [dailyEthioCount, setDailyEthioCount] = useState<string>('0');
  const [dailySafaricomCount, setDailySafaricomCount] = useState<string>('0');
  const [dailyInstitutionCount, setDailyInstitutionCount] = useState<string>('0');
  const [dailyRemarks, setDailyRemarks] = useState('');
  const [isSavingDailyIntake, setIsSavingDailyIntake] = useState(false);

  // Feature 4: Inline Status Update with Rejection / Failure Reason Modal State
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    record: Registration;
    newStatus: 'Rejected' | 'Failed';
  } | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [isUpdatingStatusId, setIsUpdatingStatusId] = useState<string | null>(null);

  // Step 4: Per-Institution Target Quota & Printable Summary Report Card State
  const [quotaModalInstitution, setQuotaModalInstitution] = useState<string | null>(null);
  const [quotaTargetInput, setQuotaTargetInput] = useState<string>('500');
  const [summaryReportCardInst, setSummaryReportCardInst] = useState<InstitutionSummary | null>(null);

  const itemsPerPage = 10;

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const systemSettingsRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'system_settings', 'branding');
  }, [db, user]);
  const { data: systemSettings } = useDoc<SystemSettings>(systemSettingsRef);

  const institutionTargetsMap = useMemo(() => {
    return systemSettings?.institutionTargets || {};
  }, [systemSettings]);

  const handleOpenQuotaModal = (instName: string) => {
    const existingTarget = institutionTargetsMap[instName] || 500;
    setQuotaModalInstitution(instName);
    setQuotaTargetInput(String(existingTarget));
  };

  const handleSaveInstitutionQuota = () => {
    if (!db || !user || !quotaModalInstitution) return;
    const targetNum = Math.max(0, parseInt(quotaTargetInput || '0', 10) || 0);
    const nextTargets = {
      ...institutionTargetsMap,
      [quotaModalInstitution]: targetNum,
    };
    setDocumentNonBlocking(
      doc(db, 'system_settings', 'branding'),
      { institutionTargets: nextTargets, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    toast({
      title: 'Institution Target Quota Saved',
      description:
        targetNum > 0
          ? `Set enrollment target for ${quotaModalInstitution} to ${targetNum.toLocaleString()}.`
          : `Cleared enrollment target for ${quotaModalInstitution}.`,
    });
    setQuotaModalInstitution(null);
  };

  const isAdmin = profile?.role === 'admin';

  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    if (isAdmin) {
      return query(collection(db, 'registrations'), limit(10000));
    }
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', user.uid),
      limit(10000)
    );
  }, [db, user, isAdmin]);

  const dailyReportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    if (isAdmin) {
      return query(collection(db, 'daily_reports'), limit(10000));
    }
    return query(
      collection(db, 'daily_reports'),
      where('officerId', '==', user.uid),
      limit(10000)
    );
  }, [db, user, isAdmin]);

  const { data: allRegistrations, isLoading: isRegLoading } =
    useCollection<Registration>(registrationsQuery);
  const { data: allDailyReports, isLoading: isDailyLoading } =
    useCollection<DailyReport>(dailyReportsQuery);

  // Filter registrations that belong to an institution
  const institutionRegistrations = useMemo(() => {
    if (!allRegistrations) return [];
    return allRegistrations
      .filter((reg) => Boolean(getRecordInstitutionName(reg).length > 0))
      .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
  }, [allRegistrations]);

  // Filter daily reports that belong to an institution
  const institutionDailyReports = useMemo(() => {
    if (!allDailyReports) return [];
    return allDailyReports
      .filter((rep) => Boolean(getReportInstitutionName(rep).length > 0))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allDailyReports]);

  // Aggregate unique institutions from both individual records and daily institution reports
  const institutionsList = useMemo<InstitutionSummary[]>(() => {
    const map = new Map<string, InstitutionSummary>();

    const getOrCreate = (rawName: string): InstitutionSummary => {
      const normalizedKey = rawName.trim().toLowerCase();
      let existing = map.get(normalizedKey);
      if (!existing) {
        existing = {
          institutionName: rawName.trim(),
          totalRecords: 0,
          processed: 0,
          processing: 0,
          pending: 0,
          rejected: 0,
          failed: 0,
          dailyReportsCount: 0,
          dailyIntakeTotal: 0,
          dailyEthioTotal: 0,
          dailySafaricomTotal: 0,
          lastSubmissionDate: new Date().toISOString(),
          locations: [],
        };
        map.set(normalizedKey, existing);
      }
      return existing;
    };

    institutionRegistrations.forEach((reg) => {
      const rawName = getRecordInstitutionName(reg);
      if (!rawName) return;
      const entry = getOrCreate(rawName);
      entry.totalRecords += 1;
      if (reg.status === 'Processed') entry.processed += 1;
      else if (reg.status === 'Processing') {
        entry.processing += 1;
        entry.pending += 1;
      } else if (reg.status === 'Pending Review') {
        entry.pending += 1;
      } else if (reg.status === 'Rejected') entry.rejected += 1;
      else if (reg.status === 'Failed') entry.failed += 1;

      if (new Date(reg.submissionDate).getTime() > new Date(entry.lastSubmissionDate).getTime()) {
        entry.lastSubmissionDate = reg.submissionDate;
      }
      if (reg.location && !entry.locations.includes(reg.location)) {
        entry.locations.push(reg.location);
      }
    });

    institutionDailyReports.forEach((rep) => {
      const rawName = getReportInstitutionName(rep);
      if (!rawName) return;
      const entry = getOrCreate(rawName);
      const repTotal = Number(rep.total || 0);
      const repInstitutionCount =
        typeof rep.studentCount === 'number'
          ? Math.min(repTotal, Math.max(0, rep.studentCount))
          : repTotal;
      entry.dailyReportsCount += 1;
      entry.dailyIntakeTotal += repInstitutionCount;
      entry.dailyEthioTotal += Number(rep.ethioCount || 0);
      entry.dailySafaricomTotal += Number(rep.safaricomCount || 0);

      if (new Date(rep.date).getTime() > new Date(entry.lastSubmissionDate).getTime()) {
        entry.lastSubmissionDate = rep.date;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const totalA = a.totalRecords + a.dailyIntakeTotal;
      const totalB = b.totalRecords + b.dailyIntakeTotal;
      return totalB - totalA;
    });
  }, [institutionRegistrations, institutionDailyReports]);

  const existingInstitutionNames = useMemo(() => {
    return institutionsList.map((s) => s.institutionName);
  }, [institutionsList]);

  const filteredInstitutions = useMemo(() => {
    if (!institutionSearch.trim()) return institutionsList;
    const q = institutionSearch.toLowerCase();
    return institutionsList.filter(
      (s) =>
        s.institutionName.toLowerCase().includes(q) ||
        s.locations.some((loc) => loc.toLowerCase().includes(q))
    );
  }, [institutionsList, institutionSearch]);

  // Scoped and sorted registrant records for the selected institution
  const scopedRecords = useMemo(() => {
    const filtered = institutionRegistrations.filter((reg) => {
      const regInst = getRecordInstitutionName(reg);
      if (selectedInstitution !== 'ALL') {
        if (regInst.toLowerCase() !== selectedInstitution.trim().toLowerCase()) return false;
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'Processing_Active') {
          if (reg.status !== 'Processing' && reg.status !== 'Pending Review') return false;
        } else if (reg.status !== statusFilter) {
          return false;
        }
      }

      if (recordSearch.trim()) {
        const q = recordSearch.toLowerCase();
        const matchesName = reg.applicantName.toLowerCase().includes(q);
        const matchesId = reg.id.toLowerCase().includes(q);
        const matchesPhone = (reg.phone || '').toLowerCase().includes(q);
        const matchesInstitution = regInst.toLowerCase().includes(q);
        const matchesLocation = (reg.location || '').toLowerCase().includes(q);
        if (
          !matchesName &&
          !matchesId &&
          !matchesPhone &&
          !matchesInstitution &&
          !matchesLocation
        ) {
          return false;
        }
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'submissionDate') {
        return (
          (new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime()) * dir
        );
      }
      if (sortConfig.key === 'institutionName') {
        return getRecordInstitutionName(a).localeCompare(getRecordInstitutionName(b)) * dir;
      }
      const valA = String(a[sortConfig.key] || '');
      const valB = String(b[sortConfig.key] || '');
      return valA.localeCompare(valB) * dir;
    });
  }, [institutionRegistrations, selectedInstitution, statusFilter, recordSearch, sortConfig]);

  // Scoped daily reports for the selected institution
  const scopedDailyReports = useMemo(() => {
    return institutionDailyReports.filter((rep) => {
      const repInst = getReportInstitutionName(rep);
      if (selectedInstitution !== 'ALL') {
        if (repInst.toLowerCase() !== selectedInstitution.trim().toLowerCase()) return false;
      }
      if (recordSearch.trim()) {
        const q = recordSearch.toLowerCase();
        const matchesInstitution = repInst.toLowerCase().includes(q);
        const matchesDate = rep.date.toLowerCase().includes(q);
        const matchesRemarks = (rep.remarks || '').toLowerCase().includes(q);
        if (!matchesInstitution && !matchesDate && !matchesRemarks) return false;
      }
      return true;
    });
  }, [institutionDailyReports, selectedInstitution, recordSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedInstitution, statusFilter, recordSearch]);

  // Keep dailyInstitutionCount synced when Ethio + Safaricom change inside Daily Intake Modal
  useEffect(() => {
    const ethio = Math.max(0, parseInt(dailyEthioCount || '0', 10) || 0);
    const safaricom = Math.max(0, parseInt(dailySafaricomCount || '0', 10) || 0);
    setDailyInstitutionCount(String(ethio + safaricom));
  }, [dailyEthioCount, dailySafaricomCount]);

  const totalPages = Math.ceil(scopedRecords.length / itemsPerPage);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return scopedRecords.slice(start, start + itemsPerPage);
  }, [scopedRecords, currentPage]);

  // Top KPI aggregates
  const kpiStats = useMemo(() => {
    const totalInstitutions = institutionsList.length;
    const totalRecords = institutionRegistrations.length;
    const processed = institutionRegistrations.filter((r) => r.status === 'Processed').length;
    const pending = institutionRegistrations.filter(
      (r) => r.status === 'Pending Review' || r.status === 'Processing'
    ).length;
    const rejected = institutionRegistrations.filter((r) => r.status === 'Rejected').length;
    const failed = institutionRegistrations.filter((r) => r.status === 'Failed').length;
    const dailyIntakeSum = institutionDailyReports.reduce((acc, curr) => {
      const total = Number(curr.total || 0);
      const instCount =
        typeof curr.studentCount === 'number'
          ? Math.min(total, Math.max(0, curr.studentCount))
          : total;
      return acc + instCount;
    }, 0);
    return { totalInstitutions, totalRecords, processed, pending, rejected, failed, dailyIntakeSum };
  }, [institutionsList, institutionRegistrations, institutionDailyReports]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="h-3 w-3 text-slate-400" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" />
    );
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

  // Feature 1 Handler: Rename or Merge Institution across all records & daily reports
  const openRenameInstitutionModal = (instName: string) => {
    setSourceInstitutionToRename(instName);
    setTargetInstitutionNameInput(instName);
    setRenameDialogOpen(true);
  };

  const handleConfirmRenameOrMerge = async () => {
    const trimmedTarget = targetInstitutionNameInput.trim();
    const trimmedSource = sourceInstitutionToRename.trim();
    if (!db || !user || !profile || !trimmedSource || !trimmedTarget) return;
    if (trimmedSource === trimmedTarget) {
      setRenameDialogOpen(false);
      return;
    }

    setIsRenamingInstitution(true);
    try {
      const matchingRegs = institutionRegistrations.filter(
        (r) => getRecordInstitutionName(r).toLowerCase() === trimmedSource.toLowerCase()
      );
      const matchingReports = institutionDailyReports.filter(
        (d) => getReportInstitutionName(d).toLowerCase() === trimmedSource.toLowerCase()
      );

      const batch = writeBatch(db);
      matchingRegs.forEach((reg) => {
        batch.update(doc(db, 'registrations', reg.id), {
          institutionName: trimmedTarget,
          schoolName: trimmedTarget,
          isSchoolRegistration: true,
          isStudentRegistration: true,
        });
      });

      matchingReports.forEach((rep) => {
        batch.update(doc(db, 'daily_reports', rep.id), {
          institutionName: trimmedTarget,
          schoolName: trimmedTarget,
          isSchoolReport: true,
        });
      });

      await batch.commit();

      if (
        selectedInstitution !== 'ALL' &&
        selectedInstitution.trim().toLowerCase() === trimmedSource.toLowerCase()
      ) {
        setSelectedInstitution(trimmedTarget);
      }

      logAuditAction(
        db,
        user,
        profile.fullName,
        'STATUS_UPDATE',
        'institutions_registry',
        `Institutions: Renamed/Merged "${trimmedSource}" -> "${trimmedTarget}" (${matchingRegs.length} records, ${matchingReports.length} daily reports).`
      );

      toast({
        title: 'Institution Updated',
        description: `Updated ${matchingRegs.length} registration records and ${matchingReports.length} daily intake reports to "${trimmedTarget}".`,
      });
      setRenameDialogOpen(false);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not batch-update the institution name.',
      });
    } finally {
      setIsRenamingInstitution(false);
    }
  };

  // Feature 2 Handler: Quick Log Daily Institution Intake
  const openDailyIntakeModal = (instName?: string) => {
    const defaultInst =
      instName || (selectedInstitution !== 'ALL' ? selectedInstitution : existingInstitutionNames[0] || '');
    setDailyIntakeInstitution(defaultInst);
    setDailyIntakeDate(format(new Date(), 'yyyy-MM-dd'));
    setDailyEthioCount('0');
    setDailySafaricomCount('0');
    setDailyInstitutionCount('0');
    setDailyRemarks('');
    setDailyIntakeDialogOpen(true);
  };

  const handleSaveDailyIntake = async () => {
    const instName = dailyIntakeInstitution.trim();
    if (!db || !user || !instName) {
      toast({
        variant: 'destructive',
        title: 'Institution Name Required',
        description: 'Please enter or select an institution name.',
      });
      return;
    }

    const ethio = Math.max(0, parseInt(dailyEthioCount || '0', 10) || 0);
    const safaricom = Math.max(0, parseInt(dailySafaricomCount || '0', 10) || 0);
    const total = ethio + safaricom;

    if (total <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Intake Count',
        description: 'Total Ethio + Safaricom intake must be greater than zero.',
      });
      return;
    }

    const instPeople = Math.min(total, Math.max(0, parseInt(dailyInstitutionCount || '0', 10) || 0));
    const nonInstPeople = Math.max(0, total - instPeople);

    setIsSavingDailyIntake(true);
    try {
      await addDocumentNonBlocking(collection(db, 'daily_reports'), {
        officerId: user.uid,
        officerName: profile?.fullName || user.email || 'Official',
        date: dailyIntakeDate,
        ethioCount: ethio,
        safaricomCount: safaricom,
        total,
        isSchoolReport: true,
        institutionName: instName,
        schoolName: instName,
        studentCount: instPeople,
        nonStudentCount: nonInstPeople,
        remarks: dailyRemarks.trim(),
        createdAt: new Date().toISOString(),
      });

      if (profile) {
        logAuditAction(
          db,
          user,
          profile.fullName,
          'RECORD_CREATED',
          'daily_reports',
          `Institutions: Logged daily intake of ${total} (${instPeople} institution) for ${instName} on ${dailyIntakeDate}.`
        );
      }

      toast({
        title: 'Daily Institution Intake Saved',
        description: `Recorded ${total} intake (${instPeople} under ${instName}) for ${dailyIntakeDate}.`,
      });
      setDailyIntakeDialogOpen(false);
    } finally {
      setIsSavingDailyIntake(false);
    }
  };

  // Feature 4 Handler: Inline Status Change with Rejection/Failure Reason Prompt
  const commitInlineStatusChange = (
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
        `Institutions: Updated ${record.applicantName} (${getRecordInstitutionName(
          record
        )}) status to ${newStatus}${
          payload.rejectionReason ? ` — Reason: ${payload.rejectionReason}` : ''
        }.`
      );
    }

    toast({
      title: `Status Updated to ${newStatus}`,
      description: `${record.applicantName} (${getRecordInstitutionName(record)}) marked as ${newStatus}.`,
    });

    setTimeout(() => setIsUpdatingStatusId(null), 400);
  };

  const handleSelectRowStatus = (record: Registration, newStatus: RegistrationStatus) => {
    if (record.status === newStatus) return;
    if (newStatus === 'Rejected' || newStatus === 'Failed') {
      setRejectionReasonInput(record.rejectionReason || '');
      setPendingStatusChange({ record, newStatus });
      return;
    }
    commitInlineStatusChange(record, newStatus);
  };

  const handleExportExcel = (targetInstitutionName?: string) => {
    const activeInstitution = targetInstitutionName || selectedInstitution;
    const recordsToExport =
      activeInstitution === 'ALL'
        ? scopedRecords
        : institutionRegistrations.filter(
            (r) =>
              getRecordInstitutionName(r).toLowerCase() === activeInstitution.trim().toLowerCase()
          );

    const dailyToExport =
      activeInstitution === 'ALL'
        ? scopedDailyReports
        : institutionDailyReports.filter(
            (r) =>
              getReportInstitutionName(r).toLowerCase() === activeInstitution.trim().toLowerCase()
          );

    if (recordsToExport.length === 0 && dailyToExport.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Records to Export',
        description: 'There are no institution records matching the current selection.',
      });
      return;
    }

    setIsExporting(true);

    const wb = XLSX.utils.book_new();

    if (recordsToExport.length > 0) {
      const recordExportData = recordsToExport.map((r, index) => ({
        'No.': index + 1,
        'Institution Name': getRecordInstitutionName(r) || 'Unspecified',
        'Applicant Full Name': r.applicantName,
        'Registration ID (29-Digit)': r.id,
        'Phone Number': r.phone,
        'Registration Status': r.status,
        'Rejection Reason': r.rejectionReason || 'N/A',
        'Submission Date': format(new Date(r.submissionDate), 'yyyy-MM-dd'),
        'Location / Sector': r.location,
        'Assigned Officer': r.officer || profile?.fullName || 'Official',
        Remarks: r.remarks || '',
      }));
      const wsRecords = XLSX.utils.json_to_sheet(recordExportData);
      XLSX.utils.book_append_sheet(wb, wsRecords, 'Institution_Records');
    }

    if (dailyToExport.length > 0) {
      const dailyExportData = dailyToExport.map((d, index) => {
        const total = Number(d.total || 0);
        const instPeople =
          typeof d.studentCount === 'number' ? Math.min(total, Math.max(0, d.studentCount)) : total;
        const nonInstPeople =
          typeof d.nonStudentCount === 'number'
            ? Math.max(0, d.nonStudentCount)
            : Math.max(0, total - instPeople);
        return {
          'No.': index + 1,
          'Institution Name': getReportInstitutionName(d) || 'Unspecified',
          'Report Date': d.date,
          'Ethio Intake': d.ethioCount,
          'Safaricom Intake': d.safaricomCount,
          'Institution Registrations': instPeople,
          'Non-Institution (Individual)': nonInstPeople,
          'Total Report': total,
          Remarks: d.remarks || '',
        };
      });
      const wsDaily = XLSX.utils.json_to_sheet(dailyExportData);
      XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily_Institution_Intake');
    }

    const safeFileLabel =
      activeInstitution === 'ALL'
        ? 'All_Institutions'
        : activeInstitution.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32);

    XLSX.writeFile(
      wb,
      `Fayda_Institution_Registry_${safeFileLabel}_${format(new Date(), 'yyyyMMdd')}.xlsx`
    );

    if (db && user && profile) {
      logAuditAction(
        db,
        user,
        profile.fullName,
        'PERFORMANCE_REVIEW',
        'institutions_registry',
        `Institutions: Exported Excel (.xlsx) report for ${
          activeInstitution === 'ALL' ? 'All Institutions' : activeInstitution
        } (${recordsToExport.length} records, ${dailyToExport.length} daily logs).`
      );
    }

    toast({
      title: 'Excel Report Generated',
      description: `Downloaded spreadsheet for ${
        activeInstitution === 'ALL' ? 'all institutions' : activeInstitution
      }.`,
    });
    setTimeout(() => setIsExporting(false), 600);
  };

  const handleExportPDF = (targetInstitutionName?: string) => {
    const activeInstitution = targetInstitutionName || selectedInstitution;
    const recordsToExport =
      activeInstitution === 'ALL'
        ? scopedRecords
        : institutionRegistrations.filter(
            (r) =>
              getRecordInstitutionName(r).toLowerCase() === activeInstitution.trim().toLowerCase()
          );

    const dailyToExport =
      activeInstitution === 'ALL'
        ? scopedDailyReports
        : institutionDailyReports.filter(
            (r) =>
              getReportInstitutionName(r).toLowerCase() === activeInstitution.trim().toLowerCase()
          );

    if (recordsToExport.length === 0 && dailyToExport.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Records to Export',
        description: 'There are no institution records matching the current selection.',
      });
      return;
    }

    setIsExporting(true);

    const pdfDoc = new jsPDF('l', 'mm', 'a4');
    const titleText =
      activeInstitution === 'ALL'
        ? 'Official Bureau Institution Registration Ledger (All Institutions)'
        : `Official Institution Registration Report: ${activeInstitution}`;

    pdfDoc.setFontSize(14);
    pdfDoc.text(titleText, 14, 15);

    const processedCount = recordsToExport.filter((r) => r.status === 'Processed').length;
    const dailyTotalCount = dailyToExport.reduce((acc, curr) => {
      const total = Number(curr.total || 0);
      const instPeople =
        typeof curr.studentCount === 'number'
          ? Math.min(total, Math.max(0, curr.studentCount))
          : total;
      return acc + instPeople;
    }, 0);

    pdfDoc.setFontSize(9);
    pdfDoc.text(
      `Generated By: ${profile?.fullName || user?.email || 'Bureau Official'} | Date: ${format(
        new Date(),
        'yyyy-MM-dd HH:mm'
      )} | Institution Records: ${recordsToExport.length} (Processed: ${processedCount}) | Daily Institution Intake: ${dailyTotalCount}`,
      14,
      22
    );

    let nextStartY = 28;

    if (recordsToExport.length > 0) {
      const rows = recordsToExport.map((r, idx) => [
        String(idx + 1),
        getRecordInstitutionName(r) || '—',
        r.applicantName,
        r.id,
        r.phone || '—',
        r.status,
        format(new Date(r.submissionDate), 'MMM dd, yyyy'),
        r.location || '—',
      ]);

      autoTable(pdfDoc, {
        startY: nextStartY,
        head: [
          [
            '#',
            'Institution Name',
            'Applicant Name',
            '29-Digit Registration ID',
            'Phone',
            'Status',
            'Date',
            'Location',
          ],
        ],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 10 },
          3: { font: 'courier', cellWidth: 58 },
        },
      });

      nextStartY = (pdfDoc as any).lastAutoTable?.finalY
        ? (pdfDoc as any).lastAutoTable.finalY + 10
        : nextStartY + 40;
    }

    if (dailyToExport.length > 0) {
      const dailyRows = dailyToExport.map((d, idx) => {
        const total = Number(d.total || 0);
        const instPeople =
          typeof d.studentCount === 'number' ? Math.min(total, Math.max(0, d.studentCount)) : total;
        const nonInstPeople =
          typeof d.nonStudentCount === 'number'
            ? Math.max(0, d.nonStudentCount)
            : Math.max(0, total - instPeople);
        return [
          String(idx + 1),
          getReportInstitutionName(d) || '—',
          d.date,
          String(d.ethioCount || 0),
          String(d.safaricomCount || 0),
          String(instPeople),
          String(nonInstPeople),
          String(total),
          d.remarks || '—',
        ];
      });

      autoTable(pdfDoc, {
        startY: nextStartY,
        head: [
          [
            '#',
            'Institution Name',
            'Report Date',
            'Ethio',
            'Safaricom',
            'Institution Regs',
            'Non-Institution',
            'Total Report',
            'Remarks',
          ],
        ],
        body: dailyRows,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
      });
    }

    const safeFileLabel =
      activeInstitution === 'ALL'
        ? 'All_Institutions'
        : activeInstitution.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32);

    pdfDoc.save(`Fayda_Institution_Report_${safeFileLabel}_${format(new Date(), 'yyyyMMdd')}.pdf`);

    if (db && user && profile) {
      logAuditAction(
        db,
        user,
        profile.fullName,
        'PERFORMANCE_REVIEW',
        'institutions_registry',
        `Institutions: Exported PDF (.pdf) report for ${
          activeInstitution === 'ALL' ? 'All Institutions' : activeInstitution
        } (${recordsToExport.length} records, ${dailyToExport.length} daily logs).`
      );
    }

    toast({
      title: 'PDF Report Generated',
      description: `Official PDF ledger saved for ${
        activeInstitution === 'ALL' ? 'all institutions' : activeInstitution
      }.`,
    });
    setTimeout(() => setIsExporting(false), 600);
  };

  const confirmDeleteRecord = async () => {
    if (!db || !recordToDelete || !user || !profile) return;
    setIsDeleting(true);
    try {
      const instName = getRecordInstitutionName(recordToDelete) || 'Institution';
      await deleteDocumentNonBlocking(doc(db, 'registrations', recordToDelete.id));
      logAuditAction(
        db,
        user,
        profile.fullName,
        'RECORD_DELETED',
        recordToDelete.id,
        `Institutions: Removed record ${recordToDelete.applicantName} (${instName}).`
      );
      toast({
        variant: 'destructive',
        title: 'Record Removed',
        description: `${recordToDelete.applicantName} has been removed from ${instName}.`,
      });
      setRecordToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isUserLoading || isRegLoading || isDailyLoading || !user) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      {/* Dynamic Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              Institutional Enrollment Registry
            </p>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-headline flex items-center gap-3">
            Institutions
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Browse registered institutions, inspect registrant records by institution name, log daily intake, verify processing queues, and generate official PDF and Excel reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 glass-card-surface p-3 rounded-2xl">
          <RegistrationFormModal
            mode="add"
            defaultIsSchool={true}
            defaultSchoolName={selectedInstitution !== 'ALL' ? selectedInstitution : ''}
            existingSchools={existingInstitutionNames}
            trigger={
              <Button className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-lg shadow-primary/20">
                <Plus className="mr-1.5 h-4 w-4" />
                {selectedInstitution !== 'ALL'
                  ? `Register at ${selectedInstitution}`
                  : 'Register Under Institution'}
              </Button>
            }
          />

          <Button
            type="button"
            variant="outline"
            onClick={() => openDailyIntakeModal()}
            className="glass-subpanel h-10 px-3.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-white/10"
          >
            <Calendar className="mr-1.5 h-3.5 w-3.5 text-indigo-600" />
            Log Daily Intake
          </Button>

          {kpiStats.pending > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const params = new URLSearchParams();
                if (selectedInstitution !== 'ALL') params.set('institution', selectedInstitution);
                params.set('status', 'Processing');
                router.push(`/status-check?${params.toString()}`);
              }}
              className="glass-subpanel h-10 px-3.5 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              Verify Queue ({kpiStats.pending})
            </Button>
          )}

          <div className="h-6 w-px bg-white/60 dark:bg-white/10 hidden sm:block" />

          <Button
            onClick={() => handleExportExcel()}
            disabled={isExporting || (scopedRecords.length === 0 && scopedDailyReports.length === 0)}
            variant="outline"
            className="glass-subpanel h-10 px-3.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-white/10"
          >
            {isExporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
            )}
            Export Excel
          </Button>

          <Button
            onClick={() => handleExportPDF()}
            disabled={isExporting || (scopedRecords.length === 0 && scopedDailyReports.length === 0)}
            variant="outline"
            className="glass-subpanel h-10 px-3.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-white/10"
          >
            {isExporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
            )}
            Export PDF
          </Button>
        </div>
      </div>

      {/* Interactive Click-to-Filter Glassmorphic KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <GlassKpiCard
          title="Registered Institutions"
          value={kpiStats.totalInstitutions}
          subtitle="Click to view all institutions"
          icon={Building2}
          glow="bg-indigo-500/15"
          strokeColor="#6366f1"
          points="0,24 14,20 28,22 42,14 56,16 70,8 84,5"
          active={selectedInstitution === 'ALL' && statusFilter === 'all'}
          onClick={() => {
            setSelectedInstitution('ALL');
            setStatusFilter('all');
          }}
        />
        <GlassKpiCard
          title="Institution Records"
          value={kpiStats.totalRecords}
          subtitle={
            kpiStats.dailyIntakeSum > 0
              ? `+${kpiStats.dailyIntakeSum.toLocaleString()} Daily Institution Intake`
              : 'Click to show all records'
          }
          icon={Users}
          glow="bg-sky-500/15"
          strokeColor="#0ea5e9"
          points="0,25 14,21 28,17 42,19 56,12 70,9 84,4"
          active={statusFilter === 'all' && selectedInstitution !== 'ALL'}
          onClick={() => setStatusFilter('all')}
        />
        <GlassKpiCard
          title="Verified Registrants"
          value={kpiStats.processed}
          subtitle={
            kpiStats.totalRecords > 0
              ? `${Number(((kpiStats.processed / kpiStats.totalRecords) * 100).toFixed(2))}% Success (${kpiStats.processed}/${kpiStats.totalRecords})`
              : 'Processed Institution IDs'
          }
          icon={CheckCircle2}
          glow="bg-emerald-500/15"
          strokeColor="#10b981"
          points="0,26 14,22 28,19 42,15 56,13 70,7 84,4"
          active={statusFilter === 'Processed'}
          onClick={() =>
            setStatusFilter((prev) => (prev === 'Processed' ? 'all' : 'Processed'))
          }
        />
        <GlassKpiCard
          title="Processing & Pending"
          value={kpiStats.pending}
          subtitle={
            kpiStats.rejected > 0 && kpiStats.totalRecords > 0
              ? `${kpiStats.rejected} Rejected (${Number(((kpiStats.rejected / kpiStats.totalRecords) * 100).toFixed(2))}%) · Click to filter`
              : 'Click to filter verification queue'
          }
          icon={Clock}
          glow="bg-amber-500/15"
          strokeColor="#f59e0b"
          points="0,22 14,18 28,21 42,14 56,16 70,11 84,8"
          active={statusFilter === 'Processing_Active' || statusFilter === 'Processing'}
          onClick={() =>
            setStatusFilter((prev) =>
              prev === 'Processing_Active' ? 'all' : 'Processing_Active'
            )
          }
        />
      </section>

      {/* Institutions Directory Section (Glassmorphic Cards) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Registered Institutions Directory
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select an institution card to filter records, rename/merge institution names, or export reports
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Filter by institution name..."
                value={institutionSearch}
                onChange={(e) => setInstitutionSearch(e.target.value)}
                className="h-9 pl-9 rounded-xl glass-subpanel border-white/60 dark:border-white/10 text-xs"
              />
            </div>
            {selectedInstitution !== 'ALL' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedInstitution('ALL')}
                className="glass-subpanel h-9 px-3 rounded-xl text-xs font-semibold text-primary"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Show All Institutions
              </Button>
            )}
          </div>
        </div>

        {institutionsList.length === 0 ? (
          <Card className="rounded-[24px] overflow-hidden relative">
            <CardContent className="p-12 text-center flex flex-col items-center justify-center gap-4">
              <div className="h-14 w-14 rounded-2xl glass-subpanel flex items-center justify-center text-primary">
                <Building2 className="h-7 w-7" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-base font-bold text-foreground">
                  No Institution Registrations Yet
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enable the <strong>Institution Registration</strong> toggle when adding a record in the registration form or click below to register your first record under an institution name.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
                <RegistrationFormModal
                  mode="add"
                  defaultIsSchool={true}
                  existingSchools={existingInstitutionNames}
                  trigger={
                    <Button className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5 h-10">
                      <Plus className="mr-1.5 h-4 w-4" /> Register First Institution Record
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* All Institutions Overview Card */}
            <Card
              onClick={() => setSelectedInstitution('ALL')}
              className={cn(
                'rounded-[22px] hover:-translate-y-0.5 transition-all duration-300 group relative cursor-pointer overflow-hidden',
                selectedInstitution === 'ALL' &&
                  'ring-2 ring-primary shadow-[0_12px_32px_-8px_rgba(37,99,235,0.28)]'
              )}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-primary/20 blur-2xl"
              />
              <CardContent className="p-6 space-y-5 relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-[12px] bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">
                          All Registered Institutions
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {institutionsList.length}{' '}
                        {institutionsList.length === 1 ? 'Institution' : 'Institutions'} in Registry
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'glass-subpanel px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                      selectedInstitution === 'ALL'
                        ? 'text-primary !border-primary/40 bg-primary/10'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {selectedInstitution === 'ALL' ? 'Active View' : 'View All'}
                  </span>
                </div>

                <div className="flex items-end justify-between pt-1">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total Institution Records
                    </p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums">
                      {kpiStats.totalRecords.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tabular-nums">
                      {kpiStats.processed} Processed
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold tabular-nums">
                      {kpiStats.pending} Processing
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Individual Institution Glassmorphic Cards */}
            {filteredInstitutions.map((inst) => {
              const isSelected =
                selectedInstitution !== 'ALL' &&
                selectedInstitution.trim().toLowerCase() ===
                  inst.institutionName.trim().toLowerCase();
              const completionPct =
                inst.totalRecords > 0
                  ? Number(((inst.processed / inst.totalRecords) * 100).toFixed(2))
                  : inst.dailyIntakeTotal > 0
                  ? 100
                  : 0;

              return (
                <Card
                  key={inst.institutionName}
                  onClick={() => setSelectedInstitution(inst.institutionName)}
                  className={cn(
                    'rounded-[22px] hover:-translate-y-0.5 transition-all duration-300 group relative cursor-pointer overflow-hidden',
                    isSelected &&
                      'ring-2 ring-primary shadow-[0_12px_32px_-8px_rgba(37,99,235,0.28)]'
                  )}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-emerald-500/15 blur-2xl group-hover:bg-emerald-500/25 transition-all"
                  />
                  <CardContent className="p-6 space-y-4 relative z-10">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'h-10 w-10 rounded-[12px] flex items-center justify-center shrink-0 transition-all',
                            isSelected
                              ? 'bg-gradient-to-br from-primary to-indigo-600 text-white shadow-lg shadow-primary/25'
                              : 'glass-subpanel text-primary'
                          )}
                        >
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[14px] font-bold text-slate-900 dark:text-white truncate">
                            {inst.institutionName}
                          </h3>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {inst.locations.length > 0
                              ? inst.locations[0]
                              : `Updated ${format(new Date(inst.lastSubmissionDate), 'MMM dd, yyyy')}`}
                          </p>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RegistrationFormModal
                          mode="add"
                          defaultIsSchool={true}
                          defaultSchoolName={inst.institutionName}
                          existingSchools={existingInstitutionNames}
                          trigger={
                            <button
                              type="button"
                              title={`Add Registrant to ${inst.institutionName}`}
                              className="glass-subpanel h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-primary transition-colors cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                        <button
                          type="button"
                          title={`Set Target Quota for ${inst.institutionName}`}
                          onClick={() => handleOpenQuotaModal(inst.institutionName)}
                          className="glass-subpanel h-8 w-8 rounded-lg inline-flex items-center justify-center text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                        >
                          <Target className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={`Printable Summary Report Card for ${inst.institutionName}`}
                          onClick={() => setSummaryReportCardInst(inst)}
                          className="glass-subpanel h-8 w-8 rounded-lg inline-flex items-center justify-center text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={`Rename or Merge ${inst.institutionName}`}
                          onClick={() => openRenameInstitutionModal(inst.institutionName)}
                          className="glass-subpanel h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer"
                        >
                          <GitMerge className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={`Export ${inst.institutionName} Excel`}
                          onClick={() => handleExportExcel(inst.institutionName)}
                          className="glass-subpanel h-8 w-8 rounded-lg inline-flex items-center justify-center text-emerald-600 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={`Export ${inst.institutionName} PDF`}
                          onClick={() => handleExportPDF(inst.institutionName)}
                          className="glass-subpanel h-8 w-8 rounded-lg inline-flex items-center justify-center text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-end justify-between pt-1">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Registered People
                        </p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums">
                            {inst.totalRecords.toLocaleString()}
                          </p>
                          {inst.dailyIntakeTotal > 0 && (
                            <span className="text-[11px] font-bold text-primary tabular-nums">
                              (+{inst.dailyIntakeTotal.toLocaleString()} daily intake)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 justify-end">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tabular-nums">
                          {inst.processed} Processed
                        </span>
                        {inst.pending > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/status-check?institution=${encodeURIComponent(
                                  inst.institutionName
                                )}&status=Processing`
                              );
                            }}
                            title={`Verify ${inst.pending} Processing records for ${inst.institutionName}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-bold tabular-nums transition-colors cursor-pointer"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {inst.pending} Verify
                          </button>
                        )}
                        {inst.rejected > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-bold tabular-nums">
                            {inst.rejected} Rejected
                          </span>
                        )}
                        {inst.failed > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400 text-[10px] font-bold tabular-nums">
                            {inst.failed} Failed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Completion Bar + Optional Per-Institution Target Quota Progress Bar */}
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          <span>Verification Progress</span>
                          <span className="tabular-nums font-bold text-slate-700 dark:text-slate-200">
                            {completionPct.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/60 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
                            style={{ width: `${Math.min(100, completionPct)}%` }}
                          />
                        </div>
                      </div>

                      {(() => {
                        const targetQuota = institutionTargetsMap[inst.institutionName] || 0;
                        const combinedVolume = inst.totalRecords + inst.dailyIntakeTotal;
                        const quotaPct =
                          targetQuota > 0
                            ? Number(((combinedVolume / targetQuota) * 100).toFixed(2))
                            : 0;
                        if (targetQuota <= 0) return null;
                        return (
                          <div className="space-y-1 pt-1 border-t border-white/40 dark:border-white/5">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              <span className="flex items-center gap-1">
                                <Target className="h-3 w-3" /> Target Quota ({combinedVolume.toLocaleString()}/{targetQuota.toLocaleString()})
                              </span>
                              <span className="tabular-nums font-bold">
                                {quotaPct.toFixed(2)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-white/60 dark:bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                                style={{ width: `${Math.min(100, quotaPct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Institution Registrant Records Table */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {selectedInstitution === 'ALL'
                  ? 'All Institution Registration Records'
                  : `${selectedInstitution} — Registration Records`}
              </h2>
              <span className="glass-subpanel px-2.5 py-0.5 rounded-full text-[11px] font-bold text-primary tabular-nums">
                {scopedRecords.length} {scopedRecords.length === 1 ? 'Record' : 'Records'}
              </span>
              {statusFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  Filter: {statusFilter === 'Processing_Active' ? 'Processing & Pending' : statusFilter}
                  <RotateCcw className="h-3 w-3 ml-1" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedInstitution === 'ALL'
                ? 'Click any column header to sort, update status inline, or click Verify to inspect in the Official Portal Gateway.'
                : `Managing records for ${selectedInstitution}. You can rename/merge this institution or verify its queue.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedInstitution !== 'ALL' && (
              <>
                <RegistrationFormModal
                  mode="add"
                  defaultIsSchool={true}
                  defaultSchoolName={selectedInstitution}
                  existingSchools={existingInstitutionNames}
                  trigger={
                    <Button
                      size="sm"
                      className="h-9 px-3.5 rounded-full bg-primary hover:bg-primary/90 text-white font-semibold text-xs"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Record
                    </Button>
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openRenameInstitutionModal(selectedInstitution)}
                  className="glass-subpanel h-9 px-3.5 rounded-full text-slate-700 dark:text-slate-200 font-semibold text-xs"
                >
                  <GitMerge className="mr-1.5 h-3.5 w-3.5 text-indigo-600" />
                  Rename / Merge
                </Button>
              </>
            )}
            <Button
              onClick={() => handleExportExcel()}
              disabled={isExporting || (scopedRecords.length === 0 && scopedDailyReports.length === 0)}
              variant="outline"
              className="glass-subpanel h-9 px-3.5 rounded-full text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-white/75 dark:hover:bg-white/10"
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              Excel ({scopedRecords.length + scopedDailyReports.length})
            </Button>
            <Button
              onClick={() => handleExportPDF()}
              disabled={isExporting || (scopedRecords.length === 0 && scopedDailyReports.length === 0)}
              variant="outline"
              className="glass-subpanel h-9 px-3.5 rounded-full text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-white/75 dark:hover:bg-white/10"
            >
              <FileText className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
              PDF ({scopedRecords.length + scopedDailyReports.length})
            </Button>
          </div>
        </div>

        <div className="glass-card-surface rounded-[24px] overflow-hidden">
          {/* Integrated Top Control Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-3.5 border-b border-white/60 dark:border-white/10 bg-white/25 dark:bg-white/[0.02]">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search applicant name, 29-digit RID, phone, or institution name..."
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                className="h-9 pl-9 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedInstitution} onValueChange={setSelectedInstitution}>
                <SelectTrigger className="glass-subpanel w-auto min-w-[165px] h-9 rounded-lg px-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    <SelectValue placeholder="All Institutions" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs font-semibold">
                    All Institutions ({institutionRegistrations.length})
                  </SelectItem>
                  {institutionsList.map((s) => (
                    <SelectItem
                      key={s.institutionName}
                      value={s.institutionName}
                      className="text-xs font-medium"
                    >
                      {s.institutionName} ({s.totalRecords})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="glass-subpanel w-auto min-w-[140px] h-9 rounded-lg px-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Status:</span>
                    <SelectValue placeholder="All" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-medium">
                    All Status
                  </SelectItem>
                  <SelectItem value="Processed" className="text-xs font-medium">
                    Processed
                  </SelectItem>
                  <SelectItem value="Processing" className="text-xs font-medium">
                    Processing
                  </SelectItem>
                  <SelectItem value="Processing_Active" className="text-xs font-medium">
                    Processing & Pending
                  </SelectItem>
                  <SelectItem value="Pending Review" className="text-xs font-medium">
                    Pending Review
                  </SelectItem>
                  <SelectItem value="Rejected" className="text-xs font-medium">
                    Rejected
                  </SelectItem>
                  <SelectItem value="Failed" className="text-xs font-medium">
                    Failed
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  setRecordSearch('');
                  setStatusFilter('all');
                  setSelectedInstitution('ALL');
                }}
                className="glass-subpanel h-9 w-9 rounded-lg text-slate-500 hover:text-slate-800"
                title="Reset filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">
                    <button
                      type="button"
                      onClick={() => handleSort('applicantName')}
                      className="flex items-center gap-2 font-bold hover:text-primary transition-colors cursor-pointer"
                    >
                      <span>Applicant Name</span>
                      {renderSortIcon('applicantName')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort('institutionName')}
                      className="flex items-center gap-2 font-bold hover:text-primary transition-colors cursor-pointer"
                    >
                      <span>Institution Name</span>
                      {renderSortIcon('institutionName')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort('id')}
                      className="flex items-center gap-2 font-bold hover:text-primary transition-colors cursor-pointer"
                    >
                      <span>Registration ID</span>
                      {renderSortIcon('id')}
                    </button>
                  </TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort('submissionDate')}
                      className="flex items-center gap-2 font-bold hover:text-primary transition-colors cursor-pointer"
                    >
                      <span>Date</span>
                      {renderSortIcon('submissionDate')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort('status')}
                      className="flex items-center gap-2 font-bold hover:text-primary transition-colors cursor-pointer"
                    >
                      <span>Status</span>
                      {renderSortIcon('status')}
                    </button>
                  </TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRecords.length > 0 ? (
                  paginatedRecords.map((record) => {
                    const instName = getRecordInstitutionName(record);
                    return (
                      <TableRow key={record.id} className="h-15 group">
                        <TableCell className="pl-6">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                              {record.applicantName}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {record.location || '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => instName && setSelectedInstitution(instName)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{instName}</span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => handleCopyRid(record.id)}
                            title="Click to copy 29-digit Registration ID"
                            className="inline-flex items-center gap-1.5 text-[12px] font-mono text-slate-600 dark:text-slate-300 hover:text-primary transition-colors cursor-pointer tabular-nums"
                          >
                            <FileDigit className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{record.id.substring(0, 14)}...</span>
                            {copiedId === record.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Copy className="h-3 w-3 text-slate-400 shrink-0" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                          {record.phone || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                          {format(new Date(record.submissionDate), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={record.status}
                            disabled={isUpdatingStatusId === record.id}
                            onValueChange={(val) =>
                              handleSelectRowStatus(record, val as RegistrationStatus)
                            }
                          >
                            <SelectTrigger className="h-8 w-auto min-w-[128px] border-0 bg-transparent p-0 shadow-none focus:ring-0">
                              <StatusBadge status={record.status} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Processed" className="text-xs font-semibold">
                                Processed
                              </SelectItem>
                              <SelectItem value="Processing" className="text-xs font-semibold">
                                Processing
                              </SelectItem>
                              <SelectItem value="Pending Review" className="text-xs font-semibold">
                                Pending Review
                              </SelectItem>
                              <SelectItem value="Rejected" className="text-xs font-semibold">
                                Rejected
                              </SelectItem>
                              <SelectItem value="Failed" className="text-xs font-semibold">
                                Failed
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/status-check?id=${encodeURIComponent(
                                    record.id
                                  )}&institution=${encodeURIComponent(instName)}`
                                )
                              }
                              title="Verify in Portal Gateway"
                              className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">Verify</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedRecordForView(record)}
                              title="Inspect Record"
                              className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <RegistrationFormModal
                              registration={record}
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
                              onClick={() => setRecordToDelete(record)}
                              title="Delete Record"
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
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Building2 className="h-8 w-8 text-slate-300" />
                        <p className="text-xs font-semibold text-slate-400">
                          {selectedInstitution === 'ALL'
                            ? 'No institution records match your current filter'
                            : `No individual registration records found for ${selectedInstitution}`}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showingCount={paginatedRecords.length}
            totalCount={scopedRecords.length}
            itemLabel="institution records"
          />
        </div>
      </section>

      {/* Daily Institution Intake Logs */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              {selectedInstitution === 'ALL'
                ? 'Daily Institution Intake Reports'
                : `${selectedInstitution} — Daily Intake Reports`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Daily Ethio & Safaricom intake totals logged under institution registration
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => openDailyIntakeModal()}
            className="h-9 px-4 rounded-full bg-primary hover:bg-primary/90 text-white font-semibold text-xs self-start sm:self-auto"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Log Daily Institution Intake
          </Button>
        </div>

        <div className="glass-card-surface rounded-[24px] overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Report Date</TableHead>
                  <TableHead>Institution Name</TableHead>
                  <TableHead>Network Intake</TableHead>
                  <TableHead>Institution vs. Non-Institution Breakdown</TableHead>
                  <TableHead>Total Report</TableHead>
                  <TableHead className="pr-6">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedDailyReports.length > 0 ? (
                  scopedDailyReports.map((rep) => {
                    const instName = getReportInstitutionName(rep);
                    const total = Number(rep.total || 0);
                    const instPeople =
                      typeof rep.studentCount === 'number'
                        ? Math.min(total, Math.max(0, rep.studentCount))
                        : total;
                    const nonInstPeople =
                      typeof rep.nonStudentCount === 'number'
                        ? Math.max(0, rep.nonStudentCount)
                        : Math.max(0, total - instPeople);
                    return (
                      <TableRow key={rep.id} className="h-14">
                        <TableCell className="pl-6 font-semibold text-xs tabular-nums">
                          {format(new Date(rep.date), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => instName && setSelectedInstitution(instName)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-semibold cursor-pointer"
                          >
                            <Building2 className="h-3.5 w-3.5" />
                            <span>{instName}</span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold tabular-nums">
                              <Phone className="h-3 w-3" /> {rep.ethioCount}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400 text-xs font-bold tabular-nums">
                              <Smartphone className="h-3 w-3" /> {rep.safaricomCount}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/15 text-primary text-xs font-bold tabular-nums">
                              <Building2 className="h-3 w-3" />
                              {instPeople} Institution
                            </span>
                            {nonInstPeople > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-semibold tabular-nums">
                                <User className="h-3 w-3" />
                                {nonInstPeople} Non-Institution
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-xs font-black tabular-nums">
                            {total} Total
                          </span>
                        </TableCell>
                        <TableCell className="pr-6 text-xs text-muted-foreground">
                          {rep.remarks || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Calendar className="h-6 w-6 text-slate-300" />
                        <p className="text-xs font-semibold text-slate-400">
                          No daily institution intake reports logged yet
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {/* Feature 1 Modal: Rename / Merge Institution */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[460px] rounded-3xl glass-card-surface border border-white/60 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary" />
              Rename or Merge Institution
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Batch-update every registration record and daily intake report currently filed under{' '}
              <strong className="text-foreground">{sourceInstitutionToRename}</strong>. If you enter an existing institution name, both institutions will merge cleanly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                New or Target Institution Name
              </Label>
              <Input
                value={targetInstitutionNameInput}
                onChange={(e) => setTargetInstitutionNameInput(e.target.value)}
                placeholder="Enter corrected institution name..."
                className="h-10 rounded-xl glass-subpanel text-sm font-semibold"
              />
            </div>
            {existingInstitutionNames.filter((n) => n !== sourceInstitutionToRename).length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Or Merge Into Existing Institution:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {existingInstitutionNames
                    .filter((n) => n !== sourceInstitutionToRename)
                    .map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setTargetInstitutionNameInput(name)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer border',
                          targetInstitutionNameInput === name
                            ? 'bg-primary text-white border-primary'
                            : 'glass-subpanel text-slate-700 dark:text-slate-200 border-white/40 hover:border-primary/40'
                        )}
                      >
                        {name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmRenameOrMerge}
              disabled={isRenamingInstitution || !targetInstitutionNameInput.trim()}
              className="rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold"
            >
              {isRenamingInstitution ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitMerge className="mr-1.5 h-3.5 w-3.5" />
              )}
              Apply to All Records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature 2 Modal: Quick Log Daily Institution Intake */}
      <Dialog open={dailyIntakeDialogOpen} onOpenChange={setDailyIntakeDialogOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-3xl glass-card-surface border border-white/60 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Log Daily Institution Intake
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record daily Ethio Telecom and Safaricom registration totals directly under an institution name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Institution Name
                </Label>
                <Input
                  value={dailyIntakeInstitution}
                  onChange={(e) => setDailyIntakeInstitution(e.target.value)}
                  placeholder="Enter institution name..."
                  className="h-9 rounded-xl glass-subpanel text-xs font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Report Date
                </Label>
                <Input
                  type="date"
                  value={dailyIntakeDate}
                  onChange={(e) => setDailyIntakeDate(e.target.value)}
                  className="h-9 rounded-xl glass-subpanel text-xs font-semibold"
                />
              </div>
            </div>

            {existingInstitutionNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {existingInstitutionNames.slice(0, 6).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setDailyIntakeInstitution(name)}
                    className={cn(
                      'px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer',
                      dailyIntakeInstitution === name
                        ? 'bg-primary text-white'
                        : 'glass-subpanel text-slate-600 dark:text-slate-300 hover:text-primary'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Ethio Intake
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={dailyEthioCount}
                  onChange={(e) => setDailyEthioCount(e.target.value)}
                  className="h-9 rounded-xl glass-subpanel text-sm font-bold tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                  Safaricom Intake
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={dailySafaricomCount}
                  onChange={(e) => setDailySafaricomCount(e.target.value)}
                  className="h-9 rounded-xl glass-subpanel text-sm font-bold tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-primary">
                  Institution Count
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={dailyInstitutionCount}
                  onChange={(e) => setDailyInstitutionCount(e.target.value)}
                  className="h-9 rounded-xl glass-subpanel text-sm font-bold tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Remarks (Optional)
              </Label>
              <Input
                value={dailyRemarks}
                onChange={(e) => setDailyRemarks(e.target.value)}
                placeholder="Field campaign notes or shift details..."
                className="h-9 rounded-xl glass-subpanel text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDailyIntakeDialogOpen(false)}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveDailyIntake}
              disabled={isSavingDailyIntake}
              className="rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold"
            >
              {isSavingDailyIntake ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save Daily Intake
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature 4 Modal: Inline Rejection / Failure Reason Prompt */}
      <Dialog
        open={Boolean(pendingStatusChange)}
        onOpenChange={(o) => !o && setPendingStatusChange(null)}
      >
        <DialogContent className="sm:max-w-[440px] rounded-3xl glass-card-surface border border-white/60 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              Specify {pendingStatusChange?.newStatus} Reason
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record the official reason why{' '}
              <strong className="text-foreground">
                {pendingStatusChange?.record.applicantName}
              </strong>{' '}
              was marked as {pendingStatusChange?.newStatus}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {REJECTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRejectionReasonInput(preset)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border',
                    rejectionReasonInput === preset
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'glass-subpanel text-slate-700 dark:text-slate-200 border-white/40 hover:border-rose-400'
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <Input
              value={rejectionReasonInput}
              onChange={(e) => setRejectionReasonInput(e.target.value)}
              placeholder="Or type custom rejection / failure reason..."
              className="h-10 rounded-xl glass-subpanel text-xs font-medium"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingStatusChange(null)}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingStatusChange) {
                  commitInlineStatusChange(
                    pendingStatusChange.record,
                    pendingStatusChange.newStatus,
                    rejectionReasonInput
                  );
                  setPendingStatusChange(null);
                }
              }}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              Confirm {pendingStatusChange?.newStatus}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Institution Record Detail Modal */}
      <Dialog
        open={Boolean(selectedRecordForView)}
        onOpenChange={(o) => !o && setSelectedRecordForView(null)}
      >
        <DialogContent className="sm:max-w-[500px] rounded-3xl glass-card-surface border border-white/60 dark:border-white/10 p-0 overflow-hidden">
          {selectedRecordForView && (
            <>
              <DialogHeader className="p-6 border-b border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Institution Registration File
                  </DialogTitle>
                  <StatusBadge status={selectedRecordForView.status} />
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Registered under {getRecordInstitutionName(selectedRecordForView)}
                </DialogDescription>
              </DialogHeader>
              <div className="p-6 space-y-4">
                <div className="glass-subpanel rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Applicant Name
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {selectedRecordForView.applicantName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Institution Name
                    </span>
                    <span className="text-xs font-bold text-primary flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {getRecordInstitutionName(selectedRecordForView)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      29-Digit RID
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyRid(selectedRecordForView.id)}
                      className="text-xs font-mono font-bold text-foreground hover:text-primary flex items-center gap-1.5 tabular-nums cursor-pointer"
                    >
                      <span>{selectedRecordForView.id}</span>
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Phone
                    </span>
                    <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                      {selectedRecordForView.phone}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Location
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {selectedRecordForView.location}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Submission Date
                    </span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">
                      {format(new Date(selectedRecordForView.submissionDate), 'MMMM dd, yyyy')}
                    </span>
                  </div>
                  {selectedRecordForView.rejectionReason && (
                    <div className="pt-2 border-t border-white/60 dark:border-white/10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block mb-1">
                        Rejection / Failure Reason
                      </span>
                      <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                        {selectedRecordForView.rejectionReason}
                      </p>
                    </div>
                  )}
                  {selectedRecordForView.remarks && (
                    <div className="pt-2 border-t border-white/60 dark:border-white/10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                        Remarks
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {selectedRecordForView.remarks}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const rec = selectedRecordForView;
                      setSelectedRecordForView(null);
                      router.push(
                        `/status-check?id=${encodeURIComponent(
                          rec.id
                        )}&institution=${encodeURIComponent(getRecordInstitutionName(rec))}`
                      );
                    }}
                    className="rounded-xl text-xs font-bold text-primary"
                  >
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    Verify in Portal Gateway
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedRecordForView(null)}
                    className="rounded-xl text-xs font-semibold"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Record Deletion Dialog */}
      <AlertDialog
        open={Boolean(recordToDelete)}
        onOpenChange={(o) => !o && setRecordToDelete(null)}
      >
        <AlertDialogContent className="rounded-[28px] border border-white/60 dark:border-white/10 glass-card-surface max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black uppercase tracking-tight">
              Remove Institution Record?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
              You are about to permanently remove{' '}
              <strong>{recordToDelete?.applicantName}</strong> from{' '}
              <strong>{recordToDelete ? getRecordInstitutionName(recordToDelete) : ''}</strong>. This action will be recorded in the audit ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-xs font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteRecord();
              }}
              disabled={isDeleting}
              className="rounded-xl bg-destructive hover:bg-destructive/90 text-white text-xs font-bold"
            >
              {isDeleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Delete Record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 4 Modal: Per-Institution Target Quota Configuration */}
      <Dialog
        open={Boolean(quotaModalInstitution)}
        onOpenChange={(o) => !o && setQuotaModalInstitution(null)}
      >
        <DialogContent className="sm:max-w-[420px] rounded-3xl glass-card-surface border border-white/60 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-500" />
              Set Institution Target Quota
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Set the expected total enrollment quota for{' '}
              <strong className="text-foreground">{quotaModalInstitution}</strong> to track exact 2-decimal field campaign completion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Target Registrants Quota (Set 0 to clear)
              </Label>
              <Input
                type="number"
                min={0}
                value={quotaTargetInput}
                onChange={(e) => setQuotaTargetInput(e.target.value)}
                className="h-10 rounded-xl glass-subpanel text-sm font-bold tabular-nums"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[100, 250, 500, 1000, 2500, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuotaTargetInput(String(preset))}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer',
                    quotaTargetInput === String(preset)
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'glass-subpanel text-slate-700 dark:text-slate-200 border-white/40 hover:border-amber-400'
                  )}
                >
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuotaModalInstitution(null)}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveInstitutionQuota}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Save Quota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 4 Modal: Printable Official Institution Summary Report Card */}
      <Dialog
        open={Boolean(summaryReportCardInst)}
        onOpenChange={(o) => !o && setSummaryReportCardInst(null)}
      >
        <DialogContent className="sm:max-w-[600px] rounded-3xl glass-card-surface border border-white/60 dark:border-white/10 p-0 overflow-hidden">
          {summaryReportCardInst && (() => {
            const inst = summaryReportCardInst;
            const total = inst.totalRecords;
            const successPct =
              total > 0 ? Number(((inst.processed / total) * 100).toFixed(2)) : 0;
            const processingPct =
              total > 0 ? Number(((inst.pending / total) * 100).toFixed(2)) : 0;
            const rejectedPct =
              total > 0 ? Number(((inst.rejected / total) * 100).toFixed(2)) : 0;
            const failedPct =
              total > 0 ? Number(((inst.failed / total) * 100).toFixed(2)) : 0;
            const targetQuota = institutionTargetsMap[inst.institutionName] || 0;
            const combinedVol = inst.totalRecords + inst.dailyIntakeTotal;
            const quotaCompletionPct =
              targetQuota > 0 ? Number(((combinedVol / targetQuota) * 100).toFixed(2)) : 0;

            return (
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      <Award className="h-3.5 w-3.5" />
                      Official Institutional Summary Dossier
                    </div>
                    <h3 className="text-2xl font-black text-foreground tracking-tight">
                      {inst.institutionName}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Generated {format(new Date(), 'MMMM dd, yyyy · HH:mm')} · Locations:{' '}
                      {inst.locations.length > 0 ? inst.locations.join(', ') : 'Primary Sector'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      Combined Volume
                    </span>
                    <span className="text-3xl font-black text-primary tabular-nums">
                      {combinedVol.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Success Rate
                    </p>
                    <p className="text-xl font-black text-foreground tabular-nums mt-0.5">
                      {successPct.toFixed(2)}%
                    </p>
                    <p className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {inst.processed} / {total} Processed
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Processing Rate
                    </p>
                    <p className="text-xl font-black text-foreground tabular-nums mt-0.5">
                      {processingPct.toFixed(2)}%
                    </p>
                    <p className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {inst.pending} / {total} In Queue
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      Rejection Rate
                    </p>
                    <p className="text-xl font-black text-foreground tabular-nums mt-0.5">
                      {rejectedPct.toFixed(2)}%
                    </p>
                    <p className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {inst.rejected} / {total} Rejected
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-500/10 border border-slate-500/20">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Failed Rate
                    </p>
                    <p className="text-xl font-black text-foreground tabular-nums mt-0.5">
                      {failedPct.toFixed(2)}%
                    </p>
                    <p className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {inst.failed} / {total} Failed
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl glass-subpanel space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
                      Daily Telecom Field Intake ({inst.dailyReportsCount} Reports)
                    </span>
                    <span className="font-black text-foreground tabular-nums">
                      {inst.dailyIntakeTotal.toLocaleString()} People
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10">
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">
                        Ethio Telecom
                      </span>
                      <span className="font-black tabular-nums">
                        {inst.dailyEthioTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-orange-500/10">
                      <span className="font-bold text-orange-700 dark:text-orange-300">
                        Safaricom
                      </span>
                      <span className="font-black tabular-nums">
                        {inst.dailySafaricomTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {targetQuota > 0 && (
                    <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        Target Quota Completion ({combinedVol.toLocaleString()} / {targetQuota.toLocaleString()})
                      </span>
                      <span className="font-black tabular-nums">{quotaCompletionPct.toFixed(2)}%</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportPDF(inst.institutionName)}
                      className="rounded-xl text-xs font-bold"
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
                      Download PDF
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => window.print()}
                      className="rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold"
                    >
                      <Printer className="mr-1.5 h-3.5 w-3.5" />
                      Print Summary Card
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSummaryReportCardInst(null)}
                    className="rounded-xl text-xs font-semibold"
                  >
                    Close
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GlassKpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  glow,
  strokeColor,
  points,
  active,
  onClick,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: any;
  glow: string;
  strokeColor: string;
  points: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        'rounded-[22px] hover:-translate-y-0.5 transition-all duration-300 group relative overflow-hidden cursor-pointer',
        active && 'ring-2 ring-primary shadow-[0_12px_28px_-8px_rgba(37,99,235,0.28)]'
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl opacity-80 transition-opacity group-hover:opacity-100',
          glow
        )}
      />
      <CardContent className="p-6 flex flex-col justify-between h-full space-y-5 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-105',
                active
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'glass-subpanel text-slate-700 dark:text-slate-200'
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
              {title}
            </span>
          </div>
          {active && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Filtered
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
              {value.toLocaleString()}
            </div>
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {subtitle}
            </p>
          </div>

          <svg viewBox="0 0 88 28" className="w-24 h-8 overflow-visible shrink-0">
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
