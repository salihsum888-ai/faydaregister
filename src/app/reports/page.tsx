'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  BarChart3,
  Filter,
  FileSpreadsheet,
  FileText,
  Calendar,
  FileDigit,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Search,
  Loader2,
  TrendingUp,
  ArrowUpDown,
  Eye,
  RotateCcw,
  Copy,
  Check,
  SquarePen,
  Trash2,
  Users,
  Building2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { RegistrationFormModal } from '@/components/registrations/registration-form-modal';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { format, isWithinInterval, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, limit, where, doc } from 'firebase/firestore';
import { Registration, RegistrationStatus, UserProfile } from '@/lib/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ReportsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [startDate, setStartDate] = useState('2020-01-01');
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('ALL');
  const [selectedOfficerScope, setSelectedOfficerScope] = useState('GLOBAL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Pagination & Selection State
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const itemsPerPage = 10;

  const handleCopyRid = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    toast({
      title: 'RID Copied',
      description: `Registration ID ${id} copied to clipboard.`,
    });
  };

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const isAdmin = profile?.role === 'admin';

  const usersQuery = useMemoFirebase(() => {
    if (!db || !user || !isAdmin) return null;
    return query(collection(db, 'users'), limit(10000));
  }, [db, user, isAdmin]);
  const { data: allUsers } = useCollection<UserProfile>(usersQuery);

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

  const { data: registrations, isLoading } = useCollection<Registration>(registrationsQuery);

  // Base scoped records (filtered by officer, date range, origin, and search — before statusFilter so rates are exact)
  const baseScopedData = useMemo(() => {
    if (!registrations) return [];
    return registrations.filter((reg) => {
      if (
        isAdmin &&
        selectedOfficerScope !== 'GLOBAL' &&
        reg.assignedReviewerId !== selectedOfficerScope
      ) {
        return false;
      }

      const instName = (reg.institutionName || reg.schoolName || '').trim();
      if (originFilter === 'INSTITUTION' && !instName) return false;
      if (originFilter === 'INDIVIDUAL' && instName) return false;

      let matchesDate = true;
      try {
        const regDate = new Date(reg.submissionDate);
        const start = startOfDay(new Date(startDate));
        const end = endOfDay(new Date(endDate));
        matchesDate = isWithinInterval(regDate, { start, end });
      } catch {
        matchesDate = true;
      }

      const q = searchTerm.toLowerCase();
      const matchesSearch =
        searchTerm === '' ||
        reg.applicantName.toLowerCase().includes(q) ||
        reg.id.toLowerCase().includes(q) ||
        (reg.phone || '').toLowerCase().includes(q) ||
        instName.toLowerCase().includes(q);

      return matchesDate && matchesSearch;
    });
  }, [registrations, isAdmin, selectedOfficerScope, originFilter, startDate, endDate, searchTerm]);

  const filteredData = useMemo(() => {
    return baseScopedData
      .filter((reg) => statusFilter === 'all' || reg.status === statusFilter)
      .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
  }, [baseScopedData, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [statusFilter, originFilter, selectedOfficerScope, startDate, endDate, searchTerm]);

  // Exact 2-Decimal Rates computed against baseScopedData
  const stats = useMemo(() => {
    const total = baseScopedData.length;
    const processed = baseScopedData.filter((r) => r.status === 'Processed').length;
    const processing = baseScopedData.filter((r) => r.status === 'Processing').length;
    const rejected = baseScopedData.filter((r) => r.status === 'Rejected').length;
    const failed = baseScopedData.filter((r) => r.status === 'Failed').length;
    const pending = baseScopedData.filter((r) => r.status === 'Pending Review').length;

    const rate = (c: number) => (total > 0 ? Number(((c / total) * 100).toFixed(2)) : 0);

    return {
      total,
      processed,
      processing,
      rejected,
      failed,
      pending,
      processedRate: rate(processed),
      processingRate: rate(processing),
      rejectedRate: rate(rejected),
      failedRate: rate(failed),
      pendingRate: rate(pending),
    };
  }, [baseScopedData]);

  const chartData = useMemo(() => {
    return [
      {
        name: 'Processed',
        value: stats.processed,
        rate: stats.processedRate,
        color: '#10b981',
      },
      {
        name: 'Processing',
        value: stats.processing,
        rate: stats.processingRate,
        color: '#3b82f6',
      },
      {
        name: 'Pending Review',
        value: stats.pending,
        rate: stats.pendingRate,
        color: '#f59e0b',
      },
      {
        name: 'Rejected',
        value: stats.rejected,
        rate: stats.rejectedRate,
        color: '#ef4444',
      },
      {
        name: 'Failed',
        value: stats.failed,
        rate: stats.failedRate,
        color: '#64748b',
      },
    ];
  }, [stats]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const allOnPageSelected =
    paginatedData.length > 0 && paginatedData.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      paginatedData.forEach((r) => next.delete(r.id));
    } else {
      paginatedData.forEach((r) => next.add(r.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const applyDatePreset = (preset: '7D' | '30D' | 'MONTH' | 'ALL') => {
    const now = new Date();
    setEndDate(format(now, 'yyyy-MM-dd'));
    if (preset === '7D') {
      setStartDate(format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
    } else if (preset === '30D') {
      setStartDate(format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
    } else if (preset === 'MONTH') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
    } else {
      setStartDate('2020-01-01');
    }
  };

  const handleBulkStatusUpdate = (newStatus: RegistrationStatus) => {
    if (!db || !user || !profile || selectedIds.size === 0) return;
    setIsBulkUpdating(true);
    const nowIso = new Date().toISOString();

    selectedIds.forEach((id) => {
      updateDocumentNonBlocking(doc(db, 'registrations', id), {
        status: newStatus,
        updatedAt: nowIso,
      });
    });

    logAuditAction(
      db,
      user,
      profile.fullName,
      'STATUS_UPDATE',
      'operational_report_bulk',
      `Operational Reports: Bulk updated ${selectedIds.size} records to ${newStatus}.`
    );

    toast({
      title: 'Bulk Status Updated',
      description: `Updated ${selectedIds.size} selected records to ${newStatus}.`,
    });

    setSelectedIds(new Set());
    setTimeout(() => setIsBulkUpdating(false), 400);
  };

  const handleExportExcel = () => {
    if (filteredData.length === 0 || !user || !profile) return;
    setIsExporting(true);

    const exportData = filteredData.map((r) => ({
      'Registry ID': r.id,
      Applicant: r.applicantName,
      Institution: r.institutionName || r.schoolName || 'Individual',
      'Submission Date': format(new Date(r.submissionDate), 'yyyy-MM-dd HH:mm'),
      Status: r.status,
      'Rejection/Failure Reason': r.rejectionReason || '',
      Phone: r.phone,
      Location: r.location,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operational_Report');
    XLSX.writeFile(
      wb,
      `Bureau_Report_${profile.fullName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`
    );

    logAuditAction(
      db,
      user,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'operational_report',
      `Exported operational intelligence XLS ledger for ${filteredData.length} records.`
    );

    toast({
      title: 'Excel Ledger Generated',
      description: 'Your filtered operational report is ready.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (filteredData.length === 0 || !user || !profile) return;
    setIsExporting(true);

    const docPdf = new jsPDF('l', 'mm', 'a4');
    docPdf.text(`Official Bureau Operational Report: ${profile.fullName}`, 14, 15);
    docPdf.setFontSize(10);
    docPdf.text(
      `Period: ${startDate} to ${endDate} | Total: ${stats.total} | Success Rate: ${stats.processedRate.toFixed(
        2
      )}% | Rejection Rate: ${stats.rejectedRate.toFixed(2)}%`,
      14,
      22
    );

    const rows = filteredData.map((r) => [
      r.id.substring(0, 15) + '...',
      r.applicantName,
      r.institutionName || r.schoolName || 'Individual',
      format(new Date(r.submissionDate), 'MMM dd, yyyy'),
      r.status,
      r.phone,
      r.location.split(',')[0],
    ]);

    autoTable(docPdf, {
      startY: 30,
      head: [['RID', 'Applicant', 'Institution', 'Submission', 'Status', 'Phone', 'Sector']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
    });

    docPdf.save(`Bureau_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);

    logAuditAction(
      db,
      user,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'operational_report',
      `Exported operational intelligence PDF ledger for ${filteredData.length} records.`
    );

    toast({
      title: 'PDF Document Generated',
      description: 'Official documentation has been saved to your local terminal.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  function resetFilters() {
    setSearchTerm('');
    setStatusFilter('all');
    setOriginFilter('ALL');
    setSelectedOfficerScope('GLOBAL');
    setStartDate('2020-01-01');
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
    setCurrentPage(1);
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
              <BarChart3 className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-headline">
                Operational Intelligence
              </h1>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                Exact 2-Decimal Rate Analytics & Multi-Channel Ledger
              </p>
            </div>
          </div>
        </div>

        {/* Top Quick Scope & Date Presets */}
        <div className="flex flex-wrap items-center gap-2 bg-card p-2.5 rounded-2xl border border-border shadow-sm">
          {isAdmin && (
            <Select value={selectedOfficerScope} onValueChange={setSelectedOfficerScope}>
              <SelectTrigger className="h-9 w-[200px] rounded-xl text-xs font-bold">
                <Users className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
                <SelectValue placeholder="All Bureau Personnel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GLOBAL" className="text-xs font-bold">
                  All Bureau Personnel (Global)
                </SelectItem>
                {(allUsers || []).map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-xs font-medium">
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applyDatePreset('7D')}
              className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider rounded-lg"
            >
              7 Days
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applyDatePreset('30D')}
              className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider rounded-lg"
            >
              30 Days
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applyDatePreset('MONTH')}
              className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider rounded-lg"
            >
              This Month
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applyDatePreset('ALL')}
              className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider rounded-lg"
            >
              All Time
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="overflow-hidden rounded-2xl">
            <CardHeader className="bg-white/30 dark:bg-white/[0.02] border-b border-white/60 dark:border-white/10 py-4">
              <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                <Filter className="h-3 w-3 text-primary" /> Triage Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                  Search Terminal
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  <Input
                    placeholder="ID, Name, Institution..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="glass-auth-input pl-10 h-11 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                  Origin Channel
                </label>
                <Select value={originFilter} onValueChange={setOriginFilter}>
                  <SelectTrigger className="glass-auth-input h-11 rounded-xl text-xs font-bold">
                    <Building2 className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
                    <SelectValue placeholder="All Origins" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs font-bold">
                      All Origins
                    </SelectItem>
                    <SelectItem value="INSTITUTION" className="text-xs font-bold">
                      Institutions Only
                    </SelectItem>
                    <SelectItem value="INDIVIDUAL" className="text-xs font-bold">
                      Individuals Only
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                  Operational Period
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="glass-auth-input h-11 rounded-xl text-xs"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="glass-auth-input h-11 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                  Current Status
                </label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="glass-auth-input h-11 rounded-xl text-xs font-bold">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs font-bold">
                      All Categories
                    </SelectItem>
                    <SelectItem value="Processed" className="text-xs font-bold">
                      Processed ({stats.processedRate.toFixed(2)}%)
                    </SelectItem>
                    <SelectItem value="Processing" className="text-xs font-bold">
                      Processing ({stats.processingRate.toFixed(2)}%)
                    </SelectItem>
                    <SelectItem value="Rejected" className="text-xs font-bold">
                      Rejected ({stats.rejectedRate.toFixed(2)}%)
                    </SelectItem>
                    <SelectItem value="Failed" className="text-xs font-bold">
                      Failed ({stats.failedRate.toFixed(2)}%)
                    </SelectItem>
                    <SelectItem value="Pending Review" className="text-xs font-bold">
                      Pending Review ({stats.pendingRate.toFixed(2)}%)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-3 space-y-3">
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1 mb-2">
                  Export Intelligence
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={handleExportExcel}
                    disabled={isExporting || filteredData.length === 0}
                    variant="outline"
                    className="glass-subpanel h-10 !border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-bold text-[10px] uppercase tracking-widest rounded-xl"
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> XLS
                  </Button>
                  <Button
                    onClick={handleExportPDF}
                    disabled={isExporting || filteredData.length === 0}
                    variant="outline"
                    className="glass-subpanel h-10 !border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 font-bold text-[10px] uppercase tracking-widest rounded-xl"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full h-10 rounded-xl font-black text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  onClick={resetFilters}
                >
                  Reset Matrix
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="glass-subpanel p-6 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                Exact Success Ratio
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-mono font-black text-emerald-600 dark:text-emerald-400 tracking-tighter tabular-nums">
                {stats.processedRate.toFixed(2)}%
              </p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">
                {stats.processed} Processed of {stats.total} in scope
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 min-w-0 space-y-8">
          {/* Interactive Click-to-Filter Stat Cards with Exact 2-Decimal Rates */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <StatCard
              label="Total Intake"
              value={stats.total}
              rate="100.00%"
              active={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
              color="blue"
              icon={TrendingUp}
            />
            <StatCard
              label="Success Rate"
              value={stats.processed}
              rate={`${stats.processedRate.toFixed(2)}%`}
              active={statusFilter === 'Processed'}
              onClick={() =>
                setStatusFilter(statusFilter === 'Processed' ? 'all' : 'Processed')
              }
              color="green"
              icon={CheckCircle2}
            />
            <StatCard
              label="Processing"
              value={stats.processing}
              rate={`${stats.processingRate.toFixed(2)}%`}
              active={statusFilter === 'Processing'}
              onClick={() =>
                setStatusFilter(statusFilter === 'Processing' ? 'all' : 'Processing')
              }
              color="indigo"
              icon={Clock}
            />
            <StatCard
              label="Rejection Rate"
              value={stats.rejected}
              rate={`${stats.rejectedRate.toFixed(2)}%`}
              active={statusFilter === 'Rejected'}
              onClick={() => setStatusFilter(statusFilter === 'Rejected' ? 'all' : 'Rejected')}
              color="red"
              icon={XCircle}
            />
            <StatCard
              label="Failed Rate"
              value={stats.failed}
              rate={`${stats.failedRate.toFixed(2)}%`}
              active={statusFilter === 'Failed'}
              onClick={() => setStatusFilter(statusFilter === 'Failed' ? 'all' : 'Failed')}
              color="slate"
              icon={AlertCircle}
            />
            <StatCard
              label="Pending Rate"
              value={stats.pending}
              rate={`${stats.pendingRate.toFixed(2)}%`}
              active={statusFilter === 'Pending Review'}
              onClick={() =>
                setStatusFilter(statusFilter === 'Pending Review' ? 'all' : 'Pending Review')
              }
              color="amber"
              icon={Clock}
            />
          </div>

          <Card className="overflow-hidden rounded-3xl relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
            />
            <CardHeader className="bg-white/30 dark:bg-white/[0.02] border-b border-white/60 dark:border-white/10 py-5 px-6 sm:px-8 flex flex-row items-center justify-between relative z-10">
              <div>
                <CardTitle className="text-sm font-black text-foreground uppercase tracking-[0.2em]">
                  Status & Rate Distribution
                </CardTitle>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  Exact 2-decimal status allocation across {stats.total} records
                </p>
              </div>
              <BarChart3 className="h-4 w-4 text-primary opacity-60" />
            </CardHeader>
            <CardContent className="p-5 sm:p-8 relative z-10">
              <div className="glass-chart-surface p-4 h-[290px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 24, left: -12, bottom: 0 }}>
                    <defs>
                      {chartData.map((entry, idx) => (
                        <linearGradient
                          key={`barGrad-${idx}`}
                          id={`barGrad-${idx}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={entry.color} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={entry.color} stopOpacity={0.35} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 800, fill: 'hsl(var(--muted-foreground))' }}
                      textAnchor="middle"
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 800, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148, 163, 184, 0.12)', radius: 10 }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="glass-chart-tooltip p-3.5">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                {d.name}
                              </p>
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor: d.color,
                                    boxShadow: `0 0 8px ${d.color}`,
                                  }}
                                />
                                <p className="text-xl font-mono font-black text-foreground tracking-tighter tabular-nums">
                                  {d.value} ({Number(d.rate).toFixed(2)}%)
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="value" radius={[10, 10, 4, 4]} barSize={44}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={`url(#barGrad-${index})`}
                          stroke={entry.color}
                          strokeWidth={1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="glass-card-surface rounded-[24px] overflow-hidden">
            {/* Bulk Selection Bar */}
            {selectedIds.size > 0 && (
              <div className="bg-primary text-primary-foreground flex flex-col sm:flex-row items-center justify-between px-5 py-2.5 gap-3">
                <span className="text-xs font-black uppercase tracking-wider">
                  {selectedIds.size} Records Selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isBulkUpdating}
                    onClick={() => handleBulkStatusUpdate('Processed')}
                    className="h-8 px-3 text-[10px] font-black uppercase tracking-wider rounded-lg"
                  >
                    Mark Processed
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isBulkUpdating}
                    onClick={() => handleBulkStatusUpdate('Processing')}
                    className="h-8 px-3 text-[10px] font-black uppercase tracking-wider rounded-lg"
                  >
                    Mark Processing
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set())}
                    className="h-8 px-2.5 text-white hover:bg-white/15"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Integrated Top Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-3.5 border-b border-white/60 dark:border-white/10 bg-white/25 dark:bg-white/[0.02]">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search ID, applicant name, institution, phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-9 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="glass-subpanel inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    {startDate} — {endDate}
                  </span>
                </div>
                <Button
                  onClick={handleExportExcel}
                  disabled={isExporting || filteredData.length === 0}
                  variant="outline"
                  className="glass-subpanel h-9 px-3 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> Export XLS
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={resetFilters}
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
                      <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>Registry ID</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>Applicant & Channel</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>Submission Date</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>Status</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>Region</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
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
                  {paginatedData.map((reg) => {
                    const instName = (reg.institutionName || reg.schoolName || '').trim();
                    return (
                      <TableRow
                        key={reg.id}
                        className={cn(
                          'h-14',
                          selectedIds.has(reg.id) && 'bg-blue-50/40 dark:bg-blue-950/20'
                        )}
                      >
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.has(reg.id)}
                            onCheckedChange={() => toggleSelectRow(reg.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => handleCopyRid(reg.id)}
                            title="Click to copy full RID"
                            className="inline-flex items-center gap-1.5 text-[12px] font-mono text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer group/rid"
                          >
                            <FileDigit className="h-3.5 w-3.5 text-slate-400 group-hover/rid:text-blue-600 dark:group-hover/rid:text-blue-400 shrink-0 transition-colors" />
                            <span>{reg.id.substring(0, 12)}...</span>
                            {copiedId === reg.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Copy className="h-3 w-3 text-slate-400 group-hover/rid:text-blue-600 dark:group-hover/rid:text-blue-400 shrink-0 transition-colors" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                              {reg.applicantName}
                            </span>
                            {instName ? (
                              <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                                <Building2 className="h-2.5 w-2.5" /> {instName}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Individual</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-[13px] text-slate-600 dark:text-slate-300">
                            {format(new Date(reg.submissionDate), 'dd MMM yyyy')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={reg.status} />
                        </TableCell>
                        <TableCell>
                          <div className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                            {reg.location.split(',')[0]}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <Link
                              href={`/status-check?id=${reg.id}`}
                              title="View Record"
                              className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <RegistrationFormModal
                              registration={reg}
                              mode="edit"
                              trigger={
                                <button
                                  type="button"
                                  title="Edit Record"
                                  className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <SquarePen className="h-4 w-4" />
                                </button>
                              }
                            />
                            <button
                              type="button"
                              title="Delete Record"
                              onClick={() => {
                                if (!db) return;
                                deleteDocumentNonBlocking(doc(db, 'registrations', reg.id));
                                toast({
                                  title: 'Record Purged',
                                  description: `Removed ${reg.applicantName} from the registry.`,
                                  variant: 'destructive',
                                });
                              }}
                              className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Filter className="h-8 w-8 text-slate-300" />
                          <p className="text-xs font-semibold text-slate-400">Zero Matches</p>
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
              showingCount={paginatedData.length}
              totalCount={filteredData.length}
              itemLabel="records"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, rate, active, onClick, color, icon: Icon }: any) {
  const textClasses: any = {
    blue: 'text-blue-600 dark:text-blue-400 !bg-blue-500/[0.08] !border-blue-500/25',
    green: 'text-emerald-600 dark:text-emerald-400 !bg-emerald-500/[0.08] !border-emerald-500/25',
    indigo: 'text-indigo-600 dark:text-indigo-400 !bg-indigo-500/[0.08] !border-indigo-500/25',
    red: 'text-rose-600 dark:text-rose-400 !bg-rose-500/[0.08] !border-rose-500/25',
    slate: 'text-slate-700 dark:text-slate-300',
    amber: 'text-amber-600 dark:text-amber-400 !bg-amber-500/[0.08] !border-amber-500/25',
  };

  return (
    <Card
      onClick={onClick}
      className={cn(
        'rounded-2xl transition-all hover:-translate-y-0.5 cursor-pointer select-none',
        textClasses[color],
        active && 'ring-2 ring-primary shadow-md'
      )}
    >
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-80">{label}</p>
          <Icon className="h-3.5 w-3.5 opacity-50" strokeWidth={2.5} />
        </div>
        <p className="text-xl font-mono font-black tracking-tighter tabular-nums">{rate}</p>
        <p className="text-[10px] font-mono font-bold opacity-75 tabular-nums">
          {value.toLocaleString()} records
        </p>
      </CardContent>
    </Card>
  );
}
