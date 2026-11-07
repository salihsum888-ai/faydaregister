'use client';

import { useMemo, useState, useEffect } from 'react';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, orderBy, limit, doc, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ShieldCheck, 
  Loader2, 
  User, 
  Clock, 
  Activity, 
  Search, 
  FileDigit,
  Eye,
  Fingerprint,
  History,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ShieldAlert,
  X,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { AuditLog, UserProfile } from '@/lib/types';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AuditLedgerPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPurging, setIsPurging] = useState(false);
  const [isPurgeDialogOpen, setIsPurgeDialogOpen] = useState(false);
  const [purgeConfirmationText, setPurgeConfirmationText] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const auditQuery = useMemoFirebase(() => {
    if (!db || !user || profile?.role !== 'admin') return null;
    return query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(10000));
  }, [db, user, profile?.role]);

  const { data: logs, isLoading } = useCollection<AuditLog>(auditQuery);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => 
      log.officerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [logs, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const allOnPageSelected = paginatedLogs.length > 0 && paginatedLogs.every(log => selectedIds.has(log.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      paginatedLogs.forEach(log => next.delete(log.id));
    } else {
      paginatedLogs.forEach(log => next.add(log.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const isVerified = useMemo(() => {
    return purgeConfirmationText.trim().toUpperCase() === 'DELETE';
  }, [purgeConfirmationText]);

  const handleBulkPurge = () => {
    if (!db || selectedIds.size === 0 || !user || !profile || !isVerified) return;
    
    setIsPurging(true);
    const batch = writeBatch(db);
    const count = selectedIds.size;
    
    selectedIds.forEach(id => {
      batch.delete(doc(db, 'audit_logs', id));
    });

    batch.commit()
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: 'audit_logs',
          operation: 'delete',
        }));
      });
      
    logAuditAction(
      db,
      user,
      profile.fullName,
      'RECORD_DELETED',
      'audit_ledger',
      `Administrative Purge: Permanently deleted ${count} forensic records from the ledger.`
    );

    toast({
      title: "Ledger Purged",
      description: `Successfully removed ${count} records from the forensic archive.`,
    });
    
    setSelectedIds(new Set());
    setPurgeConfirmationText('');
    setIsPurgeDialogOpen(false);
    setTimeout(() => setIsPurging(false), 800);
  };

  const handleExportExcel = () => {
    if (filteredLogs.length === 0 || !user || !profile) return;
    setIsExporting(true);
    
    const exportData = filteredLogs.map(log => ({
      'Timestamp': log.timestamp?.toDate ? format(log.timestamp.toDate(), 'yyyy-MM-dd HH:mm:ss') : 'N/A',
      'Officer': log.officerName,
      'Officer ID': log.officerId,
      'Protocol Action': log.action,
      'Target ID': log.targetId,
      'Narrative Payload': log.details
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Forensic_Ledger");
    XLSX.writeFile(wb, `Bureau_Audit_Ledger_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);

    logAuditAction(db, user, profile.fullName, 'PERFORMANCE_REVIEW', 'audit_ledger', `Administrative Export: Generated XLS forensic archive for ${filteredLogs.length} records.`);
    
    toast({ title: "Excel Archive Generated", description: "The forensic ledger has been synchronized and downloaded." });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (filteredLogs.length === 0 || !user || !profile) return;
    setIsExporting(true);

    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text("Official Bureau Forensic Audit Ledger", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated by: ${profile.fullName} | Total Signatures: ${filteredLogs.length} | Date: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22);

    const rows = filteredLogs.map(log => [
      log.timestamp?.toDate ? format(log.timestamp.toDate(), 'MMM dd, HH:mm') : '-',
      log.officerName,
      log.action.replace(/_/g, ' '),
      log.targetId?.substring(0, 10) + '...',
      log.details.length > 80 ? log.details.substring(0, 80) + '...' : log.details
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Timestamp', 'Signature', 'Action', 'Reference', 'Operational Payload']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`Bureau_Audit_Archive_${format(new Date(), 'yyyyMMdd')}.pdf`);
    
    logAuditAction(db, user, profile.fullName, 'PERFORMANCE_REVIEW', 'audit_ledger', `Administrative Export: Generated PDF forensic archive for ${filteredLogs.length} records.`);
    
    toast({ title: "PDF Archive Generated", description: "Official forensic document has been saved to the terminal." });
    setTimeout(() => setIsExporting(false), 800);
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Accessing Forensic Vault</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Security Protocol</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-headline uppercase leading-none">Forensic Audit Ledger</h1>
          <p className="text-sm text-muted-foreground">Chronological record of all critical bureau operations and official signatures.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-2xl">
          <div className="flex items-center gap-2 w-full sm:w-auto">
             <Button onClick={handleExportExcel} disabled={isExporting} variant="outline" className="flex-1 h-11 px-4 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 font-bold text-[10px] uppercase tracking-widest rounded-xl">
                <FileSpreadsheet className="mr-1.5 h-4 w-4" /> XLS
             </Button>
             <Button onClick={handleExportPDF} disabled={isExporting} variant="outline" className="flex-1 h-11 px-4 border-rose-500/20 text-rose-600 hover:bg-rose-500/5 font-bold text-[10px] uppercase tracking-widest rounded-xl">
                <FileText className="mr-1.5 h-4 w-4" /> PDF
             </Button>
          </div>
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30" />
            <Input 
              placeholder="Search forensic records..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 border-border bg-card rounded-xl text-xs font-bold w-full"
            />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in zoom-in duration-300 w-full sm:w-auto">
               <Button 
                variant="outline" 
                className="flex-1 sm:flex-none h-11 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest border-border bg-card hover:bg-muted"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="mr-2 h-4 w-4" /> Clear
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1 sm:flex-none h-11 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-destructive/10"
                onClick={() => {
                  setPurgeConfirmationText('');
                  setIsPurgeDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Purge ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      </div>

      <Card className="bg-white dark:bg-card rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_30px_rgba(15,23,42,0.04)] overflow-hidden">
        {/* Top Control Bar inside Table Card */}
        <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Forensic Records"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 h-9 bg-transparent text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleExportExcel} disabled={isExporting} variant="outline" className="h-9 px-3.5 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs">
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> Export XLS
            </Button>
            <Button onClick={handleExportPDF} disabled={isExporting} variant="outline" className="h-9 px-3.5 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs">
              <FileText className="mr-1.5 h-3.5 w-3.5 text-rose-600" /> Export PDF
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#F9FAFB] dark:bg-slate-900/60">
              <TableRow className="hover:bg-transparent border-b border-slate-200/80 dark:border-slate-800 h-11">
                <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={allOnPageSelected} 
                      onCheckedChange={toggleSelectAll}
                    />
                    <span>OFFICIAL SIGNATURE</span>
                  </div>
                </TableHead>
                <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  DATE CREATED
                </TableHead>
                <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  ACTION PROTOCOL
                </TableHead>
                <TableHead className="h-11 px-4 w-24 text-right">
                  ACTION
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.length > 0 ? paginatedLogs.map((log) => (
                <TableRow 
                  key={log.id} 
                  className={cn(
                    "hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors border-b border-slate-100 dark:border-slate-800/60 h-14 group",
                    selectedIds.has(log.id) && "bg-blue-50/40 dark:bg-blue-950/20"
                  )}
                >
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Checkbox 
                        checked={selectedIds.has(log.id)} 
                        onCheckedChange={() => toggleSelectRow(log.id)}
                      />
                      <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {log.officerName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap">
                    <span className="text-[13px] text-slate-600 dark:text-slate-300">
                      {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'MMM do, yyyy; hh:mm a') : 'Just now'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      title="View Audit Details"
                      onClick={() => setSelectedLog(log)}
                      className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-60 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                      <ShieldCheck className="h-10 w-10 opacity-40" />
                      <p className="text-xs font-semibold">Zero Forensic Records Found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredLogs.length}
          shownItems={paginatedLogs.length}
          itemLabel="audit logs"
          onPageChange={setCurrentPage}
        />
      </Card>

      {/* Bulk Purge Dialog */}
      <AlertDialog open={isPurgeDialogOpen} onOpenChange={(open) => {
        if (!open && !isPurging) {
          setPurgeConfirmationText('');
          setIsPurgeDialogOpen(false);
        }
      }}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
            <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              {isPurging ? <Loader2 className="h-10 w-10 text-destructive animate-spin" /> : <ShieldAlert className="h-10 w-10 text-destructive" />}
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                  {isPurging ? "PURGING LEDGER..." : "PURGE PROTOCOL"}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                  {isPurging 
                    ? "Executing bulk deletion of forensic signatures. Please stand by..."
                    : `You are about to permanently delete ${selectedIds.size} records from the forensic ledger. This action cannot be reversed.`
                  }
                </AlertDialogDescription>
              </div>

              {!isPurging && (
                <div className="space-y-3 pt-2 text-left">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">
                    Type <span className="text-destructive font-black">DELETE</span> to confirm
                  </Label>
                  <Input 
                    value={purgeConfirmationText}
                    onChange={(e) => setPurgeConfirmationText(e.target.value)}
                    placeholder="Confirmation phrase..."
                    className="h-12 bg-background border-border focus:border-destructive/50 rounded-xl text-center font-black tracking-widest uppercase placeholder:font-bold placeholder:tracking-normal placeholder:text-muted-foreground/20"
                    autoFocus
                  />
                </div>
              )}
            </div>
          </div>
          <div className="bg-muted/30 p-6 flex flex-col gap-3">
            <Button 
              onClick={handleBulkPurge} 
              disabled={isPurging || !isVerified}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 disabled:opacity-30 disabled:grayscale transition-all active:scale-[0.98]"
            >
              {isPurging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm Destruction"}
            </Button>
            {!isPurging && (
              <Button 
                variant="ghost"
                onClick={() => { setPurgeConfirmationText(''); setIsPurgeDialogOpen(false); }}
                className="w-full h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent hover:bg-card text-muted-foreground"
              >
                Abort Operation
              </Button>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Forensic Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden rounded-[32px] border-none shadow-2xl bg-popover max-h-[90vh] overflow-y-auto">
          <DialogHeader className="p-6 sm:p-8 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                   <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                   <DialogTitle className="text-lg font-black text-foreground uppercase tracking-tight">Audit Signature Details</DialogTitle>
                   <DialogDescription className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bureau Internal Security Record</DialogDescription>
                </div>
              </div>
              {selectedLog && (
                <span className="text-[9px] font-black uppercase px-2 py-1 bg-primary text-primary-foreground rounded-lg tracking-widest hidden sm:inline">
                  {selectedLog.action.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </DialogHeader>

          <div className="p-6 sm:p-8 space-y-8 bg-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <User className="h-3 w-3" /> Official Identity
                </p>
                <p className="text-sm font-black text-foreground">{selectedLog?.officerName}</p>
                <p className="text-[9px] font-mono text-muted-foreground font-bold">UID: {selectedLog?.officerId}</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Clock className="h-3 w-3" /> Precise Timestamp
                </p>
                <p className="text-sm font-black text-foreground">
                  {selectedLog?.timestamp?.toDate ? format(selectedLog.timestamp.toDate(), 'MMMM dd, yyyy') : '...'}
                </p>
                <p className="text-[9px] font-mono text-muted-foreground font-bold">
                  {selectedLog?.timestamp?.toDate ? format(selectedLog.timestamp.toDate(), 'HH:mm:ss.SSS') : '...'}
                </p>
              </div>
            </div>

            <div className="space-y-6">
               <div className="p-4 bg-muted/30 rounded-2xl border border-border space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <History className="h-16 w-16" />
                  </div>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Activity className="h-3 w-3" /> Operational Payload
                  </p>
                  <p className="text-sm font-medium text-foreground leading-relaxed italic relative z-10">
                    "{selectedLog?.details}"
                  </p>
               </div>

               <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-primary/[0.03] border border-primary/10 rounded-2xl gap-4">
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <FileDigit className="h-3 w-3" /> Target Reference ID
                    </p>
                    <p className="text-[11px] font-mono font-bold text-primary break-all">{selectedLog?.targetId}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center shrink-0">
                    <Fingerprint className="h-5 w-5 text-muted-foreground/30" />
                  </div>
               </div>
            </div>
          </div>

          <div className="p-4 border-t border-border bg-muted/30 flex justify-end">
            <Button 
              onClick={() => setSelectedLog(null)} 
              className="w-full sm:w-auto font-black text-[10px] uppercase tracking-widest h-10 px-8 rounded-xl"
            >
              Close Ledger Entry
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
