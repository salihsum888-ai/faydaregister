'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc, limit, writeBatch } from 'firebase/firestore';
import { updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Printer,
  CheckCircle2,
  Search,
  Loader2,
  ArrowLeft,
  Calendar,
  Filter,
  FileDigit,
  Clock,
  History,
  LayoutGrid,
  X,
  FileSpreadsheet,
  FileText,
  ArrowUpDown,
  Eye,
  RotateCcw,
  Copy,
  Check,
  SquarePen,
  Trash2,
  Building2,
  Users,
  QrCode,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { format, isSameMonth } from 'date-fns';
import { Registration, UserProfile } from '@/lib/types';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { RegistrationFormModal } from '@/components/registrations/registration-form-modal';
import { TablePagination } from '@/components/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { logAuditAction } from '@/lib/audit';
import { useTranslation } from '@/i18n/language-provider';

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PrintingPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { t, formatNumber } = useTranslation();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterPrinted, setFilterPrinted] = useState<'all' | 'pending' | 'printed'>('pending');
  const [periodFilter, setPeriodFilter] = useState<'current' | 'all'>('all');
  const [selectedOfficerScope, setSelectedOfficerScope] = useState<string>('GLOBAL');
  const [originFilter, setOriginFilter] = useState<string>('ALL');
  const [isExporting, setIsExporting] = useState(false);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Official Issuance Slip Modal State
  const [slipRecord, setSlipRecord] = useState<Registration | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
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

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

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

  // Base Processed Queue scoped by Officer, Period, and Origin
  const scopedProcessedRecords = useMemo(() => {
    if (!registrations) return [];
    const now = new Date();
    return registrations.filter((reg) => {
      if (reg.status !== 'Processed') return false;
      if (
        isAdmin &&
        selectedOfficerScope !== 'GLOBAL' &&
        reg.assignedReviewerId !== selectedOfficerScope
      ) {
        return false;
      }
      if (periodFilter === 'current') {
        const regDate = new Date(reg.submissionDate);
        if (!isSameMonth(regDate, now)) return false;
      }
      const instName = (reg.institutionName || reg.schoolName || '').trim();
      if (originFilter === 'INSTITUTION' && !instName) return false;
      if (originFilter === 'INDIVIDUAL' && instName) return false;
      return true;
    });
  }, [registrations, isAdmin, selectedOfficerScope, periodFilter, originFilter]);

  // Exact 2-Decimal Production Metrics
  const productionMetrics = useMemo(() => {
    const total = scopedProcessedRecords.length;
    const printed = scopedProcessedRecords.filter((r) => r.isPrinted).length;
    const pending = total - printed;
    const issuanceRate = total > 0 ? Number(((printed / total) * 100).toFixed(2)) : 0;
    const pendingRate = total > 0 ? Number(((pending / total) * 100).toFixed(2)) : 0;

    const instRecords = scopedProcessedRecords.filter(
      (r) => (r.institutionName || r.schoolName || '').trim().length > 0
    );
    const instTotal = instRecords.length;
    const instPrinted = instRecords.filter((r) => r.isPrinted).length;
    const instIssuanceRate =
      instTotal > 0 ? Number(((instPrinted / instTotal) * 100).toFixed(2)) : 0;

    return {
      total,
      printed,
      pending,
      issuanceRate,
      pendingRate,
      instTotal,
      instPrinted,
      instIssuanceRate,
    };
  }, [scopedProcessedRecords]);

  const filteredItems = useMemo(() => {
    return scopedProcessedRecords
      .filter((reg) => {
        const q = searchTerm.toLowerCase();
        const instName = (reg.institutionName || reg.schoolName || '').toLowerCase();
        const matchesSearch =
          reg.applicantName.toLowerCase().includes(q) ||
          reg.id.toLowerCase().includes(q) ||
          instName.includes(q);
        if (!matchesSearch) return false;

        if (filterPrinted === 'pending' && reg.isPrinted) return false;
        if (filterPrinted === 'printed' && !reg.isPrinted) return false;

        return true;
      })
      .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
  }, [scopedProcessedRecords, searchTerm, filterPrinted]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchTerm, filterPrinted, periodFilter, selectedOfficerScope, originFilter]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredItems, currentPage]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  const allOnPageSelected =
    paginatedItems.length > 0 && paginatedItems.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      paginatedItems.forEach((r) => next.delete(r.id));
    } else {
      paginatedItems.forEach((r) => {
        if (!r.isPrinted) next.add(r.id);
      });
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkMarkPrinted = async () => {
    if (!db || selectedIds.size === 0 || !user || !profile) return;

    setIsBulkProcessing(true);
    const batch = writeBatch(db);
    const count = selectedIds.size;
    const nowTs = format(new Date(), 'MMM dd, HH:mm');

    selectedIds.forEach((id) => {
      const reg = filteredItems.find((r) => r.id === id);
      batch.update(doc(db, 'registrations', id), {
        isPrinted: true,
        updatedAt: new Date().toISOString(),
        remarks: `${reg?.remarks || ''}\n[PRINTING TERMINAL]: Bulk marked as physically printed on ${nowTs}`,
      });
    });

    try {
      await batch.commit();

      logAuditAction(
        db,
        user,
        profile.fullName,
        'STATUS_UPDATE',
        'bulk_printing',
        `Bulk Printing: Marked ${count} processed records as physically issued.`
      );

      toast({
        title: 'Bulk Issuance Complete',
        description: `Successfully marked ${count} IDs as printed.`,
      });
      setSelectedIds(new Set());
    } catch {
      toast({
        variant: 'destructive',
        title: 'Bulk Operation Failed',
        description: 'Protocol error during mass printing synchronization.',
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleMarkPrinted = async (reg: Registration, printedState = true) => {
    if (!db || !user || !profile) return;

    try {
      await updateDocumentNonBlocking(doc(db, 'registrations', reg.id), {
        isPrinted: printedState,
        updatedAt: new Date().toISOString(),
        remarks: `${reg.remarks || ''}\n[PRINTING TERMINAL]: Marked as ${
          printedState ? 'physically printed' : 'pending reprint'
        } on ${format(new Date(), 'MMM dd, HH:mm')}`,
      });

      logAuditAction(
        db,
        user,
        profile.fullName,
        'STATUS_UPDATE',
        reg.id,
        `Printing Terminal: Marked ID for ${reg.applicantName} as ${
          printedState ? 'physically issued' : 'pending reprint'
        }.`
      );

      toast({
        title: printedState ? 'ID Issued' : 'Reverted to Pending',
        description: printedState
          ? `Physical ID for ${reg.applicantName} marked as printed.`
          : `${reg.applicantName} returned to the pending print queue.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Protocol Failure',
        description: 'Could not synchronize printing status with bureau ledger.',
      });
    }
  };

  const handleExportExcel = () => {
    if (filteredItems.length === 0 || !profile) return;
    setIsExporting(true);

    const exportData = filteredItems.map((r) => ({
      'Registry ID': r.id,
      Applicant: r.applicantName,
      Institution: r.institutionName || r.schoolName || 'Individual',
      'Inbound Date': format(new Date(r.submissionDate), 'yyyy-MM-dd'),
      Phone: r.phone,
      Location: r.location,
      'Issuance Status': r.isPrinted ? 'PRINTED' : 'PENDING',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production_Queue');
    XLSX.writeFile(wb, `Bureau_Production_Queue_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    logAuditAction(
      db,
      user!,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'printing_terminal',
      `Exported XLSX production report for ${filteredItems.length} IDs.`
    );

    toast({
      title: 'Excel Queue Generated',
      description: 'Issuance manifest has been downloaded.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (filteredItems.length === 0 || !profile) return;
    setIsExporting(true);

    const docPdf = new jsPDF('l', 'mm', 'a4');
    docPdf.text('Official Bureau Production & Issuance Manifest', 14, 15);
    docPdf.setFontSize(10);
    docPdf.text(
      `Issuer: ${profile.fullName} | Queue: ${filteredItems.length} Units | Issuance Rate: ${productionMetrics.issuanceRate.toFixed(
        2
      )}% | Date: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
      14,
      22
    );

    const rows = filteredItems.map((r) => [
      r.id.substring(0, 15) + '...',
      r.applicantName,
      r.institutionName || r.schoolName || 'Individual',
      format(new Date(r.submissionDate), 'MMM dd, yyyy'),
      r.phone,
      r.location.split(',')[0],
      r.isPrinted ? 'PRINTED' : 'PENDING',
    ]);

    autoTable(docPdf, {
      startY: 30,
      head: [
        [
          'Registry ID',
          'Applicant Name',
          'Institution',
          'Inbound Date',
          'Phone',
          'Sector',
          'Status',
        ],
      ],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
    });

    docPdf.save(`Bureau_Issuance_Manifest_${format(new Date(), 'yyyyMMdd')}.pdf`);

    logAuditAction(
      db,
      user!,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'printing_terminal',
      `Exported PDF production report for ${filteredItems.length} IDs.`
    );

    toast({
      title: 'PDF Manifest Generated',
      description: 'High-fidelity production document saved.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  if (isUserLoading || isLoading || !user) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
            Authenticating Terminal...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-1">
          <Link
            href={isAdmin ? '/admin' : '/dashboard'}
            className="flex items-center text-[10px] font-black text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest gap-1.5 mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> {t.common.back}
          </Link>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
              <Printer className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">
                {t.printingPage.titleMain} {t.printingPage.titleHighlight}
              </h1>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                {t.printingPage.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-card p-2.5 rounded-2xl border shadow-sm">
          {isAdmin && (
            <Select value={selectedOfficerScope} onValueChange={setSelectedOfficerScope}>
              <SelectTrigger className="h-9 w-[200px] rounded-xl text-xs font-bold">
                <Users className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
                <SelectValue placeholder={t.common.all} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GLOBAL" className="text-xs font-bold">
                  {t.common.all}
                </SelectItem>
                {(allUsers || []).map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-xs font-medium">
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={originFilter} onValueChange={setOriginFilter}>
            <SelectTrigger className="h-9 w-[165px] rounded-xl text-xs font-bold">
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
              <SelectValue placeholder={t.printingPage.allInstitutionsItem} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs font-bold">
                {t.printingPage.allInstitutionsItem}
              </SelectItem>
              <SelectItem value="INSTITUTION" className="text-xs font-bold">
                {t.printingPage.kpiInstBatchTitle}
              </SelectItem>
              <SelectItem value="INDIVIDUAL" className="text-xs font-bold">
                {t.printingPage.individualWalkInsItem}
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 px-2">
            <Button
              onClick={handleExportExcel}
              disabled={isExporting || filteredItems.length === 0}
              variant="outline"
              className="h-9 px-3 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 font-bold text-[10px] uppercase tracking-widest rounded-xl"
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
              )}
              XLS
            </Button>
            <Button
              onClick={handleExportPDF}
              disabled={isExporting || filteredItems.length === 0}
              variant="outline"
              className="h-9 px-3 border-rose-500/20 text-rose-600 hover:bg-rose-500/5 font-bold text-[10px] uppercase tracking-widest rounded-xl"
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <FileText className="h-3.5 w-3.5 mr-1" />
              )}
              PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Exact 2-Decimal Issuance KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          onClick={() => setFilterPrinted('all')}
          className={cn(
            'cursor-pointer rounded-2xl transition-all hover:-translate-y-0.5 border',
            filterPrinted === 'all' ? 'ring-2 ring-primary border-primary' : 'border-border'
          )}
        >
          <CardContent className="p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {t.printingPage.kpiApprovedTitle}
              </span>
              <Printer className="h-4 w-4 text-primary" />
            </div>
            <p className="text-3xl font-mono font-black text-foreground tabular-nums">
              {formatNumber(productionMetrics.total)}
            </p>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {t.printingPage.kpiApprovedSub}
            </p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setFilterPrinted('pending')}
          className={cn(
            'cursor-pointer rounded-2xl transition-all hover:-translate-y-0.5 border',
            filterPrinted === 'pending'
              ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-500/[0.04]'
              : 'border-border'
          )}
        >
          <CardContent className="p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                {t.printingPage.kpiReadyTitle}
              </span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-mono font-black text-amber-600 dark:text-amber-400 tabular-nums">
                {productionMetrics.pendingRate.toFixed(2)}%
              </p>
              <span className="text-xs font-mono font-bold text-muted-foreground">
                {productionMetrics.pending} / {productionMetrics.total}
              </span>
            </div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {t.printingPage.tabReady}
            </p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setFilterPrinted('printed')}
          className={cn(
            'cursor-pointer rounded-2xl transition-all hover:-translate-y-0.5 border',
            filterPrinted === 'printed'
              ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/[0.04]'
              : 'border-border'
          )}
        >
          <CardContent className="p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                {t.printingPage.kpiIssuedTitle}
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {productionMetrics.issuanceRate.toFixed(2)}%
              </p>
              <span className="text-xs font-mono font-bold text-muted-foreground">
                {productionMetrics.printed} / {productionMetrics.total}
              </span>
            </div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {t.printingPage.tabPrinted}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border">
          <CardContent className="p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {t.printingPage.kpiInstBatchTitle}
              </span>
              <Building2 className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-mono font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                {productionMetrics.instIssuanceRate.toFixed(2)}%
              </p>
              <span className="text-xs font-mono font-bold text-muted-foreground">
                {productionMetrics.instPrinted} / {productionMetrics.instTotal}
              </span>
            </div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {t.printingPage.batchSectionTitle}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-2xl">
            <CardHeader className="bg-muted/30 border-b border-border py-4">
              <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                <Filter className="h-3 w-3" /> Queue Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                  Duty Period
                </label>
                <div className="flex flex-col gap-2">
                  <Button
                    variant={periodFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start font-bold text-[10px] uppercase tracking-widest h-10 rounded-xl"
                    onClick={() => setPeriodFilter('all')}
                  >
                    <LayoutGrid className="mr-2 h-3.5 w-3.5" /> All Processed Records
                  </Button>
                  <Button
                    variant={periodFilter === 'current' ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start font-bold text-[10px] uppercase tracking-widest h-10 rounded-xl"
                    onClick={() => setPeriodFilter('current')}
                  >
                    <Calendar className="mr-2 h-3.5 w-3.5" /> Current Month Only
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                  Search Registry
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  <Input
                    placeholder="Name, RID, or Institution..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 border-border bg-background rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                  Issuance Status
                </label>
                <div className="flex flex-col gap-2">
                  <Button
                    variant={filterPrinted === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start font-bold text-[10px] uppercase tracking-widest h-10 rounded-xl"
                    onClick={() => setFilterPrinted('pending')}
                  >
                    <Clock className="mr-2 h-3.5 w-3.5" /> Pending Printing (
                    {productionMetrics.pending})
                  </Button>
                  <Button
                    variant={filterPrinted === 'printed' ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start font-bold text-[10px] uppercase tracking-widest h-10 rounded-xl"
                    onClick={() => setFilterPrinted('printed')}
                  >
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Already Printed (
                    {productionMetrics.printed})
                  </Button>
                  <Button
                    variant={filterPrinted === 'all' ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start font-bold text-[10px] uppercase tracking-widest h-10 rounded-xl"
                    onClick={() => setFilterPrinted('all')}
                  >
                    <Filter className="mr-2 h-3.5 w-3.5" /> All Status ({productionMetrics.total})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 min-w-0 space-y-4">
          <div className="bg-white dark:bg-card rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_30px_rgba(15,23,42,0.04)] overflow-hidden relative">
            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
              <div className="bg-blue-600 text-white flex flex-col sm:flex-row items-center justify-between px-5 py-2.5 gap-3">
                <p className="text-xs font-semibold">{selectedIds.size} Records Selected</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs font-semibold text-white hover:bg-white/15"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" /> Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3.5 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white rounded-lg"
                    onClick={handleBulkMarkPrinted}
                    disabled={isBulkProcessing}
                  >
                    {isBulkProcessing ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Printer className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Mark All as Printed
                  </Button>
                </div>
              </div>
            )}

            {/* Integrated Top Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search applicant name, institution, or 29-digit RID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-9 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    {periodFilter === 'current' ? format(new Date(), 'MMMM yyyy') : 'All Periods'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterPrinted('pending');
                    setPeriodFilter('all');
                    setOriginFilter('ALL');
                  }}
                  className="h-9 w-9 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 shadow-2xs"
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
                        checked={allOnPageSelected}
                        onCheckedChange={toggleSelectAll}
                        className="rounded-[4px] border-slate-300 dark:border-slate-700"
                      />
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t.printingPage.colRid}</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t.printingPage.colApplicant}</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t.printingPage.dateFieldLabel}</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t.printingPage.colDispatchState}</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead className="border-r-0 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>{t.printingPage.colActions}</span>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.length > 0 ? (
                    paginatedItems.map((reg) => {
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
                              disabled={reg.isPrinted}
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => handleCopyRid(reg.id)}
                              title={t.printingPage.colRid}
                              className="inline-flex items-center gap-1.5 text-[12px] font-mono text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap cursor-pointer group/rid"
                            >
                              <FileDigit className="h-3.5 w-3.5 text-slate-400 group-hover/rid:text-blue-600 dark:group-hover/rid:text-blue-400 shrink-0 transition-colors" />
                              <span>{reg.id.substring(0, 14)}...</span>
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
                                <span className="text-[10px] text-muted-foreground">
                                  {t.printingPage.individualWalkInLabel}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-[13px] text-slate-600 dark:text-slate-300">
                              {format(new Date(reg.submissionDate), 'dd MMM yyyy')}
                            </span>
                          </TableCell>
                          <TableCell>
                            {reg.isPrinted ? (
                              <span className="inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/50 dark:text-emerald-400">
                                {t.printingPage.printedBadge}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold bg-[#FFFBEB] text-[#F59E0B] dark:bg-amber-950/50 dark:text-amber-400">
                                {t.printingPage.readyQueueBadge}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center justify-end gap-1">
                              {!reg.isPrinted ? (
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg h-8 px-2.5 shadow-2xs transition-all mr-1"
                                  onClick={() => handleMarkPrinted(reg, true)}
                                >
                                  <Printer className="mr-1 h-3.5 w-3.5" /> {t.printingPage.issueCardBtn}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2.5 text-[11px] font-semibold rounded-lg mr-1"
                                  onClick={() => handleMarkPrinted(reg, false)}
                                  title={t.printingPage.revertQueueBtn}
                                >
                                  <Undo2 className="mr-1 h-3 w-3" /> {t.printingPage.requeueBtn}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-[11px] font-semibold rounded-lg mr-1"
                                onClick={() => setSlipRecord(reg)}
                                title={t.printingPage.slipModalTitle}
                              >
                                <QrCode className="h-3.5 w-3.5 mr-1 text-primary" /> {t.printingPage.slipBtn}
                              </Button>
                              <Link
                                href={`/status-check?id=${reg.id}`}
                                title={t.common.view}
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
                                    title={t.common.edit}
                                    className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <SquarePen className="h-4 w-4" />
                                  </button>
                                }
                              />
                              <button
                                type="button"
                                title={t.common.delete}
                                onClick={() => {
                                  if (!db) return;
                                  deleteDocumentNonBlocking(doc(db, 'registrations', reg.id));
                                  toast({
                                    title: t.common.delete,
                                    description: reg.applicantName,
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
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Printer className="h-8 w-8 text-slate-300" />
                          <p className="text-xs font-semibold text-slate-400">
                            {t.printingPage.emptyTitle}
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
              showingCount={paginatedItems.length}
              totalCount={filteredItems.length}
              itemLabel={t.printingPage.recordsItemLabel}
            />
          </div>
        </div>
      </div>

      {/* Official Printable ID Issuance Slip Modal */}
      <Dialog open={!!slipRecord} onOpenChange={(open) => !open && setSlipRecord(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t.printingPage.slipModalTitle}
            </DialogTitle>
            <DialogDescription>
              {t.printingPage.slipModalDesc}
            </DialogDescription>
          </DialogHeader>

          {slipRecord && (
            <div className="p-5 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.03] space-y-4">
              <div className="flex items-start justify-between border-b border-border pb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                    {t.printingPage.slipHeaderBadge}
                  </p>
                  <h3 className="text-lg font-black text-foreground mt-0.5">
                    {slipRecord.applicantName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {slipRecord.institutionName ||
                      slipRecord.schoolName ||
                      t.printingPage.individualEnrollmentText}
                  </p>
                </div>
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest',
                    slipRecord.isPrinted
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-amber-500/15 text-amber-600'
                  )}
                >
                  {slipRecord.isPrinted ? t.printingPage.statusIssuedBadge : t.printingPage.statusReadyBadge}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-background border border-border">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    {t.printingPage.ridFieldLabel}
                  </span>
                  <span className="font-mono font-bold text-foreground break-all">
                    {slipRecord.id}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-background border border-border">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                      {t.printingPage.phoneFieldLabel}
                    </span>
                    <span className="font-mono font-bold">{slipRecord.phone || 'N/A'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-background border border-border">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                      {t.printingPage.dateFieldLabel}
                    </span>
                    <span className="font-mono font-bold">
                      {format(new Date(slipRecord.submissionDate), 'yyyy-MM-dd')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            {slipRecord && !slipRecord.isPrinted && (
              <Button
                onClick={() => {
                  handleMarkPrinted(slipRecord, true);
                  setSlipRecord({ ...slipRecord, isPrinted: true });
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> {t.printingPage.markAsIssuedModalBtn}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="font-bold text-xs rounded-xl"
            >
              <Printer className="h-4 w-4 mr-1.5" /> {t.printingPage.printSlipModalBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
