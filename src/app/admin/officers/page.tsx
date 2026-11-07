"use client"

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  Shield, 
  Loader2, 
  MapPin, 
  Mail, 
  BadgeCheck, 
  Trash2, 
  Edit2, 
  ShieldAlert, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  FileSpreadsheet,
  FileText,
  Activity,
  Clock,
  ExternalLink,
  UserPlus,
  CheckCircle2,
  X,
  ShieldCheck,
  Zap,
  TrendingUp,
  Eye
} from 'lucide-react';
import { OfficerFormModal } from '@/components/admin/officer-form-modal';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, limit, doc, writeBatch } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { logAuditAction } from '@/lib/audit';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import { cn } from '@/lib/utils';

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function OfficerManagementPage() {
  const { user: currentUser } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isExporting, setIsExporting] = useState(false);
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isConfirmBulkPurgeOpen, setIsConfirmBulkPurgeOpen] = useState(false);

  // Deletion state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [officerToDelete, setOfficerToDelete] = useState<UserProfile | null>(null);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !currentUser?.uid) return null;
    return doc(db, 'users', currentUser.uid);
  }, [db, currentUser?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const usersQuery = useMemoFirebase(() => {
    if (!db || !currentUser) return null;
    return query(collection(db, 'users'), limit(10000));
  }, [db, currentUser]);

  const { data: allOfficers, isLoading } = useCollection<UserProfile>(usersQuery);

  const regions = useMemo(() => {
    if (!allOfficers) return [];
    return Array.from(new Set(allOfficers.map(o => o.region).filter((r): r is string => Boolean(r))));
  }, [allOfficers]);

  const filteredOfficers = useMemo(() => {
    if (!allOfficers) return [];
    return allOfficers.filter(o => {
      const matchesSearch = o.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          o.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'all' || o.role === roleFilter;
      const matchesRegion = regionFilter === 'all' || o.region === regionFilter;
      
      return matchesSearch && matchesRole && matchesRegion;
    });
  }, [allOfficers, searchTerm, roleFilter, regionFilter]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredOfficers.length / itemsPerPage);
  const paginatedOfficers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOfficers.slice(start, start + itemsPerPage);
  }, [filteredOfficers, currentPage]);

  const allOnPageSelected = paginatedOfficers.length > 0 && paginatedOfficers.every(o => selectedIds.has(o.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      paginatedOfficers.forEach(o => next.delete(o.id));
    } else {
      paginatedOfficers.forEach(o => {
        if (o.id !== currentUser?.uid) next.add(o.id);
      });
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    if (id === currentUser?.uid) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const stats = useMemo(() => {
    if (!allOfficers) return { total: 0, admins: 0, reviewers: 0, onDuty: 0 };
    return {
      total: allOfficers.length,
      admins: allOfficers.filter(o => o.role === 'admin').length,
      reviewers: allOfficers.filter(o => o.role === 'reviewer').length,
      onDuty: allOfficers.filter(o => o.isDutyActive).length,
    };
  }, [allOfficers]);

  const handleBulkPurge = async () => {
    if (!db || selectedIds.size === 0 || !currentUser || !profile) return;
    
    setIsBulkProcessing(true);
    const batch = writeBatch(db);
    const count = selectedIds.size;

    selectedIds.forEach(id => {
      batch.delete(doc(db, 'users', id));
      batch.delete(doc(db, 'admin_users', id));
    });

    try {
      await batch.commit();
      
      logAuditAction(
        db,
        currentUser,
        profile.fullName,
        'RECORD_DELETED',
        'bulk_personnel_purge',
        `Personnel Purge: Permanently revoked access for ${count} officials.`
      );

      toast({
        title: "Access Revoked",
        description: `Successfully purged ${count} official signatures from the bureau.`,
        variant: "destructive"
      });
      setSelectedIds(new Set());
      setIsConfirmBulkPurgeOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Bulk Operation Failed",
        description: "Clearance error during mass personnel revocation.",
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredOfficers.length === 0 || !currentUser || !profile) return;
    setIsExporting(true);

    const exportData = filteredOfficers.map(o => ({
      'Full Name': o.fullName,
      'Email': o.email,
      'Role': o.role,
      'Region': o.region,
      'Cluster': o.cluster,
      'Last Active': o.updatedAt ? format(new Date(o.updatedAt), 'yyyy-MM-dd HH:mm') : 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Personnel");
    XLSX.writeFile(wb, `Bureau_Personnel_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    logAuditAction(
      db, 
      currentUser, 
      profile.fullName, 
      'PERFORMANCE_REVIEW', 
      'personnel_management', 
      `Personnel: Generated XLS employee archive for ${filteredOfficers.length} records.`
    );

    toast({ title: "Excel Ledger Generated", description: "Official personnel registry exported." });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (filteredOfficers.length === 0 || !currentUser || !profile) return;
    setIsExporting(true);

    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text("Official Bureau Personnel Ledger", 14, 15);
    const rows = filteredOfficers.map(o => [
      o.fullName || '', o.email || '', o.role || '', o.region || '', o.cluster || '', o.updatedAt ? format(new Date(o.updatedAt), 'MMM dd') : '-'
    ]);

    autoTable(doc, {
      startY: 25,
      head: [['Signature', 'Email', 'Clearance', 'Region', 'Sector', 'Last Sync']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });

    doc.save(`Bureau_Personnel_Ledger_${format(new Date(), 'yyyyMMdd')}.pdf`);

    logAuditAction(
      db, 
      currentUser, 
      profile.fullName, 
      'PERFORMANCE_REVIEW', 
      'personnel_management', 
      `Personnel: Generated PDF employee archive for ${filteredOfficers.length} records.`
    );

    toast({ title: "PDF Record Saved", description: "High-fidelity personnel document generated." });
    setTimeout(() => setIsExporting(false), 800);
  };

  const initiateDelete = (officer: UserProfile) => {
    if (officer.id === currentUser?.uid) {
      toast({
        title: "Action Restricted",
        description: "Protocol prevents deletion of your own administrative signature.",
        variant: "destructive"
      });
      return;
    }
    setOfficerToDelete(officer);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!db || !officerToDelete || !currentUser || !profile) return;
    
    setIsDeleting(true);
    try {
      await deleteDocumentNonBlocking(doc(db, 'users', officerToDelete.id));
      if (officerToDelete.role === 'admin') {
        await deleteDocumentNonBlocking(doc(db, 'admin_users', officerToDelete.id));
      }
      
      logAuditAction(
        db,
        currentUser,
        profile.fullName,
        'PERSONNEL_MODIFIED',
        officerToDelete.id,
        `Revoked bureau access for ${officerToDelete.fullName} (${officerToDelete.email}).`
      );

      toast({
        title: "Officer Purged",
        description: `${officerToDelete.fullName} has been removed from the bureau framework.`,
        variant: "destructive"
      });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast({
        title: "Deletion Failed",
        description: "An error occurred while revoking access.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setOfficerToDelete(null);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Bureau Administration</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-headline">Officer Command</h1>
          <p className="text-sm text-muted-foreground max-w-lg">
            Register official signatures, manage field permissions, and monitor personnel pulse across all regions.
          </p>
        </div>
        <div className="flex items-center gap-3">
           <Button onClick={handleExportExcel} disabled={isExporting} variant="outline" className="h-11 px-4 rounded-xl border-emerald-500/20 text-emerald-500 font-bold text-[10px] uppercase tracking-widest bg-card">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          </Button>
          <Button onClick={handleExportPDF} disabled={isExporting} variant="outline" className="h-11 px-4 rounded-xl border-rose-500/20 text-rose-500 font-bold text-[10px] uppercase tracking-widest bg-card">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          </Button>
          <OfficerFormModal mode="add" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatSummary label="Total Active" value={stats.total} delta="+100%" subText="bureau roster" isPositive={true} />
        <StatSummary label="Command Pulse" value={stats.onDuty} delta={`+${stats.total ? Math.round((stats.onDuty / stats.total) * 100) : 0}%`} subText="on active duty" isPositive={true} />
        <StatSummary label="Field Units" value={stats.reviewers} delta={`${stats.total ? Math.round((stats.reviewers / stats.total) * 100) : 0}%`} subText="sector officers" isPositive={true} />
        <StatSummary label="Admins" value={stats.admins} delta={`${stats.total ? Math.round((stats.admins / stats.total) * 100) : 0}%`} subText="command clearance" isPositive={true} />
      </div>

      <Card className="bg-white dark:bg-card rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_30px_rgba(15,23,42,0.04)] overflow-hidden relative">
        {/* Bulk Command Matrix */}
        {selectedIds.size > 0 && (
          <div className="bg-slate-900 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 animate-in slide-in-from-top duration-200">
            <p className="text-xs font-semibold">
              {selectedIds.size} Personnel Selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-slate-300 hover:text-white hover:bg-white/10" onClick={() => setSelectedIds(new Set())}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-3 text-xs text-rose-400 hover:bg-rose-600 hover:text-white" onClick={() => setIsConfirmBulkPurgeOpen(true)} disabled={isBulkProcessing}>
                {isBulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />} Purge Access
              </Button>
            </div>
          </div>
        )}

        {/* Integrated Top Control Bar */}
        <div className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Officer or Email"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-3 h-9 bg-transparent text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="h-9 w-[140px] rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs">
                <SelectValue placeholder="All Ranks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs font-medium">All Ranks</SelectItem>
                <SelectItem value="admin" className="text-xs font-medium">Bureau Admin</SelectItem>
                <SelectItem value="reviewer" className="text-xs font-medium">Field Officer</SelectItem>
              </SelectContent>
            </Select>

            <Select value={regionFilter} onValueChange={(v) => { setRegionFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="h-9 w-[150px] rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs">
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs font-medium">All Regions</SelectItem>
                {regions.map(r => (
                  <SelectItem key={r} value={r} className="text-xs font-medium">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={() => { setSearchTerm(''); setRoleFilter('all'); setRegionFilter('all'); setCurrentPage(1); }}
              title="Reset Filters"
              className="h-9 w-9 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 shadow-2xs"
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-3 border-b border-border/50 last:border-none">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40 rounded" />
                      <Skeleton className="h-3 w-28 rounded" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20 rounded-md hidden sm:block" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          ) : paginatedOfficers && paginatedOfficers.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-[#F9FAFB] dark:bg-slate-900/60">
                    <TableRow className="border-b border-slate-200/80 dark:border-slate-800 hover:bg-transparent h-11">
                      <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} />
                          <span>OFFICIAL NAME</span>
                        </div>
                      </TableHead>
                      <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        LAST SYNC
                      </TableHead>
                      <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden lg:table-cell whitespace-nowrap">
                        ROLE
                      </TableHead>
                      <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden sm:table-cell whitespace-nowrap">
                        REGION / SECTOR
                      </TableHead>
                      <TableHead className="h-11 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        DUTY STATUS
                      </TableHead>
                      <TableHead className="h-11 px-4 w-28 text-right">
                        ACTION
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOfficers.map((officer) => {
                      const isMe = officer.id === currentUser?.uid;
                      return (
                        <TableRow key={officer.id} className={cn(
                          "hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors group border-b border-slate-100 dark:border-slate-800/60 h-14",
                          selectedIds.has(officer.id) && "bg-blue-50/40 dark:bg-blue-950/20"
                        )}>
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {!isMe ? (
                                <Checkbox 
                                  checked={selectedIds.has(officer.id)} 
                                  onCheckedChange={() => toggleSelectRow(officer.id)}
                                />
                              ) : (
                                <span className="w-4" />
                              )}
                              <Avatar className="h-8 w-8 border border-slate-200 dark:border-slate-700">
                                <AvatarImage src={officer.profilePhoto} />
                                <AvatarFallback className="font-semibold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                                  {officer.fullName.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap flex items-center gap-1.5">
                                  {officer.fullName}
                                  {isMe && <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">You</span>}
                                </p>
                                <p className="text-[11px] text-slate-400">{officer.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <span className="text-[13px] text-slate-600 dark:text-slate-300">
                              {officer.updatedAt ? format(new Date(officer.updatedAt), 'MMM do, yyyy; hh:mm a') : 'Not synced'}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                            <span className="text-[13px] text-slate-600 dark:text-slate-300 capitalize">
                              {officer.role === 'admin' ? 'Administrator' : 'Field Reviewer'}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">
                            <span className="text-[13px] text-slate-600 dark:text-slate-300">
                              {officer.region} • {officer.cluster}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold",
                              officer.isDutyActive
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            )}>
                              {officer.isDutyActive ? 'Active Duty' : 'Offline'}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1">
                              <Link
                                href={`/performance?officerId=${officer.id}`}
                                title="View Officer Dossier"
                                className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                              <OfficerFormModal 
                                mode="edit" 
                                officer={officer} 
                                trigger={
                                  <button
                                    type="button"
                                    title="Edit Officer"
                                    className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                } 
                              />
                              <button
                                type="button"
                                title="Revoke Officer"
                                onClick={() => initiateDelete(officer)}
                                disabled={isMe}
                                className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredOfficers.length}
                shownItems={paginatedOfficers.length}
                itemLabel="officers"
                onPageChange={setCurrentPage}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[360px] text-slate-400">
              <Users className="h-10 w-10 opacity-40 mb-3" />
              <p className="text-xs font-semibold">No matching officers found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Single Purge Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
            <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              {isDeleting ? <Loader2 className="h-10 w-10 text-destructive animate-spin" /> : <ShieldAlert className="h-10 w-10 text-destructive" />}
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase">
                {isDeleting ? "PURGING SIGNATURE..." : "REVOKE ACCESS?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                {isDeleting 
                  ? `Removing ${officerToDelete?.fullName} from bureau protocols. Please wait...`
                  : `You are about to purge ${officerToDelete?.fullName} from the bureau. This action is final and will revoke all terminal credentials immediately.`
                }
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="bg-muted/30 p-6 flex-col sm:flex-col gap-3">
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); confirmDelete(); }} 
              disabled={isDeleting}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 transition-all active:scale-[0.98]"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm Revocation"}
            </AlertDialogAction>
            {!isDeleting && (
              <AlertDialogCancel className="w-full h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent hover:bg-card">
                Abort Operation
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
                {isBulkProcessing ? "PURGING PERSONNEL..." : "MASS REVOCATION"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                {isBulkProcessing 
                  ? "Executing mass signature revocation. Synchronizing with audit ledger..."
                  : `You are about to permanently purge ${selectedIds.size} officials from the bureau database. This operation cannot be reversed.`
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

function StatSummary({ label, value, delta = '+12%', subText = 'last week', isPositive = true }: any) {
  return (
    <Card className="rounded-[20px] border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-card shadow-[0_10px_30px_rgba(15,23,42,0.04)] hover:shadow-[0_14px_36px_rgba(15,23,42,0.07)] transition-all duration-300 overflow-hidden">
      <CardContent className="p-6 space-y-4">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{label}</p>
        <p className="text-[32px] font-bold text-slate-900 dark:text-white tracking-tight tabular-nums leading-none">{value.toLocaleString()}</p>
        <div className="flex items-center gap-1.5 pt-1">
          <span
            className={cn(
              'inline-flex items-center justify-center h-4 w-4 rounded-[4px] border',
              isPositive
                ? 'border-emerald-500/50 text-emerald-600 bg-emerald-500/5'
                : 'border-rose-500/50 text-rose-500 bg-rose-500/5'
            )}
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-current" strokeWidth="1.6">
              <path d="M1.5 8.5L4.5 5.5L7 7.5L10.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{delta}</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">{subText}</span>
        </div>
      </CardContent>
    </Card>
  );
}
