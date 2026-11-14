'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useMemoFirebase, useFirestore, useUser, useDoc } from '@/firebase';
import { collection, query, limit, doc, serverTimestamp, orderBy, where } from 'firebase/firestore';
import { UserProfile, DailyReport, MonthlySummary } from '@/lib/types';
import { addDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { 
  ClipboardEdit, 
  History, 
  Loader2, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Search, 
  Clock, 
  User,
  ArrowRight,
  ShieldAlert,
  Zap
} from 'lucide-react';
import { logAuditAction } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useTranslation } from '@/i18n/language-provider';

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

const YEARS = Array.from({ length: 6 }, (_, i) => (new Date().getFullYear() - 2 + i).toString()).reverse();

export default function AdminReportsEntryPage() {
  const { t } = useTranslation();
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  // Daily Report Proxy State
  const [dailyOfficerId, setDailyOfficerId] = useState('');
  const [dailyDate, setDailyDate] = useState('');
  const [dailyEthio, setDailyEthio] = useState('0');
  const [dailySafaricom, setDailySafaricom] = useState('0');
  const [dailyRemarks, setDailyRemarks] = useState('');

  // Historical Proxy State
  const [histOfficerId, setHistOfficerId] = useState('');
  const [histMonth, setHistMonth] = useState('');
  const [histYear, setHistYear] = useState('');
  const [histEthio, setHistEthio] = useState('0');
  const [histSafaricom, setHistSafaricom] = useState('0');
  const [histProcessed, setHistProcessed] = useState('0');
  const [histRejected, setHistRejected] = useState('0');

  // Session Log state for recent entries
  const [sessionEntries, setSessionEntries] = useState<any[]>([]);

  useEffect(() => {
    const now = new Date();
    setDailyDate(now.toISOString().split('T')[0]);
    setHistMonth(MONTHS[now.getMonth()]);
    setHistYear(now.getFullYear().toString());
  }, []);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const officersQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'users'), limit(10000));
  }, [db, user]);
  const { data: officers, isLoading: isOfficersLoading } = useCollection<UserProfile>(officersQuery);

  // Load existing reports to check for duplicates and context
  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'daily_reports'), orderBy('date', 'desc'), limit(10000));
  }, [db, user]);
  const { data: existingReports } = useCollection<DailyReport>(reportsQuery);

  const officerDailyContext = useMemo(() => {
    if (!dailyOfficerId || !existingReports) return null;
    return existingReports.find(r => r.officerId === dailyOfficerId);
  }, [dailyOfficerId, existingReports]);

  const isDailyDuplicate = useMemo(() => {
    if (!dailyOfficerId || !dailyDate || !existingReports) return false;
    return existingReports.some(r => r.officerId === dailyOfficerId && r.date === dailyDate);
  }, [dailyOfficerId, dailyDate, existingReports]);

  const handleDailySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyOfficerId || !dailyDate || !db || !user) {
      toast({
        variant: 'destructive',
        title: t.adminReportsEntry.selectOfficerLabel,
        description: t.adminReportsEntry.selectOfficerPlaceholder,
      });
      return;
    }

    const actorName = profile?.fullName || user.displayName || user.email?.split('@')[0] || 'Administrator';
    const ethio = Math.max(0, parseInt(dailyEthio, 10) || 0);
    const safaricom = Math.max(0, parseInt(dailySafaricom, 10) || 0);
    const total = ethio + safaricom;
    const targetOfficer = officers?.find(o => o.id === dailyOfficerId);

    const reportData = {
      officerId: dailyOfficerId,
      date: dailyDate,
      ethioCount: ethio,
      safaricomCount: safaricom,
      total,
      remarks: `ADMIN PROXY: ${dailyRemarks.trim()}`,
      timestamp: serverTimestamp(),
    };

    addDocumentNonBlocking(collection(db, 'daily_reports'), reportData);

    logAuditAction(
      db, 
      user, 
      actorName,
      'STATUS_UPDATE', 
      dailyOfficerId, 
      `Logged proxy daily report for ${targetOfficer?.fullName || dailyOfficerId} on ${dailyDate}. Total: ${total}.`
    );

    setSessionEntries(prev => [{
      id: Date.now(),
      officer: targetOfficer?.fullName || dailyOfficerId,
      type: 'Daily',
      date: dailyDate,
      total
    }, ...prev]);

    toast({
      title: t.adminReportsEntry.toastDailyTitle,
      description: t.adminReportsEntry.toastDailyDesc.replace('{name}', targetOfficer?.fullName || ''),
    });
    
    setDailyEthio('0');
    setDailySafaricom('0');
    setDailyRemarks('');
  };

  const handleHistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!histOfficerId || !histMonth || !histYear || !db || !user) {
      toast({
        variant: 'destructive',
        title: t.adminReportsEntry.selectOfficerLabel,
        description: t.adminReportsEntry.selectOfficerPlaceholder,
      });
      return;
    }

    const actorName = profile?.fullName || user.displayName || user.email?.split('@')[0] || 'Administrator';
    const ethio = Math.max(0, parseInt(histEthio, 10) || 0);
    const safaricom = Math.max(0, parseInt(histSafaricom, 10) || 0);
    const total = ethio + safaricom;
    const targetOfficer = officers?.find(o => o.id === histOfficerId);

    const summaryData = {
      officerId: histOfficerId,
      month: histMonth,
      year: histYear,
      ethio,
      safaricom,
      total,
      processed: Math.max(0, parseInt(histProcessed, 10) || 0),
      rejected: Math.max(0, parseInt(histRejected, 10) || 0),
      timestamp: serverTimestamp(),
    };

    const summaryId = `${histOfficerId}_${histMonth}_${histYear}`;
    setDocumentNonBlocking(doc(db, 'monthly_summaries', summaryId), summaryData, { merge: true });

    logAuditAction(
      db, 
      user, 
      actorName,
      'STATUS_UPDATE', 
      summaryId, 
      `Archived historical proxy data for ${targetOfficer?.fullName || histOfficerId} (${histMonth} ${histYear}). Total Intake: ${total}.`
    );

    setSessionEntries(prev => [{
      id: Date.now(),
      officer: targetOfficer?.fullName || histOfficerId,
      type: 'Historical',
      date: `${histMonth} ${histYear}`,
      total
    }, ...prev]);

    toast({
      title: t.adminReportsEntry.toastMonthlyTitle,
      description: t.adminReportsEntry.toastMonthlyDesc
        .replace('{name}', targetOfficer?.fullName || '')
        .replace('{month}', histMonth)
        .replace('{year}', histYear),
    });
  };

  if (isOfficersLoading || !dailyDate) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  const sessionTotal = sessionEntries.reduce((acc, curr) => acc + curr.total, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t.adminReportsEntry.eyebrow}</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline uppercase leading-none">{t.adminReportsEntry.title}</h1>
          <p className="text-sm text-muted-foreground">{t.adminReportsEntry.subtitle}</p>
        </div>
        
        <div className="flex items-center gap-4 bg-card p-3 rounded-2xl border shadow-sm">
           <div className="flex items-center gap-3 px-4 border-r border-border">
              <div className="p-2 bg-primary/10 rounded-xl"><Activity className="h-4 w-4 text-primary" /></div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-tighter">{t.adminReportsEntry.sessionIntakeLabel}</span>
                <span className="text-sm font-black text-foreground">{t.adminReportsEntry.sessionRecordsSuffix.replace('{count}', String(sessionTotal))}</span>
              </div>
           </div>
           <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-emerald-500/10 rounded-xl"><User className="h-4 w-4 text-emerald-500" /></div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-tighter">{t.adminReportsEntry.unitsDigitizedLabel}</span>
                <span className="text-sm font-black text-foreground">{sessionEntries.length}</span>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 space-y-8">
          <Card className="border-none shadow-sm bg-card overflow-hidden rounded-[32px]">
            <CardHeader className="bg-muted/30 border-b border-border p-6 md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2 uppercase tracking-tight">
                    <ClipboardEdit className="h-5 w-5 text-primary" />
                    {t.adminReportsEntry.dailyCardTitle}
                  </CardTitle>
                  <CardDescription className="text-xs">{t.adminReportsEntry.dailyCardDesc}</CardDescription>
                </div>
                {isDailyDuplicate && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 text-rose-600 rounded-xl border border-rose-500/20 animate-in zoom-in duration-300">
                    <ShieldAlert className="h-4 w-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{t.adminReportsEntry.entryExistsBadge}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6 md:p-8">
              <form onSubmit={handleDailySubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.adminReportsEntry.selectOfficerLabel}</Label>
                      <Select value={dailyOfficerId} onValueChange={setDailyOfficerId}>
                        <SelectTrigger className="h-12 bg-background border-border rounded-xl font-bold">
                          <SelectValue placeholder={t.adminReportsEntry.selectOfficerPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {officers?.map(o => (
                            <SelectItem key={o.id} value={o.id} className="font-bold">{o.fullName} ({o.region})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {officerDailyContext && (
                      <div className="p-4 bg-primary/[0.03] border border-primary/10 rounded-2xl space-y-2 animate-in fade-in slide-in-from-top-1">
                        <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-1.5">
                          <Zap className="h-3 w-3" /> {t.adminReportsEntry.unitContextBadge}
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                           <div>
                             <p className="text-[8px] font-bold text-muted-foreground uppercase">{t.adminReportsEntry.lastLoggedLabel}</p>
                             <p className="text-xs font-black text-foreground">{officerDailyContext.date}</p>
                           </div>
                           <div>
                             <p className="text-[8px] font-bold text-muted-foreground uppercase">{t.adminReportsEntry.lastIntakeLabel}</p>
                             <p className="text-xs font-black text-foreground">{t.adminReportsEntry.unitsSuffix.replace('{count}', String(officerDailyContext.total))}</p>
                           </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.adminReportsEntry.reportingDateLabel}</Label>
                      <Input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} className={cn("h-12 bg-background border-border rounded-xl font-bold", isDailyDuplicate && "border-rose-500/50")} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider ml-1">{t.adminReportsEntry.ethioLabel}</Label>
                        <Input type="number" min={0} value={dailyEthio} onFocus={e => e.currentTarget.select()} onChange={e => setDailyEthio(e.target.value)} className="h-12 bg-background border-border rounded-xl font-black text-emerald-600" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider ml-1">{t.adminReportsEntry.safaricomLabel}</Label>
                        <Input type="number" min={0} value={dailySafaricom} onFocus={e => e.currentTarget.select()} onChange={e => setDailySafaricom(e.target.value)} className="h-12 bg-background border-border rounded-xl font-black text-orange-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="flex-1 w-full space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.adminReportsEntry.sessionNotesLabel}</Label>
                    <Textarea value={dailyRemarks} onChange={e => setDailyRemarks(e.target.value)} placeholder={t.adminReportsEntry.sessionNotesPlaceholder} className="resize-none min-h-[100px] bg-background border-border rounded-2xl text-xs font-medium" />
                  </div>
                  <div className="w-full md:w-64 space-y-4">
                    <div className="p-6 bg-muted/50 rounded-[28px] border border-border text-center shadow-inner">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">{t.adminReportsEntry.calculatedIntakeLabel}</p>
                      <p className="text-5xl font-black text-foreground tracking-tighter">
                        {Math.max(0, parseInt(dailyEthio, 10) || 0) + Math.max(0, parseInt(dailySafaricom, 10) || 0)}
                      </p>
                    </div>
                    <Button type="submit" disabled={isDailyDuplicate || !dailyOfficerId} className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/10 transition-all active:scale-[0.98]">
                      <Save className="mr-2 h-4 w-4" /> {t.adminReportsEntry.commitProtocolBtn}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-card overflow-hidden rounded-[32px]">
            <CardHeader className="bg-muted/30 border-b border-border p-6 md:p-8">
              <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2 uppercase tracking-tight">
                <History className="h-5 w-5 text-amber-500" />
                {t.adminReportsEntry.monthlyCardTitle}
              </CardTitle>
              <CardDescription className="text-xs">{t.adminReportsEntry.monthlyCardDesc}</CardDescription>
            </CardHeader>
            <CardContent className="p-6 md:p-8">
              <form onSubmit={handleHistSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.adminReportsEntry.officerProfileLabel}</Label>
                    <Select value={histOfficerId} onValueChange={setHistOfficerId}>
                      <SelectTrigger className="h-12 bg-background border-border rounded-xl font-bold">
                        <SelectValue placeholder={t.adminReportsEntry.selectOfficerPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {officers?.map(o => (
                          <SelectItem key={o.id} value={o.id} className="font-bold">{o.fullName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.adminReportsEntry.reportingPeriodLabel}</Label>
                    <div className="flex gap-2">
                      <Select value={histMonth} onValueChange={setHistMonth}>
                        <SelectTrigger className="h-12 bg-background border-border rounded-xl font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map(m => <SelectItem key={m} value={m} className="font-bold">{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={histYear} onValueChange={setHistYear}>
                        <SelectTrigger className="h-12 bg-background border-border rounded-xl font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YEARS.map(y => <SelectItem key={y} value={y} className="font-bold">{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <ProxyField label={t.adminReportsEntry.ethioIntakeField} value={histEthio} onChange={setHistEthio} color="emerald" />
                  <ProxyField label={t.adminReportsEntry.safaricomIntakeField} value={histSafaricom} onChange={setHistSafaricom} color="orange" />
                  <ProxyField label={t.adminReportsEntry.processedField} value={histProcessed} onChange={setHistProcessed} color="blue" />
                  <ProxyField label={t.adminReportsEntry.rejectedField} value={histRejected} onChange={setHistRejected} color="rose" />
                </div>

                <div className="flex items-center justify-between p-6 bg-amber-500/5 border border-amber-500/10 rounded-[28px]">
                   <div className="space-y-0.5">
                     <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{t.adminReportsEntry.calculatedAggregateLabel}</p>
                     <p className="text-3xl font-black text-amber-700">
                        {Math.max(0, parseInt(histEthio, 10) || 0) + Math.max(0, parseInt(histSafaricom, 10) || 0)}
                     </p>
                   </div>
                   <Button type="submit" disabled={!histOfficerId} className="h-14 px-10 bg-amber-600 hover:bg-amber-700 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-amber-600/10 transition-all active:scale-[0.98]">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> {t.adminReportsEntry.finalizeArchiveBtn}
                   </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-4 space-y-6">
          <Card className="border border-border bg-card overflow-hidden rounded-[32px] shadow-sm h-full">
            <CardHeader className="bg-muted/30 border-b border-border py-4">
              <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                <Clock className="h-3 w-3" /> {t.adminReportsEntry.liveSessionTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sessionEntries.length > 0 ? (
                <div className="divide-y divide-border">
                   {sessionEntries.map((entry) => (
                     <div key={entry.id} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors animate-in slide-in-from-right-4 duration-500">
                        <div className="space-y-1">
                           <p className="text-xs font-black text-foreground uppercase tracking-tight line-clamp-1">{entry.officer}</p>
                           <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-[8px] font-black uppercase px-1.5 py-0.5 rounded",
                                entry.type === 'Daily' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600'
                              )}>
                                {entry.type === 'Daily' ? t.adminReportsEntry.typeDaily : t.adminReportsEntry.typeHistorical}
                              </span>
                              <span className="text-[8px] font-bold text-muted-foreground uppercase">{entry.date}</span>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-sm font-black text-foreground tabular-nums">{entry.total}</p>
                           <p className="text-[7px] font-black text-muted-foreground uppercase tracking-widest">{t.adminReportsEntry.unitsShort}</p>
                        </div>
                     </div>
                   ))}
                </div>
              ) : (
                <div className="py-40 flex flex-col items-center justify-center text-center px-8 opacity-20">
                  <Activity className="h-12 w-12 mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] leading-relaxed">
                    {t.adminReportsEntry.emptySessionText1} <br/> {t.adminReportsEntry.emptySessionText2}
                  </p>
                </div>
              )}
            </CardContent>
            {sessionEntries.length > 0 && (
              <div className="p-4 border-t border-border bg-muted/10">
                <Button variant="ghost" onClick={() => setSessionEntries([])} className="w-full h-10 font-bold text-[9px] uppercase tracking-widest text-muted-foreground hover:text-rose-500">
                   {t.adminReportsEntry.clearSessionBtn}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
      
      <div className="p-6 bg-primary/[0.03] border border-primary/10 rounded-[32px] flex items-center gap-4">
        <ShieldAlert className="h-6 w-6 text-primary shrink-0 opacity-40" />
        <p className="text-[10px] text-foreground font-bold uppercase leading-relaxed tracking-widest max-w-5xl">
          {t.adminReportsEntry.footerNotice}
        </p>
      </div>
    </div>
  );
}


function ProxyField({ label, value, onChange, color }: any) {
  const colorClasses: any = {
    emerald: "focus-within:border-emerald-500/50 text-emerald-600",
    orange: "focus-within:border-orange-500/50 text-orange-600",
    blue: "focus-within:border-blue-500/50 text-blue-600",
    rose: "focus-within:border-rose-500/50 text-rose-600",
  };

  return (
    <div className={cn("p-4 bg-muted/50 rounded-2xl border border-border transition-all", colorClasses[color])}>
      <Label className="text-[8px] font-black uppercase tracking-tighter text-muted-foreground mb-1 block">{label}</Label>
      <Input 
        type="number" 
        min={0}
        value={value} 
        onFocus={e => e.currentTarget.select()}
        onChange={e => onChange(e.target.value)} 
        className="h-8 border-none bg-transparent p-0 text-lg font-black focus-visible:ring-0 tabular-nums" 
      />
    </div>
  );
}
