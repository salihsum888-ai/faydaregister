
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
  DialogFooter
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
import { useState, useMemo } from 'react';
import { useTranslation } from '@/i18n/language-provider';

export function AddRegistrationModal() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const formSchema = useMemo(
    () =>
      z.object({
        applicantName: z.string().min(2, t.registrationModal.valNameMin),
        id: z.string().regex(/^\d{29}$/, t.registrationModal.valRidExact),
        submissionDate: z.string().min(1, t.registrationModal.valDateReq),
        phone: z.string().regex(/^\d+$/, t.registrationModal.valPhoneDigits),
        status: z.enum(['Processed', 'Pending Review', 'Rejected', 'Processing', 'Failed']),
        officer: z.string().optional(),
        location: z.string().min(1, t.registrationModal.valLocationReq),
        remarks: z.string().optional(),
      }),
    [t]
  );

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      applicantName: '',
      id: '',
      submissionDate: new Date().toISOString().split('T')[0],
      phone: '',
      status: 'Pending Review',
      officer: '',
      location: '',
      remarks: '',
    },
  });

  function onSubmit(values: FormValues) {
    console.log(values);
    setOpen(false);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#0f172a] hover:bg-[#1e293b] text-white font-semibold shadow-sm">
          {t.registrationModal.addRegistrationBtn}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden rounded-xl">
        <DialogHeader className="p-5 border-b bg-slate-50/50">
          <DialogTitle className="text-lg font-bold text-slate-800">{t.registrationModal.newModalTitle}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="applicantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-slate-500">{t.registrationModal.fullNameLabel}</FormLabel>
                    <FormControl>
                      <Input placeholder={t.registrationModal.fullNamePlaceholder} {...field} className="h-9 text-sm" />
                    </FormControl>
                    <FormMessage className="text-[9px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-slate-500">
                      {t.registrationModal.ridLabel.replace('{count}', String((field.value || '').length))}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t.registrationModal.ridPlaceholder} {...field} className="h-9 text-sm" maxLength={29} />
                    </FormControl>
                    <FormMessage className="text-[9px]" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="submissionDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-slate-500">{t.registrationModal.dateLabel}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="h-9 text-sm" />
                    </FormControl>
                    <FormMessage className="text-[9px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-slate-500">{t.registrationModal.phoneLabel}</FormLabel>
                    <FormControl>
                      <Input placeholder={t.registrationModal.phonePlaceholder} {...field} className="h-9 text-sm" />
                    </FormControl>
                    <FormMessage className="text-[9px]" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-slate-500">{t.registrationModal.statusLabel}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder={t.registrationModal.selectStatusPlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Pending Review">{t.common.status['Pending Review']}</SelectItem>
                        <SelectItem value="Processed">{t.common.status.Processed}</SelectItem>
                        <SelectItem value="Processing">{t.common.status.Processing}</SelectItem>
                        <SelectItem value="Rejected">{t.common.status.Rejected}</SelectItem>
                        <SelectItem value="Failed">{t.common.status.Failed}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[9px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="officer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-bold uppercase text-slate-500">{t.registrationModal.officerLabel}</FormLabel>
                    <FormControl>
                      <Input placeholder={t.registrationModal.officerPlaceholder} {...field} className="h-9 text-sm" />
                    </FormControl>
                    <FormMessage className="text-[9px]" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase text-slate-500">{t.registrationModal.locationLabel} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t.registrationModal.locationPlaceholder} {...field} className="h-9 text-sm" />
                  </FormControl>
                  <FormMessage className="text-[9px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase text-slate-500">{t.registrationModal.remarksLabel}</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={t.registrationModal.remarksPlaceholder} 
                      className="resize-none min-h-[70px] text-sm" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-[9px]" />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-9 px-6 text-sm">
                {t.registrationModal.discardBtn}
              </Button>
              <Button type="submit" className="bg-[#0f172a] hover:bg-[#1e293b] h-9 px-6 text-sm">
                {t.common.save}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
