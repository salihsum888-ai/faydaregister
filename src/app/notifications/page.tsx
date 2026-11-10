'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bell,
  CheckCheck,
  Trash2,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Megaphone,
  MessageSquare,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Activity,
  ShieldCheck,
  Search,
  Check,
  Plus,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Notification, Announcement, Conversation, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, doc, where, serverTimestamp } from 'firebase/firestore';
import {
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
  addDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import { format } from 'date-fns';
import Link from 'next/link';
import { logAuditAction } from '@/lib/audit';
import { useTranslation } from '@/i18n/language-provider';

type CategoryFilter = 'all' | 'announcement' | 'message' | 'personal';

export default function NotificationsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const { toast } = useToast();
  const { t, formatDate } = useTranslation();

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);
  const isAdmin = profile?.role === 'admin';

  const notificationsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(collection(db, 'users', user.uid, 'notifications'));
  }, [db, user?.uid]);

  const announcementsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'announcements'));
  }, [db, user?.uid]);

  const convsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'conversations'), where('members', 'array-contains', user.uid));
  }, [db, user]);

  const { data: notifications, isLoading: isNotisLoading } =
    useCollection<Notification>(notificationsQuery);
  const { data: announcements, isLoading: isAnnLoading } =
    useCollection<Announcement>(announcementsQuery);
  const { data: conversations, isLoading: isConvsLoading } =
    useCollection<Conversation>(convsQuery);

  const getTs = (d: any) => {
    if (!d) return 0;
    if (typeof d === 'string') return new Date(d).getTime();
    if (d.toDate) return d.toDate().getTime();
    return new Date(d).getTime();
  };

  const combinedItems = useMemo(() => {
    const combined: any[] = [];

    if (notifications) {
      notifications.forEach((n) =>
        combined.push({
          ...n,
          category: 'personal',
          sortDate: new Date(n.createdAt || Date.now()),
        })
      );
    }

    if (announcements) {
      const lastRead = profile?.lastAnnouncementReadAt
        ? getTs(profile.lastAnnouncementReadAt)
        : 0;
      announcements.forEach((a) => {
        const annTs = a.timestamp ? getTs(a.timestamp) : getTs(a.date);
        combined.push({
          ...a,
          category: 'announcement',
          isRead: annTs <= lastRead,
          message: a.content,
          createdAt: a.timestamp?.toDate
            ? a.timestamp.toDate().toISOString()
            : new Date(a.date || Date.now()).toISOString(),
          sortDate: a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.date || Date.now()),
        });
      });
    }

    if (conversations && profile && user?.uid) {
      const lastMsgRead = profile.lastMessageReadAt ? getTs(profile.lastMessageReadAt) : 0;
      const unreadConvs = conversations.filter((c) => {
        if (c.lastSenderId && c.lastSenderId === user.uid) return false;
        const lastMsgTs = getTs(c.lastTimestamp);
        if (!lastMsgTs) return false;
        const convReadTs = c.lastReadBy?.[user.uid] ? getTs(c.lastReadBy[user.uid]) : 0;
        const effectiveReadTs = convReadTs > 0 ? convReadTs : lastMsgRead;
        return lastMsgTs > effectiveReadTs;
      });

      unreadConvs.forEach((c) => {
        const channelLabel =
          c.type === 'group'
            ? c.name || 'Tactical Group'
            : c.lastSenderName || 'Direct Channel';
        const msgDate = c.lastTimestamp?.toDate ? c.lastTimestamp.toDate() : new Date();
        combined.push({
          id: `msg-alert-${c.id}`,
          convId: c.id,
          title: `Unread Transmission: ${channelLabel}`,
          message: c.lastMessage || 'New secure message received.',
          type: 'info',
          category: 'message',
          isRead: false,
          createdAt: msgDate.toISOString(),
          sortDate: msgDate,
          actionHref: '/communication',
        });
      });
    }

    return combined.sort((a, b) => getTs(b.sortDate) - getTs(a.sortDate));
  }, [notifications, announcements, conversations, profile, user?.uid]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedItems.filter((item) => {
      if (filter === 'unread' && item.isRead) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (q) {
        return (
          (item.title || '').toLowerCase().includes(q) ||
          (item.message || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [combinedItems, filter, categoryFilter, searchQuery]);

  // Pagination Logic
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, categoryFilter, searchQuery]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  const unreadCount = combinedItems.filter((n) => !n.isRead).length;

  const markSingleItemRead = (item: any) => {
    if (!user?.uid || !db) return;
    const now = new Date().toISOString();

    if (item.category === 'personal') {
      updateDocumentNonBlocking(doc(db, 'users', user.uid, 'notifications', item.id), {
        isRead: true,
      });
    } else if (item.category === 'message' && item.convId) {
      updateDocumentNonBlocking(doc(db, 'conversations', item.convId), {
        [`lastReadBy.${user.uid}`]: now,
      });
    } else if (item.category === 'announcement') {
      updateDocumentNonBlocking(doc(db, 'users', user.uid), {
        lastAnnouncementReadAt: now,
        updatedAt: now,
      });
    }
    toast({
      title: t.notificationsPage.toastReadTitle,
      description: t.notificationsPage.toastReadDesc,
    });
  };

  const deleteSingleItem = (item: any) => {
    if (!user?.uid || !db) return;
    if (item.category === 'personal') {
      deleteDocumentNonBlocking(doc(db, 'users', user.uid, 'notifications', item.id));
      toast({
        title: t.notificationsPage.toastRemovedTitle,
        description: t.notificationsPage.toastRemovedDesc,
      });
    } else if (item.category === 'announcement' && isAdmin) {
      deleteDocumentNonBlocking(doc(db, 'announcements', item.id));
      toast({
        title: t.notificationsPage.toastBroadcastRemovedTitle,
        description: t.notificationsPage.toastBroadcastRemovedDesc,
      });
    }
  };

  const handlePublishBroadcast = async () => {
    if (!db || !user || !profile || !broadcastTitle.trim() || !broadcastContent.trim()) return;
    setIsPublishing(true);
    try {
      await addDocumentNonBlocking(collection(db, 'announcements'), {
        title: broadcastTitle.trim(),
        content: broadcastContent.trim(),
        author: profile.fullName,
        authorId: user.uid,
        date: format(new Date(), 'yyyy-MM-dd'),
        timestamp: serverTimestamp(),
      });

      logAuditAction(
        db,
        user,
        profile.fullName,
        'RECORD_CREATED',
        'announcements',
        `Published Bureau Broadcast: "${broadcastTitle.trim()}"`
      );

      toast({
        title: t.notificationsPage.toastPublishedTitle,
        description: t.notificationsPage.toastPublishedDesc,
      });
      setBroadcastTitle('');
      setBroadcastContent('');
      setIsBroadcastModalOpen(false);
    } finally {
      setIsPublishing(false);
    }
  };

  const markAllRead = () => {
    if (!user?.uid || !db) return;

    const now = new Date().toISOString();

    if (notifications) {
      notifications.forEach((n) => {
        if (!n.isRead) {
          updateDocumentNonBlocking(doc(db, 'users', user.uid, 'notifications', n.id), {
            isRead: true,
          });
        }
      });
    }

    if (conversations) {
      conversations.forEach((c) => {
        updateDocumentNonBlocking(doc(db, 'conversations', c.id), {
          [`lastReadBy.${user.uid}`]: now,
        });
      });
    }

    updateDocumentNonBlocking(doc(db, 'users', user.uid), {
      lastAnnouncementReadAt: now,
      lastMessageReadAt: now,
      updatedAt: now,
    });

    toast({
      title: t.notificationsPage.toastAllReadTitle,
      description: t.notificationsPage.toastAllReadDesc,
    });
  };

  const clearAll = () => {
    if (!notifications || !user?.uid || !db || !profile) return;

    const count = notifications.length;

    notifications.forEach((n) => {
      deleteDocumentNonBlocking(doc(db, 'users', user.uid, 'notifications', n.id));
    });

    const now = new Date().toISOString();
    updateDocumentNonBlocking(doc(db, 'users', user.uid), {
      lastAnnouncementReadAt: now,
      lastMessageReadAt: now,
      updatedAt: now,
    });

    logAuditAction(
      db,
      user,
      profile.fullName,
      'RECORD_DELETED',
      'notifications_purge',
      `Intelligence Feed: Purged local notification history (${count} records).`
    );

    toast({
      title: t.notificationsPage.toastClearedTitle,
      description: t.notificationsPage.toastClearedDesc,
    });
  };

  const getOptionAVariant = (item: any): 'success' | 'info' | 'warning' | 'destructive' => {
    if (item.category === 'announcement') return 'info';
    if (item.category === 'message') return 'warning';
    const rawType = String(item.type || '').toLowerCase();
    const lowerTitle = String(item.title || '').toLowerCase();
    if (
      rawType === 'error' ||
      rawType === 'destructive' ||
      lowerTitle.includes('error') ||
      lowerTitle.includes('fail') ||
      lowerTitle.includes('purge') ||
      lowerTitle.includes('removed')
    ) {
      return 'destructive';
    }
    if (
      rawType === 'warning' ||
      lowerTitle.includes('warn') ||
      lowerTitle.includes('duplicate') ||
      lowerTitle.includes('pending')
    ) {
      return 'warning';
    }
    if (rawType === 'success' || lowerTitle.includes('success') || lowerTitle.includes('verified')) {
      return 'success';
    }
    return 'info';
  };

  const renderOptionABadge = (variant: 'success' | 'info' | 'warning' | 'destructive') => {
    if (variant === 'destructive') {
      return (
        <div
          className="h-7 w-7 rounded-full text-white flex items-center justify-center shrink-0"
          style={{ backgroundColor: '#E54D2E' }}
        >
          <span className="text-[14px] font-bold font-sans leading-none">!</span>
        </div>
      );
    }
    if (variant === 'warning') {
      return (
        <div
          className="h-7 w-7 rounded-full text-white flex items-center justify-center shrink-0"
          style={{ backgroundColor: '#F59E0B' }}
        >
          <span className="text-[14px] font-bold font-sans leading-none">!</span>
        </div>
      );
    }
    if (variant === 'info') {
      return (
        <div
          className="h-7 w-7 rounded-full text-white flex items-center justify-center shrink-0"
          style={{ backgroundColor: '#0066FF' }}
        >
          <span className="text-[13px] font-bold font-sans leading-none">i</span>
        </div>
      );
    }
    return (
      <div
        className="h-7 w-7 rounded-full text-white flex items-center justify-center shrink-0"
        style={{ backgroundColor: '#2EB85C' }}
      >
        <Check className="h-4 w-4 stroke-[2.75] text-white" />
      </div>
    );
  };

  const getOptionABarStyle = (
    variant: 'success' | 'info' | 'warning' | 'destructive',
    pct?: number
  ): React.CSSProperties => {
    const defaultPct =
      typeof pct === 'number'
        ? pct
        : variant === 'info'
        ? 42
        : variant === 'destructive'
        ? 42
        : variant === 'warning'
        ? 36
        : 30;

    if (variant === 'destructive') {
      return {
        width: `${defaultPct}%`,
        backgroundColor: '#E54D2E',
        backgroundImage:
          'repeating-linear-gradient(-45deg, #D93D1E 0px, #D93D1E 4px, #F3684B 4px, #F3684B 8px)',
      };
    }
    if (variant === 'warning') {
      return {
        width: `${defaultPct}%`,
        backgroundColor: '#F59E0B',
        backgroundImage:
          'repeating-linear-gradient(-45deg, #E58E00 0px, #E58E00 4px, #FBB43B 4px, #FBB43B 8px)',
      };
    }
    if (variant === 'info') {
      return {
        width: `${defaultPct}%`,
        backgroundColor: '#0066FF',
        backgroundImage:
          'repeating-linear-gradient(-45deg, #0058DB 0px, #0058DB 4px, #2E85FF 4px, #2E85FF 8px)',
      };
    }
    return {
      width: `${defaultPct}%`,
      backgroundColor: '#2EB85C',
      backgroundImage:
        'repeating-linear-gradient(-45deg, #25A24E 0px, #25A24E 4px, #44CC70 4px, #44CC70 8px)',
    };
  };

  const optionASamples: Array<{
    id: string;
    label: string;
    variant: 'success' | 'info' | 'warning' | 'destructive';
    pct: number;
  }> = [
    { id: 'success', label: t.notificationsPage.sampleSuccess, variant: 'success', pct: 30 },
    { id: 'info', label: t.notificationsPage.sampleInfo, variant: 'info', pct: 42 },
    { id: 'warning', label: t.notificationsPage.sampleWarning, variant: 'warning', pct: 36 },
    { id: 'destructive', label: t.notificationsPage.sampleError, variant: 'destructive', pct: 42 },
  ];

  if (isUserLoading || isNotisLoading || isAnnLoading || isConvsLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 p-3 rounded-2xl border border-primary/20 shadow-sm">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {t.notificationsPage.eyebrow}
            </p>
            <h1 className="text-3xl font-black tracking-tight text-foreground font-headline">
              {t.notificationsPage.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t.notificationsPage.subtitle}
            </p>
          </div>
        </div>

        {isAdmin && (
          <Button
            onClick={() => setIsBroadcastModalOpen(true)}
            className="h-10 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" /> {t.notificationsPage.broadcastBtn}
          </Button>
        )}
      </div>

      {/* Exact Option A Alert Cards Showcase & Quick Trigger */}
      <div className="rounded-[24px] bg-[#F8FAFC] dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {t.notificationsPage.optionAHeader}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.notificationsPage.optionASubtitle}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {optionASamples.map((sample) => (
            <div
              key={sample.id}
              onClick={() =>
                toast({
                  variant: sample.variant,
                  title: sample.label,
                })
              }
              className="flex flex-col gap-[3px] cursor-pointer group select-none"
            >
              {/* Top White Card */}
              <div className="flex w-full items-center justify-between gap-3.5 rounded-[8px] border border-slate-100 bg-white px-4 py-3.5 text-[#1E293B] shadow-[0_2px_10px_rgba(15,23,42,0.05)] group-hover:shadow-[0_4px_14px_rgba(15,23,42,0.09)] transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {renderOptionABadge(sample.variant)}
                  <span className="text-[13.5px] font-medium text-[#1E293B] dark:text-slate-100 truncate">
                    {sample.label}
                  </span>
                </div>
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#334155] dark:text-slate-400">
                  <span className="text-lg leading-none font-normal">×</span>
                </span>
              </div>
              {/* Bottom Striped Progress Track */}
              <div className="h-[5px] w-full rounded-full bg-[#E5E7EB] dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={getOptionABarStyle(sample.variant, sample.pct)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card p-4 rounded-2xl border border-border shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Tabs
            value={filter}
            onValueChange={(v: any) => setFilter(v)}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid grid-cols-2 w-full sm:w-[260px] bg-muted h-11 p-1">
              <TabsTrigger
                value="all"
                className="font-bold text-[10px] uppercase tracking-widest"
              >
                {t.notificationsPage.tabAllItems.replace('{count}', String(combinedItems.length))}
              </TabsTrigger>
              <TabsTrigger
                value="unread"
                className="font-bold text-[10px] uppercase tracking-widest"
              >
                {t.notificationsPage.tabUnread.replace('{count}', String(unreadCount))}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none font-bold text-[10px] uppercase tracking-widest border-border bg-background hover:bg-muted"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="mr-2 h-3.5 w-3.5" /> {t.notificationsPage.markAllReadBtn}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none font-bold text-[10px] uppercase tracking-widest border-destructive/20 text-destructive bg-background hover:bg-destructive/5"
              onClick={clearAll}
              disabled={!notifications?.length}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> {t.notificationsPage.clearHistoryBtn}
            </Button>
          </div>
        </div>

        {/* Category Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: t.notificationsPage.catAll },
                { id: 'announcement', label: t.notificationsPage.catAnnouncements },
                { id: 'message', label: t.notificationsPage.catMessages },
                { id: 'personal', label: t.notificationsPage.catPersonal },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer',
                  categoryFilter === cat.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t.notificationsPage.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 rounded-xl text-xs"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3.5">
        {paginatedItems.length > 0 ? (
          paginatedItems.map((item) => {
            const variant = getOptionAVariant(item);
            const canDelete =
              item.category === 'personal' || (item.category === 'announcement' && isAdmin);

            return (
              <div key={item.id} className="flex flex-col gap-[3px] w-full group">
                {/* Top White Card (Exact Option A) */}
                <div
                  className={cn(
                    'flex w-full items-center justify-between gap-3.5 rounded-[8px] border border-slate-100 bg-white px-4 py-3.5 text-[#1E293B] shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-all hover:shadow-[0_4px_14px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
                    !item.isRead && 'ring-1 ring-slate-200 dark:ring-slate-700'
                  )}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {renderOptionABadge(variant)}
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[13.5px] font-medium text-[#1E293B] dark:text-slate-100 leading-snug">
                          {item.title}
                        </h3>
                        {item.category === 'announcement' && (
                          <span className="text-[9px] font-bold uppercase bg-blue-50 text-[#0066FF] dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 rounded-full">
                            {t.notificationsPage.broadcastTag}
                          </span>
                        )}
                        {item.category === 'message' && (
                          <span className="text-[9px] font-bold uppercase bg-amber-50 text-[#F59E0B] dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full">
                            {t.notificationsPage.messageTag}
                          </span>
                        )}
                        {!item.isRead && (
                          <span className="text-[9px] font-bold uppercase text-[#0066FF]">
                            {t.notificationsPage.unreadTag}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 ml-auto">
                          {formatDate(item.createdAt, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {item.message && (
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                          {item.message}
                        </p>
                      )}
                      {item.actionHref && (
                        <div className="pt-2">
                          <Link
                            href={item.actionHref}
                            className="inline-flex items-center text-[11px] font-semibold text-[#0066FF] hover:underline"
                          >
                            {t.notificationsPage.openTerminalLink} <ArrowRight className="ml-1 h-3 w-3" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={() => markSingleItemRead(item)}
                        className="inline-flex h-6 px-2 items-center justify-center rounded text-[10px] font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                        title={t.notificationsPage.markReadTooltip}
                      >
                        {t.notificationsPage.readBtn}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        canDelete ? deleteSingleItem(item) : markSingleItemRead(item)
                      }
                      className="inline-flex h-6 w-6 items-center justify-center text-[#334155] hover:text-slate-950 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
                      title={canDelete ? t.notificationsPage.dismissTooltip : t.notificationsPage.acknowledgeTooltip}
                    >
                      <span className="text-lg leading-none font-normal">×</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Striped Progress Track (Exact Option A) */}
                <div className="h-[5px] w-full rounded-full bg-[#E5E7EB] dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={getOptionABarStyle(variant, item.isRead ? 100 : undefined)}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-[24px] border border-dashed border-border shadow-inner">
            <div className="p-5 bg-muted rounded-full border border-border shadow-sm mb-4">
              <Bell className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">{t.notificationsPage.emptyTitle}</h3>
            <p className="text-xs text-muted-foreground font-medium">
              {t.notificationsPage.emptyDesc}
            </p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-6 bg-card border border-border rounded-[32px] shadow-sm gap-6 mt-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {t.notificationsPage.showingPagination
                  .replace('{showing}', String(paginatedItems.length))
                  .replace('{total}', String(filteredItems.length))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-11 w-11 p-0 rounded-xl border-border bg-background hover:bg-muted"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center justify-center min-w-[120px] h-11 text-[10px] font-black text-foreground bg-muted/50 border border-border rounded-xl uppercase tracking-widest px-4">
                {t.notificationsPage.pageOfTotal
                  .replace('{current}', String(currentPage))
                  .replace('{total}', String(totalPages))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-11 w-11 p-0 rounded-xl border-border bg-background hover:bg-muted"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-primary/[0.03] border border-primary/10 rounded-[32px] flex items-center gap-4">
        <ShieldCheck className="h-6 w-6 text-primary shrink-0 opacity-40" />
        <p className="text-[10px] text-foreground font-bold uppercase leading-relaxed tracking-widest">
          {t.notificationsPage.footerNote}
        </p>
      </div>

      {/* Admin Quick Broadcast Composer Modal */}
      <Dialog open={isBroadcastModalOpen} onOpenChange={setIsBroadcastModalOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight">
              <Megaphone className="h-5 w-5 text-primary" />
              {t.notificationsPage.modalTitle}
            </DialogTitle>
            <DialogDescription>
              {t.notificationsPage.modalDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {t.notificationsPage.broadcastTitleLabel}
              </label>
              <Input
                placeholder={t.notificationsPage.broadcastTitlePlaceholder}
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {t.notificationsPage.broadcastContentLabel}
              </label>
              <Textarea
                placeholder={t.notificationsPage.broadcastContentPlaceholder}
                value={broadcastContent}
                onChange={(e) => setBroadcastContent(e.target.value)}
                rows={4}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBroadcastModalOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              {t.common.cancel}
            </Button>
            <Button
              onClick={handlePublishBroadcast}
              disabled={isPublishing || !broadcastTitle.trim() || !broadcastContent.trim()}
              className="rounded-xl text-xs font-bold"
            >
              {isPublishing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {t.notificationsPage.publishBroadcastBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
