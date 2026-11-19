import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type University } from '../../lib/api';
import { Pagination } from '../../components/ui';
import { UniversityCard } from '../../components/cards';
import { SkeletonGrid, EmptyState, Input } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { useI18n } from '../../i18n';

export default function Universities() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [state, setState] = useState<{ items: University[]; total: number; totalPages: number; loading: boolean }>({ items: [], total: 0, totalPages: 1, loading: true });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api.universities.list(q).then(({ data, meta }) => {
      if (!alive) return;
      const items = data ?? [];
      setState({ items, total: meta?.total ?? items.length, totalPages: meta?.totalPages ?? 1, loading: false });
    }).catch(() => alive && setState({ items: [], total: 0, totalPages: 1, loading: false }));
    return () => { alive = false; };
  }, [q, page]);

  return (
    <div className="container-x py-10">
      <PageHeader title={t('universities.title')} subtitle={t('universities.subtitle')} />
      <div className="mb-6 max-w-md">
        <Input
          placeholder={t('universities.searchPlaceholder')}
          defaultValue={q}
          onChange={(e) => {
            const v = e.target.value;
            window.clearTimeout((window as unknown as { __ut?: number }).__ut);
            (window as unknown as { __ut?: number }).__ut = window.setTimeout(() => {
              const p = new URLSearchParams(params);
              v ? p.set('q', v) : p.delete('q');
              p.delete('page');
              setParams(p);
            }, 400);
          }}
        />
      </div>
      {state.loading ? (
        <SkeletonGrid count={9} />
      ) : state.items.length === 0 ? (
        <EmptyState title={t('universities.emptyTitle')} hint={t('universities.emptyHint')} />
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-muted">{t('universities.count', { count: state.total.toLocaleString() })}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.items.map((u) => (
              <UniversityCard key={u.id} u={u} />
            ))}
          </div>
          <Pagination page={page} totalPages={state.totalPages} onChange={(p) => { const sp = new URLSearchParams(params); sp.set('page', String(p)); setParams(sp); }} />
        </>
      )}
    </div>
  );
}
