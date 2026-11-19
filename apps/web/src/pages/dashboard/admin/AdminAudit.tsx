import { useCallback, useEffect, useState } from 'react';
import { api, type AuditLogRow } from '../../../lib/api';
import { Badge, Button, Card, EmptyState, Input, Pagination, Select, Skeleton } from '../../../components/ui';
import { formatDateTime } from '../../../lib/format';
import { useI18n } from '../../../i18n';
import { useDebounce } from '../../../lib/useDebounce';

/* ============================================================
   سجل التدقيق — قراءة فقط، للإدارة المخولة.
   لا يوجد في الواجهة أو الـAPI أي مسار لتعديل أو حذف السجلات.
   ============================================================ */

const CATEGORIES = [
  { value: '', label: 'au.allCategories' },
  { value: 'AUTH', label: 'au.catAuth' },
  { value: 'SECURITY', label: 'au.catSecurity' },
  { value: 'ACCOUNT', label: 'au.catAccount' },
  { value: 'REQUEST', label: 'au.catRequest' },
  { value: 'ADMIN', label: 'au.catAdmin' },
];

export default function AdminAudit() {
  const { t, formatNumber } = useI18n();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [result, setResult] = useState('');
  const [q, setQ] = useState('');
  const [inputQ, setInputQ] = useState('');
  const debouncedQ = useDebounce(inputQ, 350);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setQ(debouncedQ);
    setPage(1);
  }, [debouncedQ]);

  const load = useCallback(() => {
    setLoading(true);
    setErr(false);
    api.admin.special
      .auditLogs({ category: category || undefined, result: result || undefined, q: q.trim() || undefined, page, limit: 25 })
      .then(({ data, meta }) => {
        setRows(data ?? []);
        setTotal(Number(meta?.total ?? 0));
        setTotalPages(Number(meta?.totalPages ?? 1));
      })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, [category, result, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('au.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t('au.subtitle')}
        </p>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder={t('au.searchPlaceholder')}
          value={inputQ}
          onChange={(e) => setInputQ(e.target.value)}
        />
        <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}
        </Select>
        <Select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }}>
          <option value="">{t('au.allResults')}</option>
          <option value="SUCCESS">{t('au.success')}</option>
          <option value="FAILURE">{t('au.failure')}</option>
        </Select>
        <Button variant="subtle" onClick={load}>{t('au.refresh')}</Button>
      </Card>

      <p className="text-sm text-ink-muted">{t('au.eventsCount', { count: formatNumber(total) })}</p>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : err ? (
        <EmptyState title={t('au.loadFailed')} hint={t('ad.statsFailedHint')} action={<Button onClick={load}>{t('au.retry')}</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('au.noEvents')} hint={t('au.noEventsHint')} />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={row.result === 'SUCCESS' ? 'ok' : 'danger'}>{row.result === 'SUCCESS' ? t('au.resultSuccess') : t('au.resultFailure')}</Badge>
                  <Badge tone="gold">{row.action}</Badge>
                  <Badge tone="muted">{row.category}</Badge>
                  <span className="text-ink-secondary">
                    {row.user ? `${row.user.fullName} (@${row.user.username})` : t('au.guest')}
                  </span>
                </div>
                <time className="text-xs text-ink-muted" dateTime={row.createdAt}>
                  {formatDateTime(row.createdAt)}
                </time>
              </div>

              <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-ink-muted sm:grid-cols-2 lg:grid-cols-3">
                {row.targetType && <div><dt className="inline">{t('au.target')} </dt><dd className="inline">{row.targetType} {row.targetId ? `· ${row.targetId}` : ''}</dd></div>}
                {row.ip && <div><dt className="inline">IP: </dt><dd className="inline font-mono" dir="ltr">{row.ip}</dd></div>}
                {row.requestId && <div><dt className="inline">requestId: </dt><dd className="inline font-mono" dir="ltr">{row.requestId}</dd></div>}
                {row.reason && <div className="sm:col-span-2"><dt className="inline">{t('au.reason')} </dt><dd className="inline">{row.reason}</dd></div>}
              </dl>

              {(row.oldValues || row.newValues) && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-gold-300">{t('au.values')}</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <pre className="overflow-x-auto rounded-md border border-line bg-elevated/50 p-2" dir="ltr">
                      {JSON.stringify(row.oldValues ?? {}, null, 2)}
                    </pre>
                    <pre className="overflow-x-auto rounded-md border border-line bg-elevated/50 p-2" dir="ltr">
                      {JSON.stringify(row.newValues ?? {}, null, 2)}
                    </pre>
                  </div>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
