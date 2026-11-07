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
      title: 'Alert Acknowledged',
      description: 'Marked item as read.',
    });
  };

  const deleteSingleItem = (item: any) => {
    if (!user?.uid || !db) return;
    if (item.category === 'personal') {
      deleteDocumentNonBlocking(doc(db, 'users', user.uid, 'notifications', item.id));
      toast({
        title: 'Notification Removed',
        description: 'Personal alert removed from history.',
      });
    } else if (item.category === 'announcement' && isAdmin) {
      deleteDocumentNonBlocking(doc(db, 'announcements', item.id));
      toast({
        title: 'Broadcast Removed',
        description: 'Official broadcast deleted.',
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
        title: 'Official Broadcast Published',
        description: 'Your announcement has been transmitted to all active personnel.',
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
      title: 'Terminal Synchronized',
      description: 'All operational alerts and broadcasts acknowledged.',
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
      title: 'Archive Purged',
      description: 'Intelligence feed history has been cleared and signed into the ledger.',
    });
  };

  const getTypeIcon = (item: any) => {
    if (item.category === 'announcement') return <Megaphone className="h-5 w-5 text-primary" />;
    if (item.category === 'message') return <MessageSquare className="h-5 w-5 text-amber-500" />;

    switch (item.type) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

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
              Bureau Operational Log
            </p>
            <h1 className="text-3xl font-black tracking-tight text-foreground font-headline">
              Intelligence Feed
            </h1>
            <p className="text-sm text-muted-foreground">
              Synchronized personal alerts, transmissions, and bureau-wide announcements.
            </p>
          </div>
        </div>

        {isAdmin && (
          <Button
            onClick={() => setIsBroadcastModalOpen(true)}
            className="h-10 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Broadcast Announcement
          </Button>
        )}
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
                All Items ({combinedItems.length})
              </TabsTrigger>
              <TabsTrigger
                value="unread"
                className="font-bold text-[10px] uppercase tracking-widest"
              >
                Unread ({unreadCount})
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
              <CheckCheck className="mr-2 h-3.5 w-3.5" /> Mark All Read
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none font-bold text-[10px] uppercase tracking-widest border-destructive/20 text-destructive bg-background hover:bg-destructive/5"
              onClick={clearAll}
              disabled={!notifications?.length}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Clear History
            </Button>
          </div>
        </div>

        {/* Category Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All Channels' },
                { id: 'announcement', label: 'Official Broadcasts' },
                { id: 'message', label: 'Secure Messages' },
                { id: 'personal', label: 'Personal Alerts' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer',
                  categoryFilter === cat.id
                    ? 'bg-primary text-primary-foreground shadow-2xs'
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
              placeholder="Search feed..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 rounded-xl text-xs"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {paginatedItems.length > 0 ? (
          paginatedItems.map((item) => (
            <Card
              key={item.id}
              className={cn(
                'border-none shadow-sm transition-all hover:shadow-md bg-card overflow-hidden group',
                !item.isRead && 'ring-1 ring-primary/20',
                item.category === 'announcement' && 'bg-primary/[0.02]',
                item.category === 'message' && 'bg-amber-500/[0.02]'
              )}
            >
              <CardContent className="p-6 flex items-start gap-5">
                <div className="mt-1 p-2.5 rounded-xl bg-muted/50 border border-border">
                  {getTypeIcon(item)}
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-bold text-foreground text-sm tracking-tight">
                        {item.title}
                      </h3>
                      {item.category === 'announcement' && (
                        <span className="text-[9px] font-black uppercase bg-primary text-primary-foreground px-2 py-0.5 rounded-full tracking-tighter">
                          Official Broadcast
                        </span>
                      )}
                      {item.category === 'message' && (
                        <span className="text-[9px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full tracking-tighter">
                          Secure Channel
                        </span>
                      )}
                      {!item.isRead && (
                        <span className="text-[8px] font-black uppercase text-primary animate-pulse">
                          New
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-tighter">
                        {format(new Date(item.createdAt), 'MMM dd • HH:mm')}
                      </span>
                      {!item.isRead && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markSingleItemRead(item)}
                          className="h-7 px-2 text-[9px] font-black uppercase tracking-wider text-primary"
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3 mr-1" /> Read
                        </Button>
                      )}
                      {(item.category === 'personal' ||
                        (item.category === 'announcement' && isAdmin)) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteSingleItem(item)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                    {item.message}
                  </p>
                  {item.actionHref && (
                    <div className="pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-[10px] font-black uppercase tracking-widest rounded-lg"
                        asChild
                      >
                        <Link href={item.actionHref}>
                          Open Terminal <ArrowRight className="ml-2 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
                {!item.isRead && (
                  <div className="h-2 w-2 rounded-full bg-primary mt-2 shadow-[0_0_8px_rgba(var(--primary),0.5)] shrink-0" />
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-32 bg-card rounded-[32px] border border-dashed border-border shadow-inner">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-primary/5 rounded-full blur-3xl opacity-50" />
              <div className="p-8 bg-muted rounded-full relative z-10 border border-border shadow-sm">
                <Bell className="h-16 w-16 text-muted-foreground/20" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Operational Calm</h3>
            <p className="text-sm text-muted-foreground font-medium italic">
              No pending alerts or notifications for your unit.
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
                Visualizing {paginatedItems.length} of {filteredItems.length} Intelligence Items
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
                Page {currentPage} of {totalPages}
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
          Intelligence Protocol: The feed above integrates real-time signals from bureau response
          channels, personal system alerts, and central command broadcasts. Bulk clearing actions
          are signed into the forensic audit ledger to maintain operational accountability.
        </p>
      </div>

      {/* Admin Quick Broadcast Composer Modal */}
      <Dialog open={isBroadcastModalOpen} onOpenChange={setIsBroadcastModalOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight">
              <Megaphone className="h-5 w-5 text-primary" />
              Transmit Bureau Broadcast
            </DialogTitle>
            <DialogDescription>
              Publish an official announcement to all field units and personnel feeds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Broadcast Title
              </label>
              <Input
                placeholder="e.g., Monthly SLA Verification Target Update"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Message Content
              </label>
              <Textarea
                placeholder="Enter official directive or announcement details..."
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
              Cancel
            </Button>
            <Button
              onClick={handlePublishBroadcast}
              disabled={isPublishing || !broadcastTitle.trim() || !broadcastContent.trim()}
              className="rounded-xl text-xs font-bold"
            >
              {isPublishing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Publish Broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
