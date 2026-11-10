"use client"

import { useState } from 'react';
import { Registration, RegistrationStatus, UserProfile } from '@/lib/types';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { 
  MoreHorizontal, 
  ExternalLink, 
  ChevronLeft, 
  ChevronRight, 
  Trash2,
  CheckCircle2,
  RefreshCcw,
  X,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  SquarePen,
  Building2
} from 'lucide-react';
import { StatusBadge } from './status-badge';
import { AiSuggestionModal } from './ai-suggestion-modal';
import { RegistrationFormModal } from '@/components/registrations/registration-form-modal';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useRouter } from 'next/navigation';
import { doc, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit';
import { cn } from '@/lib/utils';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { TablePagination } from "@/components/ui/table-pagination";
import { useTranslation } from '@/i18n/language-provider';

interface RegistrationTableProps {
  registrations: Registration[];
  isDashboardView?: boolean;
}

export function RegistrationTable({ registrations, isDashboardView = false }: RegistrationTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const itemsPerPage = 10;
  
  const { toast } = useToast();
  const db = useFirestore();
  const { user } = useUser();
  const router = useRouter();
  const { t, formatDate, formatNumber } = useTranslation();

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const totalPages = Math.ceil(registrations.length / itemsPerPage);
  const currentItems = registrations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const allOnPageSelected = currentItems.length > 0 && currentItems.every(r => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) {
      currentItems.forEach(r => next.delete(r.id));
    } else {
      currentItems.forEach(r => next.add(r.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleCopyRid = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 2000);
    toast({
      title: t.statusCheck.toastRidCopiedTitle,
      description: t.statusCheck.toastRidCopiedDesc.replace('{rid}', id),
    });
  };

  const handleBulkStatusUpdate = async (newStatus: RegistrationStatus) => {
    if (!db || selectedIds.size === 0 || !user || !profile) return;
    
    setIsBulkProcessing(true);
    const batch = writeBatch(db);
    const count = selectedIds.size;
    const updatedAt = new Date().toISOString();

    selectedIds.forEach(id => {
      batch.update(doc(db, 'registrations', id), {
        status: newStatus,
        updatedAt
      });
    });

    try {
      await batch.commit();
      
      logAuditAction(
        db,
        user,
        profile.fullName,
        'STATUS_UPDATE',
        'bulk_operation',
        `Bulk Triage: Updated ${count} records to ${newStatus}.`
      );

      const localizedStatus = t.common.status[newStatus] || newStatus;
      toast({
        title: t.registrationTable.toastBulkCompleteTitle,
        description: t.registrationTable.toastBulkCompleteDesc
          .replace('{count}', formatNumber(count))
          .replace('{status}', localizedStatus),
      });
      setSelectedIds(new Set());
    } catch (error) {
      toast({
        variant: "destructive",
        title: t.registrationTable.toastBulkFailedTitle,
        description: t.registrationTable.toastBulkFailedDesc,
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!db || selectedIds.size === 0 || !user || !profile) return;
    
    setIsBulkProcessing(true);
    const batch = writeBatch(db);
    const count = selectedIds.size;

    selectedIds.forEach(id => {
      batch.delete(doc(db, 'registrations', id));
    });

    try {
      await batch.commit();
      
      logAuditAction(
        db,
        user,
        profile.fullName,
        'RECORD_DELETED',
        'bulk_operation',
        `Bulk Purge: Permanently removed ${count} records from registry.`
      );

      toast({
        title: t.registrationTable.toastPurgedTitle,
        description: t.registrationTable.toastPurgedDesc.replace('{count}', formatNumber(count)),
        variant: "destructive"
      });
      setSelectedIds(new Set());
      setIsConfirmDeleteDialogOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: t.registrationTable.toastPurgeFailedTitle,
        description: t.registrationTable.toastPurgeFailedDesc,
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  return (
    <div className={cn(
      "relative glass-card-surface rounded-[22px] overflow-hidden",
      isDashboardView ? "" : ""
    )}>
      {selectedIds.size > 0 && (
        <div className="absolute top-0 left-0 right-0 z-20 min-h-[3rem] h-auto bg-primary text-primary-foreground flex flex-col sm:flex-row items-center px-4 sm:px-6 py-2 sm:py-0 gap-3 sm:gap-4 animate-in slide-in-from-top duration-300 shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-widest flex-1">
            {t.registrationTable.selectedCount.replace('{count}', formatNumber(selectedIds.size))}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-3 text-[9px] font-black uppercase tracking-tighter hover:bg-white/10"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="mr-1.5 h-3.5 w-3.5" /> {t.registrationTable.clearBtn}
            </Button>
            <div className="hidden sm:block w-px h-4 bg-white/20 mx-1" />
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-3 text-[9px] font-black uppercase tracking-tighter hover:bg-white/10"
              onClick={() => handleBulkStatusUpdate('Processed')}
              disabled={isBulkProcessing}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> {t.registrationTable.processedBtn}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-3 text-[9px] font-black uppercase tracking-tighter hover:bg-white/10"
              onClick={() => handleBulkStatusUpdate('Processing')}
              disabled={isBulkProcessing}
            >
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> {t.registrationTable.activeBtn}
            </Button>
            <div className="hidden sm:block w-px h-4 bg-white/20 mx-1" />
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-3 text-[9px] font-black uppercase tracking-tighter hover:bg-red-500 text-white"
              onClick={() => setIsConfirmDeleteDialogOpen(true)}
              disabled={isBulkProcessing}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t.registrationTable.purgeBtn}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className={isDashboardView ? "bg-muted/30" : "bg-muted/50"}>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-12 pl-6">
                <Checkbox 
                  checked={allOnPageSelected} 
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider h-10 text-muted-foreground">{t.registrationTable.colApplicant}</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider h-10 text-muted-foreground">{t.registrationTable.colSubmission}</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider h-10 text-muted-foreground">{t.registrationTable.colStatus}</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider h-10 text-muted-foreground hidden sm:table-cell">{t.registrationTable.colRegion}</TableHead>
              <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider h-10 text-muted-foreground pr-6">{t.registrationTable.colAction}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentItems.map((reg) => (
              <TableRow 
                key={reg.id} 
                className={cn(
                  "hover:bg-muted/30 transition-colors border-border h-16 group",
                  selectedIds.has(reg.id) && "bg-blue-50/40 dark:bg-blue-950/20"
                )}
              >
                <TableCell className="pl-6">
                  <Checkbox 
                    checked={selectedIds.has(reg.id)} 
                    onCheckedChange={() => toggleSelectRow(reg.id)}
                  />
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{reg.applicantName}</span>
                      {(reg.institutionName || reg.schoolName) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[150px]">{reg.institutionName || reg.schoolName}</span>
                        </span>
                      )}
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => handleCopyRid(reg.id)}
                            className="inline-flex items-center gap-1.5 w-fit text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer group/rid"
                          >
                            <span>{reg.id.substring(0, 15)}...</span>
                            {copiedId === reg.id ? (
                              <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                            ) : (
                              <Copy className="h-3 w-3 text-slate-400 group-hover/rid:text-blue-600 dark:group-hover/rid:text-blue-400 shrink-0 transition-colors" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-popover border-border p-1.5 text-[9px] font-black uppercase tracking-widest">
                          {t.registrationTable.clickToCopyRid}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
                <TableCell className="py-4 text-muted-foreground text-xs font-bold uppercase tabular-nums">
                  {formatDate(reg.submissionDate)}
                </TableCell>
                <TableCell className="py-4">
                  <StatusBadge status={reg.status} className="scale-75 origin-left" />
                </TableCell>
                <TableCell className="py-4 text-muted-foreground text-[10px] font-black uppercase tracking-widest hidden sm:table-cell">
                  {reg.location.split(',')[0]}
                </TableCell>
                <TableCell className="text-right py-4 pr-6">
                  <div className="inline-flex items-center justify-end gap-1">
                    {!isDashboardView && <AiSuggestionModal registration={reg} />}
                    <RegistrationFormModal
                      registration={reg}
                      mode="edit"
                      trigger={
                        <button
                          type="button"
                          title={t.registrationTable.editRecordTitle}
                          className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <SquarePen className="h-4 w-4" />
                        </button>
                      }
                    />
                    <button
                      type="button"
                      title={t.registrationTable.purgeEntryTitle}
                      onClick={() => {
                        if (!db) return;
                        deleteDocumentNonBlocking(doc(db, 'registrations', reg.id));
                        toast({
                          title: t.registrationTable.toastSinglePurgedTitle,
                          description: t.registrationTable.toastSinglePurgedDesc.replace('{name}', reg.applicantName),
                          variant: "destructive"
                        });
                      }}
                      className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        showingCount={currentItems.length}
        totalCount={registrations.length}
        itemLabel={t.common.records}
      />

      <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-md p-0 overflow-hidden mx-4">
          <div className="p-10 text-center space-y-6">
            <div className="mx-auto bg-destructive/10 p-5 rounded-2xl w-fit">
              {isBulkProcessing ? <Loader2 className="h-10 w-10 text-destructive animate-spin" /> : <ShieldAlert className="h-10 w-10 text-destructive" />}
            </div>
            <div className="space-y-2">
              <AlertDialogTitle className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                {isBulkProcessing ? t.registrationTable.purgingTitle : t.registrationTable.bulkPurgeTitle}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed font-medium">
                {isBulkProcessing 
                  ? t.registrationTable.purgingDesc
                  : t.registrationTable.bulkPurgeDesc.replace('{count}', formatNumber(selectedIds.size))
                }
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter className="bg-muted/30 p-6 flex-col sm:flex-row gap-3">
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }} 
              disabled={isBulkProcessing}
              className="w-full h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-destructive/10 active:scale-[0.98] transition-all"
            >
              {isBulkProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t.registrationTable.confirmDestructionBtn}
            </AlertDialogAction>
            {!isBulkProcessing && (
              <AlertDialogCancel className="w-full h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent hover:bg-card">
                {t.registrationTable.abortProtocolBtn}
              </AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
