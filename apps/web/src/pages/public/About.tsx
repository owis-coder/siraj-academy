import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';
import { FAQ } from './Faq';
import { useI18n } from '../../i18n';
import { useTheme } from '../../lib/theme';

export default function About() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const values = [1, 2, 3].map((n) => ({ key: n, t: t(`about.v${n}.t`), d: t(`about.v${n}.d`) }));

  return (
    <div className="container-x max-w-4xl py-12">
      <div className="mb-10 text-center">
        <img
          src={theme === 'dark' ? '/brand/siraj-logo-full-dark.png' : '/brand/siraj-logo-full-light.png'}
          alt={t('nav.logoAlt')}
          className="mx-auto mb-6 h-32 sm:h-40 w-auto object-contain"
        />
        <h1 className="text-4xl font-bold">
          {t('about.titlePrefix')} <span className="gold-text">{t('about.titleHighlight')}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-8 text-ink-secondary">{t('about.intro')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {values.map((c) => (
          <div key={c.key} className="rounded-lg border border-line bg-surface p-6">
            <h2 className="font-bold text-gold-200">{c.t}</h2>
            <p className="mt-2 text-sm leading-7 text-ink-secondary">{c.d}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 space-y-6 text-sm leading-8 text-ink-secondary">
        <p>
          <b className="text-ink-primary">{t('about.howTitle')}</b> {t('about.howBody')}
        </p>
        <p>
          <b className="text-ink-primary">{t('about.integrityTitle')}</b> {t('about.integrityBody')}
        </p>
      </div>

      <div className="mt-12">
        <h2 className="mb-4 text-xl font-bold">{t('about.faqTitle')}</h2>
        <div className="space-y-3">
          {FAQ.slice(0, 3).map((f) => (
            <div key={f.qKey} className="rounded-lg border border-line bg-surface p-5">
              <p className="font-semibold">{t(f.qKey)}</p>
              <p className="mt-1.5 text-sm text-ink-secondary">{t(f.aKey)}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link to="/faq"><Button variant="outline">{t('about.allFaq')}</Button></Link>
        </div>
      </div>
    </div>
  );
}

export function AboutCta() {
  const { t } = useI18n();
  return (
    <div className="container-x pb-10 text-center">
      <Link to="/register"><Button>{t('about.createAccount')}</Button></Link>
    </div>
  );
}
