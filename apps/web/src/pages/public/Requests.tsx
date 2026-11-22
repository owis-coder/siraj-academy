import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, type ExplainRequest, type University } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounce } from '../../lib/useDebounce';
import { Input, Select, Button, SkeletonGrid, EmptyState, Pagination, AnimatedCounter } from '../../components/ui';
import { RequestCard } from '../../components/cards';
import { PageHeader } from '../../components/PageHeader';
import { useI18n } from '../../i18n';

export default function Requests() {
  const { t } = useI18n();
  const { user } = useAuth();

  // توجيه الطلبات حسب الصفة حمايةً لخصوصية الطلاب:
  // - المدرس: يُوجّه إلى لوحة المدرس لاستعراض الطلبات المتاحة للشرح وتقديم العروض
  // - الإدارة: تُوجّه إلى لوحة الإدارة لمراجعة واعتماد الطلبات
  // - الطالب: يُوجّه إلى لوحة تحكمه الخاصة لعرض ومتابعة طلباته الشخصية فقط
  // - الزائر: يُوجّه إلى صفحة إنشاء طلب شرح جديد
  if (user?.role === 'TEACHER') {
    return <Navigate to="/teacher/requests" replace />;
  }
  if (user?.role === 'ADMIN') {
    return <Navigate to="/admin/requests" replace />;
  }
  if (user?.role === 'STUDENT') {
    return <Navigate to="/dashboard/requests" replace />;
  }
  if (!user) {
    return <Navigate to="/requests/new" replace />;
  }

  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'OPEN';
  const university = params.get('university') ?? '';
  const sort = params.get('sort') ?? 'new';
  const page = Number(params.get('page') ?? 1);

  const [searchTerm, setSearchTerm] = useState(q);
  const debouncedSearch = useDebounce(searchTerm, 350);

  const [items, setItems] = useState<ExplainRequest[]>([]);
  const [unis, setUnis] = useState<University[]>([]);
  const [meta, setMeta] = useState<{ total?: number; totalPages?: number }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.universities.list().then(({ data }) => setUnis(data ?? [])).catch(() => setUnis([]));
  }, []);

  const upd = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    p.delete('page');
    setParams(p);
  };

  useEffect(() => {
    if (debouncedSearch !== q) {
      upd({ q: debouncedSearch || null });
    }
  }, [debouncedSearch]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.requests.list({ q, status: status || undefined, university: university || undefined, sort, page, pageSize: 9 }).then(({ data, meta }) => {
      if (!alive) return;
      setItems(data ?? []);
      setMeta({ total: meta?.total, totalPages: meta?.totalPages });
      setLoading(false);
    }).catch(() => { if (alive) { setItems([]); setLoading(false); } });
    return () => { alive = false; };
  }, [q, status, university, sort, page]);

  return (
    <div className="container-x py-10">
      <PageHeader
        title={t('requests.title')}
        subtitle={t('requests.subtitle')}
        action={
          user?.role === 'TEACHER' ? (
            <Link to="/teacher/requests">
              <Button>{t('requests.teacherViewAvailable')}</Button>
            </Link>
          ) : user?.role === 'ADMIN' ? (
            <Link to="/admin/requests">
              <Button>{t('requests.adminManage')}</Button>
            </Link>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link to="/requests/new"><Button>{t('requests.requestPrivate')}</Button></Link>
              <Link to="/requests/custom"><Button variant="outline">{t('requests.requestCustom')}</Button></Link>
            </div>
          )
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder={t('requests.searchPlaceholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <Select value={status} onChange={(e) => upd({ status: e.target.value })}>
          <option value="OPEN">{t('requests.statusOpen')}</option>
          <option value="TEACHER_SELECTED" disabled={!user}>
            {t('requests.statusSelected')} {!user ? `(${t('requests.loginRequiredForFilter') || 'يتطلب تسجيل الدخول'})` : ''}
          </option>
          <option value="CLOSED" disabled={!user}>
            {t('requests.statusClosed')} {!user ? `(${t('requests.loginRequiredForFilter') || 'يتطلب تسجيل الدخول'})` : ''}
          </option>
        </Select>
        <Select value={university} onChange={(e) => upd({ university: e.target.value })}>
          <option value="">{t('requests.allUniversities')}</option>
          {unis.map((u) => <option key={u.id} value={u.slug}>{u.name}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => upd({ sort: e.target.value })}>
          <option value="new">{t('requests.newest')}</option>
          <option value="old">{t('requests.oldest')}</option>
        </Select>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/70 px-4 py-2.5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2.5 text-sm font-medium text-ink-secondary">
          <span className="flex size-2 rounded-full bg-gold-400 animate-pulse" />
          <span>طلبات الشرح المتاحة:</span>
          <span className="inline-flex items-center rounded-lg bg-gold-500/10 px-3 py-0.5 text-base font-extrabold text-gold-300 ring-1 ring-gold-500/20">
            <AnimatedCounter value={meta.total ?? items.length} suffix=" طلب" />
          </span>
        </div>
        <span className="text-xs text-ink-muted">طلبات الطلاب المفتوحة للعروض والتنفيذ</span>
      </div>
      {loading ? (
        <SkeletonGrid count={6} />
      ) : items.length === 0 ? (
        <EmptyState title={t('requests.emptyTitle')} hint={t('requests.emptyHint')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => <RequestCard key={r.id} r={r} />)}
          </div>
          <Pagination page={page} totalPages={meta.totalPages ?? 1} onChange={(p) => { const sp = new URLSearchParams(params); sp.set('page', String(p)); setParams(sp); }} />
        </>
      )}
    </div>
  );
}
