'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Trophy,
  Medal,
  RotateCw,
  TrendingUp,
  Loader2,
  Phone,
  Smartphone,
  MapPin,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  User,
  Activity,
  BadgeCheck,
  ArrowUpDown,
  Search,
  Calendar,
  CheckCircle2,
  XCircle,
  Target,
  ExternalLink,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format, isSameMonth, isSameWeek } from 'date-fns';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, limit, doc } from 'firebase/firestore';
import { DailyReport, Registration, UserProfile } from '@/lib/types';
import { logAuditAction } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type RankingMode = 'TELECOM_INTAKE' | 'RID_QUALITY';
type PeriodScope = 'ALL_TIME' | 'THIS_MONTH' | 'THIS_WEEK' | 'EXACT_DATE';
type SortField = 'rank' | 'name' | 'total' | 'ethio' | 'safaricom' | 'successRate' | 'rejectionRate';

export default function LeaderboardPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [rankingMode, setRankingMode] = useState<RankingMode>('TELECOM_INTAKE');
  const [periodScope, setPeriodScope] = useState<PeriodScope>('ALL_TIME');
  const [selectedDate, setSelectedDate] = useState('');
  const [clusterFilter, setClusterFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  }, []);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'daily_reports'), limit(10000));
  }, [db, user]);

  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'registrations'), limit(10000));
  }, [db, user]);

  const usersQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'users'), limit(10000));
  }, [db, user]);

  const { data: reports, isLoading: isReportsLoading } = useCollection<DailyReport>(reportsQuery);
  const { data: registrations, isLoading: isRegsLoading } = useCollection<Registration>(registrationsQuery);
  const { data: allUsers, isLoading: isUsersLoading } = useCollection<UserProfile>(usersQuery);

  const uniqueClusters = useMemo(() => {
    if (!allUsers) return [];
    const set = new Set<string>();
    allUsers.forEach((u) => {
      if (u.cluster && u.cluster.trim()) set.add(u.cluster.trim());
    });
    return Array.from(set).sort();
  }, [allUsers]);

  const matchesPeriod = (dateStr: string) => {
    if (!dateStr) return periodScope === 'ALL_TIME';
    if (periodScope === 'ALL_TIME') return true;
    if (periodScope === 'EXACT_DATE') {
      return dateStr.startsWith(selectedDate);
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    if (periodScope === 'THIS_MONTH') return isSameMonth(d, now);
    if (periodScope === 'THIS_WEEK') return isSameWeek(d, now, { weekStartsOn: 1 });
    return true;
  };

  const leaderboardData = useMemo(() => {
    if (!allUsers || !selectedDate) return [];

    // Map of officerId -> Combined Telecom + RID Quality metrics
    const statsMap = new Map<
      string,
      {
        telecomTotal: number;
        ethio: number;
        safaricom: number;
        ridTotal: number;
        ridProcessed: number;
        ridProcessing: number;
        ridRejected: number;
        ridFailed: number;
      }
    >();

    if (reports) {
      reports.forEach((rep) => {
        if (!matchesPeriod(rep.date)) return;
        const curr = statsMap.get(rep.officerId) || {
          telecomTotal: 0,
          ethio: 0,
          safaricom: 0,
          ridTotal: 0,
          ridProcessed: 0,
          ridProcessing: 0,
          ridRejected: 0,
          ridFailed: 0,
        };
        curr.telecomTotal += Number(rep.total) || 0;
        curr.ethio += Number(rep.ethioCount) || 0;
        curr.safaricom += Number(rep.safaricomCount) || 0;
        statsMap.set(rep.officerId, curr);
      });
    }

    if (registrations) {
      registrations.forEach((reg) => {
        if (!reg.assignedReviewerId) return;
        if (!matchesPeriod(reg.submissionDate)) return;
        const curr = statsMap.get(reg.assignedReviewerId) || {
          telecomTotal: 0,
          ethio: 0,
          safaricom: 0,
          ridTotal: 0,
          ridProcessed: 0,
          ridProcessing: 0,
          ridRejected: 0,
          ridFailed: 0,
        };
        curr.ridTotal += 1;
        if (reg.status === 'Processed') curr.ridProcessed += 1;
        else if (reg.status === 'Processing') curr.ridProcessing += 1;
        else if (reg.status === 'Rejected') curr.ridRejected += 1;
        else if (reg.status === 'Failed') curr.ridFailed += 1;
        statsMap.set(reg.assignedReviewerId, curr);
      });
    }

    const totalBureauTelecom = Array.from(statsMap.values()).reduce(
      (acc, s) => acc + s.telecomTotal,
      0
    );
    const totalBureauRid = Array.from(statsMap.values()).reduce((acc, s) => acc + s.ridTotal, 0);

    const rows = Array.from(statsMap.entries())
      .map(([officerId, st]) => {
        const userDoc = allUsers.find((u) => u.id === officerId);
        const ethioShare =
          st.telecomTotal > 0 ? Number(((st.ethio / st.telecomTotal) * 100).toFixed(2)) : 0;
        const safaricomShare =
          st.telecomTotal > 0 ? Number(((st.safaricom / st.telecomTotal) * 100).toFixed(2)) : 0;
        const bureauTelecomShare =
          totalBureauTelecom > 0
            ? Number(((st.telecomTotal / totalBureauTelecom) * 100).toFixed(2))
            : 0;

        const successRate =
          st.ridTotal > 0 ? Number(((st.ridProcessed / st.ridTotal) * 100).toFixed(2)) : 0;
        const rejectionRate =
          st.ridTotal > 0
            ? Number((((st.ridRejected + st.ridFailed) / st.ridTotal) * 100).toFixed(2))
            : 0;
        const processingRate =
          st.ridTotal > 0 ? Number(((st.ridProcessing / st.ridTotal) * 100).toFixed(2)) : 0;
        const bureauRidShare =
          totalBureauRid > 0 ? Number(((st.ridTotal / totalBureauRid) * 100).toFixed(2)) : 0;

        return {
          officerId,
          name: userDoc?.fullName || 'Unknown Official',
          cluster: userDoc?.cluster || 'N/A',
          region: userDoc?.region || 'N/A',
          registrations: st.telecomTotal,
          ethio: st.ethio,
          safaricom: st.safaricom,
          ethioShare,
          safaricomShare,
          bureauTelecomShare,
          ridTotal: st.ridTotal,
          ridProcessed: st.ridProcessed,
          ridProcessing: st.ridProcessing,
          ridRejected: st.ridRejected + st.ridFailed,
          successRate,
          rejectionRate,
          processingRate,
          bureauRidShare,
        };
      })
      .filter((item) =>
        rankingMode === 'TELECOM_INTAKE' ? item.registrations > 0 : item.ridTotal > 0
      );

    // Base rank calculation before search/sort
    rows.sort((a, b) => {
      if (rankingMode === 'TELECOM_INTAKE') {
        return b.registrations - a.registrations;
      }
      if (b.ridProcessed !== a.ridProcessed) return b.ridProcessed - a.ridProcessed;
      return b.successRate - a.successRate;
    });

    return rows.map((item, index) => ({ ...item, rank: index + 1 }));
  }, [reports, registrations, allUsers, selectedDate, periodScope, rankingMode]);

  const filteredLeaderboard = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = leaderboardData.filter((item) => {
      if (clusterFilter !== 'ALL' && item.cluster !== clusterFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.cluster.toLowerCase().includes(q) ||
        item.region.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'rank') cmp = a.rank - b.rank;
      else if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'total')
        cmp =
          (rankingMode === 'TELECOM_INTAKE' ? a.registrations : a.ridTotal) -
          (rankingMode === 'TELECOM_INTAKE' ? b.registrations : b.ridTotal);
      else if (sortField === 'ethio') cmp = a.ethio - b.ethio;
      else if (sortField === 'safaricom') cmp = a.safaricom - b.safaricom;
      else if (sortField === 'successRate') cmp = a.successRate - b.successRate;
      else if (sortField === 'rejectionRate') cmp = a.rejectionRate - b.rejectionRate;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [leaderboardData, clusterFilter, searchQuery, sortField, sortDir, rankingMode]);

  const summary = useMemo(() => {
    if (rankingMode === 'TELECOM_INTAKE') {
      const totalRegs = filteredLeaderboard.reduce((acc, curr) => acc + curr.registrations, 0);
      const totalEthio = filteredLeaderboard.reduce((acc, curr) => acc + curr.ethio, 0);
      const totalSafaricom = filteredLeaderboard.reduce((acc, curr) => acc + curr.safaricom, 0);
      const avg =
        filteredLeaderboard.length > 0
          ? Number((totalRegs / filteredLeaderboard.length).toFixed(2))
          : 0;
      const ethioShare = totalRegs > 0 ? Number(((totalEthio / totalRegs) * 100).toFixed(2)) : 0;
      const safaricomShare =
        totalRegs > 0 ? Number(((totalSafaricom / totalRegs) * 100).toFixed(2)) : 0;
      return {
        totalRegs,
        avg: avg.toFixed(2),
        ethioShare: ethioShare.toFixed(2),
        safaricomShare: safaricomShare.toFixed(2),
        overallSuccessRate: '0.00',
        overallRejectionRate: '0.00',
      };
    } else {
      const totalRids = filteredLeaderboard.reduce((acc, curr) => acc + curr.ridTotal, 0);
      const totalProcessed = filteredLeaderboard.reduce((acc, curr) => acc + curr.ridProcessed, 0);
      const totalRejected = filteredLeaderboard.reduce((acc, curr) => acc + curr.ridRejected, 0);
      const avg =
        filteredLeaderboard.length > 0
          ? Number((totalRids / filteredLeaderboard.length).toFixed(2))
          : 0;
      const overallSuccessRate =
        totalRids > 0 ? Number(((totalProcessed / totalRids) * 100).toFixed(2)) : 0;
      const overallRejectionRate =
        totalRids > 0 ? Number(((totalRejected / totalRids) * 100).toFixed(2)) : 0;
      return {
        totalRegs: totalRids,
        avg: avg.toFixed(2),
        ethioShare: '0.00',
        safaricomShare: '0.00',
        overallSuccessRate: overallSuccessRate.toFixed(2),
        overallRejectionRate: overallRejectionRate.toFixed(2),
      };
    }
  }, [filteredLeaderboard, rankingMode]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'rank' || field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleExportExcel = () => {
    if (filteredLeaderboard.length === 0 || !profile) return;
    setIsExporting(true);

    const exportData = filteredLeaderboard.map((l) =>
      rankingMode === 'TELECOM_INTAKE'
        ? {
            Rank: l.rank,
            Officer: l.name,
            Cluster: l.cluster,
            Region: l.region,
            Ethio: l.ethio,
            'Ethio Share (%)': `${l.ethioShare.toFixed(2)}%`,
            Safaricom: l.safaricom,
            'Safaricom Share (%)': `${l.safaricomShare.toFixed(2)}%`,
            Total: l.registrations,
            'Bureau Share (%)': `${l.bureauTelecomShare.toFixed(2)}%`,
          }
        : {
            Rank: l.rank,
            Officer: l.name,
            Cluster: l.cluster,
            Region: l.region,
            'Total RIDs': l.ridTotal,
            Processed: l.ridProcessed,
            Processing: l.ridProcessing,
            'Rejected/Failed': l.ridRejected,
            'Success Rate (%)': `${l.successRate.toFixed(2)}%`,
            'Rejection Rate (%)': `${l.rejectionRate.toFixed(2)}%`,
          }
    );

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leaderboard');
    XLSX.writeFile(wb, `Bureau_Leaderboard_${rankingMode}_${selectedDate}.xlsx`);

    logAuditAction(
      db,
      user!,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'leaderboard',
      `Exported Excel performance leaderboard (${rankingMode}) for scope ${periodScope}.`
    );

    toast({
      title: 'Excel Intelligence Exported',
      description: 'Official performance rankings downloaded with exact 2-decimal rates.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (filteredLeaderboard.length === 0 || !profile) return;
    setIsExporting(true);

    const docPdf = new jsPDF('l', 'mm', 'a4');
    docPdf.text(
      `Official Bureau Performance Leaderboard (${
        rankingMode === 'TELECOM_INTAKE' ? 'Telecom Intake' : '29-Digit RID Quality'
      })`,
      14,
      15
    );
    docPdf.setFontSize(10);
    docPdf.text(
      `Scope: ${periodScope} | Active Units: ${filteredLeaderboard.length} | Aggregate Volume: ${summary.totalRegs} | Avg Output: ${summary.avg}`,
      14,
      22
    );

    const head =
      rankingMode === 'TELECOM_INTAKE'
        ? [
            [
              'Rank',
              'Official',
              'Cluster',
              'Region',
              'Ethio (%)',
              'Safaricom (%)',
              'Total',
              'Bureau Share',
            ],
          ]
        : [
            [
              'Rank',
              'Official',
              'Cluster',
              'Region',
              'Total RIDs',
              'Processed',
              'Rejected/Failed',
              'Success Rate',
              'Rejection Rate',
            ],
          ];

    const rows = filteredLeaderboard.map((l) =>
      rankingMode === 'TELECOM_INTAKE'
        ? [
            `#${l.rank}`,
            l.name,
            l.cluster,
            l.region,
            `${l.ethio} (${l.ethioShare.toFixed(2)}%)`,
            `${l.safaricom} (${l.safaricomShare.toFixed(2)}%)`,
            l.registrations,
            `${l.bureauTelecomShare.toFixed(2)}%`,
          ]
        : [
            `#${l.rank}`,
            l.name,
            l.cluster,
            l.region,
            l.ridTotal,
            l.ridProcessed,
            l.ridRejected,
            `${l.successRate.toFixed(2)}%`,
            `${l.rejectionRate.toFixed(2)}%`,
          ]
    );

    autoTable(docPdf, {
      startY: 30,
      head,
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });

    docPdf.save(`Bureau_Leaderboard_${rankingMode}_${selectedDate}.pdf`);

    logAuditAction(
      db,
      user!,
      profile.fullName,
      'PERFORMANCE_REVIEW',
      'leaderboard',
      `Exported PDF performance ledger (${rankingMode}) for scope ${periodScope}.`
    );

    toast({
      title: 'PDF Ledger Generated',
      description: 'High-fidelity performance document saved.',
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  if (isReportsLoading || isRegsLoading || isUsersLoading || !selectedDate) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
              <Trophy className="h-6 w-6 sm:h-7 sm:w-7 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">
                Official Tiers
              </h1>
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                Personnel Ranking Matrix •{' '}
                {periodScope === 'ALL_TIME'
                  ? 'All-Time Cumulative'
                  : periodScope === 'THIS_MONTH'
                  ? format(new Date(), 'MMMM yyyy')
                  : periodScope === 'THIS_WEEK'
                  ? 'Current Week'
                  : format(new Date(selectedDate), 'MMMM dd, yyyy')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 glass-card-surface p-2.5 rounded-2xl w-full xl:w-auto">
          {/* Dual Ranking Mode Switcher */}
          <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setRankingMode('TELECOM_INTAKE')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer',
                rankingMode === 'TELECOM_INTAKE'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Telecom Intake
            </button>
            <button
              type="button"
              onClick={() => setRankingMode('RID_QUALITY')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer',
                rankingMode === 'RID_QUALITY'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              RID Accuracy
            </button>
          </div>

          {/* Period Scope Selector */}
          <Select value={periodScope} onValueChange={(v) => setPeriodScope(v as PeriodScope)}>
            <SelectTrigger className="h-10 w-[145px] rounded-xl text-[10px] font-black uppercase tracking-widest glass-subpanel">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL_TIME" className="text-xs font-bold">
                All Time
              </SelectItem>
              <SelectItem value="THIS_MONTH" className="text-xs font-bold">
                This Month
              </SelectItem>
              <SelectItem value="THIS_WEEK" className="text-xs font-bold">
                This Week
              </SelectItem>
              <SelectItem value="EXACT_DATE" className="text-xs font-bold">
                Specific Date
              </SelectItem>
            </SelectContent>
          </Select>

          {periodScope === 'EXACT_DATE' && (
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="glass-auth-input h-10 rounded-xl font-mono font-black text-[10px] uppercase tracking-widest w-[150px]"
            />
          )}

          {/* Cluster Filter */}
          <Select value={clusterFilter} onValueChange={setClusterFilter}>
            <SelectTrigger className="h-10 w-[145px] rounded-xl text-[10px] font-black uppercase tracking-widest glass-subpanel">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
              <SelectValue placeholder="All Clusters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs font-bold">
                All Clusters
              </SelectItem>
              {uniqueClusters.map((c) => (
                <SelectItem key={c} value={c} className="text-xs font-bold">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              onClick={handleExportExcel}
              disabled={isExporting || filteredLeaderboard.length === 0}
              variant="outline"
              className="glass-subpanel h-10 px-3.5 rounded-xl !border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-bold text-[10px] uppercase tracking-widest"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> XLS
            </Button>
            <Button
              onClick={handleExportPDF}
              disabled={isExporting || filteredLeaderboard.length === 0}
              variant="outline"
              className="glass-subpanel h-10 px-3.5 rounded-xl !border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 font-bold text-[10px] uppercase tracking-widest"
            >
              <FileText className="h-4 w-4 mr-1.5" /> PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Top 3 Podium Cards */}
      {filteredLeaderboard.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLeaderboard.slice(0, 3).map((perf) => (
            <Card
              key={perf.officerId}
              className={cn(
                'overflow-hidden rounded-[32px] transition-all hover:-translate-y-1 relative group',
                perf.rank === 1
                  ? '!bg-amber-500/[0.08] dark:!bg-amber-950/25 !border-amber-500/35 ring-1 ring-amber-500/25'
                  : ''
              )}
            >
              <CardContent className="p-6 sm:p-8">
                <div className="absolute -top-10 -right-10 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity rotate-12">
                  <Trophy className="h-48 w-48" />
                </div>

                <div className="flex items-start justify-between mb-6 relative z-10">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-10 w-10 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center border-2 group-hover:scale-110 transition-transform shadow-lg',
                        perf.rank === 1
                          ? 'bg-amber-500 border-amber-400 text-white shadow-amber-500/30'
                          : perf.rank === 2
                          ? 'bg-slate-300 border-slate-200 text-slate-700'
                          : 'bg-orange-300 border-orange-200 text-orange-700'
                      )}
                    >
                      {perf.rank === 1 ? (
                        <Trophy className="h-5 w-5 sm:h-6 sm:w-6" />
                      ) : (
                        <Medal className="h-5 w-5 sm:h-6 sm:w-6" />
                      )}
                    </div>
                    <span className="text-3xl sm:text-4xl font-mono font-black text-foreground tracking-tighter tabular-nums">
                      #{perf.rank}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl sm:text-4xl font-mono font-black text-foreground tracking-tighter tabular-nums">
                      {rankingMode === 'TELECOM_INTAKE'
                        ? perf.registrations.toLocaleString()
                        : perf.ridProcessed.toLocaleString()}
                    </span>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5 opacity-70">
                      {rankingMode === 'TELECOM_INTAKE'
                        ? `${perf.bureauTelecomShare.toFixed(2)}% Bureau Share`
                        : `${perf.successRate.toFixed(2)}% Success Rate`}
                    </p>
                  </div>
                </div>

                <div className="space-y-5 relative z-10">
                  <div className="space-y-1">
                    <h3 className="text-lg sm:text-xl font-black text-foreground uppercase tracking-tight line-clamp-1">
                      {perf.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3 text-primary" />
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest line-clamp-1">
                        {perf.cluster} • {perf.region}
                      </p>
                    </div>
                  </div>

                  {rankingMode === 'TELECOM_INTAKE' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="glass-subpanel p-3.5 rounded-2xl">
                        <p className="text-[8px] font-black text-muted-foreground uppercase mb-1 flex items-center gap-1.5">
                          <Phone className="h-2.5 w-2.5 text-emerald-500" /> Ethio Telecom
                        </p>
                        <p className="text-lg font-mono font-black text-foreground tabular-nums">
                          {perf.ethio.toLocaleString()}
                        </p>
                        <p className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {perf.ethioShare.toFixed(2)}% Share
                        </p>
                      </div>
                      <div className="glass-subpanel p-3.5 rounded-2xl">
                        <p className="text-[8px] font-black text-muted-foreground uppercase mb-1 flex items-center gap-1.5">
                          <Smartphone className="h-2.5 w-2.5 text-orange-500" /> Safaricom
                        </p>
                        <p className="text-lg font-mono font-black text-foreground tabular-nums">
                          {perf.safaricom.toLocaleString()}
                        </p>
                        <p className="text-[9px] font-mono font-bold text-orange-600 dark:text-orange-400">
                          {perf.safaricomShare.toFixed(2)}% Share
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="glass-subpanel p-3.5 rounded-2xl">
                        <p className="text-[8px] font-black text-muted-foreground uppercase mb-1 flex items-center gap-1.5">
                          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> Success Rate
                        </p>
                        <p className="text-lg font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {perf.successRate.toFixed(2)}%
                        </p>
                        <p className="text-[9px] font-mono font-bold text-muted-foreground">
                          {perf.ridProcessed} / {perf.ridTotal} RIDs
                        </p>
                      </div>
                      <div className="glass-subpanel p-3.5 rounded-2xl">
                        <p className="text-[8px] font-black text-muted-foreground uppercase mb-1 flex items-center gap-1.5">
                          <XCircle className="h-2.5 w-2.5 text-rose-500" /> Rejection Rate
                        </p>
                        <p className="text-lg font-mono font-black text-rose-600 dark:text-rose-400 tabular-nums">
                          {perf.rejectionRate.toFixed(2)}%
                        </p>
                        <p className="text-[9px] font-mono font-bold text-muted-foreground">
                          {perf.ridRejected} / {perf.ridTotal} RIDs
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Exact 2-Decimal KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <SummaryCard
          label={rankingMode === 'TELECOM_INTAKE' ? 'Bureau Velocity' : 'Total 29-Digit RIDs'}
          value={summary.totalRegs.toLocaleString()}
          sub={`${filteredLeaderboard.length} Active Units Ranked`}
          icon={Activity}
          color="text-primary"
        />
        <SummaryCard
          label="Exact Average Output"
          value={summary.avg}
          sub="Records per ranked officer"
          icon={ArrowUpRight}
          color="text-indigo-500"
        />
        {rankingMode === 'TELECOM_INTAKE' ? (
          <>
            <SummaryCard
              label="Ethio Telecom Share"
              value={`${summary.ethioShare}%`}
              sub="Exact carrier share"
              icon={Phone}
              color="text-emerald-500"
            />
            <SummaryCard
              label="Safaricom Share"
              value={`${summary.safaricomShare}%`}
              sub="Exact carrier share"
              icon={Smartphone}
              color="text-orange-500"
            />
          </>
        ) : (
          <>
            <SummaryCard
              label="Bureau Success Rate"
              value={`${summary.overallSuccessRate}%`}
              sub="Exact Processed RID ratio"
              icon={CheckCircle2}
              color="text-emerald-500"
            />
            <SummaryCard
              label="Bureau Rejection Rate"
              value={`${summary.overallRejectionRate}%`}
              sub="Exact Rejected + Failed ratio"
              icon={XCircle}
              color="text-rose-500"
            />
          </>
        )}
      </div>

      {/* Main Ranking Table */}
      <Card className="overflow-hidden rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-border bg-muted/20">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search officer name, cluster, or region..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 rounded-xl text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Showing {filteredLeaderboard.length} Officials
            </span>
            {(searchQuery || clusterFilter !== 'ALL') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setClusterFilter('ALL');
                }}
                className="h-8 px-2.5 text-[10px] font-black uppercase tracking-widest"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent h-12">
                <TableHead
                  onClick={() => toggleSort('rank')}
                  className="w-[100px] pl-6 sm:pl-8 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Rank</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => toggleSort('name')}
                  className="cursor-pointer select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Official Identity</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </div>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <span>Sector / Region</span>
                </TableHead>
                {rankingMode === 'TELECOM_INTAKE' ? (
                  <>
                    <TableHead
                      onClick={() => toggleSort('ethio')}
                      className="hidden sm:table-cell cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Ethio (Share %)</span>
                        <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('safaricom')}
                      className="hidden sm:table-cell cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Safaricom (Share %)</span>
                        <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('total')}
                      className="cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Total Intake (Share)</span>
                        <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      </div>
                    </TableHead>
                  </>
                ) : (
                  <>
                    <TableHead
                      onClick={() => toggleSort('total')}
                      className="hidden sm:table-cell cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Processed / Total</span>
                        <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('successRate')}
                      className="cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Exact Success Rate</span>
                        <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      </div>
                    </TableHead>
                    <TableHead
                      onClick={() => toggleSort('rejectionRate')}
                      className="hidden sm:table-cell cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Exact Rejection Rate</span>
                        <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      </div>
                    </TableHead>
                  </>
                )}
                <TableHead className="pr-6 sm:pr-8 text-right">
                  <span>Audit</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeaderboard.length > 0 ? (
                filteredLeaderboard.map((perf) => (
                  <TableRow key={perf.officerId} className="h-16 group">
                    <TableCell className="pl-6 sm:pl-8">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'h-7 w-7 rounded-md flex items-center justify-center transition-all',
                            perf.rank === 1
                              ? 'bg-[#f3ebff] text-[#7839ee]'
                              : perf.rank <= 3
                              ? 'bg-[#e8f5ff] text-[#0070cc]'
                              : 'bg-[#eeeeee] text-[#555555]'
                          )}
                        >
                          {perf.rank === 1 ? (
                            <Trophy className="h-3.5 w-3.5" />
                          ) : perf.rank <= 3 ? (
                            <Medal className="h-3.5 w-3.5" />
                          ) : (
                            <User className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 text-[13px] tabular-nums">
                          #{perf.rank}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                          {perf.name}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                          <BadgeCheck className="h-3 w-3 text-[#14804a]" /> Verified Official
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                          {perf.cluster}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {perf.region}
                        </span>
                      </div>
                    </TableCell>

                    {rankingMode === 'TELECOM_INTAKE' ? (
                      <>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                              {perf.ethio.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              {perf.ethioShare.toFixed(2)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                              {perf.safaricom.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400">
                              {perf.safaricomShare.toFixed(2)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-[6px] bg-[#e6f6ef] text-[#14804a] dark:bg-emerald-500/15 dark:text-emerald-400 text-[12px] font-mono font-bold tabular-nums">
                              {perf.registrations.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-muted-foreground">
                              ({perf.bureauTelecomShare.toFixed(2)}%)
                            </span>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-[13px] font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                            {perf.ridProcessed} / {perf.ridTotal}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center justify-center px-2.5 py-1 rounded-[6px] text-[12px] font-mono font-bold tabular-nums',
                              perf.successRate >= 85
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : perf.successRate >= 70
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            )}
                          >
                            {perf.successRate.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-[6px] bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[12px] font-mono font-bold tabular-nums">
                            {perf.rejectionRate.toFixed(2)}% ({perf.ridRejected})
                          </span>
                        </TableCell>
                      </>
                    )}

                    <TableCell className="pr-6 sm:pr-8 text-right">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider"
                      >
                        <Link href={`/performance?officerId=${perf.officerId}`}>
                          <Target className="h-3.5 w-3.5 mr-1 text-primary" /> Audit
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-80 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 opacity-40">
                      <Zap className="h-14 w-14 text-muted-foreground" />
                      <div className="space-y-1">
                        <p className="text-sm font-black uppercase tracking-[0.2em] text-foreground">
                          Zero Activity Signals for Selected Scope
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Switch Period Scope to &ldquo;All Time&rdquo; or &ldquo;This Month&rdquo; to inspect cumulative rankings.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="p-6 bg-primary/[0.03] border border-primary/10 rounded-[32px] flex items-center gap-6">
        <ShieldCheck className="h-8 w-8 text-primary shrink-0 opacity-40 hidden sm:block" />
        <p className="text-[10px] text-foreground font-bold uppercase leading-relaxed tracking-widest max-w-5xl text-center sm:text-left">
          Performance Integrity Policy: This leaderboard computes exact 2-decimal percentages for Telecom Carrier Share, Bureau Share, 29-Digit RID Success Rate, and Rejection Rate. Click &ldquo;Audit&rdquo; on any official to open their dedicated Quality & Accuracy Audit workbench.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, color }: any) {
  return (
    <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-[28px] group">
      <CardContent className="p-5 sm:p-6 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-2 bg-muted rounded-xl transition-colors group-hover:bg-primary/10">
              <Icon className={cn('h-4 w-4 transition-transform group-hover:rotate-12', color)} />
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              {label}
            </p>
          </div>
          <p className="text-3xl sm:text-4xl font-mono font-black text-foreground tracking-tighter tabular-nums">
            {value}
          </p>
          {sub && (
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {sub}
            </p>
          )}
        </div>
        <div className="h-12 w-12 bg-muted/30 rounded-full flex items-center justify-center border border-border group-hover:scale-110 transition-transform shrink-0">
          <TrendingUp className={cn('h-5 w-5 opacity-20', color)} />
        </div>
      </CardContent>
    </Card>
  );
}
