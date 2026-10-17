
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
  LineChart,
  Wifi,
  WifiOff,
  MoreHorizontal,
  ClipboardList,
  LayoutGrid
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
import { UserProfile, Notification, SystemSettings } from '@/lib/types';
import { useEffect, useState, useRef } from 'react';
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
  const lastScrollY = useRef(0);

  useEffect(() => {
    setMounted(true);
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

  const unreadNotificationsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'users', user.uid, 'notifications'), 
      where('isRead', '==', false)
    );
  }, [db, user?.uid]);

  const { data: unreadNotifications } = useCollection<Notification>(unreadNotificationsQuery);

  if (pathname === '/login') return null;

  const isAdmin = profile?.role === 'admin';

  const PRIMARY_NAV = [
    { name: 'Home', href: isAdmin ? '/admin' : '/dashboard', icon: LayoutDashboard },
    { name: 'Intel', href: '/full-performance', icon: LineChart },
    { name: 'Pulse', href: '/full-registration', icon: Activity },
    { name: 'Chat', href: '/communication', icon: MessageSquare },
  ];

  const MOBILE_NAV = [
    { name: 'HOME', href: isAdmin ? '/admin' : '/dashboard', icon: LayoutGrid },
    { name: 'INTEL', href: '/full-performance', icon: LineChart },
    { name: 'PULSE', href: '/full-registration', icon: Activity },
    { name: 'CHAT', href: '/communication', icon: MessageSquare },
  ];

  const SECONDARY_NAV = isAdmin ? [
    { name: 'Audit', href: '/admin/audit-ledger', icon: ShieldCheck },
    { name: 'Performance', href: '/performance', icon: TrendingUp },
    { name: 'Comparison', href: '/previous', icon: History },
    { name: 'Status Check', href: '/status-check', icon: Search },
    { name: 'Printing', href: '/printing', icon: Printer },
    { name: 'Personnel', href: '/admin/officers', icon: Users },
    { name: 'Proxy Entry', href: '/admin/reports-entry', icon: FilePenLine },
    { name: 'Broadcasts', href: '/admin/announcements', icon: Megaphone },
    { name: 'Branding', href: '/admin/settings', icon: Settings },
  ] : [
    { name: 'Performance', href: '/performance', icon: TrendingUp },
    { name: 'Comparison', href: '/previous', icon: History },
    { name: 'Status Check', href: '/status-check', icon: Search },
    { name: 'Printing', href: '/printing', icon: Printer },
    { name: 'Daily Reports', href: '/daily-registrations', icon: CalendarPlus },
    { name: 'Records', href: '/registrations', icon: FileCheck },
    { name: 'History', href: '/historical', icon: Database },
    { name: 'Analytics', href: '/reports', icon: ClipboardList },
    { name: 'Ranks', href: '/leaderboard', icon: Trophy },
  ];

  const handleLogout = async () => {
    sessionStorage.removeItem('fayda_mfa_verified');
    await signOut(auth);
    router.push('/login');
  };

  const bureauName = branding?.bureauName || 'FaydaTrack';
  const logoUrl = branding?.logoUrl || DEFAULT_LOGO;

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl transition-all duration-300">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center space-x-2 group shrink-0">
              <div className="relative h-8 w-8 overflow-hidden rounded-md transition-all group-hover:scale-105">
                <Image src={logoUrl} alt="Logo" fill sizes="32px" className="object-cover" unoptimized />
              </div>
              <span className="text-xs font-black tracking-widest text-foreground uppercase hidden sm:block">
                {bureauName.split('Track')[0]}<span className="text-primary italic">{bureauName.includes('Track') ? 'Track' : ''}</span>
              </span>
            </Link>

            <nav className="hidden lg:flex items-center space-x-1">
              {user && PRIMARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all",
                    pathname === item.href ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="mr-2 h-3.5 w-3.5 opacity-60" />
                  {item.name}
                </Link>
              ))}
              
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-xl">
                      Bureau Hub <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 p-1 rounded-2xl shadow-2xl border-border bg-popover">
                    <DropdownMenuLabel className="text-[9px] font-black text-muted-foreground uppercase px-2 py-2 tracking-widest">Operational Terminals</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {SECONDARY_NAV.map((item) => (
                      <DropdownMenuItem key={item.href} onClick={() => router.push(item.href)} className="rounded-xl text-[10px] font-bold uppercase tracking-widest cursor-pointer py-3">
                        <item.icon className="mr-2 h-3.5 w-3.5 opacity-60" /> {item.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "flex items-center gap-2.5 px-3 py-1.5 rounded-full border transition-all duration-500 shadow-sm cursor-help",
                    isOnline 
                      ? "bg-emerald-500/[0.03] border-emerald-500/20 text-emerald-600" 
                      : "bg-rose-500/[0.03] border-rose-500/20 text-rose-600"
                  )}>
                    <div className="relative flex items-center justify-center h-3 w-3">
                      {isOnline ? (
                        <>
                          <Wifi className="h-3 w-3 relative z-10" strokeWidth={3} />
                          <span className="absolute h-full w-full bg-emerald-500 rounded-full opacity-30 animate-ping" />
                          <span className="absolute h-1 w-1 bg-emerald-500 rounded-full -top-0.5 -right-0.5 border border-background animate-pulse" />
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3 w-3 relative z-10" />
                          <span className="absolute h-1 w-1 bg-rose-500 rounded-full -top-0.5 -right-0.5 border border-background" />
                        </>
                      )}
                    </div>
                    <span className="text-[8px] font-black font-mono uppercase tracking-[0.15em] hidden sm:inline leading-none">
                      {isOnline ? 'Synced' : 'Isolated'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border p-2 rounded-lg">
                  <p className="text-[9px] font-black uppercase tracking-widest">
                    {isOnline ? 'Real-time Protocol Active' : 'Offline: Local Cache Mode'}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}

            {mounted && (
              <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground">
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}

            {user && (
              <Link href="/notifications" className="relative p-2.5 rounded-xl hover:bg-muted transition-colors group">
                <Bell className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                {unreadNotifications && unreadNotifications.length > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full ring-2 ring-background" />
                )}
              </Link>
            )}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-10 w-10 p-0 rounded-full border border-border/50 overflow-hidden ring-offset-background hover:ring-2 hover:ring-primary/20 transition-all">
                    <Avatar className="h-full w-full">
                      <AvatarImage src={profile?.profilePhoto} />
                      <AvatarFallback className="text-[10px] font-black bg-muted">{(profile?.fullName || "OFF").substring(0, 2)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-1 rounded-2xl shadow-2xl border-border bg-popover">
                  <DropdownMenuLabel className="flex items-center gap-3 p-3">
                    <Avatar className="h-10 w-10 border border-border/50">
                      <AvatarImage src={profile?.profilePhoto} />
                      <AvatarFallback className="text-xs font-black bg-muted">{(profile?.fullName || "OFF").substring(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-0">
                      <span className="text-xs font-black text-foreground uppercase tracking-tight truncate">{profile?.fullName || 'Official'}</span>
                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest truncate">{profile?.role || 'Personnel'}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/profile')} className="rounded-xl text-[10px] font-bold uppercase tracking-widest cursor-pointer py-3">
                    <Settings className="mr-2 h-3.5 w-3.5 opacity-60" /> Profile Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive rounded-xl text-[10px] font-bold uppercase tracking-widest cursor-pointer py-3" onClick={handleLogout}>
                    <LogOut className="mr-2 h-3.5 w-3.5" /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="default" size="sm" asChild className="rounded-xl h-9 text-[10px] font-black uppercase tracking-widest px-6">
                <Link href="/login">Portal Login</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* High-Fidelity Mobile Floating Navbar (Active Box Design) */}
      {user && (
        <nav className={cn(
          "lg:hidden fixed bottom-6 left-4 right-4 z-50 transition-all duration-500 ease-in-out",
          isNavVisible ? "translate-y-0 opacity-100" : "translate-y-[120%] opacity-0"
        )}>
          <div className="relative h-20 w-full bg-slate-100/95 dark:bg-slate-900/95 border border-[#e2e8f0] dark:border-slate-800 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex items-center justify-around px-2 backdrop-blur-xl">
            {MOBILE_NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className="flex-1 h-full flex items-center justify-center p-1"
                >
                  <div className={cn(
                    "flex flex-col items-center justify-center w-full h-[70px] rounded-2xl transition-all duration-300",
                    isActive ? "bg-white dark:bg-slate-800 shadow-sm text-[#2563eb]" : "text-slate-500/60 hover:text-slate-700"
                  )}>
                    <item.icon className={cn("h-6 w-6 mb-1 transition-transform duration-300", isActive && "scale-110")} strokeWidth={2.5} />
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-[0.05em] transition-all duration-300",
                      isActive ? "opacity-100 translate-y-0" : "opacity-40"
                    )}>
                      {item.name}
                    </span>
                  </div>
                </Link>
              );
            })}

            {/* Tactical "More" Sheet Trigger */}
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <div className="flex-1 h-full flex items-center justify-center p-1 cursor-pointer">
                  <div className={cn(
                    "flex flex-col items-center justify-center w-full h-[70px] rounded-2xl transition-all duration-300",
                    isSheetOpen ? "bg-white dark:bg-slate-800 shadow-sm text-[#2563eb]" : "text-slate-500/60 hover:text-slate-700"
                  )}>
                    <MoreHorizontal className={cn("h-6 w-6 mb-1 transition-transform duration-300", isSheetOpen && "scale-110")} strokeWidth={2.5} />
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-[0.05em] transition-all duration-300",
                      isSheetOpen ? "opacity-100 translate-y-0" : "opacity-40"
                    )}>
                      More
                    </span>
                  </div>
                </div>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-[32px] h-[70vh] border-none shadow-2xl bg-popover p-0 overflow-hidden">
                <SheetHeader className="p-8 border-b bg-muted/20">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12 border-2 border-primary/20">
                      <AvatarImage src={profile?.profilePhoto} />
                      <AvatarFallback className="font-black">{(profile?.fullName || "OFF").substring(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <SheetTitle className="text-lg font-black uppercase tracking-tight">{profile?.fullName}</SheetTitle>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{profile?.role}</p>
                    </div>
                  </div>
                </SheetHeader>
                <div className="p-4 grid grid-cols-2 gap-3 overflow-y-auto max-h-[calc(70vh-140px)]">
                  {SECONDARY_NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsSheetOpen(false)}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-2xl border transition-all",
                        pathname === item.href ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"
                      )}
                    >
                      {item.icon && <item.icon className="h-4 w-4" />}
                      <span className="text-[10px] font-black uppercase tracking-widest">{item.name}</span>
                    </Link>
                  ))}
                  <button onClick={handleLogout} className="col-span-2 flex items-center justify-center gap-3 p-4 mt-4 rounded-2xl bg-rose-500 text-white font-black uppercase text-[10px] tracking-widest">
                    <LogOut className="h-4 w-4" /> Terminate Session
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      )}
    </TooltipProvider>
  );
}
