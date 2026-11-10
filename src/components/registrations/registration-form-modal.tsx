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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useState, useEffect, useMemo } from 'react';
import { Registration, UserProfile } from '@/lib/types';
import { Edit2, Plus, Building2, Sparkles, Check, AlertTriangle, ClipboardPaste } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where, limit } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { logAuditAction } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/language-provider';

interface RegistrationFormModalProps {
  registration?: Registration;
  mode: 'add' | 'edit';
  trigger?: React.ReactNode;
  defaultIsSchool?: boolean;
  defaultSchoolName?: string;
  existingSchools?: string[];
}

export function RegistrationFormModal({
  registration,
  mode,
  trigger,
  defaultIsSchool = false,
  defaultSchoolName = '',
  existingSchools,
}: RegistrationFormModalProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const { t } = useTranslation();

  const formSchema = useMemo(
    () =>
      z
        .object({
          applicantName: z.string().min(2, t.registrationModal.valNameMin),
          id: z.string().regex(/^\d{29}$/, t.registrationModal.valRidExact),
          submissionDate: z.string().min(1, t.registrationModal.valDateReq),
          phone: z.string().regex(/^\d+$/, t.registrationModal.valPhoneDigits),
          status: z.enum(['Processed', 'Pending Review', 'Rejected', 'Processing', 'Failed']),
          rejectionReason: z.string().optional(),
          officer: z.string().optional(),
          location: z.string().min(1, t.registrationModal.valLocationReq),
          remarks: z.string().optional(),
          isSchoolRegistration: z.boolean().default(false),
          schoolName: z.string().optional(),
        })
        .refine(
          (data) => {
            if (data.isSchoolRegistration) {
              return Boolean(data.schoolName && data.schoolName.trim().length >= 2);
            }
            return true;
          },
          {
            message: t.registrationModal.valInstReq,
            path: ['schoolName'],
          }
        ),
    [t]
  );

  type FormValues = z.infer<typeof formSchema>;

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  // Query registrations when modal is open for institution suggestions and live 29-digit RID duplicate check
  const schoolSuggestionsQuery = useMemoFirebase(() => {
    if (!db || !user || !open) return null;
    if (profile?.role === 'admin') {
      return query(collection(db, 'registrations'), limit(2000));
    }
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', user.uid),
      limit(2000)
    );
  }, [db, user, open, profile?.role]);

  const { data: fetchedRegistrations } = useCollection<Registration>(schoolSuggestionsQuery);

  const availableSchools = useMemo(() => {
    const names = new Set<string>();
    if (existingSchools && existingSchools.length > 0) {
      existingSchools.forEach((s) => {
        if (s && s.trim()) names.add(s.trim());
      });
    }
    if (fetchedRegistrations && fetchedRegistrations.length > 0) {
      fetchedRegistrations.forEach((reg) => {
        const inst = (reg.institutionName || reg.schoolName || '').trim();
        if (inst) {
          names.add(inst);
        }
      });
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [existingSchools, fetchedRegistrations]);

  const initialIsSchool = Boolean(
    registration?.isInstitutionRegistration ||
    registration?.isSchoolRegistration ||
    (registration?.institutionName && registration.institutionName.trim().length > 0) ||
    (registration?.schoolName && registration.schoolName.trim().length > 0) ||
    defaultIsSchool ||
    Boolean(defaultSchoolName && defaultSchoolName.trim().length > 0)
  );

  const initialSchoolName = registration?.institutionName || registration?.schoolName || defaultSchoolName || '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      applicantName: registration?.applicantName || '',
      id: registration?.id || '',
      submissionDate: registration?.submissionDate ? new Date(registration.submissionDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      phone: registration?.phone || '',
      status: registration?.status || 'Pending Review',
      rejectionReason: registration?.rejectionReason || '',
      officer: registration?.officer || '',
      location: registration?.location || '',
      remarks: registration?.remarks || '',
      isSchoolRegistration: initialIsSchool,
      schoolName: initialSchoolName,
    },
  });

  const selectedStatus = form.watch('status');
  const isSchoolRegistration = form.watch('isSchoolRegistration');
  const currentSchoolName = form.watch('schoolName') || '';
  const watchedId = (form.watch('id') || '').trim();

  // Check ONLY 29-digit Registration ID for duplicates (shared phone numbers across family/citizens are allowed)
  const duplicateRidMatch = useMemo(() => {
    if (mode !== 'add' || watchedId.length < 10 || !fetchedRegistrations) return null;
    return fetchedRegistrations.find((r) => (r.id || '').trim() === watchedId) || null;
  }, [mode, watchedId, fetchedRegistrations]);

  const handleExtractRidFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const match = (text || '').replace(/\s+/g, '').match(/\d{29}/);
      if (match && match[0]) {
        form.setValue('id', match[0], { shouldValidate: true });
        toast({
          title: t.registrationModal.toastExtractedTitle,
          description: t.registrationModal.toastExtractedDesc.replace('{rid}', match[0]),
        });
      } else {
        const digitsOnly = (text || '').replace(/\D/g, '').slice(0, 29);
        if (digitsOnly.length > 0) {
          form.setValue('id', digitsOnly, { shouldValidate: true });
          toast({
            title: t.registrationModal.toastDigitsPastedTitle,
            description: t.registrationModal.toastDigitsPastedDesc.replace('{count}', String(digitsOnly.length)),
          });
        } else {
          toast({
            variant: 'destructive',
            title: t.registrationModal.toastNoIdTitle,
            description: t.registrationModal.toastNoIdDesc,
          });
        }
      }
    } catch {
      toast({
        variant: 'destructive',
        title: t.registrationModal.toastClipboardBlockedTitle,
        description: t.registrationModal.toastClipboardBlockedDesc,
      });
    }
  };

  const filteredSuggestions = useMemo(() => {
    if (availableSchools.length === 0) return [];
    const q = currentSchoolName.trim().toLowerCase();
    if (!q) return availableSchools.slice(0, 8);
    return availableSchools
      .filter((s) => s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [availableSchools, currentSchoolName]);

  useEffect(() => {
    if (open) {
      const resetIsSchool = Boolean(
        registration?.isInstitutionRegistration ||
        registration?.isSchoolRegistration ||
        (registration?.institutionName && registration.institutionName.trim().length > 0) ||
        (registration?.schoolName && registration.schoolName.trim().length > 0) ||
        defaultIsSchool ||
        Boolean(defaultSchoolName && defaultSchoolName.trim().length > 0)
      );
      const resetSchoolName = registration?.institutionName || registration?.schoolName || defaultSchoolName || '';

      form.reset({
        applicantName: registration?.applicantName || '',
        id: registration?.id || '',
        submissionDate: registration?.submissionDate ? new Date(registration.submissionDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        phone: registration?.phone || '',
        status: registration?.status || 'Pending Review',
        rejectionReason: registration?.rejectionReason || '',
        officer: registration?.officer || (mode === 'add' ? profile?.fullName : registration?.officer) || '',
        location: registration?.location || '',
        remarks: registration?.remarks || '',
        isSchoolRegistration: resetIsSchool,
        schoolName: resetSchoolName,
      });
    }
  }, [open, registration, form, profile, mode, defaultIsSchool, defaultSchoolName]);

  function onSubmit(values: FormValues) {
    if (!db || !user || !profile) return;

    const finalRejectionReason = values.status === 'Rejected' ? values.rejectionReason : '';
    const cleanedSchoolName = values.isSchoolRegistration && values.schoolName
      ? values.schoolName.trim()
      : '';

    const data = {
      ...values,
      isSchoolRegistration: Boolean(values.isSchoolRegistration && cleanedSchoolName.length > 0),
      schoolName: cleanedSchoolName,
      isInstitutionRegistration: Boolean(values.isSchoolRegistration && cleanedSchoolName.length > 0),
      institutionName: cleanedSchoolName,
      rejectionReason: finalRejectionReason,
      submissionDate: new Date(values.submissionDate).toISOString(),
      updatedAt: new Date().toISOString(),
      assignedReviewerId: mode === 'add' ? user.uid : (registration?.assignedReviewerId || user.uid),
      requiredFieldsFilled: true,
      attachmentsIncluded: false,
    };

    if (mode === 'edit' && registration) {
      setDocumentNonBlocking(doc(db, 'registrations', registration.id), data, { merge: true });
      logAuditAction(
        db, 
        user, 
        profile.fullName,
        'STATUS_UPDATE', 
        registration.id, 
        `Registry: Modified record for ${values.applicantName}${cleanedSchoolName ? ` (Institution: ${cleanedSchoolName})` : ''}. New Status: ${values.status}.`
      );
      toast({
        title: t.registrationModal.toastUpdatedTitle,
        description: t.registrationModal.toastUpdatedDesc.replace('{name}', values.applicantName),
      });
    } else {
      setDocumentNonBlocking(doc(db, 'registrations', values.id), data, { merge: true });
      logAuditAction(
        db, 
        user, 
        profile.fullName,
        'RECORD_CREATED', 
        values.id, 
        `Registry: Created new registration for ${values.applicantName}${cleanedSchoolName ? ` (Institution: ${cleanedSchoolName})` : ''}.`
      );
      toast({
        title: t.registrationModal.toastCreatedTitle,
        description: t.registrationModal.toastCreatedDesc.replace('{name}', values.applicantName),
      });
    }

    setOpen(false);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className={mode === 'add' ? "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" : "h-7 text-[10px] px-3 font-semibold text-muted-foreground hover:text-foreground"}>
            {mode === 'add' ? (
              <><Plus className="mr-2 h-4 w-4" /> {t.registrationModal.addRegistrationBtn}</>
            ) : (
              t.registrationModal.editBtn
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[560px] p-0 overflow-hidden rounded-2xl border border-white/60 dark:border-white/10 shadow-2xl glass-card-surface max-h-[95vh] overflow-y-auto">
        <DialogHeader className="p-6 border-b border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.03]">
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2.5">
            {mode === 'add' ? <Plus className="h-6 w-6 text-primary" /> : <Edit2 className="h-6 w-6 text-primary" />}
            {mode === 'add' ? t.registrationModal.newModalTitle : t.registrationModal.editModalTitle}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-5">
            {/* Institution Registration Toggle + Institution Name Input with Suggestions */}
            <div className="rounded-2xl glass-subpanel p-4 space-y-4 border border-white/70 dark:border-white/10 transition-all duration-300">
              <FormField
                control={form.control}
                name="isSchoolRegistration"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 space-y-0">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-colors shrink-0",
                        field.value
                          ? "bg-primary text-white shadow-md shadow-primary/25"
                          : "bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                      )}>
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <FormLabel className="text-xs font-bold text-foreground cursor-pointer">
                          {t.registrationModal.institutionToggleLabel}
                        </FormLabel>
                        <p className="text-[11px] text-muted-foreground">
                          {t.registrationModal.institutionToggleDesc}
                        </p>
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (!checked) {
                            form.setValue('schoolName', '');
                            form.clearErrors('schoolName');
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {isSchoolRegistration && (
                <div className="pt-2 border-t border-white/60 dark:border-white/10 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <FormField
                    control={form.control}
                    name="schoolName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-bold uppercase text-primary tracking-wider flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          {t.registrationModal.institutionNameLabel}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t.registrationModal.institutionNamePlaceholder}
                            {...field}
                            className="h-11 bg-background/90 border-primary/30 focus-visible:ring-primary"
                          />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />

                  {filteredSuggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-primary" />
                        {t.registrationModal.suggestionsLabel}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {filteredSuggestions.map((school) => {
                          const isSelected = currentSchoolName.trim().toLowerCase() === school.toLowerCase();
                          return (
                            <button
                              key={school}
                              type="button"
                              onClick={() => {
                                form.setValue('schoolName', school, { shouldValidate: true });
                              }}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer",
                                isSelected
                                  ? "bg-primary text-white shadow-sm"
                                  : "bg-white/70 dark:bg-white/[0.06] hover:bg-primary/15 text-slate-700 dark:text-slate-200 border border-white/80 dark:border-white/10"
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                              <span>{school}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="applicantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                      {t.registrationModal.fullNameLabel}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t.registrationModal.fullNamePlaceholder} {...field} className="h-11 bg-background border-border" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                        {t.registrationModal.ridLabel.replace('{count}', String(watchedId.length))}
                      </FormLabel>
                      {mode === 'add' && (
                        <button
                          type="button"
                          onClick={handleExtractRidFromClipboard}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline cursor-pointer shrink-0"
                          title={t.registrationModal.paste29DigitTooltip}
                        >
                          <ClipboardPaste className="h-3 w-3" /> {t.registrationModal.paste29DigitBtn}
                        </button>
                      )}
                    </div>
                    <FormControl>
                      <Input placeholder={t.registrationModal.ridPlaceholder} {...field} className="h-11 bg-background border-border font-mono text-xs" maxLength={29} disabled={mode === 'edit'} />
                    </FormControl>
                    {duplicateRidMatch && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {t.registrationModal.duplicateWarning
                            .replace('{name}', duplicateRidMatch.applicantName)
                            .replace('{status}', t.common.status[duplicateRidMatch.status] || duplicateRidMatch.status)}
                        </span>
                      </div>
                    )}
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="submissionDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{t.registrationModal.dateLabel}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="h-11 bg-background border-border" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{t.registrationModal.phoneLabel}</FormLabel>
                    <FormControl>
                      <Input placeholder={t.registrationModal.phonePlaceholder} {...field} className="h-11 bg-background border-border" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{t.registrationModal.statusLabel}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11 bg-background border-border">
                          <SelectValue placeholder={t.registrationModal.selectStatusPlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Pending Review">{t.common.status['Pending Review']}</SelectItem>
                        <SelectItem value="Processing">{t.common.status.Processing}</SelectItem>
                        <SelectItem value="Processed">{t.common.status.Processed}</SelectItem>
                        <SelectItem value="Rejected">{t.common.status.Rejected}</SelectItem>
                        <SelectItem value="Failed">{t.common.status.Failed}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="officer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{t.registrationModal.officerLabel}</FormLabel>
                    <FormControl>
                      <Input placeholder={t.registrationModal.officerPlaceholder} {...field} className="h-11 bg-background border-border" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {selectedStatus === 'Rejected' && (
              <FormField
                control={form.control}
                name="rejectionReason"
                render={({ field }) => (
                  <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <FormLabel className="text-[10px] font-bold uppercase text-rose-500 tracking-wider">{t.registrationModal.rejectionReasonLabel}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11 border-rose-200 bg-rose-500/10 text-rose-600">
                          <SelectValue placeholder={t.registrationModal.selectReasonPlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Biometric Match">{t.registrationModal.reasonBiometricMatch}</SelectItem>
                        <SelectItem value="Rejected by Superveser">{t.registrationModal.reasonSupervisor}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{t.registrationModal.locationLabel}</FormLabel>
                  <FormControl>
                    <Input placeholder={t.registrationModal.locationPlaceholder} {...field} className="h-11 bg-background border-border" />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{t.registrationModal.remarksLabel}</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={t.registrationModal.remarksPlaceholder} 
                      className="resize-none min-h-[80px] bg-background border-border" 
                      {...field} 
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-3 pt-2">
              <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md">
                {mode === 'add' ? t.registrationModal.finalizeBtn : t.registrationModal.updateBtn}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-12 font-bold text-muted-foreground">
                {t.registrationModal.discardBtn}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}