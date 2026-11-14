"use client"

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { 
  CalendarPlus, 
  CheckCircle2, 
  Smartphone, 
  Phone,
  Trash2,
  X,
  Loader2,
  Search,
  FileSpreadsheet,
  FileText,
  ArrowUpDown,
  Eye,
  RotateCcw,
  SquarePen,
  Building2,
  Sparkles,
  Check,
  Users,
  UserCheck,
  User
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, where, serverTimestamp, doc } from 'firebase/firestore';
import { 
  addDocumentNonBlocking, 
  setDocumentNonBlocking, 
  deleteDocumentNonBlocking 
} from '@/firebase/non-blocking-updates';
import { DailyReport, Registration, UserProfile } from '@/lib/types';
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

import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { useTranslation } from '@/i18n/language-provider';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DailyReportValues {
  date: string;
  ethioCount: number;
  safaricomCount: number;
  remarks?: string;
  isSchoolRegistration: boolean;
  schoolName?: string;
  studentCount: number;
  nonStudentCount: number;
}

function getReportSplit(entry: DailyReport) {
  const total = Number(entry.total) || 0;
  const instName = (entry.institutionName || entry.schoolName || '').trim();
  const hasSchool = Boolean(entry.isInstitutionRegistration || entry.isSchoolRegistration || instName.length > 0);
  if (typeof entry.studentCount === 'number') {
    const students = Math.min(total, Math.max(0, entry.studentCount));
    const nonStudents = typeof entry.nonStudentCount === 'number'
      ? Math.max(0, entry.nonStudentCount)
      : Math.max(0, total - students);
    return { students, nonStudents, hasSchool, instName };
  }
  if (hasSchool) {
    return { students: total, nonStudents: 0, hasSchool: true, instName };
  }
  return { students: 0, nonStudents: total, hasSchool: false, instName: '' };
}

