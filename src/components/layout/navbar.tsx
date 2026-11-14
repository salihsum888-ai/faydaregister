"use client"

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  FileCheck, 
  Database, 
  Bell, 
  Trophy,
  LogOut,
  Users,
  Megaphone,
  CalendarPlus,
  MessageSquare,
  FilePenLine,
  Sun,
  Moon,
  Settings,
  Search,
  Activity,
  TrendingUp,
  Printer,
  ShieldCheck,
  History,
  ChevronDown,
  ChevronsUpDown,
  LineChart,
  MoreHorizontal,
  ClipboardList,
  LayoutGrid,
  Home,
  Building2,
  GraduationCap,
  PhoneIncoming,
  Video,
  Volume2,
  VolumeX,
  Menu,
  ArrowRight,
  LifeBuoy,
  Smartphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth, useUser, useDoc, useMemoFirebase, useFirestore, useCollection } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { signOut } from 'firebase/auth';
import { doc, collection, query, where } from 'firebase/firestore';
import { UserProfile, Notification, SystemSettings, Conversation } from '@/lib/types';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTranslation } from '@/i18n/language-provider';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import {
  ensureRingtoneAudioUnlocked,
  playCallToneBurst,
  showIncomingCallSystemNotification,
  clearIncomingCallSystemNotification,
} from '@/lib/call-ringtone';

const DEFAULT_LOGO = "https://services.eaes.et/NID-Logos/Fayda%20For%20Ethiopia%20logo-%20english-2-01.png";

