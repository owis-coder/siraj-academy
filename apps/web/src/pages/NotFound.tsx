import { Link } from 'react-router-dom';
import { Button } from '../components/ui';
import { useI18n } from '../i18n';
import { Seo } from '../lib/seo';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-16 text-center">
      <Seo title={t('notFound.title')} description={t('notFound.hint')} noindex />
      <div>
        <p className="gold-text text-7xl font-bold">404</p>
        <h1 className="mt-4 text-xl font-bold">{t('notFound.title')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('notFound.hint')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/"><Button>{t('common.home')}</Button></Link>
          <Link to="/courses"><Button variant="outline">{t('notFound.courses')}</Button></Link>
        </div>
      </div>
    </div>
  );
}
