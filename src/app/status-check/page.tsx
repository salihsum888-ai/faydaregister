'use client';

import { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ShieldCheck,
  Search,
  ArrowLeft,
  Copy,
  Calendar,
  Loader2,
  User,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  RotateCcw,
  Check,
  Maximize2,
  Minimize2,
  RefreshCw,
  Building2,
  Clock,
  Sparkles,
  FastForward,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, limit, doc, where } from 'firebase/firestore';
import { Registration, RegistrationStatus, UserProfile } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
import { StatusBadge } from '@/components/dashboard/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { logAuditAction } from '@/lib/audit';

const REJECTION_PRESETS = [
  'Biometric Mismatch',
  'Duplicate Registration (RID)',
  'Incomplete Demographics',
  'Packet Sync / Transmission Error',
  'Unreadable Photo / Document',
];

function StatusCheckContent() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlRid = searchParams.get('id') || '';
  const urlInstitution = searchParams.get('institution') || '';
  const urlStatus = searchParams.get('status') || '';

  const [searchTerm, setSearchTerm] = useState(urlRid);
  const [statusFilter, setStatusFilter] = useState(urlStatus || 'all');
  const [institutionFilter, setInstitutionFilter] = useState(urlInstitution || 'all');
  const [selectedDate, setSelectedDate] = useState('');
  const [activeRid, setActiveRid] = useState(urlRid);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGatewayExpanded, setIsGatewayExpanded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [autoAdvanceProcessing, setAutoAdvanceProcessing] = useState(true);

  // Rejection / Failure Reason Modal State
  const [pendingStatusWithReason, setPendingStatusWithReason] = useState<
    'Rejected' | 'Failed' | null
  >(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');

  const gatewayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (urlRid) {
      setActiveRid(urlRid);
      setSearchTerm(urlRid);
    }
    if (urlInstitution) {
      setInstitutionFilter(urlInstitution);
    }
    if (urlStatus) {
      setStatusFilter(urlStatus);
    }
  }, [urlRid, urlInstitution, urlStatus]);

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

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

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

  // Unique Institution Names for Filter Dropdown
  const institutionNames = useMemo(() => {
    if (!registrations) return [];
    const set = new Set<string>();
    registrations.forEach((r) => {
      const name = (r.institutionName || r.schoolName || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registrations]);

  // Count of records currently in "Processing" status
  const processingRecordsCount = useMemo(() => {
    if (!registrations) return 0;
    return registrations.filter((r) => r.status === 'Processing').length;
  }, [registrations]);

  const filteredRegistrations = useMemo(() => {
    if (!registrations) return [];
    return registrations.filter((reg) => {
      const instName = (reg.institutionName || reg.schoolName || '').trim();
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        reg.applicantName.toLowerCase().includes(q) ||
        reg.id.toLowerCase().includes(q) ||
        (reg.phone || '').toLowerCase().includes(q) ||
        instName.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' || reg.status === statusFilter;

      let matchesInstitution = true;
      if (institutionFilter === '__INSTITUTIONS_ONLY__') {
        matchesInstitution = instName.length > 0;
      } else if (institutionFilter === '__NON_INSTITUTION__') {
        matchesInstitution = instName.length === 0;
      } else if (institutionFilter !== 'all') {
        matchesInstitution = instName.toLowerCase() === institutionFilter.toLowerCase();
      }

      let matchesDate = true;
      if (selectedDate) {
        try {
          const regDate = new Date(reg.submissionDate);
          const filterDate = new Date(selectedDate);
          matchesDate = isWithinInterval(regDate, {
            start: startOfDay(filterDate),
            end: endOfDay(filterDate),
          });
        } catch {
          matchesDate = true;
        }
      }

      return matchesSearch && matchesStatus && matchesInstitution && matchesDate;
    });
  }, [registrations, searchTerm, statusFilter, institutionFilter, selectedDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, institutionFilter, selectedDate]);

  const paginatedRegistrations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredRegistrations.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRegistrations, currentPage]);

  const totalPages = Math.ceil(filteredRegistrations.length / itemsPerPage);

  const allOnPageSelected =
    paginatedRegistrations.length > 0 &&
    paginatedRegistrations.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      paginatedRegistrations.forEach((r) => next.delete(r.id));
    } else {
      paginatedRegistrations.forEach((r) => next.add(r.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const activeRegistration = useMemo(() => {
    if (!activeRid || !registrations) return null;
    return registrations.find((r) => r.id === activeRid);
  }, [activeRid, registrations]);

  const activeIndexInFiltered = useMemo(() => {
    if (!activeRid) return -1;
    return filteredRegistrations.findIndex((r) => r.id === activeRid);
  }, [filteredRegistrations, activeRid]);

  const handleVerifyRecord = (reg: Registration, silentScroll = false) => {
    setActiveRid(reg.id);
    setCopiedId(reg.id);
    setTimeout(() => setCopiedId((prev) => (prev === reg.id ? null : prev)), 2000);
    navigator.clipboard.writeText(reg.id);

    if (db && user && profile) {
      logAuditAction(
        db,
        user,
        profile.fullName,
        'VERIFICATION_CHECK',
        reg.id,
        `Verification Terminal: Initialized check protocol for applicant: ${reg.applicantName}.`
      );
    }

    toast({
      title: 'RID Ready for Verification',
      description: `29-digit ID for ${reg.applicantName} copied & loaded into gateway.`,
    });

    if (
      !silentScroll &&
      typeof window !== 'undefined' &&
      window.innerWidth < 1280 &&
      gatewayRef.current
    ) {
      setTimeout(() => {
        gatewayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  };

  const handleStepRecord = (direction: 'prev' | 'next') => {
    if (filteredRegistrations.length === 0) return;
    let nextIdx = 0;
    if (activeIndexInFiltered === -1) {
      nextIdx = 0;
    } else if (direction === 'next') {
      nextIdx = (activeIndexInFiltered + 1) % filteredRegistrations.length;
    } else {
      nextIdx =
        (activeIndexInFiltered - 1 + filteredRegistrations.length) %
        filteredRegistrations.length;
    }
    const target = filteredRegistrations[nextIdx];
    if (target) {
      handleVerifyRecord(target, true);
    }
  };

  // Find and load the next record whose status is "Processing"
  const advanceToNextProcessingRecord = (excludeId?: string) => {
    const candidates = filteredRegistrations.filter(
      (r) => r.status === 'Processing' && r.id !== excludeId
    );
    if (candidates.length === 0) {
      // Fallback: check all registrations if current filter has none
      const allProcessing = (registrations || []).filter(
        (r) => r.status === 'Processing' && r.id !== excludeId
      );
      if (allProcessing.length > 0) {
        handleVerifyRecord(allProcessing[0], true);
        return true;
      }
      return false;
    }

    // Pick the next Processing record after the current index if possible
    if (activeIndexInFiltered >= 0) {
      const afterCurrent = filteredRegistrations
        .slice(activeIndexInFiltered + 1)
        .find((r) => r.status === 'Processing' && r.id !== excludeId);
      if (afterCurrent) {
        handleVerifyRecord(afterCurrent, true);
        return true;
      }
    }

    handleVerifyRecord(candidates[0], true);
    return true;
  };

  const commitStatusUpdate = (newStatus: RegistrationStatus, customReason?: string) => {
    if (!db || !activeRegistration || !user || !profile) return;

    const currentId = activeRegistration.id;
    const currentApplicant = activeRegistration.applicantName;

    setIsUpdating(true);
    const reasonNote = customReason ? ` (Reason: ${customReason})` : '';
    const updateData: any = {
      status: newStatus,
      updatedAt: new Date().toISOString(),
      remarks: `${activeRegistration.remarks || ''}\n[VERIFICATION TERMINAL]: Status updated to ${newStatus}${reasonNote} on ${format(new Date(), 'MMM dd, HH:mm')}`.trim(),
    };

    if (newStatus === 'Processed' || newStatus === 'Processing') {
      updateData.rejectionReason = '';
    } else if (customReason !== undefined) {
      updateData.rejectionReason = customReason;
    }

    updateDocumentNonBlocking(doc(db, 'registrations', currentId), updateData);

    logAuditAction(
      db,
      user,
      profile.fullName,
      'STATUS_UPDATE',
      currentId,
      `Verification Terminal: Changed status for ${currentApplicant} to ${newStatus}${reasonNote}.`
    );

    let advanced = false;
    if (autoAdvanceProcessing && newStatus !== 'Processing') {
      advanced = advanceToNextProcessingRecord(currentId);
    }

    if (!advanced) {
      toast({
        title: 'Registry Synchronized',
        description: `Status for ${currentApplicant} updated to ${newStatus}.`,
      });
    } else {
      toast({
        title: `Updated to ${newStatus} • Auto-Advanced`,
        description: `Saved ${currentApplicant} and loaded the next Processing record.`,
      });
    }

    setTimeout(() => setIsUpdating(false), 450);
  };

  const handleStatusSelectChange = (newStatus: RegistrationStatus) => {
    if (!activeRegistration) return;
    if (newStatus === 'Rejected' || newStatus === 'Failed') {
      setRejectionReasonInput(activeRegistration.rejectionReason || REJECTION_PRESETS[0]);
      setPendingStatusWithReason(newStatus);
      return;
    }
    commitStatusUpdate(newStatus);
  };

  const handleConfirmStatusWithReason = () => {
    if (!pendingStatusWithReason) return;
    const finalReason = rejectionReasonInput.trim() || 'Verification Check Failed';
    commitStatusUpdate(pendingStatusWithReason, finalReason);
    setPendingStatusWithReason(null);
    setRejectionReasonInput('');
  };

  const handleBulkStatusUpdate = (newStatus: RegistrationStatus) => {
    if (!db || !user || !profile || selectedIds.size === 0) return;
    setIsUpdating(true);
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
      'bulk_verification',
      `Verification Terminal: Bulk updated ${selectedIds.size} records to ${newStatus}.`
    );

    toast({
      title: 'Bulk Verification Applied',
      description: `Updated ${selectedIds.size} selected records to ${newStatus}.`,
    });

    setSelectedIds(new Set());
    setTimeout(() => setIsUpdating(false), 500);
  };

  if (isUserLoading || !user) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
            Verifying Terminal Clearance...
          </p>
        </div>
      </div>
    );
  }

  const iframeSrc = activeRid
    ? `https://resident.fayda.et/status?rid=${encodeURIComponent(activeRid.trim())}`
    : 'https://resident.fayda.et/status';

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700 pb-36">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={isAdmin ? '/admin' : '/dashboard'}
            className="flex items-center text-[10px] font-black text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest gap-1.5 mb-2"
          >
            <ArrowLeft className="h-3 w-3" /> Return to Command
          </Link>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
              <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">
                Verification Terminal
              </h1>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                Authorized Verification Gateway
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Clickable Processing Queue Pill */}
          <button
            type="button"
            onClick={() =>
              setStatusFilter((prev) => (prev === 'Processing' ? 'all' : 'Processing'))
            }
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-2xl transition-all cursor-pointer border',
              statusFilter === 'Processing'
                ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                : 'glass-subpanel hover:border-primary/40'
            )}
            title="Click to filter by Processing status"
          >
            <Clock
              className={cn(
                'h-3.5 w-3.5',
                statusFilter === 'Processing' ? 'text-white' : 'text-amber-500'
              )}
            />
            <span className="text-[10px] font-black uppercase tracking-wider tabular-nums">
              {processingRecordsCount} Processing
            </span>
          </button>

          {/* Auto-Advance to Next Processing Toggle */}
          <div className="flex items-center gap-2.5 px-3.5 py-2 glass-subpanel rounded-2xl">
            <FastForward className="h-3.5 w-3.5 text-primary" />
            <Label
              htmlFor="auto-advance-processing"
              className="text-[10px] font-black uppercase tracking-wider cursor-pointer"
            >
              Auto-Next Processing
            </Label>
            <Switch
              id="auto-advance-processing"
              checked={autoAdvanceProcessing}
              onCheckedChange={setAutoAdvanceProcessing}
              className="scale-75"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 sm:gap-8">
        {/* Left Queue Panel */}
        {!isGatewayExpanded && (
          <div className="xl:col-span-5 min-w-0 space-y-4">
            <div className="glass-card-surface rounded-[24px] overflow-hidden">
              {/* Integrated Top Control Bar */}
              <div className="p-4 border-b border-white/60 dark:border-white/10 space-y-3 bg-white/30 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search Name, 29-digit RID, or Institution..."
                      className="pl-9 h-9 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setInstitutionFilter('all');
                      setSelectedDate('');
                    }}
                    className="glass-subpanel h-8 w-8 rounded-lg text-slate-500 hover:text-slate-800 shrink-0"
                    title="Reset filters"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Filters Row: Status, Institution Name, Date */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="glass-subpanel h-9 rounded-lg px-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs font-medium">
                        All Status
                      </SelectItem>
                      <SelectItem value="Processing" className="text-xs font-bold text-primary">
                        Processing ({processingRecordsCount})
                      </SelectItem>
                      <SelectItem value="Processed" className="text-xs font-medium">
                        Processed
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

                  <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
                    <SelectTrigger className="glass-subpanel h-9 rounded-lg px-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <div className="flex items-center gap-1.5 truncate">
                        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        <SelectValue placeholder="All Institutions" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs font-semibold">
                        All Records
                      </SelectItem>
                      <SelectItem value="__INSTITUTIONS_ONLY__" className="text-xs font-semibold">
                        All Institutions Only
                      </SelectItem>
                      <SelectItem value="__NON_INSTITUTION__" className="text-xs font-semibold">
                        Non-Institution Only
                      </SelectItem>
                      {institutionNames.map((inst) => (
                        <SelectItem key={inst} value={inst} className="text-xs font-medium">
                          {inst}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="glass-subpanel pl-8 h-9 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200"
                    />
                  </div>
                </div>

                {/* Bulk Status Bar when rows are selected */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/60 dark:border-white/10 animate-in fade-in duration-200">
                    <span className="text-[11px] font-bold text-primary">
                      {selectedIds.size} Selected
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleBulkStatusUpdate('Processed')}
                        disabled={isUpdating}
                        className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold"
                      >
                        Mark Processed
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleBulkStatusUpdate('Processing')}
                        disabled={isUpdating}
                        className="h-7 px-2.5 rounded-lg text-[10px] font-bold"
                      >
                        Processing
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto min-h-[380px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 px-3 text-center">
                        <Checkbox
                          checked={allOnPageSelected}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center justify-between gap-1.5">
                          <span>Applicant</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center justify-between gap-1.5">
                          <span>Status</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </TableHead>
                      <TableHead className="border-r-0 text-right pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Action</span>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <TableRow key={i} className="h-14">
                            <TableCell>
                              <Skeleton className="h-4 w-4 rounded mx-auto" />
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1.5">
                                <Skeleton className="h-3.5 w-28 rounded" />
                                <Skeleton className="h-2.5 w-20 rounded" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-6 w-16 rounded-md" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Skeleton className="h-8 w-20 rounded-lg ml-auto" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : paginatedRegistrations.length > 0 ? (
                      paginatedRegistrations.map((reg) => {
                        const isCurrentlyVerifying = activeRid === reg.id;
                        const instName = (reg.institutionName || reg.schoolName || '').trim();

                        return (
                          <TableRow
                            key={reg.id}
                            className={cn(
                              'h-15 group transition-colors',
                              (selectedIds.has(reg.id) || isCurrentlyVerifying) &&
                                'bg-primary/[0.06] dark:bg-primary/15'
                            )}
                          >
                            <TableCell className="px-3 text-center">
                              <Checkbox
                                checked={selectedIds.has(reg.id)}
                                onCheckedChange={() => toggleSelectRow(reg.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[140px]">
                                    {reg.applicantName}
                                  </p>
                                  {instName && (
                                    <button
                                      type="button"
                                      onClick={() => setInstitutionFilter(instName)}
                                      title={`Filter by ${instName}`}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-bold truncate max-w-[95px] cursor-pointer"
                                    >
                                      <Building2 className="h-2.5 w-2.5 mr-0.5 shrink-0" />
                                      {instName}
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyRid(reg.id)}
                                  title="Click to copy full 29-digit RID"
                                  className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-primary transition-colors cursor-pointer group/rid"
                                >
                                  <span>{reg.id.substring(0, 12)}...</span>
                                  {copiedId === reg.id ? (
                                    <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Copy className="h-3 w-3 text-slate-400 group-hover/rid:text-primary shrink-0 transition-colors" />
                                  )}
                                </button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={reg.status} />
                            </TableCell>
                            <TableCell className="text-right pr-4">
                              <Button
                                type="button"
                                size="sm"
                                variant={isCurrentlyVerifying ? 'default' : 'outline'}
                                onClick={() => handleVerifyRecord(reg)}
                                className={cn(
                                  'h-8 px-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer',
                                  isCurrentlyVerifying
                                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                                    : 'glass-subpanel text-primary hover:bg-primary hover:text-white'
                                )}
                              >
                                <ShieldCheck className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                                {isCurrentlyVerifying ? 'Verifying' : 'Verify'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-40 text-center">
                          <p className="text-xs font-semibold text-slate-400">
                            No Matching Records
                          </p>
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
                showingCount={paginatedRegistrations.length}
                totalCount={filteredRegistrations.length}
                itemLabel="records"
                className="px-4 py-3.5"
              />
            </div>
          </div>
        )}

        {/* Right Official Portal Gateway Panel */}
        <div
          ref={gatewayRef}
          className={cn(
            'min-w-0 transition-all duration-300',
            isGatewayExpanded ? 'xl:col-span-12' : 'xl:col-span-7'
          )}
        >
          <Card className="border border-white/60 dark:border-white/10 shadow-2xl glass-card-surface overflow-hidden rounded-[28px] sm:rounded-[32px] flex flex-col">
            {/* Responsive Gateway Header — prevents horizontal clipping on mobile */}
            <CardHeader className="bg-white/40 dark:bg-white/[0.02] border-b border-white/60 dark:border-white/10 p-4 sm:p-5 space-y-3.5">
              {/* Top Row: Gateway Title + Queue Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Search className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-black text-foreground uppercase tracking-[0.16em] truncate">
                    Official Portal Gateway
                  </CardTitle>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => advanceToNextProcessingRecord(activeRid)}
                    disabled={processingRecordsCount === 0}
                    className="glass-subpanel h-8 px-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-primary"
                    title="Jump to next record with Processing status"
                  >
                    <FastForward className="h-3.5 w-3.5 mr-1" />
                    Next Processing
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleStepRecord('prev')}
                    disabled={filteredRegistrations.length === 0}
                    className="glass-subpanel h-8 w-8 rounded-xl"
                    title="Previous record in queue"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleStepRecord('next')}
                    disabled={filteredRegistrations.length === 0}
                    className="glass-subpanel h-8 w-8 rounded-xl"
                    title="Next record in queue"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIframeKey((k) => k + 1)}
                    className="glass-subpanel h-8 w-8 rounded-xl"
                    title="Reload Portal Gateway"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsGatewayExpanded((prev) => !prev)}
                    className="glass-subpanel h-8 w-8 rounded-xl hidden xl:inline-flex"
                    title={
                      isGatewayExpanded
                        ? 'Show Queue Split View'
                        : 'Expand Gateway Full Width'
                    }
                  >
                    {isGatewayExpanded ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Active Record Verification Control Bar — Responsive Wrapping for Mobile */}
              {activeRid && activeRegistration ? (
                <div className="rounded-2xl glass-subpanel p-3 sm:p-3.5 space-y-3 animate-in fade-in duration-300">
                  {/* Applicant & Copyable RID Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-black text-foreground truncate">
                        {activeRegistration.applicantName}
                      </span>
                      {(activeRegistration.institutionName ||
                        activeRegistration.schoolName) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[140px]">
                            {activeRegistration.institutionName ||
                              activeRegistration.schoolName}
                          </span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyRid(activeRid)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20 text-primary text-[11px] font-mono font-bold transition-colors cursor-pointer max-w-full"
                      title="Click to copy 29-digit RID"
                    >
                      <span className="truncate max-w-[190px] sm:max-w-none">
                        {activeRid}
                      </span>
                      {copiedId === activeRid ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  </div>

                  {/* Registry Status & Sync Selector Row (fits cleanly on mobile without clipping) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/60 dark:border-white/10">
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-primary/5 border border-primary/15">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                        Registry:
                      </span>
                      <StatusBadge status={activeRegistration.status} />
                    </div>

                    <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-background/80 border border-border shadow-2xs">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mr-2">
                        Sync:
                      </span>
                      <Select
                        disabled={isUpdating}
                        value={activeRegistration.status}
                        onValueChange={(val: any) => handleStatusSelectChange(val)}
                      >
                        <SelectTrigger className="h-7 flex-1 border-none bg-transparent p-0 focus:ring-0 justify-end">
                          <div className="flex items-center justify-end gap-1.5">
                            {isUpdating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            ) : (
                              <span className="text-[11px] font-black text-primary uppercase">
                                Update Result
                              </span>
                            )}
                          </div>
                        </SelectTrigger>
                        <SelectContent
                          align="end"
                          className="bg-popover border-border p-1 rounded-xl"
                        >
                          <SelectItem value="Processing" className="text-xs font-bold uppercase">
                            Processing
                          </SelectItem>
                          <SelectItem value="Processed" className="text-xs font-bold uppercase">
                            Processed
                          </SelectItem>
                          <SelectItem value="Rejected" className="text-xs font-bold uppercase">
                            Rejected
                          </SelectItem>
                          <SelectItem value="Failed" className="text-xs font-bold uppercase">
                            Failed
                          </SelectItem>
                          <SelectItem
                            value="Pending Review"
                            className="text-xs font-bold uppercase"
                          >
                            Pending Review
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl glass-subpanel px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2 font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    Click <strong>Verify</strong> on any record or{' '}
                    <strong>Next Processing</strong> above to load a 29-digit RID into the gateway.
                  </span>
                </div>
              )}
            </CardHeader>

            {/* Portal Iframe Viewport — Tall & unclipped on mobile */}
            <CardContent className="p-0 relative bg-muted/5">
              <div className="w-full h-[780px] sm:h-[760px] relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center -z-10">
                  <div className="flex flex-col items-center gap-3 opacity-20">
                    <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Connecting to Government Gateway...
                    </p>
                  </div>
                </div>
                <iframe
                  key={`${iframeKey}-${activeRid}`}
                  src={iframeSrc}
                  className="w-full h-full border-none"
                  title="Official Fayda Status Check"
                  loading="lazy"
                  allow="geolocation; clipboard-read; clipboard-write"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Rejection / Failure Reason Prompt Modal */}
      <Dialog
        open={Boolean(pendingStatusWithReason)}
        onOpenChange={(o) => !o && setPendingStatusWithReason(null)}
      >
        <DialogContent className="sm:max-w-[460px] rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b bg-muted/20">
            <DialogTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              Specify {pendingStatusWithReason} Reason
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record the official reason why{' '}
              <strong>{activeRegistration?.applicantName}</strong> was marked as{' '}
              <strong>{pendingStatusWithReason}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Quick-Select Official Reason
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {REJECTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRejectionReasonInput(preset)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer',
                      rejectionReasonInput === preset
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                        : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Reason Details
              </Label>
              <Input
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="Enter rejection or failure reason..."
                className="h-10 rounded-xl text-xs font-medium"
              />
            </div>
          </div>
          <DialogFooter className="p-5 bg-muted/20 border-t flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingStatusWithReason(null)}
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmStatusWithReason}
              className="rounded-xl text-xs font-bold"
            >
              Confirm {pendingStatusWithReason}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function StatusCheckPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
        </div>
      }
    >
      <StatusCheckContent />
    </Suspense>
  );
}
