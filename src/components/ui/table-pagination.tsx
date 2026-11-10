'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/language-provider';

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showingCount?: number;
  totalCount?: number;
  shownItems?: number;
  totalItems?: number;
  itemLabel?: string;
  className?: string;
  compact?: boolean;
}

export function TablePagination({
  currentPage,
  totalPages,
  onPageChange,
  showingCount,
  totalCount,
  shownItems,
  totalItems,
  itemLabel,
  className,
  compact = false,
}: TablePaginationProps) {
  const { t, formatNumber } = useTranslation();
  const safeTotalPages = Math.max(1, totalPages);
  const resolvedShowing = showingCount ?? shownItems;
  const resolvedTotal = totalCount ?? totalItems;
  const resolvedItemLabel = itemLabel || t('common.records');
  const [inputValue, setInputValue] = React.useState(String(currentPage));

  React.useEffect(() => {
    setInputValue(String(currentPage));
  }, [currentPage]);

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (safeTotalPages <= 4) {
      for (let i = 1; i <= safeTotalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, 'ellipsis');
      } else if (currentPage >= safeTotalPages - 2) {
        pages.push(
          1,
          'ellipsis',
          safeTotalPages - 2,
          safeTotalPages - 1,
          safeTotalPages
        );
      } else {
        pages.push(
          1,
          'ellipsis',
          currentPage - 1,
          currentPage,
          currentPage + 1,
          'ellipsis'
        );
      }
    }
    return pages;
  };

  const commitPageInput = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= safeTotalPages) {
      onPageChange(parsed);
    } else {
      setInputValue(String(currentPage));
    }
  };

  const handleGoToPage = (e: React.FormEvent) => {
    e.preventDefault();
    commitPageInput(inputValue);
  };

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row flex-wrap items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-white dark:bg-card border-t border-slate-100 dark:border-border gap-3 sm:gap-4',
        className
      )}
    >
      {/* Left: Showing X of Y label */}
      {typeof resolvedShowing === 'number' && typeof resolvedTotal === 'number' ? (
        <p className="text-xs text-slate-500 dark:text-muted-foreground order-2 sm:order-1 text-center sm:text-left font-medium">
          {t('common.showingOf', {
            showing: formatNumber(resolvedShowing),
            total: formatNumber(resolvedTotal),
            items: resolvedItemLabel,
          })}
        </p>
      ) : (
        <div className="hidden sm:block order-1" />
      )}

      {/* Center: Numbered Page Buttons + Ellipsis + Prev/Next */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 order-1 sm:order-2">
        {currentPage > 1 && (
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            className="h-7 w-7 rounded-[6px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-center transition-colors"
            aria-label={t('common.previousPage')}
            title={t('common.previousPage')}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}

        {getPageNumbers().map((page, idx) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${idx}`}
              className="h-7 w-7 rounded-[6px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-600 dark:text-slate-400 flex items-center justify-center text-xs"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={cn(
                'h-7 w-7 rounded-[6px] text-xs transition-colors flex items-center justify-center tabular-nums',
                currentPage === page
                  ? 'bg-[#F1F5F9] dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold border border-transparent'
                  : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 font-medium'
              )}
            >
              {formatNumber(page)}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(safeTotalPages, currentPage + 1))}
          disabled={currentPage >= safeTotalPages}
          className="h-7 w-7 rounded-[6px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors"
          aria-label={t('common.nextPage')}
          title={t('common.nextPage')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Right: "Go to page" input */}
      {!compact && (
        <form
          onSubmit={handleGoToPage}
          className="flex items-center gap-2.5 order-3"
        >
          <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground whitespace-nowrap">
            {t('common.goToPage')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              const parsed = parseInt(e.target.value, 10);
              if (!isNaN(parsed) && parsed >= 1 && parsed <= safeTotalPages) {
                onPageChange(parsed);
              }
            }}
            onBlur={() => commitPageInput(inputValue)}
            className="w-11 h-7 rounded-[6px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-center text-xs font-medium text-slate-500 dark:text-slate-300 focus:text-slate-900 dark:focus:text-white focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 tabular-nums"
          />
        </form>
      )}
    </div>
  );
}
