import { useI18n } from '../../i18n';
import { Seo } from '../../lib/seo';

/** مفاتيح الأسئلة الشائعة — تُترجم عند العرض */
export const FAQ: { qKey: string; aKey: string }[] = Array.from({ length: 8 }, (_, i) => ({
  qKey: `faq.${i + 1}.q`,
  aKey: `faq.${i + 1}.a`,
}));

export default function Faq() {
  const { t } = useI18n();
  return (
    <div className="container-x max-w-3xl py-12">
      <Seo
        title={t('seo.faq.title')}
        description={t('seo.faq.desc')}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map((f) => ({
            '@type': 'Question',
            name: t(f.qKey),
            acceptedAnswer: { '@type': 'Answer', text: t(f.aKey) },
          })),
        }}
      />
      <h1 className="mb-8 text-center text-3xl font-bold">
        {t('faq.title')} <span className="gold-text">{t('faq.highlight')}</span>
      </h1>
      <div className="space-y-4">
        {FAQ.map((f) => (
          <div key={f.qKey} className="rounded-lg border border-line bg-surface p-6">
            <h2 className="font-semibold text-gold-200">{t(f.qKey)}</h2>
            <p className="mt-2 text-sm leading-7 text-ink-secondary">{t(f.aKey)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
