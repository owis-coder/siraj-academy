import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, type University, type User, type TeacherProfile } from '../../lib/api';
import { Input, Select, SkeletonGrid, EmptyState, Pagination, Button } from '../../components/ui';
import { TeacherCard } from '../../components/cards';
import { PageHeader } from '../../components/PageHeader';
import { useI18n } from '../../i18n';

type Row = User & { teacherProfile?: TeacherProfile | null };

export default function Teachers() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const university = params.get('university') ?? '';
  const sort = params.get('sort') ?? 'new';
  const page = Number(params.get('page') ?? 1);
  const [unis, setUnis] = useState<University[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ total?: number; totalPages?: number }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.universities.list().then(({ data }) => setUnis(data ?? [])).catch(() => setUnis([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.teachers.list({ q, university, sort, page, pageSize: 12 }).then(({ data, meta }) => {
      if (!alive) return;
      setItems((data ?? []) as Row[]);
      setMeta({ total: meta?.total, totalPages: meta?.totalPages });
      setLoading(false);
    }).catch(() => { if (alive) { setItems([]); setLoading(false); } });
    return () => { alive = false; };
  }, [q, university, sort, page]);

  const upd = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    p.delete('page');
    setParams(p);
  };

  return (
    <div className="container-x py-10">
      <PageHeader
        title={t('teachers.title')}
        subtitle={t('teachers.subtitle')}
        action={<Link to="/register?tab=teacher"><Button variant="outline">{t('teachers.join')}</Button></Link>}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Input placeholder={t('teachers.searchPlaceholder')} defaultValue={q} onChange={(e) => upd({ q: e.target.value })} />
        <Select value={university} onChange={(e) => upd({ university: e.target.value })}>
          <option value="">{t('teachers.allUniversities')}</option>
          {unis.map((u) => <option key={u.id} value={u.slug}>{u.name}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => upd({ sort: e.target.value })}>
          <option value="new">{t('teachers.newest')}</option>
          <option value="old">{t('teachers.oldest')}</option>
        </Select>
      </div>
      <p className="mb-4 text-sm text-ink-muted">{t('teachers.count', { count: (meta.total ?? items.length).toLocaleString() })}</p>
      {loading ? (
        <SkeletonGrid count={6} />
      ) : items.length === 0 ? (
        <EmptyState title={t('teachers.emptyTitle')} hint={t('teachers.emptyHint')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((row) => <TeacherCard key={row.id} t={row} />)}
          </div>
          <Pagination page={page} totalPages={meta.totalPages ?? 1} onChange={(p) => { const sp = new URLSearchParams(params); sp.set('page', String(p)); setParams(sp); }} />
        </>
      )}
    </div>
  );
}
