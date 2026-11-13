'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LifeBuoy,
  Wifi,
  WifiOff,
  Database,
  Video,
  Bell,
  Volume2,
  RotateCcw,
  RefreshCw,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Monitor,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';
import { UserProfile, WebSupportTicket } from '@/lib/types';
import { useTranslation } from '@/i18n/language-provider';
import { useToast } from '@/hooks/use-toast';
import {
  ensureRingtoneAudioUnlocked,
  playCallToneBurst,
} from '@/lib/call-ringtone';
import { cn } from '@/lib/utils';

const AFFECTED_PAGES = [
  'Dashboard / Home',
  'Full Performance / Intel Matrix',
  'Performance & Quality Audit',
  'Status Check (29-Digit RID)',
  'Full Registration Registry',
  'Institutions & Students',
  'Daily Telecom Reports',
  'Team Chat & Voice/Video Calls',
  'Meetings & Staff Exams',
  'Printing Queue',
  'Login / 2FA / Profile',
  'Other Page',
];

export default function WebSupportPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { t, locale, formatDate } = useTranslation();

  // Live Diagnostics State
  const [isOnline, setIsOnline] = useState(true);
  const [mediaStatus, setMediaStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'default'>('default');
  const [viewportInfo, setViewportInfo] = useState('');
  const [browserAgent, setBrowserAgent] = useState('');
  const [isCheckingDiag, setIsCheckingDiag] = useState(false);

  // Ticket Form State
  const [affectedPage, setAffectedPage] = useState(AFFECTED_PAGES[0]);
  const [category, setCategory] = useState<WebSupportTicket['category']>('PAGE_ERROR');
  const [severity, setSeverity] = useState<WebSupportTicket['severity']>('normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ticket List & Admin Resolution State
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'investigating' | 'resolved'>('all');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [statusDrafts, setStatusDrafts] = useState<
    Record<string, WebSupportTicket['status']>
  >({});

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

  const runDiagnostics = async () => {
    if (typeof window === 'undefined') return;
    setIsCheckingDiag(true);
    setIsOnline(navigator.onLine);
    setViewportInfo(`${window.innerWidth}×${window.innerHeight}`);
    setBrowserAgent(navigator.userAgent);

    if ('Notification' in window) {
      setNotifStatus(Notification.permission);
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const cam = await navigator.permissions.query({ name: 'camera' as PermissionName });
        const mic = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (cam.state === 'denied' || mic.state === 'denied') {
          setMediaStatus('denied');
        } else if (cam.state === 'granted' && mic.state === 'granted') {
          setMediaStatus('granted');
        } else {
          setMediaStatus('prompt');
        }
      } catch {
        // Fallback if browser doesn't support querying camera/microphone permission
      }
    }
    setTimeout(() => setIsCheckingDiag(false), 350);
  };

  useEffect(() => {
    void runDiagnostics();
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const ticketsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    if (isAdmin) {
      return query(collection(db, 'web_support_tickets'), limit(500));
    }
    return query(
      collection(db, 'web_support_tickets'),
      where('reporterId', '==', user.uid),
      limit(200)
    );
  }, [db, user?.uid, isAdmin]);

  const { data: rawTickets, isLoading: isTicketsLoading } =
    useCollection<WebSupportTicket>(ticketsQuery);

  const sortedTickets = useMemo(() => {
    const list = [...(rawTickets || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (statusFilter === 'all') return list;
    return list.filter((item) => item.status === statusFilter);
  }, [rawTickets, statusFilter]);

  const handleTestAudio = async () => {
    ensureRingtoneAudioUnlocked();
    await playCallToneBurst('incoming');
    toast({
      title: t.supportPage.toastTestAudioTitle,
      description: t.supportPage.toastTestAudioDesc,
    });
  };

  const handleRequestMedia = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      setMediaStatus('granted');
    } catch {
      setMediaStatus('denied');
    }
  };

  const handleRequestNotifications = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotifStatus(perm);
      } catch {
        setNotifStatus(Notification.permission);
      }
    }
  };

  const handleResetWebCache = () => {
    if (typeof window !== 'undefined') {
      // Preserve auth/MFA session keys while clearing any stale filter/UI keys
      const mfaVerified = sessionStorage.getItem('fayda_mfa_verified');
      const mfaUid = sessionStorage.getItem('fayda_mfa_verified_uid');
      sessionStorage.clear();
      if (mfaVerified) sessionStorage.setItem('fayda_mfa_verified', mfaVerified);
      if (mfaUid) sessionStorage.setItem('fayda_mfa_verified_uid', mfaUid);
    }
    void runDiagnostics();
    router.refresh();
    toast({
      title: t.supportPage.toastCacheClearedTitle,
      description: t.supportPage.toastCacheClearedDesc,
    });
  };

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user || !subject.trim() || !description.trim()) return;
    setIsSubmitting(true);

    const payload: Omit<WebSupportTicket, 'id'> = {
      reporterId: user.uid,
      reporterName: profile?.fullName || user.email?.split('@')[0] || 'Official',
      reporterEmail: user.email || '',
      reporterRole: profile?.role || 'officer',
      affectedPage,
      category,
      severity,
      status: 'open',
      subject: subject.trim(),
      description: description.trim(),
      diagnostics: {
        userAgent: browserAgent || 'Web Browser',
        viewport: viewportInfo || 'Standard',
        language: locale,
        online: isOnline,
        pathname: '/support',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addDocumentNonBlocking(collection(db, 'web_support_tickets'), payload);

    setSubject('');
    setDescription('');
    setIsSubmitting(false);

    toast({
      title: t.supportPage.toastTicketCreatedTitle,
      description: t.supportPage.toastTicketCreatedDesc,
    });
  };

  const handleAdminUpdateTicket = (ticket: WebSupportTicket) => {
    if (!db || !user || !isAdmin) return;
    const nextStatus = statusDrafts[ticket.id] || ticket.status;
    const nextReply =
      replyDrafts[ticket.id] !== undefined ? replyDrafts[ticket.id].trim() : ticket.adminReply || '';

    updateDocumentNonBlocking(doc(db, 'web_support_tickets', ticket.id), {
      status: nextStatus,
      adminReply: nextReply,
      resolvedByName: profile?.fullName || user.email || 'Administrator',
      updatedAt: new Date().toISOString(),
    });

    // Notify reporter in their in-app notifications
    if (ticket.reporterId) {
      addDocumentNonBlocking(collection(db, 'users', ticket.reporterId, 'notifications'), {
        title: `${t.supportPage.toastTicketUpdatedTitle}: ${ticket.subject}`,
        message: nextReply || `Status: ${nextStatus.toUpperCase()}`,
        type: nextStatus === 'resolved' ? 'success' : 'info',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    const localizedStatus =
      nextStatus === 'resolved'
        ? t.supportPage.statusResolved
        : nextStatus === 'investigating'
        ? t.supportPage.statusInvestigating
        : t.supportPage.statusOpen;

    toast({
      title: t.supportPage.toastTicketUpdatedTitle,
      description: t.supportPage.toastTicketUpdatedDesc.replace('{status}', localizedStatus),
    });
  };

  if (isUserLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.28em]">
              {t.supportPage.badge}
            </p>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none flex items-center gap-3">
            <LifeBuoy className="h-8 w-8 text-primary shrink-0" />
            <span>
              {t.supportPage.titleMain}{' '}
              <span className="text-primary">{t.supportPage.titleHighlight}</span>
            </span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">{t.supportPage.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={() => void runDiagnostics()}
            disabled={isCheckingDiag}
            className="clay-card h-10 px-4 rounded-xl text-xs font-bold"
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5 text-primary', isCheckingDiag && 'animate-spin')} />
            {t.supportPage.runCheckBtn}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleTestAudio()}
            className="clay-card h-10 px-4 rounded-xl text-xs font-bold"
          >
            <Volume2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
            {t.supportPage.testAudioBtn}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleResetWebCache}
            className="clay-card h-10 px-4 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t.supportPage.clearCacheBtn}
          </Button>
        </div>
      </div>

      {/* Live Web App Diagnostics Strip */}
      <Card className="clay-card rounded-[28px] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />
              {t.supportPage.diagTitle}
            </h2>
            <p className="text-xs text-muted-foreground">{t.supportPage.diagSubtitle}</p>
          </div>
          {viewportInfo && (
            <span className="text-[11px] font-mono font-bold text-muted-foreground bg-muted/50 px-3 py-1 rounded-xl">
              {viewportInfo} • {locale.toUpperCase()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Internet Connection */}
          <div className="clay-well p-4 rounded-2xl flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">
                {t.supportPage.connLabel}
              </p>
              <p
                className={cn(
                  'text-sm font-black',
                  isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                )}
              >
                {isOnline ? t.supportPage.connOnline : t.supportPage.connOffline}
              </p>
            </div>
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
                isOnline ? 'bg-emerald-500/15 text-emerald-600' : 'bg-rose-500/15 text-rose-600'
              )}
            >
              {isOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
            </div>
          </div>

          {/* 2. Database Sync */}
          <div className="clay-well p-4 rounded-2xl flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">
                {t.supportPage.dbSyncLabel}
              </p>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                {db ? t.supportPage.dbSynced : t.supportPage.connOffline}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Database className="h-5 w-5" />
            </div>
          </div>

          {/* 3. Camera & Microphone Permissions */}
          <div className="clay-well p-4 rounded-2xl flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">
                {t.supportPage.mediaPermLabel}
              </p>
              <p
                className={cn(
                  'text-xs font-black truncate',
                  mediaStatus === 'granted'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : mediaStatus === 'denied'
                    ? 'text-rose-600'
                    : 'text-amber-600 dark:text-amber-400'
                )}
              >
                {mediaStatus === 'granted'
                  ? t.supportPage.mediaGranted
                  : mediaStatus === 'denied'
                  ? t.supportPage.mediaDenied
                  : t.supportPage.mediaPrompt}
              </p>
              {mediaStatus !== 'granted' && (
                <button
                  type="button"
                  onClick={() => void handleRequestMedia()}
                  className="text-[10px] font-extrabold text-primary underline cursor-pointer"
                >
                  {t.supportPage.requestMediaBtn}
                </button>
              )}
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Video className="h-5 w-5" />
            </div>
          </div>

          {/* 4. Browser Notifications */}
          <div className="clay-well p-4 rounded-2xl flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">
                {t.supportPage.notifPermLabel}
              </p>
              <p
                className={cn(
                  'text-xs font-black truncate',
                  notifStatus === 'granted'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : notifStatus === 'denied'
                    ? 'text-rose-600'
                    : 'text-amber-600 dark:text-amber-400'
                )}
              >
                {notifStatus === 'granted'
                  ? t.supportPage.notifGranted
                  : notifStatus === 'denied'
                  ? t.supportPage.notifDenied
                  : t.supportPage.notifDefault}
              </p>
              {notifStatus !== 'granted' && (
                <button
                  type="button"
                  onClick={() => void handleRequestNotifications()}
                  className="text-[10px] font-extrabold text-primary underline cursor-pointer"
                >
                  {t.supportPage.requestNotifBtn}
                </button>
              )}
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="h-5 w-5" />
            </div>
          </div>
        </div>
      </Card>

      {/* Main Grid: Left = Report Web Issue + Quick Fix FAQ | Right = Reported Web Issues Tracker */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 space-y-6">
          {/* Report Web Issue Form */}
          <Card className="clay-card rounded-[28px] p-6">
            <CardHeader className="p-0 pb-5 border-b border-border/60">
              <CardTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                {t.supportPage.reportFormTitle}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{t.supportPage.reportFormSub}</p>
            </CardHeader>
            <CardContent className="p-0 pt-5">
              <form onSubmit={handleSubmitTicket} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">
                    {t.supportPage.affectedPageLabel}
                  </label>
                  <Select value={affectedPage} onValueChange={setAffectedPage}>
                    <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {AFFECTED_PAGES.map((pg) => (
                        <SelectItem key={pg} value={pg} className="text-xs font-medium">
                          {pg}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground">
                      {t.supportPage.categoryLabel}
                    </label>
                    <Select
                      value={category}
                      onValueChange={(v) => setCategory(v as WebSupportTicket['category'])}
                    >
                      <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="PAGE_ERROR" className="text-xs font-medium">
                          {t.supportPage.catPageError}
                        </SelectItem>
                        <SelectItem value="SYNC_DATA" className="text-xs font-medium">
                          {t.supportPage.catSyncData}
                        </SelectItem>
                        <SelectItem value="CALL_MEDIA" className="text-xs font-medium">
                          {t.supportPage.catCallMedia}
                        </SelectItem>
                        <SelectItem value="EXPORT_PRINT" className="text-xs font-medium">
                          {t.supportPage.catExportPrint}
                        </SelectItem>
                        <SelectItem value="UI_DISPLAY" className="text-xs font-medium">
                          {t.supportPage.catUiDisplay}
                        </SelectItem>
                        <SelectItem value="ACCOUNT_AUTH" className="text-xs font-medium">
                          {t.supportPage.catAccountAuth}
                        </SelectItem>
                        <SelectItem value="OTHER" className="text-xs font-medium">
                          {t.supportPage.catOther}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground">
                      {t.supportPage.severityLabel}
                    </label>
                    <Select
                      value={severity}
                      onValueChange={(v) => setSeverity(v as WebSupportTicket['severity'])}
                    >
                      <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="normal" className="text-xs font-medium">
                          {t.supportPage.sevNormal}
                        </SelectItem>
                        <SelectItem value="high" className="text-xs font-bold text-amber-600">
                          {t.supportPage.sevHigh}
                        </SelectItem>
                        <SelectItem value="critical" className="text-xs font-bold text-rose-600">
                          {t.supportPage.sevCritical}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">
                    {t.supportPage.subjectLabel}
                  </label>
                  <Input
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t.supportPage.subjectPlaceholder}
                    className="h-10 rounded-xl text-xs font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">
                    {t.supportPage.descLabel}
                  </label>
                  <Textarea
                    required
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t.supportPage.descPlaceholder}
                    className="rounded-xl text-xs font-medium"
                  />
                </div>

                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                  {t.supportPage.autoDiagNotice}
                </p>

                <Button
                  type="submit"
                  disabled={isSubmitting || !subject.trim() || !description.trim()}
                  className="w-full h-11 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold text-xs uppercase tracking-wider"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {isSubmitting ? t.supportPage.submittingBtn : t.supportPage.submitTicketBtn}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Common Web Issues Quick-Fix Guide */}
          <Card className="clay-card rounded-[28px] p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              {t.supportPage.faqTitle}
            </h3>
            <div className="space-y-3">
              {[
                { q: t.supportPage.faq1Q, a: t.supportPage.faq1A },
                { q: t.supportPage.faq2Q, a: t.supportPage.faq2A },
                { q: t.supportPage.faq3Q, a: t.supportPage.faq3A },
                { q: t.supportPage.faq4Q, a: t.supportPage.faq4A },
              ].map((item, idx) => (
                <div key={idx} className="clay-well p-3.5 rounded-2xl space-y-1">
                  <p className="text-xs font-extrabold text-foreground">{item.q}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Live Reported Web Issues & Admin Resolution Console */}
        <div className="xl:col-span-7">
          <Card className="clay-card rounded-[28px] p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  {isAdmin ? t.supportPage.ticketsTitleAdmin : t.supportPage.ticketsTitleUser}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.supportPage.ticketsSub.replace('{count}', String(sortedTickets.length))}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: t.supportPage.filterAll },
                    { id: 'open', label: t.supportPage.statusOpen },
                    { id: 'investigating', label: t.supportPage.statusInvestigating },
                    { id: 'resolved', label: t.supportPage.statusResolved },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer',
                      statusFilter === tab.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {isTicketsLoading ? (
              <div className="flex py-20 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary opacity-30" />
              </div>
            ) : sortedTickets.length === 0 ? (
              <div className="py-20 text-center space-y-2 opacity-60">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold uppercase tracking-widest">
                  {t.supportPage.emptyTickets}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedTickets.map((ticket) => {
                  const statusLabel =
                    ticket.status === 'resolved'
                      ? t.supportPage.statusResolved
                      : ticket.status === 'investigating'
                      ? t.supportPage.statusInvestigating
                      : t.supportPage.statusOpen;
                  const severityLabel =
                    ticket.severity === 'critical'
                      ? t.supportPage.sevCritical
                      : ticket.severity === 'high'
                      ? t.supportPage.sevHigh
                      : t.supportPage.sevNormal;

                  return (
                    <div
                      key={ticket.id}
                      className="clay-well p-4 sm:p-5 rounded-2xl space-y-3 border border-border/50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                                ticket.status === 'resolved'
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : ticket.status === 'investigating'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                              )}
                            >
                              {statusLabel}
                            </span>
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-md text-[10px] font-bold uppercase',
                                ticket.severity === 'critical'
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                  : ticket.severity === 'high'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                              )}
                            >
                              {severityLabel}
                            </span>
                            <span className="text-[11px] font-bold text-primary">
                              {ticket.affectedPage}
                            </span>
                          </div>
                          <h3 className="text-sm font-black text-foreground">{ticket.subject}</h3>
                        </div>

                        <div className="text-right text-[11px] text-muted-foreground">
                          <p className="font-bold text-foreground">{ticket.reporterName}</p>
                          <p>{formatDate(ticket.createdAt)}</p>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {ticket.description}
                      </p>

                      {ticket.diagnostics && (
                        <div className="text-[10px] font-mono text-muted-foreground bg-background/60 px-3 py-1.5 rounded-xl flex flex-wrap items-center gap-3">
                          <span>Screen: {ticket.diagnostics.viewport}</span>
                          <span>Lang: {ticket.diagnostics.language?.toUpperCase()}</span>
                          <span>
                            Network: {ticket.diagnostics.online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      )}

                      {/* Existing Admin Reply Display for Users */}
                      {!isAdmin && ticket.adminReply && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            {t.supportPage.adminReplyLabel}{' '}
                            {ticket.resolvedByName ? `(${ticket.resolvedByName})` : ''}
                          </p>
                          <p className="text-xs font-medium text-foreground">
                            {ticket.adminReply}
                          </p>
                        </div>
                      )}

                      {/* Admin Resolution Controls */}
                      {isAdmin && (
                        <div className="pt-3 border-t border-border/50 space-y-2.5">
                          <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground block">
                            {t.supportPage.adminReplyLabel}
                          </label>
                          <Textarea
                            rows={2}
                            value={
                              replyDrafts[ticket.id] !== undefined
                                ? replyDrafts[ticket.id]
                                : ticket.adminReply || ''
                            }
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({
                                ...prev,
                                [ticket.id]: e.target.value,
                              }))
                            }
                            placeholder={t.supportPage.adminReplyPlaceholder}
                            className="rounded-xl text-xs"
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Select
                              value={statusDrafts[ticket.id] || ticket.status}
                              onValueChange={(v) =>
                                setStatusDrafts((prev) => ({
                                  ...prev,
                                  [ticket.id]: v as WebSupportTicket['status'],
                                }))
                              }
                            >
                              <SelectTrigger className="h-9 w-[160px] rounded-xl text-xs font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value="open" className="text-xs font-bold">
                                  {t.supportPage.statusOpen}
                                </SelectItem>
                                <SelectItem value="investigating" className="text-xs font-bold">
                                  {t.supportPage.statusInvestigating}
                                </SelectItem>
                                <SelectItem value="resolved" className="text-xs font-bold">
                                  {t.supportPage.statusResolved}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleAdminUpdateTicket(ticket)}
                              className="h-9 px-4 rounded-xl bg-primary text-white text-xs font-bold"
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              {t.supportPage.saveReplyBtn}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
