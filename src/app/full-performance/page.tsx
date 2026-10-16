'use client';

import { useMemo, useState, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Calendar,
  Zap,
  ShieldCheck,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  History,
  PieChart as PieChartIcon,
  Layers,
  Trophy,
  ShieldAlert,
  Award,
  AlertTriangle,
  Star
} from 'lucide-react';
import { Registration, DailyReport, UserProfile } from '@/lib/types';
import { format, subDays, eachMonthOfInterval, subMonths, eachDayOfInterval, startOfMonth, endOfMonth, isWithinInterval, isSameDay } from 'date-fns';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis
} from 'recharts';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Institutional Status Color Protocol
const COLORS = {
  processed: '#10b981', // Green
  processing: '#f59e0b', // Yellow
  rejected: '#ef4444',  // Red
  failed: '#64748b',    // Grey
};

const getThresholdColor = (value: number) => {
  if (value >= 85) return '#10b981'; // Elite (Green)
  if (value >= 80) return '#f59e0b'; // Caution (Yellow)
  return '#ef4444'; // Critical (Red)
};

function MetricGauge({ label, value, color, icon: Icon, trend, description, inverseTrend = false }: any) {
  const data = [{ name: label, value: value, fill: color }];
  const isUp = trend > 0;
  const isNeutral = trend === 0;
  
  // If inverseTrend is true (like Error or Rejection), Down is GOOD, Up is BAD.
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
           {isNeutral ? 'Stable' : `${Math.abs(trend).toFixed(1)}% MoM`}
         </div>
      </div>
    </Card>
  );
}

