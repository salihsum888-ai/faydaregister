
"use client"

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  LayoutDashboard, 
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
  ChevronUp,
  ChevronsUpDown,
  LineChart,
  Wifi,
  WifiOff,
  MoreHorizontal,
  ClipboardList,
  LayoutGrid,
  Home,
  Building2,
  GraduationCap,
  PhoneIncoming,
  Video,
  PanelBottomClose,
  PanelBottomOpen
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
import { signOut } from 'firebase/auth';
import { doc, collection, query, where } from 'firebase/firestore';
import { UserProfile, Notification, SystemSettings, Conversation } from '@/lib/types';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

const DEFAULT_LOGO = "https://services.eaes.et/NID-Logos/Fayda%20For%20Ethiopia%20logo-%20english-2-01.png";

export function Navbar() {
  const pathname = usePathname();
  const { user } = useUser();
  const db = useFirestore();
  const auth = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isTabDockHidden, setIsTabDockHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    try {
      const savedHidden = localStorage.getItem('fayda_hide_mobile_tabs');
      if (savedHidden === 'true') {
        setIsTabDockHidden(true);
      }
    } catch {
      // Ignore storage access errors
    }
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

  const toggleMobileTabDock = (nextState?: boolean) => {
    const target = typeof nextState === 'boolean' ? nextState : !isTabDockHidden;
    setIsTabDockHidden(target);
    if (!target) {
      setIsNavVisible(true);
    }
    try {
      localStorage.setItem('fayda_hide_mobile_tabs', String(target));
    } catch {
      // Ignore storage errors
    }
  };

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
      if (c.lastSenderId && c.lastSenderId === user.uid) return false;
      const lastMsgTs = getTs(c.lastTimestamp);
      if (!lastMsgTs) return false;
      const convReadTs = c.lastReadBy?.[user.uid] ? getTs(c.lastReadBy[user.uid]) : 0;
      const effectiveReadTs = convReadTs > 0 ? convReadTs : profileReadTs;
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

  if (pathname === '/login') return null;

  const isAdmin = profile?.role === 'admin';

  const PRIMARY_NAV = [
    { name: 'Home', href: isAdmin ? '/admin' : '/dashboard', icon: LayoutGrid },
    { name: 'Institutions', href: '/schools-students', icon: Building2 },
    { name: 'Intel', href: '/full-performance', icon: LineChart },
    { name: 'Full Record', href: '/full-registration', icon: Activity },
    { name: 'Chat', href: '/communication', icon: MessageSquare },
  ];

  const MOBILE_NAV = [
    { name: 'HOME', href: isAdmin ? '/admin' : '/dashboard', icon: Home },
    { name: 'INSTITUTIONS', href: '/schools-students', icon: Building2 },
    { name: 'INTEL', href: '/full-performance', icon: LineChart },
    { name: 'FULL RECORD', href: '/full-registration', icon: Activity },
  ];

  const SECONDARY_NAV = isAdmin ? [
    { name: 'Meetings & Exams', href: '/meetings', icon: GraduationCap },
    { name: 'Audit', href: '/admin/audit-ledger', icon: ShieldCheck },
    { name: 'Performance', href: '/performance', icon: TrendingUp },
    { name: 'Comparison', href: '/previous', icon: History },
    { name: 'Status Check', href: '/status-check', icon: Search },
    { name: 'Printing', href: '/printing', icon: Printer },
    { name: 'Personnel', href: '/admin/officers', icon: Users },
    { name: 'Proxy Entry', href: '/admin/reports-entry', icon: FilePenLine },
    { name: 'Broadcasts', href: '/admin/announcements', icon: Megaphone },
    { name: 'Branding', href: '/admin/settings', icon: Settings },
    { name: 'Chat', href: '/communication', icon: MessageSquare },
  ] : [
    { name: 'Meetings & Exams', href: '/meetings', icon: GraduationCap },
    { name: 'Performance', href: '/performance', icon: TrendingUp },
    { name: 'Comparison', href: '/previous', icon: History },
    { name: 'Status Check', href: '/status-check', icon: Search },
    { name: 'Printing', href: '/printing', icon: Printer },
    { name: 'Daily Reports', href: '/daily-registrations', icon: CalendarPlus },
    { name: 'Records', href: '/registrations', icon: FileCheck },
    { name: 'History', href: '/historical', icon: Database },
    { name: 'Analytics', href: '/reports', icon: ClipboardList },
    { name: 'Ranks', href: '/leaderboard', icon: Trophy },
    { name: 'Chat', href: '/communication', icon: MessageSquare },
  ];

  const DESKTOP_SECONDARY_NAV = SECONDARY_NAV.filter((item) => item.href !== '/communication');
  const isDesktopSecondaryActive = DESKTOP_SECONDARY_NAV.some((item) => pathname === item.href);
  const isSecondaryActive = SECONDARY_NAV.some((item) => pathname === item.href);

  const handleLogout = async () => {
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

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-50 w-full glass-navbar transition-all duration-300 print:hidden">
        {/* Top Specular Edge Highlight */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 dark:via-white/25 to-transparent" />
        {/* Subtle Ambient Glow Underlay */}
        <div className="pointer-events-none absolute left-1/3 -top-10 h-20 w-72 rounded-full bg-primary/10 dark:bg-primary/15 blur-2xl" />

        <div className="relative w-full max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 gap-2 sm:gap-4">
          {/* Left Navigation Group */}
          <div className="flex items-center gap-3 lg:gap-4 min-w-0 flex-1">
            <Link
              href={isAdmin ? '/admin' : '/dashboard'}
              className="flex items-center gap-2.5 pr-1 group shrink-0"
            >
              <div className="relative h-9 w-9 overflow-hidden rounded-xl glass-subpanel p-1 transition-all duration-300 group-hover:scale-105 group-hover:border-primary/40">
                <div className="relative h-full w-full overflow-hidden rounded-lg">
                  <Image
                    src={logoUrl}
                    alt="Logo"
                    fill
                    sizes="36px"
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate max-w-[140px] leading-tight">
                  {bureauName}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 leading-none mt-0.5 hidden sm:inline">
                  {isAdmin ? 'Command' : 'Portal'}
                </span>
              </div>
            </Link>

            {user && (
              <nav className="hidden lg:flex items-center min-w-0 overflow-x-auto no-scrollbar py-1">
                <div className="flex items-center gap-1.5 p-1.5 rounded-2xl clay-tab-pill">
                  {PRIMARY_NAV.map((item) => {
                    const isActive = pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-1.5 lg:gap-2 px-3.5 lg:px-4 py-1.5 text-xs lg:text-[13px] rounded-xl transition-all duration-300 whitespace-nowrap shrink-0",
                          isActive
                            ? "clay-tab-active text-slate-900 dark:text-white font-bold scale-[1.02]"
                            : "border border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.06] font-semibold active:scale-95"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110",
                            isActive
                              ? "text-[#FF6B4A] drop-shadow-[0_2px_6px_rgba(255,107,74,0.35)]"
                              : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                          )}
                        />
                        <span>{item.name}</span>
                        {item.href === '/communication' && unreadChatCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF6B4A] text-white text-[10px] font-black tabular-nums shadow-sm">
                            {unreadChatCount}
                          </span>
                        )}
                        {isActive && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B4A] shadow-[0_0_8px_rgba(255,107,74,0.8)]" />
                        )}
                      </Link>
                    );
                  })}

                  <div className="h-4 w-px bg-slate-300/70 dark:bg-white/10 mx-0.5" />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "group relative flex items-center gap-1.5 lg:gap-2 px-3.5 lg:px-4 py-1.5 text-xs lg:text-[13px] rounded-xl transition-all duration-300 whitespace-nowrap shrink-0 cursor-pointer focus:outline-none",
                          isDesktopSecondaryActive
                            ? "clay-tab-active text-slate-900 dark:text-white font-bold scale-[1.02]"
                            : "border border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.06] font-semibold active:scale-95"
                        )}
                      >
                        <ClipboardList
                          className={cn(
                            "h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110",
                            isDesktopSecondaryActive
                              ? "text-[#FF6B4A] drop-shadow-[0_2px_6px_rgba(255,107,74,0.35)]"
                              : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                          )}
                        />
                        <span>Bureau Hub</span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={8}
                      className="w-60 p-1.5 rounded-2xl glass-dropdown"
                    >
                      <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-3 py-2">
                        Operational Terminals
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
                                  ? "glass-nav-item-active font-semibold text-slate-900 dark:text-white"
                                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                              )}
                            >
                              <item.icon
                                className={cn(
                                  "mr-2.5 h-4 w-4 transition-colors",
                                  activeSub ? "text-[#FF6B4A]" : "text-slate-400 dark:text-slate-500"
                                )}
                              />
                              <span className="flex-1">{item.name}</span>
                              {activeSub && (
                                <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B4A]" />
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </nav>
            )}
          </div>

          {/* Right Utility & Profile Group */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {user && (
              <>
                {/* Quick Chat Button on Tablet & Mobile */}
                <Link
                  href="/communication"
                  title="Chat & Calls"
                  className={cn(
                    "lg:hidden relative h-9 w-9 flex items-center justify-center rounded-xl transition-all duration-300 active:scale-95",
                    pathname === '/communication'
                      ? "glass-nav-item-active text-primary"
                      : "glass-subpanel text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-white/85 dark:hover:bg-white/10"
                  )}
                >
                  <MessageSquare className="h-[17px] w-[17px]" />
                  {unreadChatCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#FF6B4A] text-white text-[9px] font-black tabular-nums ring-2 ring-white dark:ring-slate-900">
                      {unreadChatCount}
                    </span>
                  )}
                </Link>

                {/* Quick Hide / Show Bottom Tabs Button on Tablet & Mobile */}
                <button
                  type="button"
                  onClick={() => toggleMobileTabDock()}
                  title={isTabDockHidden ? "Show bottom navigation tabs" : "Hide bottom navigation tabs"}
                  className={cn(
                    "lg:hidden relative h-9 w-9 flex items-center justify-center rounded-xl transition-all duration-300 cursor-pointer active:scale-95",
                    isTabDockHidden
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "glass-subpanel text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-white/85 dark:hover:bg-white/10"
                  )}
                >
                  {isTabDockHidden ? (
                    <PanelBottomOpen className="h-[17px] w-[17px]" />
                  ) : (
                    <PanelBottomClose className="h-[17px] w-[17px]" />
                  )}
                </button>

                <Link
                  href="/notifications"
                  title="Notifications"
                  className={cn(
                    "relative h-9 w-9 flex items-center justify-center rounded-xl transition-all duration-300 active:scale-95",
                    pathname === '/notifications'
                      ? "glass-nav-item-active text-primary"
                      : "glass-subpanel text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-white/85 dark:hover:bg-white/10"
                  )}
                >
                  <Bell className="h-[17px] w-[17px]" />
                  {((unreadNotifications && unreadNotifications.length > 0) || unreadChatCount > 0) && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-[#FF6B4A] rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                  )}
                </Link>
              </>
            )}

            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme"
                className="h-9 w-9 flex items-center justify-center rounded-xl glass-subpanel text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-white/85 dark:hover:bg-white/10 transition-all duration-300 cursor-pointer active:scale-95"
              >
                {theme === 'dark' ? (
                  <Sun className="h-[17px] w-[17px] text-amber-400" />
                ) : (
                  <Moon className="h-[17px] w-[17px]" />
                )}
              </button>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-2xl glass-subpanel hover:bg-white/85 dark:hover:bg-white/10 transition-all duration-300 cursor-pointer focus:outline-none active:scale-[0.99]"
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8 rounded-xl border border-white/80 dark:border-white/20 overflow-hidden shrink-0 shadow-sm">
                        <AvatarImage src={profile?.profilePhoto} />
                        <AvatarFallback className="rounded-xl text-xs font-bold bg-gradient-to-br from-primary to-indigo-600 text-white">
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
                    <div className="hidden sm:flex flex-col items-start text-left min-w-0">
                      <span className="text-[12px] font-bold text-slate-900 dark:text-slate-100 leading-tight truncate max-w-[130px]">
                        {profile?.fullName || 'Official'}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight truncate max-w-[130px]">
                        {profile?.role || 'Personnel'}
                      </span>
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 hidden sm:block ml-0.5" />
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
                      <AvatarFallback className="rounded-xl text-xs font-bold bg-gradient-to-br from-primary to-indigo-600 text-white">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
                        {profile?.fullName || 'Official'}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize truncate flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", isOnline ? "bg-emerald-500" : "bg-amber-500")} />
                        {profile?.role || 'Personnel'} · {isOnline ? 'Synced' : 'Offline'}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => router.push('/profile')}
                    className="rounded-xl text-[13px] font-medium cursor-pointer py-2.5 px-3 focus:bg-white/70 dark:focus:bg-white/10"
                  >
                    <Settings className="mr-2.5 h-4 w-4 text-slate-400" /> Profile Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-200/60 dark:bg-white/10" />
                  <DropdownMenuItem
                    className="text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-500/10 rounded-xl text-[13px] font-semibold cursor-pointer py-2.5 px-3"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2.5 h-4 w-4" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="default" size="sm" asChild className="rounded-xl h-9 text-xs font-semibold px-5 shadow-md shadow-primary/20">
                <Link href="/login">Portal Login</Link>
              </Button>
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
                  Incoming {incomingRingingConv.activeCall.callType === 'video' ? 'Video' : 'Voice'} Call
                </p>
                <p className="text-[11px] text-emerald-300 truncate">
                  {incomingRingingConv.activeCall.callerName} • {incomingRingingConv.activeCall.conversationName}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => router.push('/communication')}
              className="h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider shrink-0"
            >
              Answer Call
            </Button>
          </div>
        </div>
      )}

      {/* Compact Floating "Show Tabs" Restore Pill when Mobile/Tablet Tab Dock is Hidden */}
      {user && (isTabDockHidden || !isNavVisible) && (
        <div className="lg:hidden fixed bottom-3 right-3 z-50 print:hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
          <button
            type="button"
            onClick={() => toggleMobileTabDock(false)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-900/90 dark:bg-slate-950/95 text-white border border-white/15 shadow-xl backdrop-blur-xl text-[10px] font-black uppercase tracking-wider cursor-pointer active:scale-95"
            title="Show navigation tabs"
          >
            <ChevronUp className="h-3.5 w-3.5 text-[#FF6B4A]" />
            <span>Show Tabs</span>
          </button>
        </div>
      )}

      {/* High-Fidelity Mobile & Tablet Floating Claymorphic Tab Dock */}
      {user && (
        <nav
          className={cn(
            "lg:hidden fixed bottom-4 left-4 right-4 z-50 transition-all duration-500 ease-in-out print:hidden",
            isNavVisible && !isTabDockHidden
              ? "translate-y-0 opacity-100"
              : "translate-y-[150%] opacity-0 pointer-events-none"
          )}
        >
          <div className="relative h-[82px] w-full max-w-lg mx-auto clay-tab-bar rounded-[32px] flex items-center justify-around px-3 pb-2">
            {/* Quick Hide Tabs Pill attached to top-right of mobile/tablet tab bar */}
            <button
              type="button"
              onClick={() => toggleMobileTabDock(true)}
              className="absolute -top-3.5 right-4 z-20 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-900/90 dark:bg-slate-950/90 text-white border border-white/15 shadow-md text-[9px] font-black uppercase tracking-wider cursor-pointer active:scale-95"
              title="Hide bottom tabs"
            >
              <ChevronDown className="h-3 w-3 text-[#FF6B4A]" />
              <span>Hide Tabs</span>
            </button>

            {MOBILE_NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex-1 h-full flex flex-col items-center justify-center relative group"
                >
                  {isActive ? (
                    <div className="flex flex-col items-center justify-center w-full h-full">
                      {/* Sculpted Clay Cutout Well + Puffy 3D Icon Badge */}
                      <div className="relative -mt-7 p-1.5 rounded-2xl clay-tab-pill transition-all duration-300">
                        <div className="h-11 w-13 px-3.5 clay-tab-active rounded-xl flex items-center justify-center text-primary">
                          <item.icon className="h-6 w-6 transition-transform duration-300 scale-105 drop-shadow-[0_2px_6px_rgba(37,99,235,0.3)]" strokeWidth={2.4} />
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-primary mt-1 leading-none">
                        {item.name}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 h-12 w-12 rounded-2xl text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 group-hover:bg-white/60 dark:group-hover:bg-white/[0.06] transition-all duration-300 active:scale-95">
                      <item.icon className="h-5 w-5" strokeWidth={2.2} />
                      <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
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
                  className="flex-1 h-full flex flex-col items-center justify-center relative group cursor-pointer focus:outline-none"
                >
                  {isSheetOpen || isSecondaryActive ? (
                    <div className="flex flex-col items-center justify-center w-full h-full">
                      <div className="relative -mt-7 p-1.5 rounded-2xl clay-tab-pill transition-all duration-300">
                        <div className="h-11 w-13 px-3.5 clay-tab-active rounded-xl flex items-center justify-center text-primary">
                          <MoreHorizontal className="h-6 w-6 transition-transform duration-300 scale-105" strokeWidth={2.4} />
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-primary mt-1 leading-none">
                        MORE
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 h-12 w-12 rounded-2xl text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 group-hover:bg-white/60 dark:group-hover:bg-white/[0.06] transition-all duration-300 active:scale-95">
                      <MoreHorizontal className="h-5 w-5" strokeWidth={2.2} />
                      <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                        MORE
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
                        <AvatarFallback className="rounded-2xl font-black bg-gradient-to-br from-primary to-indigo-600 text-white">
                          {(profile?.fullName || "OFF").substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left min-w-0">
                        <SheetTitle className="text-lg font-black uppercase tracking-tight truncate">
                          {profile?.fullName || 'Official'}
                        </SheetTitle>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          {profile?.role || 'Personnel'} · {isOnline ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        toggleMobileTabDock(true);
                        setIsSheetOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-xl glass-subpanel text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <PanelBottomClose className="h-3.5 w-3.5 text-[#FF6B4A]" />
                      Hide Bottom Tabs
                    </button>
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
                          "flex items-center gap-3 p-4 rounded-2xl transition-all duration-300",
                          activeMobileItem
                            ? "glass-nav-item-active text-primary font-black"
                            : "glass-subpanel text-foreground hover:bg-white/80 dark:hover:bg-white/10"
                        )}
                      >
                        {item.icon && (
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              activeMobileItem ? "text-[#FF6B4A]" : "text-slate-500 dark:text-slate-400"
                            )}
                          />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest truncate flex-1">
                          {item.name}
                        </span>
                        {item.href === '/communication' && unreadChatCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF6B4A] text-white text-[10px] font-black tabular-nums">
                            {unreadChatCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                  <button
                    onClick={handleLogout}
                    className="col-span-2 flex items-center justify-center gap-3 p-4 mt-2 rounded-2xl bg-rose-500/90 hover:bg-rose-500 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-500/25 transition-all active:scale-98"
                  >
                    <LogOut className="h-4 w-4" /> Terminate Session
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

