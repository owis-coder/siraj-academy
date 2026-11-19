import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Service } from '../../lib/api';
import { Button, Card, Input, Select, SkeletonGrid, EmptyState } from '../../components/ui';
import { ServiceCard } from '../../components/cards';
import { PageHeader } from '../../components/PageHeader';
import { SERVICE_CATEGORY_LABEL } from '../../lib/format';
import { useI18n } from '../../i18n';
import { IconArrowForward } from '../../components/icons';

const CATEGORY_VALUES = [
  'PRIVATE_EXPLAIN',
  'LIVE_EXPLAIN',
  'SUMMARY',
  'TRANSLATION',
  'PPT',
  'PROGRAMMING_PROJECT',
  'RESEARCH_REVIEW',
  'PROOFREADING',
  'ACADEMIC_FORMAT',
  'HOMEWORK_TRAINING',
  'ACADEMIC_CONSULT',
  'CUSTOM',
];

export default function Services() {
  const { t } = useI18n();
  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.services.list({ q: q || undefined, category: cat || undefined }).then(({ data }) => {
      if (alive) { setItems(data ?? []); setLoading(false); }
    }).catch(() => { if (alive) { setItems([]); setLoading(false); } });
    return () => { alive = false; };
  }, [q, cat]);

  return (
    <div className="container-x py-10">
      <PageHeader title={t('services.title')} subtitle={t('services.subtitle')} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <Input placeholder={t('services.searchPlaceholder')} defaultValue={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">{t('services.allCategories')}</option>
          {CATEGORY_VALUES.map((value) => (
            <option key={value} value={value}>{t(SERVICE_CATEGORY_LABEL[value] ?? value)}</option>
          ))}
        </Select>
      </div>
      {loading ? (
        <SkeletonGrid count={8} />
      ) : items.length === 0 ? (
        <EmptyState title={t('services.emptyTitle')} hint={t('services.emptyHint')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((s) => <ServiceCard key={s.id} s={s} />)}
        </div>
      )}
      <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 border-gold-500/30 bg-gold-500/5 p-6">
        <div>
          <p className="font-semibold text-gold-200">{t('services.ctaTitle')}</p>
          <p className="text-sm text-ink-muted">{t('services.ctaHint')}</p>
        </div>
        <Link to="/requests/custom">
          <Button variant="outline" className="inline-flex items-center gap-1.5">
            <span>{t('services.ctaButton')}</span>
            <IconArrowForward className="size-3.5" />
          </Button>
        </Link>
      </Card>
    </div>
  );
}
