import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CustomServiceRequest } from '../../../lib/api';
import { Card, Button, Badge, SkeletonGrid, EmptyState } from '../../../components/ui';
import { PageHeader } from '../../../components/PageHeader';
import { CUSTOM_STATUS_LABEL, CUSTOM_TYPE_LABEL, formatMoney } from '../../../lib/format';
import { useI18n } from '../../../i18n';
import { IconAttachment } from '../../../components/icons';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'gold' | 'muted'> = {
  NEW: 'gold',
  UNDER_REVIEW: 'warn',
  AWAITING_RESPONSE: 'warn',
  ACCEPTED: 'ok',
  REJECTED: 'danger',
  IN_PROGRESS: 'ok',
  COMPLETED: 'muted',
};

export default function StudentCustomRequests() {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState<CustomServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.customRequests
      .mine()
      .then((res) => {
        setItems(res.data ?? []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('sd.customTitle')}
        subtitle={t('sd.customSubtitle')}
        action={
          <Link to="/requests/custom">
            <Button size="sm">{t('sd.customNew')} +</Button>
          </Link>
        }
      />

      {loading ? (
        <SkeletonGrid count={3} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('sd.customEmpty')}
          hint={t('sd.customEmptyHint')}
          action={
            <Link to="/requests/custom">
              <Button size="sm">{t('sd.customRequestNow')}</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {items.map((it) => {
            const statusKey = CUSTOM_STATUS_LABEL[it.status];
            const typeKey = CUSTOM_TYPE_LABEL[it.requestType];

            return (
              <Card key={it.id} className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs font-bold text-gold-300">{it.requestNo}</span>
                    <Badge tone={STATUS_TONE[it.status] ?? 'muted'}>{statusKey ? t(statusKey) : it.status}</Badge>
                    <span className="text-xs text-ink-muted">{t('sd.requestType')}: {typeKey ? t(typeKey) : it.requestType}</span>
                  </div>
                  <span className="text-xs text-ink-muted">{formatDate(it.createdAt)}</span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-ink-primary">{it.title}</h3>
                  <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-secondary">{it.description}</p>
                </div>

                <div className="flex flex-wrap gap-4 border-t border-line/60 pt-2 text-xs text-ink-muted">
                  {it.universityName && <span>{t('sd.universityLabel')}: {it.universityName}</span>}
                  {it.majorName && <span>{t('sd.majorLabel')}: {it.majorName}</span>}
                  {it.academicLevel && <span>{t('sd.levelLabel')}: {it.academicLevel}</span>}
                  {it.budget != null && <span>{t('sd.budgetLabel')}: {formatMoney(it.budget)}</span>}
                  {it.deadline && <span>{t('sd.deadlineLabel')}: {it.deadline}</span>}
                  {it.attachments && it.attachments.length > 0 && (
                    <span className="inline-flex items-center gap-1 font-semibold text-gold-300">
                      <IconAttachment className="size-3.5" />
                      <span>{t('sd.attachmentsCount', { count: it.attachments.length })}</span>
                    </span>
                  )}
                </div>

                {it.adminNotes && (
                  <div className="mt-2 rounded-md border border-gold-500/20 bg-gold-500/10 p-3 text-xs text-gold-100">
                    <span className="mb-1 block font-bold">{t('sd.adminNotes')}</span>
                    {it.adminNotes}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