export default function DailyRegistrationsPage() {
  const { t, formatDate, formatNumber } = useTranslation();
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  
  // State Matrix
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emptyNumericFields, setEmptyNumericFields] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'school' | 'regular'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const itemsPerPage = 10;
  
  // Deletion state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<{id: string, date: string} | null>(null);

  // Profile lookup for audit signatures
  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  // Fetch only this officer's reports
  const reportsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'daily_reports'),
      where('officerId', '==', user.uid)
    );
  }, [db, user]);

  const { data: rawHistory, isLoading } = useCollection<DailyReport>(reportsQuery);

  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', user.uid)
    );
  }, [db, user]);
  const { data: rawRegistrations } = useCollection<Registration>(registrationsQuery);

  const availableSchools = useMemo(() => {
    const names = new Set<string>();
    rawHistory?.forEach((item) => {
      const inst = (item.institutionName || item.schoolName || '').trim();
      if (inst) names.add(inst);
    });
    rawRegistrations?.forEach((reg) => {
      const inst = (reg.institutionName || reg.schoolName || '').trim();
      if (inst) names.add(inst);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [rawHistory, rawRegistrations]);

  // Filter and Pagination Intelligence
  const history = useMemo(() => {
    if (!rawHistory) return [];
    
    return [...rawHistory]
      .filter(item => {
        const split = getReportSplit(item);
        if (filterType === 'school' && !split.hasSchool && split.students === 0) return false;
        if (filterType === 'regular' && split.nonStudents === 0) return false;

        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          item.date.includes(q) || 
          item.remarks?.toLowerCase().includes(q) ||
          split.instName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rawHistory, searchTerm, filterType]);

  // Summary KPIs across all daily reports
  const summaryStats = useMemo(() => {
    if (!rawHistory) return { totalPeople: 0, totalStudents: 0, totalNonStudents: 0, ethio: 0, safaricom: 0 };
    return rawHistory.reduce(
      (acc, item) => {
        const split = getReportSplit(item);
        acc.totalPeople += Number(item.total) || 0;
        acc.totalStudents += split.students;
        acc.totalNonStudents += split.nonStudents;
        acc.ethio += Number(item.ethioCount) || 0;
        acc.safaricom += Number(item.safaricomCount) || 0;
        return acc;
      },
      { totalPeople: 0, totalStudents: 0, totalNonStudents: 0, ethio: 0, safaricom: 0 }
    );
  }, [rawHistory]);

  const totalPages = Math.ceil(history.length / itemsPerPage);
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return history.slice(start, start + itemsPerPage);
  }, [history, currentPage]);

  const dailyReportSchema = useMemo(
    () =>
      z
        .object({
          date: z.string().min(1, t.dailyReport.valDateReq),
          ethioCount: z.coerce.number().min(0, t.dailyReport.valNonNegative),
          safaricomCount: z.coerce.number().min(0, t.dailyReport.valNonNegative),
          remarks: z.string().optional(),
          isSchoolRegistration: z.boolean().default(false),
          schoolName: z.string().optional(),
          studentCount: z.coerce.number().min(0, t.dailyReport.valNonNegative).default(0),
          nonStudentCount: z.coerce.number().min(0, t.dailyReport.valNonNegative).default(0),
        })
        .superRefine((data, ctx) => {
          const total = (Number(data.ethioCount) || 0) + (Number(data.safaricomCount) || 0);
          if (data.isSchoolRegistration) {
            if (!data.schoolName || data.schoolName.trim().length < 2) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: t.dailyReport.valInstNameReq,
                path: ['schoolName'],
              });
            }
            if (data.studentCount > total) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: t.dailyReport.valInstExceedsTotal
                  .replace('{inst}', String(data.studentCount))
                  .replace('{total}', String(total)),
                path: ['studentCount'],
              });
            }
            if (data.studentCount + data.nonStudentCount !== total) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: t.dailyReport.valSplitMismatch
                  .replace('{inst}', String(data.studentCount))
                  .replace('{ind}', String(data.nonStudentCount))
                  .replace('{total}', String(total)),
                path: ['studentCount'],
              });
            }
          }
        }),
    [t]
  );

  const form = useForm<DailyReportValues>({
    resolver: zodResolver(dailyReportSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      ethioCount: 0,
      safaricomCount: 0,
      remarks: '',
      isSchoolRegistration: false,
      schoolName: '',
      studentCount: 0,
      nonStudentCount: 0,
    },
  });

  const selectedDate = form.watch('date');
  const ethioCount = Number(form.watch('ethioCount')) || 0;
  const safaricomCount = Number(form.watch('safaricomCount')) || 0;
  const dailyTotal = ethioCount + safaricomCount;
  const isSchoolRegistration = form.watch('isSchoolRegistration');
  const currentSchoolName = form.watch('schoolName') || '';
  const studentCount = Number(form.watch('studentCount')) || 0;
  const nonStudentCount = Number(form.watch('nonStudentCount')) || 0;

  // Detect individual registrations logged on the selected date
  const dateIndividualBreakdown = useMemo(() => {
    if (!rawRegistrations || !selectedDate) return null;
    const onDate = rawRegistrations.filter((r) => {
      try {
        return new Date(r.submissionDate).toISOString().split('T')[0] === selectedDate;
      } catch {
        return false;
      }
    });
    if (onDate.length === 0) return null;
    const schoolRegs = onDate.filter((r) =>
      Boolean(
        r.isInstitutionRegistration ||
        r.isSchoolRegistration ||
        (r.institutionName && r.institutionName.trim()) ||
        (r.schoolName && r.schoolName.trim())
      )
    );
    const nonSchoolRegs = onDate.length - schoolRegs.length;
    const firstSchool = schoolRegs[0]?.institutionName || schoolRegs[0]?.schoolName || '';
    return {
      total: onDate.length,
      students: schoolRegs.length,
      nonStudents: nonSchoolRegs,
      schoolName: firstSchool,
    };
  }, [rawRegistrations, selectedDate]);

  const filteredSchoolSuggestions = useMemo(() => {
    if (availableSchools.length === 0) return [];
    const q = currentSchoolName.trim().toLowerCase();
    if (!q) return availableSchools.slice(0, 8);
    return availableSchools.filter(s => s.toLowerCase().includes(q)).slice(0, 8);
  }, [availableSchools, currentSchoolName]);

  // Helper when Ethio or Safaricom count changes so studentCount + nonStudentCount stays synced with new total
  const handleNetworkCountChange = (field: 'ethioCount' | 'safaricomCount', newVal: number) => {
    const safeVal = Math.max(0, newVal);
    form.setValue(field, safeVal, { shouldValidate: true });
    const otherVal = field === 'ethioCount' ? safaricomCount : ethioCount;
    const nextTotal = safeVal + otherVal;

    if (isSchoolRegistration) {
      // Keep nonStudentCount if it fits within nextTotal; otherwise clamp and assign remainder to studentCount
      const keptNonStudent = Math.min(nextTotal, Math.max(0, nonStudentCount));
      const nextStudents = Math.max(0, nextTotal - keptNonStudent);
      form.setValue('studentCount', nextStudents, { shouldValidate: true });
      form.setValue('nonStudentCount', keptNonStudent, { shouldValidate: true });
    } else {
      form.setValue('studentCount', 0, { shouldValidate: true });
      form.setValue('nonStudentCount', nextTotal, { shouldValidate: true });
    }
  };

  // Helper when officer edits Students count directly (e.g., types 10 out of 11 -> nonStudentCount becomes 1)
  const handleStudentCountChange = (newStudents: number) => {
    const clampedStudents = Math.min(dailyTotal, Math.max(0, newStudents));
    const autoNonStudents = Math.max(0, dailyTotal - clampedStudents);
    form.setValue('studentCount', clampedStudents, { shouldValidate: true });
    form.setValue('nonStudentCount', autoNonStudents, { shouldValidate: true });
  };

  // Helper when officer edits Non-Students count directly (e.g., types 1 out of 11 -> studentCount becomes 10)
  const handleNonStudentCountChange = (newNonStudents: number) => {
    const clampedNonStudents = Math.min(dailyTotal, Math.max(0, newNonStudents));
    const autoStudents = Math.max(0, dailyTotal - clampedNonStudents);
    form.setValue('nonStudentCount', clampedNonStudents, { shouldValidate: true });
    form.setValue('studentCount', autoStudents, { shouldValidate: true });
  };

  async function onSubmit(values: DailyReportValues) {
    if (!db || !user) {
      toast({
        variant: 'destructive',
        title: t.dailyReport.toastSyncFailureTitle,
        description: t.dailyReport.toastSyncFailureDesc,
      });
      return;
    }
    const actorName = profile?.fullName || user.displayName || user.email?.split('@')[0] || 'Official';
    setIsSubmitting(true);

    const cleanedSchoolName = values.isSchoolRegistration && values.schoolName
      ? values.schoolName.trim()
      : '';

    const finalStudents = values.isSchoolRegistration
      ? Math.min(dailyTotal, Math.max(0, Number(values.studentCount) || 0))
      : 0;
    const finalNonStudents = values.isSchoolRegistration
      ? Math.max(0, dailyTotal - finalStudents)
      : dailyTotal;

    const reportData = {
      date: values.date,
      ethioCount: Math.max(0, Number(values.ethioCount) || 0),
      safaricomCount: Math.max(0, Number(values.safaricomCount) || 0),
      remarks: (values.remarks || '').trim(),
      isSchoolRegistration: Boolean(values.isSchoolRegistration && cleanedSchoolName.length > 0),
      schoolName: cleanedSchoolName,
      isInstitutionRegistration: Boolean(values.isSchoolRegistration && cleanedSchoolName.length > 0),
      institutionName: cleanedSchoolName,
      studentCount: finalStudents,
      nonStudentCount: finalNonStudents,
      officerId: user.uid,
      total: dailyTotal,
      timestamp: serverTimestamp(),
    };

    const splitSummaryText = values.isSchoolRegistration
      ? ` (${finalStudents} Institution at ${cleanedSchoolName}, ${finalNonStudents} Non-Institution)`
      : ` (${finalNonStudents} Non-Institution)`;

    try {
      if (editingId) {
        await setDocumentNonBlocking(doc(db, 'daily_reports', editingId), reportData, { merge: true });
        
        logAuditAction(
          db,
          user,
          actorName,
          'STATUS_UPDATE',
          editingId,
          `Modified daily report for ${values.date}${splitSummaryText}. Total: ${dailyTotal} (E: ${values.ethioCount}, S: ${values.safaricomCount})`
        );

        toast({
          title: t.dailyReport.toastUpdatedTitle,
          description: t.dailyReport.toastUpdatedDesc
            .replace('{date}', formatDate(values.date, { month: 'short', day: '2-digit' }))
            .replace('{total}', formatNumber(dailyTotal))
            .replace('{inst}', formatNumber(finalStudents))
            .replace('{ind}', formatNumber(finalNonStudents)),
        });
        setEditingId(null);
      } else {
        await addDocumentNonBlocking(collection(db, 'daily_reports'), reportData);
        
        logAuditAction(
          db,
          user,
          actorName,
          'RECORD_CREATED',
          values.date,
          `Logged new daily report for ${values.date}${splitSummaryText}. Total Intake: ${dailyTotal}`
        );

        toast({
          title: t.dailyReport.toastSubmittedTitle,
          description: t.dailyReport.toastSubmittedDesc
            .replace('{total}', formatNumber(dailyTotal))
            .replace('{date}', formatDate(values.date, { month: 'short', day: '2-digit' }))
            .replace('{inst}', formatNumber(finalStudents))
            .replace('{ind}', formatNumber(finalNonStudents)),
        });
      }

      setEmptyNumericFields({});
      form.reset({
        date: new Date().toISOString().split('T')[0],
        ethioCount: 0,
        safaricomCount: 0,
        remarks: '',
        isSchoolRegistration: false,
        schoolName: '',
        studentCount: 0,
        nonStudentCount: 0,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: t.dailyReport.toastSyncFailureTitle,
        description: t.dailyReport.toastSyncFailureDesc,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEdit = (entry: DailyReport) => {
    setEditingId(entry.id);
    setEmptyNumericFields({});
    const split = getReportSplit(entry);
    form.reset({
      date: entry.date,
      ethioCount: entry.ethioCount,
      safaricomCount: entry.safaricomCount,
      remarks: entry.remarks || '',
      isSchoolRegistration: split.hasSchool,
      schoolName: split.instName,
      studentCount: split.students,
      nonStudentCount: split.nonStudents,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = async () => {
    if (!db || !reportToDelete || !user) return;
    const actorName = profile?.fullName || user.displayName || user.email?.split('@')[0] || 'Official';
    
    setIsDeleting(true);
    try {
      await deleteDocumentNonBlocking(doc(db, 'daily_reports', reportToDelete.id));
      
      logAuditAction(
        db,
        user,
        actorName,
        'RECORD_DELETED',
        reportToDelete.id,
        `Purged daily report record for ${reportToDelete.date} from the ledger.`
      );

      if (editingId === reportToDelete.id) {
        setEditingId(null);
        setEmptyNumericFields({});
        form.reset({
          date: new Date().toISOString().split('T')[0],
          ethioCount: 0,
          safaricomCount: 0,
          remarks: '',
          isSchoolRegistration: false,
          schoolName: '',
          studentCount: 0,
          nonStudentCount: 0,
        });
      }

      toast({
        title: t.dailyReport.toastRemovedTitle,
        description: t.dailyReport.toastRemovedDesc.replace(
          '{date}',
          formatDate(reportToDelete.date, { month: 'long', day: '2-digit' })
        ),
        variant: "destructive",
      });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast({
        title: t.dailyReport.toastDeleteFailedTitle,
        description: t.dailyReport.toastDeleteFailedDesc,
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setReportToDelete(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEmptyNumericFields({});
    form.reset({
      date: new Date().toISOString().split('T')[0],
      ethioCount: 0,
      safaricomCount: 0,
      remarks: '',
      isSchoolRegistration: false,
      schoolName: '',
      studentCount: 0,
      nonStudentCount: 0,
    });
  };

  const handleExportExcel = () => {
    if (history.length === 0 || !user) return;
    const actorName = profile?.fullName || user.displayName || user.email?.split('@')[0] || 'Official';
    setIsExporting(true);

    const exportData = history.map(h => {
      const split = getReportSplit(h);
      return {
        'Date': h.date,
        'Institution Name': split.instName || t.dailyReport.individualWalkIn,
        'Ethio Intake': h.ethioCount,
        'Safaricom Intake': h.safaricomCount,
        'Institution Count': split.students,
        'Non-Institution Count': split.nonStudents,
        'Total Registered': h.total,
        'Remarks': h.remarks || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DailyReports");
    XLSX.writeFile(wb, `Bureau_Daily_Reports_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    logAuditAction(
      db,
      user,
      actorName,
      'PERFORMANCE_REVIEW',
      'daily_reporting_ledger',
      `Exported XLSX Daily Throughput Ledger for ${history.length} records.`
    );

    toast({
      title: t.registrationsList.toastExcelCompleteTitle,
      description: t.registrationsList.toastExcelCompleteDesc.replace('{count}', String(history.length)),
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const handleExportPDF = () => {
    if (history.length === 0 || !user) return;
    const actorName = profile?.fullName || user.displayName || user.email?.split('@')[0] || 'Official';
    setIsExporting(true);

    const docPdf = new jsPDF('l', 'mm', 'a4');
    docPdf.text(`Official Bureau Daily Registration Ledger: ${actorName}`, 14, 15);
    docPdf.setFontSize(9);
    docPdf.text(
      `Total Registered: ${summaryStats.totalPeople} | Institution Intake: ${summaryStats.totalStudents} | Non-Institution: ${summaryStats.totalNonStudents}`,
      14,
      21
    );
    const rows = history.map(h => {
      const split = getReportSplit(h);
      return [
        h.date,
        split.instName || 'Individual Intake',
        String(h.ethioCount),
        String(h.safaricomCount),
        String(split.students),
        String(split.nonStudents),
        String(h.total),
        h.remarks || ''
      ];
    });
    autoTable(docPdf, {
      startY: 27,
      head: [['Date', 'Institution Name', 'Ethio', 'Safaricom', 'Institution', 'Non-Institution', 'Total', 'Remarks']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] }
    });
    docPdf.save(`Bureau_Daily_Ledger_${format(new Date(), 'yyyyMMdd')}.pdf`);

    logAuditAction(
      db,
      user,
      actorName,
      'PERFORMANCE_REVIEW',
      'daily_reporting_ledger',
      `Exported PDF Daily Throughput Archive for ${history.length} records.`
    );

    toast({
      title: t.registrationsList.toastPdfCompleteTitle,
      description: t.registrationsList.toastPdfCompleteDesc,
    });
    setTimeout(() => setIsExporting(false), 800);
  };

  const activeStudentsDisplay = isSchoolRegistration ? studentCount : 0;
  const activeNonStudentsDisplay = isSchoolRegistration ? nonStudentCount : dailyTotal;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {t.dailyReport.eyebrow}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">
          {t.dailyReport.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t.dailyReport.subtitle}
        </p>
      </div>

      {/* Top Glassmorphic Summary Strip: Total vs. Institution vs. Non-Institution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="rounded-[22px] relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-indigo-500/15 blur-2xl" />
          <CardContent className="p-6 flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t.dailyReport.kpiTotalPeople}
              </p>
              <p className="text-3xl font-black text-foreground tabular-nums">
                {formatNumber(summaryStats.totalPeople)}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {t.dailyReport.kpiCarrierSub
                  .replace('{ethio}', formatNumber(summaryStats.ethio))
                  .replace('{safaricom}', formatNumber(summaryStats.safaricom))}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl glass-subpanel flex items-center justify-center text-primary">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-sky-500/15 blur-2xl" />
          <CardContent className="p-6 flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                {t.dailyReport.kpiInstitutionIntake}
              </p>
              <p className="text-3xl font-black text-foreground tabular-nums">
                {formatNumber(summaryStats.totalStudents)}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {summaryStats.totalPeople > 0
                  ? `${Number(((summaryStats.totalStudents / summaryStats.totalPeople) * 100).toFixed(2))}% (${formatNumber(summaryStats.totalStudents)}/${formatNumber(summaryStats.totalPeople)})`
                  : t.dailyReport.kpiInstitutionDefaultSub}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl glass-subpanel flex items-center justify-center text-sky-500">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[22px] relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-emerald-500/15 blur-2xl" />
          <CardContent className="p-6 flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                {t.dailyReport.kpiIndividualIntake}
              </p>
              <p className="text-3xl font-black text-foreground tabular-nums">
                {formatNumber(summaryStats.totalNonStudents)}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {summaryStats.totalPeople > 0
                  ? `${Number(((summaryStats.totalNonStudents / summaryStats.totalPeople) * 100).toFixed(2))}% (${formatNumber(summaryStats.totalNonStudents)}/${formatNumber(summaryStats.totalPeople)})`
                  : t.dailyReport.kpiIndividualDefaultSub}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl glass-subpanel flex items-center justify-center text-emerald-500">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-1">
          <Card className={cn(
            "rounded-[24px] sticky top-24 transition-all duration-300",
            editingId && "ring-2 ring-primary/40"
          )}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                  <CalendarPlus className="h-5 w-5 text-primary" />
                  {editingId ? t.dailyReport.formUpdateTitle : t.dailyReport.formNewTitle}
                </CardTitle>
                {editingId && (
                  <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <CardDescription>
                {editingId ? t.dailyReport.formUpdateDesc : t.dailyReport.formNewDesc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                          {t.dailyReport.dateLabel}
                        </FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="h-11 bg-background border-border" disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Smart Detection Banner if individual records exist for this date */}
                  {dateIndividualBreakdown && (
                    <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 space-y-2 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5" />
                          {t.dailyReport.recordsFoundBannerTitle.replace('{date}', selectedDate)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (dateIndividualBreakdown.students > 0) {
                              form.setValue('isSchoolRegistration', true, { shouldValidate: true });
                              if (dateIndividualBreakdown.schoolName) {
                                form.setValue('schoolName', dateIndividualBreakdown.schoolName, { shouldValidate: true });
                              }
                              const baseTotal = dailyTotal > 0 ? dailyTotal : dateIndividualBreakdown.total;
                              if (dailyTotal === 0) {
                                form.setValue('ethioCount', dateIndividualBreakdown.total, { shouldValidate: true });
                              }
                              const syncedStudents = Math.min(baseTotal, dateIndividualBreakdown.students);
                              form.setValue('studentCount', syncedStudents, { shouldValidate: true });
                              form.setValue('nonStudentCount', Math.max(0, baseTotal - syncedStudents), { shouldValidate: true });
                            }
                          }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer"
                        >
                          {t.dailyReport.syncSplitBtn}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-200 tabular-nums">
                        {t.dailyReport.recordsFoundBannerDesc
                          .replace('{total}', formatNumber(dateIndividualBreakdown.total))
                          .replace('{students}', formatNumber(dateIndividualBreakdown.students))
                          .replace(
                            '{schoolSuffix}',
                            dateIndividualBreakdown.schoolName
                              ? ` (${dateIndividualBreakdown.schoolName})`
                              : ''
                          )
                          .replace('{nonStudents}', formatNumber(dateIndividualBreakdown.nonStudents))}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ethioCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-emerald-500" /> {t.dailyReport.ethioLabel}
                          </FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={0}
                              {...field}
                              value={emptyNumericFields.ethioCount ? '' : field.value}
                              disabled={isSubmitting}
                              className="h-11 bg-background border-border tabular-nums" 
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={() => {
                                field.onBlur();
                                setEmptyNumericFields((prev) => ({ ...prev, ethioCount: false }));
                              }}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setEmptyNumericFields((prev) => ({ ...prev, ethioCount: raw === '' }));
                                handleNetworkCountChange('ethioCount', raw === '' ? 0 : Math.max(0, Number(raw) || 0));
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="safaricomCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                            <Smartphone className="h-3 w-3 text-orange-500" /> {t.dailyReport.safaricomLabel}
                          </FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={0}
                              {...field}
                              value={emptyNumericFields.safaricomCount ? '' : field.value}
                              disabled={isSubmitting}
                              className="h-11 bg-background border-border tabular-nums" 
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={() => {
                                field.onBlur();
                                setEmptyNumericFields((prev) => ({ ...prev, safaricomCount: false }));
                              }}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setEmptyNumericFields((prev) => ({ ...prev, safaricomCount: raw === '' }));
                                handleNetworkCountChange('safaricomCount', raw === '' ? 0 : Math.max(0, Number(raw) || 0));
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Institution Registration Toggle + Institution Name + Institution vs Non-Institution Split */}
                  <div className="rounded-2xl glass-subpanel p-4 space-y-4 border border-border transition-all">
                    <FormField
                      control={form.control}
                      name="isSchoolRegistration"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-3 space-y-0">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-9 w-9 rounded-xl flex items-center justify-center transition-colors",
                              field.value
                                ? "bg-primary text-white shadow-sm"
                                : "bg-muted text-muted-foreground"
                            )}>
                              <Building2 className="h-4 w-4" />
                            </div>
                            <div>
                              <FormLabel className="text-xs font-bold text-foreground cursor-pointer">
                                {t.dailyReport.includesInstitutionLabel}
                              </FormLabel>
                              <p className="text-[10px] text-muted-foreground">
                                {t.dailyReport.includesInstitutionDesc}
                              </p>
                            </div>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (checked) {
                                  const nextStudents = studentCount > 0 && studentCount <= dailyTotal ? studentCount : dailyTotal;
                                  form.setValue('studentCount', nextStudents, { shouldValidate: true });
                                  form.setValue('nonStudentCount', Math.max(0, dailyTotal - nextStudents), { shouldValidate: true });
                                } else {
                                  form.setValue('schoolName', '');
                                  form.setValue('studentCount', 0);
                                  form.setValue('nonStudentCount', dailyTotal);
                                  form.clearErrors(['schoolName', 'studentCount', 'nonStudentCount']);
                                }
                              }}
                              disabled={isSubmitting}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {isSchoolRegistration && (
                      <div className="pt-3 border-t border-border space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <FormField
                          control={form.control}
                          name="schoolName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[10px] font-bold uppercase text-primary tracking-wider flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5" /> {t.dailyReport.institutionNameLabel}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={t.dailyReport.institutionNamePlaceholder}
                                  {...field}
                                  disabled={isSubmitting}
                                  className="h-10 bg-background border-primary/30"
                                />
                              </FormControl>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />

                        {filteredSchoolSuggestions.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-primary" /> {t.dailyReport.institutionSuggestionsLabel}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {filteredSchoolSuggestions.map((school) => {
                                const active = currentSchoolName.trim().toLowerCase() === school.toLowerCase();
                                return (
                                  <button
                                    key={school}
                                    type="button"
                                    onClick={() => form.setValue('schoolName', school, { shouldValidate: true })}
                                    className={cn(
                                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer",
                                      active
                                        ? "bg-primary text-white"
                                        : "bg-muted hover:bg-primary/15 text-foreground"
                                    )}
                                  >
                                    {active && <Check className="h-2.5 w-2.5" />}
                                    <span>{school}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Institution vs Non-Institution Breakdown Inputs */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              {t.dailyReport.breakdownHeader.replace('{total}', formatNumber(dailyTotal))}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-primary tabular-nums">
                              {studentCount} + {nonStudentCount} = {dailyTotal}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={form.control}
                              name="studentCount"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-[10px] font-bold uppercase text-primary tracking-wider flex items-center gap-1">
                                    <Building2 className="h-3 w-3" /> {t.dailyReport.institutionCountLabel}
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={dailyTotal}
                                      {...field}
                                      value={emptyNumericFields.studentCount ? '' : field.value}
                                      disabled={isSubmitting}
                                      className="h-10 bg-background border-primary/30 font-bold tabular-nums"
                                      onFocus={(e) => e.currentTarget.select()}
                                      onBlur={() => {
                                        field.onBlur();
                                        setEmptyNumericFields((prev) => ({ ...prev, studentCount: false }));
                                      }}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEmptyNumericFields((prev) => ({ ...prev, studentCount: raw === '' }));
                                        handleStudentCountChange(
                                          raw === '' ? 0 : Math.max(0, Number(raw) || 0)
                                        );
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage className="text-[10px]" />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="nonStudentCount"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1">
                                    <User className="h-3 w-3" /> {t.dailyReport.nonInstitutionCountLabel}
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={dailyTotal}
                                      {...field}
                                      value={emptyNumericFields.nonStudentCount ? '' : field.value}
                                      disabled={isSubmitting}
                                      className="h-10 bg-background border-emerald-500/30 font-bold tabular-nums"
                                      onFocus={(e) => e.currentTarget.select()}
                                      onBlur={() => {
                                        field.onBlur();
                                        setEmptyNumericFields((prev) => ({ ...prev, nonStudentCount: false }));
                                      }}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEmptyNumericFields((prev) => ({ ...prev, nonStudentCount: raw === '' }));
                                        handleNonStudentCountChange(
                                          raw === '' ? 0 : Math.max(0, Number(raw) || 0)
                                        );
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage className="text-[10px]" />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Calculated Aggregate with Live Institution vs Non-Institution Split */}
                  <div className="p-4 bg-muted/30 rounded-2xl border border-dashed border-border text-center space-y-3 transition-all">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                        {t.dailyReport.calculatedAggregateLabel}
                      </p>
                      <p className="text-4xl font-black text-foreground tabular-nums">{formatNumber(dailyTotal)}</p>
                    </div>

                    <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/25 text-[11px] font-bold tabular-nums">
                        <Building2 className="h-3.5 w-3.5" />
                        {t.dailyReport.institutionBadge.replace('{count}', formatNumber(activeStudentsDisplay))}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-[11px] font-bold tabular-nums">
                        <User className="h-3.5 w-3.5" />
                        {t.dailyReport.nonInstitutionBadge.replace('{count}', formatNumber(activeNonStudentsDisplay))}
                      </span>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                          {t.dailyReport.remarksLabel}
                        </FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder={t.dailyReport.remarksPlaceholder} 
                            className="resize-none min-h-[80px] bg-background border-border" 
                            disabled={isSubmitting}
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col gap-2">
                    <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 font-bold shadow-md" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      {editingId ? t.dailyReport.submitUpdateBtn : t.dailyReport.submitNewBtn}
                    </Button>
                    {editingId && (
                      <Button type="button" variant="outline" onClick={cancelEdit} className="w-full h-11 font-bold border-border" disabled={isSubmitting}>
                        {t.dailyReport.cancelUpdateBtn}
                      </Button>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </section>

        <section className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                {t.dailyReport.ledgerTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.dailyReport.ledgerSubtitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleExportExcel} disabled={isExporting} variant="outline" className="h-9 px-3.5 rounded-full border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold text-xs shadow-2xs">
                {isExporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />}
                {t.dailyReport.exportXlsBtn}
              </Button>
              <Button onClick={handleExportPDF} disabled={isExporting} variant="outline" className="h-9 px-3.5 rounded-full border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold text-xs shadow-2xs">
                {isExporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5 text-rose-600" />}
                {t.dailyReport.exportPdfBtn}
              </Button>
            </div>
          </div>

          <div className="glass-card-surface rounded-2xl overflow-hidden">
            {/* Integrated Top Control Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder={t.dailyReport.searchPlaceholder} 
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="h-9 pl-9 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center p-1 rounded-xl glass-subpanel gap-1">
                  <button
                    type="button"
                    onClick={() => { setFilterType('all'); setCurrentPage(1); }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer",
                      filterType === 'all' ? "bg-primary text-white" : "text-slate-600 dark:text-slate-300"
                    )}
                  >
                    {t.dailyReport.filterAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFilterType('school'); setCurrentPage(1); }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer",
                      filterType === 'school' ? "bg-primary text-white" : "text-slate-600 dark:text-slate-300"
                    )}
                  >
                    {t.dailyReport.filterInstitution}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFilterType('regular'); setCurrentPage(1); }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer",
                      filterType === 'regular' ? "bg-primary text-white" : "text-slate-600 dark:text-slate-300"
                    )}
                  >
                    {t.dailyReport.filterIndividual}
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => { setSearchTerm(''); setFilterType('all'); setCurrentPage(1); }}
                  className="h-9 w-9 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 shadow-2xs"
                  title={t.dailyReport.resetFilterTooltip}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-11 px-4 text-center">
                      <Checkbox
                        checked={paginatedHistory.length > 0 && paginatedHistory.every((entry) => selectedIds.has(entry.id))}
                        onCheckedChange={() => {
                          const allSelected = paginatedHistory.length > 0 && paginatedHistory.every((entry) => selectedIds.has(entry.id));
                          const next = new Set(selectedIds);
                          if (allSelected) {
                            paginatedHistory.forEach((entry) => next.delete(entry.id));
                          } else {
                            paginatedHistory.forEach((entry) => next.add(entry.id));
                          }
                          setSelectedIds(next);
                        }}
                      />
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t.dailyReport.colDateInst}</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>{t.dailyReport.colNetworkSplit}</TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t.dailyReport.colInstVsInd}</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center justify-between gap-2">
                        <span>{t.dailyReport.colAggregate}</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableHead>
                    <TableHead>{t.dailyReport.colRemarks}</TableHead>
                    <TableHead className="border-r-0 text-right">{t.dailyReport.colAction}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-48 text-center">
                        <Loader2 className="h-7 w-7 animate-spin text-blue-600 mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : paginatedHistory.length > 0 ? paginatedHistory.map((entry) => {
                    const split = getReportSplit(entry);
                    return (
                      <TableRow key={entry.id} className={cn(
                        "h-16 group",
                        (editingId === entry.id || selectedIds.has(entry.id)) && "bg-blue-50/40 dark:bg-blue-950/20"
                      )}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.has(entry.id)}
                            onCheckedChange={() => {
                              const next = new Set(selectedIds);
                              if (next.has(entry.id)) next.delete(entry.id);
                              else next.add(entry.id);
                              setSelectedIds(next);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                              {formatDate(entry.date, { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            {split.instName ? (
                              <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold">
                                <Building2 className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[160px]">{split.instName}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400">
                                {t.dailyReport.individualWalkIn}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/50 dark:text-emerald-400 text-[11px] font-semibold tabular-nums">
                              {formatNumber(entry.ethioCount)} E
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#FFFBEB] text-[#F59E0B] dark:bg-amber-950/50 dark:text-amber-400 text-[11px] font-semibold tabular-nums">
                              {formatNumber(entry.safaricomCount)} S
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {split.students > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 text-[11px] font-bold tabular-nums">
                                <Building2 className="h-3 w-3 shrink-0" />
                                {t.dailyReport.institutionBadge.replace('{count}', formatNumber(split.students))}
                              </span>
                            )}
                            {split.nonStudents > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-semibold tabular-nums">
                                <User className="h-3 w-3 shrink-0" />
                                {t.dailyReport.nonInstitutionBadge.replace('{count}', formatNumber(split.nonStudents))}
                              </span>
                            )}
                            {split.students === 0 && split.nonStudents === 0 && (
                              <span className="text-xs text-slate-400">0</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#EEF2FF] text-[#4F46E5] dark:bg-indigo-950/50 dark:text-indigo-400 text-[11px] font-bold tabular-nums">
                            {t.dailyReport.totalBadge.replace('{count}', formatNumber(entry.total))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[12px] text-slate-500 dark:text-slate-400 truncate block max-w-[160px]">
                            {entry.remarks ? entry.remarks : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              onClick={() => handleEdit(entry)}
                              title={t.dailyReport.viewReportTooltip}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              onClick={() => handleEdit(entry)}
                              title={t.dailyReport.editReportTooltip}
                            >
                              <SquarePen className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              onClick={() => {
                                setReportToDelete({id: entry.id, date: entry.date});
                                setIsDeleteDialogOpen(true);
                              }}
                              title={t.dailyReport.deleteReportTooltip}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CalendarPlus className="h-8 w-8 text-slate-300" />
                          <p className="text-xs font-semibold text-slate-400">
                            {t.dailyReport.emptyStream}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Bottom Pagination Footer */}
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={history.length}
              shownItems={paginatedHistory.length}
              itemLabel={t.dailyReport.paginationItemsLabel}
              onPageChange={setCurrentPage}
            />
          </div>
        </section>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
             <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              {isDeleting ? <Loader2 className="h-10 w-10 text-destructive animate-spin" /> : <Trash2 className="h-10 w-10 text-destructive" />}
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                {isDeleting ? t.dailyReport.deleteDeletingTitle : t.dailyReport.deleteTitle}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                {isDeleting 
                  ? t.dailyReport.deleteDeletingDesc
                  : t.dailyReport.deleteDesc.replace(
                      '{date}',
                      reportToDelete
                        ? formatDate(reportToDelete.date, {
                            month: 'long',
                            day: '2-digit',
                            year: 'numeric',
                          })
                        : ''
                    )
                }
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="bg-muted/30 p-6 flex-col sm:flex-col gap-3">
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); confirmDelete(); }} 
              disabled={isDeleting}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 active:scale-[0.98] transition-all"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t.dailyReport.confirmDeleteBtn}
            </AlertDialogAction>
            {!isDeleting && (
              <AlertDialogCancel 
                onClick={() => setReportToDelete(null)} 
                className="w-full h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent hover:bg-card"
              >
                {t.dailyReport.abortDeleteBtn}
              </AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
