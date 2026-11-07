
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Megaphone, 
  Send, 
  Trash2, 
  Loader2, 
  ShieldAlert, 
  Edit3, 
  Globe, 
  Users, 
  Target, 
  Zap, 
  History,
  X
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, serverTimestamp, doc } from 'firebase/firestore';
import { deleteDocumentNonBlocking, addDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Announcement, UserProfile } from '@/lib/types';
import { logAuditAction } from '@/lib/audit';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminAnnouncementsPage() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  // Drafting State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<'info' | 'alert' | 'update'>('info');
  const [targetRegion, setTargetRegion] = useState('Global');
  const [targetRole, setTargetRole] = useState<'all' | 'admin' | 'reviewer'>('all');
  
  // Deletion state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [annToDelete, setAnnToDelete] = useState<{id: string, title: string} | null>(null);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const announcementsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'announcements'));
  }, [db, user]);

  const { data: rawAnnouncements, isLoading } = useCollection<Announcement>(announcementsQuery);

  const announcements = useMemo(() => {
    if (!rawAnnouncements) return [];
    return [...rawAnnouncements].sort((a, b) => {
      const getTs = (item: Announcement) => {
        if (item.timestamp?.toDate) return item.timestamp.toDate().getTime();
        return new Date(item.date).getTime();
      };
      return getTs(b) - getTs(a);
    });
  }, [rawAnnouncements]);

  const regions = useMemo(() => {
    if (!announcements) return ['Global'];
    const dynamic = Array.from(new Set(announcements.map(a => a.targetRegion).filter((r): r is string => Boolean(r))));
    return ['Global', ...dynamic, 'Headquarters', 'Regional North', 'Regional South'];
  }, [announcements]);

  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content || !db || !user || !profile) return;

    const payload = {
      title,
      content,
      type,
      targetRegion: targetRegion === 'Global' ? '' : targetRegion,
      targetRole,
      date: new Date().toISOString().split('T')[0],
      timestamp: serverTimestamp(),
    };

    if (editingId) {
      setDocumentNonBlocking(doc(db, 'announcements', editingId), payload, { merge: true });
      logAuditAction(db, user, profile.fullName, 'STATUS_UPDATE', editingId, `Modified broadcast: "${title}" [Target: ${targetRegion}/${targetRole}]`);
      toast({ title: "Broadcast Modified", description: "The instruction has been updated in the intelligence feed." });
    } else {
      addDocumentNonBlocking(collection(db, 'announcements'), payload);
      logAuditAction(db, user, profile.fullName, 'RECORD_CREATED', 'broadcast', `Issued new bureau broadcast: "${title}" [Target: ${targetRegion}/${targetRole}]`);
      toast({ title: "Announcement Published", description: "The broadcast is now live for all targeted bureau staff." });
    }
    
    resetForm();
  };

  const handleEdit = (ann: Announcement) => {
    setEditingId(ann.id);
    setTitle(ann.title);
    setContent(ann.content);
    setType(ann.type);
    setTargetRegion(ann.targetRegion || 'Global');
    setTargetRole(ann.targetRole || 'all');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = () => {
    if (!db || !annToDelete || !user || !profile) return;
    deleteDocumentNonBlocking(doc(db, 'announcements', annToDelete.id));
    logAuditAction(db, user, profile.fullName, 'RECORD_DELETED', annToDelete.id, `Purged bureau broadcast: "${annToDelete.title}"`);
    
    toast({ title: "Announcement Removed", description: "The broadcast has been permanently deleted." });
    setIsDeleteDialogOpen(false);
    setAnnToDelete(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setType('info');
    setTargetRegion('Global');
    setTargetRole('all');
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Bureau Administration</p>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">Broadcast Center</h1>
          <p className="text-sm text-muted-foreground">Manage system-wide telegrams and targeted operational instructions.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-card p-3 rounded-2xl border shadow-sm">
           <div className="flex items-center gap-3 px-4 border-r border-border">
              <div className="p-2 bg-primary/10 rounded-xl"><Megaphone className="h-4 w-4 text-primary" /></div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-tighter">Live Broadcasts</span>
                <span className="text-sm font-black text-foreground">{announcements.length} Active</span>
              </div>
           </div>
           <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-emerald-500/10 rounded-xl"><Users className="h-4 w-4 text-emerald-500" /></div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-tighter">Reach Potential</span>
                <span className="text-sm font-black text-foreground">Global</span>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        <section className="xl:col-span-4">
          <Card className={cn(
            "border border-border shadow-2xl bg-card sticky top-24 rounded-[32px] overflow-hidden transition-all duration-500",
            editingId && "ring-2 ring-primary bg-primary/[0.02]"
          )}>
            <CardHeader className="bg-muted/30 border-b border-border p-8">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-black text-foreground flex items-center gap-3 uppercase tracking-tight">
                  {editingId ? <Edit3 className="h-5 w-5 text-primary" /> : <Megaphone className="h-5 w-5 text-primary" />}
                  {editingId ? 'Modify Telegram' : 'Draft Broadcast'}
                </CardTitle>
                {editingId && (
                  <Button variant="ghost" size="icon" onClick={resetForm} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <CardDescription className="text-xs font-medium">
                {editingId ? 'Updating an active bureau instruction.' : 'Issue a formal update to targeted units.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleCreateAnnouncement} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Subject Matter</Label>
                  <Input 
                    placeholder="e.g. Protocol Alpha Sync" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="h-12 bg-background border-border rounded-xl font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Classification</Label>
                    <Select value={type} onValueChange={(v: any) => setType(v)}>
                      <SelectTrigger className="h-11 bg-background border-border rounded-xl font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info" className="font-bold">Information</SelectItem>
                        <SelectItem value="alert" className="font-bold">Critical Alert</SelectItem>
                        <SelectItem value="update" className="font-bold">Policy Sync</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Target Rank</Label>
                    <Select value={targetRole} onValueChange={(v: any) => setTargetRole(v)}>
                      <SelectTrigger className="h-11 bg-background border-border rounded-xl font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="font-bold">All Personnel</SelectItem>
                        <SelectItem value="reviewer" className="font-bold">Field Officers</SelectItem>
                        <SelectItem value="admin" className="font-bold">Admin Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1 flex items-center gap-2">
                    <Target className="h-3 w-3" /> Targeted Sector
                  </Label>
                  <Select value={targetRegion} onValueChange={setTargetRegion}>
                    <SelectTrigger className="h-11 bg-background border-border rounded-xl font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map(r => (
                        <SelectItem key={r} value={r} className="font-bold">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Message Payload</Label>
                  <Textarea 
                    placeholder="Enter detailed instructions for the field team..." 
                    className="min-h-[160px] resize-none bg-background border-border rounded-2xl text-sm font-medium leading-relaxed"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-primary/10 transition-all active:scale-[0.98]">
                  <Send className="mr-2 h-4 w-4" /> {editingId ? 'Update Instruction' : 'Deploy Telegram'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        <section className="xl:col-span-8 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
              <History className="h-4 w-4" /> Operational History
            </h2>
            <div className="h-px flex-1 bg-border/40 mx-6 hidden md:block" />
            <span className="text-[9px] font-black px-3 py-1 bg-muted rounded-full text-muted-foreground tracking-widest">
              SECURE FEED ACTIVE
            </span>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-40"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>
            ) : announcements.map((ann) => (
              <Card key={ann.id} className="border border-border shadow-sm overflow-hidden group hover:shadow-xl transition-all rounded-[28px] bg-card">
                <div className="flex">
                  <div className={cn(
                    "w-2 transition-all",
                    ann.type === 'alert' ? "bg-red-500" : 
                    ann.type === 'info' ? "bg-blue-500" : "bg-green-500"
                  )} />
                  <CardContent className="p-6 sm:p-8 flex-1">
                    <div className="flex items-start justify-between gap-6">
                      <div className="space-y-4 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-black text-foreground uppercase tracking-tight">{ann.title}</h3>
                          <span className={cn(
                            "text-[9px] font-black uppercase px-2 py-0.5 rounded-lg tracking-widest border",
                            ann.type === 'alert' ? "bg-red-500/10 text-red-600 border-red-500/20" : 
                            ann.type === 'info' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : "bg-green-500/10 text-green-600 border-green-500/20"
                          )}>
                            {ann.type}
                          </span>
                          {ann.type === 'alert' && <Zap className="h-3 w-3 text-red-500 animate-pulse" />}
                        </div>
                        
                        <p className="text-sm text-muted-foreground leading-relaxed font-medium">{ann.content}</p>
                        
                        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border/40">
                           <div className="flex items-center gap-1.5">
                             <Globe className="h-3 w-3 text-muted-foreground/40" />
                             <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{ann.targetRegion || 'Global Sector'}</span>
                           </div>
                           <div className="h-3 w-px bg-border/40" />
                           <div className="flex items-center gap-1.5">
                             <Users className="h-3 w-3 text-muted-foreground/40" />
                             <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{ann.targetRole || 'All Units'}</span>
                           </div>
                           <div className="h-3 w-px bg-border/40" />
                           <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-tighter">Issued: {ann.date}</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5"
                          onClick={() => handleEdit(ann)}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 rounded-xl text-muted-foreground/30 hover:text-red-500 hover:bg-red-500/5"
                          onClick={() => {
                            setAnnToDelete({ id: ann.id, title: ann.title });
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </Card>
            ))}

            {!isLoading && announcements.length === 0 && (
              <div className="flex flex-col items-center justify-center py-40 bg-muted/5 rounded-[40px] border-2 border-dashed text-muted-foreground/20">
                <Megaphone className="h-20 w-20 mb-6 opacity-5" />
                <p className="text-sm font-black uppercase tracking-[0.3em]">Intelligence Feed Empty</p>
                <p className="text-xs font-medium mt-2 italic">Broadcast a protocol to populate the field terminal.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
            <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              <ShieldAlert className="h-10 w-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                Purge Protocol?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                You are about to permanently delete: <span className="text-foreground font-bold">"{annToDelete?.title}"</span>. This instruction will be immediately removed from all officer terminals and signed into the forensic ledger.
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="bg-muted/30 p-6 flex-col sm:flex-col gap-3">
            <AlertDialogAction 
              onClick={confirmDelete}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 transition-all active:scale-[0.98]"
            >
              Confirm Destruction
            </AlertDialogAction>
            <AlertDialogCancel className="w-full h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent hover:bg-card">
              Abort Operation
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
