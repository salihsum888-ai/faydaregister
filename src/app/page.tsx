'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Shield,
  Database,
  MessageSquare,
  Sparkles,
  Fingerprint,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Activity as ActivityIcon,
  Globe,
  Loader2,
  X,
  FileDigit,
  Building2,
  LineChart,
  Search,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, limit, query } from 'firebase/firestore';
import { DailyReport, Registration, SystemSettings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { FaydaIsometricScene } from '@/components/landing/fayda-isometric-scene';
import { useTranslation } from '@/i18n/language-provider';
import { cn } from '@/lib/utils';

const DEFAULT_LOGO =
  'https://services.eaes.et/NID-Logos/Fayda%20For%20Ethiopia%20logo-%20english-2-01.png';

export default function LandingPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t, locale, formatNumber, formatDate } = useTranslation();

  const [publicRid, setPublicRid] = useState('');
  const [isLookupOpen, setIsLookupOpen] = useState(false);

  const brandingRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'system_settings', 'branding');
  }, [db]);
  const { data: branding } = useDoc<SystemSettings>(brandingRef);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  // Live Firestore queries (active when signed in; zero mock data)
  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'registrations'), limit(5000));
  }, [db, user]);
  const { data: registrations, isLoading: isRegsLoading } =
    useCollection<Registration>(registrationsQuery);

  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'daily_reports'), limit(5000));
  }, [db, user]);
  const { data: reports } = useCollection<DailyReport>(reportsQuery);

  const usersQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'users'), limit(2000));
  }, [db, user]);
  const { data: officers } = useCollection<UserProfile>(usersQuery);

  const liveMetrics = useMemo(() => {
    const regs = registrations || [];
    const reps = reports || [];
    const offs = officers || [];

    const totalFromReports = reps.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const totalIntake = totalFromReports > 0 ? totalFromReports : regs.length;

    const processedCount = regs.filter((r) => r.status === 'Processed').length;
    const verifiedRate =
      regs.length > 0 ? Number(((processedCount / regs.length) * 100).toFixed(1)) : 0;

    const clusterSet = new Set<string>();
    offs.forEach((o) => {
      if (o.cluster?.trim()) clusterSet.add(o.cluster.trim());
      else if (o.region?.trim()) clusterSet.add(o.region.trim());
    });
    regs.forEach((r) => {
      if (r.location?.trim()) clusterSet.add(r.location.trim());
    });

    const instSet = new Set<string>();
    regs.forEach((r) => {
      const name = (r.institutionName || r.schoolName || '').trim();
      if (name) instSet.add(name);
    });
    reps.forEach((rep) => {
      const name = (rep.institutionName || rep.schoolName || '').trim();
      if (name) instSet.add(name);
    });

    const recentRecords = [...regs]
      .sort(
        (a, b) =>
          new Date(b.submissionDate || 0).getTime() - new Date(a.submissionDate || 0).getTime()
      )
      .slice(0, 4);

    return {
      totalIntake,
      processedCount,
      verifiedRate,
      activeClustersCount: clusterSet.size,
      institutionsCount: instSet.size,
      recentRecords,
    };
  }, [registrations, reports, officers]);

  const bureauName = branding?.bureauName || 'FaydaTrack';
  const logoUrl = branding?.logoUrl || DEFAULT_LOGO;
  const systemProtocol = branding?.systemProtocol || 'Protocol v4.2';
  const publicEnabled = branding?.publicLookupEnabled !== false;
  const portalHref = user ? (profile?.role === 'admin' ? '/admin' : '/dashboard') : '/login';

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = publicRid.trim();
    if (!trimmed) {
      toast({
        title: t('landing.toastRidRequiredTitle'),
        description: t('landing.toastRidRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }
    if (trimmed.length < 4) {
      toast({
        title: t('landing.toastRidIncompleteTitle'),
        description: t('landing.toastRidIncompleteDesc'),
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: t('landing.toastGatewayConnectedTitle'),
      description: t('landing.toastGatewayConnectedDesc', { rid: trimmed }),
      variant: 'info',
    });
    setIsLookupOpen(true);
  };

  return (
    <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] -mt-24 -mb-32 md:-mb-12 min-h-screen flex flex-col bg-[#E8EBF5] dark:bg-[#0B0F1E] text-[#0B1238] dark:text-slate-100 selection:bg-[#EC4899]/20 overflow-x-hidden">
      {/* =====================================================================
          SECTION 1: 3D ISOMETRIC ANIMATED FAYDA HERO
          Scoped strictly inside this hero section with zero debug controls
         ===================================================================== */}
      <section className="relative w-full min-h-[88vh] lg:min-h-[94vh] pt-24 lg:pt-28 pb-10 lg:pb-16 flex flex-col lg:justify-center overflow-hidden border-b border-white/60 dark:border-slate-800/80">
        {/* Left Hero Foreground Content */}
        <div className="relative z-20 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4 pb-2 lg:py-12 pointer-events-none">
          <div className="max-w-[540px] space-y-5 sm:space-y-6 pointer-events-auto">
            <div className="inline-flex flex-wrap items-center gap-2 text-xs font-semibold text-[#4B557E] dark:text-slate-400">
              <span className="text-[#EC4899] font-bold">{systemProtocol}</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-[#0B1238] dark:text-[#EC4899] shrink-0" />
                <span>{t('landing.heroBadge')}</span>
              </span>
            </div>

            <h1
              className={cn(
                'font-extrabold tracking-[-0.035em] text-[#0B1238] dark:text-white [text-wrap:balance]',
                locale === 'am'
                  ? 'text-[34px] sm:text-[48px] lg:text-[58px] leading-[1.15]'
                  : locale === 'om' || locale === 'so'
                  ? 'text-[32px] sm:text-[46px] lg:text-[56px] leading-[1.08]'
                  : 'text-[38px] sm:text-[54px] lg:text-[66px] leading-[1.02]'
              )}
            >
              {t('landing.heroTitleLine1')}
              <br />
              {t('landing.heroTitleLine2')}
              <br />
              {t('landing.heroTitleLine3')}
            </h1>

            <p className="text-[15px] sm:text-[17px] text-[#3B4468] dark:text-slate-300 leading-[1.65] font-normal max-w-[460px]">
              {t('landing.heroSubtitle', { bureau: bureauName })}
            </p>

            {/* White Pill RID Tracker Bar */}
            {publicEnabled && (
              <form onSubmit={handleLookup} className="w-full max-w-[490px] pt-1">
                <div className="flex items-center bg-white dark:bg-slate-900 rounded-full p-1.5 sm:p-2 pl-3.5 sm:pl-5 shadow-[0_18px_42px_rgba(15,23,42,0.09)] border border-white/95 dark:border-slate-800 focus-within:ring-2 focus-within:ring-[#EC4899]/35 transition-all">
                  <div className="flex items-center gap-1.5 sm:gap-2 pr-2 sm:pr-3 shrink-0">
                    <Fingerprint className="h-4 w-4 text-[#EC4899] shrink-0" />
                    <span className="text-[11.5px] sm:text-[13px] font-bold text-[#0B1238] dark:text-white whitespace-nowrap">
                      {t('landing.trackRidLabel')}
                    </span>
                  </div>

                  <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 shrink-0 mr-2 sm:mr-3" />

                  <input
                    type="text"
                    value={publicRid}
                    onChange={(e) => setPublicRid(e.target.value)}
                    placeholder={t('landing.ridPlaceholder')}
                    maxLength={29}
                    className="flex-1 min-w-0 bg-transparent text-[12px] sm:text-[13px] font-medium text-[#0B1238] dark:text-white placeholder:text-[#94A3B8] focus:outline-none"
                  />

                  {publicRid && (
                    <button
                      type="button"
                      onClick={() => setPublicRid('')}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white mr-1 cursor-pointer"
                      title={t('landing.clearRid')}
                      aria-label={t('landing.clearRid')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <span className="hidden sm:inline text-[10px] font-mono text-slate-400 tabular-nums mr-2.5 shrink-0">
                    {formatNumber(publicRid.length)}/{formatNumber(29)}
                  </span>

                  <button
                    type="submit"
                    aria-label={t('landing.trackRidAria')}
                    title={t('landing.trackRidAria')}
                    className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-gradient-to-tr from-[#EC4899] to-[#F43F85] hover:opacity-95 text-white flex items-center justify-center shrink-0 shadow-[0_6px_18px_rgba(236,72,153,0.38)] transition-transform active:scale-95 cursor-pointer"
                  >
                    <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                  </button>
                </div>
              </form>
            )}

            {/* Primary & Secondary Action Controls */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href={portalHref}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-[#0B1238] hover:bg-[#17235E] dark:bg-[#EC4899] dark:hover:bg-[#DB2777] text-white text-xs font-bold shadow-[0_10px_24px_rgba(11,18,56,0.2)] transition-all whitespace-nowrap shrink-0"
              >
                <span>
                  {user
                    ? profile?.role === 'admin'
                      ? t('landing.openCommandCenter')
                      : t('landing.openOfficerWorkspace')
                    : t('landing.officerTerminalLogin')}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
              <Link
                href="/full-registration"
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-white/90 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-800 text-[#0B1238] dark:text-white border border-white dark:border-slate-800 text-xs font-bold shadow-sm transition-all whitespace-nowrap shrink-0"
              >
                {t('landing.viewLiveRegistryPulse')}
              </Link>
            </div>
          </div>
        </div>

        {/* Single Unified 3D Isometric Scene Container (Scoped strictly to Hero Section) */}
        <div className="relative w-full h-[350px] sm:h-[430px] lg:absolute lg:inset-0 lg:h-full z-0 pointer-events-auto">
          <FaydaIsometricScene conveyorSpeedMultiplier={1} lightingPreset="sunlit" />
          {/* Desktop left readability gradient */}
          <div
            aria-hidden="true"
            className="hidden lg:block pointer-events-none absolute inset-y-0 left-0 w-[52%] bg-gradient-to-r from-[#E8EBF5]/92 via-[#E8EBF5]/55 to-transparent dark:from-[#0B0F1E]/95 dark:via-[#0B0F1E]/65"
          />
        </div>
      </section>

      {/* =====================================================================
          SECTION 2: ASYMMETRIC ARCHITECTURAL CAPABILITIES BENTO GRID (#capabilities)
         ===================================================================== */}
      <section id="capabilities" className="w-full py-16 lg:py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="max-w-2xl space-y-2.5">
              <p className="text-xs font-semibold text-[#EC4899] tracking-wide">
                {t('landing.capabilitiesEyebrow')}
              </p>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#0B1238] dark:text-white [text-wrap:balance]">
                {t('landing.capabilitiesTitle')}
              </h2>
              <p className="text-sm sm:text-base text-[#4B557E] dark:text-slate-400 leading-relaxed">
                {t('landing.capabilitiesSubtitle')}
              </p>
            </div>

            <Link
              href="/status-check"
              className="inline-flex items-center gap-2 text-xs font-bold text-[#0B1238] dark:text-white hover:text-[#EC4899] dark:hover:text-[#EC4899] transition-colors whitespace-nowrap shrink-0"
            >
              <span>{t('nav.statusCheck')}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Asymmetric Bento Grid — 4 High-Craft Architectural Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card 01 — Featured 7-Column Span: Real-Time Registry Ledger */}
            <Link
              href="/full-registration"
              className="lg:col-span-7 group relative rounded-[28px] bg-white dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 p-7 sm:p-9 flex flex-col justify-between gap-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0B1238]/25 dark:hover:border-[#EC4899]/40"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs font-semibold text-[#4B557E] dark:text-slate-400">
                    <span className="font-mono font-bold text-[#EC4899]">01</span>
                    <span aria-hidden="true">·</span>
                    <span>{t('nav.liveRegistry')}</span>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-[#0B1238] dark:bg-[#EC4899] text-white flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                    <Database className="h-5 w-5" />
                  </div>
                </div>

                <div className="space-y-2.5 max-w-xl">
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#0B1238] dark:text-white tracking-tight group-hover:text-[#EC4899] transition-colors">
                    {t('landing.cap1Title')}
                  </h3>
                  <p className="text-sm sm:text-[15px] text-[#4B557E] dark:text-slate-400 leading-relaxed">
                    {t('landing.cap1Desc')}
                  </p>
                </div>
              </div>

              <div className="pt-5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-[#4B557E] dark:text-slate-400 font-medium">
                  {user ? (
                    <>
                      <span className="font-mono font-bold text-[#0B1238] dark:text-white tabular-nums">
                        {formatNumber(liveMetrics.totalIntake)}
                      </span>
                      <span>·</span>
                      <span>{t('landing.dailyIntake')}</span>
                    </>
                  ) : (
                    <span>{t('landing.viewLiveRegistryPulse')}</span>
                  )}
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B1238] dark:text-white group-hover:text-[#EC4899] transition-colors whitespace-nowrap">
                  <span>{t('nav.liveRegistry')}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>

            {/* Card 02 — 5-Column Span: 29-Digit RID Triage & Scanner */}
            <Link
              href="/status-check"
              className="lg:col-span-5 group relative rounded-[28px] bg-[#0B1238] dark:bg-slate-900 text-white border border-[#0B1238] dark:border-slate-800 p-7 sm:p-9 flex flex-col justify-between gap-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#EC4899]/50"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs font-semibold text-slate-300">
                    <span className="font-mono font-bold text-[#EC4899]">02</span>
                    <span aria-hidden="true">·</span>
                    <span>{t('nav.statusCheck')}</span>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-white/10 text-[#EC4899] flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                    <Sparkles className="h-5 w-5" />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight group-hover:text-[#EC4899] transition-colors">
                    {t('landing.cap2Title')}
                  </h3>
                  <p className="text-sm sm:text-[15px] text-slate-300 leading-relaxed">
                    {t('landing.cap2Desc')}
                  </p>
                </div>
              </div>

              <div className="pt-5 border-t border-white/10 flex items-center justify-between gap-4">
                <span className="text-xs font-mono text-slate-300 tabular-nums">
                  29-Digit Fayda RID
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white group-hover:text-[#EC4899] transition-colors whitespace-nowrap">
                  <span>{t('nav.statusCheck')}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>

            {/* Card 03 — 5-Column Span: Partner Institutions & Schools Hub */}
            <Link
              href="/schools-students"
              className="lg:col-span-5 group relative rounded-[28px] bg-white dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 p-7 sm:p-9 flex flex-col justify-between gap-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0B1238]/25 dark:hover:border-[#EC4899]/40"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs font-semibold text-[#4B557E] dark:text-slate-400">
                    <span className="font-mono font-bold text-[#EC4899]">03</span>
                    <span aria-hidden="true">·</span>
                    <span>{t('nav.institutions')}</span>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-[#F4F5F8] dark:bg-slate-800 text-[#0B1238] dark:text-[#EC4899] flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                    <Building2 className="h-5 w-5" />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#0B1238] dark:text-white tracking-tight group-hover:text-[#EC4899] transition-colors">
                    {t('dashboard.cardInstTitle')}
                  </h3>
                  <p className="text-sm sm:text-[15px] text-[#4B557E] dark:text-slate-400 leading-relaxed">
                    {t('landing.footerInstitutions')} — {t('landing.capabilitiesSubtitle')}
                  </p>
                </div>
              </div>

              <div className="pt-5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-4">
                <span className="text-xs text-[#4B557E] dark:text-slate-400 font-medium">
                  {user
                    ? `${formatNumber(liveMetrics.institutionsCount)} ${t('nav.institutions')}`
                    : t('nav.institutions')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B1238] dark:text-white group-hover:text-[#EC4899] transition-colors whitespace-nowrap">
                  <span>{t('nav.institutions')}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>

            {/* Card 04 — Featured 7-Column Span: Tactical Field Coordination & Performance */}
            <Link
              href="/full-performance"
              className="lg:col-span-7 group relative rounded-[28px] bg-white dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 p-7 sm:p-9 flex flex-col justify-between gap-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0B1238]/25 dark:hover:border-[#EC4899]/40"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs font-semibold text-[#4B557E] dark:text-slate-400">
                    <span className="font-mono font-bold text-[#EC4899]">04</span>
                    <span aria-hidden="true">·</span>
                    <span>{t('nav.performance')}</span>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-[#F4F5F8] dark:bg-slate-800 text-[#0B1238] dark:text-[#EC4899] flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                </div>

                <div className="space-y-2.5 max-w-xl">
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#0B1238] dark:text-white tracking-tight group-hover:text-[#EC4899] transition-colors">
                    {t('landing.cap3Title')}
                  </h3>
                  <p className="text-sm sm:text-[15px] text-[#4B557E] dark:text-slate-400 leading-relaxed">
                    {t('landing.cap3Desc')}
                  </p>
                </div>
              </div>

              <div className="pt-5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-4">
                <span className="text-xs text-[#4B557E] dark:text-slate-400 font-medium">
                  {t('landing.viewPerformanceAnalytics')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B1238] dark:text-white group-hover:text-[#EC4899] transition-colors whitespace-nowrap">
                  <span>{t('nav.performance')}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 3: REAL LIVE BUREAU TELEMETRY & VERIFICATION GATEWAY (ZERO MOCK DATA)
         ===================================================================== */}
      <section className="w-full py-16 lg:py-24 border-t border-white/70 dark:border-slate-800/80 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-stretch">
            {/* Left Narrative & Direct Portal Action Cards */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-8">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#EC4899] tracking-wide">
                  {t('landing.reliabilityEyebrow')}
                </p>
                <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-[#0B1238] dark:text-white leading-[1.1] [text-wrap:balance]">
                  {t('landing.reliabilityTitle')}
                </h2>
                <p className="text-sm sm:text-base text-[#4B557E] dark:text-slate-400 leading-relaxed">
                  {t('landing.reliabilitySubtitle', { bureau: bureauName })}
                </p>
              </div>

              {/* Clean Architectural Portal Cards (Replaces old hardcoded 99.9% / <1.0s mock boxes) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link
                  href="/full-performance"
                  className="group p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-[#0B1238]/30 dark:hover:border-[#EC4899]/40 transition-all flex flex-col justify-between gap-4"
                >
                  <div className="h-9 w-9 rounded-xl bg-[#F4F5F8] dark:bg-slate-800 text-[#0B1238] dark:text-[#EC4899] flex items-center justify-center">
                    <LineChart className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B1238] dark:text-white group-hover:text-[#EC4899] transition-colors">
                      {t('nav.performance')}
                    </p>
                    <p className="text-xs text-[#4B557E] dark:text-slate-400 mt-0.5">
                      {t('landing.viewPerformanceAnalytics')}
                    </p>
                  </div>
                </Link>

                <Link
                  href="/status-check"
                  className="group p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-[#0B1238]/30 dark:hover:border-[#EC4899]/40 transition-all flex flex-col justify-between gap-4"
                >
                  <div className="h-9 w-9 rounded-xl bg-[#F4F5F8] dark:bg-slate-800 text-[#EC4899] flex items-center justify-center">
                    <Search className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B1238] dark:text-white group-hover:text-[#EC4899] transition-colors">
                      {t('nav.statusCheck')}
                    </p>
                    <p className="text-xs text-[#4B557E] dark:text-slate-400 mt-0.5">
                      {t('landing.verificationTerminalLink')}
                    </p>
                  </div>
                </Link>
              </div>
            </div>

            {/* Right Column: Real Live Bureau Ledger (When Signed In) OR Live Public RID Verification Gateway (When Signed Out) */}
            <div className="lg:col-span-7 flex">
              <div className="w-full rounded-[28px] border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between">
                {/* Top Header Bar */}
                <div className="px-6 py-4 bg-[#F8FAFC] dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-6 w-6 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shrink-0">
                      <Image
                        src={logoUrl}
                        alt={bureauName}
                        fill
                        sizes="24px"
                        className="object-contain p-0.5"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="text-xs font-bold text-[#0B1238] dark:text-white tracking-tight truncate">
                      {t('landing.ledgerTitle', { bureau: bureauName })}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {systemProtocol} · {t('landing.mfaEnforced')}
                  </span>
                </div>

                {user ? (
                  /* SIGNED-IN STATE: 100% REAL FIRESTORE DATA (ZERO MOCK NUMBERS OR SAMPLE RIDS) */
                  <div className="p-6 space-y-6 flex-1 flex flex-col justify-between">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                          {t('landing.dailyIntake')}
                        </p>
                        <p className="text-2xl font-mono font-extrabold text-[#0B1238] dark:text-white tabular-nums mt-1">
                          {isRegsLoading ? '—' : formatNumber(liveMetrics.totalIntake)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                          {t('landing.verifiedRate')}
                        </p>
                        <p className="text-2xl font-mono font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
                          {isRegsLoading ? '—' : `${formatNumber(liveMetrics.verifiedRate)}%`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                          {t('landing.activeClusters')}
                        </p>
                        <p className="text-2xl font-mono font-extrabold text-[#EC4899] tabular-nums mt-1 truncate">
                          {isRegsLoading
                            ? '—'
                            : t('landing.sectorsCount', {
                                count: formatNumber(liveMetrics.activeClustersCount),
                              })}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <span>{t('landing.recentEnrollmentStream')}</span>
                        <span>{t('landing.verificationState')}</span>
                      </div>

                      {isRegsLoading ? (
                        <div className="py-10 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-[#EC4899]" />
                        </div>
                      ) : liveMetrics.recentRecords.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {liveMetrics.recentRecords.map((rec) => (
                            <Link
                              key={rec.id}
                              href="/status-check"
                              className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 px-2 rounded-xl transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#0B1238] dark:text-white tabular-nums truncate">
                                  <FileDigit className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                                  <span className="truncate">{rec.id}</span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {rec.applicantName} ·{' '}
                                  {rec.institutionName || rec.schoolName || rec.location || '—'}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <span
                                  className={cn(
                                    'text-xs font-bold whitespace-nowrap',
                                    rec.status === 'Processed'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : rec.status === 'Rejected' || rec.status === 'Failed'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-blue-600 dark:text-blue-400'
                                  )}
                                >
                                  {t.common.status[rec.status] || rec.status}
                                </span>
                                {rec.submissionDate && (
                                  <p className="text-[11px] text-slate-400 tabular-nums">
                                    {formatDate(rec.submissionDate)}
                                  </p>
                                )}
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="py-10 text-center space-y-2">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {t('fullRegistration.noRecordsFound')}
                          </p>
                          <Link
                            href={portalHref}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#EC4899] hover:underline"
                          >
                            <span>{t('landing.openOfficerWorkspace')}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* SIGNED-OUT STATE: REAL INTERACTIVE VERIFICATION & OFFICER AUTH GATEWAY (ZERO MOCK DATA) */
                  <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between gap-6">
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#EC4899]">
                        <Lock className="h-3.5 w-3.5" />
                        <span>{t('landing.recentEnrollmentStream')}</span>
                      </div>
                      <h3 className="text-xl font-extrabold text-[#0B1238] dark:text-white tracking-tight">
                        {t('landing.modalTitle')}
                      </h3>
                      <p className="text-sm text-[#4B557E] dark:text-slate-400 leading-relaxed">
                        {t('landing.toastRidRequiredDesc')}
                      </p>
                    </div>

                    <form onSubmit={handleLookup} className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <div className="relative flex-1">
                          <Fingerprint className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#EC4899]" />
                          <input
                            type="text"
                            value={publicRid}
                            onChange={(e) => setPublicRid(e.target.value)}
                            placeholder={t('landing.ridPlaceholder')}
                            maxLength={29}
                            className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#F4F5F8] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-[#0B1238] dark:text-white placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EC4899]/40"
                          />
                        </div>
                        <button
                          type="submit"
                          className="h-11 px-5 rounded-xl bg-[#0B1238] hover:bg-[#17235E] dark:bg-[#EC4899] dark:hover:bg-[#DB2777] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <span>{t('landing.trackRidLabel')}</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </form>

                    <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        {t('landing.ctaSubtitle')}
                      </span>
                      <Link
                        href="/login"
                        className="inline-flex items-center gap-1.5 font-bold text-[#0B1238] dark:text-white hover:text-[#EC4899] transition-colors whitespace-nowrap"
                      >
                        <span>{t('landing.officerTerminalLogin')}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: INSTITUTIONAL DEPLOYMENT CTA
         ===================================================================== */}
      <section className="w-full py-12 lg:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto rounded-[32px] bg-[#0B1238] text-white p-8 sm:p-14 text-center space-y-6 shadow-[0_24px_60px_rgba(11,18,56,0.22)]">
          <div className="space-y-3 max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight [text-wrap:balance]">
              {t('landing.ctaTitle')}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {t('landing.ctaSubtitle')}
            </p>
          </div>
          <div>
            <Link
              href={portalHref}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white hover:bg-slate-100 text-[#0B1238] text-xs font-extrabold uppercase tracking-wider shadow-lg transition-all whitespace-nowrap"
            >
              <span>{user ? t('landing.ctaReturnWorkspace') : t('landing.ctaEnterHub')}</span>
              <ArrowRight className="h-4 w-4 text-[#EC4899] shrink-0" />
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 5: INSTITUTIONAL FOOTER
         ===================================================================== */}
      <footer className="w-full py-12 md:py-16 border-t border-white/80 dark:border-slate-800 mt-auto bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start mb-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F4F5F8] p-1">
                  <Image
                    src={logoUrl}
                    alt={bureauName}
                    fill
                    sizes="36px"
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className="text-lg font-extrabold tracking-tight text-[#0B1238] dark:text-white">
                  {bureauName}
                </span>
              </div>
              <p className="text-xs text-[#4B557E] dark:text-slate-400 max-w-xs leading-relaxed">
                {t('landing.footerDescription', { bureau: bureauName })}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B1238] dark:text-white">
                {t('landing.footerOperationalHub')}
              </p>
              <div className="space-y-2 text-xs text-[#4B557E] dark:text-slate-400">
                <div className="flex items-center gap-2.5">
                  <MapPin className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                  <span>{branding?.officeAddress || t('landing.footerDefaultAddress')}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <ActivityIcon className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                  <span>{branding?.operationalHours || t('landing.footerDefaultHours')}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 md:text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B1238] dark:text-white">
                {t('landing.footerSupportChannels')}
              </p>
              <div className="space-y-2 text-xs text-[#4B557E] dark:text-slate-400">
                {branding?.contactEmail && (
                  <div className="flex items-center md:justify-end gap-2.5">
                    <Mail className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                    <span>{branding.contactEmail}</span>
                  </div>
                )}
                {branding?.contactPhone && (
                  <div className="flex items-center md:justify-end gap-2.5">
                    <Phone className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                    <span className="tabular-nums">{branding.contactPhone}</span>
                  </div>
                )}
                {!branding?.contactEmail && !branding?.contactPhone && (
                  <Link
                    href="/support"
                    className="inline-flex items-center md:justify-end gap-2 text-xs font-bold text-[#EC4899] hover:underline"
                  >
                    <span>{t('nav.webSupport')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#4B557E] dark:text-slate-400">
            <p>
              {t('landing.footerSystemCopyright', {
                protocol: systemProtocol,
                year: formatNumber(new Date().getFullYear(), { useGrouping: false }),
                bureau: bureauName,
              })}
            </p>
            <div className="flex flex-wrap items-center gap-5 font-semibold">
              <Link
                href="/full-registration"
                className="hover:text-[#0B1238] dark:hover:text-white transition-colors"
              >
                {t('landing.footerPublicPulse')}
              </Link>
              <Link
                href="/status-check"
                className="hover:text-[#0B1238] dark:hover:text-white transition-colors"
              >
                {t('landing.footerVerification')}
              </Link>
              <Link
                href="/schools-students"
                className="hover:text-[#0B1238] dark:hover:text-white transition-colors"
              >
                {t('landing.footerInstitutions')}
              </Link>
              <Link
                href={portalHref}
                className="hover:text-[#0B1238] dark:hover:text-white transition-colors"
              >
                {t('landing.footerOfficerPortal')}
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* =====================================================================
          RESIDENT RID STATUS TRACKER MODAL
         ===================================================================== */}
      <Dialog open={isLookupOpen} onOpenChange={setIsLookupOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-5xl h-[86vh] p-0 overflow-hidden rounded-3xl border border-border shadow-2xl bg-popover flex flex-col">
          <DialogHeader className="p-4 sm:p-6 bg-muted/30 border-b border-border flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground tracking-tight leading-none">
                  {t('landing.modalTitle')}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  {t('landing.modalSubtitle')}
                  {publicRid ? ` · ${t('landing.modalTrackingRid', { rid: publicRid })}` : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 relative bg-card overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center -z-10">
              <div className="flex flex-col items-center gap-3 opacity-30">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-xs font-semibold text-muted-foreground">
                  {t('landing.modalConnecting')}
                </p>
              </div>
            </div>
            <iframe
              src={
                publicRid.trim()
                  ? `https://resident.fayda.et/status?rid=${encodeURIComponent(publicRid.trim())}`
                  : 'https://resident.fayda.et/status'
              }
              className="absolute inset-0 w-full h-full border-none"
              title={t('landing.modalTitle')}
              loading="lazy"
              allow="geolocation"
            />
          </div>

          <div className="px-4 sm:px-6 py-3 bg-muted/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="truncate">{t('landing.modalEncryptedSession')}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLookupOpen(false)}
              className="h-8 text-xs font-semibold shrink-0"
            >
              {t('landing.modalCloseTracker')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
