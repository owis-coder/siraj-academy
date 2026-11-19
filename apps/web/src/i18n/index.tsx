import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import ar from './ar.json';
import en from './en.json';

/* ============================================================
   نظام الترجمة (عربي/إنجليزي)
   - ملفات ترجمة مستقلة ar.json / en.json بمفاتيح موحّدة.
   - تبديل فوري دون إعادة تحميل، وحفظ الاختيار في المتصفح.
   - يضبط <html lang/dir> تلقائيًا لتطبيق RTL/LTR على كل الموقع.
   - اللغة الافتراضية للمستخدم الجديد: العربية.
   ============================================================ */

export type Lang = 'ar' | 'en';

export const LANG_STORAGE_KEY = 'siraj_lang';

type Dict = Record<string, string>;

const DICTS: Record<Lang, Dict> = {
  ar: ar as Dict,
  en: en as Dict,
};

export function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'ar';
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{?(\w+)\}?\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

interface I18nValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** ترجمة مفتاح مع تمرير قيم للمتغيّرات {{name}} */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** تنسيق التاريخ/الوقت حسب اللغة الحالية */
  formatDate: (value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number | null | undefined) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title =
      lang === 'ar' ? 'أكاديمية سراج التعليمية' : 'Siraj Educational Academy';
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* التخزين قد يكون معطلًا */
    }
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const primary = DICTS[lang][key];
      const fallback = DICTS.ar[key] ?? DICTS.en[key];
      const value = primary ?? fallback;
      if (value === undefined) {
        if (import.meta.env.DEV) console.warn(`[i18n] مفتاح ترجمة مفقود: ${key}`);
        return key;
      }
      return interpolate(value, vars);
    },
    [lang],
  );

  const formatDate = useCallback(
    (value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) => {
      if (!value) return '—';
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
        dateStyle: 'medium',
        ...opts,
      }).format(date);
    },
    [lang],
  );

  const formatNumber = useCallback(
    (value: number | null | undefined) => {
      if (value === null || value === undefined || Number.isNaN(value)) return '—';
      return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-GB').format(value);
    },
    [lang],
  );

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const toggleLang = useCallback(() => setLangState((prev) => (prev === 'ar' ? 'en' : 'ar')), []);

  const value = useMemo<I18nValue>(
    () => ({ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, toggleLang, t, formatDate, formatNumber }),
    [lang, setLang, toggleLang, t, formatDate, formatNumber],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** اختصار شائع: const t = useT() */
export function useT() {
  return useI18n().t;
}
