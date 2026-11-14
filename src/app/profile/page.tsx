'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  UserCircle,
  MapPin,
  Layers,
  ShieldCheck,
  Mail,
  Save,
  Loader2,
  Camera,
  ArrowLeft,
  Smartphone,
  QrCode,
  KeyRound,
  Upload,
  Trash2,
  Power,
  CheckCircle2,
  CalendarPlus,
  GraduationCap,
  FileCheck,
  Copy,
  Check,
  Sun,
  Moon,
  Monitor,
  Globe,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore,
  useUser,
  useDoc,
  useMemoFirebase,
  useCollection,
  useAuth,
} from '@/firebase';
import { doc, collection, query, where, limit } from 'firebase/firestore';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import {
  UserProfile,
  Registration,
  DailyReport,
  MeetingExamSubmission,
} from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { useTranslation } from '@/i18n/language-provider';
import { LOCALES, Locale } from '@/i18n/config';
import { useTheme } from 'next-themes';
import * as OTPAuth from 'otpauth';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  const { t, locale, setLocale, formatNumber } = useTranslation();
  const { theme, setTheme } = useTheme();

  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2FA QR Pairing Modal State
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [pendingSecret, setPendingSecret] = useState('');
  const [otpVerifyInput, setOtpVerifyInput] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const profileSchema = useMemo(
    () =>
      z.object({
        fullName: z.string().trim().min(2, t.profilePage.valNameMin),
        region: z.string().trim().min(1, t.profilePage.valRegionReq),
        cluster: z.string().trim().min(1, t.profilePage.valClusterReq),
        profilePhoto: z.string().optional().or(z.literal('')),
      }),
    [t]
  );

  type ProfileFormValues = z.infer<typeof profileSchema>;

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);

  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  // Personal Operational Metrics Queries
  const myRegsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', user.uid),
      limit(5000)
    );
  }, [db, user?.uid]);
  const { data: myRegs } = useCollection<Registration>(myRegsQuery);

  const myReportsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'daily_reports'),
      where('officerId', '==', user.uid),
      limit(2000)
    );
  }, [db, user?.uid]);
  const { data: myReports } = useCollection<DailyReport>(myReportsQuery);

  const myExamsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, 'meeting_exam_submissions'),
      where('officerId', '==', user.uid),
      limit(500)
    );
  }, [db, user?.uid]);
  const { data: myExams } = useCollection<MeetingExamSubmission>(myExamsQuery);

  const personalStats = useMemo(() => {
    const regs = myRegs || [];
    const totalRegs = regs.length;
    const processedRegs = regs.filter((r) => r.status === 'Processed').length;
    const approvalRate =
      totalRegs > 0 ? Number(((processedRegs / totalRegs) * 100).toFixed(1)) : 0;
    const totalReports = (myReports || []).length;
    const passedExams = (myExams || []).filter((e) => e.passed).length;
    return {
      totalRegs,
      approvalRate,
      totalReports,
      passedExams,
    };
  }, [myRegs, myReports, myExams]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: '',
      region: '',
      cluster: '',
      profilePhoto: '',
    },
  });

  const hasHydratedProfileRef = useRef(false);
  const lastSyncedIdentityRef = useRef('');

  useEffect(() => {
    if (!profile) return;
    const identitySignature = JSON.stringify([
      profile.fullName || '',
      profile.region || '',
      profile.cluster || '',
      profile.profilePhoto || '',
    ]);

    if (!hasHydratedProfileRef.current || (!form.formState.isDirty && identitySignature !== lastSyncedIdentityRef.current)) {
      hasHydratedProfileRef.current = true;
      lastSyncedIdentityRef.current = identitySignature;
      form.reset({
        fullName: profile.fullName || '',
        region: profile.region || '',
        cluster: profile.cluster || '',
        profilePhoto: profile.profilePhoto || '',
      });
    }
  }, [profile, form]);

  const isTwoFactorEnabled = profile?.twoFactorEnabled !== false;

  const handleToggleDuty = () => {
    if (!db || !user?.uid || !profile) return;
    updateDocumentNonBlocking(doc(db, 'users', user.uid), {
      isDutyActive: !profile.isDutyActive,
      updatedAt: new Date().toISOString(),
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
          form.setValue('profilePhoto', dataUrl, { shouldDirty: true });
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  async function onSubmit(values: ProfileFormValues) {
    if (!db || !user) {
      toast({
        variant: 'destructive',
        title: t.profilePage.toastErrorTitle,
        description: t.profilePage.toastErrorDesc,
      });
      return;
    }
    setIsSaving(true);

    const cleanedValues = {
      fullName: values.fullName.trim(),
      region: values.region.trim(),
      cluster: values.cluster.trim(),
      profilePhoto: (values.profilePhoto || '').trim(),
    };

    try {
      updateDocumentNonBlocking(doc(db, 'users', user.uid), {
        ...cleanedValues,
        updatedAt: new Date().toISOString(),
      });

      lastSyncedIdentityRef.current = JSON.stringify([
        cleanedValues.fullName,
        cleanedValues.region,
        cleanedValues.cluster,
        cleanedValues.profilePhoto,
      ]);
      form.reset(cleanedValues);

      toast({
        title: t.profilePage.toastSavedTitle,
        description: t.profilePage.toastSavedDesc,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: t.profilePage.toastErrorTitle,
        description: t.profilePage.toastErrorDesc,
      });
    } finally {
      setTimeout(() => setIsSaving(false), 600);
    }
  }

  // Toggle Google Authenticator (2FA) On or Off for this user
  const handleToggleTwoFactor = (nextEnabled: boolean) => {
    if (!db || !user?.uid) return;

    if (nextEnabled && !profile?.twoFactorSecret) {
      // Open QR setup modal if enabling for the first time without a secret
      const newSecret = new OTPAuth.Secret({ size: 20 }).base32;
      setPendingSecret(newSecret);
      setOtpVerifyInput('');
      setIsQrModalOpen(true);
      return;
    }

    updateDocumentNonBlocking(doc(db, 'users', user.uid), {
      twoFactorEnabled: nextEnabled,
      updatedAt: new Date().toISOString(),
    });

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('fayda_mfa_verified', 'true');
      sessionStorage.setItem('fayda_mfa_verified_uid', user.uid);
    }

    toast({
      title: nextEnabled
        ? t.profilePage.toast2faEnabledTitle
        : t.profilePage.toast2faDisabledTitle,
      description: nextEnabled
        ? t.profilePage.toast2faEnabledDesc
        : t.profilePage.toast2faDisabledDesc,
    });
  };

  const handleOpenQrModal = (forceNewSecret = false) => {
    const secretToUse =
      !forceNewSecret && profile?.twoFactorSecret
        ? profile.twoFactorSecret
        : new OTPAuth.Secret({ size: 20 }).base32;
    setPendingSecret(secretToUse);
    setOtpVerifyInput('');
    setIsQrModalOpen(true);
  };

  const handleConfirmPairAuthenticator = () => {
    if (!db || !user?.uid || !pendingSecret || otpVerifyInput.trim().length !== 6) return;

    try {
      const totp = new OTPAuth.TOTP({
        secret: pendingSecret,
      });
      const delta = totp.validate({
        token: otpVerifyInput.trim(),
        window: 1,
      });

      if (delta === null) {
        toast({
          variant: 'destructive',
          title: t.profilePage.toastErrorTitle,
          description: t.profilePage.toast2faInvalidCode,
        });
        return;
      }

      updateDocumentNonBlocking(doc(db, 'users', user.uid), {
        twoFactorSecret: pendingSecret,
        twoFactorEnabled: true,
        updatedAt: new Date().toISOString(),
      });

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('fayda_mfa_verified', 'true');
        sessionStorage.setItem('fayda_mfa_verified_uid', user.uid);
      }

      setIsQrModalOpen(false);
      setOtpVerifyInput('');
      toast({
        title: t.profilePage.toast2faEnabledTitle,
        description: t.profilePage.toast2faEnabledDesc,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: t.profilePage.toastErrorTitle,
        description: t.profilePage.toast2faInvalidCode,
      });
    }
  };

  const handleCopySecret = () => {
    if (!pendingSecret) return;
    navigator.clipboard.writeText(pendingSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email || !currentPassword || newPassword.length < 8) {
      toast({
        variant: 'destructive',
        title: t.profilePage.toastErrorTitle,
        description: t.profilePage.passwordCardSub,
      });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      toast({
        title: t.profilePage.toastPassUpdatedTitle,
        description: t.profilePage.toastPassUpdatedDesc,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: t.profilePage.toastErrorTitle,
        description: t.profilePage.toastErrorDesc,
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!auth || !user?.email) return;
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({
        title: t.profilePage.toastResetSentTitle,
        description: t.profilePage.toastResetSentDesc.replace('{email}', user.email),
      });
    } catch {
      toast({
        variant: 'destructive',
        title: t.profilePage.toastErrorTitle,
        description: t.profilePage.toastErrorDesc,
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  const otpAuthUri = useMemo(() => {
    if (!pendingSecret || !user?.email) return '';
    return new OTPAuth.TOTP({
      issuer: 'FaydaPortal',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: pendingSecret,
    }).toString();
  }, [pendingSecret, user?.email]);

  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
            {t.profilePage.loadingText}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={profile?.role === 'admin' ? '/admin' : '/dashboard'}
          className="inline-flex items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="mr-2 h-3 w-3" /> {t.profilePage.backToDashboard}
        </Link>

        {/* Duty Status Quick Switch */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleToggleDuty}
          className={cn(
            'h-9 px-3.5 rounded-xl text-xs font-bold transition-all',
            profile?.isDutyActive
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'text-muted-foreground'
          )}
        >
          <Power className="mr-1.5 h-3.5 w-3.5" />
          {profile?.isDutyActive ? t.profilePage.onDutyBadge : t.profilePage.offDutyBadge}
        </Button>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          {t.profilePage.eyebrow}
        </p>
        <h1 className="text-3xl font-black tracking-tight text-foreground font-headline">
          {t.profilePage.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.profilePage.subtitle}</p>
      </div>

      {/* Personal Operational KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="clay-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              {t.profilePage.statsRegistrations}
            </p>
            <p className="text-2xl font-black text-foreground tabular-nums mt-1">
              {formatNumber(personalStats.totalRegs)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <FileCheck className="h-5 w-5" />
          </div>
        </Card>

        <Card className="clay-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              {t.profilePage.statsApprovalRate}
            </p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
              {personalStats.approvalRate}%
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </Card>

        <Card className="clay-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              {t.profilePage.statsDailyReports}
            </p>
            <p className="text-2xl font-black text-foreground tabular-nums mt-1">
              {formatNumber(personalStats.totalReports)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <CalendarPlus className="h-5 w-5" />
          </div>
        </Card>

        <Card className="clay-card rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              {t.profilePage.statsExamsPassed}
            </p>
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums mt-1">
              {formatNumber(personalStats.passedExams)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <GraduationCap className="h-5 w-5" />
          </div>
        </Card>
      </div>

      {/* Main Profile Identity & Photo Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border border-border shadow-sm bg-card overflow-hidden rounded-2xl">
            <CardHeader className="bg-muted/30 border-b border-border p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative group cursor-pointer"
                  >
                    <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-background shadow-xl">
                      <AvatarImage src={form.watch('profilePhoto') || profile?.profilePhoto} />
                      <AvatarFallback className="text-xl font-black bg-primary/10 text-primary">
                        {profile?.fullName?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center sm:text-left space-y-1.5">
                    <h2 className="text-xl font-bold text-foreground">{profile?.fullName}</h2>
                    <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-tight">
                        {profile?.role === 'admin' ? t.header.administrator : t.header.officer}
                      </span>
                      <span
                        className={cn(
                          'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight',
                          isTwoFactorEnabled
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        )}
                      >
                        {isTwoFactorEnabled
                          ? t.profilePage.twoFactorEnabledBadge
                          : t.profilePage.twoFactorDisabledBadge}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Direct Upload & Clear Photo Buttons */}
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 rounded-xl text-xs font-bold"
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    {t.profilePage.uploadPhotoBtn}
                  </Button>
                  {form.watch('profilePhoto') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => form.setValue('profilePhoto', '', { shouldDirty: true })}
                      className="h-9 rounded-xl text-xs font-bold text-rose-600"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {t.profilePage.removePhotoBtn}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {t.profilePage.fullNameLabel}
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                          <Input
                            {...field}
                            className="pl-10 h-12 bg-background border-border rounded-xl"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t.profilePage.emailLabel}
                  </FormLabel>
                  <div className="relative group opacity-50">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30" />
                    <Input
                      value={profile?.email || ''}
                      disabled
                      className="pl-10 h-12 bg-muted border-border rounded-xl cursor-not-allowed"
                    />
                  </div>
                  <FormDescription className="text-[10px] font-medium">
                    {t.profilePage.emailHelper}
                  </FormDescription>
                </FormItem>

                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {t.profilePage.regionLabel}
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                          <Input
                            {...field}
                            className="pl-10 h-12 bg-background border-border rounded-xl"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cluster"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {t.profilePage.clusterLabel}
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                          <Input
                            {...field}
                            className="pl-10 h-12 bg-background border-border rounded-xl"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="profilePhoto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {t.profilePage.photoUrlLabel}
                    </FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Camera className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                        <Input
                          {...field}
                          placeholder="https://images.unsplash.com/..."
                          className="pl-10 h-12 bg-background border-border rounded-xl"
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-[10px] font-medium">
                      {t.profilePage.photoUrlHelper}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/60">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                  <p className="text-xs font-bold text-foreground">
                    {t.profilePage.verificationNote}
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto h-11 px-7 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/10"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t.profilePage.savingBtn}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> {t.profilePage.saveBtn}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>

      {/* Google Authenticator (2FA) Individual Security Card */}
      <Card className="border border-border shadow-sm bg-card rounded-2xl overflow-hidden">
        <CardHeader className="p-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60">
          <div className="space-y-1">
            <CardTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              {t.profilePage.twoFactorTitle}
            </CardTitle>
            <CardDescription className="text-xs">{t.profilePage.twoFactorSub}</CardDescription>
          </div>
          <span
            className={cn(
              'px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider self-start sm:self-auto',
              isTwoFactorEnabled
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            )}
          >
            {isTwoFactorEnabled
              ? t.profilePage.twoFactorEnabledBadge
              : t.profilePage.twoFactorDisabledBadge}
          </span>
        </CardHeader>

        <CardContent className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-muted/30 border border-border/60">
            <div className="flex items-center gap-3">
              <Switch
                checked={isTwoFactorEnabled}
                onCheckedChange={(checked) => handleToggleTwoFactor(checked)}
              />
              <span className="text-sm font-bold text-foreground">
                {t.profilePage.twoFactorToggleLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={isTwoFactorEnabled ? 'outline' : 'default'}
                size="sm"
                onClick={() => handleToggleTwoFactor(!isTwoFactorEnabled)}
                className={cn(
                  'h-9 rounded-xl text-xs font-bold',
                  isTwoFactorEnabled &&
                    'border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                )}
              >
                {isTwoFactorEnabled
                  ? t.profilePage.twoFactorTurnOffBtn
                  : t.profilePage.twoFactorTurnOnBtn}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenQrModal(false)}
                className="h-9 rounded-xl text-xs font-bold"
              >
                <QrCode className="mr-1.5 h-3.5 w-3.5 text-primary" />
                {t.profilePage.twoFactorSetupQrBtn}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password & Preferences Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Password & Login Security Card */}
        <Card className="border border-border shadow-sm bg-card rounded-2xl">
          <CardHeader className="p-6 pb-4 border-b border-border/60">
            <CardTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              {t.profilePage.passwordCardTitle}
            </CardTitle>
            <CardDescription className="text-xs">{t.profilePage.passwordCardSub}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <form onSubmit={handleUpdatePassword} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  {t.profilePage.currentPassLabel}
                </label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  {t.profilePage.newPassLabel}
                </label>
                <Input
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-10 rounded-xl text-xs"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isUpdatingPassword || !currentPassword || newPassword.length < 8}
                  className="h-9 rounded-xl text-xs font-bold"
                >
                  {isUpdatingPassword && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {t.profilePage.updatePassBtn}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSendingReset}
                  onClick={handleSendPasswordReset}
                  className="h-9 rounded-xl text-xs font-bold"
                >
                  {t.profilePage.sendResetEmailBtn}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Language & Theme Preferences Card */}
        <Card className="border border-border shadow-sm bg-card rounded-2xl">
          <CardHeader className="p-6 pb-4 border-b border-border/60">
            <CardTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              {t.profilePage.preferencesTitle}
            </CardTitle>
            <CardDescription className="text-xs">{t.profilePage.preferencesSub}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                {t.profilePage.languagePrefLabel}
              </label>
              <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {LOCALES.map((item) => (
                    <SelectItem key={item.code} value={item.code} className="text-xs font-bold">
                      {item.nativeName} ({item.englishName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                {t.profilePage.themePrefLabel}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'light', label: t.profilePage.themeLight, icon: Sun },
                    { id: 'dark', label: t.profilePage.themeDark, icon: Moon },
                    { id: 'system', label: t.profilePage.themeSystem, icon: Monitor },
                  ] as const
                ).map((modeItem) => (
                  <button
                    key={modeItem.id}
                    type="button"
                    onClick={() => setTheme(modeItem.id)}
                    className={cn(
                      'h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                      theme === modeItem.id
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-muted-foreground border-border hover:text-foreground'
                    )}
                  >
                    <modeItem.icon className="h-3.5 w-3.5" />
                    {modeItem.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pair / Re-Pair Google Authenticator QR Code Modal */}
      <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              {t.profilePage.twoFactorModalTitle}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t.profilePage.twoFactorModalDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {otpAuthUri && (
              <div className="mx-auto w-fit p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <QRCodeSVG value={otpAuthUri} size={180} />
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  {t.profilePage.twoFactorSecretLabel}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenQrModal(true)}
                  className="text-[10px] font-bold text-primary underline cursor-pointer"
                >
                  {t.profilePage.twoFactorResetSecretBtn}
                </button>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/50 border border-border">
                <code className="text-xs font-mono font-bold flex-1 truncate">
                  {pendingSecret}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleCopySecret}
                  className="h-7 w-7 rounded-lg"
                >
                  {copiedSecret ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Input
                value={otpVerifyInput}
                onChange={(e) => setOtpVerifyInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t.profilePage.twoFactorVerifyCodePlaceholder}
                className="h-11 rounded-xl text-center font-mono text-base font-black tracking-[0.35em]"
                maxLength={6}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsQrModalOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              disabled={otpVerifyInput.length !== 6}
              onClick={handleConfirmPairAuthenticator}
              className="rounded-xl bg-primary text-white text-xs font-bold"
            >
              {t.profilePage.twoFactorConfirmPairBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}