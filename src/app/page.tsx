
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  Shield, 
  Zap, 
  Database, 
  MessageSquare, 
  Sparkles, 
  Fingerprint, 
  ShieldCheck, 
  LayoutGrid, 
  Mail, 
  Phone, 
  MapPin,
  Activity as ActivityIcon,
  Search,
  CheckCircle2,
  Globe,
  Loader2,
  X,
  ExternalLink,
  FileDigit
} from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import Image from 'next/image';
import { doc } from 'firebase/firestore';
import { SystemSettings, UserProfile } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_LOGO = "https://services.eaes.et/NID-Logos/Fayda%20For%20Ethiopia%20logo-%20english-2-01.png";

export default function LandingPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
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
        title: "Registration ID Required",
        description: "Please enter your 29-digit Registration ID (RID) or open the portal directly.",
        variant: "destructive",
      });
      return;
    }
    if (trimmed.length < 10) {
      toast({
        title: "Incomplete Registration ID",
        description: "Please enter at least 10 digits of your Registration ID to verify status.",
        variant: "destructive",
      });
      return;
    }
    setIsLookupOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen -mt-8 -mx-4 sm:-mx-6 lg:-mx-8 bg-background selection:bg-primary/20">
      {/* Bureau Hero Section - Balanced Above-the-Fold Presence */}
      <section className="relative w-full pt-14 pb-24 lg:pt-24 lg:pb-32 overflow-hidden border-b bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent">
        <div className="absolute top-0 right-0 w-[640px] h-[640px] bg-primary/[0.03] rounded-full blur-[140px] -mr-80 -mt-80 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[480px] h-[480px] bg-primary/[0.02] rounded-full blur-[120px] -ml-48 -mb-48 pointer-events-none" />
        
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

        <div className="container relative z-20 mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-6 md:space-y-8">
            <div className="inline-flex items-center gap-3 text-xs font-semibold text-muted-foreground tracking-wide">
              <span className="text-primary font-bold">{systemProtocol}</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" />
                National Registration & Field Coordination Hub
              </span>
            </div>
            
            <div className="space-y-5">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.02] text-foreground [text-wrap:balance]">
                Official {bureauName.split('Track')[0]}{' '}
                <span className="text-primary">Registration Intelligence.</span>
              </h1>
              
              <p className="text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
                High-security terminal for institutional enrollment tracking, real-time regional coordination, and automated operational triage.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-2">
              <Button size="lg" className="w-full sm:w-auto h-13 px-8 text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 whitespace-nowrap" asChild>
                <Link href={portalHref}>
                  {user ? (profile?.role === 'admin' ? 'Open Command Center' : 'Open Officer Workspace') : 'Officer Terminal Login'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-13 px-6 text-xs font-bold uppercase tracking-widest rounded-xl border-border bg-background/80 hover:bg-muted whitespace-nowrap" asChild>
                <Link href="/full-registration">
                  View Live Registry Pulse
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Public Verification Gateway (Above the Fold Overlap) */}
      {publicEnabled && (
        <section className="relative z-30 -mt-12 mb-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-card border border-border shadow-xl rounded-2xl p-6 sm:p-8 relative overflow-hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                <div className="space-y-1.5 text-left flex-1">
                  <div className="flex items-center gap-2 text-primary">
                    <Search className="h-4 w-4 shrink-0" />
                    <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">Resident Status Gateway</h2>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Enter your 29-digit Registration ID (RID) to check processing status on the official gateway.
                  </p>
                </div>

                <form onSubmit={handleLookup} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
                  <div className="relative w-full sm:w-80 group">
                    <Fingerprint className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                    <Input 
                      placeholder="Enter 29-digit RID..." 
                      className="h-12 pl-10 pr-16 bg-muted/30 border-border focus:border-primary/40 rounded-xl text-xs font-mono font-bold tracking-wider uppercase placeholder:font-sans placeholder:font-medium placeholder:tracking-normal"
                      value={publicRid}
                      onChange={(e) => setPublicRid(e.target.value)}
                      maxLength={29}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      {publicRid && (
                        <button
                          type="button"
                          onClick={() => setPublicRid('')}
                          className="text-muted-foreground/50 hover:text-foreground p-0.5 rounded"
                          title="Clear RID"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
                        {publicRid.length}/29
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="submit" className="flex-1 sm:flex-none h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold text-xs uppercase tracking-wider whitespace-nowrap">
                      Verify RID
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsLookupOpen(true)}
                      className="h-12 px-3.5 rounded-xl border-border text-muted-foreground hover:text-foreground shrink-0"
                      title="Open Official Portal Gateway"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Capabilities Matrix */}
      <section className="w-full py-16 lg:py-28 bg-muted/10 relative">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12 md:mb-16 space-y-2">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">Operational Architecture</p>
            <h2 className="text-2xl md:text-4xl font-black tracking-tight text-foreground">
              Built for High-Volume Field Verification
            </h2>
            <p className="text-sm md:text-base text-muted-foreground">
              Standardized workflows connecting regional registration clusters with central verification and audit ledgers.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InfoCard 
              number="01"
              title="Real-Time Registry Ledger" 
              description="Track 10,000+ enrollment records across regional clusters with instant status synchronization, tabular filtering, and PDF/XLS export."
              icon={Database} 
            />
            <InfoCard 
              number="02"
              title="AI-Assisted Triage" 
              description="Automated submission analysis evaluates required fields and remarks to recommend initial review pathways for field officers."
              icon={Sparkles} 
            />
            <InfoCard 
              number="03"
              title="Tactical Field Coordination" 
              description="Direct and group communication channels with pinned operational advisories and regional broadcast alerts."
              icon={MessageSquare} 
            />
          </div>
        </div>
      </section>

      {/* Bureau Accuracy & Live Terminal Preview Section */}
      <section className="w-full py-16 lg:py-28 border-t relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-5 space-y-8">
              <div className="space-y-4">
                <p className="text-xs font-bold text-primary uppercase tracking-widest">Institutional Reliability</p>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-[1.05] [text-wrap:balance]">
                  Engineered for Complete Accountability.
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed">
                  {bureauName} unifies daily officer intake reports, RID status checks, and cryptographic MFA enforcement into a single auditable workspace.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <StatBox label="Uptime Target" value="99.9%" icon={ShieldCheck} />
                <StatBox label="Sync Latency" value="< 1.0s" icon={Zap} />
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Button variant="outline" className="h-11 px-6 rounded-xl font-bold text-xs uppercase tracking-wider border-border hover:bg-muted" asChild>
                  <Link href="/full-performance">View Performance Analytics</Link>
                </Button>
                <Button variant="ghost" className="h-11 px-5 rounded-xl font-bold text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground" asChild>
                  <Link href="/status-check">Verification Terminal</Link>
                </Button>
              </div>
            </div>

            {/* Interactive Live Terminal Preview Card (Replaces Stretched Logo Box) */}
            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
                <div className="px-5 py-3.5 bg-muted/40 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative h-6 w-6 rounded overflow-hidden border border-border bg-background">
                      <Image src={logoUrl} alt={bureauName} fill sizes="24px" className="object-contain p-0.5" unoptimized />
                    </div>
                    <span className="text-xs font-bold text-foreground tracking-tight">{bureauName} Verification Ledger</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                    {systemProtocol} · MFA Enforced
                  </span>
                </div>

                <div className="p-5 sm:p-6 space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">Daily Intake</p>
                      <p className="text-xl font-mono font-black text-foreground tabular-nums mt-0.5">1,428</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">Verified Rate</p>
                      <p className="text-xl font-mono font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">94.2%</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">Active Clusters</p>
                      <p className="text-xl font-mono font-black text-primary tabular-nums mt-0.5">18 Sectors</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Recent Enrollment Stream</span>
                      <span>Verification State</span>
                    </div>
                    <div className="divide-y divide-border text-xs">
                      {[
                        { rid: '29481057392048192837461029384', region: 'Addis Ababa · Bole Sector', status: 'Processed', tone: 'text-emerald-600 dark:text-emerald-400' },
                        { rid: '83920194857362514029384756102', region: 'Oromia · Adama Cluster', status: 'Processing', tone: 'text-blue-600 dark:text-blue-400' },
                        { rid: '56473829102938475610293847561', region: 'Amhara · Bahir Dar Hub', status: 'Processed', tone: 'text-emerald-600 dark:text-emerald-400' },
                      ].map((row) => (
                        <div key={row.rid} className="px-4 py-3 flex items-center justify-between gap-4 bg-card hover:bg-muted/20 transition-colors">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-foreground tabular-nums truncate">
                              <FileDigit className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span>{row.rid.slice(0, 18)}...</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{row.region}</p>
                          </div>
                          <span className={`text-[11px] font-bold whitespace-nowrap ${row.tone}`}>
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

      {/* Final Institutional CTA */}
      <section className="w-full py-16 md:py-24 bg-foreground text-background">
        <div className="container mx-auto px-4 text-center space-y-6">
          <div className="space-y-3">
            <h2 className="text-2xl md:text-4xl font-black tracking-tight">Ready for Field Deployment?</h2>
            <p className="text-sm md:text-base text-background/70 max-w-xl mx-auto">
              Sign in with your authorized bureau credentials to access registration ledgers and regional analytics.
            </p>
          </div>
          <Button size="lg" variant="secondary" className="h-13 px-10 text-xs font-bold uppercase tracking-widest rounded-xl bg-background text-foreground hover:bg-background/90" asChild>
            <Link href={portalHref}>
              {user ? 'Return to Active Workspace' : 'Enter Terminal Hub'}
            </Link>
          </Button>
        </div>
      </section>

      {/* Quiet Institutional Footer */}
      <footer className="w-full py-12 md:py-16 border-t mt-auto bg-card">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start mb-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-border">
                  <Image src={logoUrl} alt="Logo" fill sizes="36px" className="object-cover" unoptimized />
                </div>
                <span className="text-base font-black tracking-wider uppercase text-foreground">
                  {bureauName.split('Track')[0]}<span className="text-primary italic">{bureauName.includes('Track') ? 'Track' : ''}</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                Official {bureauName} Operations Portal. Accountability-driven enrollment tracking and regional coordination.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">Operational Hub</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2.5">
                  <MapPin className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                  <span>{branding?.officeAddress || 'Regional Headquarters'}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <ActivityIcon className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                  <span>{branding?.operationalHours || 'Operational 24/7'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 md:text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">Support Channels</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center md:justify-end gap-2.5">
                  <Mail className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                  <span>{branding?.contactEmail || 'support@bureau.gov'}</span>
                </div>
                <div className="flex items-center md:justify-end gap-2.5">
                  <Phone className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                  <span className="tabular-nums">{branding?.contactPhone || '+251 ...'}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>
              System {systemProtocol} · © 2026 {bureauName} Registry
            </p>
            <div className="flex items-center gap-5 font-medium">
              <Link href="/full-registration" className="hover:text-foreground transition-colors">Public Pulse</Link>
              <Link href="/status-check" className="hover:text-foreground transition-colors">Verification</Link>
              <Link href={portalHref} className="hover:text-foreground transition-colors">Officer Portal</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Resident Lookup Dialog */}
      <Dialog open={isLookupOpen} onOpenChange={setIsLookupOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-5xl h-[88vh] p-0 overflow-hidden rounded-3xl border border-border shadow-2xl bg-popover flex flex-col">
          <DialogHeader className="p-5 sm:p-6 bg-muted/30 border-b border-border flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-primary/10 rounded-xl">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground tracking-tight leading-none">
                  Public Verification Gateway
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Official Fayda Resident Status Service {publicRid ? `· RID: ${publicRid}` : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 relative bg-card overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center -z-10">
              <div className="flex flex-col items-center gap-3 opacity-30">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-xs font-semibold text-muted-foreground">Connecting to Official Verification Portal...</p>
              </div>
            </div>
            <iframe 
              src={publicRid.trim() ? `https://resident.fayda.et/status?rid=${encodeURIComponent(publicRid.trim())}` : 'https://resident.fayda.et/status'} 
              className="absolute inset-0 w-full h-full border-none"
              title="Resident Portal"
              loading="lazy"
              allow="geolocation"
            />
          </div>

          <div className="px-6 py-3 bg-muted/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Encrypted verification session</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIsLookupOpen(false)} className="h-8 text-xs font-semibold">
              Close Window
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoCard({ number, title, description, icon: Icon }: { number: string; title: string; description: string; icon: any }) {
  return (
    <div className="p-7 md:p-8 rounded-2xl bg-card border border-border shadow-sm transition-all duration-200 hover:border-primary/30 group">
      <div className="flex items-center justify-between mb-6">
        <div className="p-3 rounded-xl bg-muted/60 border border-border group-hover:bg-primary/10 group-hover:border-primary/20 transition-colors">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <span className="text-xs font-mono font-bold text-muted-foreground/50 tabular-nums">{number}</span>
      </div>
      <div className="space-y-2.5">
        <h3 className="text-lg font-bold text-foreground tracking-tight">{number}. {title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/20 border border-border">
      <div className="p-2.5 bg-background rounded-lg border border-border">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-mono font-black text-foreground tracking-tight tabular-nums">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
