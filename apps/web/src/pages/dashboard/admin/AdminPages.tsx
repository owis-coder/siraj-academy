import { useEffect, useState } from 'react';
import { api, type Order, type ExplainRequest, type Ad } from '../../../lib/api';
import { Card, Badge, Button, StatCard, Skeleton, EmptyState, Modal, Form, Field, Input, Select, Textarea, Pagination } from '../../../components/ui';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, formatDateTime, formatMoney, TEACHER_STATUS_LABEL, AD_STATUS_LABEL, OFFERING_STATUS_LABEL } from '../../../lib/format';
import { useToast } from '../../../lib/toast';
import { useI18n } from '../../../i18n';

/* ================= نظرة عامة ================= */
export function AdminHome() {
  const { t, formatNumber } = useI18n();
  const [s, setS] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.admin.stats().then(({ data }) => setS(data)).catch(() => setS(null)).finally(() => setLoading(false));
  }, []);

  const num = (k: string) => {
    const v = s?.[k];
    return typeof v === 'number' ? formatNumber(v) : null;
  };

  const bars = (rows: unknown, nameKey: string, valueKey: string) =>
    ((Array.isArray(rows) ? rows : []) as Record<string, unknown>[]).slice(0, 5).map((r) => ({ name: String(r[nameKey] ?? '—'), value: Number(r[valueKey] ?? 0) }));

  const topUnis = bars(s?.topUniversities, 'name', 'total');
  const topCourses = bars(s?.topCourses, 'title', 'enrollments');
  const topServices = bars(s?.topServices, 'title', 'orders');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('ad.homeTitle')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('ad.homeSubtitle')}</p>
        </div>
        <Button
          variant="outline"
          loading={exporting}
          onClick={async () => {
            try {
              setExporting(true);
              await api.admin.usersExportExcel();
              toast.push('success', t('ad.exportSuccess'));
            } catch (e) {
              toast.push('error', e instanceof Error ? e.message : t('ad.exportFailed'));
            } finally {
              setExporting(false);
            }
          }}
        >
          {t('ad.exportUsers')}
        </Button>
      </div>
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : !s ? (
        <EmptyState title={t('ad.statsFailed')} hint={t('ad.statsFailedHint')} />
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('ad.students')} value={num('students')} />
            <StatCard label={t('ad.teachersPending')} value={num('teachersPending')} tone="coral" />
            <StatCard label={t('ad.requestsNew')} value={num('requestsNew')} tone="teal" />
            <StatCard label={t('ad.requestsCompleted')} value={num('requestsCompleted')} tone="ok" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label={t('ad.revenue')} value={num('revenueConfirmed') != null ? formatMoney(Number(s?.revenueConfirmed ?? 0)) : null} />
            <StatCard label={t('ad.teachersDues')} value={num('teachersDues') != null ? formatMoney(Number(s?.teachersDues ?? 0)) : null} tone="coral" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <BarList title={t('ad.topUniversities')} rows={topUnis} loading={loading} />
            <BarList title={t('ad.topCourses')} rows={topCourses} loading={loading} />
            <BarList title={t('ad.topServices')} rows={topServices} loading={loading} />
          </div>
        </>
      )}
    </div>
  );
}

function BarList({ title, rows, loading }: { title: string; rows: { name: string; value: number }[]; loading: boolean }) {
  const { t, formatNumber } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="p-5">
      <h3 className="mb-4 font-bold text-gold-200">{title}</h3>
      {loading ? <Skeleton className="h-28" /> : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-muted">{t('ad.noData')}</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="truncate text-ink-secondary">{r.name}</span>
                <span className="text-gold-300">{formatNumber(r.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-elevated">
                <div className="h-full rounded-full bg-gold-grad" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============ CRUD عام (جامعات/خدمات) ============ */
export type CrudConfig = {
  resource: string;
  /** مفتاح ترجمة لمفرد العنصر (مثال: ad.uni) */
  title: string;
  /** مفتاح ترجمة للوصف */
  subtitle: string;
  fields: {
    key: string;
    label: string;
    type?: 'text' | 'number' | 'checkbox' | 'select' | 'textarea';
    options?: { value: string; label: string }[];
    required?: boolean;
    hint?: string;
    placeholder?: string;
  }[];
  listKey?: string;
};

export function AdminCrud({ cfg }: { cfg: CrudConfig }) {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>(cfg.resource);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | 'new' | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    crud.list().then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(load, [cfg.resource]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t(cfg.title)}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t(cfg.subtitle)}</p>
        </div>
        <Button onClick={() => setEditing('new')}>{t('ad.addItem', { title: t(cfg.title) })}</Button>
      </div>
      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noData')} hint={t('ad.noDataHint')} />
      ) : (
        <div className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((it) => (
            <div key={String(it.id)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <div>
                <p className="font-medium">{String(it.name ?? it.title ?? it.id)}</p>
                {it.slug ? <p className="text-xs text-ink-muted" dir="ltr">{String(it.slug)}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {it.isVisible !== undefined && <Badge tone={it.isVisible ? 'ok' : 'muted'}>{it.isVisible ? t('ad.visible') : t('ad.hiddenPlural')}</Badge>}
                {it.isActive !== undefined && <Badge tone={it.isActive ? 'ok' : 'muted'}>{it.isActive ? t('ad.activePlural') : t('ad.inactive')}</Badge>}
                <Button size="sm" variant="subtle" onClick={() => setEditing(it)}>{t('ad.edit')}</Button>
                <Button size="sm" variant="danger" onClick={async () => {
                  if (!confirm(t('ad.deleteConfirm'))) return;
                  try { await crud.remove(String(it.id)); toast.push('success', t('ad.deleted')); load(); }
                  catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.deleteFailed')); }
                }}>{t('td.delete')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <CrudModal
          cfg={cfg}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CrudModal({ cfg, initial, onClose, onSaved }: { cfg: CrudConfig; initial: Record<string, unknown> | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>(cfg.resource);
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const v: Record<string, string | boolean> = {};
    for (const f of cfg.fields) v[f.key] = (initial?.[f.key] as string | boolean) ?? (f.type === 'checkbox' ? true : '');
    return v;
  });
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  return (
    <Modal open onClose={onClose} title={initial ? t('ad.editTitle', { title: t(cfg.title) }) : t('ad.addTitle', { title: t(cfg.title) })}>
      <Form onSubmit={async () => {
        setBusy(true);
        setFieldErrors({});
        const body: Record<string, unknown> = {};
        for (const f of cfg.fields) {
          const v = values[f.key];
          body[f.key] = f.type === 'number'
            ? (v === '' || v === undefined ? undefined : Number(v))
            : f.type === 'checkbox'
              ? Boolean(v)
              : ((v as string) === '' || v === undefined ? undefined : v);
        }
        try {
          if (initial) await crud.update(String(initial.id), body);
          else await crud.create(body);
          toast.push('success', initial ? t('ad.updatedSuccess') : t('ad.addedSuccess'));
          onSaved();
        } catch (e: unknown) {
          const err = e as { details?: { fieldErrors?: Record<string, string[]> }; message?: string };
          if (err.details?.fieldErrors) {
            const map: Record<string, string> = {};
            for (const [k, msgs] of Object.entries(err.details.fieldErrors)) {
              if (msgs && msgs.length > 0) map[k] = msgs[0];
            }
            setFieldErrors(map);
            const firstMsg = Object.values(map)[0];
            toast.push('error', firstMsg || err.message || t('ad.saveFailed'));
          } else {
            toast.push('error', err.message || t('ad.saveFailed'));
          }
        } finally {
          setBusy(false);
        }
      }} className="space-y-4">
        {cfg.fields.map((f) => (
          f.type === 'checkbox' ? (
            <label key={f.key} className="flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={Boolean(values[f.key])}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                className="size-4 accent-[#C9964B]"
              />
              {t(f.label)}
            </label>
          ) : (
            <Field key={f.key} label={t(f.label)} required={f.required} hint={f.hint ? t(f.hint) : undefined}>
              {f.options ? (
                <Select
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.key]: e.target.value }));
                    if (fieldErrors[f.key]) setFieldErrors((fe) => { const n = { ...fe }; delete n[f.key]; return n; });
                  }}
                >
                  <option value="">— اختر —</option>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea
                  rows={3}
                  placeholder={f.placeholder}
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.key]: e.target.value }));
                    if (fieldErrors[f.key]) setFieldErrors((fe) => { const n = { ...fe }; delete n[f.key]; return n; });
                  }}
                />
              ) : (
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  placeholder={f.placeholder}
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.key]: e.target.value }));
                    if (fieldErrors[f.key]) setFieldErrors((fe) => { const n = { ...fe }; delete n[f.key]; return n; });
                  }}
                />
              )}
              {fieldErrors[f.key] && <p className="mt-1 text-xs text-coral font-medium">{fieldErrors[f.key]}</p>}
            </Field>
          )
        ))}
        <Button type="submit" loading={busy} className="w-full">{t('ad.save')}</Button>
      </Form>
    </Modal>
  );
}

