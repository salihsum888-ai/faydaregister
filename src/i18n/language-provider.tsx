'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  Locale,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
  isValidLocale,
  LocaleMeta,
} from './config';
import { en, TranslationDictionary } from './locales/en';
import { am } from './locales/am';
import { om } from './locales/om';
import { so } from './locales/so';

const DICTIONARIES: Record<Locale, TranslationDictionary> = {
  en,
  am,
  om,
  so,
};

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationDictionary>;

export type TranslateCallable = ((
  key: TranslationKey | string,
  params?: Record<string, string | number>
) => string) &
  TranslationDictionary;

interface LanguageContextValue {
  locale: Locale;
  localeMeta: LocaleMeta;
  setLocale: (next: Locale) => void;
  t: TranslateCallable;
  dict: TranslationDictionary;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (amount: number, currency?: string) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (date: Date | string | number) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function resolvePath(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

const ROUTE_TITLE_KEYS: Record<string, keyof TranslationDictionary['pageTitles']> = {
  '/': 'home',
  '/login': 'login',
  '/dashboard': 'dashboard',
  '/admin': 'admin',
  '/status-check': 'statusCheck',
  '/full-registration': 'fullRegistration',
  '/full-performance': 'fullPerformance',
  '/schools-students': 'schoolsStudents',
  '/communication': 'communication',
  '/meetings': 'meetings',
  '/notifications': 'notifications',
  '/profile': 'profile',
  '/performance': 'performance',
  '/previous': 'previous',
  '/printing': 'printing',
  '/daily-registrations': 'dailyRegistrations',
  '/registrations': 'registrations',
  '/historical': 'historical',
  '/reports': 'reports',
  '/leaderboard': 'leaderboard',
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const pathname = usePathname();

  // Restore saved locale on initial mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved && isValidLocale(saved)) {
        setLocaleState(saved);
        document.documentElement.lang = saved;
        document.documentElement.dataset.locale = saved;
        return;
      }
      // Fallback: check cookie
      const cookieMatch = document.cookie.match(/(?:^|;\s*)fayda_locale=([^;]*)/);
      const cookieVal = cookieMatch?.[1];
      if (cookieVal && isValidLocale(cookieVal)) {
        setLocaleState(cookieVal);
        document.documentElement.lang = cookieVal;
        document.documentElement.dataset.locale = cookieVal;
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (!isValidLocale(next)) return;
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
      document.cookie = `${LOCALE_STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = next;
      document.documentElement.dataset.locale = next;
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Keep <html lang="..."> and <title> synced on route changes and locale switches
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;

    const dict = DICTIONARIES[locale] || DICTIONARIES.en;
    const titleKey = ROUTE_TITLE_KEYS[pathname] || 'home';
    const localizedTitle = dict.pageTitles[titleKey] || dict.pageTitles.home;
    if (localizedTitle) {
      document.title = localizedTitle;
    }
  }, [locale, pathname]);

  const localeMeta = useMemo(
    () => LOCALES.find((l) => l.code === locale) || LOCALES[0],
    [locale]
  );

  const dict = useMemo<TranslationDictionary>(
    () => DICTIONARIES[locale] || DICTIONARIES.en,
    [locale]
  );

  const t = useMemo<TranslateCallable>(() => {
    const fn = (key: TranslationKey | string, params?: Record<string, string | number>): string => {
      const raw = resolvePath(dict, key) ?? resolvePath(DICTIONARIES.en, key) ?? key;
      if (!params) return raw;
      return Object.entries(params).reduce((acc, [k, v]) => {
        return acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }, raw);
    };
    return Object.assign(fn, dict);
  }, [dict]);

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions): string => {
      try {
        return new Intl.NumberFormat(localeMeta.bcp47, options).format(value);
      } catch {
        return new Intl.NumberFormat('en-US', options).format(value);
      }
    },
    [localeMeta.bcp47]
  );

  const formatCurrency = useCallback(
    (amount: number, currency = 'ETB'): string => {
      try {
        return new Intl.NumberFormat(localeMeta.bcp47, {
          style: 'currency',
          currency,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        return `${currency} ${amount.toLocaleString()}`;
      }
    },
    [localeMeta.bcp47]
  );

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return String(date);
      const defaultOpts: Intl.DateTimeFormatOptions = options || {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      };
      try {
        return new Intl.DateTimeFormat(localeMeta.bcp47, defaultOpts).format(d);
      } catch {
        return new Intl.DateTimeFormat('en-US', defaultOpts).format(d);
      }
    },
    [localeMeta.bcp47]
  );

  const formatDateTime = useCallback(
    (date: Date | string | number): string => {
      return formatDate(date, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [formatDate]
  );

  const contextValue = useMemo<LanguageContextValue>(
    () => ({
      locale,
      localeMeta,
      setLocale,
      t,
      dict,
      formatNumber,
      formatCurrency,
      formatDate,
      formatDateTime,
    }),
    [locale, localeMeta, setLocale, t, dict, formatNumber, formatCurrency, formatDate, formatDateTime]
  );

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return ctx;
}
