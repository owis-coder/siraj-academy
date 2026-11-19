import { useI18n, type Lang } from '../i18n';

/* ============================================================
   زر تبديل اللغة — ظاهر في الشريط العلوي وفي جميع لوحات التحكم.
   اللغات المدعومة:
   - 🇸🇦 العربية
   - 🇬🇧 English
   التبديل فوري (بدون إعادة تحميل) ويُحفظ في المتصفح.
   اللغة الافتراضية للمستخدم الجديد هي العربية.
   ============================================================ */

const OPTIONS: { lang: Lang; flag: string; labelKey: string }[] = [
  { lang: 'ar', flag: '🇸🇦', labelKey: 'locale.arabic' },
  { lang: 'en', flag: '🇬🇧', labelKey: 'locale.english' },
];

export function LocaleToggle({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLang, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t('locale.switch')}
      className={`inline-flex items-center gap-1 rounded-[10px] border border-line bg-surface p-1 shadow-sm ${className}`}
    >
      {OPTIONS.map((o) => {
        const active = lang === o.lang;
        return (
          <button
            key={o.lang}
            type="button"
            onClick={() => setLang(o.lang)}
            aria-pressed={active}
            aria-label={t(o.labelKey)}
            title={t(o.labelKey)}
            className={`inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-gold-300/40 ${
              active
                ? 'bg-gold-grad text-cham shadow-glow'
                : 'text-ink-muted hover:bg-elevated hover:text-ink-primary'
            }`}
          >
            <span aria-hidden className="text-sm leading-none">{o.flag}</span>
            <span className={compact ? 'hidden md:inline' : 'inline'}>{t(o.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
