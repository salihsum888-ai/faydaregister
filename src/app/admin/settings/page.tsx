
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, query, limit, serverTimestamp } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { SystemSettings, UserProfile, Registration, DailyReport, MonthlySummary } from '@/lib/types';
import { 
  Settings, 
  Image as ImageIcon, 
  Layout, 
  Loader2, 
  Save, 
  RefreshCcw, 
  Edit3, 
  Mail, 
  Phone, 
  MapPin, 
  ShieldCheck,
  Globe,
  Shield,
  Zap,
  Lock,
  Unlock,
  Eye,
  Languages,
  CalendarClock,
  Activity,
  UserCircle,
  CheckCircle2,
  XCircle,
  Moon,
  Sun,
  FileSpreadsheet,
  Database,
} from 'lucide-react';
import Image from 'next/image';
import { logAuditAction } from '@/lib/audit';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

const DEFAULT_LOGO = "https://services.eaes.et/NID-Logos/Fayda%20For%20Ethiopia%20logo-%20english-2-01.png";

export default function AdminSettingsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssetValidating, setIsAssetValidating] = useState(false);
  const [assetStatus, setAssetStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');

  const [formData, setFormData] = useState({
    bureauName: '',
    logoUrl: '',
    contactEmail: '',
    contactPhone: '',
    officeAddress: '',
    operationalHours: '',
    systemProtocol: '',
    maintenanceMode: false,
    publicLookupEnabled: true,
    primaryLanguage: 'English',
    dateFormat: 'MMM dd, yyyy',
  });

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const brandingRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'system_settings', 'branding');
  }, [db]);
  const { data: branding, isLoading } = useDoc<SystemSettings>(brandingRef);

  // Step 5: Queries for 1-Click Full Bureau Multi-Sheet Excel Backup
  const backupRegsQuery = useMemoFirebase(
    () => (db && user ? query(collection(db, 'registrations'), limit(10000)) : null),
    [db, user]
  );
  const backupDailyQuery = useMemoFirebase(
    () => (db && user ? query(collection(db, 'daily_reports'), limit(10000)) : null),
    [db, user]
  );
  const backupMonthlyQuery = useMemoFirebase(
    () => (db && user ? query(collection(db, 'monthly_summaries'), limit(5000)) : null),
    [db, user]
  );
  const backupUsersQuery = useMemoFirebase(
    () => (db && user ? query(collection(db, 'users'), limit(2000)) : null),
    [db, user]
  );

  const { data: allRegsBackup } = useCollection<Registration>(backupRegsQuery);
  const { data: allDailyBackup } = useCollection<DailyReport>(backupDailyQuery);
  const { data: allMonthlyBackup } = useCollection<MonthlySummary>(backupMonthlyQuery);
  const { data: allUsersBackup } = useCollection<UserProfile>(backupUsersQuery);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const handleExportFullBureauBackup = () => {
    setIsExportingBackup(true);
    try {
      const wb = XLSX.utils.book_new();

      const regRows = (allRegsBackup || []).map((r, i) => ({
        'No.': i + 1,
        '29-Digit RID': r.id,
        'Applicant Name': r.applicantName,
        Phone: r.phone || '',
        Status: r.status,
        'Rejection / Failure Reason': r.rejectionReason || '',
        Institution: r.institutionName || r.schoolName || '',
        Location: r.location || '',
        'Submission Date': r.submissionDate || '',
        Officer: r.officer || '',
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(regRows.length ? regRows : [{ Info: 'No registrations' }]),
        'Registrations'
      );

      const dailyRows = (allDailyBackup || []).map((d, i) => ({
        'No.': i + 1,
        Date: d.date,
        'Officer ID': d.officerId,
        'Ethio Count': d.ethioCount,
        'Safaricom Count': d.safaricomCount,
        Total: d.total,
        Institution: d.institutionName || d.schoolName || '',
        Remarks: d.remarks || '',
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(dailyRows.length ? dailyRows : [{ Info: 'No daily reports' }]),
        'Daily_Reports'
      );

      const monthlyRows = (allMonthlyBackup || []).map((m, i) => ({
        'No.': i + 1,
        Month: m.month,
        Year: m.year,
        'Officer ID': m.officerId,
        'Ethio Total': m.ethio,
        'Safaricom Total': m.safaricom,
        'Grand Total': m.total,
        Processed: m.processed,
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          monthlyRows.length ? monthlyRows : [{ Info: 'No monthly summaries' }]
        ),
        'Monthly_Summaries'
      );

      const userRows = (allUsersBackup || []).map((u, i) => ({
        'No.': i + 1,
        'Full Name': u.fullName,
        Email: u.email,
        Role: u.role,
        Region: u.region || '',
        Cluster: u.cluster || '',
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(userRows.length ? userRows : [{ Info: 'No personnel' }]),
        'Personnel'
      );

      const filename = `Fayda_Full_Bureau_Backup_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
      XLSX.writeFile(wb, filename);

      if (db && user && profile) {
        logAuditAction(
          db,
          user,
          profile.fullName,
          'PERFORMANCE_REVIEW',
          'bureau_backup',
          `Exported Full Bureau Multi-Sheet Excel Backup (${regRows.length} registrations, ${dailyRows.length} daily logs, ${monthlyRows.length} monthly archives, ${userRows.length} personnel).`
        );
      }

      toast({
        title: 'Full Bureau Backup Exported',
        description: `Downloaded 4-sheet workbook (${filename}).`,
      });
    } finally {
      setTimeout(() => setIsExportingBackup(false), 500);
    }
  };

  useEffect(() => {
    if (branding) {
      setFormData({
        bureauName: branding.bureauName || 'FaydaTrack',
        logoUrl: branding.logoUrl || DEFAULT_LOGO,
        contactEmail: branding.contactEmail || '',
        contactPhone: branding.contactPhone || '',
        officeAddress: branding.officeAddress || '',
        operationalHours: branding.operationalHours || '',
        systemProtocol: branding.systemProtocol || 'Protocol v4.2',
        maintenanceMode: !!branding.maintenanceMode,
        publicLookupEnabled: branding.publicLookupEnabled !== false,
        primaryLanguage: branding.primaryLanguage || 'English',
        dateFormat: branding.dateFormat || 'MMM dd, yyyy',
      });
    }
  }, [branding]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'logoUrl') setAssetStatus('idle');
  };

  const toggleSwitch = (name: string) => {
    setFormData(prev => ({ ...prev, [name]: !prev[name as keyof typeof prev] }));
  };

  const validateAsset = async () => {
    if (!formData.logoUrl) return;
    setIsAssetValidating(true);
    setAssetStatus('idle');
    
    try {
      const img = new window.Image();
      img.src = formData.logoUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      setAssetStatus('valid');
      toast({ title: "Asset Verified", description: "The logo source is reachable and valid." });
    } catch {
      setAssetStatus('invalid');
      toast({ title: "Verification Failed", description: "The logo source could not be resolved.", variant: "destructive" });
    } finally {
      setIsAssetValidating(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user || !profile) return;

    setIsSaving(true);
    try {
      await setDocumentNonBlocking(doc(db, 'system_settings', 'branding'), {
        ...formData,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      logAuditAction(
        db, 
        user, 
        profile.fullName,
        'BRANDING_UPDATE', 
        'branding', 
        `Global Protocol Update: Synchronized branding and institutional gates. Maintenance: ${formData.maintenanceMode ? 'ACTIVE' : 'OFF'}.`
      );

      toast({
        title: "Profile Synchronized",
        description: "Institutional branding and gate protocols updated globally.",
      });
      setIsEditing(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: "Protocol error during identity synchronization.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFormData({
      bureauName: 'FaydaTrack',
      logoUrl: DEFAULT_LOGO,
      contactEmail: 'support@fayda.com',
      contactPhone: '+251 11 000 0000',
      officeAddress: 'Addis Ababa, HQ',
      operationalHours: 'Mon-Fri, 8:30 AM - 5:30 PM',
      systemProtocol: 'Protocol v4.2',
      maintenanceMode: false,
      publicLookupEnabled: true,
      primaryLanguage: 'English',
      dateFormat: 'MMM dd, yyyy',
    });
    setAssetStatus('idle');
    toast({ title: "Defaults Restored", description: "Standard bureau configuration loaded." });
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Synchronizing Root Config</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-700 pb-20">
      {/* Header Command */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
             <div className="px-2 py-0.5 bg-primary/10 rounded border border-primary/20 text-[9px] font-black text-primary uppercase tracking-widest">
               Root Configuration
             </div>
             {profile && (
               <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">
                 <UserCircle className="h-3 w-3" /> Signed: {profile.fullName}
               </div>
             )}
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground font-headline uppercase leading-none">Branding Terminal</h1>
          <p className="text-sm text-muted-foreground">Institutional identity, global gate protocols, and localized system standards.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleExportFullBureauBackup}
            disabled={isExportingBackup}
            className="w-full sm:w-auto h-14 px-6 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-black uppercase tracking-widest text-[10px] rounded-2xl"
          >
            {isExportingBackup ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Full Bureau Backup (.xlsx)
          </Button>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} className="w-full sm:w-auto h-14 px-10 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/10 transition-all hover:scale-[1.02] active:scale-95">
              <Edit3 className="mr-2 h-4 w-4" /> Enter Configuration Mode
            </Button>
          ) : (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button variant="outline" onClick={() => setIsEditing(false)} className="flex-1 sm:flex-none h-14 px-8 font-black text-[10px] uppercase tracking-widest border-border bg-card rounded-2xl">
                 Abort
              </Button>
              <Button onClick={handleSaveSettings} disabled={isSaving} className="flex-1 sm:flex-none h-14 px-12 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/10 transition-all active:scale-95">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Commit Global Config
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form Controls */}
        <div className="xl:col-span-8 space-y-8">
          {isEditing ? (
            <div className="space-y-8 animate-in slide-in-from-left-4 duration-500">
              {/* Identity & Asset Validation */}
              <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-[32px]">
                <CardHeader className="bg-muted/30 border-b border-border p-8">
                  <CardTitle className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-primary" /> Institutional Assets
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Bureau Designation</Label>
                      <Input name="bureauName" value={formData.bureauName} onChange={handleInputChange} className="h-12 rounded-xl bg-background border-border font-bold" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">System Protocol ID</Label>
                      <Input name="systemProtocol" value={formData.systemProtocol} onChange={handleInputChange} className="h-12 rounded-xl bg-background border-border font-black text-primary uppercase text-[10px] tracking-widest" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Official Logo Source (URL)</Label>
                    <div className="flex gap-2">
                       <div className="relative flex-1 group">
                         <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                         <Input name="logoUrl" value={formData.logoUrl} onChange={handleInputChange} className="h-12 pl-10 rounded-xl bg-background border-border text-xs" />
                       </div>
                       <Button 
                         variant="outline" 
                         type="button" 
                         onClick={validateAsset}
                         disabled={isAssetValidating}
                         className={cn(
                           "h-12 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest border-border bg-background transition-all",
                           assetStatus === 'valid' && "border-emerald-500/50 text-emerald-600 bg-emerald-500/5",
                           assetStatus === 'invalid' && "border-rose-500/50 text-rose-600 bg-rose-500/5"
                         )}
                       >
                         {isAssetValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                          assetStatus === 'valid' ? <CheckCircle2 className="h-4 w-4" /> :
                          assetStatus === 'invalid' ? <XCircle className="h-4 w-4" /> : 'Verify'}
                       </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Operational Gate Protocols */}
              <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-[32px]">
                <CardHeader className="bg-muted/30 border-b border-border p-8">
                  <CardTitle className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> Operational Gateways
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="flex items-center justify-between p-6 bg-muted/20 rounded-2xl border border-border group transition-all hover:bg-card">
                        <div className="space-y-1">
                           <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-foreground uppercase">Maintenance Mode</p>
                              {formData.maintenanceMode ? <Lock className="h-3 w-3 text-rose-500" /> : <Unlock className="h-3 w-3 text-emerald-500" />}
                           </div>
                           <p className="text-[10px] text-muted-foreground font-medium">Disable field entry and status portals globally.</p>
                        </div>
                        <Switch checked={formData.maintenanceMode} onCheckedChange={() => toggleSwitch('maintenanceMode')} />
                     </div>

                     <div className="flex items-center justify-between p-6 bg-muted/20 rounded-2xl border border-border group transition-all hover:bg-card">
                        <div className="space-y-1">
                           <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-foreground uppercase">Public RID Gateway</p>
                              <Globe className="h-3 w-3 text-primary opacity-40" />
                           </div>
                           <p className="text-[10px] text-muted-foreground font-medium">Allow external status lookups via resident portal.</p>
                        </div>
                        <Switch checked={formData.publicLookupEnabled} onCheckedChange={() => toggleSwitch('publicLookupEnabled')} />
                     </div>
                  </div>
                </CardContent>
              </Card>

              {/* Localization & Contact Protocols */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-[32px]">
                    <CardHeader className="bg-muted/30 border-b border-border py-4 px-8">
                      <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                        <Languages className="h-3 w-3" /> Localization
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8 space-y-6">
                      <div className="space-y-2">
                         <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Primary Language</Label>
                         <Select value={formData.primaryLanguage} onValueChange={(v) => setFormData(prev => ({...prev, primaryLanguage: v}))}>
                            <SelectTrigger className="h-11 rounded-xl bg-background border-border font-bold text-xs">
                               <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="English" className="font-bold">English (UK)</SelectItem>
                               <SelectItem value="Amharic" className="font-bold">Amharic (Official)</SelectItem>
                               <SelectItem value="Oromo" className="font-bold">Afaan Oromo</SelectItem>
                            </SelectContent>
                         </Select>
                      </div>
                      <div className="space-y-2">
                         <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Date Protocol</Label>
                         <div className="relative group">
                            <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30" />
                            <Input name="dateFormat" value={formData.dateFormat} onChange={handleInputChange} placeholder="MMM dd, yyyy" className="h-11 pl-10 rounded-xl bg-background border-border text-xs font-mono font-bold" />
                         </div>
                      </div>
                    </CardContent>
                 </Card>

                 <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-[32px]">
                    <CardHeader className="bg-muted/30 border-b border-border py-4 px-8">
                      <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                        <Mail className="h-3 w-3" /> Contact Matrix
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8 space-y-4">
                       <Input name="contactEmail" value={formData.contactEmail} onChange={handleInputChange} placeholder="Email Protocol" className="h-11 rounded-xl bg-background border-border text-xs" />
                       <Input name="contactPhone" value={formData.contactPhone} onChange={handleInputChange} placeholder="Phone Protocol" className="h-11 rounded-xl bg-background border-border text-xs" />
                       <Input name="officeAddress" value={formData.officeAddress} onChange={handleInputChange} placeholder="Physical Deployment Address" className="h-11 rounded-xl bg-background border-border text-xs" />
                    </CardContent>
                 </Card>
              </div>

              <div className="pt-4 flex justify-start">
                <Button type="button" variant="ghost" onClick={handleReset} className="font-bold text-[9px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-all">
                   <RefreshCcw className="mr-2 h-3 w-3" /> Restore Institutional Defaults
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
               <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-[32px]">
                  <CardHeader className="bg-primary/5 border-b border-border p-8 md:p-12">
                     <div className="flex flex-col md:flex-row items-center gap-10">
                        <div className="h-28 w-28 relative rounded-3xl overflow-hidden border-2 border-background shadow-2xl bg-white p-3 shrink-0">
                           <Image src={formData.logoUrl || DEFAULT_LOGO} alt="Bureau Logo" fill sizes="112px" className="object-contain" unoptimized />
                        </div>
                        <div className="space-y-3 text-center md:text-left">
                           <div className="flex flex-wrap justify-center md:justify-start items-center gap-3">
                              <h2 className="text-3xl md:text-4xl font-black text-foreground tracking-tighter uppercase leading-none">{formData.bureauName}</h2>
                              <div className="px-2.5 py-1 bg-primary text-primary-foreground text-[9px] font-black uppercase rounded-lg tracking-widest">{formData.systemProtocol}</div>
                           </div>
                           <p className="text-muted-foreground font-medium max-w-lg leading-relaxed">Official institution identity synchronized with all regional terminals and field response units.</p>
                        </div>
                     </div>
                  </CardHeader>
                  <CardContent className="p-10 md:p-12 space-y-12">
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                        <InfoSection label="Contact Matrix" icon={Mail}>
                           <div className="space-y-4">
                              <div className="flex items-center gap-3 group">
                                 <div className="p-2 bg-muted rounded-xl transition-colors group-hover:bg-primary/10 group-hover:text-primary"><Mail className="h-4 w-4" /></div>
                                 <p className="text-sm font-black text-foreground">{formData.contactEmail || 'Not established'}</p>
                              </div>
                              <div className="flex items-center gap-3 group">
                                 <div className="p-2 bg-muted rounded-xl transition-colors group-hover:bg-primary/10 group-hover:text-primary"><Phone className="h-4 w-4" /></div>
                                 <p className="text-sm font-black text-foreground">{formData.contactPhone || 'Not established'}</p>
                              </div>
                           </div>
                        </InfoSection>

                        <InfoSection label="Deployment Gateways" icon={Shield}>
                           <div className="space-y-4">
                              <div className="flex items-center justify-between group">
                                 <div className="flex items-center gap-3">
                                    <div className={cn("p-2 rounded-xl", formData.maintenanceMode ? "bg-rose-500/10 text-rose-500" : "bg-muted text-muted-foreground")}><Lock className="h-4 w-4" /></div>
                                    <p className="text-[10px] font-black uppercase tracking-widest">Maintenance</p>
                                 </div>
                                 <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded", formData.maintenanceMode ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground")}>{formData.maintenanceMode ? 'Active' : 'Offline'}</span>
                              </div>
                              <div className="flex items-center justify-between group">
                                 <div className="flex items-center gap-3">
                                    <div className={cn("p-2 rounded-xl", formData.publicLookupEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground")}><Globe className="h-4 w-4" /></div>
                                    <p className="text-[10px] font-black uppercase tracking-widest">Public RID</p>
                                 </div>
                                 <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded", formData.publicLookupEnabled ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>{formData.publicLookupEnabled ? 'Enabled' : 'Disabled'}</span>
                              </div>
                           </div>
                        </InfoSection>

                        <InfoSection label="Institutional Pulse" icon={Activity}>
                           <div className="space-y-4">
                              <div className="flex items-center gap-3 group">
                                 <div className="p-2 bg-muted rounded-xl"><Languages className="h-4 w-4" /></div>
                                 <p className="text-sm font-black text-foreground">{formData.primaryLanguage}</p>
                              </div>
                              <div className="flex items-center gap-3 group">
                                 <div className="p-2 bg-muted rounded-xl"><CalendarClock className="h-4 w-4" /></div>
                                 <p className="text-xs font-mono font-bold text-muted-foreground">{formData.dateFormat}</p>
                              </div>
                           </div>
                        </InfoSection>
                     </div>

                     <div className="pt-10 border-t border-border border-dashed flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                           <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
                              <ShieldCheck className="h-6 w-6 text-emerald-600" />
                           </div>
                           <div className="space-y-0.5">
                              <p className="text-xs font-black text-foreground uppercase tracking-widest">Profile Verified</p>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Institutional Authenticity Guaranteed by Audit</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-xl border border-border">
                           <Zap className="h-3.5 w-3.5 text-amber-500" />
                           <span className="text-[9px] font-mono font-bold text-muted-foreground uppercase opacity-60">REF: branding_root_001_stable</span>
                        </div>
                     </div>
                  </CardContent>
               </Card>
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Preview Suite */}
        <div className="xl:col-span-4 space-y-8 sticky top-24">
           <Card className="border border-border bg-card overflow-hidden rounded-[32px] shadow-2xl">
              <CardHeader className="bg-muted/30 border-b border-border py-4 px-8 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                  <Layout className="h-3 w-3" /> Terminal Simulator
                </CardTitle>
                <div className="flex items-center gap-1.5 p-1 bg-background rounded-lg border border-border">
                   <button 
                    onClick={() => setPreviewTheme('light')} 
                    className={cn("p-1.5 rounded transition-all", previewTheme === 'light' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}
                   >
                     <Sun className="h-3 w-3" />
                   </button>
                   <button 
                    onClick={() => setPreviewTheme('dark')} 
                    className={cn("p-1.5 rounded transition-all", previewTheme === 'dark' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}
                   >
                     <Moon className="h-3 w-3" />
                   </button>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-12">
                 <div className={cn(
                   "p-1 bg-muted/40 border border-border rounded-[24px] transition-colors duration-500",
                   previewTheme === 'dark' ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                 )}>
                   {/* Navbar Preview */}
                   <div className="space-y-3 p-4">
                      <p className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest text-center">Global Header Simulation</p>
                      <div className={cn(
                        "h-14 w-full border rounded-xl flex items-center px-4 justify-between shadow-inner transition-all",
                        previewTheme === 'dark' ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
                      )}>
                         <div className="flex items-center gap-3">
                            <div className="h-7 w-7 relative rounded bg-white p-1 border border-border overflow-hidden">
                               <Image src={formData.logoUrl || DEFAULT_LOGO} alt="Logo" fill sizes="28px" className="object-contain" unoptimized />
                            </div>
                            <span className={cn("text-[9px] font-black tracking-widest uppercase", previewTheme === 'dark' ? "text-slate-100" : "text-slate-900")}>
                              {formData.bureauName.split('Track')[0]}<span className="text-primary italic">Track</span>
                            </span>
                         </div>
                         <div className="flex gap-2">
                            <div className="h-3 w-3 rounded-full bg-primary/20" />
                            <div className="h-3 w-6 rounded bg-primary/10" />
                         </div>
                      </div>
                   </div>

                   {/* Footer Preview */}
                   <div className="space-y-3 p-4 pt-0">
                      <p className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest text-center">Global Footer Simulation</p>
                      <div className={cn(
                        "p-8 border rounded-xl text-center space-y-4 transition-all",
                        previewTheme === 'dark' ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-100 shadow-sm"
                      )}>
                          <div className="flex items-center justify-center gap-3 opacity-60">
                             <div className="h-6 w-6 relative overflow-hidden grayscale">
                                <Image src={formData.logoUrl || DEFAULT_LOGO} alt="Logo" fill sizes="24px" className="object-contain" unoptimized />
                             </div>
                             <span className={cn("text-xs font-black tracking-[0.3em] uppercase", previewTheme === 'dark' ? "text-slate-400" : "text-slate-900")}>{formData.bureauName}</span>
                          </div>
                          <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest leading-relaxed">
                             {formData.officeAddress || 'Bureau Operational Zone'} <br/>
                             Contact: {formData.contactEmail || 'support@system.gov'}
                          </p>
                          <p className="text-[7px] font-bold text-muted-foreground uppercase opacity-40">
                             Audit: <span className="text-emerald-500">Active</span> • {formData.systemProtocol}
                          </p>
                      </div>
                   </div>
                 </div>

                 {/* Operational Indicator Simulator */}
                 <div className="space-y-4">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest text-center">Gate Status Simulator</p>
                    <div className="grid grid-cols-2 gap-3">
                       <div className={cn("p-4 rounded-2xl border text-center space-y-1 transition-all", formData.maintenanceMode ? "bg-rose-500/10 border-rose-500/20" : "bg-muted/30 border-border")}>
                          <Lock className={cn("h-4 w-4 mx-auto mb-1", formData.maintenanceMode ? "text-rose-500" : "text-muted-foreground/30")} />
                          <p className="text-[9px] font-black uppercase tracking-tighter">Maintenance</p>
                          <p className="text-[8px] font-bold uppercase opacity-60">{formData.maintenanceMode ? 'Locked' : 'Open'}</p>
                       </div>
                       <div className={cn("p-4 rounded-2xl border text-center space-y-1 transition-all", formData.publicLookupEnabled ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/10")}>
                          <Globe className={cn("h-4 w-4 mx-auto mb-1", formData.publicLookupEnabled ? "text-emerald-500" : "text-rose-500/40")} />
                          <p className="text-[9px] font-black uppercase tracking-tighter">Public RID</p>
                          <p className="text-[8px] font-bold uppercase opacity-60">{formData.publicLookupEnabled ? 'Online' : 'Disabled'}</p>
                       </div>
                    </div>
                 </div>

                 <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity rotate-12">
                       <ShieldCheck className="h-24 w-24" />
                    </div>
                    <p className="text-[9px] text-amber-700 font-bold uppercase leading-relaxed tracking-[0.1em] relative z-10">
                       Warning: Protocol changes committed here propagate instantly to the Landing Page, Login Portal, and all Field Coordination Channels. Changes are subject to forensic audit log sign-off.
                    </p>
                 </div>
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}

function InfoSection({ label, icon: Icon, children, className }: any) {
   return (
      <div className={cn("space-y-4", className)}>
         <div className="flex items-center gap-2 border-b border-border pb-2">
            <Icon className="h-3 w-3 text-primary" />
            <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{label}</h3>
         </div>
         {children}
      </div>
   );
}
