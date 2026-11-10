'use client';

import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/i18n/language-provider';
import { LOCALES } from '@/i18n/config';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps) {
  const { locale, localeMeta, setLocale, t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t('common.selectLanguage')}
          aria-label={t('common.selectLanguage')}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 rounded-full bg-[#F4F5F8] dark:bg-slate-800 text-[#0B1238] dark:text-slate-200 hover:bg-[#E7EAF2] dark:hover:bg-slate-700 transition-all duration-200 cursor-pointer active:scale-95 focus:outline-none border border-slate-200/70 dark:border-slate-700/70 shrink-0',
            className
          )}
        >
          <Globe className="h-[14px] w-[14px] sm:h-[15px] sm:w-[15px] text-[#EC4899] shrink-0" />
          <span className="text-[11px] sm:text-xs font-extrabold tracking-tight leading-none">
            {compact ? localeMeta.shortLabel : localeMeta.shortLabel}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-52 p-1.5 rounded-2xl glass-dropdown z-[100]"
      >
        <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 px-3 py-1.5">
          {t('common.selectLanguage')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-200/60 dark:bg-white/10" />
        <div className="space-y-0.5 pt-1">
          {LOCALES.map((item) => {
            const isSelected = item.code === locale;
            return (
              <DropdownMenuItem
                key={item.code}
                onClick={() => setLocale(item.code)}
                className={cn(
                  'rounded-xl text-xs font-semibold cursor-pointer py-2.5 px-3 flex items-center justify-between transition-all duration-150 focus:bg-white/80 dark:focus:bg-white/10',
                  isSelected
                    ? 'glass-nav-item-active text-[#0B1238] dark:text-white font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#0B1238] dark:hover:text-white'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-6 min-w-[28px] px-1.5 rounded-md text-[10px] font-extrabold tracking-tight',
                      isSelected
                        ? 'bg-[#EC4899] text-white'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    )}
                  >
                    {item.shortLabel}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12.5px] font-bold leading-tight truncate">
                      {item.nativeName}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                      {item.englishName}
                    </span>
                  </div>
                </div>
                {isSelected && <Check className="h-4 w-4 text-[#EC4899] shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