/* ============ الكليات ============ */
export function AdminColleges() {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>('colleges');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [unis, setUnis] = useState<{ id: string; name: string }[]>([]);
  const [selectedUni, setSelectedUni] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | 'new' | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    crud.list(selectedUni ? { universityId: selectedUni } : undefined)
      .then(({ data }) => { setItems(data ?? []); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  };

  useEffect(() => {
    api.universities.list().then(({ data }) => setUnis(data ?? [])).catch(() => setUnis([]));
  }, []);

  useEffect(load, [selectedUni]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('ad.college')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('ad.collegeSub')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>{t('ad.addItem', { title: t('ad.college') })}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-ink-secondary">{t('ad.university')}:</label>
        <Select value={selectedUni} onChange={(e) => setSelectedUni(e.target.value)} className="max-w-xs">
          <option value="">جميع الجامعات ({unis.length})</option>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noData')} hint={t('ad.noDataHint')} />
      ) : (
        <div className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((it) => (
            <div key={String(it.id)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <div>
                <p className="font-medium">{String(it.name)}</p>
                <p className="text-xs text-ink-muted">
                  {(it.university as { name?: string })?.name ?? '—'}
                  {it._count ? ` · ${(it._count as { majors?: number }).majors ?? 0} تخصصات · ${(it._count as { courses?: number }).courses ?? 0} مقررات` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="subtle" onClick={() => setEditing(it)}>{t('ad.edit')}</Button>
                <Button size="sm" variant="danger" onClick={async () => {
                  if (!confirm(t('ad.deleteConfirm'))) return;
                  try { await crud.remove(String(it.id)); toast.push('success', t('ad.deleted')); load(); }
                  catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.deleteFailed')); }
                }}>{t('td.delete')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CollegeModal
          unis={unis}
          initial={editing === 'new' ? null : editing}
          defaultUniId={selectedUni}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CollegeModal({
  unis,
  initial,
  defaultUniId,
  onClose,
  onSaved,
}: {
  unis: { id: string; name: string }[];
  initial: Record<string, unknown> | null;
  defaultUniId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>('colleges');
  const toast = useToast();
  const [universityId, setUniversityId] = useState(String(initial?.universityId ?? defaultUniId ?? ''));
  const [name, setName] = useState(String(initial?.name ?? ''));
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  return (
    <Modal open onClose={onClose} title={initial ? t('ad.editTitle', { title: t('ad.college') }) : t('ad.addTitle', { title: t('ad.college') })}>
      <Form onSubmit={async () => {
        if (!universityId) {
          setFieldErrors({ universityId: 'يرجى اختيار الجامعة' });
          return;
        }
        if (!name.trim()) {
          setFieldErrors({ name: 'يرجى كتابة اسم الكلية' });
          return;
        }
        setBusy(true);
        setFieldErrors({});
        try {
          if (initial) await crud.update(String(initial.id), { universityId, name: name.trim() });
          else await crud.create({ universityId, name: name.trim() });
          toast.push('success', initial ? t('ad.updatedSuccess') : t('ad.addedSuccess'));
          onSaved();
        } catch (e: unknown) {
          const err = e as { details?: { fieldErrors?: Record<string, string[]> }; message?: string };
          if (err.details?.fieldErrors) {
            const map: Record<string, string> = {};
            for (const [k, msgs] of Object.entries(err.details.fieldErrors)) {
              if (msgs && msgs.length > 0) map[k] = msgs[0];
            }
            setFieldErrors(map);
            const firstMsg = Object.values(map)[0];
            toast.push('error', firstMsg || err.message || t('ad.saveFailed'));
          } else {
            toast.push('error', err.message || t('ad.saveFailed'));
          }
        } finally {
          setBusy(false);
        }
      }} className="space-y-4">
        <Field label={t('ad.university')} required>
          <Select value={universityId} onChange={(e) => { setUniversityId(e.target.value); setFieldErrors((fe) => ({ ...fe, universityId: '' })); }}>
            <option value="">— اختر الجامعة —</option>
            {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          {fieldErrors.universityId && <p className="mt-1 text-xs text-coral font-medium">{fieldErrors.universityId}</p>}
        </Field>
        <Field label={t('ad.collegeName')} required>
          <Input placeholder="مثال: كلية علوم الحاسب والمعلومات" value={name} onChange={(e) => { setName(e.target.value); setFieldErrors((fe) => ({ ...fe, name: '' })); }} />
          {fieldErrors.name && <p className="mt-1 text-xs text-coral font-medium">{fieldErrors.name}</p>}
        </Field>
        <Button type="submit" loading={busy} className="w-full">{t('ad.save')}</Button>
      </Form>
    </Modal>
  );
}

/* ============ التخصصات ============ */
export function AdminMajors() {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>('majors');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [unis, setUnis] = useState<{ id: string; name: string }[]>([]);
  const [selectedUni, setSelectedUni] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | 'new' | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    crud.list(selectedUni ? { universityId: selectedUni } : undefined)
      .then(({ data }) => { setItems(data ?? []); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  };

  useEffect(() => {
    api.universities.list().then(({ data }) => setUnis(data ?? [])).catch(() => setUnis([]));
  }, []);

  useEffect(load, [selectedUni]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('ad.major')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('ad.majorSub')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>{t('ad.addItem', { title: t('ad.major') })}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-ink-secondary">{t('ad.university')}:</label>
        <Select value={selectedUni} onChange={(e) => setSelectedUni(e.target.value)} className="max-w-xs">
          <option value="">جميع الجامعات ({unis.length})</option>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noData')} hint={t('ad.noDataHint')} />
      ) : (
        <div className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((it) => (
            <div key={String(it.id)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <div>
                <p className="font-medium">{String(it.name)}</p>
                <p className="text-xs text-ink-muted">
                  {(it.university as { name?: string })?.name ?? '—'}
                  {(it.college as { name?: string })?.name ? ` · ${(it.college as { name?: string }).name}` : ''}
                  {it._count ? ` · ${(it._count as { courses?: number }).courses ?? 0} مقررات` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="subtle" onClick={() => setEditing(it)}>{t('ad.edit')}</Button>
                <Button size="sm" variant="danger" onClick={async () => {
                  if (!confirm(t('ad.deleteConfirm'))) return;
                  try { await crud.remove(String(it.id)); toast.push('success', t('ad.deleted')); load(); }
                  catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.deleteFailed')); }
                }}>{t('td.delete')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <MajorModal
          unis={unis}
          initial={editing === 'new' ? null : editing}
          defaultUniId={selectedUni}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function MajorModal({
  unis,
  initial,
  defaultUniId,
  onClose,
  onSaved,
}: {
  unis: { id: string; name: string }[];
  initial: Record<string, unknown> | null;
  defaultUniId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>('majors');
  const toast = useToast();
  const [universityId, setUniversityId] = useState(String(initial?.universityId ?? defaultUniId ?? ''));
  const [collegeId, setCollegeId] = useState(String(initial?.collegeId ?? ''));
  const [name, setName] = useState(String(initial?.name ?? ''));
  const [colleges, setColleges] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!universityId) {
      setColleges([]);
      return;
    }
    api.colleges.list(universityId).then(({ data }) => setColleges(data ?? [])).catch(() => setColleges([]));
  }, [universityId]);

  return (
    <Modal open onClose={onClose} title={initial ? t('ad.editTitle', { title: t('ad.major') }) : t('ad.addTitle', { title: t('ad.major') })}>
      <Form onSubmit={async () => {
        if (!universityId) {
          setFieldErrors({ universityId: 'يرجى اختيار الجامعة' });
          return;
        }
        if (!name.trim()) {
          setFieldErrors({ name: 'يرجى كتابة اسم التخصص' });
          return;
        }
        setBusy(true);
        setFieldErrors({});
        try {
          const body = {
            universityId,
            collegeId: collegeId || undefined,
            name: name.trim(),
          };
          if (initial) await crud.update(String(initial.id), body);
          else await crud.create(body);
          toast.push('success', initial ? t('ad.updatedSuccess') : t('ad.addedSuccess'));
          onSaved();
        } catch (e: unknown) {
          const err = e as { details?: { fieldErrors?: Record<string, string[]> }; message?: string };
          if (err.details?.fieldErrors) {
            const map: Record<string, string> = {};
            for (const [k, msgs] of Object.entries(err.details.fieldErrors)) {
              if (msgs && msgs.length > 0) map[k] = msgs[0];
            }
            setFieldErrors(map);
            const firstMsg = Object.values(map)[0];
            toast.push('error', firstMsg || err.message || t('ad.saveFailed'));
          } else {
            toast.push('error', err.message || t('ad.saveFailed'));
          }
        } finally {
          setBusy(false);
        }
      }} className="space-y-4">
        <Field label={t('ad.university')} required>
          <Select value={universityId} onChange={(e) => { setUniversityId(e.target.value); setCollegeId(''); setFieldErrors((fe) => ({ ...fe, universityId: '' })); }}>
            <option value="">— اختر الجامعة —</option>
            {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          {fieldErrors.universityId && <p className="mt-1 text-xs text-coral font-medium">{fieldErrors.universityId}</p>}
        </Field>
        <Field label={t('ad.collegeOptional')} hint="اختياري — يمكن ربط التخصص بالجامعة مباشرة دون كلية">
          <Select value={collegeId} onChange={(e) => setCollegeId(e.target.value)} disabled={!universityId}>
            <option value="">— عام للتخصص / بدون كلية —</option>
            {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t('ad.majorName')} required>
          <Input placeholder="مثال: هندسة البرمجيات" value={name} onChange={(e) => { setName(e.target.value); setFieldErrors((fe) => ({ ...fe, name: '' })); }} />
          {fieldErrors.name && <p className="mt-1 text-xs text-coral font-medium">{fieldErrors.name}</p>}
        </Field>
        <Button type="submit" loading={busy} className="w-full">{t('ad.save')}</Button>
      </Form>
    </Modal>
  );
}

/* ============ المقررات ============ */
export function AdminCourses() {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>('courses');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [unis, setUnis] = useState<{ id: string; name: string }[]>([]);
  const [selectedUni, setSelectedUni] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, unknown> | 'new' | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    crud.list({
      universityId: selectedUni || undefined,
      q: search || undefined,
    }).then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };

  useEffect(() => {
    api.universities.list().then(({ data }) => setUnis(data ?? [])).catch(() => setUnis([]));
  }, []);

  useEffect(load, [selectedUni, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('ad.coursesTitle')}</h1>
          <p className="text-ink-muted mt-1 text-sm">{t('ad.coursesSub')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>{t('ad.newCourse')}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedUni} onChange={(e) => setSelectedUni(e.target.value)} className="max-w-xs">
          <option value="">جميع الجامعات ({unis.length})</option>
          {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Input
          placeholder="بحث بالعنوان أو الرمز..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noData')} hint={t('ad.courseEmptyHint')} />
      ) : (
        <div className="divide-y divide-line/60 rounded-lg border border-line bg-surface">
          {items.map((c) => (
            <div key={String(c.id)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <div>
                <p className="font-medium">{String(c.title)}</p>
                <p className="text-xs text-ink-muted">
                  {c.code ? `${String(c.code)} · ` : ''}
                  {(c.university as { name?: string })?.name ?? ''}
                  {(c.college as { name?: string })?.name ? ` · ${(c.college as { name?: string }).name}` : ''}
                  {(c.major as { name?: string })?.name ? ` · ${(c.major as { name?: string }).name}` : ''}
                  {c.level ? ` · المستوى ${String(c.level)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={c.isVisible ? 'ok' : 'muted'}>{c.isVisible ? t('ad.visibleShort') : t('ad.hiddenShort')}</Badge>
                <Button size="sm" variant="ghost" onClick={async () => {
                  try { await crud.update(String(c.id), { isVisible: !c.isVisible }); load(); }
                  catch { toast.push('error', t('ad.toggleFailed')); }
                }}>{c.isVisible ? t('ad.hide') : t('ad.show')}</Button>
                <Button size="sm" variant="subtle" onClick={() => setEditing(c)}>{t('ad.edit')}</Button>
                <Button size="sm" variant="danger" onClick={async () => {
                  if (!confirm(t('ad.deleteConfirm'))) return;
                  try { await crud.remove(String(c.id)); toast.push('success', t('ad.deleted')); load(); }
                  catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.deleteFailed')); }
                }}>{t('td.delete')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CourseModal
          unis={unis}
          initial={editing === 'new' ? null : editing}
          defaultUniId={selectedUni}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CourseModal({
  unis,
  initial,
  defaultUniId,
  onClose,
  onSaved,
}: {
  unis: { id: string; name: string }[];
  initial: Record<string, unknown> | null;
  defaultUniId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>('courses');
  const toast = useToast();

  const [title, setTitle] = useState(String(initial?.title ?? ''));
  const [code, setCode] = useState(String(initial?.code ?? ''));
  const [universityId, setUniversityId] = useState(String(initial?.universityId ?? (initial?.university as { id?: string })?.id ?? defaultUniId ?? ''));
  const [collegeId, setCollegeId] = useState(String(initial?.collegeId ?? (initial?.college as { id?: string })?.id ?? ''));
  const [majorId, setMajorId] = useState(String(initial?.majorId ?? (initial?.major as { id?: string })?.id ?? ''));
  const [level, setLevel] = useState(String(initial?.level ?? ''));
  const [description, setDescription] = useState(String(initial?.description ?? ''));
  const [isVisible, setIsVisible] = useState(Boolean(initial?.isVisible ?? true));

  // Custom text input fallback toggles
  const [customCollege, setCustomCollege] = useState(false);
  const [customMajor, setCustomMajor] = useState(false);
  const [customCollegeName, setCustomCollegeName] = useState('');
  const [customMajorName, setCustomMajorName] = useState('');

  const [colleges, setColleges] = useState<{ id: string; name: string }[]>([]);
  const [majors, setMajors] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!universityId) {
      setColleges([]);
      setMajors([]);
      return;
    }
    api.colleges.list(universityId).then(({ data }) => setColleges(data ?? [])).catch(() => setColleges([]));
    api.majors.list(universityId).then(({ data }) => setMajors(data ?? [])).catch(() => setMajors([]));
  }, [universityId]);

  return (
    <Modal open onClose={onClose} title={initial ? t('ad.editTitle', { title: t('ad.course') }) : t('ad.addTitle', { title: t('ad.course') })}>
      <Form onSubmit={async () => {
        if (!title.trim()) {
          setFieldErrors({ title: 'يرجى كتابة عنوان المقرر' });
          return;
        }
        if (!universityId) {
          setFieldErrors({ universityId: 'يرجى اختيار الجامعة' });
          return;
        }
        setBusy(true);
        setFieldErrors({});

        const chosenCollege = customCollege ? customCollegeName.trim() : collegeId;
        const chosenMajor = customMajor ? customMajorName.trim() : majorId;

        const body: Record<string, unknown> = {
          title: title.trim(),
          code: code.trim() || undefined,
          universityId,
          collegeId: chosenCollege || undefined,
          majorId: chosenMajor || undefined,
          level: level.trim() || undefined,
          description: description.trim() || undefined,
          isVisible,
        };

        try {
          if (initial) await crud.update(String(initial.id), body);
          else await crud.create(body);
          toast.push('success', initial ? t('ad.updatedSuccess') : t('ad.addedSuccess'));
          onSaved();
        } catch (e: unknown) {
          const err = e as { details?: { fieldErrors?: Record<string, string[]> }; message?: string };
          if (err.details?.fieldErrors) {
            const map: Record<string, string> = {};
            for (const [k, msgs] of Object.entries(err.details.fieldErrors)) {
              if (msgs && msgs.length > 0) map[k] = msgs[0];
            }
            setFieldErrors(map);
            const firstMsg = Object.values(map)[0];
            toast.push('error', firstMsg || err.message || t('ad.saveFailed'));
          } else {
            toast.push('error', err.message || t('ad.saveFailed'));
          }
        } finally {
          setBusy(false);
        }
      }} className="space-y-4">
        <Field label={t('ad.courseTitleField')} required>
          <Input placeholder="مثال: هياكل البيانات والخوارزميات" value={title} onChange={(e) => { setTitle(e.target.value); setFieldErrors((fe) => ({ ...fe, title: '' })); }} />
          {fieldErrors.title && <p className="mt-1 text-xs text-coral font-medium">{fieldErrors.title}</p>}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('ad.courseCode')}>
            <Input placeholder="مثال: CS210" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label={t('ad.university')} required>
            <Select value={universityId} onChange={(e) => { setUniversityId(e.target.value); setCollegeId(''); setMajorId(''); setFieldErrors((fe) => ({ ...fe, universityId: '' })); }}>
              <option value="">— اختر الجامعة —</option>
              {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            {fieldErrors.universityId && <p className="mt-1 text-xs text-coral font-medium">{fieldErrors.universityId}</p>}
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label={t('ad.collegeOptional')}
            hint={customCollege ? 'إدخال اسم كلية جديد' : colleges.length === 0 && universityId ? 'لم تُضف كليات لهذه الجامعة بعد' : undefined}
          >
            {customCollege ? (
              <div className="space-y-1.5">
                <Input placeholder="اكتب اسم الكلية..." value={customCollegeName} onChange={(e) => setCustomCollegeName(e.target.value)} />
                <button type="button" onClick={() => setCustomCollege(false)} className="text-xs text-gold-300 hover:underline">
                  اختيار من القائمة
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Select value={collegeId} onChange={(e) => setCollegeId(e.target.value)} disabled={!universityId}>
                  <option value="">— عامة / بدون كلية —</option>
                  {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <button type="button" onClick={() => { setCustomCollege(true); setCollegeId(''); }} className="text-xs text-gold-300 hover:underline">
                  + كتابة اسم كلية جديدة يدويًا
                </button>
              </div>
            )}
          </Field>

          <Field
            label={t('ad.majorOptional')}
            hint={customMajor ? 'إدخال اسم تخصص جديد' : majors.length === 0 && universityId ? 'لم تُضف تخصصات لهذه الجامعة بعد' : undefined}
          >
            {customMajor ? (
              <div className="space-y-1.5">
                <Input placeholder="اكتب اسم التخصص..." value={customMajorName} onChange={(e) => setCustomMajorName(e.target.value)} />
                <button type="button" onClick={() => setCustomMajor(false)} className="text-xs text-gold-300 hover:underline">
                  اختيار من القائمة
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Select value={majorId} onChange={(e) => setMajorId(e.target.value)} disabled={!universityId}>
                  <option value="">— عام / بدون تخصص —</option>
                  {majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
                <button type="button" onClick={() => { setCustomMajor(true); setMajorId(''); }} className="text-xs text-gold-300 hover:underline">
                  + كتابة اسم تخصص جديد يدويًا
                </button>
              </div>
            )}
          </Field>
        </div>

        <Field label={t('ad.level')} hint={t('ad.levelHint')}>
          <Input placeholder="مثال: المستوى 3 أو بكالوريوس" value={level} onChange={(e) => setLevel(e.target.value)} />
        </Field>

        <Field label={t('ad.description')}>
          <Textarea rows={3} placeholder="اكتب وصفاً مختصراً للمقرر..." value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} className="size-4 accent-[#C9964B]" />
          {t('ad.visibleToStudents')}
        </label>

        <Button type="submit" loading={busy} className="w-full">{t('ad.save')}</Button>
      </Form>
    </Modal>
  );
}

function RejectModal({
  open,
  title,
  placeholder,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  placeholder?: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={title}>
      <Form
        onSubmit={async () => {
          const trimmed = reason.trim();
          if (!trimmed || trimmed.length < 3) {
            setError('يرجى توضيح سبب الرفض (3 أحرف على الأقل)');
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await onSubmit(trimmed);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'فشلت عملية الرفض');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-4">
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            placeholder={placeholder ?? t('ad.rejectReason') ?? 'اكتب سبب الرفض هنا...'}
            rows={4}
            disabled={busy}
            autoFocus
          />
          {error && <p className="text-xs text-coral">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel') || 'إلغاء'}
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              {t('ad.reject') || 'رفض'}
            </Button>
          </div>
        </div>
      </Form>
    </Modal>
  );
}

/* ============ الدورات (مراجعة) ============ */
export function AdminOfferings() {
  const { t } = useI18n();
  const crud = api.admin.crud<Record<string, unknown>>('offerings');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    crud.list().then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t('ad.offeringsTitle')}</h1><p className="text-ink-muted mt-1 text-sm">{t('ad.offeringsSub')}</p></div>
      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noData')} />
      ) : (
        <div className="divide-y divide-line/60 rounded-lg border border-line bg-surface">
          {items.map((o) => (
            <div key={String(o.id)} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <div>
                <p className="font-medium">{String(o.title ?? '')}</p>
                <p className="text-xs text-ink-muted">
                  {(o.teacher as { fullName?: string; user?: { fullName?: string } })?.user?.fullName ??
                    (o.teacher as { fullName?: string })?.fullName ?? ''}
                  {' · '}{formatMoney(Number(o.price ?? 0))}
                </p>
                {o.adminNote ? <p className="mt-1 text-xs text-coral">{t('ad.noteLabel', { note: String(o.adminNote) })}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={o.status === 'PUBLISHED' ? 'ok' : o.status === 'PENDING_REVIEW' ? 'warn' : o.status === 'HIDDEN' ? 'info' : o.status === 'REJECTED' ? 'danger' : 'muted'}>{t(OFFERING_STATUS_LABEL[String(o.status)])}</Badge>
                {o.status === 'PENDING_REVIEW' && (
                  <Button size="sm" onClick={async () => { try { await crud.update(String(o.id), { status: 'PUBLISHED' }); load(); toast.push('success', t('ad.offeringApproved')); } catch { toast.push('error', t('ad.approveFailed')); } }}>{t('ad.approvePublish')}</Button>
                )}
                {o.status !== 'HIDDEN' && <Button size="sm" variant="ghost" onClick={async () => { try { await crud.update(String(o.id), { status: 'HIDDEN' }); load(); } catch { toast.push('error', t('ad.actionFailed')); } }}>{t('ad.hide')}</Button>}
                {o.status === 'HIDDEN' && <Button size="sm" variant="ghost" onClick={async () => { try { await crud.update(String(o.id), { status: 'PUBLISHED' }); load(); } catch { toast.push('error', t('ad.actionFailed')); } }}>{t('ad.show')}</Button>}
                {o.status !== 'REJECTED' && (
                  <Button size="sm" variant="danger" onClick={() => setRejectId(String(o.id))}>
                    {t('ad.reject')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <RejectModal
        open={Boolean(rejectId)}
        title={t('ad.reject') + ' ' + (t('ad.offering') || 'الدورة')}
        placeholder={t('ad.rejectReason') || 'اكتب سبب رفض الدورة ليتم إرساله للمدرّس...'}
        onClose={() => setRejectId(null)}
        onSubmit={async (reason) => {
          await crud.update(rejectId!, { status: 'REJECTED', adminNote: reason });
          load();
          toast.push('success', t('ad.rejectedWithNote'));
        }}
      />
    </div>
  );
}

/* ============ المدرسون (التحقق) ============ */
export function AdminTeachers() {
  const { t } = useI18n();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api.admin.special.teachers().then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(() => { load(); }, [tab]);

  const filtered = items.filter((row) => (tab === 'PENDING' ? ((row as { teacherProfile?: { status?: string }; status?: string })?.teacherProfile?.status ?? (row as { status?: string })?.status) === 'PENDING' : true));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t('ad.teachersTitle')}</h1><p className="text-ink-muted mt-1 text-sm">{t('ad.teachersSub')}</p></div>
      <div className="flex gap-2">
        {(['PENDING', 'ALL'] as const).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? 'primary' : 'subtle'} onClick={() => setTab(k)}>{k === 'PENDING' ? t('ad.tabPending') : t('ad.tabAll')}</Button>
        ))}
      </div>
      {loading ? <Skeleton className="h-64 w-full" /> : filtered.length === 0 ? (
        <EmptyState title={t('ad.noItemsInList')} hint={tab === 'PENDING' ? t('ad.noPendingTeachers') : t('ad.noData')} />
      ) : (
        <div className="space-y-4">
          {filtered.map((tRaw) => {
            const raw = tRaw as {
              id: string;
              status?: string;
              degree?: string;
              specialties?: string;
              bio?: string;
              docsUrl?: string;
              user?: { fullName?: string; username?: string; email?: string };
              fullName?: string;
              username?: string;
              email?: string;
              teacherProfile?: { id?: string; degree?: string; specialties?: string; bio?: string; docsUrl?: string; status?: string };
            };
            const profile = raw.teacherProfile ?? raw;
            const targetId = raw.teacherProfile?.id ?? raw.id;
            const fullName = raw.fullName ?? raw.user?.fullName ?? raw.username ?? raw.user?.username;
            const email = raw.email ?? raw.user?.email;
            const profileStatus = profile?.status ?? raw.status ?? 'PENDING';
            return (
              <Card key={targetId} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{fullName}</p>
                    <p className="text-xs text-ink-muted" dir="ltr">{email}</p>
                    {profile && (
                      <div className="mt-2 space-y-0.5 text-sm text-ink-secondary">
                        <p>{t('ad.degreeLine', { degree: profile.degree ?? '—', specialties: profile.specialties ?? '—' })}</p>
                        {profile.bio && <p className="text-xs text-ink-muted">{t('ad.bioLine', { bio: profile.bio })}</p>}
                        {profile.docsUrl && <a href={profile.docsUrl} target="_blank" rel="noreferrer" dir="ltr" className="text-xs text-teal hover:underline">{t('ad.verifyDocs')}</a>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={profileStatus === 'APPROVED' ? 'ok' : profileStatus === 'PENDING' ? 'warn' : 'danger'}>{t(TEACHER_STATUS_LABEL[profileStatus])}</Badge>

                    {profileStatus === 'PENDING' && (
                      <>
                        <Button size="sm" onClick={async () => {
                          try { await api.admin.special.teacherApprove(targetId); toast.push('success', t('ad.teacherApproved')); load(); }
                          catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.approveFailed')); }
                        }}>{t('ad.approve')}</Button>
                        <Button size="sm" variant="danger" onClick={async () => {
                          try { await api.admin.special.teacherReject(targetId); toast.push('success', t('ad.teacherRejected')); load(); }
                          catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.rejectFailed')); }
                        }}>{t('ad.reject')}</Button>
                      </>
                    )}
                    {profileStatus === 'APPROVED' && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!window.confirm('هل أنت متأكد من رغبتك في تعليق حساب المدرس؟')) return;
                        try { await api.admin.special.teacherDisable(targetId); toast.push('success', t('ad.teacherDisabled')); load(); }
                        catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.disableFailed')); }
                      }}>{t('ad.disable')}</Button>
                    )}
                    {profileStatus === 'SUSPENDED' && (
                      <Button size="sm" variant="outline" onClick={async () => {
                        if (!window.confirm(t('ad.confirmEnableTeacher') || 'هل أنت متأكد من رغبتك في إعادة تفعيل حساب المدرس؟')) return;
                        try {
                          await api.admin.special.teacherEnable(targetId);
                          toast.push('success', t('ad.teacherEnabled') || 'تم إعادة تفعيل الحساب بنجاح.');
                          load();
                        } catch (e) {
                          toast.push('error', e instanceof Error ? e.message : 'فشل في إعادة تفعيل المدرس');
                        }
                      }}>{t('ad.enable') || 'إعادة التفعيل'}</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============ الطلبات (المراجعة) ============ */
export function AdminRequests() {
  const { t } = useI18n();
  const [items, setItems] = useState<ExplainRequest[]>([]);
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api.admin.crud<ExplainRequest>('requests').list(status ? { status } : undefined)
      .then(({ data }) => { setItems(data ?? []); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(load, [status]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t('ad.requestsTitle')}</h1><p className="text-ink-muted mt-1 text-sm">{t('ad.requestsSub')}</p></div>
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs">
        <option value="PENDING_REVIEW">{t('ad.statusPending')}</option>
        <option value="OPEN">{t('ad.statusPublished')}</option>
        <option value="TEACHER_SELECTED">{t('ad.statusAccepted')}</option>
        <option value="REJECTED">{t('ad.statusRejected')}</option>
        <option value="">جميع الطلبات</option>
      </Select>
      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noRequestsInStatus')} />
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-base">{r.courseTitle}</p>
                  <p className="text-xs text-ink-muted">
                    #{r.requestNo ?? r.id.slice(0, 6)} · {r.student?.fullName ?? ''} {r.student?.whatsapp ? `(${r.student.whatsapp})` : ''} · {r.university?.name ?? ''} · {formatDateTime(r.createdAt)}
                  </p>
                  {r.details && <p className="mt-2 max-w-2xl text-sm text-ink-secondary">{r.details}</p>}
                  {r.budget ? <p className="mt-1 text-xs text-gold-300 font-medium">الميزانية المقترحة: {formatMoney(r.budget)}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(REQUEST_STATUS_LABEL[r.status])}</Badge>
                  {r.status === 'PENDING_REVIEW' && (
                    <>
                      <Button size="sm" onClick={async () => {
                        try { await api.admin.special.requestPublish(r.id); toast.push('success', t('ad.published')); load(); }
                        catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.publishFailed')); }
                      }}>{t('ad.publish')}</Button>
                      <Button size="sm" variant="danger" onClick={() => setRejectId(r.id)}>{t('ad.reject')}</Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <RejectModal
        open={Boolean(rejectId)}
        title={t('ad.reject') + ' ' + (t('nav.requests') || 'طلب الشرح')}
        placeholder={t('ad.rejectReason') || 'اكتب سبب رفض طلب الشرح ليتم إرساله للطالب...'}
        onClose={() => setRejectId(null)}
        onSubmit={async (reason) => {
          await api.admin.special.requestReject(rejectId!, reason);
          toast.push('success', t('ad.teacherRejected'));
          load();
        }}
      />
    </div>
  );
}

/* ============ إيصالات الدفع ============ */
type AdminPaymentItem = {
  id: string;
  orderId: string;
  receiptUrl: string;
  status: string;
  createdAt: string;
  order?: {
    id: string;
    orderNo?: string;
    amount: number;
    title?: string;
    status: string;
    student?: { fullName?: string; username?: string };
  };
};

export function AdminPayments() {
  const { t } = useI18n();
  const [items, setItems] = useState<AdminPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<AdminPaymentItem | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api.admin.crud<AdminPaymentItem>('payments').list({ status: 'UNDER_REVIEW' })
      .then(({ data }) => { setItems((data ?? []) as AdminPaymentItem[]); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t('ad.paymentsTitle')}</h1><p className="text-ink-muted mt-1 text-sm">{t('ad.paymentsSub')}</p></div>
      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noReceipts')} hint={t('ad.noReceiptsHint')} />
      ) : (
        <div className="space-y-4">
          {items.map((p) => {
            const ord = p.order;
            return (
              <Card key={p.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold">#{ord?.orderNo ?? p.orderId?.slice(0, 8)} · {ord?.title ?? t('ad.orderFallback')}</p>
                    <p className="text-xs text-ink-muted">{ord?.student?.fullName ?? ''} · {formatDateTime(p.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gold-300">{formatMoney(ord?.amount ?? 0)}</span>
                    {p.receiptUrl && (
                      <a href={p.receiptUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="subtle">{t('ad.viewReceipt')}</Button></a>
                    )}
                    <Button size="sm" onClick={() => setReviewing(p)}>{t('ad.approveReject')}</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {reviewing && (
        <Modal open onClose={() => setReviewing(null)} title={t('ad.reviewPayment', { amount: formatMoney(reviewing.order?.amount ?? 0) })}>
          {reviewing.receiptUrl && (
            <div className="mb-4">
              <a href={reviewing.receiptUrl} target="_blank" rel="noreferrer" className="mb-2 block text-sm text-teal hover:underline">{t('ad.openReceiptNew')}</a>
              <img src={reviewing.receiptUrl} alt={t('ad.receiptAlt')} className="max-h-80 w-auto rounded border border-line object-contain mx-auto" />
            </div>
          )}
          <PaymentReview
            onSubmit={async (decision, note) => {
              try {
                await api.admin.special.paymentReview(reviewing.id, { decision, note });
                toast.push('success', decision === 'APPROVED' ? t('ad.paymentApproved') : t('ad.paymentRejected'));
                setReviewing(null);
                load();
              } catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.decisionFailed')); }
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function PaymentReview({ onSubmit }: { onSubmit: (d: 'APPROVED' | 'REJECTED', note?: string) => void }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  return (
    <Form onSubmit={() => onSubmit('APPROVED', note || undefined)} className="space-y-4">
      <Field label={t('ad.noteFieldLabel')}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('ad.notePlaceholder')} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">{t('ad.confirmPayment')}</Button>
        <Button type="button" variant="danger" className="flex-1" onClick={() => onSubmit('REJECTED', note || undefined)}>{t('ad.rejectMark')}</Button>
      </div>
    </Form>
  );
}

/* ============ الطلبات المالية الكل ============ */
export function AdminOrders() {
  const { t } = useI18n();
  const [items, setItems] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{ totalPages?: number }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.admin.crud<Order>('orders').list({ page }).then(({ data, meta: m }) => { setItems(data ?? []); setMeta(m ?? {}); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  }, [page]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t('ad.ordersTitle')}</h1></div>
      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noData')} />
      ) : (
        <>
          <div className="divide-y divide-line/60 rounded-lg border border-line bg-surface">
            {items.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <div>
                  <p className="font-medium">#{o.orderNo ?? o.id.slice(0, 8)} · {o.title ?? t('ad.orderFallback')}</p>
                  <p className="text-xs text-ink-muted">{o.student?.fullName ?? ''} · {formatDateTime(o.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gold-300 font-bold">{formatMoney(o.amount)}</span>
                  <Badge tone={ORDER_STATUS_TONE[o.status]}>{t(ORDER_STATUS_LABEL[o.status])}</Badge>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={meta.totalPages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

/* ============ الإعلانات (وساطة) ============ */
export function AdminAds() {
  const { t } = useI18n();
  const [items, setItems] = useState<Ad[]>([]);
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    api.admin.crud<Ad>('ads').list({ status })
      .then(({ data }) => { setItems(data ?? []); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(load, [status]);

  const decide = async (id: string, decision: string, note?: string) => {
    try { await api.admin.special.adDecision(id, { decision, note }); toast.push('success', t('ad.decisionDone')); load(); }
    catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.decisionApplyFailed')); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{t('ad.adsTitle')}</h1></div>
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs">
        <option value="PENDING_REVIEW">{t('ad.statusPending')}</option>
        <option value="APPROVED">{t('ad.adsApproved')}</option>
        <option value="REJECTED">{t('ad.adsRejected')}</option>
      </Select>
      {loading ? <Skeleton className="h-64 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('ad.noAdsInStatus')} />
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{a.title}</p>
                  {a.body && <p className="mt-1 text-sm text-ink-secondary">{a.body}</p>}
                  <p className="text-xs text-ink-muted">{(a.teacher as { user?: { fullName?: string } })?.user?.fullName ?? a.teacher?.fullName ?? ''} · {formatDateTime(a.createdAt)}</p>
                  {a.linkUrl && <a href={a.linkUrl} target="_blank" rel="noreferrer" dir="ltr" className="text-xs text-teal hover:underline">{a.linkUrl}</a>}
                  {a.reviewerNote && <p className="mt-1 text-xs text-coral">{t('ad.noteLabel', { note: a.reviewerNote })}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.status === 'APPROVED' ? 'ok' : a.status === 'PENDING_REVIEW' ? 'warn' : 'danger'}>{t(AD_STATUS_LABEL[a.status])}</Badge>
                  {a.status === 'PENDING_REVIEW' || a.status === 'APPROVED' ? (
                    <>
                      <Button size="sm" onClick={() => decide(a.id, 'APPROVED')}>{t('ad.approve')}</Button>
                      <Button size="sm" variant="danger" onClick={() => setRejectId(a.id)}>{t('ad.reject')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => decide(a.id, 'HIDDEN')}>{t('ad.hide')}</Button>
                    </>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <RejectModal
        open={Boolean(rejectId)}
        title={t('ad.reject') + ' ' + (t('ad.adItem') || 'الإعلان')}
        placeholder={t('ad.rejectReasonShort') || 'اكتب سبب رفض الإعلان...'}
        onClose={() => setRejectId(null)}
        onSubmit={async (reason) => {
          await decide(rejectId!, 'REJECTED', reason);
        }}
      />
    </div>
  );
}

/* ============ الإعدادات ============ */
export function AdminSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({ telegram_link: '', whatsapp_numbers: '', payment_instructions: '', iban: '', bank_name: '', commission_rate: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.admin.special.settings().then(({ data }) => { setV((s) => ({ ...s, ...data })); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('ad.settingsTitle')}</h1>
      {loading ? <Skeleton className="h-64 w-full" /> : (
        <Card className="p-6">
          <Form onSubmit={async () => {
            setSaving(true);
            try { await api.admin.special.settingsPut(v); toast.push('success', t('ad.settingsSaved')); }
            catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.saveFailed')); }
            finally { setSaving(false); }
          }} className="space-y-4">
            <Field label={t('ad.telegramLink')}><Input dir="ltr" value={v.telegram_link ?? ''} onChange={(e) => setV((s) => ({ ...s, telegram_link: e.target.value }))} /></Field>
            <Field label={t('ad.whatsappNumbers')} hint={t('ad.whatsappHint')}><Input dir="ltr" value={v.whatsapp_numbers ?? ''} onChange={(e) => setV((s) => ({ ...s, whatsapp_numbers: e.target.value }))} /></Field>
            <Field label={t('ad.bankName')}><Input value={v.bank_name ?? ''} onChange={(e) => setV((s) => ({ ...s, bank_name: e.target.value }))} /></Field>
            <Field label={t('ad.iban')}><Input dir="ltr" value={v.iban ?? ''} onChange={(e) => setV((s) => ({ ...s, iban: e.target.value }))} /></Field>
            <Field label={t('ad.paymentInstructions')}><Textarea value={v.payment_instructions ?? ''} onChange={(e) => setV((s) => ({ ...s, payment_instructions: e.target.value }))} /></Field>
            <Field label={t('ad.commissionRate')} hint={t('ad.commissionHint')}><Input type="number" min={0} max={100} value={v.commission_rate ?? ''} onChange={(e) => setV((s) => ({ ...s, commission_rate: e.target.value }))} /></Field>
            <Button type="submit" loading={saving}>{t('ad.saveSettings')}</Button>
          </Form>
        </Card>
      )}
    </div>
  );
}

/* ============ إذاعة الإشعارات ============ */
export function AdminBroadcast() {
  const { t } = useI18n();
  const toast = useToast();
  const [role, setRole] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">{t('ad.broadcastTitle')}</h1>
      <Card className="p-6">
        <Form onSubmit={async () => {
          if (!title.trim()) { toast.push('error', t('ad.titleRequired')); return; }
          setBusy(true);
          try { await api.admin.special.broadcast({ role: role || undefined, title, body: body || undefined, link: link || undefined }); toast.push('success', t('ad.broadcastSent')); setTitle(''); setBody(''); }
          catch (e) { toast.push('error', e instanceof Error ? e.message : t('ad.sendFailed')); }
          finally { setBusy(false); }
        }} className="space-y-4">
          <Field label={t('ad.audience')}>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">{t('ad.everyone')}</option>
              <option value="STUDENT">{t('ad.roleStudents')}</option>
              <option value="TEACHER">{t('ad.roleTeachers')}</option>
            </Select>
          </Field>
          <Field label={t('ad.title')} required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label={t('ad.body')}><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <Field label={t('ad.linkOptional')}><Input dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} /></Field>
          <Button type="submit" loading={busy}>{t('ad.sendAll')}</Button>
        </Form>
      </Card>
    </div>
  );
}

export { default as AdminCustomRequests } from './AdminCustomRequests';
