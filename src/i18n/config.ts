export type Locale = 'en' | 'am' | 'om' | 'so';

export interface LocaleMeta {
  code: Locale;
  shortLabel: string;
  nativeName: string;
  englishName: string;
  bcp47: string;
}

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_STORAGE_KEY = 'fayda_locale';

export const LOCALES: LocaleMeta[] = [
  {
    code: 'en',
    shortLabel: 'EN',
    nativeName: 'English',
    englishName: 'English',
    bcp47: 'en-ET',
  },
  {
    code: 'am',
    shortLabel: 'አማ',
    nativeName: 'አማርኛ',
    englishName: 'Amharic',
    bcp47: 'am-ET',
  },
  {
    code: 'om',
    shortLabel: 'OM',
    nativeName: 'Afaan Oromoo',
    englishName: 'Afaan Oromo',
    bcp47: 'om-ET',
  },
  {
    code: 'so',
    shortLabel: 'SO',
    nativeName: 'Af-Soomaali',
    englishName: 'Somali',
    bcp47: 'so-ET',
  },
];

export function isValidLocale(val: unknown): val is Locale {
  return val === 'en' || val === 'am' || val === 'om' || val === 'so';
}
