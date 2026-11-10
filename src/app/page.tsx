'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Shield,
  Zap,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { SystemSettings, UserProfile } from '@/lib/types';
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
  const { t, locale, formatNumber } = useTranslation();

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

            {/* White Pill RID Tracker Bar matching reference design */}
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

            {/* Primary & Secondary Action Pills */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href={portalHref}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-[#0B1238] hover:bg-[#17235E] dark:bg-[#EC4899] dark:hover:bg-[#DB2777] text-white text-xs font-bold shadow-[0_10px_24px_rgba(11,18,56,0.2)] transition-all"
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
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-white/90 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-800 text-[#0B1238] dark:text-white border border-white dark:border-slate-800 text-xs font-bold shadow-sm transition-all"
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
          SECTION 2: OPERATIONAL ARCHITECTURE & CORE CAPABILITIES (#capabilities)
         ===================================================================== */}
      <section id="capabilities" className="w-full py-16 lg:py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12 space-y-2.5">
            <p className="text-xs font-bold text-[#EC4899] uppercase tracking-widest">
              {t('landing.capabilitiesEyebrow')}
            </p>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#0B1238] dark:text-white [text-wrap:balance]">
              {t('landing.capabilitiesTitle')}
            </h2>
            <p className="text-sm sm:text-base text-[#4B557E] dark:text-slate-400 leading-relaxed">
              {t('landing.capabilitiesSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InfoCard
              number="01"
              title={t('landing.cap1Title')}
              description={t('landing.cap1Desc')}
              icon={Database}
            />
            <InfoCard
              number="02"
              title={t('landing.cap2Title')}
              description={t('landing.cap2Desc')}
              icon={Sparkles}
            />
            <InfoCard
              number="03"
              title={t('landing.cap3Title')}
              description={t('landing.cap3Desc')}
              icon={MessageSquare}
            />
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 3: BUREAU ACCURACY & LIVE TERMINAL PREVIEW
         ===================================================================== */}
      <section className="w-full py-16 lg:py-24 border-t border-white/70 dark:border-slate-800/80 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-5 space-y-7">
              <div className="space-y-3.5">
                <p className="text-xs font-bold text-[#EC4899] uppercase tracking-widest">
                  {t('landing.reliabilityEyebrow')}
                </p>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0B1238] dark:text-white leading-[1.1] [text-wrap:balance]">
                  {t('landing.reliabilityTitle')}
                </h2>
                <p className="text-sm sm:text-base text-[#4B557E] dark:text-slate-400 leading-relaxed">
                  {t('landing.reliabilitySubtitle', { bureau: bureauName })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <StatBox
                  label={t('landing.statUptimeLabel')}
                  value={`${formatNumber(99.9)}%`}
                  icon={ShieldCheck}
                />
                <StatBox
                  label={t('landing.statLatencyLabel')}
                  value={`< ${formatNumber(1.0)}s`}
                  icon={Zap}
                />
              </div>

              <div className="pt-1 flex flex-wrap items-center gap-3">
                <Link
                  href="/full-performance"
                  className="px-6 py-3 rounded-full bg-white dark:bg-slate-900 hover:bg-slate-50 text-[#0B1238] dark:text-white border border-white dark:border-slate-800 shadow-sm text-xs font-bold transition-all"
                >
                  {t('landing.viewPerformanceAnalytics')}
                </Link>
                <Link
                  href="/status-check"
                  className="px-5 py-3 rounded-full text-xs font-bold text-[#4B557E] dark:text-slate-300 hover:text-[#0B1238] dark:hover:text-white transition-colors"
                >
                  {t('landing.verificationTerminalLink')}
                </Link>
              </div>
            </div>

            {/* Interactive Live Terminal Preview Card */}
            <div className="lg:col-span-7">
              <div className="rounded-[28px] border border-white/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_20px_50px_rgba(15,23,42,0.07)] overflow-hidden">
                <div className="px-5 sm:px-6 py-4 bg-[#F8FAFC] dark:bg-slate-800/60 border-b border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
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

                <div className="p-5 sm:p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl bg-[#F4F5F8] dark:bg-slate-800/50">
                      <p className="text-[10px] font-bold text-slate-500 uppercase truncate">
                        {t('landing.dailyIntake')}
                      </p>
                      <p className="text-xl font-mono font-extrabold text-[#0B1238] dark:text-white tabular-nums mt-0.5">
                        {formatNumber(1428)}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#F4F5F8] dark:bg-slate-800/50">
                      <p className="text-[10px] font-bold text-slate-500 uppercase truncate">
                        {t('landing.verifiedRate')}
                      </p>
                      <p className="text-xl font-mono font-extrabold text-[#2EB85C] tabular-nums mt-0.5">
                        {formatNumber(94.2)}%
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#F4F5F8] dark:bg-slate-800/50">
                      <p className="text-[10px] font-bold text-slate-500 uppercase truncate">
                        {t('landing.activeClusters')}
                      </p>
                      <p className="text-xl font-mono font-extrabold text-[#EC4899] tabular-nums mt-0.5 truncate">
                        {t('landing.sectorsCount', { count: formatNumber(18) })}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#F8FAFC] dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span className="truncate">{t('landing.recentEnrollmentStream')}</span>
                      <span className="shrink-0">{t('landing.verificationState')}</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {[
                        {
                          rid: '29481057392048192837461029384',
                          region: t('landing.sampleRegion1'),
                          status: t('common.status.Processed'),
                          tone: 'text-[#2EB85C]',
                        },
                        {
                          rid: '83920194857362514029384756102',
                          region: t('landing.sampleRegion2'),
                          status: t('common.status.Processing'),
                          tone: 'text-[#0066FF]',
                        },
                        {
                          rid: '56473829102938475610293847561',
                          region: t('landing.sampleRegion3'),
                          status: t('common.status.Processed'),
                          tone: 'text-[#2EB85C]',
                        },
                      ].map((row) => (
                        <div
                          key={row.rid}
                          className="px-4 py-3 flex items-center justify-between gap-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#0B1238] dark:text-white tabular-nums truncate">
                              <FileDigit className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                              <span>{row.rid.slice(0, 18)}...</span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {row.region}
                            </p>
                          </div>
                          <span className={`text-[11px] font-bold whitespace-nowrap shrink-0 ${row.tone}`}>
                            {row.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
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
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              {t('landing.ctaTitle')}
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {t('landing.ctaSubtitle')}
            </p>
          </div>
          <div>
            <Link
              href={portalHref}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white hover:bg-slate-100 text-[#0B1238] text-xs font-extrabold uppercase tracking-wider shadow-lg transition-all"
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
                <div className="flex items-center md:justify-end gap-2.5">
                  <Mail className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                  <span>{branding?.contactEmail || 'support@bureau.gov'}</span>
                </div>
                <div className="flex items-center md:justify-end gap-2.5">
                  <Phone className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                  <span className="tabular-nums">{branding?.contactPhone || '+251 ...'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#4B557E] dark:text-slate-400">
            <p>
              {t('landing.footerSystemCopyright', {
                protocol: systemProtocol,
                year: formatNumber(2026, { useGrouping: false }),
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

function InfoCard({
  number,
  title,
  description,
  icon: Icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: any;
}) {
  return (
    <div className="p-7 sm:p-8 rounded-[28px] bg-white dark:bg-slate-900 border border-white/95 dark:border-slate-800 shadow-[0_14px_38px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(15,23,42,0.09)] group">
      <div className="flex items-center justify-between mb-6">
        <div className="p-3 rounded-2xl bg-[#F4F5F8] dark:bg-slate-800 text-[#0B1238] dark:text-[#EC4899] group-hover:bg-[#0B1238] group-hover:text-white transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-xs font-mono font-bold text-slate-400 tabular-nums">{number}</span>
      </div>
      <div className="space-y-2.5">
        <h3 className="text-lg font-extrabold text-[#0B1238] dark:text-white tracking-tight">
          {number}. {title}
        </h3>
        <p className="text-sm text-[#4B557E] dark:text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-3.5 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-white/95 dark:border-slate-800 shadow-[0_10px_28px_rgba(15,23,42,0.05)] min-w-0">
      <div className="p-2.5 bg-[#F4F5F8] dark:bg-slate-800 rounded-xl text-[#EC4899] shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-mono font-extrabold text-[#0B1238] dark:text-white tracking-tight tabular-nums truncate">
          {value}
        </p>
        <p className="text-xs font-medium text-[#4B557E] dark:text-slate-400 truncate">{label}</p>
      </div>
    </div>
  );
}
