
"use client"

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  ArrowLeft, 
  Trash2, 
  Database,
  Calendar,
  Save,
  FileSpreadsheet,
  FileText,
  Loader2,
  AlertCircle,
  Edit2,
  X,
  ShieldAlert,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Search,
  ArrowUpDown,
  Eye,
  RotateCcw,
  SquarePen
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import Link from 'next/link';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, where, serverTimestamp, doc, writeBatch } from 'firebase/firestore';
import { setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { MonthlySummary, UserProfile } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { logAuditAction } from '@/lib/audit';
import { format } from 'date-fns';

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

const YEARS = Array.from({ length: 11 }, (_, i) => (new Date().getFullYear() - 5 + i).toString()).reverse();

export default function HistoricalDataPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isConfirmBulkPurgeOpen, setIsConfirmBulkPurgeOpen] = useState(false);

  // Pagination & Filter State
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const itemsPerPage = 8;

  // Deletion State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [summaryToDelete, setSummaryToDelete] = useState<{id: string, label: string} | null>(null);
  
  // Form State
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [ethio, setEthio] = useState('0');
  const [safaricom, setSafaricom] = useState('0');
  
  // Breakdown State
  const [processed, setProcessed] = useState('0');
  const [processing, setProcessing] = useState('0');
  const [rejected, setRejected] = useState('0');
  const [failed, setFailed] = useState('0');
  const [pendingReview, setPendingReview] = useState('0');

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  // Fetch summaries for this officer
  const summariesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'monthly_summaries'),
      where('officerId', '==', user.uid)
    );
  }, [db, user]);

  const { data: rawHistory, isLoading } = useCollection<MonthlySummary>(summariesQuery);

  const history = useMemo(() => {
    if (!rawHistory) return [];
    return [...rawHistory]
      .filter(item => {
        const label = `${item.month} ${item.year}`.toLowerCase();
        const matchesSearch = !searchTerm || label.includes(searchTerm.toLowerCase());
        const matchesYear = yearFilter === 'all' || item.year === yearFilter;
        return matchesSearch && matchesYear;
      })
      .sort((a, b) => {
        const yearA = parseInt(a.year);
        const yearB = parseInt(b.year);
        if (yearA !== yearB) return yearB - yearA;
        return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
      });
  }, [rawHistory, searchTerm, yearFilter]);

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return history.slice(start, start + itemsPerPage);
  }, [history, currentPage]);

  const totalPages = Math.ceil(history.length / itemsPerPage);

  const allOnPageSelected = paginatedHistory.length > 0 && paginatedHistory.every(h => selectedIds.has(h.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      paginatedHistory.forEach(h => next.delete(h.id));
    } else {
      paginatedHistory.forEach(h => next.add(h.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkPurge = async () => {
    if (!db || selectedIds.size === 0 || !user || !profile) return;
    
    setIsBulkProcessing(true);
    const batch = writeBatch(db);
    const count = selectedIds.size;

    selectedIds.forEach(id => {
      batch.delete(doc(db, 'monthly_summaries', id));
    });

    try {
      await batch.commit();
      
      logAuditAction(
        db,
        user,
        profile.fullName,
        'RECORD_DELETED',
        'bulk_archival_purge',
        `Archival Purge: Permanently deleted ${count} monthly summaries from history ledger.`
      );

      toast({
        title: "Archives Purged",
        description: `Successfully removed ${count} summaries from the bureau ledger.`,
        variant: "destructive"
      });
      setSelectedIds(new Set());
      setIsConfirmBulkPurgeOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Bulk Purge Failed",
        description: "Clearance error during mass archival deletion.",
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleAddData = (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user || !profile) return;

    const eVal = parseInt(ethio) || 0;
    const sVal = parseInt(safaricom) || 0;

    const summaryData = {
      officerId: user.uid,
      month,
      year,
      ethio: eVal,
      safaricom: sVal,
      total: eVal + sVal,
      processed: parseInt(processed) || 0,
      processing: parseInt(processing) || 0,
      rejected: parseInt(rejected) || 0,
      failed: parseInt(failed) || 0,
      pendingReview: parseInt(pendingReview) || 0,
      timestamp: serverTimestamp(),
    };

    const summaryId = editingId || `${user.uid}_${month}_${year}`;
    
    setDocumentNonBlocking(doc(db, 'monthly_summaries', summaryId), summaryData, { merge: true });
    
    logAuditAction(
      db,
      user,
      profile.fullName,
      editingId ? 'STATUS_UPDATE' : 'RECORD_CREATED',
      summaryId,
      `${editingId ? 'Modified' : 'Created'} historical summary for ${month} ${year}. Total: ${eVal + sVal}`
    );

    setIsModalOpen(false);
    resetForm();

    toast({
      title: editingId ? "Summary Updated" : "Monthly Summary Saved",
      description: `Summary for ${month} ${year} has been synchronized successfully.`,
    });
  };

  const handleEdit = (entry: MonthlySummary) => {
    setEditingId(entry.id);
    setMonth(entry.month);
    setYear(entry.year);
    setEthio(entry.ethio.toString());
    setSafaricom(entry.safaricom.toString());
    setProcessed((entry.processed || 0).toString());
    setProcessing((entry.processing || 0).toString());
    setRejected((entry.rejected || 0).toString());
    setFailed((entry.failed || 0).toString());
    setPendingReview((entry.pendingReview || 0).toString());
    setIsModalOpen(true);
  };

  const initiateDelete = (id: string, label: string) => {
    setSummaryToDelete({ id, label });
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!db || !summaryToDelete || !user || !profile) return;
    
    setIsDeleting(true);
    try {
      await deleteDocumentNonBlocking(doc(db, 'monthly_summaries', summaryToDelete.id));
      
      logAuditAction(
        db,
        user,
        profile.fullName,
        'RECORD_DELETED',
        summaryToDelete.id,
        `Purged historical summary for ${summaryToDelete.label} from the ledger.`
      );

      toast({
        title: "Archive Entry Purged",
        description: `Historical data for ${summaryToDelete.label} has been removed.`,
        variant: "destructive",
      });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast({
        title: "Operation Failed",
        description: "Protocol error during ledger purge.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setSummaryToDelete(null);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setMonth(MONTHS[new Date().getMonth()]);
    setYear(new Date().getFullYear().toString());
    setEthio('0');
    setSafaricom('0');
    setProcessed('0');
    setProcessing('0');
    setRejected('0');
    setFailed('0');
    setPendingReview('0');
  };

  const handleExportExcel = () => {
    if (history.length === 0 || !profile) return;
    setIsExporting(true);
    
    const exportData = history.map(h => ({
      'Period': `${h.month} ${h.year}`,
      'Ethio Intake': h.ethio,
      'Safaricom Intake': h.safaricom,
      'Total Intake': h.total,
      'Processed': h.processed || 0,
      'Rejected': h.rejected || 0,
      'Failed': h.failed || 0,
      'Pending': h.pendingReview || 0
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bureau_Historical");
    XLSX.writeFile(wb, `Bureau_Historical_Ledger_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    logAuditAction(db, user!, profile.fullName, 'PERFORMANCE_REVIEW', 'historical_ledger', `Exported XLSX historical ledger archive for ${history.length} months.`);
    
    toast({ title: "Excel Archive Generated", description: "Official historical ledger downloaded." });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (history.length === 0 || !profile) return;
    setIsExporting(true);

    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text("Official Bureau Historical Data Ledger", 14, 15);
    doc.setFontSize(10);
    doc.text(`Official: ${profile.fullName} | Records: ${history.length} Months | Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22);

    const rows = history.map(h => [
      `${h.month} ${h.year}`,
      h.ethio.toLocaleString(),
      h.safaricom.toLocaleString(),
      h.total.toLocaleString(),
      (h.processed || 0).toLocaleString(),
      (h.rejected || 0).toLocaleString(),
      (h.failed || 0).toLocaleString()
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Period', 'Ethio', 'Safaricom', 'Grand Total', 'Processed', 'Rejected', 'Failed']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`Bureau_Historical_Archive_${format(new Date(), 'yyyyMMdd')}.pdf`);
    
    logAuditAction(db, user!, profile.fullName, 'PERFORMANCE_REVIEW', 'historical_ledger', `Exported PDF historical ledger archive for ${history.length} months.`);
    
    toast({ title: "PDF Archive Generated", description: "High-fidelity historical document saved." });
    setTimeout(() => setIsExporting(false), 800);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <Link href="/registrations" className="flex items-center text-[10px] font-black text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest gap-1.5">
        <ArrowLeft className="h-3 w-3" /> Return to Registry
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-headline uppercase leading-none">Historical Data Ledger</h1>
          <p className="text-sm text-muted-foreground">Manage and review monthly registration archives from previous operational periods.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button onClick={handleExportExcel} disabled={isExporting} variant="outline" className="flex-1 h-11 px-4 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 font-bold text-[10px] uppercase tracking-widest rounded-xl bg-card">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> XLS
            </Button>
            <Button onClick={handleExportPDF} disabled={isExporting} variant="outline" className="flex-1 h-11 px-4 border-rose-500/20 text-rose-600 hover:bg-rose-500/5 font-bold text-[10px] uppercase tracking-widest rounded-xl bg-card">
              <FileText className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </div>
          <Dialog open={isModalOpen} onOpenChange={(o) => { if(!o) resetForm(); setIsModalOpen(o); }}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-black text-[10px] uppercase tracking-widest h-11 px-8 rounded-xl shadow-xl shadow-primary/10">
                <Plus className="mr-2 h-4 w-4" /> Archive Data
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl p-0 overflow-hidden rounded-[32px] border-none shadow-2xl bg-popover max-h-[90vh] overflow-y-auto">
              <DialogHeader className="p-8 border-b border-border bg-muted/30">
                <DialogTitle className="text-xl font-black text-foreground uppercase tracking-tighter">
                  {editingId ? 'Modify Archive Entry' : 'Monthly Summary Entry'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddData} className="p-8 space-y-8 bg-card">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Reporting Month</Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger className="h-12 bg-background border-border rounded-xl font-bold text-xs">
                        <SelectValue placeholder="Select Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => <SelectItem key={m} value={m} className="font-bold text-xs">{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Reporting Year</Label>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger className="h-12 bg-background border-border rounded-xl font-bold text-xs">
                        <SelectValue placeholder="Select Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEARS.map(y => <SelectItem key={y} value={y} className="font-bold text-xs">{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Ethio Intake</Label>
                    <Input 
                      type="number" 
                      value={ethio} 
                      onChange={e => setEthio(e.target.value)}
                      className="h-12 bg-background border-border rounded-xl font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Safaricom Intake</Label>
                    <Input 
                      type="number" 
                      value={safaricom} 
                      onChange={e => setSafaricom(e.target.value)}
                      className="h-12 bg-background border-border rounded-xl font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Operational Breakdown</h3>
                    <span className="text-[9px] font-bold text-muted-foreground/40 uppercase hidden sm:inline">Detailed Performance Data</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <StatusField label="Processed" value={processed} onChange={setProcessed} color="emerald" />
                    <StatusField label="Processing" value={processing} onChange={setProcessing} color="blue" />
                    <StatusField label="Pending" value={pendingReview} onChange={setPendingReview} color="amber" />
                    <StatusField label="Rejected" value={rejected} onChange={setRejected} color="rose" />
                    <StatusField label="Failed" value={failed} onChange={setFailed} color="slate" />
                  </div>
                </div>

                <div className="pt-6 border-t border-border flex flex-col gap-3">
                  <Button type="submit" className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/10 transition-all active:scale-[0.98]">
                    <Save className="mr-2 h-4 w-4" /> {editingId ? 'Commit Changes' : 'Synchronize with Archive'}
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => { resetForm(); setIsModalOpen(false); }}
                    className="h-12 font-bold uppercase text-[10px] tracking-widest text-muted-foreground"
                  >
                    Abort Operation
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white dark:bg-card rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_30px_rgba(15,23,42,0.04)] overflow-hidden relative">
        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-600 text-white flex flex-col sm:flex-row items-center justify-between px-5 py-2.5 gap-3">
            <p className="text-xs font-semibold">
              {selectedIds.size} Archives Selected
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-semibold text-white hover:bg-white/15" onClick={() => setSelectedIds(new Set())}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Clear
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-3.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg" 
                onClick={() => setIsConfirmBulkPurgeOpen(true)}
                disabled={isBulkProcessing}
              >
                {isBulkProcessing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                Purge Selected
              </Button>
            </div>
          </div>
        )}

        {/* Integrated Top Control Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search month or year..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="h-9 pl-9 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs">
              <span>Show {itemsPerPage} Row</span>
            </div>
            <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-auto min-w-[120px] h-9 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Year</span>
                  <SelectValue placeholder="All" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs font-medium">All Years</SelectItem>
                {YEARS.map(y => (
                  <SelectItem key={y} value={y} className="text-xs font-medium">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => { setSearchTerm(''); setYearFilter('all'); setCurrentPage(1); }}
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
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} className="rounded-[4px] border-slate-300 dark:border-slate-700" />
                </TableHead>
                <TableHead>
                  <div className="flex items-center justify-between gap-2">
                    <span>Reporting Period</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center justify-between gap-2">
                    <span>Ethio Intake</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center justify-between gap-2">
                    <span>Safaricom Intake</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center justify-between gap-2">
                    <span>Grand Total</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center justify-between gap-2">
                    <span>Processed</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center justify-between gap-2">
                    <span>Rejected</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead className="border-r-0 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span>Action</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-600 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : paginatedHistory.length > 0 ? paginatedHistory.map((entry) => {
                const label = `${entry.month} ${entry.year}`;
                return (
                  <TableRow key={entry.id} className={cn("h-14 group", selectedIds.has(entry.id) && "bg-blue-50/40 dark:bg-blue-950/20")}>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={selectedIds.has(entry.id)} 
                        onCheckedChange={() => toggleSelectRow(entry.id)}
                        className="rounded-[4px] border-slate-300 dark:border-slate-700"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                      {entry.ethio.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                      {entry.safaricom.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-[12px] font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                        {entry.total.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/50 dark:text-emerald-400 text-[11px] font-semibold tabular-nums">
                        {(entry.processed || 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#FEF2F2] text-[#EF4444] dark:bg-rose-950/50 dark:text-rose-400 text-[11px] font-semibold tabular-nums">
                        {(entry.rejected || 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          asChild
                          title="View Comparative Analysis"
                        >
                          <Link href={`/previous?month=${entry.month}&year=${entry.year}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          onClick={() => handleEdit(entry)}
                          title="Edit Archive"
                        >
                          <SquarePen className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          onClick={() => initiateDelete(entry.id, label)}
                          title="Delete Archive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Database className="h-8 w-8 text-slate-300" />
                      <p className="text-xs font-semibold text-slate-400">Archive Vault Empty</p>
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
          totalItems={history.length}
          shownItems={paginatedHistory.length}
          itemLabel="Archives"
          onPageChange={setCurrentPage}
        />
      </div>
      
      <div className="flex items-center gap-3 p-5 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
        <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
        <p className="text-[10px] text-amber-600 font-bold uppercase leading-relaxed tracking-widest max-w-4xl">
          Protocol Reminder: Archived throughput data is strictly isolated to your official signature. These records are subject to forensic auditing. Modifications to finalized historical summaries are logged in the bureau's audit ledger.
        </p>
      </div>

      {/* Professional Deletion Protocol */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
            <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              {isDeleting ? <Loader2 className="h-10 w-10 text-destructive animate-spin" /> : <Trash2 className="h-10 w-10 text-destructive" />}
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                {isDeleting ? "PURGING ARCHIVE..." : "PERMANENT DELETION"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                {isDeleting 
                  ? `Removing historical data for ${summaryToDelete?.label}. Please stand by...`
                  : `You are about to purge the archive entry for ${summaryToDelete?.label}. This action will permanently remove the record from the bureau's centralized historical ledger.`
                }
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="bg-muted/30 p-6 flex-col sm:flex-col gap-3">
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); confirmDelete(); }} 
              disabled={isDeleting}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 active:scale-[0.98] transition-all"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm Purge"}
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
      <AlertDialog open={isConfirmBulkPurgeOpen} onOpenChange={setIsConfirmBulkPurgeOpen}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
            <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              {isBulkProcessing ? <Loader2 className="h-10 w-10 text-destructive animate-spin" /> : <ShieldAlert className="h-10 w-10 text-destructive" />}
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                {isBulkProcessing ? "PURGING ARCHIVES..." : "MASS ARCHIVAL PURGE"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                {isBulkProcessing 
                  ? "Executing bulk archival destruction. Synchronizing with audit ledger..."
                  : `You are about to permanently purge ${selectedIds.size} monthly summaries from the bureau history. This operation cannot be reversed.`
                }
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="bg-muted/30 p-6 flex-col sm:flex-row gap-3">
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleBulkPurge(); }} 
              disabled={isBulkProcessing}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 active:scale-[0.98] transition-all"
            >
              {isBulkProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm Destruction"}
            </AlertDialogAction>
            {!isBulkProcessing && (
              <AlertDialogCancel className="w-full h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent hover:bg-card">
                Abort Protocol
              </AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetricItem({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">{label}</span>
      <span className={cn("text-sm sm:text-base font-black tabular-nums", color)}>{value.toLocaleString()}</span>
    </div>
  );
}

function StatusField({ label, value, onChange, color }: any) {
  const borderClasses: any = {
    emerald: "focus-within:border-emerald-500/50",
    blue: "focus-within:border-blue-500/50",
    amber: "focus-within:border-amber-500/50",
    rose: "focus-within:border-rose-500/50",
    slate: "focus-within:border-slate-500/50",
  };

  return (
    <div className={cn("space-y-1.5 p-3 bg-muted/50 rounded-xl border border-border transition-all", borderClasses[color])}>
      <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">{label}</Label>
      <Input 
        type="number" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className="h-8 border-none bg-transparent p-0 text-sm font-black focus-visible:ring-0" 
      />
    </div>
  );
}
