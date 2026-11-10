'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
  Layers,
  Trophy,
  ShieldAlert,
  Award,
  AlertTriangle,
  Star,
  Building2,
  User,
  Phone,
  Smartphone,
  FileSpreadsheet,
  FileText,
  Clock,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { Registration, DailyReport, UserProfile } from '@/lib/types';
import {
  format,
  subDays,
  subMonths,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  isWithinInterval,
} from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useTranslation } from '@/i18n/language-provider';

const COLORS = {
  processed: '#10b981', // Emerald
  processing: '#f59e0b', // Amber
  rejected: '#ef4444', // Red
  failed: '#64748b', // Slate
  ethio: '#10b981',
  safaricom: '#f97316',
};

type TimeHorizon = '7d' | 'current' | 'last_month' | 'history';

const getThresholdColor = (value: number) => {
  if (value >= 85) return '#10b981';
  if (value >= 80) return '#f59e0b';
  return '#ef4444';
};

const getRecordInstitutionName = (reg: Registration): string =>
  (reg.institutionName || reg.schoolName || '').trim();

const getReportInstitutionName = (rep: DailyReport): string =>
  (rep.institutionName || rep.schoolName || '').trim();

const calculateExactRate = (count: number, total: number): number => {
  if (total <= 0 || count <= 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
};

function MetricGauge({
  label,
  value,
  count,
  totalCount,
  color,
  trend,
  description,
  inverseTrend = false,
  isSuccessGauge = false,
  onClick,
}: {
  label: string;
  value: number;
  count: number;
  totalCount: number;
  color: string;
  trend: number;
  description: string;
  inverseTrend?: boolean;
  isSuccessGauge?: boolean;
  onClick?: () => void;
}) {
  const { t, formatNumber } = useTranslation();
  const data = [{ name: label, value: value, fill: color }];
  const isUp = trend > 0;
  const isNeutral = trend === 0;
  const isGood = inverseTrend ? trend < 0 : trend > 0;

  const tooltipText = isSuccessGauge
    ? value >= 85
      ? t.intelMatrix.tooltipElite
      : value >= 80
      ? t.intelMatrix.tooltipCaution
      : t.intelMatrix.tooltipCritical
    : t.intelMatrix.tooltipInspect
        .replace('{desc}', description)
        .replace('{count}', formatNumber(count))
        .replace('{total}', formatNumber(totalCount));

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            onClick={onClick}
            className="clay-card rounded-[28px] hover:-translate-y-1 overflow-hidden flex flex-col justify-between p-6 relative group transition-all duration-300 cursor-pointer"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-15 dark:opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-30"
              style={{ backgroundColor: color }}
            />
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-[13px] font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                  />
                  {label}
                </p>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              </div>
              <div
                className={cn(
                  'clay-badge flex items-center gap-0.5 text-[11px] font-bold px-2.5 py-1 rounded-full tabular-nums',
                  isNeutral
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    : isGood
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                )}
              >
                {!isNeutral &&
                  (isUp ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  ))}
                {isNeutral ? t.intelMatrix.stableBadge : `${Number(Math.abs(trend).toFixed(2))}%`}
              </div>
            </div>

            <div className="clay-well h-[154px] w-full relative z-10 mt-3.5 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="64%"
                  innerRadius="72%"
                  outerRadius="102%"
                  barSize={14}
                  data={data}
                  startAngle={180}
                  endAngle={0}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background dataKey="value" cornerRadius={30} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pt-8 pointer-events-none">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums">
                  {value}%
                </span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                  {t.intelMatrix.recordsCountUnit
                    .replace('{count}', formatNumber(count))
                    .replace('{total}', formatNumber(totalCount))}
                </span>
              </div>
            </div>
          </Card>
        </TooltipTrigger>
        <TooltipContent className="glass-chart-tooltip p-3 max-w-[220px]">
          <p className="text-[10px] font-bold text-foreground leading-relaxed uppercase tracking-tight">
            {tooltipText}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function FullPerformancePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { t, formatDate, formatNumber } = useTranslation();

  const [mounted, setMounted] = useState(false);
  const [analysisScope, setAnalysisScope] = useState<TimeHorizon>('history');
  const [institutionFilter, setInstitutionFilter] = useState<string>('ALL');
  const [velocityView, setVelocityView] = useState<'combined' | 'network'>('network');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const isAdmin = profile?.role === 'admin';

  const regsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    if (isAdmin) return query(collection(db, 'registrations'), limit(10000));
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', user.uid),
      limit(10000)
    );
  }, [db, user, isAdmin]);

  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    if (isAdmin) return query(collection(db, 'daily_reports'), limit(10000));
    return query(
      collection(db, 'daily_reports'),
      where('officerId', '==', user.uid),
      limit(10000)
    );
  }, [db, user, isAdmin]);

  const { data: registrations, isLoading: isRegsLoading } = useCollection<Registration>(regsQuery);
  const { data: reports, isLoading: isReportsLoading } = useCollection<DailyReport>(reportsQuery);

  // Extract unique Institution Names across registrations and daily reports
  const institutionNames = useMemo(() => {
    const set = new Set<string>();
    (registrations || []).forEach((r) => {
      const n = getRecordInstitutionName(r);
      if (n) set.add(n);
    });
    (reports || []).forEach((d) => {
      const n = getReportInstitutionName(d);
      if (n) set.add(n);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registrations, reports]);

  // Filter registrations & reports by Institution Filter
  const scopedRegistrationsByInst = useMemo(() => {
    if (!registrations) return [];
    if (institutionFilter === 'ALL') return registrations;
    if (institutionFilter === 'INSTITUTIONS_ONLY') {
      return registrations.filter((r) => Boolean(getRecordInstitutionName(r)));
    }
    if (institutionFilter === 'INDIVIDUALS_ONLY') {
      return registrations.filter((r) => !getRecordInstitutionName(r));
    }
    return registrations.filter(
      (r) => getRecordInstitutionName(r).toLowerCase() === institutionFilter.trim().toLowerCase()
    );
  }, [registrations, institutionFilter]);

  const scopedReportsByInst = useMemo(() => {
    if (!reports) return [];
    if (institutionFilter === 'ALL') return reports;
    if (institutionFilter === 'INSTITUTIONS_ONLY') {
      return reports.filter((d) => Boolean(getReportInstitutionName(d)));
    }
    if (institutionFilter === 'INDIVIDUALS_ONLY') {
      return reports.filter((d) => !getReportInstitutionName(d));
    }
    return reports.filter(
      (d) => getReportInstitutionName(d).toLowerCase() === institutionFilter.trim().toLowerCase()
    );
  }, [reports, institutionFilter]);

  const allTimeHighs = useMemo(() => {
    if (!scopedRegistrationsByInst || !mounted) return null;

    const monthGroups: Record<string, { total: number; processed: number }> = {};

    scopedRegistrationsByInst.forEach((r) => {
      const date = new Date(r.submissionDate);
      const key = format(date, 'MMMM yyyy');

      if (!monthGroups[key]) {
        monthGroups[key] = { total: 0, processed: 0 };
      }

      monthGroups[key].total += 1;
      if (r.status === 'Processed') {
        monthGroups[key].processed += 1;
      }
    });

    let bestRate = -1;
    let bestPeriod = 'No Data';

    Object.entries(monthGroups).forEach(([period, data]) => {
      if (data.total >= 1) {
        const rate = (data.processed / data.total) * 100;
        if (rate > bestRate) {
          bestRate = rate;
          bestPeriod = period;
        }
      }
    });

    return {
      rate: bestRate > -1 ? Number(bestRate.toFixed(2)) : 0,
      period: bestPeriod,
    };
  }, [scopedRegistrationsByInst, mounted]);

  // Date interval helper for TimeHorizon
  const horizonIntervals = useMemo(() => {
    const now = new Date();
    if (analysisScope === '7d') {
      return {
        current: { start: startOfDay(subDays(now, 6)), end: endOfDay(now) },
        previous: { start: startOfDay(subDays(now, 13)), end: endOfDay(subDays(now, 7)) },
        label: t.intelMatrix.horizon7dLabel,
      };
    }
    if (analysisScope === 'current') {
      return {
        current: { start: startOfMonth(now), end: endOfMonth(now) },
        previous: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
        label: formatDate(now, { month: 'long', year: 'numeric' }),
      };
    }
    if (analysisScope === 'last_month') {
      const prev = subMonths(now, 1);
      const twoAgo = subMonths(now, 2);
      return {
        current: { start: startOfMonth(prev), end: endOfMonth(prev) },
        previous: { start: startOfMonth(twoAgo), end: endOfMonth(twoAgo) },
        label: formatDate(prev, { month: 'long', year: 'numeric' }),
      };
    }
    return {
      current: null,
      previous: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
      label: t.intelMatrix.horizonAllTimeLabel,
    };
  }, [analysisScope, t.intelMatrix.horizon7dLabel, t.intelMatrix.horizonAllTimeLabel, formatDate]);

  const stats = useMemo(() => {
    if (!scopedRegistrationsByInst || !mounted) return null;

    const scopeRegs = horizonIntervals.current
      ? scopedRegistrationsByInst.filter((r) =>
          isWithinInterval(new Date(r.submissionDate), horizonIntervals.current!)
        )
      : scopedRegistrationsByInst;

    const prevRegs = scopedRegistrationsByInst.filter((r) =>
      isWithinInterval(new Date(r.submissionDate), horizonIntervals.previous)
    );

    const total = scopeRegs.length;
    if (total === 0) return null;

    const counts = {
      processed: scopeRegs.filter((r) => r.status === 'Processed').length,
      processing: scopeRegs.filter(
        (r) => r.status === 'Processing' || r.status === 'Pending Review'
      ).length,
      rejected: scopeRegs.filter((r) => r.status === 'Rejected').length,
      failed: scopeRegs.filter((r) => r.status === 'Failed').length,
    };

    const exactTotal =
      counts.processed + counts.processing + counts.rejected + counts.failed;
    if (exactTotal === 0) return null;

    // Full Rejection & Failure Reasons Breakdown
    const reasonMap: Record<string, { count: number; status: 'Rejected' | 'Failed' }> = {};
    scopeRegs
      .filter((r) => r.status === 'Rejected' || r.status === 'Failed')
      .forEach((r) => {
        const reason =
          (r.rejectionReason || '').trim() ||
          (r.status === 'Failed' ? 'System / Transmission Failure' : 'Unspecified Rejection');
        if (!reasonMap[reason]) {
          reasonMap[reason] = {
            count: 0,
            status: r.status === 'Failed' ? 'Failed' : 'Rejected',
          };
        }
        reasonMap[reason].count += 1;
      });

    const totalRejectedAndFailed = counts.rejected + counts.failed;
    const reasonBreakdown = Object.entries(reasonMap)
      .map(([reason, info]) => ({
        reason,
        count: info.count,
        status: info.status,
        pct: calculateExactRate(info.count, totalRejectedAndFailed),
      }))
      .sort((a, b) => b.count - a.count);

    const topReason = reasonBreakdown[0]?.reason || 'None';

    // Institution vs Individual breakdown within scope
    const instRegs = scopeRegs.filter((r) => Boolean(getRecordInstitutionName(r)));
    const indivRegs = scopeRegs.filter((r) => !getRecordInstitutionName(r));
    const institutionBreakdown = {
      instCount: instRegs.length,
      indivCount: indivRegs.length,
      instPct: calculateExactRate(instRegs.length, exactTotal),
      indivPct: calculateExactRate(indivRegs.length, exactTotal),
      instProcessedPct: calculateExactRate(
        instRegs.filter((r) => r.status === 'Processed').length,
        instRegs.length
      ),
      indivProcessedPct: calculateExactRate(
        indivRegs.filter((r) => r.status === 'Processed').length,
        indivRegs.length
      ),
    };

    // Top Institutions Leaderboard within selected timeframe
    const instMap = new Map<
      string,
      {
        name: string;
        total: number;
        processed: number;
        processing: number;
        rejected: number;
        failed: number;
      }
    >();

    instRegs.forEach((r) => {
      const name = getRecordInstitutionName(r);
      if (!name) return;
      const key = name.toLowerCase();
      let entry = instMap.get(key);
      if (!entry) {
        entry = { name, total: 0, processed: 0, processing: 0, rejected: 0, failed: 0 };
        instMap.set(key, entry);
      }
      entry.total += 1;
      if (r.status === 'Processed') entry.processed += 1;
      else if (r.status === 'Processing' || r.status === 'Pending Review') entry.processing += 1;
      else if (r.status === 'Rejected') entry.rejected += 1;
      else if (r.status === 'Failed') entry.failed += 1;
    });

    const topInstitutions = Array.from(instMap.values())
      .map((item) => ({
        ...item,
        completionRate: calculateExactRate(item.processed, item.total),
      }))
      .sort((a, b) => b.total - a.total);

    const prevCounts = {
      processed: prevRegs.filter((r) => r.status === 'Processed').length,
      processing: prevRegs.filter(
        (r) => r.status === 'Processing' || r.status === 'Pending Review'
      ).length,
      rejected: prevRegs.filter((r) => r.status === 'Rejected').length,
      failed: prevRegs.filter((r) => r.status === 'Failed').length,
    };
    const prevTotal =
      prevCounts.processed + prevCounts.processing + prevCounts.rejected + prevCounts.failed;

    const rates = {
      processed: calculateExactRate(counts.processed, exactTotal),
      processing: calculateExactRate(counts.processing, exactTotal),
      rejected: calculateExactRate(counts.rejected, exactTotal),
      failed: calculateExactRate(counts.failed, exactTotal),
    };

    const prevRates = {
      processed: calculateExactRate(prevCounts.processed, prevTotal),
      processing: calculateExactRate(prevCounts.processing, prevTotal),
      rejected: calculateExactRate(prevCounts.rejected, prevTotal),
      failed: calculateExactRate(prevCounts.failed, prevTotal),
    };

    const trends =
      prevTotal > 0 && analysisScope !== 'history'
        ? {
            processed: Number((rates.processed - prevRates.processed).toFixed(2)),
            processing: Number((rates.processing - prevRates.processing).toFixed(2)),
            rejected: Number((rates.rejected - prevRates.rejected).toFixed(2)),
            failed: Number((rates.failed - prevRates.failed).toFixed(2)),
          }
        : { processed: 0, processing: 0, rejected: 0, failed: 0 };

    const pieData = [
      { name: 'Processed', value: counts.processed, pct: rates.processed, color: COLORS.processed },
      {
        name: 'Processing',
        value: counts.processing,
        pct: rates.processing,
        color: COLORS.processing,
      },
      { name: 'Rejected', value: counts.rejected, pct: rates.rejected, color: COLORS.rejected },
      { name: 'Failed', value: counts.failed, pct: rates.failed, color: COLORS.failed },
    ];

    return {
      total: exactTotal,
      counts,
      rates,
      trends,
      pieData,
      topReason,
      reasonBreakdown,
      institutionBreakdown,
      topInstitutions,
    };
  }, [scopedRegistrationsByInst, mounted, horizonIntervals, analysisScope]);

  const temporalTrends = useMemo(() => {
    if (!scopedReportsByInst || !mounted) return null;

    const now = new Date();
    let days: Date[];
    if (analysisScope === '7d') {
      days = eachDayOfInterval({ start: subDays(now, 6), end: now });
    } else if (analysisScope === 'current') {
      days = eachDayOfInterval({ start: startOfMonth(now), end: now });
    } else if (analysisScope === 'last_month') {
      const prev = subMonths(now, 1);
      days = eachDayOfInterval({ start: startOfMonth(prev), end: endOfMonth(prev) });
    } else {
      days = eachDayOfInterval({ start: subDays(now, 29), end: now });
    }

    let peakCount = -1;
    let peakDay: Date | null = null;
    let totalEthio = 0;
    let totalSafaricom = 0;
    let totalCombined = 0;

    const dailyTrend = days.map((date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayReports = scopedReportsByInst.filter((r) => r.date === dateStr);
      const ethio = dayReports.reduce((acc, curr) => acc + Number(curr.ethioCount || 0), 0);
      const safaricom = dayReports.reduce((acc, curr) => acc + Number(curr.safaricomCount || 0), 0);
      const dayTotal = dayReports.reduce((acc, curr) => acc + Number(curr.total || 0), 0);

      totalEthio += ethio;
      totalSafaricom += safaricom;
      totalCombined += dayTotal;

      if (dayTotal > peakCount) {
        peakCount = dayTotal;
        peakDay = date;
      }

      return {
        label: format(date, 'MMM dd'),
        dateStr,
        value: dayTotal,
        ethio,
        safaricom,
      };
    });

    const ethioPct = calculateExactRate(totalEthio, totalCombined);
    const safaricomPct = calculateExactRate(totalSafaricom, totalCombined);

    return {
      dailyTrend,
      peakDay: peakDay ? format(peakDay, 'MMMM dd') : 'No Data',
      peakAmount: peakCount > -1 ? peakCount : 0,
      totalEthio,
      totalSafaricom,
      totalCombined,
      ethioPct,
      safaricomPct,
    };
  }, [scopedReportsByInst, mounted, analysisScope]);

  // Export Official Intel Excel Report
  const handleExportExcel = () => {
    if (!stats) return;
    setIsExporting(true);

    const wb = XLSX.utils.book_new();

    // Sheet 1: KPI Summary
    const summaryData = [
      { Metric: 'Time Horizon', Value: horizonIntervals.label },
      {
        Metric: 'Institution Scope',
        Value:
          institutionFilter === 'ALL'
            ? 'All Records'
            : institutionFilter === 'INSTITUTIONS_ONLY'
            ? 'Institutions Only'
            : institutionFilter === 'INDIVIDUALS_ONLY'
            ? 'Individuals Only'
            : institutionFilter,
      },
      { Metric: 'Total Registrations', Value: stats.total },
      { Metric: 'Processed', Value: `${stats.counts.processed} (${stats.rates.processed}%)` },
      { Metric: 'Processing', Value: `${stats.counts.processing} (${stats.rates.processing}%)` },
      { Metric: 'Rejected', Value: `${stats.counts.rejected} (${stats.rates.rejected}%)` },
      { Metric: 'Failed', Value: `${stats.counts.failed} (${stats.rates.failed}%)` },
      {
        Metric: 'Institution Registrations',
        Value: `${stats.institutionBreakdown.instCount} (${stats.institutionBreakdown.instPct}%)`,
      },
      {
        Metric: 'Individual Registrations',
        Value: `${stats.institutionBreakdown.indivCount} (${stats.institutionBreakdown.indivPct}%)`,
      },
      {
        Metric: 'Ethio Telecom Daily Intake',
        Value: `${temporalTrends?.totalEthio || 0} (${temporalTrends?.ethioPct || 0}%)`,
      },
      {
        Metric: 'Safaricom Daily Intake',
        Value: `${temporalTrends?.totalSafaricom || 0} (${temporalTrends?.safaricomPct || 0}%)`,
      },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Intel_Summary');

    // Sheet 2: Top Institutions Leaderboard
    if (stats.topInstitutions.length > 0) {
      const instSheet = stats.topInstitutions.map((inst, idx) => ({
        Rank: idx + 1,
        'Institution Name': inst.name,
        'Total Records': inst.total,
        Processed: inst.processed,
        Processing: inst.processing,
        Rejected: inst.rejected,
        Failed: inst.failed,
        'Completion Rate (%)': `${inst.completionRate}%`,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instSheet), 'Institutions_Intel');
    }

    // Sheet 3: Rejection & Failure Reasons
    if (stats.reasonBreakdown.length > 0) {
      const reasonSheet = stats.reasonBreakdown.map((r, idx) => ({
        '#': idx + 1,
        Reason: r.reason,
        Status: r.status,
        Count: r.count,
        'Share (%)': `${r.pct}%`,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reasonSheet), 'Rejection_Reasons');
    }

    // Sheet 4: Daily Network Velocity
    if (temporalTrends?.dailyTrend?.length) {
      const velocitySheet = temporalTrends.dailyTrend.map((d) => ({
        Date: d.dateStr,
        'Ethio Telecom': d.ethio,
        Safaricom: d.safaricom,
        'Total Intake': d.value,
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(velocitySheet),
        'Network_Velocity'
      );
    }

    XLSX.writeFile(wb, `Fayda_Intel_Matrix_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    if (db && user && profile) {
      logAuditAction(
        db,
        user,
        profile.fullName,
        'PERFORMANCE_REVIEW',
        'full_intel_matrix',
        `Intel Matrix: Exported Excel report (${horizonIntervals.label}).`
      );
    }

    toast({
      title: t.intelMatrix.toastExcelTitle,
      description: t.intelMatrix.toastExcelDesc.replace('{horizon}', horizonIntervals.label),
    });
    setTimeout(() => setIsExporting(false), 500);
  };

  // Export Official Intel PDF Report
  const handleExportPDF = () => {
    if (!stats) return;
    setIsExporting(true);

    const pdfDoc = new jsPDF('l', 'mm', 'a4');
    pdfDoc.setFontSize(14);
    pdfDoc.text(`Official Bureau Intelligence Matrix — ${horizonIntervals.label}`, 14, 15);

    pdfDoc.setFontSize(9);
    pdfDoc.text(
      `Generated By: ${profile?.fullName || user?.email || 'Bureau Official'} | Date: ${format(
        new Date(),
        'yyyy-MM-dd HH:mm'
      )} | Total: ${stats.total} | Processed: ${stats.counts.processed} (${
        stats.rates.processed
      }%) | Processing: ${stats.counts.processing} | Rejected: ${stats.counts.rejected}`,
      14,
      22
    );

    autoTable(pdfDoc, {
      startY: 28,
      head: [
        [
          'Processed',
          'Processing',
          'Rejected',
          'Failed',
          'Institution Regs',
          'Individual Regs',
          'Ethio Intake',
          'Safaricom Intake',
        ],
      ],
      body: [
        [
          `${stats.counts.processed} (${stats.rates.processed}%)`,
          `${stats.counts.processing} (${stats.rates.processing}%)`,
          `${stats.counts.rejected} (${stats.rates.rejected}%)`,
          `${stats.counts.failed} (${stats.rates.failed}%)`,
          `${stats.institutionBreakdown.instCount} (${stats.institutionBreakdown.instPct}%)`,
          `${stats.institutionBreakdown.indivCount} (${stats.institutionBreakdown.indivPct}%)`,
          `${temporalTrends?.totalEthio || 0} (${temporalTrends?.ethioPct || 0}%)`,
          `${temporalTrends?.totalSafaricom || 0} (${temporalTrends?.safaricomPct || 0}%)`,
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    });

    let nextY = (pdfDoc as any).lastAutoTable?.finalY
      ? (pdfDoc as any).lastAutoTable.finalY + 10
      : 55;

    if (stats.topInstitutions.length > 0) {
      autoTable(pdfDoc, {
        startY: nextY,
        head: [
          [
            '#',
            'Institution Name',
            'Total Records',
            'Processed',
            'Processing',
            'Rejected',
            'Failed',
            'Completion Rate',
          ],
        ],
        body: stats.topInstitutions.slice(0, 12).map((inst, idx) => [
          String(idx + 1),
          inst.name,
          String(inst.total),
          String(inst.processed),
          String(inst.processing),
          String(inst.rejected),
          String(inst.failed),
          `${inst.completionRate}%`,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
      });
    }

    pdfDoc.save(`Fayda_Intel_Matrix_${format(new Date(), 'yyyyMMdd')}.pdf`);

    if (db && user && profile) {
      logAuditAction(
        db,
        user,
        profile.fullName,
        'PERFORMANCE_REVIEW',
        'full_intel_matrix',
        `Intel Matrix: Exported PDF report (${horizonIntervals.label}).`
      );
    }

    toast({
      title: t.intelMatrix.toastPdfTitle,
      description: t.intelMatrix.toastPdfDesc.replace('{horizon}', horizonIntervals.label),
    });
    setTimeout(() => setIsExporting(false), 500);
  };

  if (isUserLoading || isRegsLoading || isReportsLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      {/* Header with Time Horizon, Institution Filter & Export Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">
              {t.intelMatrix.eyebrow.replace('{horizon}', horizonIntervals.label)}
            </p>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">
            {t.intelMatrix.title}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            {isAdmin
              ? t.intelMatrix.adminSubtitle
              : t.intelMatrix.officerSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 glass-card-surface p-3 rounded-2xl">
          {/* Time Horizon Filter */}
          <div className="flex items-center gap-1 p-1 rounded-xl glass-subpanel">
            {(
              [
                { id: '7d', label: t.intelMatrix.tab7d },
                { id: 'current', label: t.intelMatrix.tabCurrentMonth },
                { id: 'last_month', label: t.intelMatrix.tabLastMonth },
                { id: 'history', label: t.intelMatrix.tabAllTime },
              ] as { id: TimeHorizon; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAnalysisScope(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer',
                  analysisScope === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Institution Scope Dropdown */}
          <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
            <SelectTrigger className="glass-subpanel w-auto min-w-[175px] h-9 rounded-xl px-3 text-xs font-bold text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <SelectValue placeholder={t.intelMatrix.allRecordsScope} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs font-bold">
                {t.intelMatrix.allRecordsScope}
              </SelectItem>
              <SelectItem value="INSTITUTIONS_ONLY" className="text-xs font-semibold">
                {t.intelMatrix.institutionsOnlyScope}
              </SelectItem>
              <SelectItem value="INDIVIDUALS_ONLY" className="text-xs font-semibold">
                {t.intelMatrix.individualsOnlyScope}
              </SelectItem>
              {institutionNames.map((name) => (
                <SelectItem key={name} value={name} className="text-xs font-medium">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {institutionFilter !== 'ALL' && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setInstitutionFilter('ALL')}
              className="glass-subpanel h-9 w-9 rounded-xl text-primary"
              title={t.intelMatrix.resetFilterTooltip}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}

          <div className="h-6 w-px bg-white/60 dark:bg-white/10 hidden sm:block" />

          <Button
            type="button"
            variant="outline"
            disabled={!stats || isExporting}
            onClick={handleExportExcel}
            className="glass-subpanel h-9 px-3.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
            {t.intelMatrix.excelBtn}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!stats || isExporting}
            onClick={handleExportPDF}
            className="glass-subpanel h-9 px-3.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <FileText className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
            {t.intelMatrix.pdfBtn}
          </Button>
        </div>
      </div>

      {!stats ? (
        <div className="flex flex-col items-center justify-center py-36 clay-card rounded-[32px] text-muted-foreground/40">
          <Layers className="h-14 w-14 mb-4 opacity-20" />
          <p className="text-sm font-black uppercase tracking-[0.25em]">
            {t.intelMatrix.emptyTitle}
          </p>
          <p className="text-xs mt-1.5">
            {t.intelMatrix.emptyDesc}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAnalysisScope('history');
              setInstitutionFilter('ALL');
            }}
            className="mt-4 rounded-xl text-xs font-bold"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t.intelMatrix.showAllTimeBtn}
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Row 1: 4 Standardized & Clickable Rate Gauges */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <MetricGauge
              label={t.intelMatrix.gaugeSuccessLabel}
              value={stats.rates.processed}
              count={stats.counts.processed}
              totalCount={stats.total}
              color={getThresholdColor(stats.rates.processed)}
              trend={stats.trends.processed}
              description={t.intelMatrix.gaugeSuccessDesc}
              inverseTrend={false}
              isSuccessGauge={true}
              onClick={() => router.push('/status-check?status=Processed')}
            />
            <MetricGauge
              label={t.intelMatrix.gaugeProcessingLabel}
              value={stats.rates.processing}
              count={stats.counts.processing}
              totalCount={stats.total}
              color={COLORS.processing}
              trend={stats.trends.processing}
              description={t.intelMatrix.gaugeProcessingDesc}
              inverseTrend={true}
              onClick={() => router.push('/status-check?status=Processing')}
            />
            <MetricGauge
              label={t.intelMatrix.gaugeRejectionLabel}
              value={stats.rates.rejected}
              count={stats.counts.rejected}
              totalCount={stats.total}
              color={COLORS.rejected}
              trend={stats.trends.rejected}
              description={t.intelMatrix.gaugeRejectionDesc}
              inverseTrend={true}
              onClick={() => router.push('/status-check?status=Rejected')}
            />
            <MetricGauge
              label={t.intelMatrix.gaugeFailedLabel}
              value={stats.rates.failed}
              count={stats.counts.failed}
              totalCount={stats.total}
              color={COLORS.failed}
              trend={stats.trends.failed}
              description={t.intelMatrix.gaugeFailedDesc}
              inverseTrend={true}
              onClick={() => router.push('/status-check?status=Failed')}
            />
          </section>

          {/* Row 2: 4 Claymorphic Summary Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Card className="clay-card rounded-[28px] p-6 flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                    {t.intelMatrix.dailyPeakTitle}
                  </p>
                  <div className="clay-badge h-10 w-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                    <Award className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {temporalTrends?.peakDay}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.intelMatrix.dailyPeakDesc.replace('{horizon}', horizonIntervals.label)}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-3xl font-extrabold text-primary tabular-nums tracking-tight">
                  {formatNumber(temporalTrends?.peakAmount || 0)}
                </span>
                <span className="text-xs font-semibold text-slate-400">{t.intelMatrix.unitsLoggedLabel}</span>
              </div>
            </Card>

            <Card className="clay-card rounded-[28px] p-6 flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                    {t.intelMatrix.topRejectionTitle}
                  </p>
                  <div className="clay-badge h-10 w-10 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight line-clamp-2">
                  {stats.topReason}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.intelMatrix.topRejectionDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums tracking-tight">
                  {formatNumber(stats.counts.rejected)}
                </span>
                <span className="text-xs font-semibold text-slate-400">{t.intelMatrix.totalRejectedLabel}</span>
              </div>
            </Card>

            <Card className="clay-card rounded-[28px] p-6 flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                    {t.intelMatrix.institutionShareTitle}
                  </p>
                  <div className="clay-badge h-10 w-10 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Building2 className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums">
                  {t.intelMatrix.institutionalPctText.replace('{pct}', String(stats.institutionBreakdown.instPct))}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.intelMatrix.instVsIndivSubtext
                    .replace('{inst}', formatNumber(stats.institutionBreakdown.instCount))
                    .replace('{indiv}', formatNumber(stats.institutionBreakdown.indivCount))}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 tabular-nums tracking-tight">
                  {formatNumber(stats.topInstitutions.length)}
                </span>
                <span className="text-xs font-semibold text-slate-400">{t.intelMatrix.activeInstitutionsLabel}</span>
              </div>
            </Card>

            <Card className="clay-card-amber rounded-[28px] p-6 flex flex-col justify-between hover:-translate-y-1 transition-all relative overflow-hidden">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-amber-400/20 blur-2xl"
              />
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-amber-900 dark:text-amber-300">
                    {t.intelMatrix.eliteMilestoneTitle}
                  </p>
                  <div className="clay-badge h-10 w-10 rounded-2xl bg-amber-500/25 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                    <Trophy className="h-4 w-4" />
                  </div>
                </div>
                <div>
                  <h3 className="text-3xl font-extrabold text-amber-800 dark:text-amber-300 tabular-nums tracking-tight">
                    {allTimeHighs?.rate}%
                  </h3>
                  <p className="text-xs font-bold text-amber-800/80 dark:text-amber-300/90 mt-0.5">
                    {allTimeHighs?.period}
                  </p>
                </div>
                <p className="text-xs text-amber-900/70 dark:text-amber-200/70">
                  {t.intelMatrix.eliteMilestoneDesc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-amber-500/25 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    {t.intelMatrix.allTimePeakBadge}
                  </span>
                </div>
                <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 opacity-70" />
              </div>
            </Card>
          </section>

          {/* Row 3: Inbound Velocity Trend (with Ethio vs Safaricom Network Split) + Lifecycle Context */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-8 min-w-0 space-y-6">
              <Card className="clay-card rounded-[28px] overflow-hidden relative">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-24 right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
                />
                <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/60 py-5 px-6 md:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" /> {t.intelMatrix.velocityCardTitle}
                    </CardTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t.intelMatrix.velocityCardSubtitle.replace('{horizon}', horizonIntervals.label)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-xl clay-well">
                    <button
                      type="button"
                      onClick={() => setVelocityView('network')}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                        velocityView === 'network'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300'
                      )}
                    >
                      {t.intelMatrix.ethioVsSafaricomBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVelocityView('combined')}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                        velocityView === 'combined'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300'
                      )}
                    >
                      {t.intelMatrix.combinedTotalBtn}
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="p-5 md:p-7 space-y-5 relative z-10">
                  {/* Network Share Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="clay-well p-3.5 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                          <Phone className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            Ethio Telecom
                          </p>
                          <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                            {formatNumber(temporalTrends?.totalEthio || 0)}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {temporalTrends?.ethioPct || 0}%
                      </span>
                    </div>

                    <div className="clay-well p-3.5 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                          <Smartphone className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            Safaricom
                          </p>
                          <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                            {formatNumber(temporalTrends?.totalSafaricom || 0)}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                        {temporalTrends?.safaricomPct || 0}%
                      </span>
                    </div>

                    <div className="clay-well p-3.5 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                          <Activity className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {t.intelMatrix.totalDailyIntakeLabel}
                          </p>
                          <p className="text-lg font-extrabold text-primary tabular-nums">
                            {formatNumber(temporalTrends?.totalCombined || 0)}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-400">100%</span>
                    </div>
                  </div>

                  <div className="clay-well p-4 h-[290px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={temporalTrends?.dailyTrend || []}
                        margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorDaily" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.42} />
                            <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity={0.14} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorEthio" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorSafaricom" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f97316" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fontSize: 10,
                            fontWeight: 600,
                            fill: 'hsl(var(--muted-foreground))',
                          }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fontSize: 10,
                            fontWeight: 600,
                            fill: 'hsl(var(--muted-foreground))',
                          }}
                        />
                        <RechartsTooltip
                          cursor={{
                            stroke: 'hsl(var(--primary))',
                            strokeWidth: 1,
                            strokeDasharray: '4 4',
                          }}
                          content={({ active, payload }) => {
                            if (active && payload?.length) {
                              const row = payload[0].payload;
                              return (
                                <div className="glass-chart-tooltip p-3.5 space-y-1.5">
                                  <p className="text-xs font-bold text-muted-foreground">
                                    {row.label}
                                  </p>
                                  <div className="flex items-center justify-between gap-4 text-xs">
                                    <span className="font-semibold text-emerald-500">
                                      Ethio Telecom:
                                    </span>
                                    <span className="font-bold tabular-nums">{row.ethio}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 text-xs">
                                    <span className="font-semibold text-orange-500">
                                      Safaricom:
                                    </span>
                                    <span className="font-bold tabular-nums">{row.safaricom}</span>
                                  </div>
                                  <div className="pt-1 border-t border-white/20 flex items-center justify-between gap-4 text-xs">
                                    <span className="font-bold text-primary">{t.intelMatrix.totalDailyIntakeLabel}:</span>
                                    <span className="font-black tabular-nums">{row.value}</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        {velocityView === 'network' ? (
                          <>
                            <Area
                              type="monotone"
                              dataKey="ethio"
                              stroke="#10b981"
                              strokeWidth={2.5}
                              fillOpacity={1}
                              fill="url(#colorEthio)"
                            />
                            <Area
                              type="monotone"
                              dataKey="safaricom"
                              stroke="#f97316"
                              strokeWidth={2.5}
                              fillOpacity={1}
                              fill="url(#colorSafaricom)"
                            />
                          </>
                        ) : (
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.75}
                            fillOpacity={1}
                            fill="url(#colorDaily)"
                            activeDot={{
                              r: 5,
                              strokeWidth: 2,
                              stroke: '#ffffff',
                              fill: 'hsl(var(--primary))',
                            }}
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Complete Rejection & Failure Reasons Breakdown + Institution vs Individual Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Complete Rejection & Failure Breakdown */}
                <Card className="clay-card rounded-[28px] p-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="clay-badge p-2.5 bg-rose-500/15 rounded-2xl text-rose-600 dark:text-rose-400 shrink-0">
                          <ShieldAlert className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            {t.intelMatrix.rejectionBreakdownTitle}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t.intelMatrix.rejectionBreakdownSubtitle
                              .replace('{rejected}', formatNumber(stats.counts.rejected))
                              .replace('{failed}', formatNumber(stats.counts.failed))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {stats.reasonBreakdown.length === 0 ? (
                      <div className="clay-well p-6 rounded-2xl text-center">
                        <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-1.5" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          {t.intelMatrix.zeroRejectionsTitle}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {t.intelMatrix.zeroRejectionsDesc}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[210px] overflow-y-auto pr-1">
                        {stats.reasonBreakdown.map((item) => (
                          <div key={item.reason} className="clay-well p-3 rounded-2xl space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                {item.reason}
                              </span>
                              <span className="font-extrabold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                                {formatNumber(item.count)} ({item.pct}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  item.status === 'Failed' ? 'bg-slate-500' : 'bg-rose-500'
                                )}
                                style={{ width: `${Math.max(6, item.pct)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-5">
                    <Button
                      variant="outline"
                      onClick={() => router.push('/status-check?status=Rejected')}
                      className="clay-tab-active w-full h-10 rounded-2xl font-bold text-xs hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all"
                    >
                      {t.intelMatrix.inspectRejectedBtn.replace('{count}', formatNumber(stats.counts.rejected))}
                    </Button>
                  </div>
                </Card>

                {/* Institution vs Individual Intelligence Card */}
                <Card className="clay-card rounded-[28px] p-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="clay-badge p-2.5 bg-indigo-500/15 rounded-2xl text-indigo-600 dark:text-indigo-400 shrink-0">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {t.intelMatrix.splitCardTitle}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t.intelMatrix.splitCardSubtitle}
                        </p>
                      </div>
                    </div>

                    <div className="clay-well p-4 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          {t.intelMatrix.institutionsCountLabel.replace('{count}', formatNumber(stats.institutionBreakdown.instCount))}
                        </span>
                        <span className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {t.intelMatrix.individualCountLabel.replace('{count}', formatNumber(stats.institutionBreakdown.indivCount))}
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-indigo-600 transition-all duration-500"
                          style={{ width: `${stats.institutionBreakdown.instPct}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="p-2.5 rounded-xl bg-white/50 dark:bg-white/[0.03]">
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            {t.intelMatrix.institutionProcessedLabel}
                          </p>
                          <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {stats.institutionBreakdown.instProcessedPct}%
                          </p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white/50 dark:bg-white/[0.03]">
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            {t.intelMatrix.individualProcessedLabel}
                          </p>
                          <p className="text-lg font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">
                            {stats.institutionBreakdown.indivProcessedPct}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-5">
                    <Button
                      variant="outline"
                      asChild
                      className="clay-tab-active w-full h-10 rounded-2xl font-bold text-xs hover:bg-primary hover:text-white hover:border-primary transition-all"
                    >
                      <Link href="/schools-students">{t.intelMatrix.openInstitutionsBtn}</Link>
                    </Button>
                  </div>
                </Card>
              </div>
            </div>

            {/* Right Column: Lifecycle Context */}
            <div className="xl:col-span-4 min-w-0 space-y-6">
              <Card className="clay-card rounded-[28px] p-6">
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-primary" /> {t.intelMatrix.lifecycleTitle}
                </CardTitle>
                <div className="space-y-3">
                  {stats.pieData.map((item) => {
                    const statusLabel =
                      item.name === 'Processed'
                        ? t.common.statusProcessed
                        : item.name === 'Processing'
                        ? t.common.statusProcessing
                        : item.name === 'Rejected'
                        ? t.common.statusRejected
                        : t.common.statusFailed;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => router.push(`/status-check?status=${encodeURIComponent(item.name)}`)}
                        className="clay-well w-full flex items-center justify-between p-3.5 rounded-2xl hover:ring-1 hover:ring-primary/40 transition-all text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="h-3.5 w-3.5 rounded-full"
                            style={{
                              backgroundColor: item.color,
                              boxShadow: `0 0 10px ${item.color}88`,
                            }}
                          />
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">
                              {statusLabel}
                            </p>
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                              {t.intelMatrix.pctOfTotal.replace('{pct}', String(item.pct))}
                            </p>
                          </div>
                        </div>
                        <span className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                          {formatNumber(item.value)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 pt-6 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-center">
                  <div className="clay-well p-3 h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload?.length) {
                              return (
                                <div className="glass-chart-tooltip px-3 py-2">
                                  <p className="text-[11px] font-semibold text-muted-foreground">
                                    {payload[0].name}
                                  </p>
                                  <p className="text-sm font-bold text-foreground tabular-nums">
                                    {formatNumber(Number(payload[0].value))}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Pie
                          data={stats.pieData}
                          innerRadius={54}
                          outerRadius={78}
                          paddingAngle={6}
                          dataKey="value"
                          cornerRadius={6}
                        >
                          {stats.pieData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              stroke="rgba(255,255,255,0.45)"
                              strokeWidth={1.5}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </Card>

              <div className="clay-card p-6 rounded-[28px] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="clay-badge h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <Clock className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {t.intelMatrix.processingQueueTitle}
                    </p>
                  </div>
                  <span className="text-xs font-black text-amber-600 dark:text-amber-400 tabular-nums">
                    {t.intelMatrix.activeCountBadge.replace('{count}', formatNumber(stats.counts.processing))}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t.intelMatrix.processingQueueDesc.replace('{count}', formatNumber(stats.counts.processing))}
                </p>
                <Button
                  type="button"
                  onClick={() => router.push('/status-check?status=Processing')}
                  className="w-full h-10 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold text-xs"
                >
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                  {t.intelMatrix.verifyQueueBtn}
                </Button>
              </div>
            </div>
          </div>

          {/* Row 4: Top Institutions Performance Leaderboard */}
          {stats.topInstitutions.length > 0 && (
            <Card className="clay-card rounded-[28px] overflow-hidden">
              <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/60 py-5 px-6 md:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" /> {t.intelMatrix.leaderboardTitle}
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t.intelMatrix.leaderboardSubtitle.replace('{horizon}', horizonIntervals.label)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="clay-tab-active h-9 px-4 rounded-xl text-xs font-bold self-start sm:self-auto"
                >
                  <Link href="/schools-students">
                    {t.intelMatrix.viewAllInstitutionsBtn} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stats.topInstitutions.slice(0, 6).map((inst, idx) => (
                    <div
                      key={inst.name}
                      onClick={() => setInstitutionFilter(inst.name)}
                      className="clay-well p-4 rounded-2xl space-y-3 hover:ring-1 hover:ring-primary/40 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="h-7 w-7 rounded-lg bg-primary/15 text-primary text-xs font-black flex items-center justify-center shrink-0 tabular-nums">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {inst.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {t.intelMatrix.instRecordsAndPct
                                .replace('{total}', formatNumber(inst.total))
                                .replace('{pct}', String(inst.completionRate))}
                            </p>
                          </div>
                        </div>
                        {inst.processing > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/status-check?institution=${encodeURIComponent(
                                  inst.name
                                )}&status=Processing`
                              );
                            }}
                            className="px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 text-[10px] font-bold tabular-nums shrink-0 cursor-pointer"
                          >
                            {t.intelMatrix.verifyShortBtn.replace('{count}', formatNumber(inst.processing))}
                          </button>
                        )}
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500"
                          style={{ width: `${inst.completionRate}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {formatNumber(inst.processed)} {t.common.statusProcessed}
                        </span>
                        <span className="text-amber-600 dark:text-amber-400">
                          {formatNumber(inst.processing)} {t.common.statusProcessing}
                        </span>
                        <span className="text-rose-600 dark:text-rose-400">
                          {formatNumber(inst.rejected)} {t.common.statusRejected}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
