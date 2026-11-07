'use client';

import { useMemo, useState, useEffect } from 'react';
import { useMemoFirebase, useCollection, useUser, useFirestore, useDoc } from '@/firebase';
import { collection, query, limit, doc, orderBy } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { RegistrationTable } from '@/components/dashboard/registration-table';
import { RegistrationFormModal } from '@/components/registrations/registration-form-modal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Loader2,
  ShieldCheck,
  Power,
  RefreshCcw,
  Timer,
  ShieldAlert,
  History,
  Zap,
  Fingerprint,
  ArrowRight,
  Clock,
  FileSpreadsheet,
  FileText as FileTextIcon,
  Building2,
  Plus,
  Megaphone,
  Phone,
  Smartphone,
  UserCheck,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { Registration, DashboardStats, UserProfile, DailyReport, AuditLog } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminDashboard() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [activeCardFilter, setActiveCardFilter] = useState<string | null>(null);
  const [isTogglingDuty, setIsTogglingDuty] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setLastSynced(new Date());
  }, []);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'registrations'), limit(10000));
  }, [db, user]);

  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'daily_reports'), limit(10000));
  }, [db, user]);

  const usersQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'users'), limit(10000));
  }, [db, user]);

  const auditQuery = useMemoFirebase(() => {
    if (!db || !user || profile?.role !== 'admin') return null;
    return query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(6));
  }, [db, user, profile?.role]);

  const { data: registrations, isLoading: isRegLoading } =
    useCollection<Registration>(registrationsQuery);
  const { data: reports, isLoading: isReportsLoading } = useCollection<DailyReport>(reportsQuery);
  const { data: officers, isLoading: isUsersLoading } = useCollection<UserProfile>(usersQuery);
  const { data: recentAudit, isLoading: isAuditLoading } = useCollection<AuditLog>(auditQuery);

  useEffect(() => {
    if (registrations || reports || officers) {
      setLastSynced(new Date());
    }
  }, [registrations, reports, officers]);

  const existingInstitutions = useMemo(() => {
    const set = new Set<string>();
    (registrations || []).forEach((r) => {
      const name = (r.institutionName || r.schoolName || '').trim();
      if (name) set.add(name);
    });
    (reports || []).forEach((rep) => {
      const name = (rep.institutionName || rep.schoolName || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registrations, reports]);

  // Today's Bureau-Wide Live Intake & Institution Split
  const todaySummary = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayReports = (reports || []).filter((r) => r.date === todayStr);
    const todayRecords = (registrations || []).filter((r) => {
      try {
        return format(new Date(r.submissionDate), 'yyyy-MM-dd') === todayStr;
      } catch {
        return false;
      }
    });

    if (todayReports.length > 0) {
      let total = 0;
      let ethio = 0;
      let safaricom = 0;
      let institutionCount = 0;
      let nonInstitutionCount = 0;

      todayReports.forEach((rep) => {
        const repTotal = Number(rep.total || 0);
        total += repTotal;
        ethio += Number(rep.ethioCount || 0);
        safaricom += Number(rep.safaricomCount || 0);
        const hasInst =
          Boolean(rep.isInstitutionRegistration || rep.isSchoolRegistration) ||
          Boolean((rep.institutionName || rep.schoolName || '').trim().length > 0);
        const instPart =
          typeof rep.studentCount === 'number'
            ? Math.min(repTotal, Math.max(0, rep.studentCount))
            : hasInst
            ? repTotal
            : 0;
        const nonInstPart =
          typeof rep.nonStudentCount === 'number'
            ? Math.max(0, rep.nonStudentCount)
            : Math.max(0, repTotal - instPart);
        institutionCount += instPart;
        nonInstitutionCount += nonInstPart;
      });

      return {
        reportsLoggedCount: todayReports.length,
        total,
        ethio,
        safaricom,
        institutionCount,
        nonInstitutionCount,
      };
    }

    const instRecs = todayRecords.filter(
      (r) => (r.institutionName || r.schoolName || '').trim().length > 0
    ).length;
    return {
      reportsLoggedCount: 0,
      total: todayRecords.length,
      ethio: 0,
      safaricom: 0,
      institutionCount: instRecs,
      nonInstitutionCount: Math.max(0, todayRecords.length - instRecs),
    };
  }, [reports, registrations]);

  const stats: DashboardStats = useMemo(() => {
    const defaultStats: DashboardStats = {
      total: 0,
      processed: 0,
      pendingReview: 0,
      rejected: 0,
      processing: 0,
      failed: 0,
      totalOfficers: officers?.length || 0,
      activeOfficers: officers?.length || 0,
      pendingOfficers: 0,
      onDutyOfficers: officers?.filter((o) => o.isDutyActive).length || 0,
      institutionsCount: existingInstitutions.length,
      institutionRecordsCount: 0,
    };

    const totalFromReports = reports?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;
    const totalTrackedRecords = registrations?.length || 0;
    const instRecordsCount =
      registrations?.filter(
        (r) => (r.institutionName || r.schoolName || '').trim().length > 0
      ).length || 0;

    return {
      ...defaultStats,
      total: totalFromReports > 0 ? totalFromReports : totalTrackedRecords,
      processed: registrations?.filter((r) => r.status === 'Processed').length || 0,
      pendingReview: registrations?.filter((r) => r.status === 'Pending Review').length || 0,
      rejected: registrations?.filter((r) => r.status === 'Rejected').length || 0,
      processing:
        registrations?.filter(
          (r) => r.status === 'Processing' || r.status === 'Pending Review'
        ).length || 0,
      failed: registrations?.filter((r) => r.status === 'Failed').length || 0,
      institutionsCount: existingInstitutions.length,
      institutionRecordsCount: instRecordsCount,
    };
  }, [registrations, reports, officers, existingInstitutions.length]);

  const filteredRegistrations = useMemo(() => {
    if (!registrations) return [];
    if (!activeCardFilter) return registrations;
    if (activeCardFilter === 'INSTITUTIONS') {
      return registrations.filter(
        (r) => (r.institutionName || r.schoolName || '').trim().length > 0
      );
    }
    if (activeCardFilter === 'Processing') {
      return registrations.filter(
        (r) => r.status === 'Processing' || r.status === 'Pending Review'
      );
    }
    return registrations.filter((r) => r.status === activeCardFilter);
  }, [registrations, activeCardFilter]);

  const criticalPriorities = useMemo(() => {
    if (!registrations) return [];
    return registrations
      .filter(
        (r) =>
          r.status === 'Failed' ||
          (r.status === 'Rejected' && r.rejectionReason === 'Biometric Match')
      )
      .sort(
        (a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime()
      )
      .slice(0, 5);
  }, [registrations]);

  const handleToggleDuty = async () => {
    if (!db || !user || !profile || isTogglingDuty) return;

    setIsTogglingDuty(true);
    const newDutyStatus = !profile.isDutyActive;

    try {
      await updateDocumentNonBlocking(doc(db, 'users', user.uid), {
        isDutyActive: newDutyStatus,
        updatedAt: new Date().toISOString(),
      });

      logAuditAction(
        db,
        user,
        profile.fullName,
        'PERSONNEL_MODIFIED',
        user.uid,
        `Admin Duty Status Change: Set to ${newDutyStatus ? 'ACTIVE' : 'OFF-DUTY'}.`
      );

      toast({
        title: newDutyStatus ? 'Active Duty Initialized' : 'Off-Duty Signal Sent',
        description: `Bureau status updated in the coordination matrix.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Protocol Failure',
        description: 'Could not synchronize duty status with backend.',
      });
    } finally {
      setIsTogglingDuty(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  const handleExportExcel = () => {
    if (!filteredRegistrations || filteredRegistrations.length === 0 || !user || !profile)
      return;
    setIsExporting(true);

    const exportData = filteredRegistrations.map((r) => ({
      ID: r.id,
      Applicant: r.applicantName,
      'Institution Name': r.institutionName || r.schoolName || 'Individual',
      Date: format(new Date(r.submissionDate), 'yyyy-MM-dd'),
      Status: r.status,
      Location: r.location,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GlobalRegistry');
    XLSX.writeFile(wb, `Bureau_Global_Registry_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    logAuditAction(
      db,
      user,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'admin_dashboard',
      `Admin Overview: Generated global XLSX snapshot for ${filteredRegistrations.length} records.`
    );

    toast({
      title: 'Excel Intelligence Exported',
      description: 'Global registry snapshot downloaded.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (!filteredRegistrations || filteredRegistrations.length === 0 || !user || !profile)
      return;
    setIsExporting(true);

    const pdfDoc = new jsPDF();
    pdfDoc.text(`Bureau Global Registry Snapshot: ${profile.fullName}`, 14, 15);
    const rows = filteredRegistrations.map((r) => [
      r.id.substring(0, 15) + '...',
      r.applicantName,
      r.institutionName || r.schoolName || 'Individual',
      format(new Date(r.submissionDate), 'MMM dd'),
      r.status,
    ]);
    autoTable(pdfDoc, {
      startY: 25,
      head: [['RID', 'Applicant', 'Institution', 'Date', 'Status']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
    });
    pdfDoc.save(`Bureau_Global_Snapshot_${format(new Date(), 'yyyyMMdd')}.pdf`);

    logAuditAction(
      db,
      user,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'admin_dashboard',
      `Admin Overview: Generated global PDF snapshot for ${filteredRegistrations.length} records.`
    );

    toast({
      title: 'PDF Document Generated',
      description: 'Official bureau documentation saved.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  if (isRegLoading || isReportsLoading || isUsersLoading || isAuditLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground animate-pulse">
            Initializing Command Home
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10 animate-in fade-in duration-700 pb-28">
      {/* Header Command */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2 w-2 rounded-full animate-pulse',
                profile?.isDutyActive ? 'bg-green-500' : 'bg-muted-foreground/30'
              )}
            />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              Bureau Administration Hub
            </p>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">
            Admin Overview
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg">
            Unified Command Center for bureau-wide operations, institutions, and personnel oversight.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 glass-card-surface p-3 rounded-2xl">
          <div className="flex items-center gap-3 px-4 border-r border-white/60 dark:border-white/10">
            <div
              className={cn(
                'p-2.5 rounded-xl transition-all backdrop-blur-md',
                profile?.isDutyActive
                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                  : 'bg-white/40 dark:bg-white/5 text-muted-foreground border border-white/60 dark:border-white/10'
              )}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                Admin Status
              </span>
              <button
                onClick={handleToggleDuty}
                disabled={isTogglingDuty}
                className={cn(
                  'text-sm font-black uppercase tracking-tighter flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer',
                  profile?.isDutyActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
                )}
              >
                {isTogglingDuty ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Power className="h-3 w-3" />
                )}
                {profile?.isDutyActive ? 'Active Duty' : 'Signal Offline'}
              </button>
            </div>
          </div>

          <div
            className="flex items-center gap-3 px-4 border-r border-white/60 dark:border-white/10 group cursor-pointer"
            onClick={handleRefresh}
          >
            <div className="p-2.5 bg-primary/15 border border-primary/20 backdrop-blur-md rounded-xl text-primary group-hover:rotate-180 transition-transform duration-500">
              <RefreshCcw className={cn('h-5 w-5', isRefreshing && 'animate-spin')} />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                Last Sync
              </span>
              <span className="text-sm font-black text-foreground uppercase tracking-tighter">
                {lastSynced ? format(lastSynced, 'HH:mm:ss') : '--:--:--'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 px-2">
            <div className="p-2.5 bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 backdrop-blur-md rounded-xl text-muted-foreground">
              <Timer className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                System
              </span>
              <span className="text-sm font-black text-green-600 dark:text-emerald-400 uppercase tracking-tighter">
                Optimal
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Bureau-Wide Live Intake & Processing Verification Queue */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-7 rounded-[24px] relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-primary/15 blur-3xl"
          />
          <CardContent className="p-5 sm:p-6 relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  Bureau Today&apos;s Intake • {format(new Date(), 'MMM dd, yyyy')}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase">
                  <CheckCircle2 className="h-3 w-3" /> {todaySummary.reportsLoggedCount} Daily Reports
                </span>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-black text-foreground tabular-nums">
                  {todaySummary.total.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  People Registered Today
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-bold tabular-nums">
                  <Building2 className="h-3 w-3" /> {todaySummary.institutionCount} Institution
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg glass-subpanel text-slate-700 dark:text-slate-200 text-[11px] font-bold tabular-nums">
                  <UserCheck className="h-3 w-3 text-emerald-500" />{' '}
                  {todaySummary.nonInstitutionCount} Non-Institution
                </span>
                {todaySummary.reportsLoggedCount > 0 && (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tabular-nums">
                      <Phone className="h-2.5 w-2.5" /> {todaySummary.ethio} Ethio
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-bold tabular-nums">
                      <Smartphone className="h-2.5 w-2.5" /> {todaySummary.safaricom} Safaricom
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
              <Button
                asChild
                size="sm"
                className="rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs h-9 px-4 shadow-md shadow-primary/20"
              >
                <Link href="/admin/reports-entry">Proxy Report Entry</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5 rounded-[24px] relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-amber-500/15 blur-3xl"
          />
          <CardContent className="p-5 sm:p-6 relative z-10 flex flex-col justify-between h-full gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Processing Verification Queue
                </span>
                <p className="text-2xl sm:text-3xl font-black text-foreground tabular-nums">
                  {stats.processing.toLocaleString()}{' '}
                  <span className="text-sm font-bold text-muted-foreground">In Processing</span>
                </p>
              </div>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="glass-subpanel rounded-xl h-9 px-3.5 text-xs font-bold text-primary hover:bg-primary hover:text-white transition-all shrink-0"
              >
                <Link href="/status-check">
                  Verify Queue <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {stats.processing > 0
                ? `${stats.processing} bureau-wide record(s) currently in Processing status ready for verification.`
                : 'Zero records waiting in Processing queue. Open the Verification Terminal anytime.'}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Admin Quick Action Matrix (4 Glassy Cards) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="rounded-[22px] hover:-translate-y-0.5 transition-all duration-300 group relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-orange-500/15 blur-2xl group-hover:bg-orange-500/25 transition-all"
          />
          <CardContent className="p-6 space-y-5 relative z-10">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-[12px] bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/25">
                <Plus className="h-5 w-5" />
              </div>
              <RegistrationFormModal
                mode="add"
                existingSchools={existingInstitutions}
                trigger={
                  <button
                    type="button"
                    className="glass-subpanel px-3.5 py-1.5 rounded-[10px] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:text-primary transition-all cursor-pointer"
                  >
                    Launch
                  </button>
                }
              />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                New Registration
              </h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Enroll new citizen or institution RIDs directly into the global registry.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] hover:-translate-y-0.5 transition-all duration-300 group relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-violet-500/15 blur-2xl group-hover:bg-violet-500/25 transition-all"
          />
          <CardContent className="p-6 space-y-5 relative z-10">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-[12px] bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-1.5">
                <RegistrationFormModal
                  mode="add"
                  defaultIsSchool={true}
                  existingSchools={existingInstitutions}
                  trigger={
                    <button
                      type="button"
                      className="glass-subpanel px-2.5 py-1.5 rounded-[10px] text-[11px] font-semibold text-primary hover:bg-primary/10 transition-all cursor-pointer"
                    >
                      + Add
                    </button>
                  }
                />
                <Link
                  href="/schools-students"
                  className="glass-subpanel px-3 py-1.5 rounded-[10px] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:text-primary transition-all"
                >
                  Open
                </Link>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  Institutions
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 tabular-nums">
                  {stats.institutionsCount || 0} Active
                </span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {stats.institutionRecordsCount || 0} records registered across institutions.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] hover:-translate-y-0.5 transition-all duration-300 group relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-sky-500/15 blur-2xl group-hover:bg-sky-500/25 transition-all"
          />
          <CardContent className="p-6 space-y-5 relative z-10">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-[12px] bg-gradient-to-br from-sky-400 to-sky-600 text-white flex items-center justify-center shadow-lg shadow-sky-500/25">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <Link
                href="/status-check"
                className="glass-subpanel px-3.5 py-1.5 rounded-[10px] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:text-primary transition-all"
              >
                Verify
              </Link>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                Verification Terminal
              </h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Verify Processing RIDs against the official portal with auto-advance.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] hover:-translate-y-0.5 transition-all duration-300 group relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-indigo-500/15 blur-2xl group-hover:bg-indigo-500/25 transition-all"
          />
          <CardContent className="p-6 space-y-5 relative z-10">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 rounded-[12px] glass-subpanel text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Megaphone className="h-5 w-5" />
              </div>
              <Link
                href="/admin/announcements"
                className="glass-subpanel px-3.5 py-1.5 rounded-[10px] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:text-primary transition-all"
              >
                Broadcast
              </Link>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                Bureau Broadcasts
              </h3>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Publish operational directives and alerts to all field officers.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Stats Matrix */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="h-3 w-3 text-primary" /> Reported Totals (Click Any Card to Filter Ledger)
          </h2>
          {activeCardFilter && (
            <button
              type="button"
              onClick={() => setActiveCardFilter(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full glass-subpanel text-[10px] font-bold text-primary cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" /> Clear Filter ({activeCardFilter})
            </button>
          )}
        </div>
        <StatsCards
          stats={stats}
          showOfficerCount={true}
          activeFilter={activeCardFilter}
          onSelectFilter={setActiveCardFilter}
        />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Main Worklist */}
        <section className="xl:col-span-8 min-w-0 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Bureau Detail Ledger
                </h2>
                {activeCardFilter && (
                  <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                    Filtered: {activeCardFilter === 'INSTITUTIONS' ? 'Institutions' : activeCardFilter}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consolidated applicant records across all sectors
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                onClick={handleExportExcel}
                disabled={isExporting}
                variant="outline"
                size="sm"
                className="glass-subpanel h-9 px-3.5 rounded-full text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-white/75 dark:hover:bg-white/10"
              >
                {isExporting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                )}
                Export XLS
              </Button>
              <Button
                onClick={handleExportPDF}
                disabled={isExporting}
                variant="outline"
                size="sm"
                className="glass-subpanel h-9 px-3.5 rounded-full text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-white/75 dark:hover:bg-white/10"
              >
                {isExporting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileTextIcon className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
                )}
                Export PDF
              </Button>
            </div>
          </div>
          <RegistrationTable
            registrations={filteredRegistrations || []}
            isDashboardView={true}
          />
        </section>

        {/* Intelligence Sidebars */}
        <aside className="xl:col-span-4 min-w-0 space-y-8">
          {/* Critical Priority Monitor */}
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-rose-500 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Critical Priority Monitor
            </h2>
            <div className="space-y-3">
              {criticalPriorities.length > 0 ? (
                criticalPriorities.map((item) => (
                  <Card
                    key={item.id}
                    className="!border-rose-500/25 !bg-rose-500/[0.06] dark:!bg-rose-950/25 rounded-2xl overflow-hidden group hover:-translate-y-0.5 transition-all"
                  >
                    <CardContent className="p-4 flex gap-4">
                      <div className="p-2.5 bg-rose-500/15 border border-rose-500/20 backdrop-blur-md rounded-xl h-fit text-rose-600 dark:text-rose-400">
                        <Zap className="h-4 w-4 animate-pulse" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-foreground uppercase leading-none">
                            {item.applicantName}
                          </p>
                          <span className="text-[8px] font-black px-1.5 py-0.5 bg-rose-500 text-white rounded uppercase tracking-tighter">
                            Urgent
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                          {item.status}: {item.rejectionReason || 'Protocol Error'}
                        </p>
                        <p className="text-[9px] font-mono font-bold text-rose-500/70 pt-1">
                          RID: {item.id.substring(0, 15)}...
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="glass-card-surface p-12 text-center border-dashed rounded-[32px] !border-emerald-500/25 !bg-emerald-500/[0.05]">
                  <ShieldCheck className="h-10 w-10 text-emerald-500/30 mx-auto mb-3" />
                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                    Operational Calm
                  </p>
                  <p className="text-[9px] text-muted-foreground/60 uppercase font-bold mt-1">
                    Zero high-risk discrepancies detected
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Recent Forensic Snapshot */}
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Forensic Snapshot
            </h2>
            <Card className="rounded-[32px] overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-white/50 dark:divide-white/10">
                  {recentAudit?.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 hover:bg-white/40 dark:hover:bg-white/[0.04] transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="glass-subpanel p-2 rounded-lg text-muted-foreground shrink-0">
                          <Fingerprint className="h-3.5 w-3.5 opacity-50 group-hover:text-primary group-hover:opacity-100 transition-all" />
                        </div>
                        <div className="flex-1 space-y-0.5 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-black text-foreground truncate uppercase tracking-tight">
                              {log.officerName}
                            </p>
                            <span className="text-[8px] font-mono font-bold text-muted-foreground/50 whitespace-nowrap">
                              {log.timestamp?.toDate
                                ? format(log.timestamp.toDate(), 'HH:mm:ss')
                                : 'Just now'}
                            </span>
                          </div>
                          <p className="text-[9px] text-muted-foreground font-medium leading-relaxed italic truncate">
                            {log.details}
                          </p>
                          <div className="pt-1 flex items-center gap-2">
                            <span className="text-[7px] font-black uppercase px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded tracking-tighter">
                              {log.action.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!recentAudit?.length && (
                    <div className="p-12 text-center opacity-20">
                      <Clock className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-[10px] font-black uppercase">Ledger Empty</p>
                    </div>
                  )}
                </div>
              </CardContent>
              {recentAudit && recentAudit.length > 0 && (
                <div className="p-3 border-t border-white/60 dark:border-white/10 bg-white/30 dark:bg-white/[0.02]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 rounded-xl font-black text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                    asChild
                  >
                    <Link href="/admin/audit-ledger">
                      View Full Forensic Vault <ArrowRight className="ml-2 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              )}
            </Card>
          </section>
        </aside>
      </div>

      <div className="glass-subpanel p-6 rounded-[32px] flex items-center gap-4">
        <ShieldCheck className="h-6 w-6 text-primary shrink-0 opacity-60" />
        <p className="text-[10px] text-foreground font-bold uppercase leading-relaxed tracking-widest max-w-5xl">
          Administrative Command Protocol: You are viewing the global bureau ledger. Every action triggered from this terminal—including mass triage and personnel revocation—is signed into the Forensic Ledger under your official administrative signature. Precision and accountability are mandatory.
        </p>
      </div>
    </div>
  );
}
