import { RegistrationStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: RegistrationStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = {
    Processed: {
      label: 'Processed',
      color: 'bg-[#e6f6ef] text-[#14804a] hover:bg-[#e6f6ef] dark:bg-emerald-500/15 dark:text-emerald-400',
    },
    'Pending Review': {
      label: 'Pending Review',
      color: 'bg-[#f3ebff] text-[#7839ee] hover:bg-[#f3ebff] dark:bg-purple-500/15 dark:text-purple-400',
    },
    Rejected: {
      label: 'Rejected',
      color: 'bg-[#feeceb] text-[#d92d20] hover:bg-[#feeceb] dark:bg-rose-500/15 dark:text-rose-400',
    },
    Processing: {
      label: 'Processing',
      color: 'bg-[#e8f5ff] text-[#0070cc] hover:bg-[#e8f5ff] dark:bg-sky-500/15 dark:text-sky-400',
    },
    Failed: {
      label: 'Uncategorized / Failed',
      color: 'bg-[#eeeeee] text-[#555555] hover:bg-[#eeeeee] dark:bg-slate-700/50 dark:text-slate-300',
    },
  }[status];

  if (!config) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center justify-center px-2.5 py-1 text-[12px] font-medium rounded-[6px] border-0 shadow-none whitespace-nowrap',
        config.color,
        className
      )}
    >
      {status === 'Failed' ? 'Failed' : config.label}
    </Badge>
  );
}
