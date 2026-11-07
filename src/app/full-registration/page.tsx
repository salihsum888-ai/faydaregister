'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc, limit, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import {
  Activity,
  ShieldCheck,
  Loader2,
  TrendingUp,
  Phone,
  Smartphone,
  Calendar,
  AlertCircle,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  FileSpreadsheet,
  FileText,
  RefreshCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  RotateCcw,
  FileDigit,
  Users,
  Plus,
  Building2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DailyReport, MonthlySummary, Registration, UserProfile } from '@/lib/types';
import { format, startOfMonth } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { RegistrationsList } from '@/components/registrations/registrations-list';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS = [
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
  'December',
];

const START_DATE = new Date(2025, 6, 1); // July 1, 2025

function calcExactRate(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

interface LedgerPeriodRow {
  id: string;
  month: string;
  year: string;
  label: string;
  ethio: number;
  safaricom: number;
  total: number;
  exactEthioPct: number;
  exactSafaricomPct: number;
  momGrowthPct: number | null;
  status: 'Operational' | 'Finalized';
  date: Date;
  dailyEntriesCount: number;
}

type LedgerSortKey =
  | 'date'
  | 'ethio'
  | 'safaricom'
  | 'exactEthioPct'
  | 'total'
  | 'momGrowthPct'
  | 'status';

export default function FullRegistrationPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);

  // Unified Mode Switcher: 'rid_records' (29-Digit Citizen & Institution Records) vs 'telecom_archives' (Monthly Telecom & Daily Intake Archives)
  const [activeLedgerMode, setActiveLedgerMode] = useState<'rid_records' | 'telecom_archives'>(
    'rid_records'
  );

  // Filters & Sorting for Monthly Telecom Archives
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Operational' | 'Finalized'>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState<string>('ALL');
  const [sortConfig, setSortConfig] = useState<{
    key: LedgerSortKey;
    direction: 'asc' | 'desc';
  }>({
    key: 'date',
    direction: 'desc',
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Period Breakdown Inspector Modal state
  const [inspectedPeriod, setInspectedPeriod] = useState<LedgerPeriodRow | null>(null);

  // Log / Update Historical Month Archive Modal state
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archiveMonth, setArchiveMonth] = useState<string>(MONTHS[new Date().getMonth()]);
  const [archiveYear, setArchiveYear] = useState<string>(String(new Date().getFullYear()));
  const [archiveEthio, setArchiveEthio] = useState<string>('');
  const [archiveSafaricom, setArchiveSafaricom] = useState<string>('');
  const [isSavingArchive, setIsSavingArchive] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    setMounted(true);
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const isAdmin = profile?.role === 'admin';

  // Personnel list for Admin officer filter
  const usersQuery = useMemoFirebase(() => {
    if (!db || !user || !isAdmin) return null;
    return query(collection(db, 'users'), limit(1000));
  }, [db, user, isAdmin]);
  const { data: allOfficers } = useCollection<UserProfile>(usersQuery);

  // 1. Citizen & Institution 29-Digit RID Registrations Query
  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user || isProfileLoading) return null;
    if (isAdmin) {
      return query(collection(db, 'registrations'), limit(10000));
    }
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', user.uid),
      limit(10000)
    );
  }, [db, user, isAdmin, isProfileLoading]);

  const { data: registrations, isLoading: isRegistrationsLoading } =
    useCollection<Registration>(registrationsQuery);

  // Filter registrations by selectedOfficerFilter if Admin selected a specific officer
  const scopedRegistrations = useMemo(() => {
    if (!registrations) return [];
    if (isAdmin && selectedOfficerFilter !== 'ALL') {
      return registrations.filter((r) => r.assignedReviewerId === selectedOfficerFilter);
    }
    return registrations;
  }, [registrations, isAdmin, selectedOfficerFilter]);

  // Exact Citizen & Institution Registration Summary Stats for Top Banner
  const ridSummary = useMemo(() => {
    const processed = scopedRegistrations.filter((r) => r.status === 'Processed').length;
    const processing = scopedRegistrations.filter(
      (r) => r.status === 'Processing' || r.status === 'Pending Review'
    ).length;
    const rejected = scopedRegistrations.filter((r) => r.status === 'Rejected').length;
    const failed = scopedRegistrations.filter((r) => r.status === 'Failed').length;
    const exactTotal = processed + processing + rejected + failed;
    const institutionsCount = scopedRegistrations.filter(
      (r) => Boolean((r.institutionName || r.schoolName || '').trim() || r.isSchoolRegistration)
    ).length;

    return {
      total: exactTotal,
      processed,
      processing,
      rejected,
      failed,
      institutionsCount,
      exactSuccessRate: calcExactRate(processed, exactTotal),
      exactRejectionRate: calcExactRate(rejected, exactTotal),
      exactFailedRate: calcExactRate(failed, exactTotal),
    };
  }, [scopedRegistrations]);

  // 2. Monthly Telecom Summaries & Daily Reports Queries (Admin gets bureau-wide or officer-scoped)
  const summariesQuery = useMemoFirebase(() => {
    if (!db || !user || isProfileLoading) return null;
    if (isAdmin) {
      return query(collection(db, 'monthly_summaries'), limit(5000));
    }
    return query(collection(db, 'monthly_summaries'), where('officerId', '==', user.uid));
  }, [db, user, isAdmin, isProfileLoading]);

  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user || isProfileLoading) return null;
    if (isAdmin) {
      return query(collection(db, 'daily_reports'), limit(10000));
    }
    return query(collection(db, 'daily_reports'), where('officerId', '==', user.uid));
  }, [db, user, isAdmin, isProfileLoading]);

  const { data: rawSummaries, isLoading: isSummariesLoading } =
    useCollection<MonthlySummary>(summariesQuery);
  const { data: rawReports, isLoading: isReportsLoading } =
    useCollection<DailyReport>(reportsQuery);

  const summaries = useMemo(() => {
    if (!rawSummaries) return [];
    if (isAdmin && selectedOfficerFilter !== 'ALL') {
      return rawSummaries.filter((s) => s.officerId === selectedOfficerFilter);
    }
    return rawSummaries;
  }, [rawSummaries, isAdmin, selectedOfficerFilter]);

  const reports = useMemo(() => {
    if (!rawReports) return [];
    if (isAdmin && selectedOfficerFilter !== 'ALL') {
      return rawReports.filter((r) => r.officerId === selectedOfficerFilter);
    }
    return rawReports;
  }, [rawReports, isAdmin, selectedOfficerFilter]);

  const handleManualSync = () => {
    if (!db || !user || !reports || !profile) return;
    setIsSyncing(true);

    const targetOfficerId =
      isAdmin && selectedOfficerFilter !== 'ALL' ? selectedOfficerFilter : user.uid;
    const officerReports = reports.filter((r) => r.officerId === targetOfficerId);

    const now = new Date();
    let checkDate = new Date(START_DATE);
    let syncCount = 0;

    while (checkDate < startOfMonth(now)) {
      const monthLabel = MONTHS[checkDate.getMonth()];
      const yearLabel = checkDate.getFullYear().toString();
      const summaryId = `${targetOfficerId}_${monthLabel}_${yearLabel}`;
      const docRef = doc(db, 'monthly_summaries', summaryId);

      const monthReports = officerReports.filter((r) => {
        const rDate = new Date(r.date);
        return (
          rDate.getMonth() === checkDate.getMonth() &&
          rDate.getFullYear() === checkDate.getFullYear()
        );
      });

      if (monthReports.length > 0) {
        const ethio = monthReports.reduce((acc, curr) => acc + (curr.ethioCount || 0), 0);
        const safaricom = monthReports.reduce((acc, curr) => acc + (curr.safaricomCount || 0), 0);
        const total = ethio + safaricom;

        const summaryData = {
          id: summaryId,
          officerId: targetOfficerId,
          month: monthLabel,
          year: yearLabel,
          ethio,
          safaricom,
          total,
          timestamp: serverTimestamp(),
        };

        setDocumentNonBlocking(docRef, summaryData, { merge: true });
        syncCount++;
      }
      checkDate = new Date(checkDate.setMonth(checkDate.getMonth() + 1));
    }

    logAuditAction(
      db,
      user,
      profile.fullName,
      'STATUS_UPDATE',
      'grand_ledger',
      `Grand Ledger: Manual protocol synchronization completed. ${syncCount} archives recalculated and verified.`
    );

    toast({
      title: 'Registry Synchronized',
      description: 'Historical archives have been recalculated based on latest field reports.',
    });

    setTimeout(() => setIsSyncing(false), 800);
  };

  const handleSaveManualArchive = () => {
    if (!db || !user || !profile) return;
    const ethioVal = Math.max(0, Number(archiveEthio || 0));
    const safaricomVal = Math.max(0, Number(archiveSafaricom || 0));
    const totalVal = ethioVal + safaricomVal;

    if (totalVal <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Intake Volume',
        description: 'Please enter a valid Ethio or Safaricom count greater than 0.',
      });
      return;
    }

    setIsSavingArchive(true);
    const targetOfficerId =
      isAdmin && selectedOfficerFilter !== 'ALL' ? selectedOfficerFilter : user.uid;
    const summaryId = `${targetOfficerId}_${archiveMonth}_${archiveYear}`;
    const docRef = doc(db, 'monthly_summaries', summaryId);

    setDocumentNonBlocking(
      docRef,
      {
        id: summaryId,
        officerId: targetOfficerId,
        month: archiveMonth,
        year: archiveYear,
        ethio: ethioVal,
        safaricom: safaricomVal,
        total: totalVal,
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );

    logAuditAction(
      db,
      user,
      profile.fullName,
      'STATUS_UPDATE',
      summaryId,
      `Grand Ledger: Logged finalized monthly archive for ${archiveMonth} ${archiveYear} (Total: ${totalVal.toLocaleString()}).`
    );

    toast({
      title: 'Monthly Archive Saved',
      description: `${archiveMonth} ${archiveYear} ledger updated with ${totalVal.toLocaleString()} total intake.`,
    });

    setIsSavingArchive(false);
    setIsArchiveModalOpen(false);
    setArchiveEthio('');
    setArchiveSafaricom('');
  };

  // Build unified monthly ledger (aggregating across officers when Admin views All Bureau Personnel)
  const rawLedger = useMemo<LedgerPeriodRow[]>(() => {
    if (!mounted) return [];
    const periodMap = new Map<
      string,
      {
        id: string;
        month: string;
        year: string;
        label: string;
        ethio: number;
        safaricom: number;
        total: number;
        status: 'Operational' | 'Finalized';
        date: Date;
      }
    >();

    const now = new Date();
    const currentMonthName = MONTHS[now.getMonth()];
    const currentYearStr = String(now.getFullYear());

    summaries?.forEach((s) => {
      if (s.month === currentMonthName && s.year === currentYearStr) return;
      const key = `${s.month}_${s.year}`;
      const existing = periodMap.get(key);
      const ethio = Number(s.ethio || 0);
      const safaricom = Number(s.safaricom || 0);
      const total = ethio + safaricom;

      if (existing) {
        existing.ethio += ethio;
        existing.safaricom += safaricom;
        existing.total += total;
      } else {
        periodMap.set(key, {
          id: key,
          month: s.month,
          year: s.year,
          label: `${s.month} ${s.year}`,
          ethio,
          safaricom,
          total,
          status: 'Finalized',
          date: new Date(parseInt(s.year), MONTHS.indexOf(s.month), 1),
        });
      }
    });

    const currentMonthReports =
      reports?.filter((r) => {
        const rDate = new Date(r.date);
        return rDate.getMonth() === now.getMonth() && rDate.getFullYear() === now.getFullYear();
      }) || [];

    if (currentMonthReports.length > 0) {
      const ethio = currentMonthReports.reduce((acc, curr) => acc + (curr.ethioCount || 0), 0);
      const safaricom = currentMonthReports.reduce(
        (acc, curr) => acc + (curr.safaricomCount || 0),
        0
      );
      const key = `${currentMonthName}_${currentYearStr}`;
      periodMap.set(key, {
        id: 'current_month_live',
        month: currentMonthName,
        year: currentYearStr,
        label: `${currentMonthName} ${currentYearStr} (Active)`,
        ethio,
        safaricom,
        total: ethio + safaricom,
        status: 'Operational',
        date: now,
      });
    }

    // Sort chronologically ascending first to compute exact MoM Growth %
    const chronological = Array.from(periodMap.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    const enriched: LedgerPeriodRow[] = chronological.map((item, idx) => {
      const prev = idx > 0 ? chronological[idx - 1] : null;
      const momGrowthPct =
        prev && prev.total > 0
          ? Number((((item.total - prev.total) / prev.total) * 100).toFixed(2))
          : null;

      const monthIdx = MONTHS.indexOf(item.month);
      const yearNum = parseInt(item.year);
      const dailyEntriesCount = (reports || []).filter((r) => {
        const d = new Date(r.date);
        return d.getMonth() === monthIdx && d.getFullYear() === yearNum;
      }).length;

      return {
        ...item,
        exactEthioPct: calcExactRate(item.ethio, item.total),
        exactSafaricomPct: calcExactRate(item.safaricom, item.total),
        momGrowthPct,
        dailyEntriesCount,
      };
    });

    return enriched.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [summaries, reports, mounted]);

  const aggregates = useMemo(() => {
    const ethio = rawLedger.reduce((acc, curr) => acc + curr.ethio, 0);
    const safaricom = rawLedger.reduce((acc, curr) => acc + curr.safaricom, 0);
    const total = ethio + safaricom;
    return {
      ethio,
      safaricom,
      total,
      exactEthioPct: calcExactRate(ethio, total),
      exactSafaricomPct: calcExactRate(safaricom, total),
    };
  }, [rawLedger]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    rawLedger.forEach((item) => years.add(item.year));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [rawLedger]);

  const ledger = useMemo(() => {
    const filtered = rawLedger.filter((item) => {
      const matchesSearch = item.label.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesYear = yearFilter === 'all' || item.year === yearFilter;
      return matchesSearch && matchesStatus && matchesYear;
    });

    return [...filtered].sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'date') {
        return (a.date.getTime() - b.date.getTime()) * dir;
      }
      if (sortConfig.key === 'status') {
        return a.status.localeCompare(b.status) * dir;
      }
      const valA = Number(a[sortConfig.key] ?? -999999);
      const valB = Number(b[sortConfig.key] ?? -999999);
      return (valA - valB) * dir;
    });
  }, [rawLedger, searchTerm, statusFilter, yearFilter, sortConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, yearFilter, selectedOfficerFilter]);

  const paginatedLedger = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return ledger.slice(startIndex, startIndex + itemsPerPage);
  }, [ledger, currentPage]);

  const totalPages = Math.ceil(ledger.length / itemsPerPage);

  const analysis = useMemo(() => {
    if (!mounted || ledger.length < 1) return null;

    const sortedLedger = [...ledger].sort((a, b) => a.date.getTime() - b.date.getTime());
    const chartData = sortedLedger.map((item) => ({
      name: `${item.month.substring(0, 3)} '${item.year.slice(-2)}`,
      total: item.total,
      ethio: item.ethio,
      safaricom: item.safaricom,
      exactEthioPct: item.exactEthioPct,
      exactSafaricomPct: item.exactSafaricomPct,
    }));

    const current = sortedLedger[sortedLedger.length - 1];
    const previous = sortedLedger[sortedLedger.length - 2];

    let exactGrowth = 0;
    if (previous && previous.total > 0) {
      exactGrowth = Number((((current.total - previous.total) / previous.total) * 100).toFixed(2));
    }

    const filteredEthio = ledger.reduce((acc, c) => acc + c.ethio, 0);
    const filteredSafaricom = ledger.reduce((acc, c) => acc + c.safaricom, 0);
    const filteredTotal = filteredEthio + filteredSafaricom;

    const ethioPct = calcExactRate(filteredEthio, filteredTotal);
    const safaricomPct = calcExactRate(filteredSafaricom, filteredTotal);

    return {
      chartData,
      growth: exactGrowth,
      ethioPct,
      safaricomPct,
      filteredEthio,
      filteredSafaricom,
      filteredTotal,
    };
  }, [ledger, mounted]);

  // Daily breakdown rows for Inspected Period Modal
  const inspectedDailyReports = useMemo(() => {
    if (!inspectedPeriod || !reports) return [];
    const monthIdx = MONTHS.indexOf(inspectedPeriod.month);
    const yearNum = parseInt(inspectedPeriod.year);
    return reports
      .filter((r) => {
        const d = new Date(r.date);
        return d.getMonth() === monthIdx && d.getFullYear() === yearNum;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inspectedPeriod, reports]);

  const toggleSort = (key: LedgerSortKey) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  const renderSortIcon = (key: LedgerSortKey) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="h-3 w-3 text-slate-400" />;
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary" />
    );
  };

  const handleExportExcel = () => {
    if (ledger.length === 0 || !user || !profile) return;
    setIsExporting(true);

    const targetRows =
      selectedIds.size > 0 ? ledger.filter((l) => selectedIds.has(l.id)) : ledger;

    const exportData = targetRows.map((l) => ({
      'Reporting Period': l.label,
      'Ethio Intake': l.ethio,
      'Exact Ethio Share (%)': `${l.exactEthioPct}%`,
      'Safaricom Intake': l.safaricom,
      'Exact Safaricom Share (%)': `${l.exactSafaricomPct}%`,
      'Grand Total': l.total,
      'Exact MoM Growth (%)': l.momGrowthPct !== null ? `${l.momGrowthPct}%` : 'Baseline',
      'Protocol Status': l.status,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GrandRegistry');
    XLSX.writeFile(wb, `Bureau_Grand_Registry_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    logAuditAction(
      db,
      user,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'grand_ledger',
      `Grand Registry: Exported Excel intelligence (${targetRows.length} periods).`
    );

    toast({
      title: 'Excel Intelligence Exported',
      description: `Exported ${targetRows.length} archive period(s) with exact 2-decimal rates.`,
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (ledger.length === 0 || !user || !profile) return;
    setIsExporting(true);

    const targetRows =
      selectedIds.size > 0 ? ledger.filter((l) => selectedIds.has(l.id)) : ledger;

    const pdf = new jsPDF('l', 'mm', 'a4');
    pdf.setFontSize(14);
    pdf.text(`Official Bureau Grand Registry: ${profile?.fullName || 'Official'}`, 14, 15);
    pdf.setFontSize(9);
    pdf.text(
      `Grand Aggregate: ${aggregates.total.toLocaleString()} | Ethio: ${aggregates.ethio.toLocaleString()} (${aggregates.exactEthioPct}%) | Safaricom: ${aggregates.safaricom.toLocaleString()} (${aggregates.exactSafaricomPct}%)`,
      14,
      22
    );

    const rows = targetRows.map((l) => [
      l.label,
      `${l.ethio.toLocaleString()} (${l.exactEthioPct}%)`,
      `${l.safaricom.toLocaleString()} (${l.exactSafaricomPct}%)`,
      l.total.toLocaleString(),
      l.momGrowthPct !== null ? `${l.momGrowthPct > 0 ? '+' : ''}${l.momGrowthPct}%` : '—',
      l.status,
    ]);
    autoTable(pdf, {
      startY: 28,
      head: [
        [
          'Period',
          'Ethio (Exact %)',
          'Safaricom (Exact %)',
          'Grand Total',
          'Exact MoM Delta',
          'Status',
        ],
      ],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });
    pdf.save(`Bureau_Grand_Ledger_${format(new Date(), 'yyyyMMdd')}.pdf`);

    logAuditAction(
      db,
      user,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'grand_ledger',
      `Grand Registry: Exported PDF historical archive (${targetRows.length} periods).`
    );

    toast({
      title: 'PDF Ledger Generated',
      description: 'Official documentation with exact 2-decimal rates has been saved.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  if (
    isUserLoading ||
    isProfileLoading ||
    isSummariesLoading ||
    isReportsLoading ||
    isRegistrationsLoading ||
    !user
  ) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Top Header & Unified Ledger Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              Bureau Unified Full Record & Ledger
            </p>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-headline uppercase">
            Full Registration & Record Hub
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Inspect every 29-digit Citizen & Institution registration record with exact 2-decimal status rates, or audit finalized Monthly Telecom & Daily Intake archives since July 2025.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Admin Personnel Scope Selector */}
          {isAdmin && (
            <Select value={selectedOfficerFilter} onValueChange={setSelectedOfficerFilter}>
              <SelectTrigger className="h-11 min-w-[210px] rounded-2xl glass-card-surface px-4 text-xs font-black uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary shrink-0" />
                  <SelectValue placeholder="All Bureau Personnel" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="ALL" className="text-xs font-bold">
                  All Bureau Personnel (Global)
                </SelectItem>
                {(allOfficers || []).map((off) => (
                  <SelectItem key={off.id} value={off.id} className="text-xs font-semibold">
                    {off.fullName} ({off.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Dual-Mode Switcher Pill */}
          <div className="inline-flex items-center p-1.5 rounded-2xl glass-card-surface gap-1">
            <button
              type="button"
              onClick={() => setActiveLedgerMode('rid_records')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer',
                activeLedgerMode === 'rid_records'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FileDigit className="h-4 w-4" />
              <span>29-Digit RID Records ({ridSummary.total})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveLedgerMode('telecom_archives')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer',
                activeLedgerMode === 'telecom_archives'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Calendar className="h-4 w-4" />
              <span>Monthly Telecom Archives ({rawLedger.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODE 1: CITIZEN & INSTITUTION 29-DIGIT RID FULL RECORD LEDGER */}
      {activeLedgerMode === 'rid_records' ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Quick Cross-Ledger Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="rounded-2xl p-4 border border-border/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Exact Success Rate
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                  {ridSummary.exactSuccessRate}%
                </p>
                <p className="text-[11px] text-muted-foreground font-semibold tabular-nums">
                  {ridSummary.processed} / {ridSummary.total} Processed
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </Card>

            <Card className="rounded-2xl p-4 border border-border/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Exact Rejection Rate
                </p>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                  {ridSummary.exactRejectionRate}%
                </p>
                <p className="text-[11px] text-muted-foreground font-semibold tabular-nums">
                  {ridSummary.rejected} / {ridSummary.total} Rejected
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
                <AlertCircle className="h-5 w-5" />
              </div>
            </Card>

            <Card className="rounded-2xl p-4 border border-border/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Exact Failed Rate
                </p>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                  {ridSummary.exactFailedRate}%
                </p>
                <p className="text-[11px] text-muted-foreground font-semibold tabular-nums">
                  {ridSummary.failed} / {ridSummary.total} Failed
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center">
                <XCircle className="h-5 w-5" />
              </div>
            </Card>

            <Card className="rounded-2xl p-4 border border-border/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Institution Records
                </p>
                <p className="text-2xl font-black text-primary tabular-nums mt-0.5">
                  {ridSummary.institutionsCount.toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground font-semibold tabular-nums">
                  {calcExactRate(ridSummary.institutionsCount, ridSummary.total)}% of total records
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
            </Card>
          </div>

          {/* Full Interactive RegistrationsList with Click-to-Filter KPI Cards, Inline Status Edit, Duplicate Detector & Bulk Actions */}
          <RegistrationsList initialRegistrations={scopedRegistrations} />
        </div>
      ) : (
        /* MODE 2: MONTHLY TELECOM & HISTORICAL ARCHIVE LEDGER */
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatsCard
              label="Grand Telecom Aggregate"
              value={aggregates.total}
              sublabel={`Across ${rawLedger.length} operational & finalized months`}
              icon={TrendingUp}
              color="text-primary"
              glow="bg-primary/15"
            />
            <StatsCard
              label="Total Ethio Line"
              value={aggregates.ethio}
              sublabel={`Exact Share: ${aggregates.exactEthioPct}% (${aggregates.ethio.toLocaleString()} / ${aggregates.total.toLocaleString()})`}
              icon={Phone}
              color="text-emerald-500"
              glow="bg-emerald-500/15"
            />
            <StatsCard
              label="Total Safaricom Line"
              value={aggregates.safaricom}
              sublabel={`Exact Share: ${aggregates.exactSafaricomPct}% (${aggregates.safaricom.toLocaleString()} / ${aggregates.total.toLocaleString()})`}
              icon={Smartphone}
              color="text-orange-500"
              glow="bg-orange-500/15"
            />
          </div>

          {analysis && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 overflow-hidden rounded-3xl relative">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-20 right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
                />
                <CardHeader className="bg-white/30 dark:bg-white/[0.02] border-b border-white/60 dark:border-white/10 py-4 px-6 flex flex-row items-center justify-between relative z-10">
                  <div>
                    <CardTitle className="text-xs font-black text-foreground uppercase tracking-[0.2em]">
                      Operational Throughput Analysis
                    </CardTitle>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                      Monthly Ethio & Safaricom trajectory for filtered view
                    </p>
                  </div>
                  <BarChart3 className="h-4 w-4 text-primary opacity-60" />
                </CardHeader>
                <CardContent className="p-5 sm:p-6 relative z-10">
                  <div className="glass-chart-surface p-4 h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={analysis.chartData}
                        margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.42} />
                            <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity={0.14} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fontSize: 10,
                            fontWeight: 700,
                            fill: 'hsl(var(--muted-foreground))',
                          }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fontSize: 10,
                            fontWeight: 700,
                            fill: 'hsl(var(--muted-foreground))',
                          }}
                        />
                        <Tooltip
                          cursor={{
                            stroke: 'hsl(var(--primary))',
                            strokeWidth: 1,
                            strokeDasharray: '4 4',
                          }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const p = payload[0].payload;
                              return (
                                <div className="glass-chart-tooltip p-3.5 space-y-1">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    {p.name}
                                  </p>
                                  <p className="text-sm font-black text-foreground tabular-nums">
                                    Total: {Number(p.total).toLocaleString()}
                                  </p>
                                  <p className="text-[11px] font-bold text-emerald-500 tabular-nums">
                                    Ethio: {Number(p.ethio).toLocaleString()} ({p.exactEthioPct}%)
                                  </p>
                                  <p className="text-[11px] font-bold text-orange-500 tabular-nums">
                                    Safaricom: {Number(p.safaricom).toLocaleString()} (
                                    {p.exactSafaricomPct}%)
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.75}
                          fillOpacity={1}
                          fill="url(#colorTotal)"
                          activeDot={{
                            r: 5,
                            strokeWidth: 2,
                            stroke: '#ffffff',
                            fill: 'hsl(var(--primary))',
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="overflow-hidden rounded-3xl hover:-translate-y-0.5 transition-all">
                  <CardContent className="p-6">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">
                      Exact Period-over-Period Momentum
                    </p>
                    <div className="flex items-end gap-3">
                      <span className="text-4xl font-black text-foreground tracking-tighter tabular-nums">
                        {Math.abs(analysis.growth).toFixed(2)}%
                      </span>
                      <div
                        className={cn(
                          'flex items-center gap-1 mb-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border backdrop-blur-md',
                          analysis.growth >= 0
                            ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/15 border-rose-500/25 text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {analysis.growth >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {analysis.growth >= 0 ? 'Surge' : 'Decline'}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase mt-2">
                      Exact 2-decimal delta vs previous period
                    </p>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-3xl hover:-translate-y-0.5 transition-all">
                  <CardContent className="p-6 space-y-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      Exact Carrier Distribution
                    </p>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Ethio Network ({analysis.filteredEthio.toLocaleString()} /{' '}
                            {analysis.filteredTotal.toLocaleString()})
                          </span>
                          <span className="text-foreground tabular-nums">
                            {analysis.ethioPct.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/10 rounded-full overflow-hidden p-0.5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000"
                            style={{ width: `${analysis.ethioPct}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                          <span className="text-orange-600 dark:text-orange-400">
                            Safaricom Network ({analysis.filteredSafaricom.toLocaleString()} /{' '}
                            {analysis.filteredTotal.toLocaleString()})
                          </span>
                          <span className="text-foreground tabular-nums">
                            {analysis.safaricomPct.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/10 rounded-full overflow-hidden p-0.5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)] transition-all duration-1000"
                            style={{ width: `${analysis.safaricomPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          <div className="glass-card-surface rounded-[24px] overflow-hidden">
            {/* Integrated Top Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-3.5 border-b border-white/60 dark:border-white/10 bg-white/25 dark:bg-white/[0.02]">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search Month or Year..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-9 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="glass-subpanel w-auto min-w-[115px] h-9 rounded-lg px-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Year</span>
                      <SelectValue placeholder="All" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs font-medium">
                      All Years
                    </SelectItem>
                    {availableYears.map((yr) => (
                      <SelectItem key={yr} value={yr} className="text-xs font-medium">
                        {yr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                  <SelectTrigger className="glass-subpanel w-auto min-w-[130px] h-9 rounded-lg px-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Status</span>
                      <SelectValue placeholder="All" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs font-medium">
                      All Records
                    </SelectItem>
                    <SelectItem value="Operational" className="text-xs font-medium">
                      Operational
                    </SelectItem>
                    <SelectItem value="Finalized" className="text-xs font-medium">
                      Finalized
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsArchiveModalOpen(true)}
                  className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Log Month Archive
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="glass-subpanel h-9 px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  {isSyncing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                  )}
                  Sync Registry
                </Button>

                <Button
                  onClick={handleExportExcel}
                  disabled={isExporting}
                  variant="outline"
                  className="glass-subpanel h-9 px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                  {selectedIds.size > 0 ? `Excel (${selectedIds.size})` : 'Excel'}
                </Button>

                <Button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  variant="outline"
                  className="glass-subpanel h-9 px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
                  {selectedIds.size > 0 ? `PDF (${selectedIds.size})` : 'PDF'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setYearFilter('all');
                    setSelectedIds(new Set());
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
                    <TableHead className="w-11 px-4 text-center">
                      <Checkbox
                        checked={
                          paginatedLedger.length > 0 &&
                          paginatedLedger.every((item) => selectedIds.has(item.id))
                        }
                        onCheckedChange={() => {
                          const allSelected =
                            paginatedLedger.length > 0 &&
                            paginatedLedger.every((item) => selectedIds.has(item.id));
                          const next = new Set(selectedIds);
                          if (allSelected) {
                            paginatedLedger.forEach((item) => next.delete(item.id));
                          } else {
                            paginatedLedger.forEach((item) => next.add(item.id));
                          }
                          setSelectedIds(next);
                        }}
                      />
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('date')}
                      className="cursor-pointer select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Reporting Period</span>
                        {renderSortIcon('date')}
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('ethio')}
                      className="cursor-pointer select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Ethio Intake (Exact %)</span>
                        {renderSortIcon('ethio')}
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('safaricom')}
                      className="cursor-pointer select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Safaricom Intake (Exact %)</span>
                        {renderSortIcon('safaricom')}
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('total')}
                      className="cursor-pointer select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Grand Total</span>
                        {renderSortIcon('total')}
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('momGrowthPct')}
                      className="cursor-pointer select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Exact MoM Delta</span>
                        {renderSortIcon('momGrowthPct')}
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('status')}
                      className="cursor-pointer select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Protocol</span>
                        {renderSortIcon('status')}
                      </div>
                    </TableHead>
                    <TableHead className="border-r-0 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>Action</span>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLedger.length > 0 ? (
                    paginatedLedger.map((item) => (
                      <TableRow
                        key={item.id}
                        className={cn(
                          'h-14 group',
                          selectedIds.has(item.id) && 'bg-blue-50/40 dark:bg-blue-950/20'
                        )}
                      >
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => {
                              const next = new Set(selectedIds);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              setSelectedIds(next);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                              <Calendar className="h-4 w-4" />
                            </div>
                            <div>
                              <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap block">
                                {item.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {item.dailyEntriesCount} daily log(s)
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {item.ethio.toLocaleString()}
                          </span>
                          <span className="ml-1.5 text-[11px] font-semibold text-muted-foreground">
                            ({item.exactEthioPct}%)
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          <span className="font-bold text-orange-600 dark:text-orange-400">
                            {item.safaricom.toLocaleString()}
                          </span>
                          <span className="ml-1.5 text-[11px] font-semibold text-muted-foreground">
                            ({item.exactSafaricomPct}%)
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-[12px] font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                            {item.total.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {item.momGrowthPct !== null ? (
                            <span
                              className={cn(
                                'inline-flex items-center gap-0.5 text-xs font-bold',
                                item.momGrowthPct >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {item.momGrowthPct >= 0 ? '+' : ''}
                              {item.momGrowthPct}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground font-medium">
                              Baseline
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold',
                              item.status === 'Finalized'
                                ? 'bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/50 dark:text-indigo-400'
                                : 'bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/50 dark:text-emerald-400'
                            )}
                          >
                            {item.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"
                              onClick={() => setInspectedPeriod(item)}
                              title="Inspect Period Breakdown"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> Inspect
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Activity className="h-8 w-8 text-slate-300" />
                          <p className="text-xs font-semibold text-slate-400">Zero Matches Found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Bottom Pagination Footer */}
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={ledger.length}
              shownItems={paginatedLedger.length}
              itemLabel="Archives"
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* Period Drill-Down Breakdown Inspector Modal */}
      <Dialog
        open={Boolean(inspectedPeriod)}
        onOpenChange={(o) => !o && setInspectedPeriod(null)}
      >
        <DialogContent className="sm:max-w-[650px] rounded-3xl p-0 overflow-hidden max-h-[88vh] flex flex-col">
          {inspectedPeriod && (
            <>
              <DialogHeader className="p-6 border-b bg-muted/20">
                <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  {inspectedPeriod.label} — Period Intelligence Breakdown
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Exact carrier split and daily field reports recorded during {inspectedPeriod.month}{' '}
                  {inspectedPeriod.year}.
                </DialogDescription>
              </DialogHeader>

              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border">
                    <span className="text-[10px] font-black uppercase text-muted-foreground block">
                      Grand Total
                    </span>
                    <span className="text-2xl font-black text-foreground tabular-nums">
                      {inspectedPeriod.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block">
                      Ethio ({inspectedPeriod.exactEthioPct}%)
                    </span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {inspectedPeriod.ethio.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20">
                    <span className="text-[10px] font-black uppercase text-orange-600 dark:text-orange-400 block">
                      Safaricom ({inspectedPeriod.exactSafaricomPct}%)
                    </span>
                    <span className="text-2xl font-black text-orange-600 dark:text-orange-400 tabular-nums">
                      {inspectedPeriod.safaricom.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Daily Field Reports in {inspectedPeriod.month} {inspectedPeriod.year} (
                    {inspectedDailyReports.length})
                  </h4>
                  {inspectedDailyReports.length > 0 ? (
                    <div className="border border-border rounded-2xl overflow-hidden max-h-[260px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Ethio</TableHead>
                            <TableHead>Safaricom</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Institution</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inspectedDailyReports.map((rep) => {
                            const tot = (rep.ethioCount || 0) + (rep.safaricomCount || 0);
                            return (
                              <TableRow key={rep.id}>
                                <TableCell className="text-xs font-bold">{rep.date}</TableCell>
                                <TableCell className="text-xs font-semibold text-emerald-600 tabular-nums">
                                  {rep.ethioCount || 0}
                                </TableCell>
                                <TableCell className="text-xs font-semibold text-orange-600 tabular-nums">
                                  {rep.safaricomCount || 0}
                                </TableCell>
                                <TableCell className="text-xs font-black tabular-nums">
                                  {tot}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">
                                  {rep.institutionName || rep.schoolName || 'Standard'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl bg-muted/20 border border-border text-center text-xs text-muted-foreground">
                      This period was recorded directly as a finalized monthly summary archive.
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="p-5 border-t bg-muted/20 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setInspectedPeriod(null);
                    router.push('/daily-registrations');
                  }}
                  className="rounded-xl text-xs font-bold"
                >
                  Open Daily Reports
                </Button>
                <Button
                  type="button"
                  onClick={() => setInspectedPeriod(null)}
                  className="rounded-xl text-xs font-bold"
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Log / Update Historical Month Archive Modal */}
      <Dialog open={isArchiveModalOpen} onOpenChange={setIsArchiveModalOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b bg-muted/20">
            <DialogTitle className="text-base font-black uppercase tracking-tight">
              Log Monthly Archive Summary
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record or update a finalized monthly Ethio & Safaricom intake summary in the Grand Ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Month
                </Label>
                <Select value={archiveMonth} onValueChange={setArchiveMonth}>
                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs font-semibold">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Year
                </Label>
                <Select value={archiveYear} onValueChange={setArchiveYear}>
                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025" className="text-xs font-semibold">
                      2025
                    </SelectItem>
                    <SelectItem value="2026" className="text-xs font-semibold">
                      2026
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                  Ethio Telecom Count
                </Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 420"
                  value={archiveEthio}
                  onChange={(e) => setArchiveEthio(e.target.value)}
                  className="h-10 rounded-xl text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-orange-600">
                  Safaricom Count
                </Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 180"
                  value={archiveSafaricom}
                  onChange={(e) => setArchiveSafaricom(e.target.value)}
                  className="h-10 rounded-xl text-xs font-bold"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="p-5 border-t bg-muted/20">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsArchiveModalOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSavingArchive}
              onClick={handleSaveManualArchive}
              className="rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider"
            >
              Save Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-4 p-6 bg-amber-500/5 border border-amber-500/10 rounded-3xl">
        <AlertCircle className="h-6 w-6 text-amber-500 shrink-0" />
        <p className="text-[10px] text-amber-600 font-bold uppercase leading-relaxed tracking-[0.1em] max-w-5xl">
          Operational Security: This unified terminal provides both the 29-Digit Citizen & Institution Registration Ledger and the Monthly Telecom Throughput Archives since July 2025. All success, rejection, failed, and carrier percentages are calculated to exact 2-decimal precision.
        </p>
      </div>
    </div>
  );
}

function StatsCard({ label, value, sublabel, icon: Icon, color, glow }: any) {
  return (
    <Card className="rounded-[32px] overflow-hidden group relative hover:-translate-y-0.5 transition-all">
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl opacity-70',
          glow
        )}
      />
      <CardContent className="p-7 relative z-10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
            {label}
          </p>
          <div
            className={`glass-subpanel p-3 rounded-2xl transition-all group-hover:scale-105 ${color}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="text-4xl sm:text-5xl font-black text-foreground tracking-tighter tabular-nums">
          {value.toLocaleString()}
        </p>
        {sublabel && (
          <p className="text-xs font-bold text-muted-foreground mt-2 tabular-nums">{sublabel}</p>
        )}
      </CardContent>
    </Card>
  );
}
