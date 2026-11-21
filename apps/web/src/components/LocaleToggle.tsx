import { useI18n } from '../i18n';

/* ============================================================
   زر تبديل اللغة الموحد (AR / EN)
   خيار واحد بدون إيموجيز أو أعلام، بنمط أنيق ومتناسق.
   ============================================================ */

export function LocaleToggle({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLang, t } = useI18n();

  const toggle = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('locale.switch')}
      title={lang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
      className={`inline-flex items-center justify-center gap-1 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-xs font-bold tracking-wider shadow-sm transition-all duration-200 hover:border-line-gold/70 hover:bg-elevated/70 focus:outline-none focus:ring-2 focus:ring-gold-300/40 ${className}`}
    >
      <span className={lang === 'ar' ? 'font-bold text-gold-300' : 'text-ink-muted opacity-60'}>AR</span>
      <span className="text-ink-muted/40 select-none font-normal">/</span>
      <span className={lang === 'en' ? 'font-bold text-gold-300' : 'text-ink-muted opacity-60'}>EN</span>
    </button>
  );
}

export default LocaleToggle;
