import { useEffect, useState } from 'react';
import { api, type CustomServiceRequest, type CustomRequestStatus } from '../../../lib/api';
import { useToast } from '../../../lib/toast';
import { Card, Button, Input, Select, Badge, SkeletonGrid, EmptyState, Modal, Textarea } from '../../../components/ui';
import { PageHeader } from '../../../components/PageHeader';
import { CUSTOM_STATUS_LABEL, CUSTOM_TYPE_LABEL, formatDateTime, formatMoney } from '../../../lib/format';
import { useI18n } from '../../../i18n';
import { IconAttachment } from '../../../components/icons';

const STATUS_OPTIONS: { value: CustomRequestStatus; tone: 'gold' | 'warn' | 'ok' | 'danger' | 'default' }[] = [
  { value: 'NEW', tone: 'gold' },
  { value: 'UNDER_REVIEW', tone: 'warn' },
  { value: 'AWAITING_RESPONSE', tone: 'warn' },
  { value: 'ACCEPTED', tone: 'ok' },
  { value: 'REJECTED', tone: 'danger' },
  { value: 'IN_PROGRESS', tone: 'ok' },
  { value: 'COMPLETED', tone: 'default' },
];

export default function AdminCustomRequests() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<CustomServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // حالة النافذة المنبثقة للتعديل
  const [activeItem, setActiveItem] = useState<CustomServiceRequest | null>(null);
  const [editStatus, setEditStatus] = useState<CustomRequestStatus>('NEW');
  const [editNotes, setEditNotes] = useState('');
  const [notifyUser, setNotifyUser] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.admin.customRequests
      .list({
        q: search || undefined,
        status: statusFilter || undefined,
        limit: 50,
      })
      .then((res) => {
        setItems(res.data ?? []);
      })
      .catch(() => {
        toast.push('error', t('ac.loadFailed'));
        setItems([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const openEditModal = (item: CustomServiceRequest) => {
    setActiveItem(item);
    setEditStatus(item.status);
    setEditNotes(item.adminNotes || '');
    setNotifyUser(true);
  };

  const handleSaveStatus = async () => {
    if (!activeItem) return;
    setSaving(true);
    try {
      const res = await api.admin.customRequests.updateStatus(activeItem.id, {
        status: editStatus,
        adminNotes: editNotes.trim() || undefined,
        notifyUser,
      });
      toast.push('success', res.data.message || t('ac.savedOk'));
      setActiveItem(null);
      load();
    } catch {
      toast.push('error', t('ac.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmail = async (id: string) => {
    setResendingId(id);
    try {
      const res = await api.admin.customRequests.resendEmail(id);
      toast.push('success', res.data.message || t('ac.resendOk'));
      load();
    } catch {
      toast.push('error', t('ac.resendFailed'));
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('ac.title')}
        subtitle={t('ac.subtitle')}
        action={
          <Button variant="outline" size="sm" onClick={load} loading={loading}>
            {t('ac.refresh')}
          </Button>
        }
      />

      {/* البحث والتصفية */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('ac.searchPlaceholder')}
            />
          </div>
          <div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('ac.allStatuses')}</option>
              {STATUS_OPTIONS.map((st) => (
                <option key={st.value} value={st.value}>
                  {t(CUSTOM_STATUS_LABEL[st.value])}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* قائمة الطلبات */}
      {loading ? (
        <SkeletonGrid count={4} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('ac.emptyTitle')}
          hint={search || statusFilter ? t('ac.emptyFilterHint') : t('ac.emptyNoRequests')}
        />
      ) : (
        <div className="space-y-4">
          {items.map((it) => {
            const stOpt = STATUS_OPTIONS.find((s) => s.value === it.status) || {
              tone: 'default' as const,
            };
            const typeKey = CUSTOM_TYPE_LABEL[it.requestType];
            const applicant = it.user;

            return (
              <Card key={it.id} className="p-5 space-y-4 hover:border-gold-500/40 transition-colors">
                {/* الرأس */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-bold text-gold-300 text-sm">{it.requestNo}</span>
                    <Badge tone={stOpt.tone}>{t(CUSTOM_STATUS_LABEL[it.status])}</Badge>
                    <span className="text-xs text-ink-muted">{t('ac.requestType')} <b>{typeKey ? t(typeKey) : it.requestType}</b></span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* حالة البريد الإلكتروني */}
                    {it.emailSent ? (
                      <Badge tone="ok">{t('ac.emailSent')}</Badge>
                    ) : (
                      <Badge tone="warn">
                        {it.emailError ? t('ac.emailFailed') : t('ac.emailNotSent')}
                      </Badge>
                    )}

                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => handleResendEmail(it.id)}
                      loading={resendingId === it.id}
                      title={t('ac.resendTitle')}
                    >
                      {t('ac.resendEmail')}
                    </Button>

                    <Button size="sm" onClick={() => openEditModal(it)}>
                      {t('ac.editStatusNotes')}
                    </Button>
                  </div>
                </div>

                {/* بيانات مقدم الطلب */}
                <div className="rounded-lg bg-surface-2/60 border border-line/60 p-3 text-xs">
                  <span className="font-bold text-gold-200 block mb-1">{t('ac.applicantData')}</span>
                  <div className="grid gap-2 sm:grid-cols-4 text-ink-secondary">
                    <div>{t('ac.name')} <b className="text-ink-primary">{applicant?.fullName || '—'}</b></div>
                    <div>{t('ac.username')} <span className="font-mono text-gold-300" dir="ltr">@{applicant?.username || '—'}</span></div>
                    <div>{t('ac.email')} <span dir="ltr">{applicant?.email || '—'}</span></div>
                    <div>{t('ac.whatsapp')} <span dir="ltr">{applicant?.whatsapp || '—'}</span></div>
                    <div>{t('ac.university')} {applicant?.university?.name || it.universityName || '—'}</div>
                    <div>{t('ac.major')} {applicant?.major?.name || it.majorName || '—'}</div>
                    <div>{t('ac.level')} {applicant?.level || it.academicLevel || '—'}</div>
                    <div>{t('ac.accountType')} {applicant?.role === 'STUDENT' ? t('ac.roleStudent') : applicant?.role === 'TEACHER' ? t('ac.roleTeacher') : applicant?.role === 'ADMIN' ? t('role.admin') : t('ac.roleUser')}</div>
                  </div>
                </div>

                {/* تفاصيل الطلب */}
                <div>
                  <h3 className="font-bold text-base text-ink-primary">{it.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap bg-surface p-3 rounded-md border border-line">
                    {it.description}
                  </p>
                </div>

                {/* المرفقات والبيانات الإضافية */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted border-t border-line/60 pt-2">
                  <div className="flex flex-wrap gap-4">
                    {it.budget != null && <span>{t('ac.budget')} <b className="text-ink-primary">{formatMoney(it.budget)}</b></span>}
                    {it.deadline && <span>{t('ac.deadline')} <b className="text-ink-primary">{it.deadline}</b></span>}
                    <span>{t('ac.createdAt')} {formatDateTime(it.createdAt)}</span>
                    <span>{t('ac.updatedAt')} {formatDateTime(it.updatedAt)}</span>
                  </div>

                  {it.attachments && it.attachments.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-gold-200 font-semibold">{t('ac.attachments')}</span>
                      {it.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-elevated px-2 py-1 text-[11px] text-gold-300 hover:underline"
                        >
                          <IconAttachment className="size-3" />
                          <span>{att.name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* الملاحظات الداخلية */}
                {it.adminNotes && (
                  <div className="rounded-md bg-gold-500/10 border border-gold-500/30 p-2.5 text-xs text-gold-200">
                    <span className="font-bold">{t('ac.adminNotes')} </span>
                    {it.adminNotes}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* نافذة تعديل الحالة والملاحظات */}
      {activeItem && (
        <Modal
          open={!!activeItem}
          onClose={() => setActiveItem(null)}
          title={t('ac.manageRequest', { no: activeItem.requestNo })}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">{t('ac.requestStatus')}</label>
              <Select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as CustomRequestStatus)}
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st.value} value={st.value}>
                    {t(CUSTOM_STATUS_LABEL[st.value])}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">
                {t('ac.notesLabel')}
              </label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder={t('ac.notesPlaceholder')}
                className="min-h-24"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={notifyUser}
                onChange={(e) => setNotifyUser(e.target.checked)}
                className="rounded border-line"
              />
              {t('ac.notifyUser')}
            </label>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <Button variant="ghost" onClick={() => setActiveItem(null)}>
                {t('ac.cancel')}
              </Button>
              <Button onClick={handleSaveStatus} loading={saving}>
                {t('ac.saveUpdate')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
