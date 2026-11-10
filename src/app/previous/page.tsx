
'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown,
  Phone,
  Smartphone,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCcw,
  AlertCircle,
  Loader2,
  Database,
  History,
  Activity
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { format, addMonths, subMonths, setMonth, setYear } from 'date-fns';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { MonthlySummary } from '@/lib/types';
import { useTranslation } from '@/i18n/language-provider';

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

function PreviousContent() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const searchParams = useSearchParams();
  const { t, formatNumber } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const paramMonth = searchParams.get('month');
    const paramYear = searchParams.get('year');
    
    if (paramMonth && paramYear) {
      const monthIdx = MONTHS.indexOf(paramMonth);
      if (monthIdx !== -1) {
        let d = new Date();
        d = setYear(d, parseInt(paramYear));
        d = setMonth(d, monthIdx);
        setSelectedDate(d);
        return;
      }
    }
    setSelectedDate(new Date());
  }, [searchParams]);

  const summariesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'monthly_summaries'),
      where('officerId', '==', user.uid)
    );
  }, [db, user]);

  const { data: summaries, isLoading } = useCollection<MonthlySummary>(summariesQuery);

  const stats = useMemo(() => {
    if (!selectedDate || !summaries) return null;

    const currentMonthLabel = MONTHS[selectedDate.getMonth()];
    const currentYearLabel = selectedDate.getFullYear().toString();
    
    const prevDate = subMonths(selectedDate, 1);
    const prevMonthLabel = MONTHS[prevDate.getMonth()];
    const prevYearLabel = prevDate.getFullYear().toString();

    const current = summaries.find(s => s.month === currentMonthLabel && s.year === currentYearLabel);
    const previous = summaries.find(s => s.month === prevMonthLabel && s.year === prevYearLabel);

    const breakdown = [
      { label: t.common.statusProcessed, value: current?.processed || 0, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { label: t.common.statusProcessing, value: current?.processing || 0, icon: RefreshCcw, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { label: t.common.statusRejected, value: current?.rejected || 0, icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
      { label: t.common.statusFailed, value: current?.failed || 0, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
      { label: t.common.statusPendingReview, value: current?.pendingReview || 0, icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' },
    ];

    return {
      current: current || { ethio: 0, safaricom: 0, total: 0 },
      previous: previous || { ethio: 0, safaricom: 0, total: 0 },
      breakdown,
      currentLabel: `${currentMonthLabel} ${currentYearLabel}`,
      prevLabel: `${prevMonthLabel} ${prevYearLabel}`,
      prevShort: prevMonthLabel
    };
  }, [selectedDate, summaries, t]);

  const calculateChange = (curr: number, prev: number) => {
    const diff = curr - prev;
    const percent = prev !== 0 ? String(Number(((diff / prev) * 100).toFixed(2))) : (curr > 0 ? "100" : "0");
    return { diff, percent, isNegative: diff < 0 };
  };

  const handlePrevMonth = () => selectedDate && setSelectedDate(subMonths(selectedDate, 1));
  const handleNextMonth = () => selectedDate && setSelectedDate(addMonths(selectedDate, 1));

  if (isUserLoading || isLoading || !selectedDate || !stats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  const totalChange = calculateChange(stats.current.total, stats.previous.total);
  const ethioChange = calculateChange(stats.current.ethio, stats.previous.ethio);
  const safaricomChange = calculateChange(stats.current.safaricom, stats.previous.safaricom);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <Link href="/historical" className="flex items-center text-[10px] font-black text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest gap-1.5">
        <ArrowLeft className="h-3 w-3" /> {t.previousPage.returnToLedger}
      </Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-foreground font-headline uppercase leading-none">{t.previousPage.pageTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.previousPage.pageSub}</p>
        </div>
        
        <div className="flex items-center bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-11 w-11 rounded-none border-r border-border hover:bg-muted"
            onClick={handlePrevMonth}
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Button>
          <div className="px-8 font-black text-[10px] uppercase tracking-widest text-foreground whitespace-nowrap min-w-[180px] text-center">
            {stats.currentLabel}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-11 w-11 rounded-none border-l border-border hover:bg-muted"
            onClick={handleNextMonth}
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {!stats.current.total && stats.current.total === 0 ? (
        <div className="py-32 flex flex-col items-center justify-center text-center bg-card border-2 border-dashed rounded-[32px] border-border text-muted-foreground/30">
          <Database className="h-16 w-16 mb-4 opacity-10" />
          <p className="text-sm font-black uppercase tracking-[0.3em]">{t.previousPage.vaultEmptyTitle}</p>
          <p className="text-xs font-medium mt-2">{t.previousPage.vaultEmptySub}</p>
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <Activity className="h-3 w-3" /> {t.previousPage.comparativeMomentumTitle}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <ComparisonCard 
                title={t.previousPage.totalIntakeTitle} 
                currentValue={stats.current.total} 
                change={totalChange}
                prevMonthLabel={stats.prevLabel}
                prevMonthShort={stats.prevShort}
                prevValue={stats.previous.total}
                vsPrefix={t.previousPage.vsPrefix}
                formatNumber={formatNumber}
              />
              <ComparisonCard 
                title={t.previousPage.ethioLineTitle} 
                currentValue={stats.current.ethio} 
                change={ethioChange}
                prevMonthLabel={stats.prevLabel}
                prevMonthShort={stats.prevShort}
                prevValue={stats.previous.ethio}
                vsPrefix={t.previousPage.vsPrefix}
                formatNumber={formatNumber}
              />
              <ComparisonCard 
                title={t.previousPage.safaricomLineTitle} 
                currentValue={stats.current.safaricom} 
                change={safaricomChange}
                prevMonthLabel={stats.prevLabel}
                prevMonthShort={stats.prevShort}
                prevValue={stats.previous.safaricom}
                vsPrefix={t.previousPage.vsPrefix}
                formatNumber={formatNumber}
              />
              <ComparisonCard 
                title={t.previousPage.fullCycleTotalTitle} 
                currentValue={stats.current.total} 
                change={totalChange}
                prevMonthLabel={stats.prevLabel}
                prevMonthShort={stats.prevShort}
                prevValue={stats.previous.total}
                vsPrefix={t.previousPage.vsPrefix}
                formatNumber={formatNumber}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <section className="xl:col-span-2 space-y-4">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-3 w-3" /> {t.previousPage.operationalSummaryTitle}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SummaryCard title={t.previousPage.aggregateTitle} value={stats.current.total} subtitle={`${stats.currentLabel} ${t.previousPage.intakeSuffix}`} icon={TrendingUp} iconColor="text-primary" iconBg="bg-primary/10" formatNumber={formatNumber} />
                <SummaryCard title={t.previousPage.ethioTitle} value={stats.current.ethio} subtitle={t.previousPage.verifiedNetworkIntake} icon={Phone} iconColor="text-emerald-500" iconBg="bg-emerald-500/10" formatNumber={formatNumber} />
                <SummaryCard title={t.previousPage.safaricomTitle} value={stats.current.safaricom} subtitle={t.previousPage.verifiedNetworkIntake} icon={Smartphone} iconColor="text-orange-500" iconBg="bg-orange-500/10" formatNumber={formatNumber} />
                <SummaryCard title={t.previousPage.fullAuditTitle} value={stats.current.total} subtitle={t.previousPage.verifiedCycleCount} icon={Calendar} iconColor="text-purple-500" iconBg="bg-purple-500/10" formatNumber={formatNumber} />
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <History className="h-3 w-3" /> {t.previousPage.archiveBreakdownTitle}
              </h2>
              <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-[32px]">
                <CardContent className="p-6 space-y-1">
                  {stats.breakdown.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-2xl hover:bg-muted/50 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className={cn("p-2.5 rounded-xl transition-transform group-hover:scale-110", item.bg)}>
                          <item.icon className={cn("h-4 w-4", item.color)} />
                        </div>
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{item.label}</span>
                      </div>
                      <span className="text-xl font-black text-foreground tabular-nums">{formatNumber(item.value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function ComparisonCard({ title, currentValue, change, prevMonthLabel, prevMonthShort, prevValue, vsPrefix, formatNumber }: any) {
  return (
    <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-[32px] group transition-all hover:shadow-md">
      <CardContent className="p-8 space-y-8">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{title}</p>
          <p className="text-5xl font-black text-foreground tracking-tighter">{formatNumber ? formatNumber(currentValue) : currentValue.toLocaleString()}</p>
        </div>

        <div className={cn(
          "flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-border transition-colors",
          change.isNegative ? "bg-rose-500/5 border-rose-500/10" : "bg-emerald-500/5 border-emerald-500/10"
        )}>
          {change.isNegative ? (
            <TrendingDown className="h-4 w-4 text-rose-500" />
          ) : (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          )}
          <span className={cn(
            "text-xs font-black tracking-tight",
            change.isNegative ? "text-rose-600" : "text-emerald-600"
          )}>
            {change.isNegative ? '' : '+'}{change.diff} ({change.percent}%)
          </span>
          <span className="text-[9px] text-muted-foreground font-black uppercase whitespace-nowrap opacity-40">{vsPrefix || 'vs'} {prevMonthShort}</span>
        </div>

        <div className="pt-4 border-t border-border border-dashed">
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 opacity-50">{prevMonthLabel}</p>
          <p className="text-2xl font-black text-muted-foreground/30">{formatNumber ? formatNumber(prevValue) : prevValue.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ title, value, subtitle, icon: Icon, iconColor, iconBg, formatNumber }: any) {
  return (
    <Card className="border border-border shadow-sm bg-card flex items-center p-8 rounded-[32px] group hover:shadow-md transition-all">
      <div className="flex-1 space-y-0.5">
        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">{title}</p>
        <p className="text-4xl font-black text-foreground tracking-tighter">{formatNumber ? formatNumber(value) : value.toLocaleString()}</p>
        <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">{subtitle}</p>
      </div>
      <div className={cn("p-5 rounded-[24px] shadow-inner transition-transform group-hover:scale-110", iconBg)}>
        <Icon className={cn("h-8 w-8", iconColor)} strokeWidth={2.5} />
      </div>
    </Card>
  );
}

export default function PreviousPage() {
  return (
    <Suspense fallback={<div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>}>
      <PreviousContent />
    </Suspense>
  );
}