export default function FullPerformancePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [analysisScope, setAnalysisScope] = useState<'current' | 'history'>('current');

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
    return query(collection(db, 'registrations'), where('assignedReviewerId', '==', user.uid), limit(10000));
  }, [db, user, isAdmin]);

  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    if (isAdmin) return query(collection(db, 'daily_reports'), limit(10000));
    return query(collection(db, 'daily_reports'), where('officerId', '==', user.uid), limit(10000));
  }, [db, user, isAdmin]);

  const { data: registrations, isLoading: isRegsLoading } = useCollection<Registration>(regsQuery);
  const { data: reports, isLoading: isReportsLoading } = useCollection<DailyReport>(reportsQuery);

  const allTimeHighs = useMemo(() => {
    if (!registrations || !mounted) return null;

    const monthGroups: Record<string, { total: number; processed: number }> = {};
    
    registrations.forEach(r => {
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
      if (data.total > 5) {
        const rate = (data.processed / data.total) * 100;
        if (rate > bestRate) {
          bestRate = rate;
          bestPeriod = period;
        }
      }
    });

    return {
      rate: bestRate > -1 ? Number(bestRate.toFixed(1)) : 0,
      period: bestPeriod
    };
  }, [registrations, mounted]);

  const stats = useMemo(() => {
    if (!registrations || !mounted) return null;

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));

    const scopeRegs = analysisScope === 'current' 
      ? registrations.filter(r => isWithinInterval(new Date(r.submissionDate), { start: monthStart, end: monthEnd }))
      : registrations;

    const prevRegs = registrations.filter(r => isWithinInterval(new Date(r.submissionDate), { start: prevMonthStart, end: prevMonthEnd }));

    const total = scopeRegs.length;
    if (total === 0) return null;

    const counts = {
      processed: scopeRegs.filter(r => r.status === 'Processed').length,
      processing: scopeRegs.filter(r => r.status === 'Processing' || r.status === 'Pending Review').length,
      rejected: scopeRegs.filter(r => r.status === 'Rejected').length,
      failed: scopeRegs.filter(r => r.status === 'Failed').length,
    };

    const reasons: Record<string, number> = {};
    scopeRegs.filter(r => r.status === 'Rejected').forEach(r => {
      const reason = r.rejectionReason || 'Unknown Discrepancy';
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];

    const prevTotal = prevRegs.length;
    const prevCounts = {
      processed: prevRegs.filter(r => r.status === 'Processed').length,
      processing: prevRegs.filter(r => r.status === 'Processing' || r.status === 'Pending Review').length,
      rejected: prevRegs.filter(r => r.status === 'Rejected').length,
      failed: prevRegs.filter(r => r.status === 'Failed').length,
    };

    const calculateRate = (count: number, t: number) => Number(((count / t) * 100).toFixed(1));

    const rates = {
      processed: calculateRate(counts.processed, total),
      processing: calculateRate(counts.processing, total),
      rejected: calculateRate(counts.rejected, total),
      failed: calculateRate(counts.failed, total),
    };

    const prevRates = {
      processed: calculateRate(prevCounts.processed, prevTotal || 1),
      processing: calculateRate(prevCounts.processing, prevTotal || 1),
      rejected: calculateRate(prevCounts.rejected, prevTotal || 1),
      failed: calculateRate(prevCounts.failed, prevTotal || 1),
    };

    const trends = {
      processed: rates.processed - prevRates.processed,
      processing: rates.processing - prevRates.processing,
      rejected: rates.rejected - prevRates.rejected,
      failed: rates.failed - prevRates.failed,
    };

    const pieData = [
      { name: 'Processed', value: counts.processed, color: COLORS.processed },
      { name: 'Active', value: counts.processing, color: COLORS.processing },
      { name: 'Rejected', value: counts.rejected, color: COLORS.rejected },
      { name: 'Failed', value: counts.failed, color: COLORS.failed },
    ];

    return { total, counts, rates, trends, pieData, topReason: topReason ? topReason[0] : 'None' };
  }, [registrations, mounted, analysisScope]);

  const temporalTrends = useMemo(() => {
    if (!reports || !mounted) return null;

    const now = new Date();
    const days = analysisScope === 'current' 
      ? eachDayOfInterval({ start: startOfMonth(now), end: now })
      : eachDayOfInterval({ start: subDays(now, 29), end: now });

    let peakCount = -1;
    let peakDay = null;

    const dailyTrend = days.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayTotal = reports.filter(r => r.date === dateStr).reduce((acc, curr) => acc + (curr.total || 0), 0);
      
      if (dayTotal > peakCount) {
        peakCount = dayTotal;
        peakDay = date;
      }

      return { label: format(date, 'MMM dd'), value: dayTotal };
    });

    return { 
      dailyTrend, 
      peakDay: peakDay ? format(peakDay, 'MMMM dd') : 'No Data',
      peakAmount: peakCount > -1 ? peakCount : 0
    };
  }, [reports, mounted, analysisScope]);

  if (isUserLoading || isRegsLoading || isReportsLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Bureau High-Command Terminal</p>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">Full Intel Matrix</h1>
          <p className="text-sm text-muted-foreground max-w-lg">
            {isAdmin ? 'Global bureau-wide lifecycle synchronization' : 'Personal throughput and quality velocity'}
          </p>
        </div>
        
        <div className="bg-card p-2 rounded-[2rem] border shadow-sm w-full md:w-auto">
          <Tabs value={analysisScope} onValueChange={(v: any) => setAnalysisScope(v)} className="w-full">
            <TabsList className="grid grid-cols-2 w-full sm:w-[320px] h-11 bg-muted/50 rounded-2xl p-1 border border-border">
              <TabsTrigger value="current" className="text-[10px] font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">Current Cycle</TabsTrigger>
              <TabsTrigger value="history" className="text-[10px] font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm">Bureau Legacy</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {!stats ? (
        <div className="flex flex-col items-center justify-center py-40 bg-card rounded-[32px] border-2 border-dashed border-border text-muted-foreground/30">
          <Layers className="h-16 w-16 mb-4 opacity-10" />
          <p className="text-sm font-black uppercase tracking-[0.3em]">Matrix Data Depleted</p>
          <p className="text-xs italic mt-2">No registrations detected for the selected operational horizon.</p>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricGauge 
              label="Success Rate" 
              value={stats.rates.processed} 
              color={getThresholdColor(stats.rates.processed)} 
              icon={CheckCircle2} 
              trend={stats.trends.processed}
              description="Finalized Documents"
              inverseTrend={false}
            />
            <MetricGauge 
              label="Triage Rate" 
              value={stats.rates.processing} 
              color={COLORS.processing} 
              icon={Activity} 
              trend={stats.trends.processing}
              description="Active Pipeline"
              inverseTrend={true}
            />
            <MetricGauge 
              label="Purge Rate" 
              value={stats.rates.rejected} 
              color={COLORS.rejected} 
              icon={ShieldAlert} 
              trend={stats.trends.rejected}
              description="Protocol Rejections"
              inverseTrend={true}
            />
            <MetricGauge 
              label="Error Rate" 
              value={stats.rates.failed} 
              color={COLORS.failed} 
              icon={AlertCircle} 
              trend={stats.trends.failed}
              description="System Failures"
              inverseTrend={true}
            />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] p-8 flex flex-col justify-between bg-primary/[0.02] group hover:shadow-xl transition-all">
               <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary group-hover:scale-110 transition-transform"><Award className="h-6 w-6" /></div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Daily Pick (Peak)</p>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">{temporalTrends?.peakDay}</h3>
                  <p className="text-xs text-muted-foreground font-medium">Busiest operational period detected in range.</p>
               </div>
               <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                  <span className="text-3xl font-mono font-black text-primary tabular-nums tracking-tighter">{temporalTrends?.peakAmount}</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Units Handled</span>
               </div>
            </Card>

            <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] p-8 flex flex-col justify-between group hover:shadow-xl transition-all">
               <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-rose-500/10 rounded-2xl text-rose-500 group-hover:scale-110 transition-transform"><AlertTriangle className="h-6 w-6" /></div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Rejection Frequency</p>
                  </div>
                  <h3 className="text-xl font-black text-foreground uppercase tracking-tight line-clamp-2">{stats.topReason}</h3>
                  <p className="text-xs text-muted-foreground font-medium">Primary cause for registry protocol failure.</p>
               </div>
               <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                  <span className="text-3xl font-mono font-black text-rose-600 tabular-nums tracking-tighter">{stats.counts.rejected}</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Rejected</span>
               </div>
            </Card>

            <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] p-8 flex flex-col justify-between group hover:shadow-xl transition-all">
               <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500 group-hover:scale-110 transition-transform"><CheckCircle2 className="h-6 w-6" /></div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Success Volume</p>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">Finalized Archives</h3>
                  <p className="text-xs text-muted-foreground font-medium">Documents that cleared all protocol gates.</p>
               </div>
               <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                  <span className="text-3xl font-mono font-black text-emerald-600 tabular-nums tracking-tighter">{stats.counts.processed}</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Success</span>
               </div>
            </Card>

            <Card className="border-none shadow-sm rounded-[2.5rem] p-8 flex flex-col justify-between group hover:shadow-xl transition-all bg-gradient-to-br from-amber-500/10 to-primary/5 ring-1 ring-amber-500/20">
               <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-600 group-hover:scale-110 transition-transform"><Trophy className="h-6 w-6" /></div>
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Elite Milestone</p>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-4xl font-mono font-black text-amber-700 tabular-nums tracking-tighter">{allTimeHighs?.rate}%</h3>
                    <p className="text-[11px] font-black text-amber-800 uppercase tracking-widest">{allTimeHighs?.period}</p>
                  </div>
                  <p className="text-xs text-amber-700/60 font-medium">Highest success rate recorded across all bureau history.</p>
               </div>
               <div className="mt-8 pt-6 border-t border-amber-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">All-Time Peak</span>
                  </div>
                  <ShieldCheck className="h-4 w-4 text-amber-500 opacity-40" />
               </div>
            </Card>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
             <div className="xl:col-span-8 space-y-8">
                <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] overflow-hidden group">
                  <CardHeader className="bg-muted/30 border-b border-border py-6 px-8 flex flex-row items-center justify-between">
                    <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" /> Inbound Velocity Trend
                    </CardTitle>
                    <div className="px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-[8px] font-black text-primary uppercase tracking-widest">
                      {analysisScope === 'current' ? 'Cycle Pulse' : 'Historical Analysis'}
                    </div>
                  </CardHeader>
                  <CardContent className="p-8">
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={temporalTrends?.dailyTrend || []}>
                              <defs>
                                <linearGradient id="colorDaily" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: 'hsl(var(--muted-foreground))' }} />
                              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: 'hsl(var(--muted-foreground))' }} />
                              <Tooltip content={({ active, payload }) => {
                                if (active && payload?.length) {
                                  return (
                                    <div className="bg-card border border-border shadow-2xl p-4 rounded-2xl">
                                      <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">{payload[0].payload.label}</p>
                                      <p className="text-xl font-mono font-black text-foreground tabular-nums tracking-tighter">{payload[0].value} Units</p>
                                    </div>
                                  );
                                }
                                return null;
                              }} />
                              <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorDaily)" />
                          </AreaChart>
                        </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] p-8 border-l-[6px] group transition-all" style={{ borderLeftColor: COLORS.rejected }}>
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                        <div className="space-y-6 flex-1">
                            <div className="flex items-start gap-4">
                               <div className="p-3 bg-rose-500/10 rounded-2xl text-rose-500 shrink-0 group-hover:rotate-12 transition-transform">
                                  <ShieldAlert className="h-6 w-6" />
                               </div>
                               <div className="space-y-1">
                                  <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Integrity Audit</h3>
                                  <p className="text-xs text-muted-foreground font-medium">Monitoring protocol rejections and technical failures.</p>
                               </div>
                            </div>
                            <div className="flex items-center gap-8 pl-1">
                              <div className="space-y-1">
                                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Rejections</p>
                                  <p className="text-3xl font-mono font-black text-rose-600 tabular-nums tracking-tighter">{stats.counts.rejected}</p>
                              </div>
                              <div className="h-8 w-px bg-border" />
                              <div className="space-y-1">
                                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">System Errors</p>
                                  <p className="text-3xl font-mono font-black text-slate-500 tabular-nums tracking-tighter">{stats.counts.failed}</p>
                              </div>
                            </div>
                        </div>
                        <Button variant="outline" className="w-full lg:w-auto h-11 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest border-border hover:bg-rose-500 hover:text-white transition-all shrink-0 mt-4 lg:mt-0" asChild>
                            <a href="/performance">Detailed Audit</a>
                        </Button>
                      </div>
                   </Card>

                   <Card className="border border-border bg-card shadow-sm rounded-[2.5rem] p-8 border-l-[6px] border-l-primary group transition-all">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                         <div className="space-y-6 flex-1">
                            <div className="flex items-start gap-4">
                               <div className="p-3 bg-primary/10 rounded-2xl text-primary shrink-0 group-hover:scale-110 transition-transform">
                                  <Trophy className="h-6 w-6" />
                               </div>
                               <div className="space-y-1">
                                  <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Elite Output</h3>
                                  <p className="text-xs text-muted-foreground font-medium">Verified successful registration completions.</p>
                               </div>
                            </div>
                            <div className="space-y-1 pl-1">
                               <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Total Finalized</p>
                               <p className="text-4xl font-mono font-black text-emerald-600 tabular-nums tracking-tighter">{stats.counts.processed}</p>
                            </div>
                         </div>
                         <Button variant="outline" className="w-full lg:w-auto h-11 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest border-border hover:bg-primary hover:text-white transition-all shrink-0 mt-4 lg:mt-0" asChild>
                            <a href="/full-registration">View Registry</a>
                         </Button>
                      </div>
                   </Card>
                </div>
             </div>

             <div className="xl:col-span-4 space-y-8">
                <Card className="border border-border bg-card rounded-[2.5rem] p-8 shadow-sm">
                  <CardTitle className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-primary" /> Lifecycle Context
                  </CardTitle>
                  <div className="space-y-5">
                    {stats.pieData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between p-4 rounded-2xl border border-border hover:bg-muted/30 transition-all group">
                        <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                            <span className="text-xs font-black text-foreground uppercase tracking-tight">{item.name}</span>
                        </div>
                        <span className="text-sm font-mono font-black tabular-nums tracking-tighter group-hover:scale-110 transition-transform">{item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-10 pt-8 border-t border-border border-dashed flex items-center justify-center">
                     <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={stats.pieData} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                              {stats.pieData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                     </div>
                  </div>
                </Card>

                <div className="p-8 bg-primary/[0.03] border border-primary/10 rounded-[2.5rem] space-y-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-primary opacity-40" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Protocol Verification</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed tracking-tight">
                    Authorized Intelligence Protocol: These rates are derived from finalized bureau ledgers and signed operational reports. All metrics are subject to forensic auditing.
                  </p>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
