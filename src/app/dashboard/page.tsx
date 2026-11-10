'use client';

import { useMemo, useState, useEffect } from 'react';
import { useMemoFirebase, useCollection, useUser, useFirestore, useDoc } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { RegistrationTable } from '@/components/dashboard/registration-table';
import { Card, CardContent } from '@/components/ui/card';
import {
  ShieldCheck,
  Megaphone,
  Info,
  Timer,
  Loader2,
  Sparkles,
  Plus,
  MessageSquare,
  CalendarPlus,
  Power,
  RefreshCcw,
  FileSpreadsheet,
  FileText as FileTextIcon,
  TrendingUp as VelocityIcon,
  ArrowRight,
  Clock,
  CheckCircle2,
  Building2,
  Phone,
  Smartphone,
  UserCheck,
  RotateCcw,
} from 'lucide-react';
import { Registration, DashboardStats, Announcement, DailyReport, UserProfile } from '@/lib/types';
import { RegistrationFormModal } from '@/components/registrations/registration-form-modal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';
import { format, subDays } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useTranslation } from '@/i18n/language-provider';

export default function OfficerDashboard() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t, formatDate, formatNumber } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCardFilter, setActiveCardFilter] = useState<string | null>(null);
  const [isTogglingDuty, setIsTogglingDuty] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLastSynced(new Date());
  }, []);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', user.uid),
      limit(10000)
    );
  }, [db, user]);

  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'daily_reports'), where('officerId', '==', user.uid));
  }, [db, user]);

  const announcementsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'announcements'), limit(10));
  }, [db, user]);

  const { data: rawRegistrations, isLoading: isRegLoading } =
    useCollection<Registration>(registrationsQuery);
  const { data: reports, isLoading: isReportsLoading } = useCollection<DailyReport>(reportsQuery);
  const { data: announcements, isLoading: isAnnLoading } =
    useCollection<Announcement>(announcementsQuery);

  useEffect(() => {
    if (rawRegistrations || reports || announcements) {
      setLastSynced(new Date());
    }
  }, [rawRegistrations, reports, announcements]);

  const existingInstitutions = useMemo(() => {
    const set = new Set<string>();
    (rawRegistrations || []).forEach((r) => {
      const name = (r.institutionName || r.schoolName || '').trim();
      if (name) set.add(name);
    });
    (reports || []).forEach((rep) => {
      const name = (rep.institutionName || rep.schoolName || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawRegistrations, reports]);

  // Today's Live Intake & Institution vs Non-Institution Split
  const todaySummary = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayReports = (reports || []).filter((r) => r.date === todayStr);
    const todayRecords = (rawRegistrations || []).filter((r) => {
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
        hasDailyReport: true,
        total,
        ethio,
        safaricom,
        institutionCount,
        nonInstitutionCount,
        individualRecordsToday: todayRecords.length,
      };
    }

    const instRecs = todayRecords.filter(
      (r) => (r.institutionName || r.schoolName || '').trim().length > 0
    ).length;
    return {
      hasDailyReport: false,
      total: todayRecords.length,
      ethio: 0,
      safaricom: 0,
      institutionCount: instRecs,
      nonInstitutionCount: Math.max(0, todayRecords.length - instRecs),
      individualRecordsToday: todayRecords.length,
    };
  }, [reports, rawRegistrations]);

  const sortedAnnouncements = useMemo(() => {
    if (!announcements) return [];
    return [...announcements].sort((a, b) => {
      const getTs = (item: Announcement) => {
        if (item.timestamp?.toDate) return item.timestamp.toDate().getTime();
        return new Date(item.date).getTime();
      };
      return getTs(b) - getTs(a);
    });
  }, [announcements]);

  const filteredRegistrations = useMemo(() => {
    if (!rawRegistrations) return [];
    return rawRegistrations.filter((reg) => {
      if (activeCardFilter) {
        if (activeCardFilter === 'INSTITUTIONS') {
          const instName = (reg.institutionName || rInst(reg)).trim();
          if (!instName) return false;
        } else if (activeCardFilter === 'Processing') {
          if (reg.status !== 'Processing' && reg.status !== 'Pending Review') return false;
        } else if (reg.status !== activeCardFilter) {
          return false;
        }
      }

      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        reg.applicantName.toLowerCase().includes(q) ||
        reg.id.toLowerCase().includes(q) ||
        reg.status.toLowerCase().includes(q) ||
        (reg.institutionName || reg.schoolName || '').toLowerCase().includes(q)
      );
    });
  }, [rawRegistrations, searchTerm, activeCardFilter]);

  function rInst(reg: Registration) {
    return reg.schoolName || '';
  }

  const stats: DashboardStats = useMemo(() => {
    const defaultStats: DashboardStats = {
      total: 0,
      processed: 0,
      pendingReview: 0,
      rejected: 0,
      processing: 0,
      failed: 0,
      totalOfficers: 0,
      activeOfficers: 0,
      pendingOfficers: 0,
      onDutyOfficers: 0,
      institutionsCount: 0,
      institutionRecordsCount: 0,
    };

    if (!mounted) return defaultStats;

    const totalFromReports = reports?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;
    const totalTrackedRecords = rawRegistrations?.length || 0;
    const instRecordsCount =
      rawRegistrations?.filter(
        (r) => (r.institutionName || r.schoolName || '').trim().length > 0
      ).length || 0;

    return {
      ...defaultStats,
      total: totalFromReports > 0 ? totalFromReports : totalTrackedRecords,
      processed: rawRegistrations?.filter((r) => r.status === 'Processed').length || 0,
      pendingReview: rawRegistrations?.filter((r) => r.status === 'Pending Review').length || 0,
      rejected: rawRegistrations?.filter((r) => r.status === 'Rejected').length || 0,
      processing:
        rawRegistrations?.filter(
          (r) => r.status === 'Processing' || r.status === 'Pending Review'
        ).length || 0,
      failed: rawRegistrations?.filter((r) => r.status === 'Failed').length || 0,
      institutionsCount: existingInstitutions.length,
      institutionRecordsCount: instRecordsCount,
    };
  }, [rawRegistrations, reports, mounted, existingInstitutions.length]);

  const velocityData = useMemo(() => {
    if (!reports || !mounted) return [];
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), i);
      return format(d, 'yyyy-MM-dd');
    }).reverse();

    return last7Days.map((date) => {
      const dayTotal = reports
        .filter((r) => r.date === date)
        .reduce((acc, curr) => acc + (curr.total || 0), 0);
      return {
        name: format(new Date(date), 'MMM dd'),
        total: dayTotal,
      };
    });
  }, [reports, mounted]);

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
        `Officer Duty Status Change: Set to ${newDutyStatus ? 'ACTIVE' : 'OFF-DUTY'}.`
      );

      toast({
        title: newDutyStatus ? t.dashboard.toastDutyActiveTitle : t.dashboard.toastDutyOfflineTitle,
        description: t.dashboard.toastDutyDesc,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: t.dashboard.toastDutyErrorTitle,
        description: t.dashboard.toastDutyErrorDesc,
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
    if (filteredRegistrations.length === 0 || !user || !profile) return;
    setIsExporting(true);

    const exportData = filteredRegistrations.map((r) => ({
      ID: r.id,
      Applicant: r.applicantName,
      'Institution Name': r.institutionName || r.schoolName || t.registrationTable.individualCitizen,
      Date: format(new Date(r.submissionDate), 'yyyy-MM-dd'),
      Status: t.common.status[r.status] || r.status,
      Location: r.location,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ActiveWorklist');
    XLSX.writeFile(wb, `Bureau_Worklist_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    logAuditAction(
      db,
      user,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'officer_dashboard',
      `Dashboard: Generated XLSX worklist snapshot for ${filteredRegistrations.length} records.`
    );

    toast({
      title: t.dashboard.toastExcelTitle,
      description: t.dashboard.toastExcelDesc,
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (filteredRegistrations.length === 0 || !user || !profile) return;
    setIsExporting(true);

    const pdfDoc = new jsPDF();
    pdfDoc.text(`Worklist Snapshot: ${profile.fullName}`, 14, 15);
    const rows = filteredRegistrations.map((r) => [
      r.id.substring(0, 15),
      r.applicantName,
      r.institutionName || r.schoolName || t.registrationTable.individualCitizen,
      format(new Date(r.submissionDate), 'MMM dd'),
      t.common.status[r.status] || r.status,
    ]);
    autoTable(pdfDoc, {
      startY: 25,
      head: [['RID', 'Applicant', 'Institution', 'Date', 'Status']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
    });
    pdfDoc.save(`Bureau_Worklist_${format(new Date(), 'yyyyMMdd')}.pdf`);

    logAuditAction(
      db,
      user,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'officer_dashboard',
      `Dashboard: Generated PDF worklist archive for ${filteredRegistrations.length} records.`
    );

    toast({ title: t.dashboard.toastPdfTitle, description: t.dashboard.toastPdfDesc });
    setTimeout(() => setIsExporting(false), 800);
  };

  if (isRegLoading || isReportsLoading || isAnnLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10 animate-in fade-in duration-700 pb-28">
      {/* Dynamic Command Header */}
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
              {t.dashboard.eyebrow}
            </p>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-headline">
            {t.dashboard.title}
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg">
            {t.dashboard.subtitle}
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
                {t.dashboard.commandStatusLabel}
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
                {profile?.isDutyActive ? t.dashboard.activeDuty : t.dashboard.signalOffline}
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
                {t.dashboard.lastSyncLabel}
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
                {t.dashboard.networkLabel}
              </span>
              <span className="text-sm font-black text-green-600 dark:text-emerald-400 uppercase tracking-tighter">
                {t.common.synced}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Live Output & Processing Queue Banner */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Today's Live Intake & Institution vs Non-Institution Split */}
        <Card className="lg:col-span-7 rounded-[24px] relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-primary/15 blur-3xl"
          />
          <CardContent className="p-5 sm:p-6 relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  {t.dashboard.todayLiveIntake.replace('{date}', formatDate(new Date()))}
                </span>
                {todaySummary.hasDailyReport ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase">
                    <CheckCircle2 className="h-3 w-3" /> {t.dashboard.reportLogged}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase">
                    <Clock className="h-3 w-3" /> {t.dashboard.reportPending}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-black text-foreground tabular-nums">
                  {formatNumber(todaySummary.total)}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {t.dashboard.peopleRegisteredToday}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-bold tabular-nums">
                  <Building2 className="h-3 w-3" />{' '}
                  {t.dashboard.institutionCountBadge.replace('{count}', formatNumber(todaySummary.institutionCount))}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg glass-subpanel text-slate-700 dark:text-slate-200 text-[11px] font-bold tabular-nums">
                  <UserCheck className="h-3 w-3 text-emerald-500" />{' '}
                  {t.dashboard.nonInstitutionCountBadge.replace('{count}', formatNumber(todaySummary.nonInstitutionCount))}
                </span>
                {todaySummary.hasDailyReport && (
                  <>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tabular-nums">
                      <Phone className="h-2.5 w-2.5" />{' '}
                      {t.dashboard.ethioCountBadge.replace('{count}', formatNumber(todaySummary.ethio))}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-bold tabular-nums">
                      <Smartphone className="h-2.5 w-2.5" />{' '}
                      {t.dashboard.safaricomCountBadge.replace('{count}', formatNumber(todaySummary.safaricom))}
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
                <Link href="/daily-registrations">
                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                  {todaySummary.hasDailyReport ? t.dashboard.updateDailyReportBtn : t.dashboard.logDailyReportBtn}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Processing Queue Verification Card */}
        <Card className="lg:col-span-5 rounded-[24px] relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-amber-500/15 blur-3xl"
          />
          <CardContent className="p-5 sm:p-6 relative z-10 flex flex-col justify-between h-full gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> {t.dashboard.verificationQueueEyebrow}
                </span>
                <p className="text-2xl sm:text-3xl font-black text-foreground tabular-nums">
                  {formatNumber(stats.processing)}{' '}
                  <span className="text-sm font-bold text-muted-foreground">{t.dashboard.inProcessingLabel}</span>
                </p>
              </div>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="glass-subpanel rounded-xl h-9 px-3.5 text-xs font-bold text-primary hover:bg-primary hover:text-white transition-all shrink-0"
              >
                <Link href="/status-check">
                  {t.dashboard.verifyNowBtn} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {stats.processing > 0
                ? t.dashboard.queuePendingDesc.replace('{count}', formatNumber(stats.processing))
                : t.dashboard.queueClearDesc}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Quick Action Matrix (4 Glassy Integration Cards) */}
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
                    {t.dashboard.launchBtn}
                  </button>
                }
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {t.dashboard.cardNewRegTitle}
                </h3>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500/10" />
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {t.dashboard.cardNewRegDesc}
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
                      title={t.registrationModal.institutionToggleLabel}
                      className="glass-subpanel px-2.5 py-1.5 rounded-[10px] text-[11px] font-semibold text-primary hover:bg-primary/10 transition-all cursor-pointer"
                    >
                      {t.dashboard.addShortBtn}
                    </button>
                  }
                />
                <Link
                  href="/schools-students"
                  className="glass-subpanel px-3 py-1.5 rounded-[10px] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:text-primary transition-all"
                >
                  {t.dashboard.openBtn}
                </Link>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {t.dashboard.cardInstTitle}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 tabular-nums">
                  {t.dashboard.activeCountBadge.replace('{count}', formatNumber(stats.institutionsCount || 0))}
                </span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {t.dashboard.cardInstDesc.replace('{count}', formatNumber(stats.institutionRecordsCount || 0))}
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
                <CalendarPlus className="h-5 w-5" />
              </div>
              <Link
                href="/daily-registrations"
                className="glass-subpanel px-3.5 py-1.5 rounded-[10px] !border-indigo-500/40 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-all"
              >
                {t.dashboard.connectedBadge}
              </Link>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {t.dashboard.cardDailyTitle}
                </h3>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500/10" />
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {t.dashboard.cardDailyDesc}
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
                <MessageSquare className="h-5 w-5" />
              </div>
              <Link
                href="/communication"
                className="glass-subpanel px-3.5 py-1.5 rounded-[10px] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-primary/50 hover:text-primary transition-all"
              >
                {t.dashboard.connectBtn}
              </Link>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  {t.dashboard.cardCommsTitle}
                </h3>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500/10" />
              </div>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {t.dashboard.cardCommsDesc}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 min-w-0 space-y-8">
          {/* Registration Velocity Intelligence (Glassy Graph) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <VelocityIcon className="h-3.5 w-3.5 text-primary" /> {t.dashboard.velocityTitle}
              </h2>
              <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full glass-subpanel text-primary">
                {t.dashboard.liveTelemetryBadge}
              </span>
            </div>
            <Card className="rounded-[24px] overflow-hidden relative group">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-20 right-12 h-44 w-44 rounded-full bg-primary/15 blur-3xl"
              />
              <CardContent className="p-5 sm:p-6 relative z-10">
                <div className="glass-chart-surface p-4 h-[225px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={velocityData}
                      margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorVelocity" x1="0" y1="0" x2="0" y2="1">
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
                            return (
                              <div className="glass-chart-tooltip px-3.5 py-2.5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                                  {payload[0].payload.name}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                  <p className="text-sm font-black text-foreground tracking-tighter tabular-nums">
                                    {t.dashboard.chartTotalPrefix.replace('{value}', String(payload[0].value))}
                                  </p>
                                </div>
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
                        fill="url(#colorVelocity)"
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
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> {t.dashboard.performanceMetricsTitle}
              </h2>
              {activeCardFilter && (
                <button
                  type="button"
                  onClick={() => setActiveCardFilter(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full glass-subpanel text-[10px] font-bold text-primary cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />{' '}
                  {t.dashboard.clearFilterBtn.replace(
                    '{filter}',
                    activeCardFilter === 'INSTITUTIONS'
                      ? t.dashboard.cardInstTitle
                      : t.common.status[activeCardFilter] || activeCardFilter
                  )}
                </button>
              )}
            </div>
            <StatsCards
              stats={stats}
              showOfficerCount={false}
              activeFilter={activeCardFilter}
              onSelectFilter={setActiveCardFilter}
            />
          </section>

          {/* Worklist Triage */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    {t.dashboard.activityLedgerTitle}
                  </h2>
                  {activeCardFilter && (
                    <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                      {t.dashboard.filteredBadge.replace(
                        '{filter}',
                        activeCardFilter === 'INSTITUTIONS'
                          ? t.dashboard.cardInstTitle
                          : t.common.status[activeCardFilter] || activeCardFilter
                      )}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.dashboard.activityLedgerDesc}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <Button
                  onClick={handleExportExcel}
                  disabled={isExporting}
                  variant="outline"
                  className="glass-subpanel h-9 px-3.5 rounded-full text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-white/75 dark:hover:bg-white/10"
                >
                  {isExporting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                  )}
                  {t.dashboard.exportXlsBtn}
                </Button>
                <Button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  variant="outline"
                  className="glass-subpanel h-9 px-3.5 rounded-full text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-white/75 dark:hover:bg-white/10"
                >
                  {isExporting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileTextIcon className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
                  )}
                  {t.dashboard.exportPdfBtn}
                </Button>
              </div>
            </div>
            <RegistrationTable
              registrations={filteredRegistrations || []}
              isDashboardView={true}
            />
          </section>
        </div>

        {/* Priorities Intelligence */}
        <section className="xl:col-span-4 min-w-0 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
            <Megaphone className="h-3.5 w-3.5 text-primary" /> {t.dashboard.intelligenceFeedTitle}
          </h2>
          <div className="space-y-3.5">
            {sortedAnnouncements.length > 0 ? (
              sortedAnnouncements.map((ann, idx) => {
                const isNew =
                  ann.timestamp?.toDate &&
                  profile?.lastAnnouncementReadAt &&
                  ann.timestamp.toDate().getTime() >
                    new Date(profile.lastAnnouncementReadAt).getTime();
                const glassTints = [
                  '!bg-amber-500/[0.07] dark:!bg-slate-900/55',
                  '!bg-indigo-500/[0.07] dark:!bg-indigo-950/35',
                  '!bg-emerald-500/[0.07] dark:!bg-emerald-950/35',
                ];
                const cardTint =
                  ann.type === 'alert'
                    ? '!bg-rose-500/[0.08] dark:!bg-rose-950/35 !border-rose-500/25'
                    : glassTints[idx % glassTints.length];

                return (
                  <Card
                    key={ann.id}
                    className={cn(
                      'rounded-[22px] transition-all hover:-translate-y-0.5 group relative overflow-hidden',
                      cardTint
                    )}
                  >
                    <CardContent className="p-5 space-y-2 relative z-10">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                          {ann.title}
                        </h4>
                        {isNew && (
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                            {t.dashboard.newBadge}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <Clock className="h-3 w-3 opacity-60" />
                        <span>{ann.date}</span>
                      </div>
                      <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                        {ann.content}
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="p-16 text-center glass-card-surface border-dashed rounded-3xl text-muted-foreground/40 flex flex-col items-center gap-4">
                <Info className="h-10 w-10 opacity-20" />
                <p className="text-xs font-black uppercase tracking-[0.2em]">
                  {t.dashboard.zeroBulletins}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
