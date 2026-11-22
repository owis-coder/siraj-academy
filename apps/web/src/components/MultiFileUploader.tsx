import { useCallback, useRef, useState } from 'react';
import { api, ApiError, type StoredFileMeta, type UploadCategory } from '../lib/api';
import { useI18n } from '../i18n';
import { Button } from './ui';
import { formatFileSize } from '../lib/format';

/**
 * مكوّن رفع موحّد لكل صفحات المنصة.
 * - رفع مباشر إلى الخادم (Drive من الخادم فقط؛ لا أسرار في المتصفح).
 * - نسبة تقدم لكل ملف + إعادة محاولة + إزالة قبل الإرسال.
 * - منع تكرار نفس الملف بالخطأ (نفس الاسم والحجم وآخر تعديل).
 */

type ItemStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

type Item = {
  uid: string;
  file: File;
  status: ItemStatus;
  progress: number;
  error?: string;
  server?: StoredFileMeta;
  idempotencyKey: string;
};

export type MultiFileUploaderProps = {
  category: UploadCategory;
  relatedEntityType?: string;
  relatedEntityId?: string;
  onChange?: (uploaded: StoredFileMeta[], pendingCount: number) => void;
  maxFiles?: number;
  disabled?: boolean;
  hint?: string;
};

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip,.rar,.txt';

function uid(): string {
  // crypto.randomUUID غير متاح في سياقات غير آمنة أو متصفحات قديمة (Safari < 15.4)
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* نقع على البديل */
  }
  return `f-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MultiFileUploader({
  category,
  relatedEntityType,
  relatedEntityId,
  onChange,
  maxFiles = 10,
  disabled = false,
  hint,
}: MultiFileUploaderProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const emit = useCallback(
    (next: Item[]) => {
      const uploaded = next.filter((i) => i.status === 'uploaded' && i.server).map((i) => i.server!);
      const pending = next.filter((i) => i.status !== 'uploaded').length;
      onChange?.(uploaded, pending);
    },
    [onChange],
  );

  const update = (uidKey: string, patch: Partial<Item>) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.uid === uidKey ? { ...i, ...patch } : i));
      emit(next);
      return next;
    });
  };

  const upload = async (item: Item) => {
    update(item.uid, { status: 'uploading', progress: 0, error: undefined });
    try {
      const res = await api.files.uploadSingle(item.file, {
        category,
        relatedEntityType,
        relatedEntityId,
        idempotencyKey: item.idempotencyKey,
        onProgress: (pct) => update(item.uid, { progress: pct }),
      });
      const saved = res.data?.files?.[0];
      if (!saved) throw new Error(res.data?.failed?.[0]?.reason || t('uploader.failed'));
      update(item.uid, { status: 'uploaded', progress: 100, server: saved });
      setNotice({ tone: 'success', text: t('uploader.uploadedOk') });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('uploader.failed');
      update(item.uid, { status: 'failed', error: message });
      setNotice({ tone: 'error', text: message });
    }
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    setItems((prev) => {
      const next = [...prev];
      for (const file of list) {
        if (next.length >= maxFiles) break;
        const duplicate = next.some(
          (i) => i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified,
        );
        if (duplicate) continue;
        const item: Item = { uid: uid(), file, status: 'queued', progress: 0, idempotencyKey: uid() };
        next.push(item);
        void upload(item);
      }
      emit(next);
      return next;
    });
  };

  const remove = async (item: Item) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.uid !== item.uid);
      emit(next);
      return next;
    });
    if (item.server) {
      try {
        await api.files.remove(item.server.id);
      } catch {
        setNotice({ tone: 'error', text: t('uploader.removeFailed') });
      }
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-5 text-center transition ${
          dragging ? 'border-gold-500 bg-gold-500/10' : 'border-line bg-elevated/40'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <p className="text-sm font-semibold text-ink-secondary">{t('uploader.dropTitle')}</p>
        <p className="mt-1 text-xs text-ink-muted">{hint ?? t('uploader.hint')}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            addFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={disabled || items.length >= maxFiles}
          onClick={() => inputRef.current?.click()}
        >
          {t('uploader.choose')}
        </Button>
        <p className="mt-2 text-[11px] text-ink-muted">{t('uploader.limits')}</p>
      </div>

      {notice && (
        <p className={`text-xs ${notice.tone === 'error' ? 'text-coral-300' : 'text-emerald-400'}`} role="status">
          {notice.text}
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => {
            const ext = item.file.name.includes('.') ? item.file.name.split('.').pop()?.toUpperCase() : '—';
            return (
              <li key={item.uid} className="rounded-md border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-primary" title={item.file.name}>
                      {item.file.name}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {ext} · {formatFileSize(item.file.size)} ·{' '}
                      <span
                        className={
                          item.status === 'uploaded'
                            ? 'text-emerald-400'
                            : item.status === 'failed'
                              ? 'text-coral-300'
                              : 'text-gold-300'
                        }
                      >
                        {t(`uploader.status.${item.status}`)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'failed' && (
                      <Button type="button" size="sm" variant="subtle" onClick={() => void upload(item)}>
                        {t('common.retry')}
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="subtle" onClick={() => void remove(item)}>
                      {t('common.remove')}
                    </Button>
                  </div>
                </div>
                {item.status === 'uploading' && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full bg-gold-500 transition-all"
                      style={{ width: `${Math.max(3, item.progress)}%` }}
                    />
                  </div>
                )}
                {item.error && <p className="mt-1 text-[11px] text-coral-300">{item.error}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
