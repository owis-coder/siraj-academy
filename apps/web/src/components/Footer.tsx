import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { whatsappLink } from '../lib/format';
import { useTheme } from '../lib/theme';
import { useI18n } from '../i18n';
import { IconTelegram, IconWhatsapp } from './icons';

export function Footer() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [info, setInfo] = useState<{ telegramLink?: string | null; whatsappNumbers?: string | string[] | null; name?: string | null } | null>(null);

  useEffect(() => {
    api.platform.public().then(({ data }) => setInfo(data)).catch(() => setInfo(null));
  }, []);

  const wa = whatsappLink(info?.whatsappNumbers);
  const tg = info?.telegramLink || 'https://t.me/Siraj1Academy';

  return (
    <footer className="mt-20 border-t border-line bg-surface/60">
      <div className="container-x grid gap-10 py-12 md:grid-cols-4">
        <div className="space-y-4 md:col-span-2">
          <img
            src={theme === 'dark' ? '/brand/logo-lockup-dark.png' : '/brand/logo-lockup-light.png'}
            alt={t('nav.lockupAlt')}
            className="h-12 w-auto"
          />
          <p className="max-w-md text-sm leading-7 text-ink-secondary">{t('footer.about')}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {tg && (
              <a href={tg} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[10px] border border-line-gold bg-elevated/60 px-3.5 py-2 text-sm text-ink-secondary transition-colors hover:text-teal">
                <IconTelegram className="size-4 shrink-0" />
                <span>{t('footer.telegram')}</span>
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[10px] border border-line-gold bg-elevated/60 px-3.5 py-2 text-sm text-ink-secondary transition-colors hover:text-ok">
                <IconWhatsapp className="size-4 shrink-0" />
                <span>{t('footer.whatsapp')}</span>
              </a>
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-4 font-semibold text-gold-200">{t('footer.explore')}</h4>
          <ul className="space-y-2.5 text-sm text-ink-secondary">
            <li><Link className="transition-colors hover:text-gold-200" to="/universities">{t('nav.universities')}</Link></li>
            <li><Link className="transition-colors hover:text-gold-200" to="/courses">{t('nav.courses')}</Link></li>
            <li><Link className="transition-colors hover:text-gold-200" to="/teachers">{t('nav.teachers')}</Link></li>
            <li><Link className="transition-colors hover:text-gold-200" to="/requests">{t('nav.requests')}</Link></li>
            <li><Link className="transition-colors hover:text-gold-200" to="/services">{t('nav.services')}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 font-semibold text-gold-200">{t('footer.platform')}</h4>
          <ul className="space-y-2.5 text-sm text-ink-secondary">
            <li><Link className="transition-colors hover:text-gold-200" to="/about">{t('footer.aboutLink')}</Link></li>
            <li><Link className="transition-colors hover:text-gold-200" to="/faq">{t('footer.faqLink')}</Link></li>
            <li><Link className="transition-colors hover:text-gold-200" to="/requests/new">{t('footer.requestPrivate')}</Link></li>
            <li><Link className="transition-colors hover:text-gold-200" to="/register?tab=teacher">{t('footer.joinTeacher')}</Link></li>
          </ul>
          <p className="mt-5 text-xs leading-6 text-ink-muted">{t('footer.legal')}</p>
        </div>
      </div>

      <div className="border-t border-line/70">
        <div className="container-x flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-ink-muted">
          <span>© {new Date().getFullYear()} {t('footer.rights')}</span>
          <Link to="/privacy" className="font-medium text-ink-secondary transition-colors hover:text-gold-200">
            سياسة الخصوصية
          </Link>
          <span dir="ltr">WO549604202 · 0579769007</span>
        </div>
      </div>
    </footer>
  );
}
