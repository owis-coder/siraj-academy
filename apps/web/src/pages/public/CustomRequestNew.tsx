import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api, type CustomRequestType } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Button, Card, Form, Field, Input, Textarea, Badge } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { useI18n } from '../../i18n';
import { IconAttachment, IconFile, IconArrowForward } from '../../components/icons';

const REQUEST_TYPES: CustomRequestType[] = [
  'COURSE_EXPLAIN',
  'TOPIC_EXPLAIN',
  'TRANSLATION',
  'SUMMARY',
  'PPT',
  'PROGRAMMING_PROJECT',
  'OTHER',
];

export default function CustomRequestNew() {
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useI18n();
  const [params] = useSearchParams();

  // نوع الطلب المبدئي من الرابط إن وُجد (مثل type=course أو type=service)
  const initialType: CustomRequestType =
    params.get('type') === 'course'
      ? 'COURSE_EXPLAIN'
      : params.get('type') === 'ppt'
        ? 'PPT'
        : params.get('type') === 'summary'
          ? 'SUMMARY'
          : params.get('type') === 'translation'
            ? 'TRANSLATION'
            : params.get('type') === 'programming'
              ? 'PROGRAMMING_PROJECT'
              : 'COURSE_EXPLAIN';

  const [requestType, setRequestType] = useState<CustomRequestType>(initialType);
  const [title, setTitle] = useState(params.get('title') || '');
  const [description, setDescription] = useState('');
  const [universityName, setUniversityName] = useState('');
  const [majorName, setMajorName] = useState('');
  const [academicLevel, setAcademicLevel] = useState('');
  const [deadline, setDeadline] = useState('');
  const [budget, setBudget] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string; size?: number; type?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 20 * 1024 * 1024) {
      toast.push('error', t('customRequest.maxSize'));
      return;
    }
    setUploading(true);
    try {
      const res = await api.uploads.create(file);
      setAttachments((prev) => [
        ...prev,
        {
          name: file.name,
          url: res.data.url,
          size: file.size,
          type: file.type,
        },
      ]);
      toast.push('success', t('customRequest.uploaded'));
      e.target.value = '';
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('customRequest.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = () => {
    const err: Record<string, string> = {};
    if (!title.trim() || title.trim().length < 3) {
      err.title = t('customRequest.titleErr');
    }
    if (!description.trim() || description.trim().length < 10) {
      err.description = t('customRequest.descErr');
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.push('info', t('customRequest.loginRequired'));
      nav('/login', { state: { from: '/requests/custom' } });
      return;
    }
    if (!validate()) {
      toast.push('error', t('customRequest.requiredErr'));
      return;
    }

    setSubmitting(true);
    try {
      await api.customRequests.create({
        requestType,
        title: title.trim(),
        description: description.trim(),
        universityName: universityName.trim() || undefined,
        majorName: majorName.trim() || undefined,
        academicLevel: academicLevel.trim() || undefined,
        deadline: deadline.trim() || undefined,
        budget: budget ? Number(budget) : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      toast.push('success', t('customRequest.sent'));
      nav('/dashboard/custom-requests');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : t('customRequest.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const roleLabel =
    user?.role === 'STUDENT'
      ? t('role.student')
      : user?.role === 'TEACHER'
        ? t('role.teacher')
        : user?.role === 'ADMIN'
          ? t('role.admin')
          : t('customRequest.roleUser');

  return (
    <div className="container-x max-w-3xl py-10">
      <PageHeader
        title={t('customRequest.title')}
        subtitle={t('customRequest.subtitle')}
        action={<Badge tone="gold">{t('customRequest.badge')}</Badge>}
      />

      {/* تنبيه تسجيل الدخول واستخراج البيانات التلقائي */}
      {!user ? (
        <Card className="mb-8 border-gold-500/30 bg-gold-500/10 p-6 text-center">
          <p className="text-base font-semibold text-gold-200">{t('customRequest.loginTitle')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('customRequest.loginHint')}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Link to="/login" state={{ from: '/requests/custom' }}>
              <Button>{t('common.login')}</Button>
            </Link>
            <Link to="/register">
              <Button variant="outline">{t('customRequest.createAccount')}</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="mb-6 border-line bg-elevated/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-semibold text-ink-primary">
                {t('customRequest.requester')} <span className="text-gold-200">{user.fullName}</span> ({roleLabel})
              </p>
              <p className="text-xs text-ink-muted">
                {t('customRequest.email')}: {user.email} | {t('customRequest.phone')}: {user.whatsapp || t('customRequest.notRegistered')} | {t('customRequest.university')}: {user.university?.name || t('customRequest.none')}
              </p>
            </div>
            <Badge tone="ok">{t('customRequest.dataTrusted')}</Badge>
          </div>
        </Card>
      )}

      <Card className="p-6 sm:p-8">
        <Form onSubmit={handleSubmit} className="space-y-6">
          {/* نوع الطلب */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gold-200">{t('customRequest.requestType')}</label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {REQUEST_TYPES.map((value) => {
                const isSelected = requestType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRequestType(value)}
                    className={`rounded-lg border p-3.5 text-start transition-all ${
                      isSelected
                        ? 'border-gold-400 bg-gold-500/15 text-ink-primary shadow-glow'
                        : 'border-line bg-surface text-ink-secondary hover:bg-surface-2'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${isSelected ? 'text-gold-200' : 'text-ink-primary'}`}>
                      {t(`customRequest.opt.${value}.label`)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{t(`customRequest.opt.${value}.desc`)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* اسم المقرر أو الخدمة */}
          <Field label={t('customRequest.titleLabel')} required error={errors.title}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('customRequest.titlePlaceholder')} />
          </Field>

          {/* الجامعة والتخصص والمستوى إن كان مرتبطًا بدراسة معينة */}
          <div className="space-y-3 rounded-lg border border-line bg-surface-2/40 p-4">
            <p className="text-xs font-semibold text-ink-muted">{t('customRequest.academicHeading')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('customRequest.uniLabel')}>
                <Input
                  value={universityName}
                  onChange={(e) => setUniversityName(e.target.value)}
                  placeholder={user?.university?.name || t('customRequest.uniPlaceholder')}
                />
              </Field>
              <Field label={t('customRequest.majorLabel')}>
                <Input
                  value={majorName}
                  onChange={(e) => setMajorName(e.target.value)}
                  placeholder={user?.major?.name || t('customRequest.majorPlaceholder')}
                />
              </Field>
              <Field label={t('customRequest.levelLabel')}>
                <Input
                  value={academicLevel}
                  onChange={(e) => setAcademicLevel(e.target.value)}
                  placeholder={user?.level || t('customRequest.levelPlaceholder')}
                />
              </Field>
            </div>
          </div>

          {/* الوصف التفصيلي */}
          <Field label={t('customRequest.descLabel')} required hint={t('customRequest.descHint')} error={errors.description}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-36"
              placeholder={t('customRequest.descPlaceholder')}
            />
          </Field>

          {/* الموعد والميزانية */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('customRequest.deadlineLabel')} hint={t('customRequest.deadlineHint')}>
              <Input value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder={t('customRequest.deadlinePlaceholder')} />
            </Field>
            <Field label={t('customRequest.budgetLabel')} hint={t('customRequest.budgetHint')}>
              <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={t('customRequest.budgetPlaceholder')} />
            </Field>
          </div>

          {/* المرفقات */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-primary">{t('customRequest.attachLabel')}</label>
            <p className="mb-3 text-xs text-ink-muted">{t('customRequest.attachHint')}</p>

            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.zip"
                />
                <Button type="button" variant="outline" size="sm" loading={uploading} className="inline-flex items-center gap-1.5">
                  <IconAttachment className="size-4" />
                  <span>{t('customRequest.uploadBtn')}</span>
                </Button>
              </label>
              {uploading && <span className="text-xs text-gold-300">{t('customRequest.uploading')}</span>}
            </div>

            {attachments.length > 0 && (
              <ul className="mt-3 space-y-2">
                {attachments.map((att, idx) => (
                  <li key={idx} className="flex items-center justify-between rounded-md border border-line bg-surface p-2.5 text-xs">
                    <span className="flex max-w-sm items-center gap-1.5 truncate font-medium text-ink-primary">
                      <IconFile className="size-3.5 shrink-0 text-gold-300" />
                      <span className="truncate">{att.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="ms-2 text-danger hover:underline"
                    >
                      {t('customRequest.delete')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* زر الإرسال */}
          <div className="flex items-center justify-between border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => nav(-1)}>
              {t('customRequest.cancel')}
            </Button>
            <Button type="submit" loading={submitting} disabled={!user}>
              {user ? (
                <span className="inline-flex items-center gap-1.5">
                  <span>{t('customRequest.submitBtn')}</span>
                  <IconArrowForward className="size-4" />
                </span>
              ) : (
                t('customRequest.loginToSubmit')
              )}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
