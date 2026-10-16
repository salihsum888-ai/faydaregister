'use client';

import { useMemo, useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemoFirebase, useCollection, useUser, useFirestore, useDoc } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Trophy, 
  XCircle, 
  CheckCircle2, 
  Loader2, 
  TrendingUp, 
  AlertCircle,
  FileDigit,
  User,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Calendar,
  Filter,
  FileSpreadsheet,
  FileText,
  Eye,
  Info,
  History,
  Zap,
  Target,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Activity,
  Layers,
  AlertTriangle,
  Award
} from 'lucide-react';
import { Registration, UserProfile } from '@/lib/types';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { format, addMonths, subMonths, eachDayOfInterval, endOfMonth, isSameDay } from 'date-fns';
import { Input } from '@/components/ui/input';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  ChartTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis
} from 'recharts';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
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

const getThresholdColor = (value: number) => {
  if (value >= 85) return '#10b981'; // Good (Green)
  if (value >= 80) return '#f59e0b'; // Middle (Yellow)
  return '#ef4444'; // Bad (Red)
};

function MetricGauge({ label, value, color, icon: Icon, trend, description, inverseTrend = false }: any) {
  const data = [{ name: label, value: value, fill: color }];
  const isUp = trend > 0;
  const isNeutral = trend === 0;
  
  // If inverseTrend is true (like Error or Rejection), Up is BAD, Down is GOOD.
  const isGood = inverseTrend ? trend < 0 : trend > 0;

  return (
    <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] overflow-hidden flex flex-col items-center justify-center p-8 relative group transition-all hover:shadow-2xl">
      <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-10 transition-opacity">
        <Icon className="h-32 w-32" />
      </div>
      
      <div className="h-[180px] w-full relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={15} data={data} startAngle={180} endAngle={0}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background dataKey="value" cornerRadius={30} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-10">
           <span className="text-4xl font-mono font-black text-foreground tracking-tighter tabular-nums">{value}%</span>
           <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1">{label}</p>
        </div>
      </div>

      <div className="w-full text-center relative z-10 mt-2 space-y-2">
         <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{description}</p>
         <div className={cn(
           "flex items-center justify-center gap-1 text-[9px] font-mono font-black uppercase tracking-tighter px-2 py-0.5 rounded-full w-fit mx-auto",
           isNeutral ? "bg-muted text-muted-foreground" :
           isGood ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
         )}>
           {!isNeutral && (isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
           {isNeutral ? 'Steady' : `${Math.abs(trend).toFixed(1)}% MoM`}
         </div>
      </div>
    </Card>
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
  const [selectedRejection, setSelectedRejection] = useState<Registration | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const targetOfficerId = searchParams.get('officerId') || user?.uid;
  const isRemoteAudit = targetOfficerId !== user?.uid;

  useEffect(() => {
    setMounted(true);
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (mounted && !selectedMonth) {
      setSelectedMonth(format(new Date(), 'yyyy-MM'));
    }
  }, [mounted, selectedMonth]);

  const targetProfileRef = useMemoFirebase(() => {
    if (!db || !targetOfficerId) return null;
    return doc(db, 'users', targetOfficerId);
  }, [db, targetOfficerId]);
  const { data: targetProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(targetProfileRef);

  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !targetOfficerId) return null;
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', targetOfficerId),
      limit(10000)
    );
  }, [db, targetOfficerId]);

  const { data: registrations, isLoading } = useCollection<Registration>(registrationsQuery);

  const monthsList = useMemo(() => {
    const list = [];
    let curr = new Date(START_DATE);
    const now = new Date();
    while (curr <= now) {
      list.push({
        value: format(curr, 'yyyy-MM'),
        label: format(curr, 'MMMM yyyy')
      });
      curr = addMonths(curr, 1);
    }
    return list.reverse();
  }, []);

  const stats = useMemo(() => {
    if (!registrations || !selectedMonth || !mounted) return null;

    const [year, month] = selectedMonth.split('-').map(Number);
    const dateObj = new Date(year, month - 1, 1);
    const prevMonthStr = format(subMonths(dateObj, 1), 'yyyy-MM');

    const filterByPeriod = (p: string) => registrations.filter(r => format(new Date(r.submissionDate), 'yyyy-MM') === p);

    const currItems = filterByPeriod(selectedMonth);
    const prevItems = filterByPeriod(prevMonthStr);

    const calculateMetrics = (items: Registration[]) => {
      const total = items.length;
      if (total === 0) return { total: 0, processed: 0, processing: 0, rejected: 0, failed: 0, successRate: 0, processingRate: 0, rejectionRate: 0, errorRate: 0, rejectionReasons: {}, peakDay: null };
      
      const processed = items.filter(r => r.status === 'Processed').length;
      const processing = items.filter(r => r.status === 'Processing' || r.status === 'Pending Review').length;
      const rejected = items.filter(r => r.status === 'Rejected').length;
      const failed = items.filter(r => r.status === 'Failed').length;

      const calculateRate = (count: number, t: number) => Number(((count / t) * 100).toFixed(1));

      const reasons: Record<string, number> = {};
      items.filter(r => r.status === 'Rejected').forEach(r => {
        const reason = r.rejectionReason || 'Unknown Protocol Error';
        reasons[reason] = (reasons[reason] || 0) + 1;
      });

      const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];

      return {
        total,
        processed,
        processing,
        rejected,
        failed,
        successRate: calculateRate(processed, total),
        processingRate: calculateRate(processing, total),
        rejectionRate: calculateRate(rejected, total),
        errorRate: calculateRate(failed, total),
        rejectionReasons: reasons,
        topReason: topReason ? topReason[0] : 'None',
      };
    };

    const currMetrics = calculateMetrics(currItems);
    const prevMetrics = calculateMetrics(prevItems);

    const trends = {
      processed: currMetrics.successRate - (prevMetrics.successRate || 0),
      processing: currMetrics.processingRate - (prevMetrics.processingRate || 0),
      rejected: currMetrics.rejectionRate - (prevMetrics.rejectionRate || 0),
      failed: currMetrics.errorRate - (prevMetrics.errorRate || 0),
    };

    const startDate = new Date(year, month - 1, 1);
    const endDate = endOfMonth(startDate);
    const daysInterval = eachDayOfInterval({ start: startDate, end: endDate });

    let peakCount = -1;
    let peakDay = null;

    const trendData = daysInterval.map(day => {
      const dayRegs = currItems.filter(r => isSameDay(new Date(r.submissionDate), day));
      const count = dayRegs.length;
      
      if (count > peakCount) {
        peakCount = count;
        peakDay = day;
      }

      return {
        date: format(day, 'dd MMM'),
        success: dayRegs.filter(r => r.status === 'Processed').length,
        rejected: dayRegs.filter(r => r.status === 'Rejected').length,
        total: count
      };
    });

    return { 
      ...currMetrics, 
      trends,
      trendData, 
      currItems,
      peakDay: peakDay ? format(peakDay, 'MMMM dd') : 'No Activity',
      peakAmount: peakCount > -1 ? peakCount : 0
    };
  }, [registrations, selectedMonth, mounted]);

  const rejectedRegistrations = useMemo(() => {
    if (!stats?.currItems) return [];
    return stats.currItems
      .filter(r => r.status === 'Rejected')
      .filter(r => r.applicantName.toLowerCase().includes(searchTerm.toLowerCase()) || r.id.includes(searchTerm))
      .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
  }, [stats?.currItems, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedMonth]);

  const paginatedRejections = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return rejectedRegistrations.slice(start, start + itemsPerPage);
  }, [rejectedRegistrations, currentPage]);

  const totalPages = Math.ceil(rejectedRegistrations.length / itemsPerPage);

  const handleExportExcel = () => {
    if (!stats?.currItems || stats.currItems.length === 0 || !user || !targetProfile) return;
    setIsExporting(true);
    
    const exportData = stats.currItems.map(r => ({
      'ID': r.id, 
      'Applicant': r.applicantName, 
      'Date': format(new Date(r.submissionDate), 'yyyy-MM-dd'),
      'Status': r.status, 
      'Rejection Reason': r.rejectionReason || 'N/A', 
      'Location': r.location
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Performance");
    XLSX.writeFile(wb, `Performance_${targetProfile.fullName.replace(/\s+/g, '_')}_${selectedMonth}.xlsx`);

    logAuditAction(db, user, targetProfile.fullName, 'PERFORMANCE_REVIEW', targetOfficerId!, `Exported XLSX Performance Intelligence for period: ${selectedMonth}.`);
    toast({ title: "Excel Intelligence Exported", description: "Monthly performance registry generated." });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (!stats?.currItems || stats.currItems.length === 0 || !user || !targetProfile) return;
    setIsExporting(true);

    const doc = new jsPDF();
    doc.text(`Performance Review: ${targetProfile.fullName}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${selectedMonth} | Accuracy: ${stats.successRate}%`, 14, 22);

    const rows = stats.currItems.map(r => [
      r.id.substring(0, 15)+'...', 
      r.applicantName, 
      format(new Date(r.submissionDate), 'MMM dd'), 
      r.status, 
      r.rejectionReason || '-'
    ]);

    autoTable(doc, { 
      startY: 30, 
      head: [['RID', 'Applicant', 'Date', 'Status', 'Detail']], 
      body: rows, 
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`Performance_${targetProfile.fullName.replace(/\s+/g, '_')}_${selectedMonth}.pdf`);
    logAuditAction(db, user, targetProfile.fullName, 'PERFORMANCE_REVIEW', targetOfficerId!, `Exported PDF Performance Archive for period: ${selectedMonth}.`);
    toast({ title: "PDF Ledger Generated", description: "Official documentation saved." });
    setTimeout(() => setIsExporting(false), 800);
  };

  if (isUserLoading || isLoading || isProfileLoading || !selectedMonth || !user) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5 text-center md:text-left">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20"><TrendingUp className="h-6 w-6 md:h-7 md:w-7 text-primary" /></div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">
                {isRemoteAudit ? 'Unit Intelligence' : 'Bureau Quality'}
              </h1>
              <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                {isRemoteAudit ? `Auditing: ${targetProfile?.fullName}` : 'Personnel Accuracy Matrix'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 bg-card p-2 rounded-2xl border shadow-sm self-center md:self-auto">
          <div className="hidden sm:flex items-center gap-2 pl-3">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Period:</span>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] h-10 border-none bg-transparent font-bold text-sm">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {monthsList.map(m => <SelectItem key={m.value} value={m.value} className="font-bold">{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!stats || stats.total === 0 ? (
        <div className="flex flex-col items-center justify-center py-40 bg-card rounded-[32px] border-2 border-dashed border-border text-muted-foreground/30">
          <Layers className="h-16 w-16 mb-4 opacity-10" />
          <p className="text-sm font-black uppercase tracking-[0.3em]">Matrix Data Depleted</p>
          <p className="text-xs italic mt-2">No registrations detected for the selected operational period.</p>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricGauge 
              label="Success Rate" 
              value={stats.successRate} 
              color={getThresholdColor(stats.successRate)} 
              icon={CheckCircle2} 
              trend={stats.trends.processed}
              description="Finalized Documents"
              inverseTrend={false}
            />
            <MetricGauge 
              label="Triage Rate" 
              value={stats.processingRate} 
              color={COLORS.processing} 
              icon={Activity} 
              trend={stats.trends.processing}
              description="Active Pipeline"
              inverseTrend={true}
            />
            <MetricGauge 
              label="Purge Rate" 
              value={stats.rejectionRate} 
              color={COLORS.rejected} 
              icon={ShieldAlert} 
              trend={stats.trends.rejected}
              description="Protocol Rejections"
              inverseTrend={true}
            />
            <MetricGauge 
              label="Error Rate" 
              value={stats.errorRate} 
              color={COLORS.failed} 
              icon={AlertCircle} 
              trend={stats.trends.failed}
              description="System Failures"
              inverseTrend={true}
            />
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] p-8 flex flex-col justify-between group hover:shadow-xl transition-all">
               <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500 group-hover:scale-110 transition-transform"><Award className="h-6 w-6" /></div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Daily Pick (Peak)</p>
                  </div>
                  <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">{stats.peakDay}</h3>
                  <p className="text-xs text-muted-foreground font-medium">Highest throughput identified this month.</p>
               </div>
               <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                  <span className="text-4xl font-mono font-black text-amber-600 tabular-nums tracking-tighter">{stats.peakAmount}</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Units Handled</span>
               </div>
            </Card>

            <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] p-8 flex flex-col justify-between group hover:shadow-xl transition-all">
               <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-rose-500/10 rounded-2xl text-rose-500 group-hover:scale-110 transition-transform"><AlertTriangle className="h-6 w-6" /></div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Most Rejection Reason</p>
                  </div>
                  <h3 className="text-xl font-black text-foreground uppercase tracking-tight line-clamp-2">{stats.topReason}</h3>
                  <p className="text-xs text-muted-foreground font-medium">Primary cause for protocol failure.</p>
               </div>
               <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                  <span className="text-4xl font-mono font-black text-rose-600 tabular-nums tracking-tighter">{stats.rejected}</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Purged</span>
               </div>
            </Card>

            <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] p-8 flex flex-col justify-between group hover:shadow-xl transition-all bg-primary/[0.02]">
               <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary group-hover:scale-110 transition-transform"><Target className="h-6 w-6" /></div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Registry Velocity</p>
                  </div>
                  <h3 className="text-4xl font-mono font-black text-foreground tracking-tighter tabular-nums tracking-tighter">{stats.total}</h3>
                  <p className="text-xs text-muted-foreground font-medium">Consolidated period intake volume.</p>
               </div>
               <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20">
                    <TrendingUp className="h-3 w-3" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">Verified</span>
                  </div>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Final Ledger</span>
               </div>
            </Card>
          </section>

          <Card className="border border-border bg-card overflow-hidden rounded-[32px] shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border py-4 px-6 md:px-8 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-black text-foreground uppercase tracking-[0.2em]">Quality Velocity</CardTitle>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Daily throughput analysis for {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}</p>
                </div>
                <History className="h-4 w-4 text-muted-foreground opacity-20" />
            </CardHeader>
            <CardContent className="p-4 md:p-8">
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.trendData}>
                      <defs>
                        <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.processed} stopOpacity={0.1}/><stop offset="95%" stopColor={COLORS.processed} stopOpacity={0}/></linearGradient>
                        <linearGradient id="colorRejected" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.rejected} stopOpacity={0.1}/><stop offset="95%" stopColor={COLORS.rejected} stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontBold: true, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontBold: true, fill: 'hsl(var(--muted-foreground))' }} />
                      <ChartTooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (<div className="bg-card border border-border shadow-2xl p-3 rounded-xl space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{payload[0].payload.date}</p>
                            <p className="text-xs font-mono font-black text-emerald-600 tabular-nums">SUCCESS: {payload[0].value}</p>
                            <p className="text-xs font-mono font-black text-rose-600 tabular-nums">PURGED: {payload[1].value}</p>
                          </div>);
                        }
                        return null;
                      }} />
                      <Area type="monotone" dataKey="success" stroke={COLORS.processed} strokeWidth={2} fillOpacity={1} fill="url(#colorSuccess)" />
                      <Area type="monotone" dataKey="rejected" stroke={COLORS.rejected} strokeWidth={2} fillOpacity={1} fill="url(#colorRejected)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-card p-6 rounded-[32px] border border-border shadow-sm">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" /> Rejection Audit
                </h2>
                <p className="text-xs font-medium text-muted-foreground">Detailed discrepancies for the selected period.</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative w-full sm:w-80 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                  <Input placeholder="Filter records..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-11 pl-10 border-border bg-background rounded-xl text-xs font-bold" />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button onClick={handleExportExcel} disabled={isExporting} variant="outline" className="flex-1 h-11 px-4 rounded-xl border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 font-bold text-[10px] uppercase tracking-widest bg-background">
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'XLS'}
                  </Button>
                  <Button onClick={handleExportPDF} disabled={isExporting} variant="outline" className="h-11 px-4 rounded-xl border-rose-500/20 text-rose-600 hover:bg-rose-500/5 font-bold text-[10px] uppercase tracking-widest bg-background">
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'PDF'}
                  </Button>
                </div>
              </div>
            </div>

            <Card className="border border-border bg-card shadow-sm rounded-[32px] overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="border-border">
                      <TableHead className="py-5 pl-10">Applicant Registry</TableHead>
                      <TableHead className="py-5">ID</TableHead>
                      <TableHead className="py-5 text-center">Status</TableHead>
                      <TableHead className="py-5 pr-10 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRejections.length > 0 ? paginatedRejections.map((reg) => (
                      <TableRow key={reg.id} className="hover:bg-muted/30 border-border group h-20 transition-colors">
                        <TableCell className="pl-10">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              {reg.applicantName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell><span className="text-[10px] font-mono font-black text-muted-foreground/30">{reg.id.substring(0, 15)}...</span></TableCell>
                        <TableCell className="text-center"><StatusBadge status="Rejected" className="scale-75" /></TableCell>
                        <TableCell className="pr-10 text-right"><Button variant="ghost" size="sm" className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-all" onClick={() => setSelectedRejection(reg)}><Eye className="mr-2 h-4 w-4" /> View</Button></TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={4} className="h-40 text-center opacity-20"><CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-primary" /><p className="text-xs font-black uppercase tracking-widest">No Protocol Failures</p></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-10 py-6 bg-muted/5 border-t border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    Viewing {paginatedRejections.length} of {rejectedRegistrations.length} Failures
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-xl border-border bg-background hover:bg-muted" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <div className="flex items-center justify-center min-w-[120px] h-10 text-[10px] font-black text-foreground bg-muted/50 border border-border rounded-xl uppercase tracking-widest px-4">Page {currentPage} of {totalPages}</div>
                    <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-xl border-border bg-background hover:bg-muted" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <Dialog open={!!selectedRejection} onOpenChange={(o) => !o && setSelectedRejection(null)}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden rounded-[32px] border-none shadow-2xl bg-popover">
          <DialogHeader className="p-6 md:p-8 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 bg-rose-500/10 rounded-2xl"><ShieldAlert className="h-5 w-5 md:h-6 md:w-6 text-rose-500" /></div>
                <div>
                   <DialogTitle className="text-lg md:text-xl font-black text-foreground uppercase tracking-tighter">Audit Deep-Dive</DialogTitle>
                   <DialogDescription className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bureau Internal Security Record</DialogDescription>
                </div>
              </div>
              <StatusBadge status="Rejected" className="scale-90" />
            </div>
          </DialogHeader>
          <div className="p-6 md:p-8 space-y-8 bg-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
              <div className="space-y-1"><p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><User className="h-3 w-3" /> Identity</p><p className="text-sm font-black text-foreground">{selectedRejection?.applicantName}</p></div>
              <div className="space-y-1"><p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Date</p><p className="text-sm font-black text-foreground">{selectedRejection ? format(new Date(selectedRejection.submissionDate), 'MMMM dd, yyyy') : '-'}</p></div>
            </div>
            <div className="p-5 bg-rose-500/5 border border-rose-500/10 rounded-2xl space-y-2">
                <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Protocol Failure Reason</p>
                <p className="text-base font-bold text-rose-700 leading-tight">{selectedRejection?.rejectionReason || "Data discrepancy detected."}</p>
            </div>
            <div className="space-y-2">
               <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Submission Payload</p>
               <div className="p-6 bg-muted/50 rounded-[24px] border border-border italic text-sm font-medium">"{selectedRejection?.content || "No narrative content detected."}"</div>
            </div>
          </div>
          <div className="p-4 border-t border-border bg-muted/30 flex justify-end"><Button onClick={() => setSelectedRejection(null)} className="font-black text-[10px] uppercase tracking-widest h-10 px-8 rounded-xl">Close Report</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <Suspense fallback={<div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>}>
      <PerformanceContent />
    </Suspense>
  );
}
