import { useI18n } from '../i18n';
import { IconArrowBack } from './icons';

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: string; action?: React.ReactNode; back?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line/60 pb-6">
      <div>
        {back && (
          <button onClick={() => window.history.back()} className="mb-2 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink-secondary">
            <IconArrowBack className="size-3.5 shrink-0" />
            <span>{t('common.back')}</span>
          </button>
        )}
        <h1 className="text-3xl font-bold text-ink-primary">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-secondary">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