export function Navbar() {
  const pathname = usePathname();
  const { user } = useUser();
  const db = useFirestore();
  const auth = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { t, formatNumber } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isPublicMenuOpen, setIsPublicMenuOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isGlobalRingtoneMuted, setIsGlobalRingtoneMuted] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    setMounted(true);
    ensureRingtoneAudioUnlocked();
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setIsNavVisible(false);
      } else {
        setIsNavVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

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

  // Real-Time Internet Presence Heartbeat & Last Seen Sync
  useEffect(() => {
    if (!db || !user?.uid) return;
    const uid = user.uid;
    const userRef = doc(db, 'users', uid);

    const markOnline = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      updateDocumentNonBlocking(userRef, {
        isOnline: true,
        lastSeenAt: new Date().toISOString(),
      });
    };

    const markOffline = () => {
      updateDocumentNonBlocking(userRef, {
        isOnline: false,
        lastSeenAt: new Date().toISOString(),
      });
    };

    markOnline();

    const heartbeatTimer = setInterval(() => {
      markOnline();
    }, 35_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        markOnline();
      }
    };

    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    window.addEventListener('pagehide', markOffline);
    window.addEventListener('beforeunload', markOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(heartbeatTimer);
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('pagehide', markOffline);
      window.removeEventListener('beforeunload', markOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [db, user?.uid]);

  const unreadNotificationsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'users', user.uid, 'notifications'), 
      where('isRead', '==', false)
    );
  }, [db, user?.uid]);

  const { data: unreadNotifications } = useCollection<Notification>(unreadNotificationsQuery);

  const userConvsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'conversations'),
      where('members', 'array-contains', user.uid)
    );
  }, [db, user?.uid]);
  const { data: userConversations } = useCollection<Conversation>(userConvsQuery);

  const unreadChatCount = useMemo(() => {
    if (!userConversations || !user?.uid) return 0;
    const getTs = (d: any) => {
      if (!d) return 0;
      if (typeof d === 'string') return new Date(d).getTime();
      if (d.toDate) return d.toDate().getTime();
      return new Date(d).getTime();
    };
    const profileReadTs = profile?.lastMessageReadAt ? getTs(profile.lastMessageReadAt) : 0;
    return userConversations.filter((c) => {
      if (c.isMeetingRoom) return false;
      if (c.lastSenderId && c.lastSenderId === user.uid) return false;
      const lastMsgTs = getTs(c.lastTimestamp);
      if (!lastMsgTs) return false;
      const convReadTs = c.lastReadBy?.[user.uid] ? getTs(c.lastReadBy[user.uid]) : 0;
      const effectiveReadTs = Math.max(convReadTs, profileReadTs);
      return lastMsgTs > effectiveReadTs;
    }).length;
  }, [userConversations, user?.uid, profile?.lastMessageReadAt]);

  const incomingRingingConv = useMemo(() => {
    if (!userConversations || !user?.uid || pathname === '/communication') return null;
    return userConversations.find((c) => {
      const call = c.activeCall;
      if (!call) return false;
      if (call.status !== 'ringing' && call.status !== 'active') return false;
      if (call.callerId === user.uid) return false;
      if (call.activeParticipantIds?.includes(user.uid)) return false;
      return true;
    });
  }, [userConversations, user?.uid, pathname]);

  const incomingCallId = incomingRingingConv?.activeCall?.id;

  useEffect(() => {
    const call = incomingRingingConv?.activeCall;
    if (!call || !incomingCallId || pathname === '/communication') {
      clearIncomingCallSystemNotification();
      return;
    }

    const notifTitle =
      call.callType === 'video' ? t('nav.incomingVideoCall') : t('nav.incomingVoiceCall');
    const notifBody = [call.callerName, call.conversationName].filter(Boolean).join(' • ');

    showIncomingCallSystemNotification({
      callId: incomingCallId,
      title: notifTitle,
      body: notifBody,
      onActivate: () => {
        router.push('/communication');
      },
    });

    if (isGlobalRingtoneMuted) {
      return;
    }

    void playCallToneBurst('incoming');
    const iv = setInterval(() => {
      showIncomingCallSystemNotification({
        callId: incomingCallId,
        title: notifTitle,
        body: notifBody,
        onActivate: () => {
          router.push('/communication');
        },
      });
      void playCallToneBurst('incoming');
    }, 2100);
    return () => clearInterval(iv);
  }, [incomingRingingConv, incomingCallId, isGlobalRingtoneMuted, pathname, router, t]);

  if (pathname === '/login') return null;

  const isAdmin = profile?.role === 'admin';

  const PRIMARY_NAV = [
    { name: t('nav.home'), href: isAdmin ? '/admin' : '/dashboard', icon: LayoutGrid },
    { name: t('nav.institutions'), href: '/schools-students', icon: Building2 },
    { name: t('nav.intel'), href: '/full-performance', icon: LineChart },
    { name: t('nav.fullRecord'), href: '/full-registration', icon: Activity },
    { name: t('nav.chat'), href: '/communication', icon: MessageSquare },
  ];

  const PUBLIC_NAV = [
    { name: t('nav.overview'), href: '/#capabilities', icon: LayoutGrid },
    { name: t('nav.statusCheck'), href: '/status-check', icon: Search },
    { name: t('nav.liveRegistry'), href: '/full-registration', icon: Activity },
    { name: t('nav.institutions'), href: '/schools-students', icon: Building2 },
    { name: t('nav.performance'), href: '/full-performance', icon: LineChart },
  ];

  const MOBILE_NAV = [
    { name: t('nav.home'), href: isAdmin ? '/admin' : '/dashboard', icon: Home },
    { name: t('nav.institutions'), href: '/schools-students', icon: Building2 },
    { name: t('nav.intel'), href: '/full-performance', icon: LineChart },
    { name: t('nav.fullRecord'), href: '/full-registration', icon: Activity },
  ];

  const SECONDARY_NAV = isAdmin ? [
    { name: t('nav.meetingsExams'), href: '/meetings', icon: GraduationCap },
    { name: t('nav.audit'), href: '/admin/audit-ledger', icon: ShieldCheck },
    { name: t('nav.performance'), href: '/performance', icon: TrendingUp },
    { name: t('nav.comparison'), href: '/previous', icon: History },
    { name: t('nav.statusCheck'), href: '/status-check', icon: Search },
    { name: t('nav.printing'), href: '/printing', icon: Printer },
    { name: t('nav.personnel'), href: '/admin/officers', icon: Users },
    { name: t('nav.proxyEntry'), href: '/admin/reports-entry', icon: FilePenLine },
    { name: t('nav.broadcasts'), href: '/admin/announcements', icon: Megaphone },
    { name: t('nav.branding'), href: '/admin/settings', icon: Settings },
    { name: t('nav.webSupport'), href: '/support', icon: LifeBuoy },
    { name: t('nav.chat'), href: '/communication', icon: MessageSquare },
  ] : [
    { name: t('nav.meetingsExams'), href: '/meetings', icon: GraduationCap },
    { name: t('nav.performance'), href: '/performance', icon: TrendingUp },
    { name: t('nav.comparison'), href: '/previous', icon: History },
    { name: t('nav.statusCheck'), href: '/status-check', icon: Search },
    { name: t('nav.printing'), href: '/printing', icon: Printer },
    { name: t('nav.dailyReports'), href: '/daily-registrations', icon: CalendarPlus },
    { name: t('nav.records'), href: '/registrations', icon: FileCheck },
    { name: t('nav.history'), href: '/historical', icon: Database },
    { name: t('nav.analytics'), href: '/reports', icon: ClipboardList },
    { name: t('nav.ranks'), href: '/leaderboard', icon: Trophy },
    { name: t('nav.webSupport'), href: '/support', icon: LifeBuoy },
    { name: t('nav.chat'), href: '/communication', icon: MessageSquare },
  ];

  const DESKTOP_SECONDARY_NAV = SECONDARY_NAV.filter((item) => item.href !== '/communication');
  const isDesktopSecondaryActive = DESKTOP_SECONDARY_NAV.some((item) => pathname === item.href);
  const isSecondaryActive = SECONDARY_NAV.some((item) => pathname === item.href);

  const handleLogout = async () => {
    if (db && user?.uid) {
      updateDocumentNonBlocking(doc(db, 'users', user.uid), {
        isOnline: false,
        lastSeenAt: new Date().toISOString(),
      });
    }
    sessionStorage.removeItem('fayda_mfa_verified');
    sessionStorage.removeItem('fayda_mfa_verified_uid');
    await signOut(auth);
    router.push('/login');
  };

  const bureauName = branding?.bureauName || 'FaydaTrack';
  const logoUrl = branding?.logoUrl || DEFAULT_LOGO;
  const userInitials = (profile?.fullName || user?.email || 'OF')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const localizedRole = profile?.role === 'admin'
    ? t('common.adminRole')
    : profile?.role
    ? t('common.officerRole')
    : t('common.personnel');

  return (
    <TooltipProvider>
      <header className="sticky top-2.5 sm:top-3 z-50 w-full px-2.5 sm:px-5 lg:px-8 transition-all duration-300 print:hidden">
        <div className="relative w-full max-w-7xl mx-auto flex h-14 sm:h-16 items-center justify-between px-2.5 sm:px-4 lg:px-5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/90 dark:border-slate-800 shadow-[0_14px_40px_rgba(15,23,42,0.07)] gap-1.5 sm:gap-2.5 overflow-hidden">
          {/* Left Brand & Desktop Navigation Group */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 xl:gap-3.5 min-w-0 flex-1 overflow-hidden">
            <Link
              href={user ? (isAdmin ? '/admin' : '/dashboard') : '/'}
              className="flex items-center gap-1.5 sm:gap-2 pr-0.5 group shrink-0"
            >
              <div className="relative h-8 w-8 sm:h-9 sm:w-9 overflow-hidden rounded-xl bg-[#F4F5F8] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 p-1 transition-all duration-300 group-hover:scale-105 shrink-0">
                <div className="relative h-full w-full overflow-hidden rounded-lg">
                  <Image
                    src={logoUrl}
                    alt={bureauName}
                    fill
                    sizes="36px"
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <span className="text-[14px] sm:text-[16px] xl:text-[17px] font-extrabold tracking-[-0.03em] text-[#0B1238] dark:text-white truncate max-w-[92px] sm:max-w-[130px] xl:max-w-[145px] leading-tight">
                {bureauName}
              </span>
            </Link>

            {user ? (
              <nav className="hidden lg:flex items-center justify-center min-w-0 flex-1 py-1 overflow-hidden">
                <div className="flex items-center gap-0.5 xl:gap-1 p-1 rounded-full bg-[#F4F5F8] dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 max-w-full overflow-hidden">
                  {PRIMARY_NAV.map((item) => {
                    const isActive = pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.name}
                        className={cn(
                          "group relative flex items-center gap-1 xl:gap-1.5 px-2 xl:px-2.5 2xl:px-3 py-1.5 text-[11px] xl:text-[12px] rounded-full transition-all duration-200 whitespace-nowrap min-w-0 shrink",
                          isActive
                            ? "bg-[#0B1238] dark:bg-[#EC4899] text-white font-bold shadow-sm"
                            : "text-[#1D2549] dark:text-slate-300 hover:text-[#EC4899] dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/[0.06] font-semibold"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                            isActive
                              ? "text-[#EC4899] dark:text-white"
                              : "text-slate-400 dark:text-slate-400 group-hover:text-[#EC4899]"
                          )}
                        />
                        <span className="max-w-[74px] xl:max-w-[104px] 2xl:max-w-[132px] truncate">{item.name}</span>
                        {item.href === '/communication' && unreadChatCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#EC4899] text-white text-[9.5px] font-black tabular-nums shadow-sm shrink-0">
                            {formatNumber(unreadChatCount)}
                          </span>
                        )}
                      </Link>
                    );
                  })}

                  <div className="h-4 w-px bg-slate-300/70 dark:bg-white/10 mx-0.5 shrink-0" />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={t('nav.bureauHub')}
                        className={cn(
                          "group relative flex items-center gap-1 xl:gap-1.5 px-2 xl:px-2.5 2xl:px-3 py-1.5 text-[11px] xl:text-[12px] rounded-full transition-all duration-200 whitespace-nowrap min-w-0 shrink cursor-pointer focus:outline-none",
                          isDesktopSecondaryActive
                            ? "bg-[#0B1238] dark:bg-[#EC4899] text-white font-bold shadow-sm"
                            : "text-[#1D2549] dark:text-slate-300 hover:text-[#EC4899] dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/[0.06] font-semibold"
                        )}
                      >
                        <ClipboardList
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isDesktopSecondaryActive
                              ? "text-[#EC4899] dark:text-white"
                              : "text-slate-400 group-hover:text-[#EC4899]"
                          )}
                        />
                        <span className="max-w-[74px] xl:max-w-[104px] 2xl:max-w-[132px] truncate">
                          {t('nav.bureauHub')}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={8}
                      className="w-64 p-1.5 rounded-2xl glass-dropdown"
                    >
                      <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-3 py-2">
                        {t('nav.operationalTerminals')}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-slate-200/60 dark:bg-white/10" />
                      <div className="space-y-0.5 pt-1">
                        {DESKTOP_SECONDARY_NAV.map((item) => {
                          const activeSub = pathname === item.href;
                          return (
                            <DropdownMenuItem
                              key={item.href}
                              onClick={() => router.push(item.href)}
                              className={cn(
                                "rounded-xl text-[13px] font-medium cursor-pointer py-2.5 px-3 transition-all duration-200 focus:bg-white/70 dark:focus:bg-white/10",
                                activeSub
                                  ? "glass-nav-item-active font-semibold text-[#0B1238] dark:text-white"
                                  : "text-slate-600 dark:text-slate-300 hover:text-[#0B1238] dark:hover:text-white"
                              )}
                            >
                              <item.icon
                                className={cn(
                                  "mr-2.5 h-4 w-4 shrink-0 transition-colors",
                                  activeSub ? "text-[#EC4899]" : "text-slate-400 dark:text-slate-500"
                                )}
                              />
                              <span className="flex-1 truncate">{item.name}</span>
                              {activeSub && (
                                <span className="h-1.5 w-1.5 rounded-full bg-[#EC4899] shrink-0" />
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </nav>
            ) : (
              <nav className="hidden lg:flex items-center justify-center gap-2.5 xl:gap-5 min-w-0 flex-1 mx-2 text-[11.5px] xl:text-[13px] font-semibold text-[#1D2549] dark:text-slate-200 overflow-hidden">
                {PUBLIC_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.name}
                    className={cn(
                      "transition-colors whitespace-nowrap min-w-0 shrink max-w-[92px] xl:max-w-[130px] 2xl:max-w-[155px] truncate",
                      pathname === item.href
                        ? "text-[#EC4899] font-bold"
                        : "hover:text-[#EC4899]"
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {/* Right Utility, Language Switcher & Profile Group */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Global Language Switcher — Visible on every screen */}
            <LanguageSwitcher />

            {user && (
              <>
                {/* Quick Chat Button on Tablet & Mobile */}
                <Link
                  href="/communication"
                  title={t('nav.chatAndCalls')}
                  aria-label={t('nav.chatAndCalls')}
                  className={cn(
                    "lg:hidden relative h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-full transition-all duration-300 active:scale-95",
                    pathname === '/communication'
                      ? "bg-[#0B1238] text-white"
                      : "bg-[#F4F5F8] dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300"
                  )}
                >
                  <MessageSquare className="h-[15px] w-[15px] sm:h-[16px] sm:w-[16px]" />
                  {unreadChatCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#EC4899] text-white text-[9px] font-black tabular-nums ring-2 ring-white dark:ring-slate-900">
                      {formatNumber(unreadChatCount)}
                    </span>
                  )}
                </Link>

                <Link
                  href="/notifications"
                  title={t('nav.notifications')}
                  aria-label={t('nav.notifications')}
                  className={cn(
                    "relative h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-full transition-all duration-300 active:scale-95",
                    pathname === '/notifications'
                      ? "bg-[#0B1238] text-white"
                      : "bg-[#F4F5F8] dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300"
                  )}
                >
                  <Bell className="h-[15px] w-[15px] sm:h-[16px] sm:w-[16px]" />
                  {((unreadNotifications && unreadNotifications.length > 0) || unreadChatCount > 0) && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-[#EC4899] rounded-full ring-2 ring-white dark:ring-slate-900" />
                  )}
                </Link>
              </>
            )}

            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title={t('nav.toggleTheme')}
                aria-label={t('nav.toggleTheme')}
                className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-full bg-[#F4F5F8] dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-all duration-300 cursor-pointer active:scale-95"
              >
                {theme === 'dark' ? (
                  <Sun className="h-[15px] w-[15px] sm:h-[16px] sm:w-[16px] text-amber-400" />
                ) : (
                  <Moon className="h-[15px] w-[15px] sm:h-[16px] sm:w-[16px]" />
                )}
              </button>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 pl-1 pr-1.5 md:pr-2.5 lg:pr-1.5 2xl:pr-3 py-1 rounded-full bg-[#F4F5F8] dark:bg-slate-800 hover:bg-[#E8EBF2] dark:hover:bg-slate-700 transition-all duration-300 cursor-pointer focus:outline-none active:scale-[0.99] shrink-0"
                  >
                    <div className="relative">
                      <Avatar className="h-7 w-7 sm:h-8 sm:w-8 rounded-full border border-white dark:border-slate-700 overflow-hidden shrink-0 shadow-sm">
                        <AvatarImage src={profile?.profilePhoto} />
                        <AvatarFallback className="rounded-full text-[11px] font-bold bg-[#0B1238] text-white">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900",
                          isOnline ? "bg-emerald-500" : "bg-amber-500"
                        )}
                      />
                    </div>
                    <div className="hidden md:flex lg:hidden 2xl:flex flex-col items-start text-left min-w-0">
                      <span className="text-[11.5px] font-bold text-[#0B1238] dark:text-slate-100 leading-tight truncate max-w-[105px]">
                        {profile?.fullName || t('common.official')}
                      </span>
                      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight truncate max-w-[105px]">
                        {localizedRole}
                      </span>
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 hidden md:block lg:hidden 2xl:block ml-0.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-64 p-1.5 rounded-2xl glass-dropdown"
                >
                  <DropdownMenuLabel className="flex items-center gap-3 p-2.5 rounded-xl glass-subpanel mb-1">
                    <Avatar className="h-10 w-10 rounded-xl border border-white/80 dark:border-white/20">
                      <AvatarImage src={profile?.profilePhoto} />
                      <AvatarFallback className="rounded-xl text-xs font-bold bg-[#0B1238] text-white">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
                        {profile?.fullName || t('common.official')}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isOnline ? "bg-emerald-500" : "bg-amber-500")} />
                        <span className="truncate">
                          {localizedRole} · {isOnline ? t('common.synced') : t('common.offline')}
                        </span>
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => router.push('/profile')}
                    className="rounded-xl text-[13px] font-medium cursor-pointer py-2.5 px-3 focus:bg-white/70 dark:focus:bg-white/10"
                  >
                    <Settings className="mr-2.5 h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">{t('nav.profileSettings')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      if (!db || !user?.uid) return;
                      const next2FA = !(profile?.twoFactorEnabled !== false);
                      updateDocumentNonBlocking(doc(db, 'users', user.uid), {
                        twoFactorEnabled: next2FA,
                        updatedAt: new Date().toISOString(),
                      });
                    }}
                    className="rounded-xl text-[13px] font-medium cursor-pointer py-2.5 px-3 focus:bg-white/70 dark:focus:bg-white/10 flex items-center justify-between"
                  >
                    <span className="flex items-center truncate">
                      <Smartphone className="mr-2.5 h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{t.adminOfficers.col2fa}</span>
                    </span>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ml-2',
                        profile?.twoFactorEnabled !== false
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      )}
                    >
                      {profile?.twoFactorEnabled !== false
                        ? t.adminOfficers.mfaOnBadge
                        : t.adminOfficers.mfaOffBadge}
                    </span>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem
                      onClick={() => router.push('/admin/officers')}
                      className="rounded-xl text-[13px] font-medium cursor-pointer py-2.5 px-3 focus:bg-white/70 dark:focus:bg-white/10"
                    >
                      <Users className="mr-2.5 h-4 w-4 text-blue-500 shrink-0" />
                      <span className="truncate">{t('nav.personnel')} (2FA)</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => router.push('/support')}
                    className="rounded-xl text-[13px] font-medium cursor-pointer py-2.5 px-3 focus:bg-white/70 dark:focus:bg-white/10"
                  >
                    <LifeBuoy className="mr-2.5 h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">{t('nav.webSupport')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-200/60 dark:bg-white/10" />
                  <DropdownMenuItem
                    className="text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-500/10 rounded-xl text-[13px] font-semibold cursor-pointer py-2.5 px-3"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2.5 h-4 w-4 shrink-0" />
                    <span className="truncate">{t('nav.signOut')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <Link
                  href="/login"
                  title={t('nav.login')}
                  className="hidden md:inline-flex px-3 xl:px-3.5 py-1.5 sm:py-2 rounded-full bg-[#F4F5F8] hover:bg-[#E7EAF2] dark:bg-slate-800 dark:hover:bg-slate-700 text-[#0B1238] dark:text-white text-[11px] xl:text-xs font-semibold transition-colors whitespace-nowrap max-w-[95px] xl:max-w-[115px] truncate"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  href="/login"
                  title={t('nav.trackPortal')}
                  className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-[#0B1238] hover:bg-[#17235E] dark:bg-[#EC4899] dark:hover:bg-[#DB2777] text-white text-[10.5px] sm:text-xs font-semibold shadow-[0_6px_16px_rgba(11,18,56,0.2)] transition-all whitespace-nowrap max-w-[98px] sm:max-w-[135px] xl:max-w-[155px] truncate"
                >
                  {t('nav.trackPortal')}
                </Link>

                {/* Responsive Mobile & Tablet Navigation Drawer for Public Visitors */}
                <Sheet open={isPublicMenuOpen} onOpenChange={setIsPublicMenuOpen}>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      title={t('nav.openNavigationMenu')}
                      aria-label={t('nav.openNavigationMenu')}
                      className="lg:hidden h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-full bg-[#F4F5F8] dark:bg-slate-800 text-[#0B1238] dark:text-white hover:bg-[#E7EAF2] dark:hover:bg-slate-700 transition-colors cursor-pointer active:scale-95"
                    >
                      <Menu className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
                    </button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    className="w-[86vw] max-w-sm rounded-l-[28px] glass-dropdown p-0 overflow-hidden border-l border-white/60 dark:border-slate-800"
                  >
                    <SheetHeader className="p-5 sm:p-6 border-b border-slate-200/70 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
                      <div className="flex items-center gap-3">
                        <div className="relative h-9 w-9 overflow-hidden rounded-xl bg-[#F4F5F8] dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 p-1 shrink-0">
                          <div className="relative h-full w-full overflow-hidden rounded-lg">
                            <Image
                              src={logoUrl}
                              alt={bureauName}
                              fill
                              sizes="36px"
                              className="object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>
                        <div className="text-left min-w-0">
                          <SheetTitle className="text-base font-extrabold tracking-tight text-[#0B1238] dark:text-white truncate">
                            {bureauName}
                          </SheetTitle>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#EC4899] truncate">
                            {t('nav.registrationStatusTracker')}
                          </p>
                        </div>
                      </div>
                    </SheetHeader>

                    <div className="p-4 sm:p-5 flex flex-col justify-between h-[calc(100vh-88px)] overflow-y-auto">
                      <div className="space-y-1.5">
                        <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                          {t('nav.publicPortals')}
                        </p>
                        {PUBLIC_NAV.map((item) => {
                          const isActive = pathname === item.href;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setIsPublicMenuOpen(false)}
                              className={cn(
                                "flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all",
                                isActive
                                  ? "bg-[#0B1238] text-white dark:bg-[#EC4899] shadow-md"
                                  : "text-[#0B1238] dark:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/70"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <item.icon
                                  className={cn(
                                    "h-4 w-4 shrink-0",
                                    isActive ? "text-[#EC4899] dark:text-white" : "text-[#EC4899]"
                                  )}
                                />
                                <span className="truncate">{item.name}</span>
                              </div>
                              <ArrowRight className="h-4 w-4 opacity-50 shrink-0" />
                            </Link>
                          );
                        })}
                      </div>

                      <div className="pt-4 border-t border-slate-200/70 dark:border-slate-800 space-y-2.5">
                        <Link
                          href="/status-check"
                          onClick={() => setIsPublicMenuOpen(false)}
                          className="w-full min-h-11 px-4 py-2.5 rounded-full bg-[#F4F5F8] dark:bg-slate-800 text-[#0B1238] dark:text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#E7EAF2] transition-colors text-center"
                        >
                          <Search className="h-3.5 w-3.5 text-[#EC4899] shrink-0" />
                          <span className="truncate">{t('nav.check29DigitRid')}</span>
                        </Link>
                        <Link
                          href="/login"
                          onClick={() => setIsPublicMenuOpen(false)}
                          className="w-full min-h-11 px-4 py-2.5 rounded-full bg-[#0B1238] hover:bg-[#17235E] dark:bg-[#EC4899] dark:hover:bg-[#DB2777] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all text-center"
                        >
                          <span className="truncate">{t('nav.officerLoginPortal')}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                        </Link>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Incoming Call Banner when outside /communication */}
      {incomingRingingConv?.activeCall && (
        <div className="fixed top-20 inset-x-4 z-50 max-w-md mx-auto animate-in slide-in-from-top-4 duration-300 print:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-950/95 text-white border border-emerald-500/40 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 animate-pulse">
                {incomingRingingConv.activeCall.callType === 'video' ? (
                  <Video className="h-5 w-5" />
                ) : (
                  <PhoneIncoming className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-tight truncate">
                  {incomingRingingConv.activeCall.callType === 'video'
                    ? t('nav.incomingVideoCall')
                    : t('nav.incomingVoiceCall')}
                </p>
                <p className="text-[11px] text-emerald-300 truncate">
                  {incomingRingingConv.activeCall.callerName} • {incomingRingingConv.activeCall.conversationName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsGlobalRingtoneMuted((m) => !m)}
                title={
                  isGlobalRingtoneMuted
                    ? t.liveCall.unmuteRingtoneTooltip
                    : t.liveCall.silenceRingtoneTooltip
                }
                aria-label={
                  isGlobalRingtoneMuted
                    ? t.liveCall.unmuteRingtoneTooltip
                    : t.liveCall.silenceRingtoneTooltip
                }
                className="h-9 w-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                {isGlobalRingtoneMuted ? (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                ) : (
                  <Volume2 className="h-4 w-4 text-emerald-400" />
                )}
              </button>
              <Button
                size="sm"
                onClick={() => router.push('/communication')}
                className="h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider shrink-0"
              >
                {t('nav.answerCall')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* High-Fidelity Mobile & Tablet Floating Claymorphic Tab Dock */}
      {user && (
        <nav
          className={cn(
            "lg:hidden fixed bottom-4 left-4 right-4 z-50 transition-all duration-500 ease-in-out print:hidden",
            isNavVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-[150%] opacity-0 pointer-events-none"
          )}
        >
          <div className="relative h-[80px] w-full max-w-lg mx-auto clay-tab-bar rounded-[32px] flex items-center justify-around px-2 sm:px-3 pb-2">
            {MOBILE_NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.name}
                  className="flex-1 min-w-0 h-full flex flex-col items-center justify-center relative group px-0.5"
                >
                  {isActive ? (
                    <div className="flex flex-col items-center justify-center w-full h-full min-w-0">
                      <div className="relative -mt-7 p-1.5 rounded-2xl clay-tab-pill transition-all duration-300">
                        <div className="h-11 w-13 px-3.5 clay-tab-active rounded-xl flex items-center justify-center text-[#0B1238] dark:text-[#EC4899]">
                          <item.icon className="h-6 w-6 transition-transform duration-300 scale-105" strokeWidth={2.4} />
                        </div>
                      </div>
                      <span className="text-[9.5px] font-black uppercase tracking-wider text-[#0B1238] dark:text-white mt-1 leading-none max-w-full truncate px-1">
                        {item.name}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 h-12 w-full rounded-2xl text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 group-hover:bg-white/60 dark:group-hover:bg-white/[0.06] transition-all duration-300 active:scale-95 min-w-0 px-1">
                      <item.icon className="h-5 w-5 shrink-0" strokeWidth={2.2} />
                      <span className="text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider opacity-85 max-w-full truncate">
                        {item.name}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}

            {/* Tactical "More" Sheet Trigger */}
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  title={t('nav.more')}
                  className="flex-1 min-w-0 h-full flex flex-col items-center justify-center relative group cursor-pointer focus:outline-none px-0.5"
                >
                  {isSheetOpen || isSecondaryActive ? (
                    <div className="flex flex-col items-center justify-center w-full h-full min-w-0">
                      <div className="relative -mt-7 p-1.5 rounded-2xl clay-tab-pill transition-all duration-300">
                        <div className="h-11 w-13 px-3.5 clay-tab-active rounded-xl flex items-center justify-center text-[#0B1238] dark:text-[#EC4899]">
                          <MoreHorizontal className="h-6 w-6 transition-transform duration-300 scale-105" strokeWidth={2.4} />
                        </div>
                      </div>
                      <span className="text-[9.5px] font-black uppercase tracking-wider text-[#0B1238] dark:text-white mt-1 leading-none max-w-full truncate px-1">
                        {t('nav.more')}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 h-12 w-full rounded-2xl text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 group-hover:bg-white/60 dark:group-hover:bg-white/[0.06] transition-all duration-300 active:scale-95 min-w-0 px-1">
                      <MoreHorizontal className="h-5 w-5 shrink-0" strokeWidth={2.2} />
                      <span className="text-[8.5px] sm:text-[9px] font-bold uppercase tracking-wider opacity-85 max-w-full truncate">
                        {t('nav.more')}
                      </span>
                    </div>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="rounded-t-[32px] h-[72vh] glass-dropdown p-0 overflow-hidden"
              >
                <SheetHeader className="p-6 border-b border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <Avatar className="h-12 w-12 rounded-2xl border border-white/80 dark:border-white/20 shadow-sm shrink-0">
                        <AvatarImage src={profile?.profilePhoto} />
                        <AvatarFallback className="rounded-2xl font-black bg-[#0B1238] text-white">
                          {(profile?.fullName || "OFF").substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left min-w-0">
                        <SheetTitle className="text-lg font-black uppercase tracking-tight truncate">
                          {profile?.fullName || t('common.official')}
                        </SheetTitle>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                          {localizedRole} · {isOnline ? t('common.online') : t('common.offline')}
                        </p>
                      </div>
                    </div>
                  </div>
                </SheetHeader>
                <div className="p-4 grid grid-cols-2 gap-3 overflow-y-auto max-h-[calc(72vh-130px)]">
                  {SECONDARY_NAV.map((item) => {
                    const activeMobileItem = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsSheetOpen(false)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-2xl transition-all duration-300 min-w-0",
                          activeMobileItem
                            ? "glass-nav-item-active text-[#0B1238] dark:text-white font-black"
                            : "glass-subpanel text-foreground hover:bg-white/80 dark:hover:bg-white/10"
                        )}
                      >
                        {item.icon && (
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              activeMobileItem ? "text-[#EC4899]" : "text-slate-500 dark:text-slate-400"
                            )}
                          />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-wider truncate flex-1">
                          {item.name}
                        </span>
                        {item.href === '/communication' && unreadChatCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#EC4899] text-white text-[10px] font-black tabular-nums shrink-0">
                            {formatNumber(unreadChatCount)}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                  <button
                    onClick={handleLogout}
                    className="col-span-2 flex items-center justify-center gap-3 p-4 mt-2 rounded-2xl bg-rose-500/90 hover:bg-rose-500 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-500/25 transition-all active:scale-98"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t('nav.terminateSession')}</span>
                  </button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Bottom Home Indicator Pill */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-slate-300/70 dark:bg-white/15 rounded-full pointer-events-none" />
          </div>
        </nav>
      )}
    </TooltipProvider>
  );
}
