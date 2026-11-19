import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, type University, type College, type Major, type Course } from '../../lib/api';
import { Card, Input, Select, Button, SkeletonGrid, EmptyState, Pagination } from '../../components/ui';
import { CourseCard } from '../../components/cards';
import { PageHeader } from '../../components/PageHeader';
import { useI18n } from '../../i18n';
import { IconArrowForward } from '../../components/icons';
import { useDebounce } from '../../lib/useDebounce';

export default function Courses() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);
  const sort = params.get('sort') ?? 'new';

  const [searchTerm, setSearchTerm] = useState(q);
  const debouncedSearch = useDebounce(searchTerm, 350);

  const [unis, setUnis] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [majors, setMajors] = useState<Major[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [meta, setMeta] = useState<{ total?: number; totalPages?: number }>({});
  const [loading, setLoading] = useState(true);

  const universityId = params.get('universityId') ?? '';
  const collegeId = params.get('collegeId') ?? '';
  const majorId = params.get('majorId') ?? '';
  const level = params.get('level') ?? '';

  useEffect(() => {
    api.universities.list().then(({ data }) => setUnis(data ?? [])).catch(() => setUnis([]));
  }, []);

  useEffect(() => {
    if (!universityId) { setColleges([]); setMajors([]); return; }
    api.colleges.list(universityId).then(({ data }) => setColleges(data ?? [])).catch(() => setColleges([]));
  }, [universityId]);

  useEffect(() => {
    if (!universityId) return;
    api.majors.list(universityId, collegeId || undefined).then(({ data }) => setMajors(data ?? [])).catch(() => setMajors([]));
  }, [universityId, collegeId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.courses.list({ q, universityId, collegeId, majorId, level, sort, page, pageSize: 12 }).then(({ data, meta }) => {
      if (!alive) return;
      setCourses(data ?? []);
      setMeta({ total: meta?.total, totalPages: meta?.totalPages });
      setLoading(false);
    }).catch(() => { if (alive) { setCourses([]); setLoading(false); } });
    return () => { alive = false; };
  }, [q, universityId, collegeId, majorId, level, sort, page]);

  const upd = useMemo(() => (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete('page');
    setParams(p);
  }, [params, setParams]);

  useEffect(() => {
    if (debouncedSearch !== q) {
      upd({ q: debouncedSearch || null });
    }
  }, [debouncedSearch]);

  return (
    <div className="container-x py-10">
      <PageHeader
        title={t('courses.title')}
        subtitle={t('courses.subtitle')}
        action={
          <Link to="/requests/custom?type=course">
            <Button size="sm">{t('courses.requestUnavailable')} +</Button>
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3 self-start rounded-lg border border-line bg-surface p-5 lg:sticky lg:top-24">
          <p className="text-sm font-bold text-gold-200">{t('courses.filters')}</p>
          <Input placeholder={t('courses.searchPlaceholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <Select value={universityId} onChange={(e) => upd({ universityId: e.target.value, collegeId: null, majorId: null })}>
            <option value="">{t('courses.allUniversities')}</option>
            {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Select value={collegeId} onChange={(e) => upd({ collegeId: e.target.value, majorId: null })} disabled={!universityId}>
            <option value="">{t('courses.allColleges')}</option>
            {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={majorId} onChange={(e) => upd({ majorId: e.target.value })} disabled={!universityId}>
            <option value="">{t('courses.allMajors')}</option>
            {majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select value={level} onChange={(e) => upd({ level: e.target.value })}>
            <option value="">{t('courses.allLevels')}</option>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>{t('courses.level', { n })}</option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => upd({ sort: e.target.value })}>
            <option value="new">{t('courses.sortNew')}</option>
            <option value="old">{t('courses.sortOld')}</option>
            <option value="price_asc">{t('courses.priceAsc')}</option>
            <option value="price_desc">{t('courses.priceDesc')}</option>
          </Select>
          <Button variant="subtle" size="sm" className="w-full" onClick={() => setParams(new URLSearchParams())}>{t('courses.clearFilters')}</Button>
          <div className="mt-4 space-y-2 rounded-lg border border-gold-500/30 bg-gold-500/10 p-3.5 text-center text-xs">
            <p className="font-semibold text-gold-200">{t('courses.notFoundTitle')}</p>
            <p className="text-ink-muted">{t('courses.notFoundHint')}</p>
            <Link to="/requests/custom?type=course" className="block">
              <Button variant="outline" size="sm" className="inline-flex w-full items-center justify-center gap-1.5">
                <span>{t('courses.requestMissing')}</span>
                <IconArrowForward className="size-3.5" />
              </Button>
            </Link>
          </div>
        </aside>

        <div>
          <p className="mb-4 text-sm text-ink-muted">{t('courses.results', { count: (meta.total ?? courses.length).toLocaleString() })}</p>
          {loading ? (
            <SkeletonGrid count={6} />
          ) : courses.length === 0 ? (
            <EmptyState
              title={t('courses.emptyTitle')}
              hint={t('courses.emptyHint')}
              action={
                <Link to="/requests/custom?type=course">
                  <Button size="sm">{t('courses.requestNow')}</Button>
                </Link>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {courses.map((c) => <CourseCard key={c.id} c={c} />)}
              </div>
              <Pagination page={page} totalPages={meta.totalPages ?? 1} onChange={(p) => { const sp = new URLSearchParams(params); sp.set('page', String(p)); setParams(sp); }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
