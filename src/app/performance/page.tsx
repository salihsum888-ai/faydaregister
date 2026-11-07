'use client';

import { useMemo, useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemoFirebase, useCollection, useUser, useFirestore, useDoc } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircle2,
  Loader2,
  TrendingUp,
  AlertCircle,
  User,
  Users,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  Eye,
  History,
  Target,
  Activity,
  Layers,
  AlertTriangle,
  Award,
  Copy,
  Check,
  SquarePen,
  Trash2,
  FileDigit,
  Building2,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { Registration, RegistrationStatus, UserProfile } from '@/lib/types';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { RegistrationFormModal } from '@/components/registrations/registration-form-modal';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import {
  deleteDocumentNonBlocking,
  updateDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import {
  format,
  addMonths,
  subMonths,
  eachDayOfInterval,
  endOfMonth,
  isSameDay,
} from 'date-fns';
import { Input } from '@/components/ui/input';
import {
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/lib/utils';

const START_DATE = new Date(2025, 6, 1); // July 1, 2025

const COLORS = {
  processed: '#10b981',
  processing: '#f59e0b',
  rejected: '#ef4444',
  failed: '#64748b',
};

function calcExactRate(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

function getInstitutionLabel(reg: Registration): string {
  return (reg.institutionName || reg.schoolName || '').trim();
}

const getThresholdColor = (value: number) => {
  if (value >= 85) return '#10b981'; // Green
  if (value >= 80) return '#f59e0b'; // Yellow
  return '#ef4444'; // Red
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
  isActive = false,
  onClick,
}: any) {
  const data = [{ name: label, value: value, fill: color }];
  const isUp = trend > 0;
  const isNeutral = trend === 0;
  const isGood = inverseTrend ? trend < 0 : trend > 0;

  const tooltipText =
    label === 'Success Rate'
      ? value >= 85
        ? 'Elite Status: Protocol efficiency exceeding 85.00%. Click to filter Processed records.'
        : value >= 80
        ? 'Cautionary: Quality dipped below 85.00% threshold. Click to filter Processed records.'
        : 'Critical Alert: Success rate below minimum 80.00% protocol. Click to filter Processed records.'
      : `${description} • Click gauge to filter audit ledger.`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            onClick={onClick}
            className={cn(
              'clay-card rounded-[28px] hover:-translate-y-1 overflow-hidden flex flex-col justify-between p-6 relative group transition-all duration-300 cursor-pointer select-none',
              isActive && 'ring-2 ring-primary shadow-lg'
            )}
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
                {isNeutral ? 'Steady' : `${Math.abs(trend).toFixed(2)}%`}
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
                {typeof count === 'number' && (
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                    {count.toLocaleString()}
                    {typeof totalCount === 'number' ? ` / ${totalCount.toLocaleString()}` : ''}{' '}
                    records
                  </span>
                )}
              </div>
            </div>
          </Card>
        </TooltipTrigger>
        <TooltipContent className="glass-chart-tooltip p-3 max-w-[230px]">
          <p className="text-[10px] font-bold text-foreground leading-relaxed uppercase tracking-tight">
            {tooltipText}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PerformanceContent() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedOfficerScope, setSelectedOfficerScope] = useState<string>('AUTO');
  const [originFilter, setOriginFilter] = useState<'ALL' | 'INSTITUTION' | 'INDIVIDUAL'>('ALL');
  const [auditStatusFilter, setAuditStatusFilter] = useState<
    'ALL' | 'Rejected' | 'Failed' | 'Processing' | 'Processed'
  >('Rejected');
  const [selectedReasonFilter, setSelectedReasonFilter] = useState<string>('ALL');

  const [selectedRejection, setSelectedRejection] = useState<Registration | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const itemsPerPage = 8;

  // Step 5: Side-by-Side Sector / Period Comparison State
  const [compareMode, setCompareMode] = useState<'SECTOR' | 'PERIOD'>('SECTOR');
  const [compareLeftKey, setCompareLeftKey] = useState<string>('');
  const [compareRightKey, setCompareRightKey] = useState<string>('');

  const handleCopyRid = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    toast({
      title: 'RID Copied',
      description: `Registration ID ${id} copied to clipboard.`,
    });
  };

  const urlOfficerId = searchParams.get('officerId');

  const currentUserProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: currentUserProfile, isLoading: isCurrentUserProfileLoading } =
    useDoc<UserProfile>(currentUserProfileRef);

  const isAdmin = currentUserProfile?.role === 'admin';

  // Initialize scope: if URL has ?officerId=..., use that; otherwise Admins default to 'GLOBAL' and Officers default to their own uid
  useEffect(() => {
    if (isCurrentUserProfileLoading || !user) return;
    if (urlOfficerId) {
      setSelectedOfficerScope(urlOfficerId);
    } else if (selectedOfficerScope === 'AUTO') {
      setSelectedOfficerScope(isAdmin ? 'GLOBAL' : user.uid);
    }
  }, [urlOfficerId, isAdmin, isCurrentUserProfileLoading, user, selectedOfficerScope]);

  const effectiveOfficerId =
    selectedOfficerScope === 'AUTO'
      ? urlOfficerId || (isAdmin ? 'GLOBAL' : user?.uid)
      : selectedOfficerScope;

  const isGlobalScope = effectiveOfficerId === 'GLOBAL';
  const isRemoteAudit = !isGlobalScope && effectiveOfficerId !== user?.uid;

  useEffect(() => {
    setMounted(true);
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (mounted && !selectedMonth) {
      setSelectedMonth('ALL');
    }
  }, [mounted, selectedMonth]);

  // Fetch all officers for Admin dropdown
  const allOfficersQuery = useMemoFirebase(() => {
    if (!db || !user || !isAdmin) return null;
    return query(collection(db, 'users'), limit(1000));
  }, [db, user, isAdmin]);
  const { data: allOfficers } = useCollection<UserProfile>(allOfficersQuery);

  const targetProfileRef = useMemoFirebase(() => {
    if (!db || !effectiveOfficerId || effectiveOfficerId === 'GLOBAL') return null;
    return doc(db, 'users', effectiveOfficerId);
  }, [db, effectiveOfficerId]);
  const { data: targetProfile, isLoading: isProfileLoading } =
    useDoc<UserProfile>(targetProfileRef);

  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user || !effectiveOfficerId) return null;
    if (effectiveOfficerId === 'GLOBAL') {
      return query(collection(db, 'registrations'), limit(10000));
    }
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', effectiveOfficerId),
      limit(10000)
    );
  }, [db, user, effectiveOfficerId]);

  const { data: rawRegistrations, isLoading } = useCollection<Registration>(registrationsQuery);

  // Filter by Origin (All vs Institution vs Individual)
  const registrations = useMemo(() => {
    if (!rawRegistrations) return [];
    if (originFilter === 'INSTITUTION') {
      return rawRegistrations.filter(
        (r) => Boolean(getInstitutionLabel(r) || r.isSchoolRegistration)
      );
    }
    if (originFilter === 'INDIVIDUAL') {
      return rawRegistrations.filter(
        (r) => !getInstitutionLabel(r) && !r.isSchoolRegistration
      );
    }
    return rawRegistrations;
  }, [rawRegistrations, originFilter]);

  const monthsList = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    let curr = new Date(START_DATE);
    const now = new Date();
    while (curr <= now) {
      list.push({
        value: format(curr, 'yyyy-MM'),
        label: format(curr, 'MMMM yyyy'),
      });
      curr = addMonths(curr, 1);
    }
    return [{ value: 'ALL', label: 'All-Time Archive' }, ...list.reverse()];
  }, []);

  const stats = useMemo(() => {
    if (!registrations || !selectedMonth || !mounted) return null;

    const now = new Date();
    const isAllTime = selectedMonth === 'ALL';
    const [year, month] = isAllTime
      ? [now.getFullYear(), now.getMonth() + 1]
      : selectedMonth.split('-').map(Number);
    const dateObj = new Date(year, month - 1, 1);
    const prevMonthStr = format(subMonths(dateObj, 1), 'yyyy-MM');

    const filterByPeriod = (p: string) =>
      p === 'ALL'
        ? registrations
        : registrations.filter((r) => format(new Date(r.submissionDate), 'yyyy-MM') === p);

    const currItems = filterByPeriod(selectedMonth);
    const prevItems = isAllTime ? [] : filterByPeriod(prevMonthStr);

    const calculateMetrics = (items: Registration[]) => {
      if (items.length === 0)
        return {
          total: 0,
          processed: 0,
          processing: 0,
          rejected: 0,
          failed: 0,
          successRate: 0,
          processingRate: 0,
          rejectionRate: 0,
          errorRate: 0,
          rejectionReasons: {} as Record<string, number>,
          reasonBreakdown: [] as { reason: string; count: number; exactPct: number }[],
          topReason: 'None',
          peakDay: null,
        };

      const processed = items.filter((r) => r.status === 'Processed').length;
      const processing = items.filter(
        (r) => r.status === 'Processing' || r.status === 'Pending Review'
      ).length;
      const rejected = items.filter((r) => r.status === 'Rejected').length;
      const failed = items.filter((r) => r.status === 'Failed').length;
      const exactTotal = processed + processing + rejected + failed;

      const reasons: Record<string, number> = {};
      const rejectedOrFailedItems = items.filter(
        (r) => r.status === 'Rejected' || r.status === 'Failed'
      );
      rejectedOrFailedItems.forEach((r) => {
        const reason =
          r.rejectionReason ||
          (r.status === 'Failed' ? 'System / Sync Failure' : 'Unspecified Rejection Reason');
        reasons[reason] = (reasons[reason] || 0) + 1;
      });

      const sortedReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
      const topReason = sortedReasons[0];
      const reasonBreakdown = sortedReasons.map(([reason, count]) => ({
        reason,
        count,
        exactPct: calcExactRate(count, rejectedOrFailedItems.length),
      }));

      return {
        total: exactTotal,
        processed,
        processing,
        rejected,
        failed,
        successRate: calcExactRate(processed, exactTotal),
        processingRate: calcExactRate(processing, exactTotal),
        rejectionRate: calcExactRate(rejected, exactTotal),
        errorRate: calcExactRate(failed, exactTotal),
        rejectionReasons: reasons,
        reasonBreakdown,
        topReason: topReason ? topReason[0] : 'None',
      };
    };

    const currMetrics = calculateMetrics(currItems);
    const prevMetrics = calculateMetrics(prevItems);

    // Institution vs Individual Split for Current Period
    const instItems = currItems.filter(
      (r) => Boolean(getInstitutionLabel(r) || r.isSchoolRegistration)
    );
    const indItems = currItems.filter(
      (r) => !getInstitutionLabel(r) && !r.isSchoolRegistration
    );
    const instProcessed = instItems.filter((r) => r.status === 'Processed').length;
    const instRejected = instItems.filter((r) => r.status === 'Rejected').length;
    const indProcessed = indItems.filter((r) => r.status === 'Processed').length;
    const indRejected = indItems.filter((r) => r.status === 'Rejected').length;

    const originComparison = {
      institutionTotal: instItems.length,
      institutionSharePct: calcExactRate(instItems.length, currMetrics.total),
      institutionSuccessRate: calcExactRate(instProcessed, instItems.length),
      institutionRejectionRate: calcExactRate(instRejected, instItems.length),
      individualTotal: indItems.length,
      individualSharePct: calcExactRate(indItems.length, currMetrics.total),
      individualSuccessRate: calcExactRate(indProcessed, indItems.length),
      individualRejectionRate: calcExactRate(indRejected, indItems.length),
    };

    // SLA Target Gap Calculation (85.00% Elite Target)
    // Needed processed records X so that (processed + X) / (total + X) >= 0.85 => X >= (0.85*total - processed) / 0.15
    const neededForElite =
      currMetrics.successRate >= 85
        ? 0
        : Math.max(
            1,
            Math.ceil((0.85 * currMetrics.total - currMetrics.processed) / 0.15)
          );

    const hasPrevData = prevMetrics.total > 0;
    const trends = {
      processed: hasPrevData
        ? Number((currMetrics.successRate - prevMetrics.successRate).toFixed(2))
        : 0,
      processing: hasPrevData
        ? Number((currMetrics.processingRate - prevMetrics.processingRate).toFixed(2))
        : 0,
      rejected: hasPrevData
        ? Number((currMetrics.rejectionRate - prevMetrics.rejectionRate).toFixed(2))
        : 0,
      failed: hasPrevData
        ? Number((currMetrics.errorRate - prevMetrics.errorRate).toFixed(2))
        : 0,
    };

    const startDate = new Date(year, month - 1, 1);
    const endDate = endOfMonth(startDate);
    const daysInterval = eachDayOfInterval({ start: startDate, end: endDate });

    let peakCount = -1;
    let peakDay = null;

    const trendData = daysInterval.map((day) => {
      const dayRegs = currItems.filter((r) => isSameDay(new Date(r.submissionDate), day));
      const count = dayRegs.length;

      if (count > peakCount) {
        peakCount = count;
        peakDay = day;
      }

      return {
        date: format(day, 'dd MMM'),
        success: dayRegs.filter((r) => r.status === 'Processed').length,
        rejected: dayRegs.filter((r) => r.status === 'Rejected').length,
        failed: dayRegs.filter((r) => r.status === 'Failed').length,
        total: count,
      };
    });

    return {
      ...currMetrics,
      trends,
      trendData,
      currItems,
      originComparison,
      neededForElite,
      peakDay: peakDay && peakCount > 0 ? format(peakDay, 'MMMM dd') : 'No Activity',
      peakAmount: peakCount > 0 ? peakCount : 0,
    };
  }, [registrations, selectedMonth, mounted]);

  // Step 5: Available Sectors/Locations & Periods for Side-by-Side Comparison
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    (registrations || []).forEach((r) => {
      const loc = (r.location || 'Primary Sector').split(',')[0].trim();
      if (loc) set.add(loc);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registrations]);

  const comparisonOptions = useMemo(() => {
    if (compareMode === 'SECTOR') {
      return availableSectors.map((s) => ({ value: s, label: s }));
    }
    return monthsList.filter((m) => m.value !== 'ALL');
  }, [compareMode, availableSectors, monthsList]);

  useEffect(() => {
    if (comparisonOptions.length === 0) return;
    const first = comparisonOptions[0]?.value || '';
    const second = comparisonOptions[1]?.value || first;
    setCompareLeftKey(first);
    setCompareRightKey(second);
  }, [compareMode, comparisonOptions]);

  const sideBySideComparison = useMemo(() => {
    const computeSlice = (key: string) => {
      const items = (registrations || []).filter((r) => {
        if (!key) return false;
        if (compareMode === 'SECTOR') {
          return (r.location || 'Primary Sector').split(',')[0].trim() === key;
        }
        return format(new Date(r.submissionDate), 'yyyy-MM') === key;
      });
      const processed = items.filter((r) => r.status === 'Processed').length;
      const processing = items.filter(
        (r) => r.status === 'Processing' || r.status === 'Pending Review'
      ).length;
      const rejected = items.filter((r) => r.status === 'Rejected').length;
      const failed = items.filter((r) => r.status === 'Failed').length;
      const exactTotal = processed + processing + rejected + failed;
      return {
        key,
        total: exactTotal,
        processed,
        processing,
        rejected,
        failed,
        successRate: calcExactRate(processed, exactTotal),
        processingRate: calcExactRate(processing, exactTotal),
        rejectionRate: calcExactRate(rejected, exactTotal),
        failedRate: calcExactRate(failed, exactTotal),
      };
    };
    return {
      left: computeSlice(compareLeftKey),
      right: computeSlice(compareRightKey),
    };
  }, [registrations, compareMode, compareLeftKey, compareRightKey]);

  const auditedRegistrations = useMemo(() => {
    if (!stats?.currItems) return [];
    const q = searchTerm.toLowerCase().trim();
    return stats.currItems
      .filter((r) => {
        if (auditStatusFilter === 'ALL') return true;
        if (auditStatusFilter === 'Processing') {
          return r.status === 'Processing' || r.status === 'Pending Review';
        }
        return r.status === auditStatusFilter;
      })
      .filter((r) => {
        if (selectedReasonFilter === 'ALL') return true;
        const reason =
          r.rejectionReason ||
          (r.status === 'Failed' ? 'System / Sync Failure' : 'Unspecified Rejection Reason');
        return reason === selectedReasonFilter;
      })
      .filter(
        (r) =>
          !q ||
          r.applicantName.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          (r.rejectionReason || '').toLowerCase().includes(q) ||
          getInstitutionLabel(r).toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
  }, [stats?.currItems, auditStatusFilter, selectedReasonFilter, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedMonth, auditStatusFilter, selectedReasonFilter, originFilter, effectiveOfficerId]);

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return auditedRegistrations.slice(start, start + itemsPerPage);
  }, [auditedRegistrations, currentPage]);

  const totalPages = Math.ceil(auditedRegistrations.length / itemsPerPage);

  const allOnPageSelected =
    paginatedRecords.length > 0 && paginatedRecords.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      paginatedRecords.forEach((r) => next.delete(r.id));
    } else {
      paginatedRecords.forEach((r) => next.add(r.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleQuickResolveRecord = (reg: Registration, nextStatus: RegistrationStatus) => {
    if (!db || !user) return;
    updateDocumentNonBlocking(doc(db, 'registrations', reg.id), {
      status: nextStatus,
      rejectionReason: nextStatus === 'Processed' ? '' : reg.rejectionReason || '',
    });
    logAuditAction(
      db,
      user,
      currentUserProfile?.fullName || 'Official',
      'STATUS_UPDATE',
      reg.id,
      `Performance Audit: Updated ${reg.applicantName} (${reg.id}) status to ${nextStatus}.`
    );
    toast({
      title: `Status Updated to ${nextStatus}`,
      description: `${reg.applicantName} is now marked as ${nextStatus}.`,
    });
    if (selectedRejection?.id === reg.id) {
      setSelectedRejection(null);
    }
  };

  const handleExportExcel = () => {
    if (!stats?.currItems || stats.currItems.length === 0 || !user) return;
    setIsExporting(true);

    const scopeLabel = isGlobalScope
      ? 'Bureau_Global'
      : (targetProfile?.fullName || 'Official').replace(/\s+/g, '_');

    const targetList =
      selectedIds.size > 0
        ? auditedRegistrations.filter((r) => selectedIds.has(r.id))
        : auditedRegistrations;

    const exportData = targetList.map((r) => ({
      '29-Digit RID': r.id,
      Applicant: r.applicantName,
      Origin: getInstitutionLabel(r) || 'Individual',
      Date: format(new Date(r.submissionDate), 'yyyy-MM-dd'),
      Status: r.status,
      'Rejection / Failure Reason': r.rejectionReason || 'N/A',
      Location: r.location,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Performance_Audit');
    XLSX.writeFile(wb, `Performance_${scopeLabel}_${selectedMonth}.xlsx`);

    logAuditAction(
      db,
      user,
      currentUserProfile?.fullName || 'Official',
      'PERFORMANCE_REVIEW',
      effectiveOfficerId || user.uid,
      `Exported XLSX Performance Intelligence (${targetList.length} records) for period: ${selectedMonth}.`
    );
    toast({
      title: 'Excel Intelligence Exported',
      description: `Exported ${targetList.length} audited record(s) with exact metrics.`,
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (!stats?.currItems || stats.currItems.length === 0 || !user) return;
    setIsExporting(true);

    const scopeTitle = isGlobalScope
      ? 'Global Bureau Matrix'
      : targetProfile?.fullName || 'Official';

    const targetList =
      selectedIds.size > 0
        ? auditedRegistrations.filter((r) => selectedIds.has(r.id))
        : auditedRegistrations;

    const docPdf = new jsPDF('l', 'mm', 'a4');
    docPdf.setFontSize(14);
    docPdf.text(`Performance & Quality Audit: ${scopeTitle}`, 14, 15);
    docPdf.setFontSize(9);
    docPdf.text(
      `Period: ${selectedMonth} | Exact Success Rate: ${stats.successRate}% (${stats.processed}/${stats.total}) | Exact Rejection Rate: ${stats.rejectionRate}% (${stats.rejected}/${stats.total}) | Failed Rate: ${stats.errorRate}%`,
      14,
      22
    );

    const rows = targetList.map((r) => [
      r.id,
      r.applicantName,
      getInstitutionLabel(r) || 'Individual',
      format(new Date(r.submissionDate), 'MMM dd, yyyy'),
      r.status,
      r.rejectionReason || '-',
    ]);

    autoTable(docPdf, {
      startY: 28,
      head: [['29-Digit RID', 'Applicant', 'Origin / Institution', 'Date', 'Status', 'Detail']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });

    docPdf.save(`Performance_${scopeTitle.replace(/\s+/g, '_')}_${selectedMonth}.pdf`);
    logAuditAction(
      db,
      user,
      currentUserProfile?.fullName || 'Official',
      'PERFORMANCE_REVIEW',
      effectiveOfficerId || user.uid,
      `Exported PDF Performance Archive (${targetList.length} records) for period: ${selectedMonth}.`
    );
    toast({
      title: 'PDF Ledger Generated',
      description: 'Official performance audit documentation saved.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  if (
    isUserLoading ||
    isLoading ||
    isCurrentUserProfileLoading ||
    isProfileLoading ||
    !selectedMonth ||
    !user
  ) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Top Header & Scope Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
              <TrendingUp className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">
                {isGlobalScope
                  ? 'Global Bureau Quality'
                  : isRemoteAudit
                  ? 'Unit Intelligence'
                  : 'Bureau Quality'}
              </h1>
              <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                {isGlobalScope
                  ? 'All-Personnel Consolidated Accuracy & SLA Matrix'
                  : isRemoteAudit
                  ? `Auditing: ${targetProfile?.fullName || 'Official'}`
                  : 'Personnel Accuracy & Rejection Diagnostics Matrix'}
              </p>
            </div>
          </div>
        </div>

        {/* Scope, Origin & Period Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <Select value={effectiveOfficerId || 'GLOBAL'} onValueChange={setSelectedOfficerScope}>
              <SelectTrigger className="h-11 min-w-[200px] clay-card rounded-2xl px-4 text-xs font-black uppercase tracking-wider border-none">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary shrink-0" />
                  <SelectValue placeholder="Select Personnel Scope" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="GLOBAL" className="text-xs font-black">
                  Global Bureau (All Personnel)
                </SelectItem>
                {(allOfficers || []).map((off) => (
                  <SelectItem key={off.id} value={off.id} className="text-xs font-semibold">
                    {off.fullName} ({off.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={originFilter} onValueChange={(v: any) => setOriginFilter(v)}>
            <SelectTrigger className="h-11 min-w-[165px] clay-card rounded-2xl px-4 text-xs font-black uppercase tracking-wider border-none">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <SelectValue placeholder="Origin" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
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

          <div className="flex items-center gap-2 clay-card px-3 py-1 rounded-2xl">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[165px] h-9 border-none bg-transparent font-bold text-xs">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {monthsList.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="font-bold text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!stats || stats.total === 0 ? (
        <div className="flex flex-col items-center justify-center py-36 clay-card rounded-[32px] text-muted-foreground/40 space-y-3">
          <Layers className="h-16 w-16 opacity-20" />
          <p className="text-sm font-black uppercase tracking-[0.3em]">Matrix Data Depleted</p>
          <p className="text-xs italic">
            No registrations detected for the selected scope and operational period.
          </p>
          {(originFilter !== 'ALL' || selectedMonth !== 'ALL') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setOriginFilter('ALL');
                setSelectedMonth('ALL');
              }}
              className="mt-2 rounded-xl text-xs font-bold"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Scope Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* SLA Target & Elite Benchmark Banner */}
          <Card className="clay-card rounded-[24px] p-5 border border-border/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={cn(
                  'h-12 w-12 rounded-2xl flex items-center justify-center shrink-0',
                  stats.successRate >= 85
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : stats.successRate >= 80
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                )}
              >
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-foreground">
                    SLA Benchmark Target: 85.00% Elite Standard
                  </span>
                  <span
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest',
                      stats.successRate >= 85
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : stats.successRate >= 80
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                    )}
                  >
                    {stats.successRate >= 85
                      ? 'Elite SLA Achieved'
                      : stats.successRate >= 80
                      ? 'Within Minimum SLA (80%+)'
                      : 'Below 80.00% SLA Threshold'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stats.neededForElite === 0
                    ? `Current Exact Success Rate (${stats.successRate}%) exceeds the 85.00% Elite Bureau Benchmark.`
                    : `Requires ${stats.neededForElite} additional Processed record(s) with zero rejections to reach the 85.00% Elite threshold.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/full-performance')}
                className="h-9 rounded-xl text-xs font-bold"
              >
                Open Intel Hub
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/full-registration')}
                className="h-9 rounded-xl text-xs font-bold"
              >
                Open Full Record
              </Button>
            </div>
          </Card>

          {/* Row 1: 4 Interactive Click-to-Filter Exact Rate Gauges */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <MetricGauge
              label="Success Rate"
              value={stats.successRate}
              count={stats.processed}
              totalCount={stats.total}
              color={getThresholdColor(stats.successRate)}
              icon={CheckCircle2}
              trend={stats.trends.processed}
              description="Processed Documents"
              inverseTrend={false}
              isActive={auditStatusFilter === 'Processed'}
              onClick={() =>
                setAuditStatusFilter((prev) => (prev === 'Processed' ? 'ALL' : 'Processed'))
              }
            />
            <MetricGauge
              label="Processing Rate"
              value={stats.processingRate}
              count={stats.processing}
              totalCount={stats.total}
              color={COLORS.processing}
              icon={Activity}
              trend={stats.trends.processing}
              description="Active Processing Queue"
              inverseTrend={true}
              isActive={auditStatusFilter === 'Processing'}
              onClick={() =>
                setAuditStatusFilter((prev) => (prev === 'Processing' ? 'ALL' : 'Processing'))
              }
            />
            <MetricGauge
              label="Rejection Rate"
              value={stats.rejectionRate}
              count={stats.rejected}
              totalCount={stats.total}
              color={COLORS.rejected}
              icon={ShieldAlert}
              trend={stats.trends.rejected}
              description="Rejected Records"
              inverseTrend={true}
              isActive={auditStatusFilter === 'Rejected'}
              onClick={() =>
                setAuditStatusFilter((prev) => (prev === 'Rejected' ? 'ALL' : 'Rejected'))
              }
            />
            <MetricGauge
              label="Failed Rate"
              value={stats.errorRate}
              count={stats.failed}
              totalCount={stats.total}
              color={COLORS.failed}
              icon={AlertCircle}
              trend={stats.trends.failed}
              description="Failed Records"
              inverseTrend={true}
              isActive={auditStatusFilter === 'Failed'}
              onClick={() =>
                setAuditStatusFilter((prev) => (prev === 'Failed' ? 'ALL' : 'Failed'))
              }
            />
          </section>

          {/* Row 2: 3 Claymorphic Summary Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="clay-card rounded-[28px] p-6 flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                    Daily Pick (Peak)
                  </p>
                  <div className="clay-badge h-10 w-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Award className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {stats.peakDay}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Highest daily throughput recorded in this period.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums tracking-tight">
                  {stats.peakAmount}
                </span>
                <span className="text-xs font-semibold text-slate-400">Units Handled</span>
              </div>
            </Card>

            <Card className="clay-card rounded-[28px] p-6 flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                    Primary Rejection Cause
                  </p>
                  <div className="clay-badge h-10 w-10 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight line-clamp-2">
                  {stats.topReason}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Most frequent protocol discrepancy logged.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums tracking-tight">
                  {stats.rejected + stats.failed}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {stats.rejected} Rejected • {stats.failed} Failed
                </span>
              </div>
            </Card>

            <Card className="clay-card rounded-[28px] p-6 flex flex-col justify-between hover:-translate-y-1 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                    Registry Velocity
                  </p>
                  <div className="clay-badge h-10 w-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                    <Target className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums">
                  {stats.total.toLocaleString()}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Consolidated registration intake volume.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                <div className="clay-badge flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded-full">
                  <TrendingUp className="h-3 w-3" />
                  <span className="text-[11px] font-bold">
                    {stats.processed} Verified ({stats.successRate}%)
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">Final Ledger</span>
              </div>
            </Card>
          </section>

          {/* Row 3: Institution vs Individual Performance Split + Rejection Reason Pareto Matrix */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Institution vs Individual Exact Performance Matrix */}
            <Card className="clay-card rounded-[28px] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Institution vs Individual Accuracy Split
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Exact 2-decimal success and rejection rates by registration origin
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-primary/[0.04] border border-primary/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-primary">
                      Institutions
                    </span>
                    <span className="text-xs font-bold text-muted-foreground tabular-nums">
                      {stats.originComparison.institutionSharePct}% of total
                    </span>
                  </div>
                  <p className="text-2xl font-black text-foreground tabular-nums">
                    {stats.originComparison.institutionTotal.toLocaleString()} records
                  </p>
                  <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-semibold">Exact Success Rate</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {stats.originComparison.institutionSuccessRate}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-semibold">
                        Exact Rejection Rate
                      </span>
                      <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums">
                        {stats.originComparison.institutionRejectionRate}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Individuals
                    </span>
                    <span className="text-xs font-bold text-muted-foreground tabular-nums">
                      {stats.originComparison.individualSharePct}% of total
                    </span>
                  </div>
                  <p className="text-2xl font-black text-foreground tabular-nums">
                    {stats.originComparison.individualTotal.toLocaleString()} records
                  </p>
                  <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-semibold">Exact Success Rate</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {stats.originComparison.individualSuccessRate}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-semibold">
                        Exact Rejection Rate
                      </span>
                      <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums">
                        {stats.originComparison.individualRejectionRate}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Interactive Rejection & Failure Reason Pareto Leaderboard */}
            <Card className="clay-card rounded-[28px] p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                    Rejection & Failure Reason Breakdown
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Click any reason below to isolate matching records in the audit table
                  </p>
                </div>
                {selectedReasonFilter !== 'ALL' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedReasonFilter('ALL')}
                    className="h-8 rounded-xl text-[10px] font-black uppercase"
                  >
                    Clear Reason
                  </Button>
                )}
              </div>

              {stats.reasonBreakdown.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground font-semibold">
                  Zero rejections or failures recorded in this period.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[195px] overflow-y-auto pr-1">
                  {stats.reasonBreakdown.map((item) => {
                    const isSelected = selectedReasonFilter === item.reason;
                    return (
                      <button
                        key={item.reason}
                        type="button"
                        onClick={() => {
                          setSelectedReasonFilter((prev) =>
                            prev === item.reason ? 'ALL' : item.reason
                          );
                          if (
                            auditStatusFilter !== 'Rejected' &&
                            auditStatusFilter !== 'Failed' &&
                            auditStatusFilter !== 'ALL'
                          ) {
                            setAuditStatusFilter('ALL');
                          }
                        }}
                        className={cn(
                          'w-full text-left p-3 rounded-2xl border transition-all cursor-pointer space-y-1.5',
                          isSelected
                            ? 'bg-rose-500/10 border-rose-500/40'
                            : 'bg-muted/20 border-border/60 hover:bg-muted/40'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-foreground truncate">{item.reason}</span>
                          <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                            {item.count} ({item.exactPct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-rose-500"
                            style={{ width: `${Math.min(100, item.exactPct)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </section>

          {/* Step 5: Side-by-Side Sector / Period Comparison Matrix */}
          <Card className="clay-card rounded-[28px] p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Side-by-Side Benchmark Comparison Matrix
                </h3>
                <p className="text-xs text-muted-foreground">
                  Compare exact 2-decimal Success, Processing, Rejection, and Failed rates across regional sectors or operational months
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCompareMode('SECTOR')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer',
                    compareMode === 'SECTOR'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                  )}
                >
                  Sector vs Sector
                </button>
                <button
                  type="button"
                  onClick={() => setCompareMode('PERIOD')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer',
                    compareMode === 'PERIOD'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                  )}
                >
                  Month vs Month
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                {
                  side: 'Left Benchmark',
                  selected: compareLeftKey,
                  onSelect: setCompareLeftKey,
                  metrics: sideBySideComparison.left,
                },
                {
                  side: 'Right Benchmark',
                  selected: compareRightKey,
                  onSelect: setCompareRightKey,
                  metrics: sideBySideComparison.right,
                },
              ].map((panel) => (
                <div
                  key={panel.side}
                  className="p-4 rounded-2xl bg-muted/20 border border-border/60 space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {panel.side}
                    </span>
                    <Select value={panel.selected} onValueChange={panel.onSelect}>
                      <SelectTrigger className="h-9 w-[190px] rounded-xl text-xs font-bold bg-background">
                        <SelectValue placeholder="Select target" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {comparisonOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs font-bold">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Total Records</span>
                    <span className="text-2xl font-black text-foreground tabular-nums">
                      {panel.metrics.total.toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block">
                        Success Rate
                      </span>
                      <span className="text-base font-black tabular-nums">
                        {panel.metrics.successRate.toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground block tabular-nums">
                        {panel.metrics.processed} Processed
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 block">
                        Processing Rate
                      </span>
                      <span className="text-base font-black tabular-nums">
                        {panel.metrics.processingRate.toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground block tabular-nums">
                        {panel.metrics.processing} In Queue
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                      <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 block">
                        Rejection Rate
                      </span>
                      <span className="text-base font-black tabular-nums">
                        {panel.metrics.rejectionRate.toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground block tabular-nums">
                        {panel.metrics.rejected} Rejected
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-500/10 border border-slate-500/20">
                      <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-400 block">
                        Failed Rate
                      </span>
                      <span className="text-base font-black tabular-nums">
                        {panel.metrics.failedRate.toFixed(2)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground block tabular-nums">
                        {panel.metrics.failed} Failed
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Row 4: Daily Quality Velocity Area Chart */}
          <Card className="clay-card rounded-[28px] overflow-hidden relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 right-20 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl"
            />
            <CardHeader className="border-b border-slate-200/70 dark:border-slate-700/60 py-5 px-6 md:px-8 flex flex-row items-center justify-between relative z-10">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                  Quality Velocity
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Daily throughput analysis (Processed vs Rejected) for{' '}
                  {selectedMonth === 'ALL'
                    ? format(new Date(), 'MMMM yyyy')
                    : format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
                </p>
              </div>
              <div className="clay-badge h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-7 relative z-10">
              <div className="clay-well p-4 h-[310px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.trendData}
                    margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.processed} stopOpacity={0.4} />
                        <stop offset="55%" stopColor={COLORS.processed} stopOpacity={0.14} />
                        <stop offset="100%" stopColor={COLORS.processed} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorRejected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.rejected} stopOpacity={0.38} />
                        <stop offset="55%" stopColor={COLORS.rejected} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={COLORS.rejected} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
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
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="glass-chart-tooltip p-3.5 space-y-1.5">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                {payload[0].payload.date}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                                <p className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                  PROCESSED: {payload[0].value}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_#ef4444]" />
                                <p className="text-xs font-mono font-black text-rose-600 dark:text-rose-400 tabular-nums">
                                  REJECTED: {payload[1].value}
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
                      dataKey="success"
                      stroke={COLORS.processed}
                      strokeWidth={2.75}
                      fillOpacity={1}
                      fill="url(#colorSuccess)"
                      activeDot={{
                        r: 5,
                        strokeWidth: 2,
                        stroke: '#ffffff',
                        fill: COLORS.processed,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="rejected"
                      stroke={COLORS.rejected}
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorRejected)"
                      activeDot={{
                        r: 5,
                        strokeWidth: 2,
                        stroke: '#ffffff',
                        fill: COLORS.rejected,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Row 5: Interactive Multi-Status Performance & Rejection Audit Table */}
          <div className="space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 clay-card p-6 rounded-[28px]">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  Performance & Rejection Audit Ledger
                </h2>
                <p className="text-xs font-medium text-muted-foreground">
                  Inspect, re-verify, or export records by status ({auditedRegistrations.length}{' '}
                  matching records).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter Pills */}
                {(
                  [
                    { key: 'ALL', label: `All (${stats.total})` },
                    { key: 'Rejected', label: `Rejected (${stats.rejected})` },
                    { key: 'Failed', label: `Failed (${stats.failed})` },
                    { key: 'Processing', label: `Processing (${stats.processing})` },
                    { key: 'Processed', label: `Processed (${stats.processed})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setAuditStatusFilter(tab.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer',
                      auditStatusFilter === tab.key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full sm:w-64 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors z-10" />
                  <Input
                    placeholder="Search name, RID, reason..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="clay-well h-10 pl-9 rounded-xl text-xs font-bold border-none"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={handleExportExcel}
                    disabled={isExporting}
                    variant="outline"
                    className="clay-badge flex-1 h-10 px-3.5 rounded-xl bg-emerald-500/10 !border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 font-bold text-[10px] uppercase tracking-widest"
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> XLS
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    variant="outline"
                    className="clay-badge h-10 px-3.5 rounded-xl bg-rose-500/10 !border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 font-bold text-[10px] uppercase tracking-widest"
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <Card className="clay-card rounded-[28px] overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-12 pl-6 py-4">
                        <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} />
                      </TableHead>
                      <TableHead className="py-4">Applicant & Origin</TableHead>
                      <TableHead className="py-4">29-Digit RID</TableHead>
                      <TableHead className="py-4">Reason / Notes</TableHead>
                      <TableHead className="py-4 text-center">Status</TableHead>
                      <TableHead className="py-4 pr-6 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRecords.length > 0 ? (
                      paginatedRecords.map((reg) => {
                        const instLabel = getInstitutionLabel(reg);
                        return (
                          <TableRow
                            key={reg.id}
                            className={cn(
                              'hover:bg-muted/30 border-border group h-16 transition-colors',
                              selectedIds.has(reg.id) && 'bg-blue-50/40 dark:bg-blue-950/20'
                            )}
                          >
                            <TableCell className="pl-6">
                              <Checkbox
                                checked={selectedIds.has(reg.id)}
                                onCheckedChange={() => toggleSelectRow(reg.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                                  {reg.applicantName}
                                </span>
                                <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                  {instLabel ? (
                                    <>
                                      <Building2 className="h-3 w-3 text-primary" />
                                      {instLabel}
                                    </>
                                  ) : (
                                    'Individual Walk-In'
                                  )}
                                  {' • '}
                                  {format(new Date(reg.submissionDate), 'MMM dd, yyyy')}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => handleCopyRid(reg.id)}
                                title="Click to copy full 29-digit RID"
                                className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer group/rid"
                              >
                                <FileDigit className="h-3.5 w-3.5 text-slate-400 group-hover/rid:text-blue-600 dark:group-hover/rid:text-blue-400 shrink-0 transition-colors" />
                                <span>{reg.id.substring(0, 15)}...</span>
                                {copiedId === reg.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <Copy className="h-3 w-3 text-slate-400 group-hover/rid:text-blue-600 dark:group-hover/rid:text-blue-400 shrink-0 transition-colors" />
                                )}
                              </button>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-medium text-muted-foreground line-clamp-1 max-w-[200px]">
                                {reg.rejectionReason || reg.content || 'Verified Protocol Entry'}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <StatusBadge status={reg.status} className="scale-90" />
                            </TableCell>
                            <TableCell className="pr-6 text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                {(reg.status === 'Rejected' || reg.status === 'Failed') && (
                                  <button
                                    type="button"
                                    title="Re-Verify & Mark as Processed"
                                    onClick={() => handleQuickResolveRecord(reg, 'Processed')}
                                    className="h-8 px-2.5 rounded-lg inline-flex items-center justify-center gap-1 text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="View Audit Deep-Dive"
                                  onClick={() => setSelectedRejection(reg)}
                                  className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <RegistrationFormModal
                                  registration={reg}
                                  mode="edit"
                                  trigger={
                                    <button
                                      type="button"
                                      title="Edit Record"
                                      className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                                  className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
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
                        <TableCell colSpan={6} className="h-40 text-center opacity-40">
                          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-primary" />
                          <p className="text-xs font-black uppercase tracking-widest">
                            No Matching Records for Selected Filter
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
                showingCount={paginatedRecords.length}
                totalCount={auditedRegistrations.length}
                itemLabel="records"
              />
            </Card>
          </div>
        </div>
      )}

      {/* Audit Deep-Dive Modal */}
      <Dialog open={!!selectedRejection} onOpenChange={(o) => !o && setSelectedRejection(null)}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden rounded-[32px] border-none shadow-2xl bg-popover">
          {selectedRejection && (
            <>
              <DialogHeader className="p-6 md:p-8 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="p-2 md:p-3 bg-rose-500/10 rounded-2xl">
                      <ShieldAlert className="h-5 w-5 md:h-6 md:w-6 text-rose-500" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg md:text-xl font-black text-foreground uppercase tracking-tighter">
                        Audit Deep-Dive
                      </DialogTitle>
                      <DialogDescription className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Bureau Internal Security Record
                      </DialogDescription>
                    </div>
                  </div>
                  <StatusBadge status={selectedRejection.status} className="scale-90" />
                </div>
              </DialogHeader>
              <div className="p-6 md:p-8 space-y-6 bg-card">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <User className="h-3 w-3" /> Applicant Identity
                    </p>
                    <p className="text-sm font-black text-foreground">
                      {selectedRejection.applicantName}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Submission Date
                    </p>
                    <p className="text-sm font-black text-foreground">
                      {format(new Date(selectedRejection.submissionDate), 'MMMM dd, yyyy')}
                    </p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <FileDigit className="h-3 w-3" /> 29-Digit Registration ID (RID)
                    </p>
                    <p className="text-xs font-mono font-bold text-foreground break-all">
                      {selectedRejection.id}
                    </p>
                  </div>
                </div>
                {selectedRejection.rejectionReason && (
                  <div className="p-5 bg-rose-500/5 border border-rose-500/10 rounded-2xl space-y-2">
                    <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">
                      Protocol Rejection / Failure Reason
                    </p>
                    <p className="text-base font-bold text-rose-700 dark:text-rose-400 leading-tight">
                      {selectedRejection.rejectionReason}
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                    Submission Payload
                  </p>
                  <div className="p-5 bg-muted/50 rounded-[24px] border border-border italic text-sm font-medium">
                    &ldquo;{selectedRejection.content || 'No narrative content detected.'}&rdquo;
                  </div>
                </div>
              </div>
              <DialogFooter className="p-4 border-t border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const rid = selectedRejection.id;
                      setSelectedRejection(null);
                      router.push(`/status-check?rid=${encodeURIComponent(rid)}`);
                    }}
                    className="rounded-xl text-xs font-bold"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Verify in Status Check
                  </Button>
                  {(selectedRejection.status === 'Rejected' ||
                    selectedRejection.status === 'Failed') && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleQuickResolveRecord(selectedRejection, 'Processed')}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Re-Verify & Approve
                    </Button>
                  )}
                </div>
                <Button
                  onClick={() => setSelectedRejection(null)}
                  className="font-black text-[10px] uppercase tracking-widest h-10 px-6 rounded-xl"
                >
                  Close Report
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        </div>
      }
    >
      <PerformanceContent />
    </Suspense>
  );
}
