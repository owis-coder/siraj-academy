import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type AdminStorageFile,
  type AdminStorageFileDetail,
  type AdminStorageUser,
  type StorageOverview,
  type StorageReconcileReport,
} from '../../../lib/api';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../../components/ui';
import { VerifiedBadge } from '../../../components/VerifiedBadge';
import { formatDateTime, formatFileSize } from '../../../lib/format';
import { useToast } from '../../../lib/toast';
import { useI18n } from '../../../i18n';

const CATEGORIES = [
  'PAYMENTS',
  'MAIN_FILES',
  'CUSTOM_REQUESTS',
  'PRIVATE_EXPLANATIONS',
  'COURSE_ATTACHMENTS',
  'OTHER_ATTACHMENTS',
  'COURSE_MATERIALS',
  'LESSON_FILES',
  'VIDEO_REFERENCES',
  'SERVICE_ATTACHMENTS',
  'ASSIGNMENT_MATERIALS',
];

const STATUSES = ['PENDING', 'UPLOADING', 'UPLOADED', 'FAILED', 'DELETE_PENDING', 'DELETED'];

type Tab = 'overview' | 'files' | 'users' | 'health';

export default function AdminStorage() {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('storage.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('storage.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['overview', 'files', 'users', 'health'] as Tab[]).map((key) => (
          <Button key={key} size="sm" variant={tab === key ? 'primary' : 'subtle'} onClick={() => setTab(key)}>
            {t(`storage.tab${key.charAt(0).toUpperCase()}${key.slice(1)}`)}
          </Button>
        ))}
      </div>

      {tab === 'overview' && <OverviewPanel />}
      {tab === 'files' && <FilesPanel />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'health' && <HealthPanel onError={(m) => toast.push('error', m)} />}
    </div>
  );
}

function OverviewPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<StorageOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminStorage
      .overview()
      .then(({ data: d }) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-40" />;
  if (!data) return <EmptyState title={t('storage.loadFailed')} />;

  const totalFiles = data.byRole.reduce((sum, r) => sum + r._count._all, 0);

  return (
    <div className="space-y-4">
      <Card className={`p-4 text-sm ${data.configured ? 'border-emerald-500/40' : 'border-coral-500/40'}`}>
        {data.configured ? t('storage.configured') : t('storage.notConfigured')}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-ink-muted">{t('storage.totalFiles')}</p>
          <p className="mt-1 text-2xl font-bold text-gold-200">{totalFiles}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-muted">{t('storage.totalSize')}</p>
          <p className="mt-1 text-2xl font-bold text-gold-200">{formatFileSize(data.totalBytes)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-muted">{t('storage.pendingUploads')}</p>
          <p className="mt-1 text-2xl font-bold text-gold-200">
            {data.byStatus
              .filter((s) => ['PENDING', 'UPLOADING', 'FAILED'].includes(s.uploadStatus))
              .reduce((sum, s) => sum + s._count._all, 0)}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-gold-200">{t('common.category')}</h3>
          <ul className="divide-y divide-line/60 text-sm">
            {data.byCategory.map((row) => (
              <li key={row.category} className="flex items-center justify-between py-2">
                <span className="font-mono text-xs text-ink-secondary">{row.category}</span>
                <span className="text-ink-muted">
                  {row._count._all} · {formatFileSize(row._sum.fileSize ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-gold-200">{t('storage.tabFiles')}</h3>
          <ul className="divide-y divide-line/60 text-sm">
            {data.recent.map((row) => (
              <li key={row.id} className="py-2">
                <p className="truncate font-medium">{row.originalFileName}</p>
                <p className="text-[11px] text-ink-muted">
                  {row.ownerRole} · {row.category} · {row.uploadStatus} · {formatDateTime(row.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function FilesPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<AdminStorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<AdminStorageFileDetail | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.adminStorage
      .files({ q: q || undefined, category: category || undefined, status: status || undefined, limit: 50 })
      .then(({ data: d }) => setItems(d))
      .catch(() => toast.push('error', t('storage.loadFailed')))
      .finally(() => setLoading(false));
  }, [q, category, status, t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await api.adminStorage.review(id, decision);
      toast.push('success', t('common.saved'));
      load();
    } catch {
      toast.push('error', t('errors.saveFailed'));
    }
  };

  const remove = async (id: string) => {
    const reason = window.prompt(t('storage.deleteReason'));
    if (!reason || reason.trim().length < 3) {
      toast.push('error', t('storage.reasonRequired'));
      return;
    }
    if (!window.confirm(t('storage.deleteConfirm'))) return;
    try {
      await api.adminStorage.remove(id, reason.trim());
      toast.push('success', t('common.saved'));
      load();
    } catch {
      toast.push('error', t('errors.saveFailed'));
    }
  };

  const retry = async (id: string) => {
    try {
      await api.adminStorage.retry(id);
      toast.push('success', t('common.saved'));
      load();
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('errors.saveFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('storage.searchFiles')}
          className="rounded-md border border-line bg-elevated/60 p-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-line bg-elevated/60 p-2 text-sm"
        >
          <option value="">{t('storage.allCategories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-line bg-elevated/60 p-2 text-sm"
        >
          <option value="">{t('storage.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState title={t('storage.noFiles')} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-elevated/60 text-xs text-ink-muted">
              <tr>
                <th className="p-2 text-start">{t('common.title')}</th>
                <th className="p-2 text-start">{t('storage.owner')}</th>
                <th className="p-2 text-start">{t('common.category')}</th>
                <th className="p-2 text-start">{t('common.status')}</th>
                <th className="p-2 text-start">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {items.map((f) => (
                <tr key={f.id}>
                  <td className="max-w-[220px] p-2">
                    <p className="truncate font-medium" title={f.originalFileName}>
                      {f.originalFileName}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {formatFileSize(f.fileSize)} · {formatDateTime(f.createdAt)}
                    </p>
                  </td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1">
                      {f.owner?.fullName ?? '—'}
                      <VerifiedBadge verified={f.owner?.isVerified} />
                    </span>
                    <p className="text-[11px] text-ink-muted">{f.owner?.role}</p>
                  </td>
                  <td className="p-2 font-mono text-[11px]">{f.category}</td>
                  <td className="p-2">
                    <Badge tone={f.reviewStatus === 'APPROVED' ? 'ok' : f.reviewStatus === 'REJECTED' ? 'coral' : 'warn'}>
                      {f.reviewStatus}
                    </Badge>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="subtle" onClick={() => void api.adminStorage.file(f.id).then(({ data }) => setDetail(data))}>
                        {t('storage.viewDetails')}
                      </Button>
                      {f.uploadStatus === 'UPLOADED' && (
                        <a href={api.adminStorage.downloadUrl(f.id)} className="inline-flex">
                          <Button size="sm" variant="outline">
                            {t('storage.download')}
                          </Button>
                        </a>
                      )}
                      {f.uploadStatus === 'FAILED' && (
                        <Button size="sm" variant="subtle" onClick={() => void retry(f.id)}>
                          {t('storage.retry')}
                        </Button>
                      )}
                      <Button size="sm" variant="subtle" onClick={() => void review(f.id, 'APPROVED')}>
                        {t('storage.approve')}
                      </Button>
                      <Button size="sm" variant="subtle" onClick={() => void review(f.id, 'REJECTED')}>
                        {t('storage.reject')}
                      </Button>
                      <Button size="sm" variant="subtle" onClick={() => void remove(f.id)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <Card className="space-y-2 p-4 text-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gold-200">{detail.originalFileName}</h3>
            <Button size="sm" variant="subtle" onClick={() => setDetail(null)}>
              {t('common.close')}
            </Button>
          </div>
          <p className="text-xs text-ink-muted">{detail.storedFileName}</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">{t('storage.owner')}</dt>
              <dd>
                {detail.owner.fullName} · {detail.owner.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('storage.driveFolder')}</dt>
              <dd className="font-mono text-[11px]">{detail.driveFolderId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('common.status')}</dt>
              <dd>
                {detail.uploadStatus} · {detail.reviewStatus}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('common.date')}</dt>
              <dd>{formatDateTime(detail.createdAt)}</dd>
            </div>
          </dl>
          <div>
            <h4 className="mb-1 text-xs font-bold text-ink-secondary">{t('storage.accessLog')}</h4>
            <ul className="space-y-1 text-[11px] text-ink-muted">
              {detail.accessLogs.map((log) => (
                <li key={log.id}>
                  {formatDateTime(log.createdAt)} · {log.action} · {log.actorRole ?? '—'} {log.detail ? `· ${log.detail}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}

function UsersPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [users, setUsers] = useState<AdminStorageUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [folders, setFolders] = useState<Record<string, { id: string; folderType: string; driveFolderId: string }[]>>({});

  const load = useCallback(() => {
    setLoading(true);
    api.adminStorage
      .users({ q: q || undefined, role: role || undefined, limit: 50 })
      .then(({ data: d }) => setUsers(d))
      .catch(() => toast.push('error', t('storage.loadFailed')))
      .finally(() => setLoading(false));
  }, [q, role, t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleVerify = async (user: AdminStorageUser) => {
    try {
      await api.verification.set(user.id, !user.isVerified);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isVerified: !u.isVerified } : u)));
      toast.push('success', t('common.saved'));
    } catch {
      toast.push('error', t('errors.saveFailed'));
    }
  };

  const loadFolders = async (userId: string) => {
    try {
      const { data } = await api.adminStorage.folders(userId);
      setFolders((prev) => ({ ...prev, [userId]: data }));
    } catch {
      toast.push('error', t('storage.loadFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('common.search')}
          className="rounded-md border border-line bg-elevated/60 p-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-line bg-elevated/60 p-2 text-sm"
        >
          <option value="">{t('common.all')}</option>
          <option value="STUDENT">{t('common.students')}</option>
          <option value="TEACHER">{t('common.teachers')}</option>
        </select>
      </div>

      {loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="divide-y divide-line/60 rounded-lg border border-line">
          {users.map((u) => (
            <div key={u.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="inline-flex items-center gap-1 font-medium">
                    {u.fullName}
                    <VerifiedBadge verified={u.isVerified} />
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {u.role} · {u.username} · {u.filesCount} {t('storage.filesCount')} ·{' '}
                    {u.hasDriveFolder ? 'Drive ✓' : 'Drive —'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="subtle" onClick={() => void loadFolders(u.id)}>
                    {t('storage.folders')}
                  </Button>
                  <Button size="sm" variant={u.isVerified ? 'outline' : 'primary'} onClick={() => void toggleVerify(u)}>
                    {u.isVerified ? t('storage.unverify') : t('storage.verify')}
                  </Button>
                </div>
              </div>
              {folders[u.id] && (
                <ul className="mt-2 space-y-1 text-[11px] text-ink-muted">
                  {folders[u.id].map((folder) => (
                    <li key={folder.id} className="font-mono">
                      {folder.folderType} · {folder.driveFolderId}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthPanel({ onError }: { onError: (message: string) => void }) {
  const { t } = useI18n();
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<StorageReconcileReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminStorage.health().then(({ data }) => setHealth(data)).catch(() => setHealth(null));
  }, []);

  const reconcile = async () => {
    setBusy(true);
    try {
      const { data } = await api.adminStorage.reconcile();
      setReport(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm">
        <h3 className="mb-2 font-bold text-gold-200">{t('storage.tabHealth')}</h3>
        <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-secondary">
          {JSON.stringify(health, null, 2)}
        </pre>
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-sm text-ink-secondary">{t('storage.reconcileHint')}</p>
        <Button size="sm" loading={busy} onClick={() => void reconcile()}>
          {t('storage.reconcile')}
        </Button>
        {report && (
          <div className="mt-3 space-y-2 text-xs">
            <p>
              {t('storage.tabFiles')}: {report.checkedFiles} / {report.checkedFolders} {t('storage.folders')}
            </p>
            <p>
              {t('storage.missingInDrive')}: <b>{report.missingInDrive.length}</b> · {t('storage.missingInDb')}:{' '}
              <b>{report.missingInDatabase.length}</b> · {t('storage.pendingUploads')}: <b>{report.pendingUploads}</b> ·{' '}
              {t('storage.pendingDeletes')}: <b>{report.pendingDeletes}</b>
            </p>
            {report.missingInDrive.length > 0 && (
              <ul className="list-disc ps-5 text-ink-muted">
                {report.missingInDrive.slice(0, 20).map((row) => (
                  <li key={row.id}>{row.originalFileName}</li>
                ))}
              </ul>
            )}
            {report.missingInDatabase.length > 0 && (
              <ul className="list-disc ps-5 text-ink-muted">
                {report.missingInDatabase.slice(0, 20).map((row) => (
                  <li key={row.driveFileId}>{row.name}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
