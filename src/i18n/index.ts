import { useEffect, useState } from 'react';
import en from './locales/en.json';
import ar from './locales/ar.json';

type Dict = Record<string, string>;
const dictionaries: Record<string, Dict> = { en, ar };

export type Locale = 'en' | 'ar';
const STORAGE_KEY = 'gc.locale';

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored === 'en' || stored === 'ar') return stored;
  return 'en';
}

let currentLocale: Locale = getInitialLocale();
const listeners = new Set<(l: Locale) => void>();

export function setLocale(l: Locale) {
  currentLocale = l;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  }
  listeners.forEach(fn => fn(l));
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Translate a key. Falls back to the English string, then to the key itself.
 * Supports {placeholders} via the optional vars argument.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? dictionaries.en;
  let str = dict[key] ?? dictionaries.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

export function useT() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { t, locale: currentLocale, setLocale };
}

// Apply current locale on import so dir/lang are correct from first paint.
if (typeof window !== 'undefined') {
  document.documentElement.lang = currentLocale;
  document.documentElement.dir = currentLocale === 'ar' ? 'rtl' : 'ltr';
}