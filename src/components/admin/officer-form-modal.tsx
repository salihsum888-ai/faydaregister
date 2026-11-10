
"use client"

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { UserPlus, ShieldCheck, UserCircle, MapPin, Layers, ImageIcon, Loader2, Mail, Edit2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { UserProfile } from '@/lib/types';
import { logAuditAction } from '@/lib/audit';
import { VerificationAnimation } from '@/components/auth/verification-animation';
import { useTranslation } from '@/i18n/language-provider';
import { useMemo } from 'react';

interface OfficerFormModalProps {
  mode?: 'add' | 'edit';
  officer?: UserProfile;
  trigger?: React.ReactNode;
}

export function OfficerFormModal({ mode = 'add', officer, trigger }: OfficerFormModalProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifiedData, setVerifiedData] = useState<{ fullName: string; role: string } | null>(null);
  const { toast } = useToast();
  const db = useFirestore();
  const { user: currentUser } = useUser();

  const formSchema = useMemo(
    () =>
      z.object({
        fullName: z.string().min(2, t.officerModal.valNameMin),
        email: z.string().email(t.officerModal.valEmail),
        role: z.enum(['reviewer', 'admin']),
        password: z
          .string()
          .optional()
          .refine((val) => !val || val.length >= 8, {
            message: t.officerModal.valPassMin,
          }),
        region: z.string().min(1, t.officerModal.valRegionReq),
        cluster: z.string().min(1, t.officerModal.valClusterReq),
        profilePhoto: z.string().optional(),
      }),
    [t]
  );

  type FormValues = z.infer<typeof formSchema>;

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !currentUser?.uid) return null;
    return doc(db, 'users', currentUser.uid);
  }, [db, currentUser?.uid]);
  const { data: currentProfile } = useDoc<UserProfile>(userProfileRef);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: officer?.fullName || '',
      email: officer?.email || '',
      role: (officer?.role as 'reviewer' | 'admin') || 'reviewer',
      password: '',
      region: officer?.region || '',
      cluster: officer?.cluster || '',
      profilePhoto: officer?.profilePhoto || '',
    },
  });

  useEffect(() => {
    if (!open) {
      setVerifiedData(null);
    }
    if (open && mode === 'edit' && officer) {
      form.reset({
        fullName: officer.fullName,
        email: officer.email,
        role: officer.role as any,
        password: '',
        region: officer.region,
        cluster: officer.cluster,
        profilePhoto: officer.profilePhoto,
      });
    } else if (open && mode === 'add') {
      form.reset({
        fullName: '',
        email: '',
        role: 'reviewer',
        password: '',
        region: '',
        cluster: '',
        profilePhoto: '',
      });
    }
  }, [open, mode, officer, form]);

  async function onSubmit(values: FormValues) {
    if (!db || !currentUser || !currentProfile) return;
    setIsSubmitting(true);

    try {
      if (mode === 'add') {
        if (!values.password) {
          toast({ title: t.officerModal.toastPassReqTitle, description: t.officerModal.toastPassReqDesc, variant: "destructive" });
          setIsSubmitting(false);
          return;
        }

        const existingSecondary = getApps().find(a => a.name === 'SecondaryApp');
        const secondaryApp = existingSecondary || initializeApp(firebaseConfig, 'SecondaryApp');
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, values.email, values.password);
          const uid = userCredential.user.uid;

          const profileData = {
            id: uid,
            fullName: values.fullName,
            email: values.email,
            role: values.role,
            region: values.region,
            cluster: values.cluster,
            profilePhoto: values.profilePhoto || `https://api.dicebear.com/7.x/initials/svg?seed=${values.fullName}`,
            updatedAt: new Date().toISOString(),
            twoFactorEnabled: true, // Mandatory MFA for everyone
            twoFactorSecret: '', 
          };

          setDocumentNonBlocking(doc(db, 'users', uid), profileData, { merge: true });

          if (values.role === 'admin') {
            setDocumentNonBlocking(doc(db, 'admin_users', uid), { active: true }, { merge: true });
          }
          
          logAuditAction(
            db,
            currentUser,
            currentProfile.fullName,
            'PERSONNEL_MODIFIED',
            uid,
            `Registered new official: ${values.fullName} with ${values.role} clearance. MFA Initialized.`
          );

          toast({
            title: t.officerModal.toastAddedTitle,
            description: t.officerModal.toastAddedDesc.replace('{name}', values.fullName),
          });
        } finally {
          await deleteApp(secondaryApp).catch(() => {});
        }
      } else if (mode === 'edit' && officer) {
        const profileData = {
          fullName: values.fullName,
          role: values.role,
          region: values.region,
          cluster: values.cluster,
          profilePhoto: values.profilePhoto,
          updatedAt: new Date().toISOString(),
        };

        updateDocumentNonBlocking(doc(db, 'users', officer.id), profileData);

        if (values.role === 'admin') {
          setDocumentNonBlocking(doc(db, 'admin_users', officer.id), { active: true }, { merge: true });
        } else if (officer.role === 'admin') {
          deleteDocumentNonBlocking(doc(db, 'admin_users', officer.id));
        }

        logAuditAction(
          db,
          currentUser,
          currentProfile.fullName,
          'PERSONNEL_MODIFIED',
          officer.id,
          `Modified profile for official: ${values.fullName}.`
        );

        toast({
          title: t.officerModal.toastUpdatedTitle,
          description: t.officerModal.toastUpdatedDesc.replace('{name}', values.fullName),
        });
      }

      setVerifiedData({
        fullName: values.fullName,
        role: values.role === 'admin' ? t.officerModal.roleAdminLabel : t.officerModal.roleOfficerLabel,
      });
      setTimeout(() => {
        setOpen(false);
        setVerifiedData(null);
        form.reset();
      }, 1450);
    } catch (error: any) {
      toast({
        title: t.officerModal.toastErrorTitle,
        description: error.message || t.officerModal.toastErrorDesc,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-black text-[10px] uppercase tracking-widest px-6 h-11 rounded-xl shadow-xl shadow-primary/10">
            <UserPlus className="mr-2 h-4 w-4" /> {t.officerModal.registerBtn}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[550px] p-0 overflow-hidden rounded-[32px] border-none shadow-2xl bg-popover max-h-[90vh] overflow-y-auto">
        <DialogHeader className="p-6 sm:p-8 border-b border-border bg-muted/30">
          <DialogTitle className="text-xl font-black text-foreground flex items-center gap-3 uppercase tracking-tighter">
            {mode === 'add' ? <UserPlus className="h-6 w-6 text-primary" /> : <Edit2 className="h-6 w-6 text-primary" />}
            {mode === 'add' ? t.officerModal.titleAdd : t.officerModal.titleEdit}
          </DialogTitle>
        </DialogHeader>
        
        {verifiedData ? (
          <div className="bg-card p-6">
            <VerificationAnimation
              variant="provisioned"
              title={mode === 'add' ? t.officerModal.animTitleAdd : t.officerModal.animTitleEdit}
              subtitle={
                mode === 'add'
                  ? t.officerModal.animSubtitleAdd
                  : t.officerModal.animSubtitleEdit
              }
              userName={verifiedData.fullName}
              userRole={verifiedData.role}
              durationMs={1400}
              compact
            />
          </div>
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 sm:p-8 space-y-6 bg-card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.officerModal.fullNameLabel}</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                        <Input placeholder={t.officerModal.fullNamePlaceholder} {...field} className="pl-10 h-12 bg-background border-border rounded-xl" disabled={isSubmitting} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.officerModal.emailLabel}</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                        <Input type="email" placeholder={t.officerModal.emailPlaceholder} {...field} className="pl-10 h-12 bg-background border-border rounded-xl" disabled={isSubmitting || mode === 'edit'} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.officerModal.regionLabel}</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                        <Input placeholder={t.officerModal.regionPlaceholder} {...field} className="pl-10 h-12 bg-background border-border rounded-xl" disabled={isSubmitting} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cluster"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.officerModal.clusterLabel}</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                        <Input placeholder={t.officerModal.clusterPlaceholder} {...field} className="pl-10 h-12 bg-background border-border rounded-xl" disabled={isSubmitting} />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.officerModal.roleLabel}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                      <FormControl>
                        <SelectTrigger className="h-12 bg-background border-border rounded-xl font-bold text-xs">
                          <SelectValue placeholder={t.officerModal.rolePlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="reviewer" className="text-xs font-bold">{t.officerModal.roleReviewerItem}</SelectItem>
                        <SelectItem value="admin" className="text-xs font-bold">{t.officerModal.roleAdminItem}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              {mode === 'add' && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.officerModal.passwordLabel}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t.officerModal.passwordPlaceholder} {...field} className="h-12 bg-background border-border rounded-xl" disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="profilePhoto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">{t.officerModal.photoLabel}</FormLabel>
                  <FormControl>
                    <div className="relative group">
                      <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                      <Input placeholder="https://..." {...field} className="pl-10 h-12 bg-background border-border rounded-xl" disabled={isSubmitting} />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <div className="pt-6 flex flex-col gap-3">
              <Button type="submit" className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/10 transition-all active:scale-[0.98]" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t.officerModal.submittingBtn}</>
                ) : (
                  <><ShieldCheck className="mr-2 h-4 w-4" /> {mode === 'add' ? t.officerModal.submitAddBtn : t.officerModal.submitEditBtn}</>
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-12 text-muted-foreground font-bold uppercase text-[10px] tracking-widest" disabled={isSubmitting}>
                {t.officerModal.cancelBtn}
              </Button>
            </div>
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

