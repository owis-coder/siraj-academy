import { useCallback, useEffect, useState } from 'react';
import { api, type StoredFileMeta, type UploadCategory } from '../../../lib/api';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../../components/ui';
import { MultiFileUploader } from '../../../components/MultiFileUploader';
import { formatDateTime, formatFileSize } from '../../../lib/format';
import { useToast } from '../../../lib/toast';
import { useI18n } from '../../../i18n';

const TEACHER_CATEGORIES: { value: UploadCategory; key: string }[] = [
  { value: 'COURSE_MATERIALS', key: 'files.cat.courseMaterials' },
  { value: 'LESSON_FILES', key: 'files.cat.lessonFiles' },
  { value: 'VIDEO_REFERENCES', key: 'files.cat.videoReferences' },
  { value: 'SERVICE_ATTACHMENTS', key: 'files.cat.serviceAttachments' },
  { value: 'ASSIGNMENT_MATERIALS', key: 'files.cat.assignmentMaterials' },
  { value: 'OTHER_ATTACHMENTS', key: 'files.cat.other' },
];

export default function TeacherFiles() {
  const { t } = useI18n();
  const toast = useToast();
  const [category, setCategory] = useState<UploadCategory>('COURSE_MATERIALS');
  const [items, setItems] = useState<StoredFileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    api.files
      .mine({ category, limit: 100 })
      .then(({ data }) => setItems(data))
      .catch(() => toast.push('error', t('storage.loadFailed')))
      .finally(() => setLoading(false));
  }, [category, t, toast]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const remove = async (id: string) => {
    try {
      await api.files.remove(id);
      toast.push('success', t('common.saved'));
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('files.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('files.subtitle')}</p>
      </div>

      <Card className="space-y-3 p-5">
        <label className="block text-sm font-semibold text-ink-secondary">
          {t('files.category')}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as UploadCategory)}
            className="mt-1 w-full rounded-md border border-line bg-elevated/60 p-2 text-sm"
          >
            {TEACHER_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.key)}
              </option>
            ))}
          </select>
        </label>

        <MultiFileUploader
          category={category}
          onChange={(_files, pending) => {
            if (pending === 0) setReloadKey((k) => k + 1);
          }}
        />
        <p className="text-[11px] text-ink-muted">{t('files.privateNote')}</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-bold text-gold-200">{t('files.myFiles')}</h2>
        {loading ? (
          <Skeleton className="h-24" />
        ) : items.length === 0 ? (
          <EmptyState compact title={t('files.empty')} />
        ) : (
          <ul className="divide-y divide-line/60">
            {items.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.originalFileName}</p>
                  <p className="text-[11px] text-ink-muted">
                    {formatFileSize(file.fileSize)} · {formatDateTime(file.createdAt)} · {file.uploadStatus}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      file.reviewStatus === 'APPROVED'
                        ? 'ok'
                        : file.reviewStatus === 'REJECTED'
                          ? 'coral'
                          : file.reviewStatus === 'NEEDS_REVISION'
                            ? 'warn'
                            : 'gold'
                    }
                  >
                    {file.reviewStatus}
                  </Badge>
                  {file.reviewStatus === 'PENDING_REVIEW' && file.uploadStatus === 'UPLOADED' && (
                    <Button size="sm" variant="subtle" onClick={() => void remove(file.id)}>
                      {t('common.remove')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
