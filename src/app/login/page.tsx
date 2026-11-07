"use client"

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { initiateEmailSignIn } from '@/firebase/non-blocking-login';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Lock, 
  UserCircle, 
  Loader2, 
  ShieldCheck, 
  Mail, 
  Eye,
  EyeOff,
  Smartphone,
  Copy,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, collection, query, limit, writeBatch } from 'firebase/firestore';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserProfile, SystemSettings } from '@/lib/types';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';
import * as OTPAuth from "otpauth";
import { QRCodeSVG } from 'qrcode.react';
import { VerificationAnimation, VerificationOutcome } from '@/components/auth/verification-animation';
import { SixBoxOtp, OtpVerificationStatus } from '@/components/auth/six-box-otp';

const DEFAULT_LOGO = "https://services.eaes.et/NID-Logos/Fayda%20For%20Ethiopia%20logo-%20english-2-01.png";

function GlassyAuthBackdrop({
  tone = 'default',
}: {
  tone?: 'default' | 'verifying' | 'wrong' | 'success';
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Atmospheric gradient mesh base */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-blue-50/70 to-indigo-100/80 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/70 transition-colors duration-700" />

      {/* Animated Floating Ambient Light Orb 1 (Top Left) */}
      <div
        className={cn(
          'absolute -top-28 -left-24 h-96 w-96 rounded-full blur-3xl animate-orb-1 transition-colors duration-700',
          tone === 'wrong'
            ? 'bg-rose-500/25 dark:bg-rose-500/20'
            : tone === 'success'
            ? 'bg-emerald-500/25 dark:bg-emerald-500/20'
            : 'bg-blue-500/25 dark:bg-blue-500/20'
        )}
      />

      {/* Animated Floating Ambient Light Orb 2 (Bottom Right) */}
      <div
        className={cn(
          'absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl animate-orb-2 transition-colors duration-700',
          tone === 'wrong'
            ? 'bg-orange-500/20 dark:bg-rose-600/15'
            : tone === 'success'
            ? 'bg-teal-400/25 dark:bg-emerald-600/15'
            : 'bg-indigo-500/25 dark:bg-indigo-500/20'
        )}
      />

      {/* Animated Floating Ambient Light Orb 3 (Center Halo) */}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full blur-3xl animate-orb-3 transition-colors duration-700',
          tone === 'wrong'
            ? 'bg-rose-400/20 dark:bg-rose-500/15'
            : tone === 'success'
            ? 'bg-emerald-400/20 dark:bg-emerald-500/15'
            : 'bg-sky-400/20 dark:bg-sky-500/15'
        )}
      />

      {/* Subtle architectural grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#64748b14_1px,transparent_1px),linear-gradient(to_bottom,#64748b14_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_55%,transparent_100%)]" />
    </div>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register' | 'otp' | 'otp-setup'>('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStatus, setOtpStatus] = useState<OtpVerificationStatus>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminsExist, setAdminsExist] = useState<boolean | null>(null);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState('');
  const [verificationPhase, setVerificationPhase] = useState<'none' | 'credentials'>('none');
  const [credentialOutcome, setCredentialOutcome] = useState<VerificationOutcome>('verifying');
  const [credentialError, setCredentialError] = useState<string>('');
  
  const auth = useAuth();
  const db = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const brandingRef = useMemoFirebase(() => {
    if (!db) return null;
    return doc(db, 'system_settings', 'branding');
  }, [db]);
  const { data: branding } = useDoc<SystemSettings>(brandingRef);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const adminCheckQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'admin_users'), limit(1));
  }, [db]);

  const { data: adminDocs, isLoading: isAdminCheckLoading } = useCollection(adminCheckQuery);

  useEffect(() => {
    if (adminDocs !== null) {
      const exists = adminDocs.length > 0;
      setAdminsExist(exists);
      
      if (exists) {
        if (mode === 'register') setMode('login');
      } else if (adminsExist === null) {
        setMode('register');
      }
    }
  }, [adminDocs, adminsExist, mode]);

  // Check for existing session verification bound to active user UID
  useEffect(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      const verified = sessionStorage.getItem('fayda_mfa_verified') === 'true';
      const verifiedUid = sessionStorage.getItem('fayda_mfa_verified_uid');
      if (verified && (!verifiedUid || verifiedUid === user.uid)) {
        setIsOtpVerified(true);
      } else {
        setIsOtpVerified(false);
      }
    }
  }, [user?.uid]);

  // MANDATORY SECURITY GATE EFFECT
  useEffect(() => {
    if (isUserLoading || isProfileLoading || !user || !profile) return;
    if (verificationPhase !== 'none') return; // Wait for credential verification animation to complete
    if (otpStatus === 'verifying' || otpStatus === 'success') return; // Wait for 6-box MFA animation to complete

    // MANDATORY MFA FOR ALL USERS
    const isMfaRequired = true; 

    if (isMfaRequired && !isOtpVerified) {
      if (profile.twoFactorSecret) {
        if (mode !== 'otp') {
          setOtpCode('');
          setOtpStatus('idle');
          setMode('otp');
        }
      } else {
        if (mode !== 'otp-setup') {
          setOtpCode('');
          setOtpStatus('idle');
          setMode('otp-setup');
        }
        if (!generatedSecret) {
          const secret = new OTPAuth.Secret({ size: 20 }).base32;
          setGeneratedSecret(secret);
        }
      }
      return; // HALT REDIRECTION
    }

    // Access granted - redirect based on role
    if (profile.role === 'admin') {
      router.push('/admin');
    } else {
      router.push('/dashboard');
    }
  }, [user, profile, isUserLoading, isProfileLoading, router, isOtpVerified, generatedSecret, mode, verificationPhase, otpStatus]);

  const handleLogout = async () => {
    sessionStorage.removeItem('fayda_mfa_verified');
    sessionStorage.removeItem('fayda_mfa_verified_uid');
    await signOut(auth);
    window.location.reload();
  };

  const executeOtpVerify = useCallback((codeToVerify: string) => {
    if (!profile?.twoFactorSecret || codeToVerify.length !== 6 || otpStatus === 'verifying' || otpStatus === 'success') {
      return;
    }

    setIsSubmitting(true);
    setOtpStatus('verifying');

    setTimeout(() => {
      try {
        const totp = new OTPAuth.TOTP({
          secret: profile.twoFactorSecret,
        });

        const delta = totp.validate({
          token: codeToVerify,
          window: 1,
        });

        if (delta !== null) {
          setOtpStatus('success');
          sessionStorage.setItem('fayda_mfa_verified', 'true');
          if (user?.uid) {
            sessionStorage.setItem('fayda_mfa_verified_uid', user.uid);
          }
          toast({
            title: "Identity Verified",
            description: "6-digit MFA token confirmed. Accessing terminal...",
          });
          setTimeout(() => {
            setIsOtpVerified(true);
            setOtpStatus('idle');
          }, 1450);
        } else {
          setOtpStatus('wrong');
          setIsSubmitting(false);
          toast({
            title: "Verification Failed",
            description: "Wrong 6-digit MFA code. Please check your authenticator and try again.",
            variant: "destructive",
          });
        }
      } catch (err) {
        setOtpStatus('wrong');
        setIsSubmitting(false);
        toast({
          title: "System Error",
          description: "Could not verify MFA code.",
          variant: "destructive",
        });
      }
    }, 680);
  }, [profile?.twoFactorSecret, otpStatus, user?.uid, toast]);

  const handleOtpVerify = (e: React.FormEvent) => {
    e.preventDefault();
    executeOtpVerify(otpCode);
  };

  const executeOtpSetupVerify = useCallback((codeToVerify: string) => {
    if (codeToVerify.length !== 6 || !user || !db || !generatedSecret || otpStatus === 'verifying' || otpStatus === 'success') {
      return;
    }

    setIsSubmitting(true);
    setOtpStatus('verifying');

    setTimeout(async () => {
      try {
        const totp = new OTPAuth.TOTP({
          secret: generatedSecret,
        });

        const delta = totp.validate({
          token: codeToVerify,
          window: 1,
        });

        if (delta !== null) {
          await setDocumentNonBlocking(doc(db, 'users', user.uid), {
            twoFactorSecret: generatedSecret,
            twoFactorEnabled: true,
            updatedAt: new Date().toISOString(),
          }, { merge: true });

          setOtpStatus('success');
          sessionStorage.setItem('fayda_mfa_verified', 'true');
          sessionStorage.setItem('fayda_mfa_verified_uid', user.uid);
          toast({
            title: "MFA Active & Verified",
            description: "6-digit MFA handshake established. Your account is now secured.",
          });
          setTimeout(() => {
            setIsOtpVerified(true);
            setOtpStatus('idle');
          }, 1450);
        } else {
          setOtpStatus('wrong');
          setIsSubmitting(false);
          toast({
            title: "Setup Verification Failed",
            description: "Wrong 6-digit code. Ensure your device clock is synced.",
            variant: "destructive",
          });
        }
      } catch (err) {
        setOtpStatus('wrong');
        setIsSubmitting(false);
        toast({
          title: "Setup Error",
          description: "Verification protocol failed.",
          variant: "destructive",
        });
      }
    }, 680);
  }, [user, db, generatedSecret, otpStatus, toast]);

  const handleOtpSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeOtpSetupVerify(otpCode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCredentialError('');
    setCredentialOutcome('verifying');
    setVerificationPhase('credentials');
    
    try {
      if (mode === 'login') {
        await initiateEmailSignIn(auth, email, password);
        setCredentialOutcome('success');
        setTimeout(() => {
          setVerificationPhase('none');
          setIsSubmitting(false);
        }, 1150);
      } else if (mode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        const now = new Date().toISOString();
        
        const profileData = {
          id: uid,
          fullName: fullName,
          email: email,
          role: 'admin',
          region: 'Headquarters',
          cluster: 'Central',
          profilePhoto: `https://api.dicebear.com/7.x/initials/svg?seed=${fullName}`,
          lastAnnouncementReadAt: now,
          lastMessageReadAt: now,
          updatedAt: now,
          twoFactorEnabled: true,
          twoFactorSecret: '', 
        };

        const batch = writeBatch(db);
        batch.set(doc(db, 'users', uid), profileData, { merge: true });
        batch.set(doc(db, 'admin_users', uid), { active: true }, { merge: true });
        await batch.commit();

        setCredentialOutcome('success');
        toast({
          title: "Admin Created",
          description: "Credential accepted. Proceeding to 6-digit MFA setup.",
        });
        setTimeout(() => {
          setVerificationPhase('none');
          setIsSubmitting(false);
        }, 1200);
      }
    } catch (error: any) {
      let errMsg = "Invalid email or access key. Please verify your credentials.";
      if (error?.code === 'auth/user-not-found') {
        errMsg = "No official account found with this email address.";
      } else if (error?.message && mode === 'register') {
        errMsg = error.message;
      }
      setCredentialError(errMsg);
      setCredentialOutcome('wrong');
      setIsSubmitting(false);
      setTimeout(() => {
        setVerificationPhase('none');
      }, 1500);
    }
  };

  const isInitializing = isUserLoading || isAdminCheckLoading || (user && isProfileLoading && mode !== 'otp-setup' && mode !== 'otp' && verificationPhase === 'none');
  const bureauName = branding?.bureauName || 'FaydaTrack';
  const logoUrl = branding?.logoUrl || DEFAULT_LOGO;
  const resolvedRoleLabel =
    profile?.role === 'admin'
      ? 'Bureau Administrator'
      : profile?.role === 'reviewer'
      ? 'Field Officer'
      : mode === 'register'
      ? 'Bureau Administrator'
      : 'Authorized Personnel';

  if (verificationPhase === 'credentials') {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
        <GlassyAuthBackdrop tone={credentialOutcome} />
        <div className="relative z-10 w-full max-w-[420px] animate-glass-enter">
          <Card
            className={cn(
              "relative glass-auth-card rounded-[32px] overflow-hidden transition-all duration-500",
              credentialOutcome === 'wrong'
                ? "border-rose-500/45 shadow-rose-500/15"
                : credentialOutcome === 'success'
                ? "border-emerald-500/45 shadow-emerald-500/15"
                : "border-white/75 dark:border-white/15"
            )}
          >
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/95 dark:via-white/30 to-transparent" />
            <CardContent className="p-6">
              <VerificationAnimation
                variant="credentials"
                outcome={credentialOutcome}
                errorMessage={credentialError}
                userName={profile?.fullName || fullName || email}
                userRole={resolvedRoleLabel}
                durationMs={1150}
                onRetry={() => setVerificationPhase('none')}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="relative flex h-screen items-center justify-center bg-background px-4 overflow-hidden">
        <GlassyAuthBackdrop tone="default" />
        <div className="relative z-10 flex flex-col items-center gap-5 px-10 py-9 rounded-[32px] glass-auth-card animate-glass-enter">
          <div className="relative flex items-center justify-center h-16 w-16 rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-xl border border-white/80 dark:border-white/15 shadow-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.45em] text-muted-foreground">
            Gateway Handshake...
          </p>
        </div>
      </div>
    );
  }

  if (mode === 'otp-setup') {
    const totpSetup = new OTPAuth.TOTP({
      issuer: bureauName,
      label: email || profile?.email || 'official',
      secret: generatedSecret,
    });
    const otpauthUrl = totpSetup.toString();

    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-8 overflow-hidden">
        <GlassyAuthBackdrop
          tone={
            otpStatus === 'wrong'
              ? 'wrong'
              : otpStatus === 'success'
              ? 'success'
              : otpStatus === 'verifying'
              ? 'verifying'
              : 'default'
          }
        />
        <div className="relative z-10 w-full max-w-[440px] animate-glass-enter">
          <Card
            className={cn(
              "relative glass-auth-card rounded-[32px] overflow-hidden transition-all duration-500",
              otpStatus === 'wrong'
                ? "border-rose-500/45 shadow-rose-500/15"
                : otpStatus === 'success'
                ? "border-emerald-500/45 shadow-emerald-500/15"
                : "border-white/75 dark:border-white/15"
            )}
          >
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/95 dark:via-white/30 to-transparent" />
            <CardHeader className="text-center pt-9 px-8 pb-4">
              <div className="mx-auto bg-white/75 dark:bg-white/10 backdrop-blur-xl border border-white/80 dark:border-white/15 p-3.5 rounded-2xl w-fit mb-3 shadow-md shadow-primary/10">
                <Smartphone className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Security Protocol</CardTitle>
              <CardDescription className="text-xs font-medium">
                Scan QR with Google Authenticator and enter the 6-digit code below.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 sm:px-8 pb-9 space-y-6">
              <div className="flex justify-center p-4 bg-white/95 rounded-2xl border border-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.15)] w-fit mx-auto transition-transform duration-300 hover:scale-[1.02]">
                <QRCodeSVG value={otpauthUrl} size={160} />
              </div>

              <div className="p-3.5 glass-subpanel rounded-2xl space-y-1.5">
                <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest text-center">
                  Manual Entry Key
                </p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-xs font-black tracking-widest text-primary break-all text-center">
                    {generatedSecret}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-lg hover:bg-primary/10"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedSecret);
                      toast({ title: "Copied", description: "Secret copied to clipboard." });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <form onSubmit={handleOtpSetupSubmit} className="space-y-5">
                <SixBoxOtp
                  value={otpCode}
                  onChange={setOtpCode}
                  onComplete={executeOtpSetupVerify}
                  status={otpStatus}
                  onResetStatus={() => setOtpStatus('idle')}
                  showHeaderSeal={false}
                  label="6-Digit Confirmation Code"
                  errorMessage="Invalid 6-digit code. Ensure your phone clock is synced and re-enter."
                  successTitle="MFA Linked & Verified"
                  successSubtitle="Authenticator handshake complete. Entering bureau terminal..."
                  userName={profile?.fullName || fullName || email}
                  userRole={resolvedRoleLabel}
                />

                <Button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    otpCode.length !== 6 ||
                    otpStatus === 'verifying' ||
                    otpStatus === 'success'
                  }
                  className={cn(
                    "relative overflow-hidden w-full h-14 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0",
                    otpStatus === 'wrong'
                      ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/25"
                      : otpStatus === 'success'
                      ? "bg-emerald-600 hover:bg-emerald-600 shadow-emerald-600/25"
                      : "bg-primary hover:bg-primary/95 shadow-primary/25"
                  )}
                >
                  {otpStatus === 'verifying' ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Verifying Code...
                    </span>
                  ) : otpStatus === 'success' ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Verified · Redirecting...
                    </span>
                  ) : otpStatus === 'wrong' ? (
                    <span className="flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      Wrong Code · Try Again
                    </span>
                  ) : (
                    'Finalize Handshake'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (mode === 'otp') {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
        <GlassyAuthBackdrop
          tone={
            otpStatus === 'wrong'
              ? 'wrong'
              : otpStatus === 'success'
              ? 'success'
              : otpStatus === 'verifying'
              ? 'verifying'
              : 'default'
          }
        />
        <div className="relative z-10 w-full max-w-[430px] animate-glass-enter">
          <Card
            className={cn(
              "relative glass-auth-card rounded-[32px] overflow-hidden transition-all duration-500",
              otpStatus === 'wrong'
                ? "border-rose-500/45 shadow-rose-500/15"
                : otpStatus === 'success'
                ? "border-emerald-500/45 shadow-emerald-500/15"
                : "border-white/75 dark:border-white/15"
            )}
          >
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/95 dark:via-white/30 to-transparent" />
            <CardHeader className="text-center pt-9 px-8 pb-2">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Identity Gateway</CardTitle>
              <CardDescription className="text-xs font-medium">
                Enter your 6-digit Google Authenticator code to verify clearance
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 sm:px-8 pb-9 pt-4">
              <form onSubmit={handleOtpVerify} className="space-y-6">
                <SixBoxOtp
                  value={otpCode}
                  onChange={setOtpCode}
                  onComplete={executeOtpVerify}
                  status={otpStatus}
                  onResetStatus={() => setOtpStatus('idle')}
                  showHeaderSeal={true}
                  label="Google Authenticator Code"
                  errorMessage="The 6-digit MFA code you entered is incorrect. Please check your authenticator app."
                  successTitle="Identity Verified"
                  successSubtitle="MFA token validated. Unlocking encrypted terminal..."
                  userName={profile?.fullName || email}
                  userRole={resolvedRoleLabel}
                />

                <div className="space-y-2.5 pt-1">
                  <Button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      otpCode.length !== 6 ||
                      otpStatus === 'verifying' ||
                      otpStatus === 'success'
                    }
                    className={cn(
                      "relative overflow-hidden w-full h-14 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0",
                      otpStatus === 'wrong'
                        ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/25"
                        : otpStatus === 'success'
                        ? "bg-emerald-600 hover:bg-emerald-600 shadow-emerald-600/25"
                        : "bg-primary hover:bg-primary/95 shadow-primary/25"
                    )}
                  >
                    {otpStatus === 'verifying' ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Verifying 6-Digit Code...
                      </span>
                    ) : otpStatus === 'success' ? (
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Verified · Entering Terminal
                      </span>
                    ) : otpStatus === 'wrong' ? (
                      <span className="flex items-center gap-2">
                        <XCircle className="h-5 w-5" />
                        Wrong Code · Re-enter
                      </span>
                    ) : (
                      'Verify & Confirm Access'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleLogout}
                    disabled={otpStatus === 'verifying' || otpStatus === 'success'}
                    className="w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-white/50 dark:hover:bg-white/5"
                  >
                    Abort Session
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-8 overflow-hidden">
      <GlassyAuthBackdrop tone="default" />

      <div className="relative z-10 w-full max-w-[420px] animate-glass-enter">
        <Card className="relative glass-auth-card rounded-[32px] overflow-hidden">
          {/* Top Specular Glass Reflection Line */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/95 dark:via-white/30 to-transparent" />

          <CardHeader className="space-y-7 text-center pt-10 pb-7 px-8">
            <div className="relative mx-auto w-fit group">
              <div className="absolute -inset-2 rounded-3xl bg-primary/20 blur-xl opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 dark:bg-white/10 backdrop-blur-xl border border-white/85 dark:border-white/15 p-3.5 shadow-[0_8px_24px_-4px_rgba(37,99,235,0.2)] transition-transform duration-300 group-hover:scale-105">
                <Image 
                  src={logoUrl}
                  alt="Bureau Logo"
                  width={48}
                  height={48}
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <CardTitle className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">
                {bureauName.split('Track')[0]} <span className="text-primary italic">Terminal</span>
              </CardTitle>
              <CardDescription className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/75">
                Authorized Personnel Entry
              </CardDescription>
            </div>
            
            {adminsExist === false && (
              <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full">
                <TabsList className="grid grid-cols-2 w-full h-11 bg-white/50 dark:bg-white/[0.04] backdrop-blur-md rounded-xl p-1 border border-white/70 dark:border-white/10">
                  <TabsTrigger value="login" className="rounded-lg text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white/90 dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm">Sign In</TabsTrigger>
                  <TabsTrigger value="register" className="rounded-lg text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white/90 dark:data-[state=active]:bg-white/10 data-[state=active]:shadow-sm">Bootstrap</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </CardHeader>
          
          <CardContent className="px-8 pb-9">
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'register' && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Official Designation</Label>
                  <div className="relative group">
                    <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary group-focus-within:scale-110 transition-all duration-200 z-10" />
                    <Input 
                      placeholder="Full Official Name" 
                      className="h-14 pl-12 glass-auth-input rounded-2xl text-xs font-bold"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Terminal Address</Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary group-focus-within:scale-110 transition-all duration-200 z-10" />
                  <Input 
                    type="email" 
                    placeholder="official@bureau.gov" 
                    className="h-14 pl-12 glass-auth-input rounded-2xl text-xs font-bold"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Terminal Access Key</Label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary group-focus-within:scale-110 transition-all duration-200 z-10" />
                  <Input 
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••" 
                    className="h-14 pl-12 pr-12 glass-auth-input rounded-2xl text-xs font-bold"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-all z-10"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="group relative overflow-hidden w-full h-14 bg-primary hover:bg-primary/95 text-primary-foreground font-black uppercase tracking-[0.28em] rounded-2xl shadow-[0_14px_30px_-6px_rgba(37,99,235,0.4)] hover:shadow-[0_18px_36px_-6px_rgba(37,99,235,0.5)] transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 mt-4"
                disabled={isSubmitting}
              >
                <span className="pointer-events-none absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover:translate-x-[300%] transition-transform duration-1000 ease-out" />
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : mode === 'login' ? (
                  "Initialize Session"
                ) : (
                  "Register Admin"
                )}
              </Button>
            </form>
          </CardContent>
          
          <CardFooter className="pt-0 pb-8 px-8 flex flex-col items-center text-center">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl glass-subpanel">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-[0.28em] text-muted-foreground">
                6-Digit MFA Protocol Active
              </span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
